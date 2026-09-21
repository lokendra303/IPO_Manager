import { listGroupBulkTransactions } from './memberGroupService.js';
import { calculateMultiRuleSplit } from './profitShareService.js';
import { loadShareRulesByIpoIds, tryResolveShareRulesForMember } from './ipoShareRuleService.js';
import { formatPan } from '../utils/validate.js';
import { PENDING_FUND_TOTAL_SQL } from './pendingReturnUtils.js';

function computeAllottedAppShare(appRow, ipoRules) {
  const gross =
    appRow.allotment_status === 'ALLOTED' ? Number(appRow.profit_loss ?? 0) : 0;
  if (appRow.allotment_status !== 'ALLOTED' || appRow.profit_loss == null || gross === 0) {
    return { gross: 0, memberShare: null, managerShare: null, providerShare: null, shareStatus: null };
  }

  if (appRow.profit_share_distribution_id) {
    return {
      gross,
      memberShare: Number(appRow.distributed_member_amount ?? 0),
      managerShare: Number(appRow.distributed_manager_amount ?? 0),
      providerShare: Number(appRow.distributed_provider_amount ?? 0),
      shareStatus: 'distributed',
    };
  }

  const { rules } = tryResolveShareRulesForMember(ipoRules || [], appRow.member_id);
  if (rules.length) {
    const split = calculateMultiRuleSplit(gross, rules);
    return {
      gross,
      memberShare: split.memberAmount,
      managerShare: split.totalManager,
      providerShare: split.totalProvider,
      shareStatus: 'pending',
    };
  }

  return { gross, memberShare: null, managerShare: null, providerShare: null, shareStatus: null };
}

async function loadLeaderCashTotals(pool, tenantId, memberGroupId) {
  try {
    const [cashRows] = await pool.query(
      `SELECT type, COALESCE(SUM(amount), 0) AS total
       FROM group_leader_transactions
       WHERE tenant_id = ? AND member_group_id = ?
       GROUP BY type`,
      [tenantId, memberGroupId]
    );
    let cashSent = 0;
    let cashReceived = 0;
    let cashAdjustment = 0;
    for (const row of cashRows) {
      const amount = Number(row.total || 0);
      if (row.type === 'SENT') cashSent = amount;
      else if (row.type === 'RECEIVED') cashReceived = amount;
      else if (row.type === 'ADJUSTMENT') cashAdjustment = amount;
    }
    return { cashSent, cashReceived, cashAdjustment };
  } catch {
    return { cashSent: 0, cashReceived: 0, cashAdjustment: 0 };
  }
}

/**
 * Sub-group context for a member. Leaders also get fund-distribution totals,
 * group members, bulk IPO pays, and group IPO applications.
 */
