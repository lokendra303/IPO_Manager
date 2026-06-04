import { getMemberDetail } from './memberDetailService.js';

export async function getMemberPortalDashboard(pool, tenantId, memberId) {
  const detail = await getMemberDetail(pool, tenantId, memberId);
  if (!detail) return null;

  const { member, stats, ipoApplications } = detail;

  return {
    member: {
      id: member.id,
      displayName: member.display_name,
      pan: member.pan,
      email: member.email ?? null,
      upi: member.upi ?? null,
      status: member.status,
    },
    stats: {
      iposApplied: stats.iposApplied,
      iposPending: stats.iposPending,
      iposAlloted: stats.iposAlloted,
      iposNotAlloted: stats.iposNotAlloted,
      totalIpoProfit: stats.totalIpoProfit,
    },
    ipoApplications: ipoApplications.map((app) => ({
      id: app.id,
      ipoName: app.ipo_name,
      ipoStatus: app.ipo_status,
      amount: Number(app.amount),
      allotmentStatus: app.allotment_status,
      profitLoss: app.profit_loss != null ? Number(app.profit_loss) : null,
      dateGiven: app.date_given,
      dateReceived: app.date_received,
    })),
  };
}
