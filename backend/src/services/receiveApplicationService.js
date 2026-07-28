import { AppError } from '../middleware/errorHandler.js';
import { parseAmount } from '../utils/validate.js';
import { requireBankAccountId, syncOwnerWalletTotal } from './bankAccountService.js';
import { resolveApplicationProfitSplit, revokeProfitShareDistribution } from './profitShareService.js';
import { applyWalletDelta, creditWallet, ensureWallet } from './walletService.js';

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

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
function finalizeReceiveAmounts(app, explicitAmount, split, managerAlreadyInWallet) {
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

  const { managerAmount, providerAmount, memberAmount } = split;
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

async function resolveReceiveAmounts(conn, tenantId, app, explicitAmount) {
  if (explicitAmount !== undefined) {
    return finalizeReceiveAmounts(app, explicitAmount, null, 0);
  }

  const split = await resolveApplicationProfitSplit(conn, tenantId, app);
  const managerAlreadyInWallet = await getManagerShareAlreadyInWallet(conn, tenantId, app.id);
  return finalizeReceiveAmounts(app, undefined, split, managerAlreadyInWallet);
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

    await ensureWallet(conn, tenantId);
    const resolvedBankAccountId = await requireBankAccountId(conn, tenantId, bankAccountId);
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
      skipEnsureWallet: true,
      skipSync: true,
      resolvedBankAccountId,
    });
    await syncOwnerWalletTotal(conn, tenantId, { bankAccountIds: [resolvedBankAccountId] });
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
  amounts,
}) {
  if (!app) throw new AppError('Application not found', 404);

  const resolvedAmounts = amounts ?? await resolveReceiveAmounts(conn, tenantId, app);
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
      [app.member_id, tenantId, resolvedAmounts.ledgerAmount, now, appId, ledgerNotes]
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
      amount: resolvedAmounts.walletAmount,
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
    amount: resolvedAmounts.ledgerAmount,
    walletAmount: resolvedAmounts.walletAmount,
    managerShare: resolvedAmounts.managerShare,
    providerShare: resolvedAmounts.providerShare,
    memberShareExcluded: resolvedAmounts.memberShareExcluded,
  };
}

async function prefetchBulkReceiveAmounts(conn, tenantId, apps) {
  if (!apps.length) return new Map();

  const ids = apps.map((a) => a.id);
  const placeholders = ids.map(() => '?').join(',');

  const [distributions] = await conn.query(
    `SELECT ipo_application_id, manager_amount, provider_amount, member_amount
     FROM profit_share_distributions
     WHERE tenant_id = ? AND ipo_application_id IN (${placeholders})`,
    [tenantId, ...ids]
  );
  const distByAppId = new Map(
    distributions.map((row) => [
      row.ipo_application_id,
      {
        managerAmount: Number(row.manager_amount ?? 0),
        providerAmount: Number(row.provider_amount ?? 0),
        memberAmount: Number(row.member_amount ?? 0),
      },
    ])
  );

  const [managerCredits] = await conn.query(
    `SELECT ref_id, COALESCE(SUM(amount), 0) AS total
     FROM wallet_transactions
     WHERE tenant_id = ? AND ref_type = 'profit_share' AND ref_id IN (${placeholders})
     GROUP BY ref_id`,
    [tenantId, ...ids]
  );
  const managerCreditByAppId = new Map(
    managerCredits.map((row) => [row.ref_id, Number(row.total ?? 0)])
  );

  const amountsByAppId = new Map();
  for (const app of apps) {
    let split = distByAppId.get(app.id);
    if (!split) {
      split = await resolveApplicationProfitSplit(conn, tenantId, app);
    }
    const managerAlreadyInWallet = managerCreditByAppId.get(app.id) || 0;
    amountsByAppId.set(
      app.id,
      finalizeReceiveAmounts(app, undefined, split, managerAlreadyInWallet)
    );
  }
  return amountsByAppId;
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

  const amountsByAppId = await prefetchBulkReceiveAmounts(conn, tenantId, apps);

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
        amounts: amountsByAppId.get(appId),
      });
      ledgerSet.add(appId);
      if (returnToWallet) walletReturnSet.add(appId);
      results.push(result);
    } catch (err) {
      failed.push({ appId, error: err.message || 'Failed to receive' });
    }
  }

  let walletBalance = null;
  if (returnToWallet && results.length) {
    walletBalance = await syncOwnerWalletTotal(conn, tenantId, {
      bankAccountIds: resolvedBankAccountId ? [resolvedBankAccountId] : null,
      fullVerify: !resolvedBankAccountId,
    });
  }

  if (!results.length && failed.length) {
    throw new AppError(failed[0].error || 'No applications could be received');
  }

  return { received: results, failed, receivedCount: results.length, walletBalance };
}

/**
 * Undo a mistaken fund settle (Receive).
 * Reverses wallet RETURN_IN, deletes member RECEIVED ledger, clears trns_received.
 * Optionally revokes the P&L profit split as well.
 */
