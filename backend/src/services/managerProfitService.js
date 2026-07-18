import { AppError } from '../middleware/errorHandler.js';
import { parseAmount } from '../utils/validate.js';
import { debitWallet, ensureWallet } from './walletService.js';

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

/**
 * Manager IPO profit available for personal use.
 * Provider accrued profit is reserved in the wallet and cannot be withdrawn here —
 * handle provider money from Fund Providers only.
 */
export async function getManagerProfitSummary(conn, tenantId) {
  await ensureWallet(conn, tenantId);

  const [[mgr]] = await conn.query(
    `SELECT COALESCE(SUM(manager_amount), 0) AS total
     FROM profit_share_distributions
     WHERE tenant_id = ?`,
    [tenantId]
  );

  // PERSONAL_OUT rows store negative amounts (debits)
  const [[wd]] = await conn.query(
    `SELECT COALESCE(SUM(-amount), 0) AS total
     FROM wallet_transactions
     WHERE tenant_id = ? AND type = 'PERSONAL_OUT'`,
    [tenantId]
  );

  // Accrued provider profit still owed — cash in wallet must not be taken personally
  const [[prov]] = await conn.query(
    `SELECT COALESCE(SUM(provider_profit), 0) AS total
     FROM provider_transactions
     WHERE tenant_id = ?`,
    [tenantId]
  );

  const [[wallet]] = await conn.query(
    'SELECT COALESCE(balance, 0) AS balance FROM owner_wallets WHERE tenant_id = ?',
    [tenantId]
  );

  const totalManagerShare = round2(mgr?.total);
  const personalWithdrawn = round2(wd?.total);
  const providerAccruedProfit = round2(Math.max(0, Number(prov?.total || 0)));
  const availableManagerProfit = round2(Math.max(0, totalManagerShare - personalWithdrawn));
  const walletBalance = round2(wallet?.balance);

  // Cash free of provider profit claim (never allow personal withdraw from provider profit)
  const walletExcludingProviderProfit = round2(Math.max(0, walletBalance - providerAccruedProfit));
  const maxWithdraw = round2(
    Math.min(walletExcludingProviderProfit, availableManagerProfit)
  );

  return {
    totalManagerShare,
    personalWithdrawn,
    availableManagerProfit,
    providerAccruedProfit,
    walletExcludingProviderProfit,
    walletBalance,
    maxWithdraw,
  };
}

export async function personalWithdraw(conn, {
  tenantId,
  amount,
  bankAccountId,
  notes,
  userId,
  txnDate,
}) {
  const summary = await getManagerProfitSummary(conn, tenantId);
  const withdrawAmount = parseAmount(amount, {
    allowNegative: false,
    allowZero: false,
    fieldName: 'personal withdrawal amount',
  });

  if (summary.maxWithdraw <= 0) {
    throw new AppError(
      'No manager profit available to withdraw. Provider profit is reserved and must be handled from Fund Providers.'
    );
  }

  if (withdrawAmount > summary.maxWithdraw + 0.001) {
    throw new AppError(
      `Cannot withdraw provider profit. Max from manager profit: ₹${summary.maxWithdraw.toLocaleString('en-IN')} ` +
        `(manager profit ₹${summary.availableManagerProfit.toLocaleString('en-IN')}, ` +
        `provider profit reserved ₹${summary.providerAccruedProfit.toLocaleString('en-IN')}, ` +
        `wallet ₹${summary.walletBalance.toLocaleString('en-IN')})`
    );
  }

  const baseNote = notes?.trim() || 'Personal use';
  const newBalance = await debitWallet(conn, {
    tenantId,
    amount: withdrawAmount,
    bankAccountId,
    type: 'PERSONAL_OUT',
    refType: 'personal_withdraw',
    refId: null,
    txnDate: txnDate || new Date(),
    notes: `${baseNote} (manager profit only)`,
    userId,
  });

  const updated = await getManagerProfitSummary(conn, tenantId);
  return {
    withdrawn: withdrawAmount,
    newBalance,
    ...updated,
  };
}
