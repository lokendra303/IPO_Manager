import { syncOwnerWalletTotal } from './bankAccountService.js';
import { APPLICATION_RETURN_DUE_SQL, PENDING_RETURN_PRINCIPAL_SQL } from './pendingReturnUtils.js';

function mapIpoSummaryRow(row, share = {}) {
  return {
    ipoId: row.ipo_id,
    name: row.name,
    status: row.status,
    ipoSegment: row.ipo_segment,
    applicationCount: Number(row.application_count),
    totalDistributed: Number(row.total_distributed),
    totalReturned: Number(row.total_returned),
    pendingReturn: Number(row.pending_return),
    returnedCount: Number(row.returned_count),
    allottedCount: Number(row.allotted_count),
    notAllottedCount: Number(row.not_allotted_count),
    notAppliedCount: Number(row.not_applied_count),
    pendingAllotmentCount: Number(row.pending_allotment_count),
    totalProfitLoss: Number(row.total_profit_loss),
    profitSharedCount: Number(share.profit_shared_count || 0),
    shareProviderTotal: Number(share.share_provider_total || 0),
    shareManagerTotal: Number(share.share_manager_total || 0),
    shareMemberTotal: Number(share.share_member_total || 0),
  };
}

const IPO_SUMMARY_SELECT = `
  SELECT
    i.id AS ipo_id,
    i.name,
    i.status,
    i.ipo_segment,
    i.created_at,
    COUNT(a.id) AS application_count,
    COALESCE(SUM(a.amount), 0) AS total_distributed,
    COALESCE(SUM(CASE WHEN a.trns_received = 'Received' THEN a.amount ELSE 0 END), 0) AS total_returned,
    COALESCE(SUM(${PENDING_RETURN_PRINCIPAL_SQL}), 0) AS pending_return,
    SUM(CASE WHEN a.trns_received = 'Received' THEN 1 ELSE 0 END) AS returned_count,
    SUM(CASE WHEN a.allotment_status = 'ALLOTED' THEN 1 ELSE 0 END) AS allotted_count,
    SUM(CASE WHEN a.allotment_status = 'NOT_ALLOTED' THEN 1 ELSE 0 END) AS not_allotted_count,
    SUM(CASE WHEN a.allotment_status = 'NOT_APPLIED' THEN 1 ELSE 0 END) AS not_applied_count,
    SUM(CASE WHEN a.allotment_status = 'PENDING' THEN 1 ELSE 0 END) AS pending_allotment_count,
    COALESCE(SUM(CASE WHEN a.allotment_status = 'ALLOTED' AND a.withdrawal_money IS NOT NULL THEN a.profit_loss ELSE 0 END), 0) AS total_profit_loss
  FROM ipos i
  LEFT JOIN ipo_applications a ON a.ipo_id = i.id AND a.tenant_id = i.tenant_id`;

export async function getIpoSummaryById(pool, tenantId, ipoId) {
  const [ipoRows] = await pool.query(
    `${IPO_SUMMARY_SELECT}
     WHERE i.tenant_id = ? AND i.id = ?
     GROUP BY i.id, i.name, i.status, i.ipo_segment, i.created_at`,
    [tenantId, ipoId]
  );
  if (!ipoRows.length) return null;

  const [shareRows] = await pool.query(
    `SELECT
       COUNT(psd.id) AS profit_shared_count,
       COALESCE(SUM(psd.provider_amount), 0) AS share_provider_total,
       COALESCE(SUM(psd.manager_amount), 0) AS share_manager_total,
       COALESCE(SUM(psd.member_amount), 0) AS share_member_total
     FROM profit_share_distributions psd
     JOIN ipo_applications a ON a.id = psd.ipo_application_id
     WHERE psd.tenant_id = ? AND a.ipo_id = ?
       AND a.allotment_status = 'ALLOTED'
       AND a.withdrawal_money IS NOT NULL
       AND a.profit_loss IS NOT NULL
       AND ABS(a.profit_loss - psd.gross_profit_loss) < 0.01`,
    [tenantId, ipoId]
  );

  return mapIpoSummaryRow(ipoRows[0], shareRows[0] || {});
}

