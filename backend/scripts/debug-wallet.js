import { pool } from '../src/db/pool.js';

const TENANT_ID = 2;

const [all] = await pool.query(
  `SELECT id, type, amount, ref_type, ref_id, notes, created_at
   FROM wallet_transactions
   WHERE tenant_id = ?
   ORDER BY id`,
  [TENANT_ID]
);
console.log('\n=== ALL wallet transactions ===');
console.table(all);

const [sum] = await pool.query(
  `SELECT SUM(amount) AS total FROM wallet_transactions WHERE tenant_id = ?`,
  [TENANT_ID]
);
console.log('\nWallet SUM(amount):', sum[0].total);

const [rollbacks] = await pool.query(
  `SELECT id, type, amount, ref_type, notes FROM wallet_transactions
   WHERE tenant_id = ? AND ref_type = 'rollback_today'
   ORDER BY id`,
  [TENANT_ID]
);
console.log('\n=== Rollback adjustment entries ===');
console.table(rollbacks);

const [rollbackSum] = await pool.query(
  `SELECT SUM(amount) AS total FROM wallet_transactions WHERE tenant_id = ? AND ref_type = 'rollback_today'`,
  [TENANT_ID]
);
console.log('Rollback entries SUM:', rollbackSum[0].total);

const [accounts] = await pool.query(
  `SELECT id, label, balance FROM manager_bank_accounts WHERE tenant_id = ? ORDER BY id`,
  [TENANT_ID]
);
console.log('\n=== Bank accounts ===');
console.table(accounts);

const [wallet] = await pool.query(
  `SELECT balance FROM owner_wallets WHERE tenant_id = ?`,
  [TENANT_ID]
);
console.log('Owner wallet:', wallet[0]?.balance);

await pool.end();
