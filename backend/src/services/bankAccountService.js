import { AppError } from '../middleware/errorHandler.js';
import { parsePositiveInt } from '../utils/validate.js';

/** Align linked wallet_transactions with provider_transactions after manual DB edits. */
async function syncProviderLinkedWalletTransactions(conn, tenantId) {
  const [rows] = await conn.query(
    `SELECT pt.id, pt.amount,
            COALESCE(SUM(wt.amount), 0) AS wallet_total,
            COUNT(wt.id) AS wallet_count
     FROM provider_transactions pt
     LEFT JOIN wallet_transactions wt
       ON wt.tenant_id = pt.tenant_id
      AND wt.ref_type = 'provider_transaction'
      AND wt.ref_id = pt.id
     WHERE pt.tenant_id = ?
     GROUP BY pt.id, pt.amount
     HAVING wallet_count > 0 AND ABS(pt.amount - wallet_total) > 0.001`,
    [tenantId]
  );

  for (const row of rows) {
    const targetTotal = Number(row.amount);
    const [walletTxns] = await conn.query(
      `SELECT id, amount FROM wallet_transactions
       WHERE tenant_id = ? AND ref_type = 'provider_transaction' AND ref_id = ?
       ORDER BY id`,
      [tenantId, row.id]
    );

    if (walletTxns.length === 1) {
      await conn.query(
        'UPDATE wallet_transactions SET amount = ? WHERE id = ?',
        [targetTotal, walletTxns[0].id]
      );
      continue;
    }

    const oldTotal = walletTxns.reduce((s, t) => s + Number(t.amount), 0);
    if (oldTotal === 0) continue;

    let assigned = 0;
    for (let i = 0; i < walletTxns.length; i++) {
      let newAmt;
      if (i === walletTxns.length - 1) {
        newAmt = Math.round((targetTotal - assigned) * 100) / 100;
      } else {
        newAmt = Math.round((Number(walletTxns[i].amount) / oldTotal) * targetTotal * 100) / 100;
        assigned += newAmt;
      }
      await conn.query(
        'UPDATE wallet_transactions SET amount = ? WHERE id = ?',
        [newAmt, walletTxns[i].id]
      );
    }
  }
}

async function hasBalanceDrift(conn, tenantId) {
  const [providerDrift] = await conn.query(
    `SELECT pt.id
     FROM provider_transactions pt
     LEFT JOIN wallet_transactions wt
       ON wt.tenant_id = pt.tenant_id
      AND wt.ref_type = 'provider_transaction'
      AND wt.ref_id = pt.id
     WHERE pt.tenant_id = ?
     GROUP BY pt.id, pt.amount
     HAVING COUNT(wt.id) > 0 AND ABS(pt.amount - COALESCE(SUM(wt.amount), 0)) > 0.001
     LIMIT 1`,
    [tenantId]
  );
  if (providerDrift.length) return true;

  const [accountDrift] = await conn.query(
    `SELECT mba.id
     FROM manager_bank_accounts mba
     LEFT JOIN (
       SELECT bank_account_id, COALESCE(SUM(amount), 0) AS ledger_total
       FROM wallet_transactions
       WHERE tenant_id = ?
       GROUP BY bank_account_id
     ) wt ON wt.bank_account_id = mba.id
     WHERE mba.tenant_id = ?
       AND ABS(mba.balance - COALESCE(wt.ledger_total, 0)) > 0.001
     LIMIT 1`,
    [tenantId, tenantId]
  );
  return accountDrift.length > 0;
}

/** Replay wallet_transactions to fix bank balances and balance_after chain. */
export async function reconcileBalancesFromLedger(conn, tenantId) {
  await syncProviderLinkedWalletTransactions(conn, tenantId);

  const [accountRows] = await conn.query(
    'SELECT id FROM manager_bank_accounts WHERE tenant_id = ?',
    [tenantId]
  );

  for (const { id: bankAccountId } of accountRows) {
    const [txns] = await conn.query(
      `SELECT id, amount FROM wallet_transactions
       WHERE tenant_id = ? AND bank_account_id = ?
       ORDER BY txn_date ASC, id ASC`,
      [tenantId, bankAccountId]
    );

    let running = 0;
    for (const txn of txns) {
      running = Math.round((running + Number(txn.amount)) * 100) / 100;
      await conn.query(
        'UPDATE wallet_transactions SET balance_after = ? WHERE id = ?',
        [running, txn.id]
      );
    }

    await conn.query(
      'UPDATE manager_bank_accounts SET balance = ? WHERE id = ? AND tenant_id = ?',
      [running, bankAccountId, tenantId]
    );
  }
}

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
  if (await hasBalanceDrift(conn, tenantId)) {
    await reconcileBalancesFromLedger(conn, tenantId);
  }

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
