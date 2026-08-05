import { AppError } from '../middleware/errorHandler.js';
import { parseAmount, parsePositiveInt } from '../utils/validate.js';
import {
  requireBankAccountId,
  syncOwnerWalletTotal,
  ensureManagerProfitAccount,
} from './bankAccountService.js';
import {
  resolveApplicationProfitSplit,
  revokeProfitShareDistribution,
  assertIpoApplicationsEditable,
} from './profitShareService.js';
import { creditWallet, ensureWallet } from './walletService.js';

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
 * Provider wallet: principal + provider share.
 * Manager profit wallet: manager share.
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
      providerWalletAmount: explicit,
      managerShare: 0,
      providerShare: 0,
      memberShareExcluded: 0,
    };
  }

  const { managerAmount, providerAmount, memberAmount } = split;
  const managerShare = round2(managerAmount - managerAlreadyInWallet);
  // Total cash back to team wallets = withdrawal − member profit (− legacy manager credits)
  const walletAmount = round2(withdrawalAmount - memberAmount - managerAlreadyInWallet);
  const providerWalletAmount = round2(Math.max(0, walletAmount - Math.max(0, managerShare)));

  return {
    ledgerAmount: distributedAmount,
    walletAmount,
    providerWalletAmount,
    managerShare: Math.max(0, managerShare),
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

/** Credit provider principal wallet + manager profit wallet separately. */
async function creditSplitReceiveToWallets(conn, {
  tenantId,
  amounts,
  providerBankAccountId,
  appId,
  ipoName,
  notes,
  userId,
  now,
}) {
  const touched = [];
  const providerPart = round2(amounts.providerWalletAmount ?? amounts.walletAmount);
  const managerPart = round2(amounts.managerShare);

  if (providerPart > 0.001) {
    await creditWallet(conn, {
      tenantId,
      amount: providerPart,
      bankAccountId: providerBankAccountId,
      type: 'RETURN_IN',
      refType: 'ipo_application',
      refId: appId,
      txnDate: now,
      notes: notes || `Return from ${ipoName} (provider wallet)`,
      userId,
      skipEnsureWallet: true,
      skipSync: true,
      resolvedBankAccountId: providerBankAccountId,
    });
    touched.push(providerBankAccountId);
  }

  if (managerPart > 0.001) {
    const managerAccountId = await ensureManagerProfitAccount(conn, tenantId);
    await creditWallet(conn, {
      tenantId,
      amount: managerPart,
      bankAccountId: managerAccountId,
      type: 'MANAGER_PROFIT_IN',
      refType: 'ipo_application',
      refId: appId,
      txnDate: now,
      notes: notes || `Manager profit from ${ipoName}`,
      userId,
      skipEnsureWallet: true,
      skipSync: true,
      resolvedBankAccountId: managerAccountId,
    });
    touched.push(managerAccountId);
  }

  return touched;
}

async function hasWalletReturnForApp(conn, tenantId, appId) {
  const [rows] = await conn.query(
    `SELECT id FROM wallet_transactions
     WHERE tenant_id = ? AND ref_type = 'ipo_application' AND ref_id = ?
       AND type IN ('RETURN_IN', 'MANAGER_PROFIT_IN')
     LIMIT 1`,
    [tenantId, appId]
  );
  return rows.length > 0;
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
  await assertIpoApplicationsEditable(conn, tenantId, app.ipo_id);
  const amounts = await resolveReceiveAmounts(conn, tenantId, app, amount);

  const now = new Date();
  const ledgerNotes = notes || `Return: ${app.ipo_name}`;

  const [existingLedger] = await conn.query(
    `SELECT id FROM member_ledger_entries WHERE ipo_application_id = ? AND type = 'RECEIVED'`,
    [appId]
  );

  const hasWalletReturn = await hasWalletReturnForApp(conn, tenantId, appId);

  if (existingLedger.length && hasWalletReturn) {
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
    if (hasWalletReturn) {
      throw new AppError('Funds were already returned to wallet for this application');
    }

    await ensureWallet(conn, tenantId);
    const resolvedBankAccountId = await requireBankAccountId(conn, tenantId, bankAccountId, {
      purpose: 'PROVIDER',
    });
    const touched = await creditSplitReceiveToWallets(conn, {
      tenantId,
      amounts,
      providerBankAccountId: resolvedBankAccountId,
      appId,
      ipoName: app.ipo_name,
      notes,
      userId,
      now,
    });
    if (touched.length) {
      await syncOwnerWalletTotal(conn, tenantId, { bankAccountIds: touched });
    }
  }

  return {
    appId,
    memberId: app.member_id,
    amount: amounts.ledgerAmount,
    walletAmount: amounts.walletAmount,
    providerWalletAmount: amounts.providerWalletAmount,
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

    await creditSplitReceiveToWallets(conn, {
      tenantId,
      amounts: resolvedAmounts,
      providerBankAccountId: resolvedBankAccountId,
      appId,
      ipoName: app.ipo_name,
      notes,
      userId,
      now,
    });
  }

  return {
    appId,
    memberId: app.member_id,
    amount: resolvedAmounts.ledgerAmount,
    walletAmount: resolvedAmounts.walletAmount,
    providerWalletAmount: resolvedAmounts.providerWalletAmount,
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

  if (apps.length) {
    const ipoIds = [...new Set(apps.map((a) => a.ipo_id))];
    for (const ipoId of ipoIds) {
      await assertIpoApplicationsEditable(conn, tenantId, ipoId);
    }
  }

  const [existingLedger] = await conn.query(
    `SELECT ipo_application_id FROM member_ledger_entries
     WHERE ipo_application_id IN (${placeholders}) AND type = 'RECEIVED'`,
    ids
  );
  const ledgerSet = new Set(existingLedger.map((row) => row.ipo_application_id));

  const [existingWalletReturn] = await conn.query(
    `SELECT ref_id FROM wallet_transactions
     WHERE tenant_id = ? AND ref_type = 'ipo_application'
       AND type IN ('RETURN_IN', 'MANAGER_PROFIT_IN')
       AND ref_id IN (${placeholders})`,
    [tenantId, ...ids]
  );
  const walletReturnSet = new Set(existingWalletReturn.map((row) => row.ref_id));

  let resolvedBankAccountId = null;
  if (returnToWallet) {
    await ensureWallet(conn, tenantId);
    resolvedBankAccountId = await requireBankAccountId(conn, tenantId, bankAccountId, {
      purpose: 'PROVIDER',
    });
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
 * Resolve unsettled applications for member sub-groups on an IPO, then settle like receive-bulk.
 * Matches distribute's group-bulk mental model: collect from the group owner, mark the whole group received.
 */
export async function receiveIpoApplicationsByGroups(conn, {
  tenantId,
  ipoId,
  groupIds,
  returnToWallet = true,
  bankAccountId,
  notes,
  userId,
}) {
  const ipoIdNum = parsePositiveInt(ipoId, 'IPO id');
  const ids = [...new Set((groupIds || []).map((raw) => Number(raw)).filter((id) => id > 0))];
  if (!ids.length) {
    throw new AppError('Select at least one sub-group to receive');
  }

  await assertIpoApplicationsEditable(conn, tenantId, ipoIdNum);

  const placeholders = ids.map(() => '?').join(',');
  const [groupRows] = await conn.query(
    `SELECT id, name FROM member_groups WHERE tenant_id = ? AND id IN (${placeholders})`,
    [tenantId, ...ids]
  );
  if (groupRows.length !== ids.length) {
    throw new AppError('One or more sub-groups were not found');
  }

  const [apps] = await conn.query(
    `SELECT a.id, a.amount, m.member_group_id, m.display_name, g.name AS group_name
     FROM ipo_applications a
     JOIN members m ON m.id = a.member_id
     JOIN member_groups g ON g.id = m.member_group_id
     WHERE a.ipo_id = ? AND a.tenant_id = ?
       AND m.member_group_id IN (${placeholders})
       AND (a.trns_received IS NULL OR a.trns_received <> 'Received')
     ORDER BY g.sort_order, g.name, m.sort_order, m.id`,
    [ipoIdNum, tenantId, ...ids]
  );

  if (!apps.length) {
    throw new AppError(
      'No pending returns for the selected sub-group(s). Members may already be marked received.'
    );
  }

  const applicationIds = apps.map((a) => a.id);
  const result = await receiveIpoApplicationsBulk(conn, {
    tenantId,
    applicationIds,
    returnToWallet,
    bankAccountId,
    notes: notes || `Group bulk receive — ${[...new Set(apps.map((a) => a.group_name))].join(', ')}`,
    userId,
  });

  const byGroup = new Map();
  for (const app of apps) {
    const key = app.member_group_id;
    if (!byGroup.has(key)) {
      byGroup.set(key, {
        groupId: key,
        groupName: app.group_name,
        pendingCount: 0,
        pendingAmount: 0,
      });
    }
    const row = byGroup.get(key);
    row.pendingCount += 1;
    row.pendingAmount = round2(row.pendingAmount + Number(app.amount || 0));
  }

  return {
    ...result,
    groups: [...byGroup.values()],
    applicationIds,
  };
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
  await assertIpoApplicationsEditable(conn, tenantId, app.ipo_id);

  const [walletRows] = await conn.query(
    `SELECT * FROM wallet_transactions
     WHERE tenant_id = ? AND ref_type = 'ipo_application' AND ref_id = ?
       AND type IN ('RETURN_IN', 'MANAGER_PROFIT_IN')
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
  const touchedAccountIds = [];

  // Reverse RETURN_IN by debiting the account and removing that ledger row.
  // Do NOT insert a second negative ADJUSTMENT — that double-counts on ledger reconcile
  // (delete +amount and add -amount ⇒ -2× on replay).
  for (const wt of walletRows) {
    const amount = round2(Number(wt.amount || 0));
    if (amount !== 0 && wt.bank_account_id) {
      const [accRows] = await conn.query(
        `SELECT id, label, balance FROM manager_bank_accounts
         WHERE id = ? AND tenant_id = ? FOR UPDATE`,
        [wt.bank_account_id, tenantId]
      );
      const acc = accRows[0];
      if (!acc) {
        throw new AppError(
          `Undo settle is not available for ${app.display_name} because the bank account that received this return is missing.`,
          400
        );
      }
      const newBal = round2(Number(acc.balance) - amount);
      if (newBal < -0.001) {
        throw new AppError(
          `Undo settle is not available right now for ${app.display_name}. Insufficient balance in ${acc.label}. Available: ₹${acc.balance}, needed: ₹${amount} Put the money back into the wallet first, then try again.`,
          400
        );
      }
      await conn.query('UPDATE manager_bank_accounts SET balance = ? WHERE id = ?', [
        newBal,
        wt.bank_account_id,
      ]);
      touchedAccountIds.push(wt.bank_account_id);
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

  await syncOwnerWalletTotal(conn, tenantId, {
    bankAccountIds: touchedAccountIds.length ? [...new Set(touchedAccountIds)] : null,
  });

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
