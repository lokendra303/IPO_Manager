import { getMemberDetail } from './memberDetailService.js';
import { listGroupBulkTransactions } from './memberGroupService.js';
import { calculateMultiRuleSplit, resolveRulesForIpo } from './profitShareService.js';
import {
  buildMemberAttentionItems,
  getMemberActivityFeed,
  getMemberUpcomingIpos,
  listFundReturnClaims,
} from './memberPortalExtrasService.js';
import { formatPan } from '../utils/validate.js';

function mapMemberRuleRow(row) {
  return {
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
  };
}

async function loadGroupMemberShareRules(pool, tenantId, memberIds) {
  const map = new Map();
  if (!memberIds.length) return map;

  const placeholders = memberIds.map(() => '?').join(', ');
  const [rows] = await pool.query(
    `SELECT mps.*, fp.name AS provider_name, i.name AS ipo_name, mps.member_id
     FROM member_profit_shares mps
     LEFT JOIN fund_providers fp ON fp.id = mps.fund_provider_id
     LEFT JOIN ipos i ON i.id = mps.ipo_id AND i.tenant_id = mps.tenant_id
     WHERE mps.tenant_id = ? AND mps.member_id IN (${placeholders})
     ORDER BY mps.member_id, mps.sort_order, mps.id`,
    [tenantId, ...memberIds]
  );

  for (const row of rows) {
    const memberId = row.member_id;
    const list = map.get(memberId) ?? [];
    list.push(mapMemberRuleRow(row));
    map.set(memberId, list);
  }
  return map;
}

function computeAllottedAppShare(appRow, memberRules) {
  const gross =
    appRow.allotment_status === 'ALLOTED' ? Number(appRow.profit_loss ?? 0) : 0;
  if (appRow.allotment_status !== 'ALLOTED' || appRow.profit_loss == null || gross === 0) {
    return { gross: 0, memberShare: null, shareStatus: null };
  }

  if (appRow.profit_share_distribution_id) {
    return {
      gross,
      memberShare: Number(appRow.distributed_member_amount ?? 0),
      shareStatus: 'distributed',
    };
  }

  if (memberRules?.length) {
    const applicableRules = resolveRulesForIpo(memberRules, appRow.ipo_id);
    if (applicableRules.length) {
      const split = calculateMultiRuleSplit(gross, applicableRules);
      return {
        gross,
        memberShare: split.memberAmount,
        shareStatus: 'pending',
      };
    }
  }

  return { gross, memberShare: null, shareStatus: null };
}

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
    `SELECT m.id, m.display_name, m.pan, m.upi, m.status,
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
            i.id AS ipo_id, i.name AS ipo_name, i.status AS ipo_status,
            psd.id AS profit_share_distribution_id,
            psd.member_amount AS distributed_member_amount
     FROM ipo_applications a
     JOIN members m ON m.id = a.member_id
     JOIN ipos i ON i.id = a.ipo_id
     LEFT JOIN profit_share_distributions psd ON psd.ipo_application_id = a.id
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

  const memberIds = members.map((m) => m.id);
  const rulesByMemberId = await loadGroupMemberShareRules(pool, tenantId, memberIds);

  const memberPnL = new Map();
  let groupGrossIpoPnL = 0;
  let groupTotalMemberShare = 0;

  const enrichedGroupApps = groupApps.map((row) => {
    const memberRules = rulesByMemberId.get(row.member_id) ?? [];
    const { gross, memberShare, shareStatus } = computeAllottedAppShare(row, memberRules);

    const agg = memberPnL.get(row.member_id) ?? { grossIpoPnL: 0, totalMemberShare: 0 };
    agg.grossIpoPnL += gross;
    if (memberShare != null) agg.totalMemberShare += memberShare;
    memberPnL.set(row.member_id, agg);

    return {
      row,
      gross,
      memberShare,
      shareStatus,
    };
  });

  for (const agg of memberPnL.values()) {
    groupGrossIpoPnL += agg.grossIpoPnL;
    groupTotalMemberShare += agg.totalMemberShare;
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
      const pnl = memberPnL.get(m.id) ?? { grossIpoPnL: 0, totalMemberShare: 0 };
      return {
        id: m.id,
        displayName: m.display_name,
        pan: formatPan(m.pan),
        upi: m.upi ?? null,
        status: m.status,
        pendingReturn: Number(m.pending_return),
        iposApplied: Number(m.ipos_applied),
        iposPending: Number(m.ipos_pending),
        iposAlloted: Number(m.ipos_alloted),
        iposNotAlloted: Number(m.ipos_not_alloted),
        grossIpoPnL: pnl.grossIpoPnL,
        totalMemberShare: pnl.totalMemberShare,
        isLeader: Number(m.id) === Number(memberId),
      };
    }),
    groupApplications: enrichedGroupApps.map(({ row, memberShare, shareStatus }) => ({
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
      memberShare,
      shareStatus,
      fundReturned: row.trns_received === 'Received',
    })),
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

  const dashboardCore = {
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
      ipoId: app.ipo_id,
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

  const [upcomingIpos, activity, fundClaims] = await Promise.all([
    getMemberUpcomingIpos(pool, tenantId, memberId),
    getMemberActivityFeed(pool, tenantId, memberId, { limit: 15 }),
    listFundReturnClaims(pool, tenantId, memberId),
  ]);

  const attention = buildMemberAttentionItems({
    dashboard: dashboardCore,
    upcomingIpos,
    issues: [],
    claims: fundClaims,
  });

  return {
    ...dashboardCore,
    attention,
    activity,
    upcomingIpos,
  };
}
