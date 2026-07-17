import { pool } from '../src/db/pool.js';

const TENANT_ID = 2;
const [badRows] = await pool.query(
  `SELECT pt.id, pt.amount, pt.provider_profit, pt.account_label, pt.notes, wt.id AS wallet_id
   FROM provider_transactions pt
   LEFT JOIN wallet_transactions wt
     ON wt.ref_type = 'provider_transaction' AND wt.ref_id = pt.id AND wt.tenant_id = pt.tenant_id
   WHERE pt.tenant_id = ?
     AND pt.amount != 0
     AND pt.provider_profit IS NOT NULL
     AND pt.provider_profit != 0
     AND pt.account_label != 'Profit Reinvested'
     AND wt.id IS NULL
   ORDER BY pt.id`,
  [TENANT_ID]
);
console.log('badRows count:', badRows.length);
console.table(badRows);

await pool.end();
