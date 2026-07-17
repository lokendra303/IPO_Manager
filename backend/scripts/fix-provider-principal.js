/**
 * Fix provider principal: accrual-only payouts that wrongly hit principal (amount != 0).
 * Also fixes txn 26 provider_profit to match accrual row 23 exactly.
 *
 * Usage: node scripts/fix-provider-principal.js [--dry-run]
 */
import { pool, withTransaction } from '../src/db/pool.js';

const dryRun = process.argv.includes('--dry-run');
const TENANT_ID = 2;

const [badRows] = await pool.query(
  `SELECT pt.id, pt.amount, pt.provider_profit, pt.account_label, pt.notes,
          wt.id AS wallet_id
   FROM provider_transactions pt
   LEFT JOIN wallet_transactions wt
     ON wt.ref_type = 'provider_transaction' AND wt.ref_id = pt.id AND wt.tenant_id = pt.tenant_id
   WHERE pt.tenant_id = ?
     AND pt.amount != 0
     AND pt.provider_profit IS NOT NULL
     AND pt.provider_profit != 0
     AND COALESCE(pt.account_label, '') != 'Profit Reinvested'
     AND wt.id IS NULL
   ORDER BY pt.id`,
  [TENANT_ID]
);

console.log('\n=== Accrual payouts wrongly hitting principal ===');
console.table(badRows);

await withTransaction(async (conn) => {
  for (const row of badRows) {
    console.log(`  Fix #${row.id}: amount ${row.amount} → 0 (keep provider_profit ${row.provider_profit})`);
    if (!dryRun) {
      await conn.query('UPDATE provider_transactions SET amount = 0 WHERE id = ?', [row.id]);
    }
  }

  // Align share-sent with accrual amount (2929.50 vs 2929.00)
  const [txn26] = await conn.query('SELECT id, provider_profit FROM provider_transactions WHERE id = 26');
  if (txn26.length && Number(txn26[0].provider_profit) === -2929) {
    console.log('  Fix #26: provider_profit -2929 → -2929.50 (match accrual row #23)');
    if (!dryRun) {
      await conn.query('UPDATE provider_transactions SET provider_profit = -2929.50 WHERE id = 26');
    }
  }
});

const [summary] = await pool.query(
  `SELECT SUM(amount) AS principal, SUM(COALESCE(provider_profit,0)) AS accrued
   FROM provider_transactions WHERE tenant_id = ?`,
  [TENANT_ID]
);
const [walletSum] = await pool.query(
  `SELECT SUM(amount) AS total FROM wallet_transactions
   WHERE tenant_id = ? AND ref_type = 'provider_transaction'`,
  [TENANT_ID]
);

console.log('\n=== After fix ===');
console.log(`  Principal:  ${Number(summary[0].principal).toFixed(2)}`);
console.log(`  Accrued:    ${Number(summary[0].accrued).toFixed(2)}`);
console.log(`  Total:      ${(Number(summary[0].principal) + Number(summary[0].accrued)).toFixed(2)}`);
console.log(`  Wallet ref: ${Number(walletSum[0].total).toFixed(2)} (should match principal)`);
console.log(dryRun ? '\n[DRY RUN — no changes made]' : '\nDone.');

await pool.end();
