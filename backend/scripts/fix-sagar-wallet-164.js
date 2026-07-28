import { pool, withTransaction } from '../src/db/pool.js';
import { creditWallet } from '../src/services/walletService.js';
import { syncOwnerWalletTotal } from '../src/services/bankAccountService.js';

const PROVIDER_ID = 1;
const TENANT_ID = 2;
const USER_ID = null;

const [accounts] = await pool.query(
  'SELECT id, label, balance FROM manager_bank_accounts WHERE tenant_id = ? ORDER BY id',
  [TENANT_ID]
);
const mainAccount = accounts.find((a) => a.label === 'MAIN') || accounts[0];
if (!mainAccount) {
  console.error('No bank account for tenant', TENANT_ID);
  process.exit(1);
}

const [provider] = await pool.query(
  'SELECT name FROM fund_providers WHERE id = ? AND tenant_id = ?',
  [PROVIDER_ID, TENANT_ID]
);
const providerName = provider[0]?.name || 'Provider';

async function sumAccrued(conn) {
  const [rows] = await conn.query(
    `SELECT COALESCE(SUM(provider_profit), 0) AS accrued
     FROM provider_transactions WHERE fund_provider_id = ? AND tenant_id = ?`,
    [PROVIDER_ID, TENANT_ID]
  );
  return Number(rows[0]?.accrued ?? 0);
}

await withTransaction(async (conn) => {
  const [errLoss] = await conn.query(
    `SELECT id FROM provider_transactions
     WHERE id = 96 AND fund_provider_id = ? AND tenant_id = ?
       AND account_label = 'P&L Share (Manual Loss)' AND provider_profit = -164`,
    [PROVIDER_ID, TENANT_ID]
  );
  if (errLoss.length) {
    console.log('Removing txn 96 (manual -164 that zeroed accrued profit)');
    await conn.query('DELETE FROM provider_transactions WHERE id = 96');
  }

  const [missingReinvest] = await conn.query(
    `SELECT pt.id, pt.amount, pt.txn_date, pt.notes
     FROM provider_transactions pt
     LEFT JOIN wallet_transactions wt
       ON wt.ref_type = 'provider_transaction' AND wt.ref_id = pt.id AND wt.tenant_id = pt.tenant_id
     WHERE pt.fund_provider_id = ? AND pt.tenant_id = ?
       AND pt.id = 93
       AND pt.account_label = 'Profit Reinvested'
       AND pt.amount > 0
       AND wt.id IS NULL`,
    [PROVIDER_ID, TENANT_ID]
  );

  for (const row of missingReinvest) {
    const amt = Number(row.amount);
    console.log(`Backfill wallet ₹${amt} for Profit Reinvested txn ${row.id}`);
    await creditWallet(conn, {
      tenantId: TENANT_ID,
      amount: amt,
      bankAccountId: mainAccount.id,
      type: 'PROVIDER_IN',
      refType: 'provider_transaction',
      refId: row.id,
      txnDate: row.txn_date,
      notes: `${row.notes || 'Profit reinvested'} — ${providerName} (wallet backfill)`,
      userId: USER_ID,
    });
  }

  const accrued = await sumAccrued(conn);
  console.log('Accrued profit after cleanup:', accrued);

  if (accrued >= 164 - 0.001) {
    const reinvestAmt = 164;
    const txnDate = new Date();
    const notes = 'Profit reinvested into principal';
    const [txnResult] = await conn.query(
      `INSERT INTO provider_transactions
       (fund_provider_id, tenant_id, amount, txn_date, account_label, bank_account_id, notes, provider_profit, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        PROVIDER_ID,
        TENANT_ID,
        reinvestAmt,
        txnDate,
        'Profit Reinvested',
        mainAccount.id,
        notes,
        -reinvestAmt,
        USER_ID,
      ]
    );
    await creditWallet(conn, {
      tenantId: TENANT_ID,
      amount: reinvestAmt,
      bankAccountId: mainAccount.id,
      type: 'PROVIDER_IN',
      refType: 'provider_transaction',
      refId: txnResult.insertId,
      txnDate,
      notes: `${notes} — ${providerName}`,
      userId: USER_ID,
    });
    console.log(`Reinvested ₹${reinvestAmt} to principal and credited wallet (txn ${txnResult.insertId})`);
  } else if (accrued > 0.001) {
    console.log(`Accrued is ₹${accrued}; not auto-reinvesting 164`);
  }

  await syncOwnerWalletTotal(conn, TENANT_ID);
});

const [sums] = await pool.query(
  `SELECT SUM(amount) AS principal, SUM(COALESCE(provider_profit, 0)) AS accrued
   FROM provider_transactions WHERE fund_provider_id = ? AND tenant_id = ?`,
  [PROVIDER_ID, TENANT_ID]
);
console.log('Final ledger', sums[0]);

const [mainBal] = await pool.query(
  'SELECT balance FROM manager_bank_accounts WHERE id = ?',
  [mainAccount.id]
);
console.log('MAIN balance', mainBal[0]?.balance);

await pool.end();
