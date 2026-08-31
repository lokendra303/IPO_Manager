import { ensureWallet } from './walletService.js';
import { PENDING_FUND_TOTAL_SQL, PENDING_RETURN_PRINCIPAL_SQL } from './pendingReturnUtils.js';

/**
 * Lightweight dashboard payload — one round-trip instead of heavy /summary + 4 other calls.
 */
export async function getManagerDashboard(pool, tenantId) {
  const conn = await pool.getConnection();
  try {
    const wallet = await ensureWallet(conn, tenantId);

    const [[memberCount]] = await conn.query(
      `SELECT COUNT(*) AS cnt FROM members WHERE tenant_id = ? AND status = 'ACTIVE'`,
      [tenantId]
    );

    const [[issueCount]] = await conn.query(
      `SELECT COUNT(*) AS openCount FROM member_issues WHERE tenant_id = ? AND status = 'OPEN'`,
      [tenantId]
    );

    const [[share]] = await conn.query(
      `SELECT COALESCE(SUM(manager_amount), 0) AS managerShare
       FROM profit_share_distributions WHERE tenant_id = ?`,
      [tenantId]
    );

    const [pending] = await conn.query(
      `SELECT m.id AS memberId, m.display_name AS displayName, m.pan,
              COALESCE(p.pending_return, 0) AS willReceiveFromTeam
       FROM members m
       INNER JOIN (
         SELECT a.member_id,
                SUM(${PENDING_FUND_TOTAL_SQL}) AS pending_return
         FROM ipo_applications a
         WHERE a.tenant_id = ?
         GROUP BY a.member_id
         HAVING pending_return > 0.005
       ) p ON p.member_id = m.id
       WHERE m.tenant_id = ?
       ORDER BY willReceiveFromTeam DESC
       LIMIT 8`,
      [tenantId, tenantId]
    );

    const [openIpos] = await conn.query(
      `SELECT
         i.id AS ipo_id,
         i.name,
         COUNT(a.id) AS application_count,
         COALESCE(SUM(a.amount), 0) AS total_distributed,
         COALESCE(SUM(CASE WHEN a.trns_received = 'Received' THEN a.amount ELSE 0 END), 0) AS total_returned,
         COALESCE(SUM(${PENDING_RETURN_PRINCIPAL_SQL}), 0) AS pending_return
       FROM ipos i
       LEFT JOIN ipo_applications a ON a.ipo_id = i.id AND a.tenant_id = i.tenant_id
       WHERE i.tenant_id = ?
         AND i.status = 'OPEN'
         AND COALESCE(i.is_invalid, 0) = 0
       GROUP BY i.id, i.name, i.open_date, i.created_at
       ORDER BY COALESCE(i.open_date, DATE(i.created_at)) DESC, i.id DESC`,
      [tenantId]
    );

    const [txns] = await conn.query(
      `SELECT wt.id, wt.type, wt.amount, wt.balance_after, wt.txn_date, wt.notes
       FROM wallet_transactions wt
       WHERE wt.tenant_id = ?
       ORDER BY wt.txn_date DESC, wt.id DESC
       LIMIT 8`,
      [tenantId]
    );

    const openIpoRows = openIpos.map((row) => ({
      ipoId: row.ipo_id,
      name: row.name,
      applicationCount: Number(row.application_count),
      totalDistributed: Number(row.total_distributed),
      totalReturned: Number(row.total_returned),
      pendingReturn: Number(row.pending_return),
    }));

    const openIpoTotals = openIpoRows.reduce(
      (acc, r) => ({
        totalDistributed: acc.totalDistributed + r.totalDistributed,
        totalReturned: acc.totalReturned + r.totalReturned,
        pendingReturn: acc.pendingReturn + r.pendingReturn,
        applicationCount: acc.applicationCount + r.applicationCount,
        ipoCount: acc.ipoCount + 1,
      }),
      {
        totalDistributed: 0,
        totalReturned: 0,
        pendingReturn: 0,
        applicationCount: 0,
        ipoCount: 0,
      }
    );

    const [[ipoStats]] = await conn.query(
      `SELECT
         COUNT(*) AS myIpos,
         SUM(CASE WHEN i.status = 'OPEN' AND COALESCE(i.is_invalid, 0) = 0 THEN 1 ELSE 0 END) AS openIpos
       FROM ipos i WHERE i.tenant_id = ? AND COALESCE(i.is_invalid, 0) = 0`,
      [tenantId]
    );

    const [[appStats]] = await conn.query(
      `SELECT
         COUNT(*) AS teamApplications,
         SUM(CASE WHEN allotment_status IN ('PENDING', 'CHECKING', 'RETRY') THEN 1 ELSE 0 END) AS pendingAllotments,
         SUM(CASE WHEN allotment_status IN ('ALLOTED', 'PARTIALLY_ALLOTTED') THEN 1 ELSE 0 END) AS allotted,
         SUM(CASE WHEN allotment_status = 'NOT_ALLOTED' THEN 1 ELSE 0 END) AS notAllotted
       FROM ipo_applications WHERE tenant_id = ?`,
      [tenantId]
    );

    const [[liveStats]] = await conn.query(
      `SELECT
         COUNT(*) AS liveIpos,
         SUM(CASE WHEN status = 'OPEN' THEN 1 ELSE 0 END) AS liveOpen,
         SUM(CASE WHEN status = 'UPCOMING' THEN 1 ELSE 0 END) AS liveUpcoming
       FROM ipo_catalog`
    ).catch(() => [[{ liveIpos: 0, liveOpen: 0, liveUpcoming: 0 }]]);

    const [[gmpRow]] = await conn.query(
      `SELECT c.name, c.gmp, c.gmp_percentage, c.estimated_listing_price, c.gmp_updated_at
       FROM ipos i
       JOIN ipo_catalog c ON c.id = i.catalog_id
       WHERE i.tenant_id = ? AND COALESCE(i.is_invalid, 0) = 0 AND c.gmp IS NOT NULL
       ORDER BY c.gmp_updated_at DESC, i.id DESC
       LIMIT 1`,
      [tenantId]
    ).catch(() => [[null]]);

    const [[expected]] = await conn.query(
      `SELECT COALESCE(SUM(
         CASE
           WHEN a.profit_loss IS NOT NULL AND a.allotment_status IN ('ALLOTED', 'PARTIALLY_ALLOTTED') THEN a.profit_loss
           WHEN a.allotment_status IN ('ALLOTED', 'PARTIALLY_ALLOTTED') AND c.gmp IS NOT NULL AND i.lot_size IS NOT NULL
             THEN COALESCE(a.allotted_lots, 1) * i.lot_size * c.gmp
           ELSE 0
         END
       ), 0) AS expectedProfit
       FROM ipo_applications a
       JOIN ipos i ON i.id = a.ipo_id
       LEFT JOIN ipo_catalog c ON c.id = i.catalog_id
       WHERE a.tenant_id = ? AND COALESCE(i.is_invalid, 0) = 0`,
      [tenantId]
    ).catch(() => [[{ expectedProfit: 0 }]]);

    return {
      walletBalance: Number(wallet.balance),
      activeMembers: Number(memberCount.cnt),
      managerShare: Number(share.managerShare),
      openIssueCount: Number(issueCount.openCount),
      openIpos: openIpoRows,
      openIpoTotals,
      pendingReturns: pending.map((row) => ({
        memberId: row.memberId,
        displayName: row.displayName,
        pan: row.pan,
        willReceiveFromTeam: Number(row.willReceiveFromTeam),
      })),
      recentTransactions: txns.map((row) => ({
        id: row.id,
        type: row.type,
        amount: Number(row.amount),
        balance_after: Number(row.balance_after),
        txn_date: row.txn_date,
        notes: row.notes,
      })),
      liveIpos: Number(liveStats?.liveIpos || 0),
      liveOpen: Number(liveStats?.liveOpen || 0),
      liveUpcoming: Number(liveStats?.liveUpcoming || 0),
      myIpos: Number(ipoStats?.myIpos || 0),
      openIpoCount: Number(ipoStats?.openIpos || 0),
      teamApplications: Number(appStats?.teamApplications || 0),
      pendingAllotments: Number(appStats?.pendingAllotments || 0),
      allotted: Number(appStats?.allotted || 0),
      notAllotted: Number(appStats?.notAllotted || 0),
      expectedProfit: Number(expected?.expectedProfit || 0),
      currentGmp: gmpRow
        ? {
            name: gmpRow.name,
            gmp: gmpRow.gmp != null ? Number(gmpRow.gmp) : null,
            gmpPercentage: gmpRow.gmp_percentage != null ? Number(gmpRow.gmp_percentage) : null,
            estimatedListingPrice: gmpRow.estimated_listing_price != null
              ? Number(gmpRow.estimated_listing_price)
              : null,
            lastUpdated: gmpRow.gmp_updated_at,
          }
        : null,
    };
  } finally {
    conn.release();
  }
}
