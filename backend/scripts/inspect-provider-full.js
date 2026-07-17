import { pool } from '../src/db/pool.js';

const TENANT_ID = 2;

const [allTxns] = await pool.query(
  `SELECT pt.id, pt.fund_provider_id, fp.name, pt.amount, pt.provider_profit,
          pt.account_label, pt.notes, pt.txn_date
   FROM provider_transactions pt
   LEFT JOIN fund_providers fp ON fp.id = pt.fund_provider_id
   WHERE pt.tenant_id = ?
   ORDER BY pt.id`,
  [TENANT_ID]
);
console.log('\n=== ALL provider_transactions (tenant 2) ===');
console.table(allTxns);

const principal = allTxns.reduce((s, t) => s + Number(t.amount ?? 0), 0);
const accrued = allTxns.reduce((s, t) => s + Number(t.provider_profit ?? 0), 0);
console.log(`\nTotal Principal: ${principal.toFixed(2)}`);
console.log(`Total Accrued:   ${accrued.toFixed(2)}`);
console.log(`Total:           ${(principal + accrued).toFixed(2)}`);

const [walletProv] = await pool.query(
  `SELECT id, type, amount, ref_type, ref_id, notes
   FROM wallet_transactions
   WHERE tenant_id = ? AND ref_type = 'provider_transaction'
   ORDER BY id`,
  [TENANT_ID]
);
console.log('\n=== Wallet PROVIDER_IN/OUT linked to provider txns ===');
console.table(walletProv);
const walletSum = walletProv.reduce((s, t) => s + Number(t.amount), 0);
console.log('Wallet provider SUM:', walletSum.toFixed(2));

const [pnlRows] = await pool.query(
  `SELECT id, amount, provider_profit, account_label, notes
   FROM provider_transactions
   WHERE tenant_id = ? AND (
     account_label LIKE '%P&L%' OR account_label LIKE '%Share%' OR provider_profit IS NOT NULL
   )
   ORDER BY id`,
  [TENANT_ID]
);
console.log('\n=== P&L / profit rows ===');
console.table(pnlRows);

const [badRows] = await pool.query(
  `SELECT id, amount, provider_profit, account_label, notes
   FROM provider_transactions
   WHERE tenant_id = ? AND amount != 0 AND provider_profit IS NOT NULL AND provider_profit != 0
   ORDER BY id`,
  [TENANT_ID]
);
console.log('\n=== Rows with BOTH amount AND provider_profit non-zero (potential double-count) ===');
console.table(badRows);

const [orphanFp] = await pool.query(
  `SELECT pt.fund_provider_id, COUNT(*) AS cnt
   FROM provider_transactions pt
   LEFT JOIN fund_providers fp ON fp.id = pt.fund_provider_id
   WHERE pt.tenant_id = ? AND fp.id IS NULL
   GROUP BY pt.fund_provider_id`,
  [TENANT_ID]
);
console.log('\n=== Orphan fund_provider_id refs ===');
console.table(orphanFp);

await pool.end();
