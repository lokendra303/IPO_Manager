import { AppError } from '../middleware/errorHandler.js';
import { parsePositiveInt } from '../utils/validate.js';

export async function listBankAccounts(conn, tenantId, { activeOnly = true } = {}) {
  let query = `SELECT id, tenant_id, label, bank_name, account_number, is_active, balance, sort_order
     FROM manager_bank_accounts WHERE tenant_id = ?`;
  const params = [tenantId];
  if (activeOnly) {
    query += ' AND is_active = 1';
  }
  query += ' ORDER BY sort_order, id';
  const [rows] = await conn.query(query, params);
  return rows.map((r) => ({
    ...r,
    is_active: Boolean(r.is_active),
    balance: Number(r.balance),
  }));
}

export async function getBankAccount(conn, tenantId, accountId) {
  const id = parsePositiveInt(accountId, 'bank account id');
  const [rows] = await conn.query(
    `SELECT id, tenant_id, label, bank_name, account_number, is_active, balance, sort_order
     FROM manager_bank_accounts WHERE id = ? AND tenant_id = ?`,
    [id, tenantId]
  );
  if (!rows.length) throw new AppError('Bank account not found', 404);
  const r = rows[0];
  return {
    ...r,
    is_active: Boolean(r.is_active),
    balance: Number(r.balance),
  };
}

export async function syncOwnerWalletTotal(conn, tenantId) {
  const [sumRows] = await conn.query(
    `SELECT COALESCE(SUM(balance), 0) as total
     FROM manager_bank_accounts WHERE tenant_id = ? AND is_active = 1`,
    [tenantId]
  );
  const total = Number(sumRows[0]?.total ?? 0);
  await conn.query(
    'UPDATE owner_wallets SET balance = ? WHERE tenant_id = ?',
    [total, tenantId]
  );
  return total;
}

/** Manager must pick an account when several exist; only one active account can be implied. */
export async function requireBankAccountId(conn, tenantId, bankAccountId) {
  if (bankAccountId != null && bankAccountId !== '') {
    const account = await getBankAccount(conn, tenantId, bankAccountId);
    if (!account.is_active) throw new AppError('Bank account is inactive');
    return account.id;
  }

  const accounts = await listBankAccounts(conn, tenantId, { activeOnly: true });
  if (!accounts.length) {
    throw new AppError('Add at least one bank account under Wallet before recording funds');
  }
  if (accounts.length === 1) {
    return accounts[0].id;
  }
  throw new AppError('Select which bank account to use');
}

export async function assertAccountAllocations(conn, tenantId, allocations, totalRequired, actionLabel = 'allocation') {
  if (!allocations?.length) {
    throw new AppError(`Select at least one bank account for ${actionLabel}`);
  }
  let sum = 0;
  const normalized = [];
  for (const d of allocations) {
    const accountId = parsePositiveInt(d.bankAccountId, 'bank account id');
    const amount = Number(d.amount);
    if (Number.isNaN(amount) || amount <= 0) {
      throw new AppError(`Each account ${actionLabel} must be a positive amount`);
    }
    const account = await getBankAccount(conn, tenantId, accountId);
    if (!account.is_active) throw new AppError(`Account "${account.label}" is inactive`);
    sum += amount;
    normalized.push({ bankAccountId: accountId, amount, label: account.label });
  }
  const required = Math.round(totalRequired * 100) / 100;
  const allocSum = Math.round(sum * 100) / 100;
  if (allocSum !== required) {
    throw new AppError(`Account amounts (₹${allocSum}) must equal total (₹${required})`);
  }
  return normalized;
}

/** @deprecated Use assertAccountAllocations */
export async function assertAccountDebits(conn, tenantId, debits, totalRequired) {
  return assertAccountAllocations(conn, tenantId, debits, totalRequired, 'payment');
}
