import { AppError } from '../middleware/errorHandler.js';
import { parseAmount, parseDate } from '../utils/validate.js';
import { syncOwnerWalletTotal } from './bankAccountService.js';
import { debitWallet, ensureWallet } from './walletService.js';

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

/**
 * Manager IPO profit available for personal use.
 * Provider accrued profit is reserved in the wallet and cannot be withdrawn here —
 * handle provider money from Fund Providers only.
 */
export async function getManagerProfitSummary(conn, tenantId, { skipEnsureWallet = false } = {}) {
  if (!skipEnsureWallet) {
    await ensureWallet(conn, tenantId);
  }

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

  const [[bankSum]] = await conn.query(
    `SELECT COALESCE(SUM(balance), 0) AS balance
     FROM manager_bank_accounts
     WHERE tenant_id = ? AND is_active = 1`,
    [tenantId]
  );

  const totalManagerShare = round2(mgr?.total);
  const personalWithdrawn = round2(wd?.total);
  const providerAccruedProfit = round2(Math.max(0, Number(prov?.total || 0)));
  const availableManagerProfit = round2(Math.max(0, totalManagerShare - personalWithdrawn));
  const walletBalance = round2(bankSum?.balance);

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
  await ensureWallet(conn, tenantId);
  await syncOwnerWalletTotal(conn, tenantId, { fullVerify: true });

  const summary = await getManagerProfitSummary(conn, tenantId, { skipEnsureWallet: true });
  const withdrawAmount = parseAmount(amount, {
    allowNegative: false,
    allowZero: false,
    fieldName: 'personal withdrawal amount',
  });

  if (summary.availableManagerProfit <= 0) {
    throw new AppError(
      'No manager IPO profit left to withdraw. Run Profit Sharing on allotted IPOs first, then receive member returns to wallet.'
    );
  }

  if (summary.maxWithdraw <= 0) {
    throw new AppError(
      summary.providerAccruedProfit > 0
        ? `Cannot withdraw right now: wallet has ${summary.walletBalance.toLocaleString('en-IN')} but provider profit reserved is ${summary.providerAccruedProfit.toLocaleString('en-IN')}. Repay or move provider funds from Fund Providers first.`
        : 'No withdrawable manager profit in the wallet right now.'
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
    txnDate: parseDate(txnDate, 'transaction date'),
    notes: `${baseNote} (manager profit only)`,
    userId,
  });

  const updated = await getManagerProfitSummary(conn, tenantId, { skipEnsureWallet: true });
  return {
    withdrawn: withdrawAmount,
    newBalance,
    ...updated,
  };
}