export async function getSubGroupPortalInfo(pool, tenantId, memberId, memberGroupId) {
  if (!memberGroupId) return null;

  const [groupRows] = await pool.query(
    `SELECT g.id, g.name, g.owner_member_id, g.owner_external_name, g.owner_external_pan,
            o.display_name AS owner_display_name, o.pan AS owner_pan
     FROM member_groups g
     LEFT JOIN members o ON o.id = g.owner_member_id
     WHERE g.id = ? AND g.tenant_id = ?`,
    [memberGroupId, tenantId]
  );
  if (!groupRows.length) return null;

  const group = groupRows[0];
  const isLeader = Number(group.owner_member_id) === Number(memberId);
  const leaderName =
    group.owner_display_name ?? group.owner_external_name?.trim() ?? null;
  const leaderPan = group.owner_pan ?? group.owner_external_pan ?? null;

  const [[countRow]] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM members WHERE tenant_id = ? AND member_group_id = ?`,
    [tenantId, memberGroupId]
  );

  const base = {
    id: group.id,
    name: group.name,
    isLeader,
    leaderDisplayName: leaderName,
    leaderPan: formatPan(leaderPan),
    memberCount: Number(countRow?.cnt || 0),
  };

  if (!isLeader) return base;

  const [members] = await pool.query(
    `SELECT m.id, m.display_name, m.pan, m.email, m.upi, m.status, m.relationship_note,
            COALESCE(apps.pending_return_due, 0) AS pending_return,
            COALESCE(apps.c, 0) AS ipos_applied,
            COALESCE(apps.ipos_pending, 0) AS ipos_pending,
            COALESCE(apps.ipos_alloted, 0) AS ipos_alloted,
            COALESCE(apps.ipos_not_alloted, 0) AS ipos_not_alloted
     FROM members m
     LEFT JOIN (
       SELECT member_id,
              COUNT(*) AS c,
              SUM(allotment_status = 'PENDING') AS ipos_pending,
              SUM(allotment_status = 'ALLOTED') AS ipos_alloted,
              SUM(allotment_status = 'NOT_ALLOTED') AS ipos_not_alloted,
              COALESCE(SUM(${PENDING_FUND_TOTAL_SQL}), 0) AS pending_return_due
       FROM ipo_applications a
       WHERE tenant_id = ?
       GROUP BY member_id
     ) apps ON apps.member_id = m.id
     WHERE m.member_group_id = ? AND m.tenant_id = ?
     ORDER BY m.sort_order, m.display_name, m.id`,
    [tenantId, memberGroupId, tenantId]
  );

  const bulkPayments = await listGroupBulkTransactions(pool, tenantId, memberGroupId);
  const cash = await loadLeaderCashTotals(pool, tenantId, memberGroupId);

  const [groupApps] = await pool.query(
    `SELECT a.id, a.amount, a.allotment_status, a.profit_loss, a.investor_category,
            a.trns_received, m.id AS member_id, m.display_name, m.pan,
            i.id AS ipo_id, i.name AS ipo_name, i.status AS ipo_status,
            i.open_date AS ipo_open_date, i.created_at AS ipo_created_at,
            psd.id AS profit_share_distribution_id,
            psd.member_amount AS distributed_member_amount,
            psd.manager_amount AS distributed_manager_amount,
            psd.provider_amount AS distributed_provider_amount
     FROM ipo_applications a
     JOIN members m ON m.id = a.member_id
     JOIN ipos i ON i.id = a.ipo_id
     LEFT JOIN profit_share_distributions psd ON psd.ipo_application_id = a.id
     WHERE a.tenant_id = ? AND m.member_group_id = ?
     ORDER BY COALESCE(i.open_date, DATE(i.created_at)) DESC, i.id DESC, m.display_name, a.id`,
    [tenantId, memberGroupId]
  );

  const groupStats = groupApps.reduce(
    (acc, row) => {
      acc.iposApplied += 1;
      if (row.allotment_status === 'PENDING') acc.iposPending += 1;
      else if (row.allotment_status === 'ALLOTED') acc.iposAlloted += 1;
      else if (row.allotment_status === 'NOT_ALLOTED') acc.iposNotAlloted += 1;
      return acc;
    },
    { iposApplied: 0, iposPending: 0, iposAlloted: 0, iposNotAlloted: 0 }
  );

  const ipoRules = await loadShareRulesByIpoIds(
    pool,
    tenantId,
    groupApps.map((row) => row.ipo_id)
  );

  const memberPnL = new Map();
  let groupGrossIpoPnL = 0;
  let groupTotalMemberShare = 0;
  let groupTotalManagerShare = 0;
  let groupTotalProviderShare = 0;

  const enrichedGroupApps = groupApps.map((row) => {
    const { gross, memberShare, managerShare, providerShare, shareStatus } = computeAllottedAppShare(
      row,
      ipoRules.get(Number(row.ipo_id)) || []
    );

    const agg = memberPnL.get(row.member_id) ?? {
      grossIpoPnL: 0,
      totalMemberShare: 0,
      totalManagerShare: 0,
      totalProviderShare: 0,
    };
    agg.grossIpoPnL += gross;
    if (memberShare != null) agg.totalMemberShare += memberShare;
    if (managerShare != null) agg.totalManagerShare += managerShare;
    if (providerShare != null) agg.totalProviderShare += providerShare;
    memberPnL.set(row.member_id, agg);

    return {
      row,
      gross,
      memberShare,
      managerShare,
      providerShare,
      shareStatus,
    };
  });

  for (const agg of memberPnL.values()) {
    groupGrossIpoPnL += agg.grossIpoPnL;
    groupTotalMemberShare += agg.totalMemberShare;
    groupTotalManagerShare += agg.totalManagerShare;
    groupTotalProviderShare += agg.totalProviderShare;
  }

  const mappedMembers = members.map((m) => {
    const pnl = memberPnL.get(m.id) ?? {
      grossIpoPnL: 0,
      totalMemberShare: 0,
      totalManagerShare: 0,
      totalProviderShare: 0,
    };
    return {
      id: m.id,
      displayName: m.display_name,
      pan: formatPan(m.pan),
      email: m.email ?? null,
      upi: m.upi ?? null,
      relationshipNote: m.relationship_note ?? null,
      status: m.status,
      pendingReturn: Number(m.pending_return),
      iposApplied: Number(m.ipos_applied),
      iposPending: Number(m.ipos_pending),
      iposAlloted: Number(m.ipos_alloted),
      iposNotAlloted: Number(m.ipos_not_alloted),
      grossIpoPnL: pnl.grossIpoPnL,
      totalMemberShare: pnl.totalMemberShare,
      totalManagerShare: pnl.totalManagerShare,
      totalProviderShare: pnl.totalProviderShare,
      isLeader: Number(m.id) === Number(memberId),
    };
  });

  const mappedBulk = bulkPayments.map((bp) => ({
    id: bp.id,
    ipoId: bp.ipoId,
    ipoName: bp.ipoName,
    totalAmount: bp.totalAmount,
    memberCount: bp.memberCount,
    paidAt: bp.paidAt,
    investorCategory: bp.investorCategory,
  }));

  const fundDistributed = mappedBulk.reduce((sum, bp) => sum + Number(bp.totalAmount || 0), 0);
  const pendingReturn = mappedMembers.reduce((sum, m) => sum + Number(m.pendingReturn || 0), 0);

  return {
    ...base,
    memberCount: mappedMembers.length,
    groupStats: {
      ...groupStats,
      grossIpoPnL: groupGrossIpoPnL,
      totalMemberShare: groupTotalMemberShare,
      totalManagerShare: groupTotalManagerShare,
      totalProviderShare: groupTotalProviderShare,
      fundDistributed,
      pendingReturn,
      cashSent: cash.cashSent,
      cashReceived: cash.cashReceived,
      cashAdjustment: cash.cashAdjustment,
    },
    members: mappedMembers,
    groupApplications: enrichedGroupApps.map(
      ({ row, memberShare, managerShare, providerShare, shareStatus }) => ({
        id: row.id,
        ipoId: row.ipo_id,
        ipoName: row.ipo_name,
        ipoStatus: row.ipo_status,
        openDate: row.ipo_open_date || row.ipo_created_at || null,
        memberId: row.member_id,
        memberName: row.display_name,
        memberPan: formatPan(row.pan),
        amount: Number(row.amount),
        allotmentStatus: row.allotment_status,
        investorCategory: row.investor_category ?? null,
        grossProfitLoss: row.profit_loss != null ? Number(row.profit_loss) : null,
        memberShare,
        managerShare,
        providerShare,
        shareStatus,
        fundReturned: row.trns_received === 'Received',
      })
    ),
    bulkPayments: mappedBulk,
  };
}
