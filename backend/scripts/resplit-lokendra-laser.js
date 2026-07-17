/**
 * Fix Lokendra duplicate share rules and re-split Laser Power P&L with correct rule.
 */
import { pool, withTransaction } from '../src/db/pool.js';
import { distributeProfitShares } from '../src/services/profitShareService.js';

const conn = await pool.getConnection();
try {
  // Remove duplicate global rule (keep id 36, delete 37)
  const [dupes] = await conn.query(
    `SELECT id, rule_name, provider_percent, manager_percent, created_at
     FROM member_profit_shares
     WHERE tenant_id = 2 AND member_id = 1 AND ipo_id IS NULL
     ORDER BY id`
  );
  console.log('Lokendra global rules before:', dupes);

  if (dupes.length > 1) {
    const toDelete = dupes.slice(1).map((r) => r.id);
    await conn.query('DELETE FROM member_profit_shares WHERE id IN (?)', [toDelete]);
    console.log('Deleted duplicate rule(s):', toDelete);
  }

  await conn.beginTransaction();
  const results = await distributeProfitShares(conn, {
    tenantId: 2,
    applicationIds: [125],
    userId: null,
  });
  await conn.commit();
  console.log('Re-split result:', results);

  const [after] = await conn.query(
    `SELECT psd.* FROM profit_share_distributions psd
     JOIN ipo_applications a ON a.id = psd.ipo_application_id
     WHERE a.id = 125`
  );
  console.log('Distribution after re-split:', after);
} catch (err) {
  await conn.rollback();
  console.error(err);
  process.exitCode = 1;
} finally {
  conn.release();
  await pool.end();
}
