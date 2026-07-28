import { AppError } from '../middleware/errorHandler.js';
import { parseAmount, parsePositiveInt, parseDate, toSqlDateTime } from '../utils/validate.js';
import {
  requireBankAccountId,
  syncOwnerWalletTotal,
  assertAccountAllocations,
  getBankAccount,
} from './bankAccountService.js';

export async function getWallet(conn, tenantId) {
  const total = await syncOwnerWalletTotal(conn, tenantId, { fullVerify: true });
  return { balance: total };
}

export async function ensureWallet(conn, tenantId) {
  const [rows] = await conn.query(
    'SELECT id, balance FROM owner_wallets WHERE tenant_id = ?',
    [tenantId]
  );
  if (!rows.length) {
    await conn.query(
      'INSERT INTO owner_wallets (tenant_id, balance) VALUES (?, 0)',
      [tenantId]
    );
    const total = await syncOwnerWalletTotal(conn, tenantId, { fullVerify: true });
    return { id: null, balance: total };
  }
  return { id: rows[0].id, balance: Number(rows[0].balance) };
}

async function lockAccount(conn, tenantId, bankAccountId) {
  const [rows] = await conn.query(
    `SELECT id, label, balance FROM manager_bank_accounts
     WHERE id = ? AND tenant_id = ? AND is_active = 1 FOR UPDATE`,
    [bankAccountId, tenantId]
  );
  if (!rows.length) throw new AppError('Bank account not found or inactive', 404);
  return rows[0];
}

