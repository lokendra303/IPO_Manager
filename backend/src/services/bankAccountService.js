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

async function hasProviderLinkDrift(conn, tenantId) {
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
  return providerDrift.length > 0;
}

/** Compare stored bank balance vs sum(wallet_transactions) — optional account scope. */
async function hasAccountBalanceDrift(conn, tenantId, bankAccountIds = null) {
  const params = [tenantId, tenantId];
  let accountFilter = '';
  if (bankAccountIds?.length) {
    const placeholders = bankAccountIds.map(() => '?').join(',');
    accountFilter = ` AND mba.id IN (${placeholders})`;
    params.push(...bankAccountIds);
  }

  const [accountDrift] = await conn.query(
    `SELECT mba.id
     FROM manager_bank_accounts mba
     LEFT JOIN (
       SELECT bank_account_id, COALESCE(SUM(amount), 0) AS ledger_total
       FROM wallet_transactions
       WHERE tenant_id = ?
       GROUP BY bank_account_id
     ) wt ON wt.bank_account_id = mba.id
     WHERE mba.tenant_id = ?${accountFilter}
       AND ABS(mba.balance - COALESCE(wt.ledger_total, 0)) > 0.001
     LIMIT 1`,
    params
  );
  return accountDrift.length > 0;
}

/** Replay wallet_transactions to fix bank balances and balance_after chain. */
export async function reconcileBalancesFromLedger(conn, tenantId, bankAccountIds = null) {
  await syncProviderLinkedWalletTransactions(conn, tenantId);

  let accountRows;
  if (bankAccountIds?.length) {
    const placeholders = bankAccountIds.map(() => '?').join(',');
    const [rows] = await conn.query(
      `SELECT id FROM manager_bank_accounts WHERE tenant_id = ? AND id IN (${placeholders})`,
      [tenantId, ...bankAccountIds]
    );
    accountRows = rows;
  } else {
    const [rows] = await conn.query(
      'SELECT id FROM manager_bank_accounts WHERE tenant_id = ?',
      [tenantId]
    );
    accountRows = rows;
  }

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

export async function listBankAccounts(conn, tenantId, { activeOnly = true, purpose = null } = {}) {
  let query = `SELECT id, tenant_id, label, bank_name, account_number, is_active, is_default, purpose, balance, sort_order
     FROM manager_bank_accounts WHERE tenant_id = ?`;
  const params = [tenantId];
  if (activeOnly) {
    query += ' AND is_active = 1';
  }
  if (purpose) {
    query += ' AND purpose = ?';
    params.push(purpose);
  }
  query += ' ORDER BY FIELD(purpose, \'PROVIDER\', \'MANAGER\'), sort_order, id';
  const [rows] = await conn.query(query, params);
  return rows.map((r) => ({
    ...r,
    is_active: Boolean(r.is_active),
    is_default: Boolean(r.is_default),
    purpose: r.purpose || 'PROVIDER',
    balance: Number(r.balance),
  }));
}

export async function getBankAccount(conn, tenantId, accountId) {
  const id = parsePositiveInt(accountId, 'bank account id');
  const [rows] = await conn.query(
    `SELECT id, tenant_id, label, bank_name, account_number, is_active, is_default, purpose, balance, sort_order
     FROM manager_bank_accounts WHERE id = ? AND tenant_id = ?`,
    [id, tenantId]
  );
  if (!rows.length) throw new AppError('Bank account not found', 404);
  const r = rows[0];
  return {
    ...r,
    is_active: Boolean(r.is_active),
    is_default: Boolean(r.is_default),
    purpose: r.purpose || 'PROVIDER',
    balance: Number(r.balance),
  };
}

export async function getWalletBalancesByPurpose(conn, tenantId) {
  const [rows] = await conn.query(
    `SELECT
       COALESCE(SUM(CASE WHEN purpose = 'MANAGER' THEN balance ELSE 0 END), 0) AS manager_balance,
       COALESCE(SUM(CASE WHEN purpose = 'MANAGER' THEN 0 ELSE balance END), 0) AS provider_balance
     FROM manager_bank_accounts
     WHERE tenant_id = ? AND is_active = 1`,
    [tenantId]
  );
  const providerBalance = Number(rows[0]?.provider_balance ?? 0);
  const managerBalance = Number(rows[0]?.manager_balance ?? 0);
  return {
    providerBalance: Math.round(providerBalance * 100) / 100,
    managerBalance: Math.round(managerBalance * 100) / 100,
    totalBalance: Math.round((providerBalance + managerBalance) * 100) / 100,
  };
}

/** Ensure a Manager Profit account exists; returns its id. */
export async function ensureManagerProfitAccount(conn, tenantId) {
  const [existing] = await conn.query(
    `SELECT id FROM manager_bank_accounts
     WHERE tenant_id = ? AND purpose = 'MANAGER' AND is_active = 1
     ORDER BY id LIMIT 1`,
    [tenantId]
  );
  if (existing.length) return existing[0].id;

  const [result] = await conn.query(
    `INSERT INTO manager_bank_accounts
     (tenant_id, label, bank_name, is_default, is_active, purpose, balance, sort_order)
     VALUES (?, 'Manager Profit', NULL, 0, 1, 'MANAGER', 0, 100)`,
    [tenantId]
  );
  return result.insertId;
}

/**
 * Sum bank balances into owner_wallets after ledger verification.
 * - fullVerify: scan all accounts + provider links (Wallet page, admin repair).
 * - bankAccountIds: scan only those accounts (+ provider links); use after RETURN_IN / credits.
 */
export async function syncOwnerWalletTotal(conn, tenantId, { bankAccountIds = null, fullVerify = false } = {}) {
  const scope = fullVerify ? null : bankAccountIds;

  if (await hasProviderLinkDrift(conn, tenantId)) {
    await syncProviderLinkedWalletTransactions(conn, tenantId);
  }

  if (await hasAccountBalanceDrift(conn, tenantId, scope)) {
    await reconcileBalancesFromLedger(conn, tenantId, scope);
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

/** Full ledger replay for all accounts (manual DB fixes, scripts). */
export async function reconcileOwnerWallet(conn, tenantId) {
  return syncOwnerWalletTotal(conn, tenantId, { fullVerify: true });
}

/**
 * Resolve bank account: explicit id, sole active account of purpose, default, or first.
 * @param {{ purpose?: 'PROVIDER'|'MANAGER' }} opts
 */
export async function requireBankAccountId(conn, tenantId, bankAccountId, { purpose = 'PROVIDER' } = {}) {
  if (bankAccountId != null && bankAccountId !== '') {
    const account = await getBankAccount(conn, tenantId, bankAccountId);
    if (!account.is_active) throw new AppError('Bank account is inactive');
    if (purpose && account.purpose !== purpose) {
      throw new AppError(
        purpose === 'MANAGER'
          ? `Account "${account.label}" is for provider funds. Choose a Manager Profit account.`
          : `Account "${account.label}" is for manager profit. Choose a provider wallet account.`
      );
    }
    return account.id;
  }

  if (purpose === 'MANAGER') {
    return ensureManagerProfitAccount(conn, tenantId);
  }

  const accounts = await listBankAccounts(conn, tenantId, {
    activeOnly: true,
    purpose: purpose || 'PROVIDER',
  });
  if (!accounts.length) {
    throw new AppError(
      purpose === 'MANAGER'
        ? 'Add a Manager Profit account under Wallet first'
        : 'Add at least one provider bank account under Wallet before recording funds'
    );
  }
  if (accounts.length === 1) {
    return accounts[0].id;
  }

  const defaults = accounts.filter((a) => a.is_default);
  if (defaults.length === 1) {
    return defaults[0].id;
  }

  return accounts[0].id;
}

export async function assertAccountAllocations(
  conn,
  tenantId,
  allocations,
  totalRequired,
  actionLabel = 'allocation',
  { purpose = null } = {}
) {
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
    if (purpose && account.purpose !== purpose) {
      throw new AppError(
        `Account "${account.label}" cannot be used for ${actionLabel} (wrong wallet type)`
      );
    }
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
  return assertAccountAllocations(conn, tenantId, debits, totalRequired, 'payment', {
    purpose: 'PROVIDER',
  });
}
