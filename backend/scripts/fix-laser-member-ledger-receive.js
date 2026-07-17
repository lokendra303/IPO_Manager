/**
 * Fix member ledger RECEIVED rows that used withdrawal (incl. profit) instead of
 * distributed principal. That wrongly reduced "pending to return" on member portal.
 *
 * Usage: node scripts/fix-laser-member-ledger-receive.js [--dry-run]
 */
import { pool } from '../src/db/pool.js';

const IPO_ID = 10;
const TENANT_ID = 2;
const dryRun = process.argv.includes('--dry-run');

const conn = await pool.getConnection();
try {
  const [rows] = await conn.query(
    `SELECT l.id AS ledger_id, l.amount AS ledger_amount, l.ipo_application_id,
            a.amount AS distributed, a.withdrawal_money, m.display_name
     FROM member_ledger_entries l
     JOIN ipo_applications a ON a.id = l.ipo_application_id
     JOIN members m ON m.id = l.member_id
     WHERE l.tenant_id = ? AND l.type = 'RECEIVED' AND a.ipo_id = ?
       AND a.allotment_status = 'ALLOTED'
       AND a.withdrawal_money IS NOT NULL
       AND ABS(l.amount - a.withdrawal_money) < 0.01
     ORDER BY a.id`,
    [TENANT_ID, IPO_ID]
  );

  console.log(
    `Fixing Laser Power member ledger RECEIVED → distributed amount${dryRun ? ' [DRY RUN]' : ''}…\n`
  );

  if (!rows.length) {
    console.log('No mismatched RECEIVED rows found.');
  } else {
    await conn.beginTransaction();

    for (const row of rows) {
      const next = Number(row.distributed);
      console.log(
        `  #${row.ipo_application_id} ${row.display_name}: ledger ${row.ledger_amount} → ${next}`
      );
      if (!dryRun) {
        await conn.query('UPDATE member_ledger_entries SET amount = ? WHERE id = ?', [
          next,
          row.ledger_id,
        ]);
      }
    }

    if (!dryRun) {
      await conn.commit();
      console.log('\nDone.');
    } else {
      await conn.rollback();
      console.log('\nDry run — no changes written.');
    }
  }
} catch (err) {
  await conn.rollback();
  console.error('Failed:', err);
  process.exitCode = 1;
} finally {
  conn.release();
  await pool.end();
}
