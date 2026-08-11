import { AppError } from '../middleware/errorHandler.js';
import {
  DEFAULT_INVESTOR_CATEGORY,
  normalizeInvestorCategory,
  parseAllowedCategories,
  resolveLotAmountRaw,
} from '../constants/ipoCategories.js';
import { loadGroupForBulkDistribute } from './memberGroupService.js';
import { debitWallet, debitWalletFromAccounts, ensureWallet, creditWallet } from './walletService.js';
import { assertAccountDebits, requireBankAccountId, syncOwnerWalletTotal } from './bankAccountService.js';
import { dedupeIds, parsePositiveInt, parseAmount } from '../utils/validate.js';
import { assertIpoApplicationsEditable, revokeProfitShareDistribution } from './profitShareService.js';

/** Net provider capital available to deploy (principal − funds still with members). */
export async function getProviderDeployCapacity(conn, tenantId) {
  const [[prin]] = await conn.query(
    `SELECT COALESCE(SUM(amount), 0) AS principal
     FROM provider_transactions WHERE tenant_id = ?`,
    [tenantId]
  );
  // All unsettled apps (including PENDING allotment) still hold deployed cash.
  // adjusted_out_amount was rolled to another IPO app, so only the remainder counts here.
  const [[out]] = await conn.query(
    `SELECT COALESCE(SUM(GREATEST(a.amount - COALESCE(a.adjusted_out_amount, 0), 0)), 0) AS still_out
     FROM ipo_applications a
     WHERE a.tenant_id = ?
       AND (a.trns_received IS NULL OR a.trns_received <> 'Received')`,
    [tenantId]
  );
  const principal = round2(prin.principal);
  const stillOut = round2(out.still_out);
  const available = round2(principal - stillOut);
  return { principal, stillOut, available };
}

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function resolveMemberInvestorCategories(memberIds, { investorCategory, memberCategories }, allowed) {
  const map = new Map();
  for (const memberId of memberIds) {
    const override = memberCategories?.[memberId] ?? memberCategories?.[String(memberId)];
    const raw = override ?? investorCategory ?? DEFAULT_INVESTOR_CATEGORY;
    map.set(memberId, normalizeInvestorCategory(raw, allowed));
  }
  return map;
}

function lotAmountForCategory(ipo, category) {
  const lotRaw = resolveLotAmountRaw(ipo, category);
  if (lotRaw == null || lotRaw === '') {
    throw new AppError(
      category === 'HNI'
        ? 'Set HNI lot amount on this IPO before distributing as HNI'
        : 'RII lot amount is not set for this IPO'
    );
  }
  return parseAmount(lotRaw, { allowZero: false, fieldName: `${category} lot amount` });
}

/**
 * @returns {Promise<{ applications: Array<{memberId, amount, investorCategory, paidToMemberId}>, ledgers: Array<{memberId, amount, notes}> }>}
 */
