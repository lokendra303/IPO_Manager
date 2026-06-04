import { AppError } from '../middleware/errorHandler.js';
import {
  DEFAULT_INVESTOR_CATEGORY,
  normalizeInvestorCategory,
  parseAllowedCategories,
  resolveLotAmountRaw,
} from '../constants/ipoCategories.js';
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
}) {
  const ipoIdNum = parsePositiveInt(ipoId, 'IPO id');
  const uniqueMemberIds = dedupeIds(memberIds);
  if (!uniqueMemberIds.length) throw new AppError('Select at least one member');

  const [ipoRows] = await conn.query(
    'SELECT * FROM ipos WHERE id = ? AND tenant_id = ?',
    [ipoIdNum, tenantId]
  );
  if (!ipoRows.length) throw new AppError('IPO not found', 404);
  const ipo = ipoRows[0];

  if (ipo.status === 'CLOSED') {
    throw new AppError('Cannot distribute funds for a closed IPO. Reopen the IPO first.');
  }

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
    throw new AppError(`Inactive members cannot receive distribution: ${inactive.map((m) => m.display_name).join(', ')}`);
  }

  const [existing] = await conn.query(
    `SELECT member_id FROM ipo_applications WHERE ipo_id = ? AND member_id IN (${placeholders})`,
    [ipoIdNum, ...uniqueMemberIds]
  );
  if (existing.length) {
    throw new AppError('Some members already have applications for this IPO');
  }

  const allowedCategories = parseAllowedCategories(ipo.allowed_categories);
  const categoryByMember = resolveMemberInvestorCategories(uniqueMemberIds, {
    investorCategory,
    memberCategories,
  }, allowedCategories);

  const now = new Date();
  let total = 0;
  const applicationAmounts = uniqueMemberIds.map((id, i) => {
    const cat = categoryByMember.get(id);
    const lotRaw = resolveLotAmountRaw(ipo, cat);
    if (lotRaw == null || lotRaw === '') {
      throw new AppError(
        cat === 'HNI'
          ? 'Set HNI lot amount on this IPO before distributing as HNI'
          : 'RII lot amount is not set for this IPO'
      );
    }
    const defaultLot = parseAmount(lotRaw, {
      allowZero: false,
      fieldName: `${cat} lot amount`,
    });
    const raw = amounts?.[i] ?? amounts?.[id];
    const amt = raw !== undefined && raw !== null
      ? parseAmount(raw, { fieldName: 'application amount' })
      : defaultLot;
    total += amt;
    return amt;
  });

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

  for (let i = 0; i < uniqueMemberIds.length; i++) {
    const memberId = uniqueMemberIds[i];
    const amount = applicationAmounts[i];

    const investorCat = categoryByMember.get(memberId);

    const [appResult] = await conn.query(
      `INSERT INTO ipo_applications
       (ipo_id, member_id, tenant_id, amount, date_received, trns_received, date_given, trns_given, allotment_status, investor_category)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING', ?)`,
      [
        ipoIdNum,
        memberId,
        tenantId,
        amount,
        null,
        null,
        markGiven ? now : null,
        markGiven ? 'Given' : null,
        investorCat,
      ]
    );
    const appId = appResult.insertId;

    await conn.query(
      `INSERT INTO member_ledger_entries (member_id, tenant_id, type, amount, txn_date, ipo_application_id, notes)
       VALUES (?, ?, 'GIVEN', ?, ?, ?, ?)`,
      [memberId, tenantId, amount, now, appId, `IPO: ${ipo.name}`]
    );

    applications.push({ id: appId, memberId, amount });
  }

  const debitNotes = `Distributed for ${ipo.name} (${uniqueMemberIds.length} members)`;

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

  return { total, applications };
}
