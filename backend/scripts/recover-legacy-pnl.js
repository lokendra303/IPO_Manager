/**
 * One-time recovery for legacy P&L cleared by migration V44 + orphaned cleanup V33.
 * Restores profit_loss + withdrawal_money, then re-applies profit share splits.
 */
import { pool } from '../src/db/pool.js';
import { distributeProfitShares } from '../src/services/profitShareService.js';

const RECOVERIES = [
  { appId: 20, tenantId: 2, ipoId: 1, profitLoss: 5859, amount: 14976, label: 'CMR Green / MANJU DEVI' },
  { appId: 64, tenantId: 2, ipoId: 8, profitLoss: 1523, amount: 14960, label: 'Knack / BANTI' },
  { appId: 33, tenantId: 9, ipoId: 3, profitLoss: 1000, amount: 5000, label: 'cmr / jitendra' },
];

const conn = await pool.getConnection();
try {
  await conn.beginTransaction();

  for (const row of RECOVERIES) {
    const withdrawal = Math.round((row.amount + row.profitLoss) * 100) / 100;

    await conn.query(
      `UPDATE ipo_applications
       SET profit_loss = ?, withdrawal_money = ?
       WHERE id = ? AND tenant_id = ?`,
      [row.profitLoss, withdrawal, row.appId, row.tenantId]
    );
    console.log(`Updated app #${row.appId} (${row.label}): P&L ${row.profitLoss}, withdrawal ${withdrawal}`);

    const [ipoRows] = await conn.query(
      'SELECT status FROM ipos WHERE id = ? AND tenant_id = ?',
      [row.ipoId, row.tenantId]
    );
    const wasClosed = ipoRows[0]?.status === 'CLOSED';
    if (wasClosed) {
      await conn.query('UPDATE ipos SET status = ? WHERE id = ? AND tenant_id = ?', ['OPEN', row.ipoId, row.tenantId]);
      console.log(`  Temporarily opened IPO #${row.ipoId} for P&L split`);
    }

    const results = await distributeProfitShares(conn, {
      tenantId: row.tenantId,
      applicationIds: [row.appId],
      userId: null,
    });
    console.log(`  Distribute:`, results[0] || results);

    if (wasClosed) {
      await conn.query('UPDATE ipos SET status = ? WHERE id = ? AND tenant_id = ?', ['CLOSED', row.ipoId, row.tenantId]);
      console.log(`  Re-closed IPO #${row.ipoId}`);
    }
  }

  await conn.commit();
  console.log('\nRecovery completed.');
} catch (err) {
  await conn.rollback();
  console.error('Recovery failed:', err);
  process.exitCode = 1;
} finally {
  conn.release();
  await pool.end();
}
