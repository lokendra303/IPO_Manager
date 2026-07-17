import { AppError } from '../middleware/errorHandler.js';
import { parseAmount } from '../utils/validate.js';
import { requireBankAccountId, syncOwnerWalletTotal } from './bankAccountService.js';
import { creditWallet, ensureWallet } from './walletService.js';

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
  const defaultReceiveAmount = app.withdrawal_money != null ? app.withdrawal_money : app.amount;
  const recvAmount = amount !== undefined
    ? parseAmount(amount, { fieldName: 'receive amount' })
    : parseAmount(defaultReceiveAmount, { fieldName: 'receive amount' });

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
      [app.member_id, tenantId, recvAmount, now, appId, ledgerNotes]
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
      amount: recvAmount,
      bankAccountId,
      type: 'RETURN_IN',
      refType: 'ipo_application',
      refId: appId,
      txnDate: now,
      notes: notes || `Return from ${app.ipo_name}`,
      userId,
    });
  }

  return { appId, memberId: app.member_id, amount: recvAmount };
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

  const defaultReceiveAmount = app.withdrawal_money != null ? app.withdrawal_money : app.amount;
  const recvAmount = parseAmount(defaultReceiveAmount, { fieldName: 'receive amount' });
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
      [app.member_id, tenantId, recvAmount, now, appId, ledgerNotes]
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
      amount: recvAmount,
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

  return { appId, memberId: app.member_id, amount: recvAmount };
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
