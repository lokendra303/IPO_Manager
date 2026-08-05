import { getSummary } from './summaryService.js';
import { getProfitTotalsReport } from './profitShareService.js';
import { syncOwnerWalletTotal } from './bankAccountService.js';

export async function getTenantFullDetails(pool, tenantId) {
  const [tenants] = await pool.query(
    `SELECT t.*, u.id AS owner_id, u.email AS owner_email, u.created_at AS owner_created_at,
            sa.email AS approved_by_email,
            sda.email AS disabled_by_email,
            COALESCE(ow.balance, 0) AS wallet_balance
     FROM tenants t
     JOIN users u ON u.tenant_id = t.id AND u.role = 'owner'
     LEFT JOIN system_admins sa ON sa.id = t.approved_by
     LEFT JOIN system_admins sda ON sda.id = t.disabled_by
     LEFT JOIN owner_wallets ow ON ow.tenant_id = t.id
     WHERE t.id = ?`,
    [tenantId]
  );
  if (!tenants.length) return null;

  const tenant = tenants[0];
  const conn = await pool.getConnection();
  let walletBalance = Number(tenant.wallet_balance);
  try {
    walletBalance = await syncOwnerWalletTotal(conn, tenantId);
  } finally {
    conn.release();
  }

  const summary = await getSummary(pool, tenantId);
  const profitReport = await getProfitTotalsReport(pool, tenantId);

  const [bankRow] = await pool.query(
    `SELECT COALESCE(SUM(balance), 0) AS total, COUNT(*) AS account_count
     FROM manager_bank_accounts WHERE tenant_id = ? AND is_active = 1`,
    [tenantId]
  );

  const [investedRow] = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS current_invested, COUNT(*) AS application_count
     FROM ipo_applications
     WHERE tenant_id = ? AND allotment_status = 'PENDING' AND date_given IS NOT NULL`,
    [tenantId]
  );

  const [ipoStats] = await pool.query(
    `SELECT
       COUNT(*) AS total_ipos,
       SUM(status = 'OPEN') AS open_ipos,
       SUM(status = 'CLOSED') AS closed_ipos
     FROM ipos WHERE tenant_id = ?`,
    [tenantId]
  );

  const [appStats] = await pool.query(
    `SELECT
       COUNT(*) AS total_applications,
       SUM(allotment_status = 'PENDING') AS pending_allotment,
       SUM(allotment_status = 'ALLOTED') AS allotted,
       SUM(allotment_status = 'NOT_ALLOTED') AS not_allotted,
       COALESCE(SUM(amount), 0) AS total_application_amount
     FROM ipo_applications WHERE tenant_id = ?`,
    [tenantId]
  );

  const [members] = await pool.query(
    `SELECT m.id, m.display_name, m.pan, m.status, m.email, m.upi, m.created_at,
            mg.name AS member_group_name
     FROM members m
     LEFT JOIN member_groups mg ON mg.id = m.member_group_id
     WHERE m.tenant_id = ?
     ORDER BY m.sort_order, m.display_name`,
    [tenantId]
  );

  const [providers] = await pool.query(
    `SELECT fp.id, fp.name, fp.created_at,
            COALESCE(SUM(pt.amount), 0) AS net_balance
     FROM fund_providers fp
     LEFT JOIN provider_transactions pt ON pt.fund_provider_id = fp.id
     WHERE fp.tenant_id = ?
     GROUP BY fp.id, fp.name, fp.created_at
     ORDER BY fp.name`,
    [tenantId]
  );

  const [ipos] = await pool.query(
    `SELECT id, name, status, lot_amount_rii, open_date, ipo_segment, created_at
     FROM ipos WHERE tenant_id = ?
     ORDER BY COALESCE(open_date, DATE(created_at)) DESC, id DESC LIMIT 50`,
    [tenantId]
  );

  const [applications] = await pool.query(
    `SELECT a.id, a.amount, a.allotment_status, a.investor_category, a.profit_loss,
            a.date_given, a.date_received, a.remarks, a.created_at, a.updated_at,
            i.name AS ipo_name, i.status AS ipo_status,
            m.display_name AS member_name, m.pan AS member_pan
     FROM ipo_applications a
     JOIN ipos i ON i.id = a.ipo_id
     JOIN members m ON m.id = a.member_id
     WHERE a.tenant_id = ?
     ORDER BY a.updated_at DESC, a.id DESC
     LIMIT 200`,
    [tenantId]
  );

  const [bankAccounts] = await pool.query(
    `SELECT id, label, bank_name, balance, is_default, is_active
     FROM manager_bank_accounts WHERE tenant_id = ? ORDER BY sort_order, id`,
    [tenantId]
  );

  const num = (v) => Number(v ?? 0);

  return {
    tenant: { ...tenant, wallet_balance: walletBalance },
    financial: {
      walletBalance,
      bankBalance: num(bankRow[0]?.total),
      bankAccountCount: Number(bankRow[0]?.account_count ?? 0),
      providerNetBalance: summary.providerNetBalance,
      totalGivenToMembers: summary.totals.totalGiven,
      totalReceivedFromMembers: summary.totals.totalReceived,
      outstandingWithMembers: summary.totals.willReceiveFromTeam,
      currentInvested: num(investedRow[0]?.current_invested),
      currentInvestedApplications: Number(investedRow[0]?.application_count ?? 0),
      availableFreeAmount: summary.availableFreeAmount,
      ipoProfit: profitReport.overall.ipoProfit,
      ipoLoss: profitReport.overall.ipoLoss,
      grossIpoPnL: profitReport.overall.grossIpoPnL,
      grossDistributed: profitReport.overall.grossDistributed,
      grossPendingDistribution: profitReport.overall.grossPending,
      pendingDistributionCount: profitReport.overall.pendingCount,
      managerShareTotal: profitReport.overall.managerShare,
      providerShareTotal: profitReport.overall.providerShare,
      memberShareTotal: profitReport.overall.memberShare,
      totalIpos: Number(ipoStats[0]?.total_ipos ?? 0),
      openIpos: Number(ipoStats[0]?.open_ipos ?? 0),
      closedIpos: Number(ipoStats[0]?.closed_ipos ?? 0),
      totalApplications: Number(appStats[0]?.total_applications ?? 0),
      pendingAllotment: Number(appStats[0]?.pending_allotment ?? 0),
      allottedApplications: Number(appStats[0]?.allotted ?? 0),
      totalApplicationAmount: num(appStats[0]?.total_application_amount),
    },
    memberSummary: summary.rows,
    memberPnL: profitReport.byMember,
    providerPnL: profitReport.byProvider,
    members,
    fundProviders: providers,
    bankAccounts,
    ipos,
    applications,
  };
}
