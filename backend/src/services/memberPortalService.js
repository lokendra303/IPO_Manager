import { getMemberDetail } from './memberDetailService.js';
import {
  buildMemberAttentionItems,
  getMemberActivityFeed,
  getMemberUpcomingIpos,
  listFundReturnClaims,
} from './memberPortalExtrasService.js';
import { formatPan } from '../utils/validate.js';

export async function getMemberPortalDashboard(pool, tenantId, memberId) {
  const detail = await getMemberDetail(pool, tenantId, memberId);
  if (!detail) return null;

  const [tenantRows] = await pool.query('SELECT name FROM tenants WHERE id = ?', [tenantId]);
  const teamName = tenantRows[0]?.name ?? 'IPO Team';

  const { member, stats, ipoApplications, ledgerEntries, group: subGroup } = detail;

  const dashboardCore = {
    teamName,
    appName: 'IPO Team Manager',
    developerName: 'Lokendra',
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
      totalManagerShare: stats.totalManagerShare,
      totalProviderShare: stats.totalProviderShare,
      pendingShareGross: stats.pendingShareGross,
    },
    ipoApplications: ipoApplications.map((app) => ({
      id: app.id,
      ipoId: app.ipo_id,
      ipoName: app.ipo_name,
      ipoStatus: app.ipo_status,
      openDate: app.ipo_open_date || app.ipo_created_at || null,
      amount: Number(app.amount),
      allotmentStatus: app.allotment_status,
      investorCategory: app.investor_category,
      grossProfitLoss: app.profit_loss != null ? Number(app.profit_loss) : null,
      memberShare: app.member_share != null ? Number(app.member_share) : null,
      managerShare: app.manager_share != null ? Number(app.manager_share) : null,
      providerShare: app.provider_share != null ? Number(app.provider_share) : null,
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