async function applyAccountDelta(conn, {
  tenantId,
  bankAccountId,
  delta,
  type,
  refType,
  refId,
  txnDate,
  notes,
  userId,
  allowNegativeBalance = false,
  skipSync = false,
}) {
  const change = Number(delta);
  if (Number.isNaN(change) || change === 0) {
    await ensureWallet(conn, tenantId);
    const [acc] = await conn.query(
      'SELECT balance FROM manager_bank_accounts WHERE id = ?',
      [bankAccountId]
    );
    return { accountBalance: Number(acc[0]?.balance ?? 0), totalBalance: await syncOwnerWalletTotal(conn, tenantId, { bankAccountIds: [bankAccountId] }) };
  }

  const account = await lockAccount(conn, tenantId, bankAccountId);
  const newAccountBalance = Math.round((Number(account.balance) + change) * 100) / 100;
  if (!allowNegativeBalance && newAccountBalance < 0) {
    throw new AppError(
      `Insufficient balance in ${account.label}. Available: ₹${account.balance}, needed: ₹${Math.abs(change)}`
    );
  }

  await conn.query(
    'UPDATE manager_bank_accounts SET balance = ? WHERE id = ?',
    [newAccountBalance, bankAccountId]
  );

  const totalBalance = skipSync
    ? null
    : await syncOwnerWalletTotal(conn, tenantId, { bankAccountIds: [bankAccountId] });

  const txnDateSql = toSqlDateTime(txnDate ?? new Date(), 'transaction date');

  await conn.query(
    `INSERT INTO wallet_transactions
     (tenant_id, bank_account_id, type, amount, balance_after, ref_type, ref_id, txn_date, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [tenantId, bankAccountId, type, change, newAccountBalance, refType, refId, txnDateSql, notes, userId]
  );

  return { accountBalance: newAccountBalance, totalBalance, accountLabel: account.label };
}

export async function creditWallet(conn, {
  tenantId,
  amount,
  bankAccountId,
  type,
  refType,
  refId,
  txnDate,
  notes,
  userId,
  skipEnsureWallet = false,
  skipSync = false,
  resolvedBankAccountId = null,
}) {
  const credit = parseAmount(amount, { allowNegative: false, allowZero: false, fieldName: 'credit amount' });
  if (!skipEnsureWallet) {
    await ensureWallet(conn, tenantId);
  }
  const accountId = resolvedBankAccountId ?? await requireBankAccountId(conn, tenantId, bankAccountId);
  const result = await applyAccountDelta(conn, {
    tenantId,
    bankAccountId: accountId,
    delta: credit,
    type,
    refType,
    refId,
    txnDate,
    notes,
    userId,
    skipSync,
  });
  return result.totalBalance;
}

export async function debitWallet(conn, {
  tenantId,
  amount,
  bankAccountId,
  type,
  refType,
  refId,
  txnDate,
  notes,
  userId,
}) {
  const debit = parseAmount(amount, { allowNegative: false, allowZero: false, fieldName: 'debit amount' });
  await ensureWallet(conn, tenantId);
  const accountId = await requireBankAccountId(conn, tenantId, bankAccountId);
  const result = await applyAccountDelta(conn, {
    tenantId,
    bankAccountId: accountId,
    delta: -debit,
    type,
    refType,
    refId,
    txnDate,
    notes,
    userId,
  });
  return result.totalBalance;
}

/** Debit from one or more bank accounts (amounts must sum to total). */
export async function debitWalletFromAccounts(conn, {
  tenantId,
  debits,
  type,
  refType,
  refId,
  txnDate,
  notes,
  userId,
}) {
  await ensureWallet(conn, tenantId);
  const total = debits.reduce((s, d) => s + d.amount, 0);
  const normalized = await assertAccountAllocations(conn, tenantId, debits, total, 'payment');

  for (let i = 0; i < normalized.length; i++) {
    const { bankAccountId, amount, label } = normalized[i];
    const partNotes =
      normalized.length > 1
        ? `${notes || ''} (${label}: ₹${amount})`.trim()
        : notes;
    await applyAccountDelta(conn, {
      tenantId,
      bankAccountId,
      delta: -amount,
      type,
      refType,
      refId,
      txnDate,
      notes: partNotes,
      userId,
    });
  }

  const touchedIds = [...new Set(normalized.map((n) => n.bankAccountId))];
  return syncOwnerWalletTotal(conn, tenantId, { bankAccountIds: touchedIds });
}

/** Credit to one or more bank accounts (amounts must sum to total). */
export async function creditWalletFromAccounts(conn, {
  tenantId,
  credits,
  type,
  refType,
  refId,
  txnDate,
  notes,
  userId,
}) {
  await ensureWallet(conn, tenantId);
  const total = credits.reduce((s, c) => s + c.amount, 0);
  const normalized = await assertAccountAllocations(conn, tenantId, credits, total, 'deposit');

  for (const { bankAccountId, amount, label } of normalized) {
    const partNotes =
      normalized.length > 1
        ? `${notes || ''} (${label}: ₹${amount})`.trim()
        : notes;
    await applyAccountDelta(conn, {
      tenantId,
      bankAccountId,
      delta: amount,
      type,
      refType,
      refId,
      txnDate,
      notes: partNotes,
      userId,
    });
  }

  const touchedIds = [...new Set(normalized.map((n) => n.bankAccountId))];
  return syncOwnerWalletTotal(conn, tenantId, { bankAccountIds: touchedIds });
}

/** Signed balance change (positive = credit, negative = debit). Used for P&L loss shares. */
export async function applyWalletDelta(conn, {
  tenantId,
  delta,
  bankAccountId,
  type,
  refType,
  refId,
  txnDate,
  notes,
  userId,
  allowNegativeBalance = false,
}) {
  await ensureWallet(conn, tenantId);
  const accountId = await requireBankAccountId(conn, tenantId, bankAccountId);
  const result = await applyAccountDelta(conn, {
    tenantId,
    bankAccountId: accountId,
    delta,
    type,
    refType,
    refId,
    txnDate,
    notes,
    userId,
    allowNegativeBalance,
  });
  return result.totalBalance;
}

/** Move funds between manager bank accounts (total wallet unchanged). */
export async function transferBetweenBankAccounts(conn, {
  tenantId,
  fromBankAccountId,
  toBankAccountId,
  amount,
  txnDate,
  notes,
  userId,
}) {
  const fromId = parsePositiveInt(fromBankAccountId, 'from bank account');
  const toId = parsePositiveInt(toBankAccountId, 'to bank account');
  if (fromId === toId) {
    throw new AppError('Choose two different accounts for a transfer');
  }

  const transferAmount = parseAmount(amount, {
    allowNegative: false,
    allowZero: false,
    fieldName: 'transfer amount',
  });
  const txnDateVal = txnDate instanceof Date ? txnDate : txnDate ? parseDate(txnDate, 'transfer date') : new Date();

  await ensureWallet(conn, tenantId);
  const fromAccount = await getBankAccount(conn, tenantId, fromId);
  const toAccount = await getBankAccount(conn, tenantId, toId);
  if (!fromAccount.is_active || !toAccount.is_active) {
    throw new AppError('Both accounts must be active');
  }
  if (Number(fromAccount.balance) < transferAmount) {
    throw new AppError(
      `Insufficient balance in ${fromAccount.label}. Available: ₹${fromAccount.balance}`
    );
  }

  const [firstId, secondId] = fromId < toId ? [fromId, toId] : [toId, fromId];
  await lockAccount(conn, tenantId, firstId);
  await lockAccount(conn, tenantId, secondId);

  const [transferResult] = await conn.query(
    `INSERT INTO bank_account_transfers
     (tenant_id, from_bank_account_id, to_bank_account_id, amount, txn_date, notes, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [tenantId, fromId, toId, transferAmount, txnDateVal, notes?.trim() || null, userId]
  );
  const transferId = transferResult.insertId;

  const baseNote = notes?.trim() || 'Self transfer';
  await applyAccountDelta(conn, {
    tenantId,
    bankAccountId: fromId,
    delta: -transferAmount,
    type: 'TRANSFER_OUT',
    refType: 'bank_transfer',
    refId: transferId,
    txnDate: txnDateVal,
    notes: `${baseNote} → ${toAccount.label}`,
    userId,
  });
  await applyAccountDelta(conn, {
    tenantId,
    bankAccountId: toId,
    delta: transferAmount,
    type: 'TRANSFER_IN',
    refType: 'bank_transfer',
    refId: transferId,
    txnDate: txnDateVal,
    notes: `${baseNote} ← ${fromAccount.label}`,
    userId,
  });

  const totalBalance = await syncOwnerWalletTotal(conn, tenantId, { bankAccountIds: [fromId, toId] });
  return {
    transferId,
    amount: transferAmount,
    fromAccount: { id: fromId, label: fromAccount.label },
    toAccount: { id: toId, label: toAccount.label },
    totalBalance,
  };
}
