import { pool, withTransaction } from '../src/db/pool.js';
import {
  undoReceiveIpoApplication,
  receiveIpoApplication,
} from '../src/services/receiveApplicationService.js';
import { tryAutoDistributeApplication } from '../src/services/profitShareService.js';
import { syncOwnerWalletTotal } from '../src/services/bankAccountService.js';
import { getIpoSummaryById } from '../src/services/summaryService.js';

const TENANT_ID = 2;
const IPO_ID = 17;
const APP_ID = 182; // BASNTI — withdrawal typo 209311 → 20931
const CORRECT_WITHDRAWAL = 20931;
const APP_AMOUNT = 14550;
const USER_ID = 1;

const [beforeWallet] = await pool.query(
  'SELECT balance FROM owner_wallets WHERE tenant_id = ?',
  [TENANT_ID]
);
const [returnTxn] = await pool.query(
  `SELECT id, bank_account_id, amount FROM wallet_transactions
   WHERE tenant_id = ? AND type = 'RETURN_IN' AND ref_type = 'ipo_application' AND ref_id = ?`,
  [TENANT_ID, APP_ID]
);
console.log('Before:');
console.log('  wallet:', Number(beforeWallet[0]?.balance));
console.log('  RETURN_IN:', returnTxn[0]);

const bankAccountId = returnTxn[0]?.bank_account_id;
if (!bankAccountId) {
  throw new Error('No RETURN_IN bank account found for BASNTI — aborting');
}

const repair = await withTransaction(async (conn) => {
  await conn.query(`UPDATE ipos SET status = 'OPEN' WHERE id = ? AND tenant_id = ?`, [
    IPO_ID,
    TENANT_ID,
  ]);

  const undo = await undoReceiveIpoApplication(conn, {
    tenantId: TENANT_ID,
    appId: APP_ID,
    userId: USER_ID,
    revokeProfitSplit: true,
  });

  const profitLoss = Math.round((CORRECT_WITHDRAWAL - APP_AMOUNT) * 100) / 100;
  await conn.query(
    `UPDATE ipo_applications
     SET withdrawal_money = ?, profit_loss = ?
     WHERE id = ? AND tenant_id = ?`,
    [CORRECT_WITHDRAWAL, profitLoss, APP_ID, TENANT_ID]
  );

  const dist = await tryAutoDistributeApplication(conn, {
    tenantId: TENANT_ID,
    applicationId: APP_ID,
    userId: USER_ID,
  });

  const recv = await receiveIpoApplication(conn, {
    tenantId: TENANT_ID,
    appId: APP_ID,
    returnToWallet: true,
    bankAccountId,
    userId: USER_ID,
  });

  await conn.query(`UPDATE ipos SET status = 'CLOSED' WHERE id = ? AND tenant_id = ?`, [
    IPO_ID,
    TENANT_ID,
  ]);

  await syncOwnerWalletTotal(conn, TENANT_ID, { bankAccountIds: [bankAccountId] });
  return { undo, profitLoss, dist, recv };
});

console.log('\nRepair steps:', repair);

const summary = await getIpoSummaryById(pool, TENANT_ID, IPO_ID);
console.log('\nCorrected IPO summary:');
console.log({
  totalProfitLoss: summary.totalProfitLoss,
  shareManagerTotal: summary.shareManagerTotal,
  shareProviderTotal: summary.shareProviderTotal,
  shareMemberTotal: summary.shareMemberTotal,
  allottedCount: summary.allottedCount,
  expectedGross: 6381 * 5,
});

const [apps] = await pool.query(
  `SELECT a.id, m.display_name, a.withdrawal_money, a.profit_loss,
          psd.member_amount, psd.manager_amount, psd.provider_amount,
          wt.amount AS return_in
   FROM ipo_applications a
   JOIN members m ON m.id = a.member_id
   LEFT JOIN profit_share_distributions psd ON psd.ipo_application_id = a.id
   LEFT JOIN wallet_transactions wt
     ON wt.ref_type = 'ipo_application' AND wt.ref_id = a.id AND wt.type = 'RETURN_IN'
   WHERE a.ipo_id = ? AND a.tenant_id = ? AND a.allotment_status = 'ALLOTED'
   ORDER BY a.id`,
  [IPO_ID, TENANT_ID]
);
console.table(
  apps.map((a) => ({
    id: a.id,
    name: a.display_name,
    withdrawal: Number(a.withdrawal_money),
    pnl: Number(a.profit_loss),
    mem: Number(a.member_amount),
    mgr: Number(a.manager_amount),
    prov: Number(a.provider_amount),
    return_in: a.return_in != null ? Number(a.return_in) : null,
  }))
);

const [afterWallet] = await pool.query(
  'SELECT balance FROM owner_wallets WHERE tenant_id = ?',
  [TENANT_ID]
);
console.log('Wallet after:', Number(afterWallet[0]?.balance));
console.log(
  'Wallet delta (expected ~ -131866):',
  Math.round((Number(afterWallet[0]?.balance) - Number(beforeWallet[0]?.balance)) * 100) / 100
);

await pool.end();
