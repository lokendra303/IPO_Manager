import { AppError } from '../middleware/errorHandler.js';
import { parseAmount } from '../utils/validate.js';
import { requireBankAccountId, syncOwnerWalletTotal } from './bankAccountService.js';
import { resolveApplicationProfitSplit } from './profitShareService.js';
import { creditWallet, ensureWallet } from './walletService.js';

async function getManagerShareAlreadyInWallet(conn, tenantId, applicationId) {
  const [rows] = await conn.query(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM wallet_transactions
     WHERE tenant_id = ? AND ref_type = 'profit_share' AND ref_id = ?`,
    [tenantId, applicationId]
  );
  return Number(rows[0]?.total ?? 0);
}

/**
 * Member ledger: distributed principal only (matches GIVEN). Member profit was already
 * kept by the member when P&L was split — it must not inflate RECEIVED or reduce pending return.
 * Wallet: withdrawal minus member profit (principal + manager + provider shares).
 * If manager share was already credited via old profit-share wallet entries, subtract that too.
 */
async function resolveReceiveAmounts(conn, tenantId, app, explicitAmount) {
  const distributedAmount = parseAmount(app.amount, { fieldName: 'distributed amount' });
  const withdrawalAmount =
    app.withdrawal_money != null
      ? parseAmount(app.withdrawal_money, { fieldName: 'withdrawal amount' })
      : distributedAmount;

  if (explicitAmount !== undefined) {
    const explicit = parseAmount(explicitAmount, { fieldName: 'receive amount' });
    return {
      ledgerAmount: explicit,
      walletAmount: explicit,
      managerShare: 0,
      providerShare: 0,
      memberShareExcluded: 0,
    };
  }

  const { managerAmount, providerAmount, memberAmount } = await resolveApplicationProfitSplit(
    conn,
    tenantId,
    app
  );

  const managerAlreadyInWallet = await getManagerShareAlreadyInWallet(conn, tenantId, app.id);

  // Wallet = cash returned to team = withdrawal − member profit (− legacy manager wallet credits)
  const walletAmount = Math.round(
    (withdrawalAmount - memberAmount - managerAlreadyInWallet) * 100
  ) / 100;

  return {
    ledgerAmount: distributedAmount,
    walletAmount,
    managerShare: Math.round((managerAmount - managerAlreadyInWallet) * 100) / 100,
    providerShare: providerAmount,
    memberShareExcluded: memberAmount,
  };
}

export async function receiveIpoApplication(conn, {
  tenantId,
  appId,
  returnToWallet = true,
  bankAccountId,
  amount,
  notes,
  userId,
}) {
  const [apps] = await conn.query(
    `SELECT a.*, i.name as ipo_name FROM ipo_applications a
     JOIN ipos i ON i.id = a.ipo_id
     WHERE a.id = ? AND a.tenant_id = ?`,
    [appId, tenantId]
  );

  if (!apps.length) throw new AppError('Application not found', 404);

  const app = apps[0];
  const amounts = await resolveReceiveAmounts(conn, tenantId, app, amount);

  const now = new Date();
  const ledgerNotes = notes || `Return: ${app.ipo_name}`;

  const [existingLedger] = await conn.query(
    `SELECT id FROM member_ledger_entries WHERE ipo_application_id = ? AND type = 'RECEIVED'`,
    [appId]
  );

  const [existingWalletReturn] = await conn.query(
    `SELECT id FROM wallet_transactions
     WHERE tenant_id = ? AND type = 'RETURN_IN' AND ref_type = 'ipo_application' AND ref_id = ?`,
    [tenantId, appId]
  );

  if (existingLedger.length && existingWalletReturn.length) {
    throw new AppError('This application is already fully settled');
  }

  if (!existingLedger.length) {
    await conn.query(
      `UPDATE ipo_applications SET date_received = COALESCE(date_received, ?), trns_received = 'Received' WHERE id = ?`,
      [now, appId]
    );

    await conn.query(
      `INSERT INTO member_ledger_entries (member_id, tenant_id, type, amount, txn_date, ipo_application_id, notes)
       VALUES (?, ?, 'RECEIVED', ?, ?, ?, ?)`,
      [app.member_id, tenantId, amounts.ledgerAmount, now, appId, ledgerNotes]
    );
  } else if (app.trns_received !== 'Received') {
    await conn.query(
      `UPDATE ipo_applications SET date_received = ?, trns_received = 'Received' WHERE id = ?`,
      [now, appId]
    );
  }

  if (returnToWallet) {
    if (existingWalletReturn.length) {
      throw new AppError('Funds were already returned to wallet for this application');
    }

    await creditWallet(conn, {
      tenantId,
      amount: amounts.walletAmount,
      bankAccountId,
      type: 'RETURN_IN',
      refType: 'ipo_application',
      refId: appId,
      txnDate: now,
      notes: notes || `Return from ${app.ipo_name}`,
      userId,
    });
  }

  return {
    appId,
    memberId: app.member_id,
    amount: amounts.ledgerAmount,
    walletAmount: amounts.walletAmount,
    managerShare: amounts.managerShare,
    providerShare: amounts.providerShare,
    memberShareExcluded: amounts.memberShareExcluded,
  };
}

async function receiveOneFromCache(conn, {
  tenantId,
  appId,
  app,
  hasLedger,
  hasWalletReturn,
  returnToWallet,
  resolvedBankAccountId,
  notes,
  userId,
}) {
  if (!app) throw new AppError('Application not found', 404);

  const amounts = await resolveReceiveAmounts(conn, tenantId, app);
  const now = new Date();
  const ledgerNotes = notes || `Return: ${app.ipo_name}`;

  if (hasLedger && hasWalletReturn) {
    throw new AppError('This application is already fully settled');
  }

  if (!hasLedger) {
    await conn.query(
      `UPDATE ipo_applications SET date_received = COALESCE(date_received, ?), trns_received = 'Received' WHERE id = ?`,
      [now, appId]
    );

    await conn.query(
      `INSERT INTO member_ledger_entries (member_id, tenant_id, type, amount, txn_date, ipo_application_id, notes)
       VALUES (?, ?, 'RECEIVED', ?, ?, ?, ?)`,
      [app.member_id, tenantId, amounts.ledgerAmount, now, appId, ledgerNotes]
    );
  } else if (app.trns_received !== 'Received') {
    await conn.query(
      `UPDATE ipo_applications SET date_received = ?, trns_received = 'Received' WHERE id = ?`,
      [now, appId]
    );
  }

  if (returnToWallet) {
    if (hasWalletReturn) {
      throw new AppError('Funds were already returned to wallet for this application');
    }

    await creditWallet(conn, {
      tenantId,
      amount: amounts.walletAmount,
      bankAccountId: resolvedBankAccountId,
      type: 'RETURN_IN',
      refType: 'ipo_application',
      refId: appId,
      txnDate: now,
      notes: notes || `Return from ${app.ipo_name}`,
      userId,
      skipEnsureWallet: true,
      skipSync: true,
      resolvedBankAccountId,
    });
  }

  return {
    appId,
    memberId: app.member_id,
    amount: amounts.ledgerAmount,
    walletAmount: amounts.walletAmount,
    managerShare: amounts.managerShare,
    providerShare: amounts.providerShare,
    memberShareExcluded: amounts.memberShareExcluded,
  };
}

export async function receiveIpoApplicationsBulk(conn, {
  tenantId,
  applicationIds,
  returnToWallet = true,
  bankAccountId,
  notes,
  userId,
}) {
  const ids = [...new Set(applicationIds.map((rawId) => Number(rawId)).filter((id) => id > 0))];
  if (!ids.length) {
    throw new AppError('Select at least one application to receive');
  }

  const placeholders = ids.map(() => '?').join(',');

  const [apps] = await conn.query(
    `SELECT a.*, i.name as ipo_name FROM ipo_applications a
     JOIN ipos i ON i.id = a.ipo_id
     WHERE a.id IN (${placeholders}) AND a.tenant_id = ?`,
    [...ids, tenantId]
  );
  const appById = new Map(apps.map((row) => [row.id, row]));

  const [existingLedger] = await conn.query(
    `SELECT ipo_application_id FROM member_ledger_entries
     WHERE ipo_application_id IN (${placeholders}) AND type = 'RECEIVED'`,
    ids
  );
  const ledgerSet = new Set(existingLedger.map((row) => row.ipo_application_id));

  const [existingWalletReturn] = await conn.query(
    `SELECT ref_id FROM wallet_transactions
     WHERE tenant_id = ? AND type = 'RETURN_IN' AND ref_type = 'ipo_application'
       AND ref_id IN (${placeholders})`,
    [tenantId, ...ids]
  );
  const walletReturnSet = new Set(existingWalletReturn.map((row) => row.ref_id));

  let resolvedBankAccountId = null;
  if (returnToWallet) {
    await ensureWallet(conn, tenantId);
    resolvedBankAccountId = await requireBankAccountId(conn, tenantId, bankAccountId);
  }

  const results = [];
  const failed = [];

  for (const rawId of applicationIds) {
    const appId = Number(rawId);
    try {
      const result = await receiveOneFromCache(conn, {
        tenantId,
        appId,
        app: appById.get(appId),
        hasLedger: ledgerSet.has(appId),
        hasWalletReturn: walletReturnSet.has(appId),
        returnToWallet,
        resolvedBankAccountId,
        notes,
        userId,
      });
      ledgerSet.add(appId);
      if (returnToWallet) walletReturnSet.add(appId);
      results.push(result);
    } catch (err) {
      failed.push({ appId, error: err.message || 'Failed to receive' });
    }
  }

  if (returnToWallet && results.length) {
    await syncOwnerWalletTotal(conn, tenantId);
  }

  if (!results.length && failed.length) {
    throw new AppError(failed[0].error || 'No applications could be received');
  }

  return { received: results, failed, receivedCount: results.length };
}
