import { parsePositiveInt } from '../utils/validate.js';
import { AppError } from '../middleware/errorHandler.js';

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
  const profitShare = rules.length
    ? {
        configured: true,
        rules,
        ruleCount: rules.length,
        providerName: [...new Set(rules.map((r) => r.providerName).filter(Boolean))].join(', ') || null,
        profitProviderPercent: rules.reduce((s, r) => s + r.profitProviderPercent, 0),
        profitManagerPercent: rules.reduce((s, r) => s + r.profitManagerPercent, 0),
        lossProviderPercent: rules.reduce((s, r) => s + r.lossProviderPercent, 0),
        lossManagerPercent: rules.reduce((s, r) => s + r.lossManagerPercent, 0),
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
            a.allotment_status, a.profit_loss, a.remarks, a.created_at,
            i.id as ipo_id, i.name as ipo_name, i.lot_amount, i.status as ipo_status
     FROM ipo_applications a
     JOIN ipos i ON i.id = a.ipo_id
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

  for (const app of applications) {
    if (app.allotment_status === 'ALLOTED') {
      iposAlloted += 1;
      totalIpoProfit += Number(app.profit_loss ?? 0);
    } else if (app.allotment_status === 'NOT_ALLOTED') {
      iposNotAlloted += 1;
    } else {
      iposPending += 1;
    }
  }

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
      willReceiveFromTeam: ledgerTotals.given - ledgerTotals.received,
    },
    ipoApplications: applications,
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
