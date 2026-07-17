import { pool, withTransaction } from '../src/db/pool.js';
import { syncOwnerWalletTotal } from '../src/services/bankAccountService.js';

await withTransaction(async (conn) => {
  const [del] = await conn.query(
    `DELETE FROM wallet_transactions WHERE tenant_id = 2 AND ref_type = 'rollback_today'`
  );
  console.log('Deleted rollback adjustments:', del.affectedRows);

  const newBalance = await syncOwnerWalletTotal(conn, 2);
  console.log('New wallet balance:', newBalance);
});

const [wallet] = await pool.query('SELECT balance FROM owner_wallets WHERE tenant_id = 2');
console.log('Verified owner wallet:', wallet[0]?.balance);

const [accts] = await pool.query(
  'SELECT id, label, balance FROM manager_bank_accounts WHERE tenant_id = 2 ORDER BY id'
);
console.table(accts);

const [sum] = await pool.query(
  'SELECT SUM(amount) AS total FROM wallet_transactions WHERE tenant_id = 2'
);
console.log('SUM(amount) check:', sum[0].total);

await pool.end();
