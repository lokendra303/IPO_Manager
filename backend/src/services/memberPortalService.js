import { getMemberDetail } from './memberDetailService.js';
import { listGroupBulkTransactions } from './memberGroupService.js';
import { formatPan } from '../utils/validate.js';

async function getSubGroupPortalInfo(pool, tenantId, memberId, memberGroupId) {
  if (!memberGroupId) return null;

  const [groupRows] = await pool.query(
    `SELECT g.id, g.name, g.owner_member_id,
            o.display_name AS owner_display_name, o.pan AS owner_pan
     FROM member_groups g
     LEFT JOIN members o ON o.id = g.owner_member_id
     WHERE g.id = ? AND g.tenant_id = ?`,
    [memberGroupId, tenantId]
  );
  if (!groupRows.length) return null;

  const group = groupRows[0];
  const isLeader = Number(group.owner_member_id) === Number(memberId);

  const base = {
    id: group.id,
    name: group.name,
    isLeader,
    leaderDisplayName: group.owner_display_name ?? null,
    leaderPan: formatPan(group.owner_pan),
  };

  if (!isLeader) return base;

  const [members] = await pool.query(
    `SELECT m.id, m.display_name, m.pan, m.status,
            COALESCE(given.total, 0) - COALESCE(recv.total, 0) AS pending_return,
            COALESCE(apps.c, 0) AS ipos_applied,
            COALESCE(apps.ipos_pending, 0) AS ipos_pending,
            COALESCE(apps.ipos_alloted, 0) AS ipos_alloted,
            COALESCE(apps.ipos_not_alloted, 0) AS ipos_not_alloted
     FROM members m
     LEFT JOIN (
       SELECT member_id, SUM(amount) AS total
       FROM member_ledger_entries
       WHERE tenant_id = ? AND type = 'GIVEN'
       GROUP BY member_id
     ) given ON given.member_id = m.id
     LEFT JOIN (
       SELECT member_id, SUM(amount) AS total
       FROM member_ledger_entries
       WHERE tenant_id = ? AND type = 'RECEIVED'
       GROUP BY member_id
     ) recv ON recv.member_id = m.id
     LEFT JOIN (
       SELECT member_id,
              COUNT(*) AS c,
              SUM(allotment_status = 'PENDING') AS ipos_pending,
              SUM(allotment_status = 'ALLOTED') AS ipos_alloted,
              SUM(allotment_status = 'NOT_ALLOTED') AS ipos_not_alloted
       FROM ipo_applications
       WHERE tenant_id = ?
       GROUP BY member_id
     ) apps ON apps.member_id = m.id
     WHERE m.member_group_id = ? AND m.tenant_id = ?
     ORDER BY m.sort_order, m.display_name, m.id`,
    [tenantId, tenantId, tenantId, memberGroupId, tenantId]
  );

  const bulkPayments = await listGroupBulkTransactions(pool, tenantId, memberGroupId);

  const [groupApps] = await pool.query(
    `SELECT a.id, a.amount, a.allotment_status, a.profit_loss, a.investor_category,
            a.trns_received, m.id AS member_id, m.display_name, m.pan,
            i.id AS ipo_id, i.name AS ipo_name, i.status AS ipo_status
     FROM ipo_applications a
     JOIN members m ON m.id = a.member_id
     JOIN ipos i ON i.id = a.ipo_id
     WHERE a.tenant_id = ? AND m.member_group_id = ?
     ORDER BY i.name, m.display_name, a.id`,
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

  const memberDetails = await Promise.all(
    members.map((m) => getMemberDetail(pool, tenantId, m.id))
  );
  const statsByMemberId = new Map(
    memberDetails
      .filter(Boolean)
      .map((detail) => [detail.member.id, detail.stats])
  );
  const appMetaById = new Map();
  for (const detail of memberDetails) {
    if (!detail) continue;
    for (const app of detail.ipoApplications) {
      appMetaById.set(app.id, {
        memberShare: app.member_share != null ? Number(app.member_share) : null,
        shareStatus: app.share_status ?? null,
      });
    }
  }

  let groupGrossIpoPnL = 0;
  let groupTotalMemberShare = 0;
  for (const stats of statsByMemberId.values()) {
    groupGrossIpoPnL += Number(stats.totalIpoProfit ?? 0);
    groupTotalMemberShare += Number(stats.totalMemberShare ?? 0);
  }

  return {
    ...base,
    memberCount: members.length,
    groupStats: {
      ...groupStats,
      grossIpoPnL: groupGrossIpoPnL,
      totalMemberShare: groupTotalMemberShare,
    },
    members: members.map((m) => {
      const memberStats = statsByMemberId.get(m.id);
      return {
        id: m.id,
        displayName: m.display_name,
        pan: formatPan(m.pan),
        status: m.status,
        pendingReturn: Number(m.pending_return),
        iposApplied: Number(m.ipos_applied),
        iposPending: Number(m.ipos_pending),
        iposAlloted: Number(m.ipos_alloted),
        iposNotAlloted: Number(m.ipos_not_alloted),
        grossIpoPnL: Number(memberStats?.totalIpoProfit ?? 0),
        totalMemberShare: Number(memberStats?.totalMemberShare ?? 0),
        isLeader: Number(m.id) === Number(memberId),
      };
    }),
    groupApplications: groupApps.map((row) => {
      const appMeta = appMetaById.get(row.id) ?? {};
      return {
        id: row.id,
        ipoId: row.ipo_id,
        ipoName: row.ipo_name,
        ipoStatus: row.ipo_status,
        memberId: row.member_id,
        memberName: row.display_name,
        memberPan: formatPan(row.pan),
        amount: Number(row.amount),
        allotmentStatus: row.allotment_status,
        investorCategory: row.investor_category ?? null,
        grossProfitLoss: row.profit_loss != null ? Number(row.profit_loss) : null,
        memberShare: appMeta.memberShare ?? null,
        shareStatus: appMeta.shareStatus ?? null,
        fundReturned: row.trns_received === 'Received',
      };
    }),
    bulkPayments: bulkPayments.map((bp) => ({
      id: bp.id,
      ipoName: bp.ipoName,
      totalAmount: bp.totalAmount,
      memberCount: bp.memberCount,
      paidAt: bp.paidAt,
      investorCategory: bp.investorCategory,
    })),
  };
}

export async function getMemberPortalDashboard(pool, tenantId, memberId) {
  const detail = await getMemberDetail(pool, tenantId, memberId);
  if (!detail) return null;

  const { member, stats, ipoApplications, ledgerEntries } = detail;
  const subGroup = await getSubGroupPortalInfo(
    pool,
    tenantId,
    memberId,
    member.member_group_id
  );

  return {
    member: {
      id: member.id,
      displayName: member.display_name,
      pan: formatPan(member.pan),
      email: member.email ?? null,
      upi: member.upi ?? null,
      status: member.status,
    },
    subGroup,
    stats: {
      totalGiven: stats.totalGiven,
      totalReceived: stats.totalReceived,
      pendingReturn: stats.willReceiveFromTeam,
      bonus: stats.bonus,
      iposApplied: stats.iposApplied,
      iposPending: stats.iposPending,
      iposAlloted: stats.iposAlloted,
      iposNotAlloted: stats.iposNotAlloted,
      grossIpoPnL: stats.totalIpoProfit,
      totalMemberShare: stats.totalMemberShare,
    },
    ipoApplications: ipoApplications.map((app) => ({
      id: app.id,
      ipoName: app.ipo_name,
      ipoStatus: app.ipo_status,
      amount: Number(app.amount),
      allotmentStatus: app.allotment_status,
      investorCategory: app.investor_category,
      grossProfitLoss: app.profit_loss != null ? Number(app.profit_loss) : null,
      memberShare: app.member_share != null ? Number(app.member_share) : null,
      shareStatus: app.share_status ?? null,
      fundReturned: app.trns_received === 'Received',
      dateGiven: app.date_given,
      dateReceived: app.date_received,
    })),
    ledgerEntries: ledgerEntries.map((entry) => ({
      id: entry.id,
      type: entry.type,
      amount: Number(entry.amount),
      txnDate: entry.txn_date,
      ipoName: entry.ipo_name ?? null,
      notes: entry.notes ?? null,
    })),
  };
}
