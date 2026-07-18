import { ensureWallet } from './walletService.js';

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
              COALESCE(g.total, 0) - COALESCE(r.total, 0) AS willReceiveFromTeam
       FROM members m
       LEFT JOIN (
         SELECT member_id, SUM(amount) AS total
         FROM member_ledger_entries
         WHERE tenant_id = ? AND type = 'GIVEN'
         GROUP BY member_id
       ) g ON g.member_id = m.id
       LEFT JOIN (
         SELECT member_id, SUM(amount) AS total
         FROM member_ledger_entries
         WHERE tenant_id = ? AND type = 'RECEIVED'
         GROUP BY member_id
       ) r ON r.member_id = m.id
       WHERE m.tenant_id = ?
         AND COALESCE(g.total, 0) - COALESCE(r.total, 0) > 0.005
       ORDER BY willReceiveFromTeam DESC
       LIMIT 8`,
      [tenantId, tenantId, tenantId]
    );

    const [txns] = await conn.query(
      `SELECT wt.id, wt.type, wt.amount, wt.balance_after, wt.txn_date, wt.notes
       FROM wallet_transactions wt
       WHERE wt.tenant_id = ?
       ORDER BY wt.txn_date DESC, wt.id DESC
       LIMIT 8`,
      [tenantId]
    );

    return {
      walletBalance: Number(wallet.balance),
      activeMembers: Number(memberCount.cnt),
      managerShare: Number(share.managerShare),
      openIssueCount: Number(issueCount.openCount),
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
    };
  } finally {
    conn.release();
  }
}