export async function undoReceiveIpoApplication(conn, {
  tenantId,
  appId,
  userId,
  revokeProfitSplit = false,
}) {
  const [apps] = await conn.query(
    `SELECT a.*, i.name AS ipo_name, m.display_name
     FROM ipo_applications a
     JOIN ipos i ON i.id = a.ipo_id
     JOIN members m ON m.id = a.member_id
     WHERE a.id = ? AND a.tenant_id = ?`,
    [appId, tenantId]
  );
  if (!apps.length) throw new AppError('Application not found', 404);

  const app = apps[0];

  const [walletRows] = await conn.query(
    `SELECT * FROM wallet_transactions
     WHERE tenant_id = ? AND type = 'RETURN_IN' AND ref_type = 'ipo_application' AND ref_id = ?
     ORDER BY id DESC`,
    [tenantId, appId]
  );

  const [ledgerRows] = await conn.query(
    `SELECT id, amount FROM member_ledger_entries
     WHERE tenant_id = ? AND ipo_application_id = ? AND type = 'RECEIVED'`,
    [tenantId, appId]
  );

  if (!walletRows.length && !ledgerRows.length && app.trns_received !== 'Received') {
    throw new AppError('This application is not settled — nothing to undo');
  }

  // Must reverse RETURN_IN cash. If wallet was already paid out (e.g. provider repayment),
  // block undo so books stay consistent.
  const totalToReverse = round2(
    walletRows.reduce((sum, wt) => sum + Math.max(0, Number(wt.amount || 0)), 0)
  );
  if (totalToReverse > 0) {
    const walletBalance = round2(await syncOwnerWalletTotal(conn, tenantId, { fullVerify: true }));
    if (walletBalance + 0.001 < totalToReverse) {
      const shortfall = round2(totalToReverse - walletBalance);
      throw new AppError(
        `Undo settle is not available for ${app.display_name} because the wallet no longer holds the full returned amount.`,
        400,
        {
          code: 'UNDO_SETTLE_INSUFFICIENT_WALLET',
          details: {
            memberName: app.display_name,
            ipoName: app.ipo_name,
            credited: totalToReverse,
            walletBalance,
            shortfall,
            reason: 'provider_or_personal_payout',
          },
        }
      );
    }

    for (const wt of walletRows) {
      const amount = round2(Math.max(0, Number(wt.amount || 0)));
      if (amount <= 0 || !wt.bank_account_id) continue;
      const [accRows] = await conn.query(
        `SELECT label, balance FROM manager_bank_accounts
         WHERE id = ? AND tenant_id = ?`,
        [wt.bank_account_id, tenantId]
      );
      const acc = accRows[0];
      if (!acc) {
        throw new AppError(
          `Undo settle is not available for ${app.display_name} because the bank account that received this return is missing.`,
          400,
          {
            code: 'UNDO_SETTLE_ACCOUNT_MISSING',
            details: {
              memberName: app.display_name,
              ipoName: app.ipo_name,
              credited: amount,
            },
          }
        );
      }
      if (round2(acc.balance) + 0.001 < amount) {
        const shortfall = round2(amount - Number(acc.balance));
        throw new AppError(
          `Undo settle is not available for ${app.display_name} because account "${acc.label}" no longer holds the returned amount.`,
          400,
          {
            code: 'UNDO_SETTLE_INSUFFICIENT_ACCOUNT',
            details: {
              memberName: app.display_name,
              ipoName: app.ipo_name,
              accountLabel: acc.label,
              credited: amount,
              walletBalance: round2(acc.balance),
              shortfall,
              reason: 'provider_or_personal_payout',
            },
          }
        );
      }
    }
  }

  const now = new Date();
  let walletReversed = 0;

  for (const wt of walletRows) {
    const amount = Number(wt.amount);
    if (amount !== 0) {
      try {
        await applyWalletDelta(conn, {
          tenantId,
          delta: -amount,
          bankAccountId: wt.bank_account_id,
          type: 'ADJUSTMENT',
          refType: 'receive_reversal',
          refId: appId,
          txnDate: now,
          notes: `Undo settle — ${app.display_name} (${app.ipo_name})`,
          userId,
          allowNegativeBalance: false,
        });
      } catch (err) {
        if (err instanceof AppError) {
          throw new AppError(
            `Undo settle is not available right now for ${app.display_name}. ${err.message} ` +
              'Put the money back into the wallet first, then try again.',
            err.status || 400
          );
        }
        throw err;
      }
      walletReversed += amount;
    }
    await conn.query('DELETE FROM wallet_transactions WHERE id = ? AND tenant_id = ?', [
      wt.id,
      tenantId,
    ]);
  }

  if (ledgerRows.length) {
    await conn.query(
      `DELETE FROM member_ledger_entries
       WHERE tenant_id = ? AND ipo_application_id = ? AND type = 'RECEIVED'`,
      [tenantId, appId]
    );
  }

  await conn.query(
    `UPDATE ipo_applications
     SET trns_received = NULL, date_received = NULL
     WHERE id = ? AND tenant_id = ?`,
    [appId, tenantId]
  );

  let profitRevoked = false;
  if (revokeProfitSplit) {
    const result = await revokeProfitShareDistribution(conn, {
      tenantId,
      applicationId: appId,
      userId,
    });
    profitRevoked = Boolean(result.revoked);
  }

  await syncOwnerWalletTotal(conn, tenantId, { fullVerify: true });

  return {
    appId,
    memberName: app.display_name,
    ipoName: app.ipo_name,
    walletReversed: Math.round(walletReversed * 100) / 100,
    ledgerCleared: ledgerRows.length,
    settledFlagCleared: true,
    profitRevoked,
  };
}
