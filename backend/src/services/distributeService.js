import { AppError } from '../middleware/errorHandler.js';
import { debitWallet, debitWalletFromAccounts, ensureWallet } from './walletService.js';
import { assertAccountDebits } from './bankAccountService.js';
import { dedupeIds, parsePositiveInt, parseAmount } from '../utils/validate.js';

export async function distributeIpo(conn, {
  tenantId,
  ipoId,
  memberIds,
  amounts,
  markReceived,
  markGiven,
  userId,
  bankAccountId,
  accountDebits,
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

  const lotAmount = parseAmount(ipo.lot_amount, { allowZero: false, fieldName: 'lot amount' });
  const now = new Date();
  let total = 0;
  const applicationAmounts = uniqueMemberIds.map((id, i) => {
    const raw = amounts?.[i] ?? amounts?.[id];
    const amt = raw !== undefined && raw !== null ? parseAmount(raw, { fieldName: 'application amount' }) : lotAmount;
    total += amt;
    return amt;
  });

  await ensureWallet(conn, tenantId);

  if (accountDebits?.length) {
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
  } else {
    const wallet = await ensureWallet(conn, tenantId);
    if (wallet.balance < total) {
      throw new AppError(`Insufficient wallet balance. Need ₹${total}, available ₹${wallet.balance}`);
    }
    if (bankAccountId) {
      const [accRows] = await conn.query(
        'SELECT balance, label FROM manager_bank_accounts WHERE id = ? AND tenant_id = ? AND is_active = 1 FOR UPDATE',
        [bankAccountId, tenantId]
      );
      if (!accRows.length) throw new AppError('Bank account not found', 404);
      if (Number(accRows[0].balance) < total) {
        throw new AppError(
          `Insufficient balance in ${accRows[0].label}. Need ₹${total}, available ₹${accRows[0].balance}`
        );
      }
    }
  }

  const applications = [];

  for (let i = 0; i < uniqueMemberIds.length; i++) {
    const memberId = uniqueMemberIds[i];
    const amount = applicationAmounts[i];

    const [appResult] = await conn.query(
      `INSERT INTO ipo_applications
       (ipo_id, member_id, tenant_id, amount, date_received, trns_received, date_given, trns_given, allotment_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'PENDING')`,
      [
        ipoIdNum,
        memberId,
        tenantId,
        amount,
        markReceived ? now : null,
        markReceived ? 'Received' : null,
        markGiven ? now : null,
        markGiven ? 'Given' : null,
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
    await debitWallet(conn, {
      tenantId,
      amount: total,
      bankAccountId,
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
