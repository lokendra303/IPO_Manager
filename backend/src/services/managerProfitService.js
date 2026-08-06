import { AppError } from '../middleware/errorHandler.js';
import { parseAmount, parseDate } from '../utils/validate.js';
import {
  getWalletBalancesByPurpose,
  requireBankAccountId,
} from './bankAccountService.js';
import { debitWallet, ensureWallet } from './walletService.js';

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

/**
 * Manager IPO profit lives in MANAGER-purpose bank accounts.
 * Provider principal lives in PROVIDER-purpose accounts (main wallet).
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

  const [[wd]] = await conn.query(
    `SELECT COALESCE(SUM(-amount), 0) AS total
     FROM wallet_transactions
     WHERE tenant_id = ? AND type = 'PERSONAL_OUT'`,
    [tenantId]
  );

  const [[prov]] = await conn.query(
    `SELECT COALESCE(SUM(provider_profit), 0) AS total
     FROM provider_transactions
     WHERE tenant_id = ?`,
    [tenantId]
  );

  const balances = await getWalletBalancesByPurpose(conn, tenantId);
  const totalManagerShare = round2(mgr?.total);
  const personalWithdrawn = round2(wd?.total);
  const providerAccruedProfit = round2(Math.max(0, Number(prov?.total || 0)));
  const availableManagerProfit = round2(Math.max(0, totalManagerShare - personalWithdrawn));
  const managerBalance = balances.managerBalance;
  const providerBalance = balances.providerBalance;
  const walletBalance = balances.totalBalance;

  // Can only withdraw what is both earned and sitting in the manager profit wallet
  const maxWithdraw = round2(Math.min(managerBalance, availableManagerProfit));

  return {
    totalManagerShare,
    personalWithdrawn,
    availableManagerProfit,
    providerAccruedProfit,
    managerBalance,
    providerBalance,
    walletExcludingProviderProfit: managerBalance,
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

  const summary = await getManagerProfitSummary(conn, tenantId, { skipEnsureWallet: true });
  const withdrawAmount = parseAmount(amount, {
    allowNegative: false,
    allowZero: false,
    fieldName: 'personal withdrawal amount',
  });

  if (summary.availableManagerProfit <= 0) {
    throw new AppError(
      'No manager IPO profit left to withdraw. Run Profit Sharing on allotted IPOs first, then receive member returns.'
    );
  }

  if (summary.maxWithdraw <= 0) {
    throw new AppError(
      summary.managerBalance <= 0
        ? 'Manager profit wallet is empty. Receive allotted IPO returns so manager share credits the Manager Profit wallet.'
        : 'No withdrawable manager profit right now.'
    );
  }

  if (withdrawAmount > summary.maxWithdraw + 0.001) {
    throw new AppError(
      `Cannot withdraw more than manager profit wallet. Max: ₹${summary.maxWithdraw.toLocaleString('en-IN')} ` +
        `(manager profit ₹${summary.availableManagerProfit.toLocaleString('en-IN')}, ` +
        `manager wallet ₹${summary.managerBalance.toLocaleString('en-IN')})`
    );
  }

  const resolvedAccountId = await requireBankAccountId(conn, tenantId, bankAccountId, {
    purpose: 'MANAGER',
  });

  const baseNote = notes?.trim() || 'Personal use';
  const newBalance = await debitWallet(conn, {
    tenantId,
    amount: withdrawAmount,
    bankAccountId: resolvedAccountId,
    type: 'PERSONAL_OUT',
    refType: 'personal_withdraw',
    refId: null,
    txnDate: parseDate(txnDate, 'transaction date'),
    notes: `${baseNote} (manager profit wallet)`,
    userId,
    purpose: 'MANAGER',
  });

  const updated = await getManagerProfitSummary(conn, tenantId, { skipEnsureWallet: true });
  return {
    withdrawn: withdrawAmount,
    newBalance,
    ...updated,
  };
}
