/**
 * Fix Laser Power wallet RETURN_IN rows that credited full withdrawal (incl. member profit).
 * Also accounts for manager share already credited via legacy profit_share wallet entries.
 *
 * Usage: node scripts/fix-laser-wallet-receive.js [--dry-run]
 */
import { pool } from '../src/db/pool.js';
import { resolveApplicationProfitSplit } from '../src/services/profitShareService.js';
import { syncOwnerWalletTotal } from '../src/services/bankAccountService.js';

const IPO_ID = 10;
const TENANT_ID = 2;
const dryRun = process.argv.includes('--dry-run');

async function getManagerShareAlreadyInWallet(conn, tenantId, applicationId) {
  const [rows] = await conn.query(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM wallet_transactions
     WHERE tenant_id = ? AND ref_type = 'profit_share' AND ref_id = ?`,
    [tenantId, applicationId]
  );
  return Number(rows[0]?.total ?? 0);
}

function correctWalletAmount(app, split, managerAlreadyInWallet) {
  const withdrawal =
    app.withdrawal_money != null ? Number(app.withdrawal_money) : Number(app.amount);
  const memberAmount = Number(split.memberAmount ?? 0);
  return Math.round((withdrawal - memberAmount - managerAlreadyInWallet) * 100) / 100;
}

const conn = await pool.getConnection();
try {
  const [apps] = await conn.query(
    `SELECT a.*, m.display_name
     FROM ipo_applications a
     JOIN members m ON m.id = a.member_id
     WHERE a.ipo_id = ? AND a.tenant_id = ? AND a.allotment_status = 'ALLOTED'
     ORDER BY a.id`,
    [IPO_ID, TENANT_ID]
  );

  console.log(`Fixing Laser Power wallet receives${dryRun ? ' [DRY RUN]' : ''}…\n`);

  await conn.beginTransaction();

  for (const app of apps) {
    const split = await resolveApplicationProfitSplit(conn, TENANT_ID, app);
    const managerAlready = await getManagerShareAlreadyInWallet(conn, TENANT_ID, app.id);
    const correct = correctWalletAmount(app, split, managerAlready);

    const [walletRows] = await conn.query(
      `SELECT id, amount FROM wallet_transactions
       WHERE tenant_id = ? AND type = 'RETURN_IN' AND ref_type = 'ipo_application' AND ref_id = ?`,
      [TENANT_ID, app.id]
    );

    if (!walletRows.length) {
      console.log(`  #${app.id} ${app.display_name}: no wallet receive row — skip`);
      continue;
    }

    const wt = walletRows[0];
    const current = Number(wt.amount);
    if (Math.abs(current - correct) < 0.01) {
      console.log(`  #${app.id} ${app.display_name}: already correct (${correct})`);
      continue;
    }

    console.log(
      `  #${app.id} ${app.display_name}: ${current} → ${correct}` +
        ` (member keeps ${split.memberAmount}, manager already in wallet ${managerAlready})`
    );

    if (!dryRun) {
      await conn.query('UPDATE wallet_transactions SET amount = ? WHERE id = ?', [correct, wt.id]);
    }
  }

  if (!dryRun) {
    await syncOwnerWalletTotal(conn, TENANT_ID);
    await conn.commit();
    console.log('\nDone — wallet totals synced.');
  } else {
    await conn.rollback();
    console.log('\nDry run — no changes written.');
  }
} catch (err) {
  await conn.rollback();
  console.error('Failed:', err);
  process.exitCode = 1;
} finally {
  conn.release();
  await pool.end();
}
