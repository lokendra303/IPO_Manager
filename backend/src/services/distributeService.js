import { AppError } from '../middleware/errorHandler.js';
import {
  DEFAULT_INVESTOR_CATEGORY,
  normalizeInvestorCategory,
  parseAllowedCategories,
  resolveLotAmountRaw,
} from '../constants/ipoCategories.js';
import { loadGroupForBulkDistribute } from './memberGroupService.js';
import { debitWallet, debitWalletFromAccounts, ensureWallet } from './walletService.js';
import { assertAccountDebits, requireBankAccountId } from './bankAccountService.js';
import { dedupeIds, parsePositiveInt, parseAmount } from '../utils/validate.js';

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
    let groupTotal = 0;

    for (const m of members) {
      coveredMemberIds.add(m.id);
      applications.push({
        memberId: m.id,
        amount: lot,
        investorCategory: cat,
        paidToMemberId: ownerId,
      });
      groupTotal += lot;
      ledgers.push({
        memberId: m.id,
        type: 'GIVEN',
        amount: lot,
        notes: `IPO: ${ipo.name} — ${group.name} (paid to group owner)`,
      });
    }

    bulkPayments.push({
      memberGroupId: group.id,
      ownerMemberId: ownerId,
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

  if (!accountDebits?.length) {
    const resolvedAccountId = await requireBankAccountId(conn, tenantId, bankAccountId);
    const [accRows] = await conn.query(
      'SELECT balance, label FROM manager_bank_accounts WHERE id = ? AND tenant_id = ? AND is_active = 1 FOR UPDATE',
      [resolvedAccountId, tenantId]
    );
    if (!accRows.length) throw new AppError('Bank account not found', 404);
    if (Number(accRows[0].balance) < total) {
      throw new AppError(
        `Insufficient balance in ${accRows[0].label}. Need ₹${total}, available ₹${accRows[0].balance}`
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
        allotment_status, investor_category, paid_to_member_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
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
        plan.paidToMemberId,
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
       (tenant_id, member_group_id, ipo_id, owner_member_id, total_amount, member_count, investor_category, paid_at, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tenantId,
        bp.memberGroupId,
        ipoIdNum,
        bp.ownerMemberId,
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
    const resolvedAccountId = await requireBankAccountId(conn, tenantId, bankAccountId);
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