async function getIpoWiseSummary(pool, tenantId) {
  const [ipoRows] = await pool.query(
    `${IPO_SUMMARY_SELECT}
     WHERE i.tenant_id = ? AND COALESCE(i.is_invalid, 0) = 0
     GROUP BY i.id, i.name, i.status, i.ipo_segment, i.created_at
     ORDER BY i.created_at DESC, i.id DESC`,
    [tenantId]
  );

  const [shareRows] = await pool.query(
    `SELECT
       a.ipo_id,
       COUNT(psd.id) AS profit_shared_count,
       COALESCE(SUM(psd.provider_amount), 0) AS share_provider_total,
       COALESCE(SUM(psd.manager_amount), 0) AS share_manager_total,
       COALESCE(SUM(psd.member_amount), 0) AS share_member_total
     FROM profit_share_distributions psd
     JOIN ipo_applications a ON a.id = psd.ipo_application_id
     WHERE psd.tenant_id = ?
       AND a.allotment_status = 'ALLOTED'
       AND a.withdrawal_money IS NOT NULL
       AND a.profit_loss IS NOT NULL
       AND ABS(a.profit_loss - psd.gross_profit_loss) < 0.01
     GROUP BY a.ipo_id`,
    [tenantId]
  );

  const shareMap = Object.fromEntries(
    shareRows.map((row) => [row.ipo_id, row])
  );

  const rows = ipoRows.map((row) => mapIpoSummaryRow(row, shareMap[row.ipo_id] || {}));

  const totals = rows.reduce(
    (acc, r) => ({
      ipoCount: acc.ipoCount + 1,
      applicationCount: acc.applicationCount + r.applicationCount,
      totalDistributed: acc.totalDistributed + r.totalDistributed,
      totalReturned: acc.totalReturned + r.totalReturned,
      pendingReturn: acc.pendingReturn + r.pendingReturn,
      returnedCount: acc.returnedCount + r.returnedCount,
      allottedCount: acc.allottedCount + r.allottedCount,
      notAllottedCount: acc.notAllottedCount + r.notAllottedCount,
      notAppliedCount: acc.notAppliedCount + r.notAppliedCount,
      pendingAllotmentCount: acc.pendingAllotmentCount + r.pendingAllotmentCount,
      totalProfitLoss: acc.totalProfitLoss + r.totalProfitLoss,
      profitSharedCount: acc.profitSharedCount + r.profitSharedCount,
      shareProviderTotal: acc.shareProviderTotal + r.shareProviderTotal,
      shareManagerTotal: acc.shareManagerTotal + r.shareManagerTotal,
      shareMemberTotal: acc.shareMemberTotal + r.shareMemberTotal,
    }),
    {
      ipoCount: 0,
      applicationCount: 0,
      totalDistributed: 0,
      totalReturned: 0,
      pendingReturn: 0,
      returnedCount: 0,
      allottedCount: 0,
      notAllottedCount: 0,
      notAppliedCount: 0,
      pendingAllotmentCount: 0,
      totalProfitLoss: 0,
      profitSharedCount: 0,
      shareProviderTotal: 0,
      shareManagerTotal: 0,
      shareMemberTotal: 0,
    }
  );

  return { rows, totals };
}

