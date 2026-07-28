import { parsePositiveInt } from '../utils/validate.js';
import { AppError } from '../middleware/errorHandler.js';
import { calculateMultiRuleSplit, resolveRulesForIpo } from './profitShareService.js';
import { pendingReturnPrincipal } from './pendingReturnUtils.js';

export async function getMemberDetail(pool, tenantId, memberId) {
  const id = parsePositiveInt(memberId, 'member id');

  const [members] = await pool.query(
    `SELECT m.*, mg.name AS member_group_name
     FROM members m
     LEFT JOIN member_groups mg ON mg.id = m.member_group_id
     WHERE m.id = ? AND m.tenant_id = ?`,
    [id, tenantId]
  );
  if (!members.length) return null;

  const member = members[0];

  const [shareRows] = await pool.query(
    `SELECT mps.*, fp.name AS provider_name, i.name AS ipo_name
     FROM member_profit_shares mps
     LEFT JOIN fund_providers fp ON fp.id = mps.fund_provider_id
     LEFT JOIN ipos i ON i.id = mps.ipo_id AND i.tenant_id = mps.tenant_id
     WHERE mps.member_id = ? AND mps.tenant_id = ?`,
    [id, tenantId]
  );
  const rules = shareRows.map((row) => ({
    id: row.id,
    ruleName: row.rule_name || `Rule ${row.id}`,
    sortOrder: Number(row.sort_order ?? 0),
    ipoId: row.ipo_id ?? null,
    ipoName: row.ipo_name ?? null,
    fundProviderId: row.fund_provider_id,
    providerName: row.provider_name,
    profitProviderPercent: Number(row.provider_percent),
    profitManagerPercent: Number(row.manager_percent),
    lossProviderPercent: Number(row.loss_provider_percent ?? 0),
    lossManagerPercent: Number(row.loss_manager_percent ?? 0),
  }));
  const profitProviderPercent = rules.reduce((s, r) => s + r.profitProviderPercent, 0);
  const profitManagerPercent = rules.reduce((s, r) => s + r.profitManagerPercent, 0);
  const lossProviderPercent = rules.reduce((s, r) => s + r.lossProviderPercent, 0);
  const lossManagerPercent = rules.reduce((s, r) => s + r.lossManagerPercent, 0);

  const profitShare = rules.length
    ? {
        configured: true,
        rules: rules.map((rule) => ({
          ...rule,
          profitMemberPercent: Math.max(0, 100 - rule.profitProviderPercent - rule.profitManagerPercent),
          lossMemberPercent: Math.max(0, 100 - rule.lossProviderPercent - rule.lossManagerPercent),
        })),
        ruleCount: rules.length,
        providerName: [...new Set(rules.map((r) => r.providerName).filter(Boolean))].join(', ') || null,
        profitProviderPercent,
        profitManagerPercent,
        profitMemberPercent: Math.max(0, 100 - profitProviderPercent - profitManagerPercent),
        lossProviderPercent,
        lossManagerPercent,
        lossMemberPercent: Math.max(0, 100 - lossProviderPercent - lossManagerPercent),
      }
    : { configured: false, rules: [], ruleCount: 0 };

  const [ledger] = await pool.query(
    `SELECT l.id, l.type, l.amount, l.txn_date, l.notes, l.ipo_application_id,
            i.name as ipo_name
     FROM member_ledger_entries l
     LEFT JOIN ipo_applications a ON a.id = l.ipo_application_id
     LEFT JOIN ipos i ON i.id = a.ipo_id
     WHERE l.member_id = ? AND l.tenant_id = ?
     ORDER BY l.txn_date DESC, l.id DESC`,
    [id, tenantId]
  );

  const [applications] = await pool.query(
    `SELECT a.id, a.amount, a.date_received, a.trns_received, a.date_given, a.trns_given,
            a.allotment_status, a.investor_category, a.profit_loss, a.remarks, a.created_at,
            i.id as ipo_id, i.name as ipo_name, i.lot_amount_rii, i.lot_amount_hni, i.lot_amount,
            i.status as ipo_status,
            psd.id AS profit_share_distribution_id,
            psd.member_amount AS distributed_member_amount,
            psd.provider_amount AS distributed_provider_amount,
            psd.manager_amount AS distributed_manager_amount
     FROM ipo_applications a
     JOIN ipos i ON i.id = a.ipo_id
     LEFT JOIN profit_share_distributions psd ON psd.ipo_application_id = a.id
     WHERE a.member_id = ? AND a.tenant_id = ?
     ORDER BY a.created_at DESC`,
    [id, tenantId]
  );

  const ledgerTotals = { given: 0, received: 0, bonus: 0 };
  for (const row of ledger) {
    if (row.type === 'GIVEN') ledgerTotals.given += Number(row.amount);
    if (row.type === 'RECEIVED') ledgerTotals.received += Number(row.amount);
    if (row.type === 'BONUS') ledgerTotals.bonus += Number(row.amount);
  }

  let iposApplied = applications.length;
  let iposAlloted = 0;
  let iposNotAlloted = 0;
  let iposPending = 0;
  let totalIpoProfit = 0;
  let totalMemberShare = 0;
  let totalProviderShare = 0;
  let totalManagerShare = 0;
  let pendingShareGross = 0;

  const ipoApplications = applications.map((app) => {
    const gross = app.allotment_status === 'ALLOTED' ? Number(app.profit_loss ?? 0) : 0;
    let memberShare = null;
    let providerShare = null;
    let managerShare = null;
    let shareStatus = null;

    if (app.allotment_status === 'ALLOTED' && app.profit_loss != null && gross !== 0) {
      totalIpoProfit += gross;

      if (app.profit_share_distribution_id) {
        memberShare = Number(app.distributed_member_amount ?? 0);
        providerShare = Number(app.distributed_provider_amount ?? 0);
        managerShare = Number(app.distributed_manager_amount ?? 0);
        shareStatus = 'distributed';
        totalMemberShare += memberShare;
        totalProviderShare += providerShare;
        totalManagerShare += managerShare;
      } else if (rules.length) {
        const applicableRules = resolveRulesForIpo(rules, app.ipo_id);
        if (applicableRules.length) {
          const split = calculateMultiRuleSplit(gross, applicableRules);
          memberShare = split.memberAmount;
          providerShare = split.totalProvider;
          managerShare = split.totalManager;
          shareStatus = 'pending';
          totalMemberShare += memberShare;
          totalProviderShare += providerShare;
          totalManagerShare += managerShare;
          pendingShareGross += gross;
        }
      }
    }

    if (app.allotment_status === 'ALLOTED') {
      iposAlloted += 1;
    } else if (app.allotment_status === 'NOT_ALLOTED') {
      iposNotAlloted += 1;
    } else if (app.allotment_status !== 'NOT_APPLIED') {
      iposPending += 1;
    }

    const { distributed_member_amount, distributed_provider_amount, distributed_manager_amount, ...rest } = app;
    return {
      ...rest,
      member_share: memberShare,
      provider_share: providerShare,
      manager_share: managerShare,
      share_status: shareStatus,
    };
  });

  const willReceiveFromTeam = applications.reduce(
    (sum, app) => sum + pendingReturnPrincipal(app),
    0
  );

  return {
    member,
    profitShare,
    stats: {
      totalGiven: ledgerTotals.given,
      totalReceived: ledgerTotals.received,
      bonus: ledgerTotals.bonus,
      iposApplied,
      iposAlloted,
      iposNotAlloted,
      iposPending,
      totalIpoProfit,
      totalMemberShare,
      totalProviderShare,
      totalManagerShare,
      pendingShareGross,
      willReceiveFromTeam,
    },
    ipoApplications,
    ledgerEntries: ledger,
  };
}

export async function assertUniquePan(pool, tenantId, pan, excludeMemberId = null) {
  const params = [tenantId, pan];
  let sql = 'SELECT id FROM members WHERE tenant_id = ? AND UPPER(pan) = UPPER(?)';
  if (excludeMemberId) {
    sql += ' AND id != ?';
    params.push(excludeMemberId);
  }
  const [rows] = await pool.query(sql, params);
  if (rows.length) {
    throw new AppError('A member with this PAN already exists in your team', 409);
  }
}
