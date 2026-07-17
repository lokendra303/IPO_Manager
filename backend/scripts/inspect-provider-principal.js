import { pool } from '../src/db/pool.js';

const TENANT_ID = 2;

const [providers] = await pool.query(
  `SELECT id, name FROM fund_providers WHERE tenant_id = ? ORDER BY id`,
  [TENANT_ID]
);
console.log('\n=== Fund Providers ===');
console.table(providers);

for (const fp of providers) {
  const [txns] = await pool.query(
    `SELECT id, amount, provider_profit, account_label, notes, txn_date, created_at
     FROM provider_transactions
     WHERE fund_provider_id = ? AND tenant_id = ?
     ORDER BY id`,
    [fp.id, TENANT_ID]
  );

  const principal = txns.reduce((s, t) => s + Number(t.amount ?? 0), 0);
  const accrued = txns.reduce((s, t) => s + Number(t.provider_profit ?? 0), 0);

  console.log(`\n=== ${fp.name} (id ${fp.id}) — ${txns.length} txns ===`);
  console.table(txns);
  console.log(`  Principal (SUM amount):     ${principal.toFixed(2)}`);
  console.log(`  Accrued (SUM provider_profit): ${accrued.toFixed(2)}`);
  console.log(`  Total:                      ${(principal + accrued).toFixed(2)}`);
}

await pool.end();