export async function getSummary(pool, tenantId) {
  const [members] = await pool.query(
    `SELECT m.id, m.display_name, m.pan, m.email, m.upi, m.status, m.relationship_note,
            mg.name AS member_group_name
     FROM members m
     LEFT JOIN member_groups mg ON mg.id = m.member_group_id
     WHERE m.tenant_id = ? ORDER BY m.sort_order, m.id`,
    [tenantId]
  );

  const [ledger] = await pool.query(
    `SELECT member_id, type, SUM(amount) as total
     FROM member_ledger_entries WHERE tenant_id = ?
     GROUP BY member_id, type`,
    [tenantId]
  );

  const [appStats] = await pool.query(
    `SELECT member_id,
            COUNT(*) as ipos_applied,
            SUM(CASE WHEN allotment_status = 'ALLOTED' THEN 1 ELSE 0 END) as ipos_alloted,
            SUM(CASE WHEN allotment_status = 'ALLOTED' AND withdrawal_money IS NOT NULL THEN COALESCE(profit_loss, 0) ELSE 0 END) as total_ipo_profit,
            COALESCE(SUM(${PENDING_RETURN_PRINCIPAL_SQL}), 0) AS pending_return_due
     FROM ipo_applications a WHERE tenant_id = ?
     GROUP BY member_id`,
    [tenantId]
  );

  const conn = await pool.getConnection();
  let walletBalance = 0;
  try {
    walletBalance = await syncOwnerWalletTotal(conn, tenantId);
  } finally {
    conn.release();
  }

  const [providerBalance] = await pool.query(
    `SELECT COALESCE(SUM(pt.amount), 0) as net_provider_balance
     FROM provider_transactions pt
     JOIN fund_providers fp ON fp.id = pt.fund_provider_id
     WHERE pt.tenant_id = ?`,
    [tenantId]
  );

  const ledgerMap = {};
  for (const row of ledger) {
    if (!ledgerMap[row.member_id]) ledgerMap[row.member_id] = { given: 0, received: 0 };
    if (row.type === 'GIVEN') ledgerMap[row.member_id].given = Number(row.total);
    if (row.type === 'RECEIVED') ledgerMap[row.member_id].received = Number(row.total);
    if (row.type === 'BONUS') ledgerMap[row.member_id].bonus = Number(row.total);
  }

  const appMap = {};
  for (const row of appStats) {
    appMap[row.member_id] = {
      iposApplied: Number(row.ipos_applied),
      iposAlloted: Number(row.ipos_alloted),
      totalIpoProfit: Number(row.total_ipo_profit),
      pendingReturnDue: Number(row.pending_return_due),
    };
  }

  const rows = members.map((m) => {
    const lg = ledgerMap[m.id] || { given: 0, received: 0, bonus: 0 };
    const ap = appMap[m.id] || {
      iposApplied: 0,
      iposAlloted: 0,
      totalIpoProfit: 0,
      pendingReturnDue: 0,
    };
    const ledgerNet = lg.given - lg.received;
    const willReceiveFromTeam = ap.pendingReturnDue;
    return {
      memberId: m.id,
      displayName: m.display_name,
      pan: m.pan,
      email: m.email ?? null,
      upi: m.upi ?? null,
      status: m.status,
      relationshipNote: m.relationship_note,
      memberGroupName: m.member_group_name,
      bulkGroupLabel: m.member_group_name,
      totalGiven: lg.given,
      totalReceived: lg.received,
      bonus: lg.bonus || 0,
      iposApplied: ap.iposApplied,
      iposAlloted: ap.iposAlloted,
      totalIpoProfit: ap.totalIpoProfit,
      willReceiveFromTeam,
      mismatch: Math.abs(ledgerNet - willReceiveFromTeam) > 0.01,
    };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      totalGiven: acc.totalGiven + r.totalGiven,
      totalReceived: acc.totalReceived + r.totalReceived,
      iposApplied: acc.iposApplied + r.iposApplied,
      iposAlloted: acc.iposAlloted + r.iposAlloted,
      totalIpoProfit: acc.totalIpoProfit + r.totalIpoProfit,
      willReceiveFromTeam: acc.willReceiveFromTeam + r.willReceiveFromTeam,
    }),
    { totalGiven: 0, totalReceived: 0, iposApplied: 0, iposAlloted: 0, totalIpoProfit: 0, willReceiveFromTeam: 0 }
  );

  const ipoSummary = await getIpoWiseSummary(pool, tenantId);

  const [[pendingReturnApps]] = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM ipo_applications a
     WHERE a.tenant_id = ? AND ${APPLICATION_RETURN_DUE_SQL}`,
    [tenantId]
  );
  totals.pendingReturnApplicationCount = Number(pendingReturnApps?.cnt ?? 0);

  return {
    rows,
    totals,
    ipoSummary,
    availableFreeAmount: walletBalance,
    providerNetBalance: Number(providerBalance[0]?.net_provider_balance ?? 0),
  };
}