async function buildDistributionPlan(conn, {
  tenantId,
  ipo,
  memberIds,
  amounts,
  investorCategory,
  memberCategories,
  groupBulks,
}) {
  const ipoIdNum = ipo.id;
  const allowed = parseAllowedCategories(ipo.allowed_categories);
  const applications = [];
  const ledgers = [];
  const bulkPayments = [];
  const coveredMemberIds = new Set();

  for (const bulk of groupBulks || []) {
    const { group, members } = await loadGroupForBulkDistribute(
      conn,
      tenantId,
      ipoIdNum,
      bulk.groupId
    );
    const cat = normalizeInvestorCategory(
      bulk.investorCategory ?? investorCategory,
      allowed
    );
    const lot = lotAmountForCategory(ipo, cat);
    const ownerId = group.owner_member_id;
    const ownerExternal = group.owner_external_name?.trim() || null;
    const ownerLabel = ownerExternal || group.owner_display_name || 'group owner';
    let groupTotal = 0;

    for (const m of members) {
      coveredMemberIds.add(m.id);
      applications.push({
        memberId: m.id,
        amount: lot,
        investorCategory: cat,
        paidToMemberId: ownerId || null,
        paidToExternalName: ownerExternal,
      });
      groupTotal += lot;
      ledgers.push({
        memberId: m.id,
        type: 'GIVEN',
        amount: lot,
        notes: ownerExternal
          ? `IPO: ${ipo.name} — ${group.name} (paid to ${ownerLabel})`
          : `IPO: ${ipo.name} — ${group.name} (paid to group owner)`,
      });
    }

    bulkPayments.push({
      memberGroupId: group.id,
      ownerMemberId: ownerId || null,
      ownerExternalName: ownerExternal,
      totalAmount: groupTotal,
      memberCount: members.length,
      investorCategory: cat,
      notes: `IPO: ${ipo.name} — ${group.name}`,
    });
  }

  const uniqueMemberIds = dedupeIds(memberIds || []).filter((id) => !coveredMemberIds.has(id));
  if (!uniqueMemberIds.length && !applications.length) {
    throw new AppError('Select at least one member or sub-group');
  }

  if (uniqueMemberIds.length) {
    const placeholders = uniqueMemberIds.map(() => '?').join(',');
    const [members] = await conn.query(
      `SELECT * FROM members WHERE tenant_id = ? AND id IN (${placeholders})`,
      [tenantId, ...uniqueMemberIds]
    );
    if (members.length !== uniqueMemberIds.length) {
      throw new AppError('One or more members not found or do not belong to your team');
    }
    const inactive = members.filter((m) => m.status !== 'ACTIVE');
    if (inactive.length) {
      throw new AppError(
        `Inactive members cannot receive distribution: ${inactive.map((m) => m.display_name).join(', ')}`
      );
    }
    const [existing] = await conn.query(
      `SELECT member_id FROM ipo_applications WHERE ipo_id = ? AND member_id IN (${placeholders})`,
      [ipoIdNum, ...uniqueMemberIds]
    );
    if (existing.length) {
      throw new AppError('Some members already have applications for this IPO');
    }

    const categoryByMember = resolveMemberInvestorCategories(uniqueMemberIds, {
      investorCategory,
      memberCategories,
    }, allowed);

    for (let i = 0; i < uniqueMemberIds.length; i++) {
      const memberId = uniqueMemberIds[i];
      const cat = categoryByMember.get(memberId);
      const defaultLot = lotAmountForCategory(ipo, cat);
      const raw = amounts?.[i] ?? amounts?.[memberId];
      const amt = raw !== undefined && raw !== null
        ? parseAmount(raw, { fieldName: 'application amount' })
        : defaultLot;

      applications.push({
        memberId,
        amount: amt,
        investorCategory: cat,
        paidToMemberId: memberId,
      });
      ledgers.push({
        memberId,
        type: 'GIVEN',
        amount: amt,
        notes: `IPO: ${ipo.name}`,
      });
    }
  }

  return { applications, ledgers, bulkPayments };
}

export async function distributeIpo(conn, {
  tenantId,
  ipoId,
  memberIds,
  amounts,
  markGiven,
  userId,
  bankAccountId,
  accountDebits,
  investorCategory,
  memberCategories,
  groupBulks,
}) {
  const ipoIdNum = parsePositiveInt(ipoId, 'IPO id');

  const [ipoRows] = await conn.query(
    'SELECT * FROM ipos WHERE id = ? AND tenant_id = ?',
    [ipoIdNum, tenantId]
  );
  if (!ipoRows.length) throw new AppError('IPO not found', 404);
  const ipo = ipoRows[0];

  if (ipo.is_invalid) {
    throw new AppError('Cannot distribute funds for an invalid IPO. Restore it to the main list first.');
  }

  if (ipo.status === 'CLOSED') {
    throw new AppError('Cannot distribute funds for a closed IPO. Reopen the IPO first.');
  }

  const { applications: appPlans, ledgers: ledgerPlans, bulkPayments: bulkPaymentPlans } = await buildDistributionPlan(conn, {
    tenantId,
    ipo,
    memberIds,
    amounts,
    investorCategory,
    memberCategories,
    groupBulks,
  });

  const total = appPlans.reduce((s, p) => s + Number(p.amount), 0);
  const now = new Date();

  await ensureWallet(conn, tenantId);

  const capacity = await getProviderDeployCapacity(conn, tenantId);
  if (total > capacity.available + 0.001) {
    throw new AppError(
      `Cannot distribute ₹${total.toFixed(2)}. Provider principal left to deploy: ₹${Math.max(0, capacity.available).toFixed(2)} ` +
        `(principal ₹${capacity.principal.toFixed(2)} − already with members ₹${capacity.stillOut.toFixed(2)}). ` +
        `Undistribute a member or add provider funds first.`
    );
  }

  if (!accountDebits?.length) {
    const resolvedAccountId = await requireBankAccountId(conn, tenantId, bankAccountId, {
      purpose: 'PROVIDER',
    });
    const [accRows] = await conn.query(
      'SELECT balance, label FROM manager_bank_accounts WHERE id = ? AND tenant_id = ? AND is_active = 1 FOR UPDATE',
      [resolvedAccountId, tenantId]
    );
    if (!accRows.length) throw new AppError('Bank account not found', 404);
    if (Number(accRows[0].balance) < total) {
      throw new AppError(
        `Insufficient provider wallet balance in ${accRows[0].label}. Need ₹${total}, available ₹${accRows[0].balance}`
      );
    }
  } else {
    await assertAccountDebits(conn, tenantId, accountDebits, total);
    for (const d of accountDebits) {
      const [accRows] = await conn.query(
        'SELECT balance, label FROM manager_bank_accounts WHERE id = ? AND tenant_id = ? FOR UPDATE',
        [d.bankAccountId, tenantId]
      );
      if (!accRows.length) throw new AppError('Bank account not found', 404);
      if (Number(accRows[0].balance) < Number(d.amount)) {
        throw new AppError(
          `Insufficient balance in ${accRows[0].label}. Need ₹${d.amount}, available ₹${accRows[0].balance}`
        );
      }
    }
  }

  const applications = [];
  const appIdByMember = new Map();

  for (const plan of appPlans) {
    const [appResult] = await conn.query(
      `INSERT INTO ipo_applications
       (ipo_id, member_id, tenant_id, amount, date_received, trns_received, date_given, trns_given,
        allotment_status, investor_category, paid_to_member_id, paid_to_external_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, ?)`,
      [
        ipoIdNum,
        plan.memberId,
        tenantId,
        plan.amount,
        null,
        null,
        markGiven ? now : null,
        markGiven ? 'Given' : null,
        plan.investorCategory,
        plan.paidToMemberId ?? null,
        plan.paidToExternalName ?? null,
      ]
    );
    appIdByMember.set(plan.memberId, appResult.insertId);
    applications.push({ id: appResult.insertId, memberId: plan.memberId, amount: plan.amount });
  }

  for (const ledger of ledgerPlans) {
    const appId = appIdByMember.get(ledger.memberId) ?? applications[0]?.id;
    await conn.query(
      `INSERT INTO member_ledger_entries (member_id, tenant_id, type, amount, txn_date, ipo_application_id, notes)
       VALUES (?, ?, 'GIVEN', ?, ?, ?, ?)`,
      [ledger.memberId, tenantId, ledger.amount, now, appId, ledger.notes]
    );
  }

  for (const bp of bulkPaymentPlans || []) {
    await conn.query(
      `INSERT INTO member_group_bulk_payments
       (tenant_id, member_group_id, ipo_id, owner_member_id, owner_external_name, total_amount, member_count, investor_category, paid_at, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tenantId,
        bp.memberGroupId,
        ipoIdNum,
        bp.ownerMemberId ?? null,
        bp.ownerExternalName ?? null,
        bp.totalAmount,
        bp.memberCount,
        bp.investorCategory,
        now,
        bp.notes,
      ]
    );
  }

  const memberCount = appPlans.length;
  const groupCount = (groupBulks || []).length;
  const debitNotes = groupCount
    ? `Distributed for ${ipo.name} (${memberCount} members, ${groupCount} group bulk)`
    : `Distributed for ${ipo.name} (${memberCount} members)`;

  if (accountDebits?.length) {
    await debitWalletFromAccounts(conn, {
      tenantId,
      debits: accountDebits,
      type: 'DISTRIBUTE_OUT',
      refType: 'ipo',
      refId: ipoIdNum,
      txnDate: now,
      notes: debitNotes,
      userId,
    });
  } else {
    const resolvedAccountId = await requireBankAccountId(conn, tenantId, bankAccountId, {
      purpose: 'PROVIDER',
    });
    await debitWallet(conn, {
      tenantId,
      amount: total,
      bankAccountId: resolvedAccountId,
      type: 'DISTRIBUTE_OUT',
      refType: 'ipo',
      refId: ipoIdNum,
      txnDate: now,
      notes: debitNotes,
      userId,
    });
  }

  return { total, applications, groupBulkCount: groupCount };
}

/**
 * Undo a mistaken distribute for one unsettled application.
 * Credits wallet, removes GIVEN ledger, deletes the application.
 */
export async function undistributeIpoApplication(conn, {
  tenantId,
  appId,
  userId,
  bankAccountId,
}) {
  const id = parsePositiveInt(appId, 'application id');

  const [apps] = await conn.query(
    `SELECT a.*, i.name AS ipo_name, i.status AS ipo_status, m.display_name
     FROM ipo_applications a
     JOIN ipos i ON i.id = a.ipo_id
     JOIN members m ON m.id = a.member_id
     WHERE a.id = ? AND a.tenant_id = ?`,
    [id, tenantId]
  );
  if (!apps.length) throw new AppError('Application not found', 404);

  const app = apps[0];
  await assertIpoApplicationsEditable(conn, tenantId, app.ipo_id);

  if (app.trns_received === 'Received') {
    throw new AppError(
      'This application is already settled. Undo settle first, then undistribute.'
    );
  }

  const adjustedOut = round2(Number(app.adjusted_out_amount) || 0);
  if (adjustedOut > 0.001) {
    throw new AppError(
      'This application has funds adjusted to another IPO. Undistribute is not allowed.'
    );
  }
  if (app.adjusted_from_application_id) {
    throw new AppError(
      'This application was created by fund adjust. Undistribute is not allowed.'
    );
  }

  const amount = round2(app.amount);
  if (amount <= 0) throw new AppError('Invalid application amount');

  // Prefer the bank account used on the latest DISTRIBUTE_OUT for this IPO
  let resolvedAccountId = bankAccountId
    ? await requireBankAccountId(conn, tenantId, bankAccountId, { purpose: 'PROVIDER' })
    : null;
  if (!resolvedAccountId) {
    const [distRows] = await conn.query(
      `SELECT bank_account_id FROM wallet_transactions
       WHERE tenant_id = ? AND type = 'DISTRIBUTE_OUT' AND ref_type = 'ipo' AND ref_id = ?
         AND bank_account_id IS NOT NULL
       ORDER BY id DESC LIMIT 1`,
      [tenantId, app.ipo_id]
    );
    resolvedAccountId = distRows[0]?.bank_account_id
      ? await requireBankAccountId(conn, tenantId, distRows[0].bank_account_id, {
          purpose: 'PROVIDER',
        })
      : await requireBankAccountId(conn, tenantId, null, { purpose: 'PROVIDER' });
  }

  const now = new Date();

  await revokeProfitShareDistribution(conn, {
    tenantId,
    applicationId: id,
    userId,
  });

  await conn.query(
    `DELETE FROM member_ledger_entries
     WHERE tenant_id = ? AND ipo_application_id = ? AND type = 'GIVEN'`,
    [tenantId, id]
  );

  await conn.query('DELETE FROM ipo_applications WHERE id = ? AND tenant_id = ?', [id, tenantId]);

  await ensureWallet(conn, tenantId);
  await creditWallet(conn, {
    tenantId,
    amount,
    bankAccountId: resolvedAccountId,
    type: 'ADJUSTMENT',
    refType: 'distribute_reversal',
    refId: id,
    txnDate: now,
    notes: `Undistribute — ${app.display_name} (${app.ipo_name})`,
    userId,
    skipEnsureWallet: true,
    skipSync: true,
    resolvedBankAccountId: resolvedAccountId,
  });
  await syncOwnerWalletTotal(conn, tenantId, { bankAccountIds: [resolvedAccountId] });

  const capacity = await getProviderDeployCapacity(conn, tenantId);

  return {
    appId: id,
    memberName: app.display_name,
    ipoName: app.ipo_name,
    amount,
    walletCredited: amount,
    bankAccountId: resolvedAccountId,
    capacity,
  };
}

