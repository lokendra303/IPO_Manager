import { AppError } from '../middleware/errorHandler.js';
import {
  DEFAULT_INVESTOR_CATEGORY,
  normalizeInvestorCategory,
  parseAllowedCategories,
  resolveLotAmountRaw,
} from '../constants/ipoCategories.js';
import { dedupeIds, parsePositiveInt, parseAmount } from '../utils/validate.js';
import { assertIpoApplicationsEditable } from './profitShareService.js';
import { remainingPrincipal } from './pendingReturnUtils.js';
import { debitWallet, ensureWallet } from './walletService.js';
import { requireBankAccountId } from './bankAccountService.js';
import { getProviderDeployCapacity } from './distributeService.js';

function round2(n) {
  return Math.round(Number(n || 0) * 100) / 100;
}

function lotAmountForCategory(ipo, category) {
  const lotRaw = resolveLotAmountRaw(ipo, category);
  if (lotRaw == null || lotRaw === '') {
    throw new AppError(
      category === 'HNI'
        ? 'Set HNI lot amount on this IPO before adjusting as HNI'
        : 'RII lot amount is not set for this IPO'
    );
  }
  return parseAmount(lotRaw, { allowZero: false, fieldName: `${category} lot amount` });
}

const ADJUSTABLE_STATUSES = new Set(['NOT_ALLOTED', 'NOT_APPLIED']);

async function loadTargetIpo(conn, tenantId, targetIpoId) {
  const id = parsePositiveInt(targetIpoId, 'IPO id');
  const [rows] = await conn.query(
    'SELECT * FROM ipos WHERE id = ? AND tenant_id = ?',
    [id, tenantId]
  );
  if (!rows.length) throw new AppError('Target IPO not found', 404);
  const ipo = rows[0];
  if (ipo.is_invalid) {
    throw new AppError('Cannot adjust funds onto an invalid IPO. Restore it first.');
  }
  if (ipo.status === 'CLOSED') {
    throw new AppError('Cannot adjust funds onto a closed IPO. Reopen it first.');
  }
  await assertIpoApplicationsEditable(conn, tenantId, id);
  return ipo;
}

async function loadSourceIpo(conn, tenantId, fromIpoId, targetIpoId) {
  const id = parsePositiveInt(fromIpoId, 'source IPO id');
  if (id === Number(targetIpoId)) {
    throw new AppError('Source and target IPO must be different');
  }
  const [rows] = await conn.query(
    'SELECT * FROM ipos WHERE id = ? AND tenant_id = ?',
    [id, tenantId]
  );
  if (!rows.length) throw new AppError('Source IPO not found', 404);
  return rows[0];
}

/**
 * List source IPOs that have adjustable applications (not allotted / not applied, unsettled).
 */
export async function listAdjustSourceIpos(conn, tenantId, targetIpoId) {
  const targetId = parsePositiveInt(targetIpoId, 'IPO id');
  const [rows] = await conn.query(
    `SELECT i.id, i.name, i.status, i.lot_amount_rii, i.lot_amount_hni,
            COUNT(a.id) AS adjustable_count,
            COALESCE(SUM(GREATEST(a.amount - COALESCE(a.adjusted_out_amount, 0), 0)), 0) AS adjustable_principal
     FROM ipos i
     JOIN ipo_applications a ON a.ipo_id = i.id AND a.tenant_id = i.tenant_id
     WHERE i.tenant_id = ?
       AND i.id <> ?
       AND (i.is_invalid IS NULL OR i.is_invalid = 0)
       AND (a.trns_received IS NULL OR a.trns_received <> 'Received')
       AND a.allotment_status IN ('NOT_ALLOTED', 'NOT_APPLIED')
       AND GREATEST(a.amount - COALESCE(a.adjusted_out_amount, 0), 0) > 0
     GROUP BY i.id, i.name, i.status, i.lot_amount_rii, i.lot_amount_hni
     HAVING adjustable_count > 0
     ORDER BY i.open_date DESC, i.id DESC`,
    [tenantId, targetId]
  );
  return rows.map((r) => ({
    ...r,
    adjustable_count: Number(r.adjustable_count),
    adjustable_principal: round2(r.adjustable_principal),
  }));
}

/**
 * Build one preview row.
 * Supports both directions:
 * - old > new: roll newLot, leftover = toCollect
 * - old <= new: roll full remainder, mark old received later; shortfall = toSend (provider wallet)
 */
function buildPreviewRow({ app, targetIpo, investorCategory, existingOnTarget }) {
  const oldAmount = round2(app.amount);
  const remainder = remainingPrincipal(app);
  const memberName = app.display_name;
  const groupId = app.member_group_id ?? null;
  const groupName = app.member_group_name || null;
  const base = {
    applicationId: app.id,
    memberId: app.member_id,
    memberName,
    allotmentStatus: app.allotment_status,
    oldAmount,
    remainder,
    adjustedOutAmount: round2(app.adjusted_out_amount || 0),
    groupId,
    groupName,
  };

  if (app.trns_received === 'Received') {
    return {
      ...base,
      eligible: false,
      blockedReason: 'Already settled',
      newLot: null,
      adjustAmount: null,
      newAppAmount: null,
      toCollect: null,
      toSend: null,
    };
  }
  if (!ADJUSTABLE_STATUSES.has(app.allotment_status)) {
    return {
      ...base,
      eligible: false,
      blockedReason: 'Only not-allotted / not-applied applications can be adjusted',
      newLot: null,
      adjustAmount: null,
      newAppAmount: null,
      toCollect: remainder,
      toSend: 0,
    };
  }
  if (remainder <= 0) {
    return {
      ...base,
      eligible: false,
      blockedReason: 'No remaining principal to adjust',
      newLot: null,
      adjustAmount: null,
      newAppAmount: null,
      toCollect: 0,
      toSend: 0,
    };
  }
  if (existingOnTarget) {
    return {
      ...base,
      eligible: false,
      blockedReason: 'Member already has an application on the target IPO',
      newLot: null,
      adjustAmount: null,
      newAppAmount: null,
      toCollect: remainder,
      toSend: 0,
    };
  }

  let newLot;
  try {
    newLot = lotAmountForCategory(targetIpo, investorCategory);
  } catch (err) {
    return {
      ...base,
      eligible: false,
      blockedReason: err.message || 'Lot amount not set on target IPO',
      newLot: null,
      adjustAmount: null,
      newAppAmount: null,
      toCollect: remainder,
      toSend: 0,
    };
  }

  const rolledFromOld = round2(Math.min(remainder, newLot));
  const toCollect = round2(Math.max(0, remainder - newLot));
  const toSend = round2(Math.max(0, newLot - remainder));
  const newAppAmount = newLot;

  return {
    ...base,
    eligible: true,
    blockedReason: null,
    newLot,
    adjustAmount: rolledFromOld,
    newAppAmount,
    toCollect,
    toSend,
    pendingCollect: toCollect,
    investorCategory,
    willMarkOldReceived: toCollect <= 0.001,
  };
}

function buildGroupBreakdown(rows) {
  const groupMap = new Map();
  const individuals = [];

  for (const row of rows) {
    if (row.groupId == null) {
      individuals.push(row);
      continue;
    }
    if (!groupMap.has(row.groupId)) {
      groupMap.set(row.groupId, {
        groupId: row.groupId,
        groupName: row.groupName || `Group #${row.groupId}`,
        members: [],
        totalAdjust: 0,
        totalToSend: 0,
        totalToCollect: 0,
        eligibleCount: 0,
      });
    }
    const g = groupMap.get(row.groupId);
    g.members.push(row);
    if (row.eligible) {
      g.eligibleCount += 1;
      g.totalAdjust = round2(g.totalAdjust + (row.adjustAmount || 0));
      g.totalToSend = round2(g.totalToSend + (row.toSend || 0));
      g.totalToCollect = round2(g.totalToCollect + (row.toCollect || 0));
    } else {
      g.totalToCollect = round2(g.totalToCollect + (row.toCollect || row.remainder || 0));
    }
  }

  const groups = [...groupMap.values()].sort((a, b) =>
    String(a.groupName).localeCompare(String(b.groupName))
  );

  const individualTotals = {
    totalAdjust: round2(individuals.filter((r) => r.eligible).reduce((s, r) => s + (r.adjustAmount || 0), 0)),
    totalToSend: round2(individuals.filter((r) => r.eligible).reduce((s, r) => s + (r.toSend || 0), 0)),
    totalToCollect: round2(
      individuals.reduce((s, r) => {
        if (r.eligible) return s + (r.toCollect || 0);
        return s + (r.toCollect || r.remainder || 0);
      }, 0)
    ),
    eligibleCount: individuals.filter((r) => r.eligible).length,
  };

  return { groups, individuals, individualTotals };
}

export async function previewAdjustFunds(conn, {
  tenantId,
  targetIpoId,
  fromIpoId,
  investorCategory,
  applicationIds,
}) {
  const targetIpo = await loadTargetIpo(conn, tenantId, targetIpoId);
  const sourceIpo = await loadSourceIpo(conn, tenantId, fromIpoId, targetIpo.id);
  const allowed = parseAllowedCategories(targetIpo.allowed_categories);
  const category = normalizeInvestorCategory(
    investorCategory || DEFAULT_INVESTOR_CATEGORY,
    allowed
  );

  const filterIds = applicationIds?.length ? dedupeIds(applicationIds) : null;

  // All unsettled apps on source (any allotment) for full planning view
  const [allUnsettled] = await conn.query(
    `SELECT a.*, m.display_name, m.member_group_id, mg.name AS member_group_name
     FROM ipo_applications a
     JOIN members m ON m.id = a.member_id
     LEFT JOIN member_groups mg ON mg.id = m.member_group_id
     WHERE a.tenant_id = ? AND a.ipo_id = ?
       AND (a.trns_received IS NULL OR a.trns_received <> 'Received')
       AND GREATEST(a.amount - COALESCE(a.adjusted_out_amount, 0), 0) > 0
     ORDER BY mg.sort_order, mg.name, m.display_name, a.id`,
    [tenantId, sourceIpo.id]
  );

  const adjustableApps = allUnsettled.filter((a) => ADJUSTABLE_STATUSES.has(a.allotment_status));
  const pendingAllotmentApps = allUnsettled.filter((a) => a.allotment_status === 'PENDING');

  let focusApps = adjustableApps;
  if (filterIds?.length) {
    const idSet = new Set(filterIds);
    focusApps = adjustableApps.filter((a) => idSet.has(a.id));
  }

  const memberIds = focusApps.map((a) => a.member_id);
  let existingSet = new Set();
  if (memberIds.length) {
    const placeholders = memberIds.map(() => '?').join(',');
    const [existing] = await conn.query(
      `SELECT member_id FROM ipo_applications
       WHERE tenant_id = ? AND ipo_id = ? AND member_id IN (${placeholders})`,
      [tenantId, targetIpo.id, ...memberIds]
    );
    existingSet = new Set(existing.map((r) => r.member_id));
  }

  const rows = focusApps.map((app) =>
    buildPreviewRow({
      app,
      targetIpo,
      investorCategory: category,
      existingOnTarget: existingSet.has(app.member_id),
    })
  );

  const selectedIds = filterIds?.length ? new Set(filterIds) : null;
  const eligible = rows.filter((r) => r.eligible);
  const selectedEligible = selectedIds
    ? eligible.filter((r) => selectedIds.has(r.applicationId))
    : eligible;

  // Not adjusted: ineligible rows + pending allotment + adjustable not in selection
  const unadjustedPending = [];
  for (const app of pendingAllotmentApps) {
    const rem = remainingPrincipal(app);
    unadjustedPending.push({
      applicationId: app.id,
      memberId: app.member_id,
      memberName: app.display_name,
      allotmentStatus: app.allotment_status,
      remainder: rem,
      toCollect: rem,
      toSend: 0,
      reason: 'Allotment still pending — full amount to collect (not adjusted)',
      groupId: app.member_group_id ?? null,
      groupName: app.member_group_name || null,
    });
  }
  for (const row of rows) {
    if (row.eligible && (!selectedIds || selectedIds.has(row.applicationId))) continue;
    if (row.eligible && selectedIds && !selectedIds.has(row.applicationId)) {
      unadjustedPending.push({
        applicationId: row.applicationId,
        memberId: row.memberId,
        memberName: row.memberName,
        allotmentStatus: row.allotmentStatus,
        remainder: row.remainder,
        toCollect: row.remainder,
        toSend: 0,
        reason: 'Not selected for adjust — full amount to collect',
        groupId: row.groupId,
        groupName: row.groupName,
      });
      continue;
    }
    if (!row.eligible && row.remainder > 0) {
      unadjustedPending.push({
        applicationId: row.applicationId,
        memberId: row.memberId,
        memberName: row.memberName,
        allotmentStatus: row.allotmentStatus,
        remainder: row.remainder,
        toCollect: row.remainder,
        toSend: 0,
        reason: row.blockedReason || 'Not adjusted — full amount to collect',
        groupId: row.groupId,
        groupName: row.groupName,
      });
    }
  }

  const planningRows = selectedEligible;
  const { groups, individuals, individualTotals } = buildGroupBreakdown(planningRows);

  const unadjustedToCollect = round2(
    unadjustedPending.reduce((s, r) => s + (r.toCollect || 0), 0)
  );

  return {
    targetIpo: {
      id: targetIpo.id,
      name: targetIpo.name,
      lotAmountRii: targetIpo.lot_amount_rii,
      lotAmountHni: targetIpo.lot_amount_hni,
    },
    sourceIpo: {
      id: sourceIpo.id,
      name: sourceIpo.name,
      lotAmountRii: sourceIpo.lot_amount_rii,
      lotAmountHni: sourceIpo.lot_amount_hni,
    },
    investorCategory: category,
    rows,
    eligibleCount: eligible.length,
    selectedCount: selectedEligible.length,
    groups,
    individuals,
    individualTotals,
    unadjustedPending,
    totals: {
      totalAdjust: round2(selectedEligible.reduce((s, r) => s + (r.adjustAmount || 0), 0)),
      totalNewApps: round2(selectedEligible.reduce((s, r) => s + (r.newAppAmount || 0), 0)),
      totalToSend: round2(selectedEligible.reduce((s, r) => s + (r.toSend || 0), 0)),
      totalToCollect: round2(selectedEligible.reduce((s, r) => s + (r.toCollect || 0), 0)),
      unadjustedToCollect,
      grandToCollect: round2(
        selectedEligible.reduce((s, r) => s + (r.toCollect || 0), 0) + unadjustedToCollect
      ),
    },
    // backward-compatible aliases
    totalAdjust: round2(selectedEligible.reduce((s, r) => s + (r.adjustAmount || 0), 0)),
    totalPendingCollect: round2(selectedEligible.reduce((s, r) => s + (r.toCollect || 0), 0)),
  };
}

export async function adjustFundsToIpo(conn, {
  tenantId,
  targetIpoId,
  fromIpoId,
  applicationIds,
  investorCategory,
  userId,
  bankAccountId,
}) {
  const ids = dedupeIds(applicationIds || []);
  if (!ids.length) throw new AppError('Select at least one application to adjust');

  const preview = await previewAdjustFunds(conn, {
    tenantId,
    targetIpoId,
    fromIpoId,
    investorCategory,
    applicationIds: ids,
  });

  const byId = new Map(preview.rows.map((r) => [r.applicationId, r]));
  const selected = ids.map((id) => {
    const row = byId.get(id);
    if (!row) throw new AppError(`Application ${id} is not adjustable from the source IPO`);
    if (!row.eligible) {
      throw new AppError(`${row.memberName}: ${row.blockedReason}`);
    }
    return row;
  });

  const targetIpo = await loadTargetIpo(conn, tenantId, targetIpoId);
  const sourceIpo = await loadSourceIpo(conn, tenantId, fromIpoId, targetIpo.id);
  const now = new Date();
  const results = [];

  const totalToSendNeeded = round2(selected.reduce((s, r) => s + Number(r.toSend || 0), 0));
  let resolvedAccountId = null;

  if (totalToSendNeeded > 0.001) {
    await ensureWallet(conn, tenantId);
    const capacity = await getProviderDeployCapacity(conn, tenantId);
    if (totalToSendNeeded > capacity.available + 0.001) {
      throw new AppError(
        `Cannot adjust: need ₹${totalToSendNeeded.toFixed(2)} top-up but provider deploy available is ₹${Math.max(0, capacity.available).toFixed(2)} ` +
          `(principal ₹${capacity.principal.toFixed(2)} − already with members ₹${capacity.stillOut.toFixed(2)}). ` +
          `Add provider funds or settle returns first.`
      );
    }
    resolvedAccountId = await requireBankAccountId(conn, tenantId, bankAccountId, {
      purpose: 'PROVIDER',
    });
    const [accRows] = await conn.query(
      'SELECT balance, label FROM manager_bank_accounts WHERE id = ? AND tenant_id = ? AND is_active = 1 FOR UPDATE',
      [resolvedAccountId, tenantId]
    );
    if (!accRows.length) throw new AppError('Provider bank account not found', 404);
    if (Number(accRows[0].balance) < totalToSendNeeded) {
      throw new AppError(
        `Insufficient provider wallet in ${accRows[0].label}. Need ₹${totalToSendNeeded.toFixed(2)} top-up, available ₹${Number(accRows[0].balance).toFixed(2)}`
      );
    }
  }

  // groupId -> { ownerMemberId, ownerExternalName, totalToSend, memberCount }
  const leaderTopUps = new Map();

  for (const row of selected) {
    const [appRows] = await conn.query(
      `SELECT a.* FROM ipo_applications a
       WHERE a.id = ? AND a.tenant_id = ? FOR UPDATE`,
      [row.applicationId, tenantId]
    );
    if (!appRows.length) throw new AppError(`Application ${row.applicationId} not found`, 404);
    const sourceApp = appRows[0];
    const [[memberRow]] = await conn.query(
      `SELECT m.display_name, m.member_group_id,
              g.owner_member_id, g.owner_external_name, g.name AS group_name
       FROM members m
       LEFT JOIN member_groups g ON g.id = m.member_group_id AND g.tenant_id = m.tenant_id
       WHERE m.id = ? AND m.tenant_id = ?`,
      [sourceApp.member_id, tenantId]
    );
    sourceApp.display_name = memberRow?.display_name || row.memberName;

    const remainder = remainingPrincipal(sourceApp);
    const newAppAmount = row.newAppAmount;
    const rolledFromOld = round2(Math.min(remainder, newAppAmount));
    const toSend = round2(Math.max(0, newAppAmount - remainder));
    const toCollect = round2(Math.max(0, remainder - newAppAmount));

    if (rolledFromOld <= 0) {
      throw new AppError(`${sourceApp.display_name}: nothing left to adjust`);
    }

    const [dup] = await conn.query(
      `SELECT id FROM ipo_applications WHERE ipo_id = ? AND member_id = ? LIMIT 1`,
      [targetIpo.id, sourceApp.member_id]
    );
    if (dup.length) {
      throw new AppError(
        `${sourceApp.display_name} already has an application on ${targetIpo.name}`
      );
    }

    const paidToExternal = sourceApp.paid_to_external_name || null;
    let paidToMemberId = sourceApp.paid_to_member_id || null;

    // Keep leader-wallet attribution: if member belongs to a sub-group with a leader,
    // new (adjusted) app is paid to that leader so pending moves old IPO → new IPO.
    if (memberRow?.owner_member_id) {
      paidToMemberId = memberRow.owner_member_id;
    } else if (memberRow?.owner_external_name) {
      paidToMemberId = null;
    } else if (!paidToMemberId && !paidToExternal) {
      paidToMemberId = sourceApp.member_id;
    }

    const resolvedPaidToExternal = memberRow?.owner_member_id
      ? null
      : (memberRow?.owner_external_name || paidToExternal || null);

    const topUpNote =
      toSend > 0.001 ? ` — provider top-up ₹${toSend}` : '';

    const [insertResult] = await conn.query(
      `INSERT INTO ipo_applications
       (ipo_id, member_id, tenant_id, amount, adjusted_from_application_id,
        date_given, trns_given, allotment_status, investor_category,
        paid_to_member_id, paid_to_external_name, remarks)
       VALUES (?, ?, ?, ?, ?, ?, 'Given', 'PENDING', ?, ?, ?, ?)`,
      [
        targetIpo.id,
        sourceApp.member_id,
        tenantId,
        newAppAmount,
        sourceApp.id,
        now,
        row.investorCategory,
        paidToMemberId,
        resolvedPaidToExternal,
        `Adjusted from ${sourceIpo.name} (₹${rolledFromOld} rolled)${topUpNote}`,
      ]
    );
    const newAppId = insertResult.insertId;

    await conn.query(
      `INSERT INTO member_ledger_entries
       (member_id, tenant_id, type, amount, txn_date, ipo_application_id, notes)
       VALUES (?, ?, 'GIVEN', ?, ?, ?, ?)`,
      [
        sourceApp.member_id,
        tenantId,
        newAppAmount,
        now,
        newAppId,
        `Adjusted from ${sourceIpo.name}${topUpNote}`,
      ]
    );

    const newAdjustedOut = round2((Number(sourceApp.adjusted_out_amount) || 0) + rolledFromOld);
    const pendingLeft = round2(Number(sourceApp.amount) - newAdjustedOut);
    const fullyAdjusted = pendingLeft <= 0.001;

    await conn.query(
      `UPDATE ipo_applications
       SET adjusted_out_amount = ?,
           remarks = CONCAT(COALESCE(remarks, ''), IF(COALESCE(remarks, '') = '', '', '\n'), ?),
           date_received = IF(?, COALESCE(date_received, ?), date_received),
           trns_received = IF(?, 'Received', trns_received),
           updated_at = ?
       WHERE id = ? AND tenant_id = ?`,
      [
        newAdjustedOut,
        `Adjusted ₹${rolledFromOld} → ${targetIpo.name} (app #${newAppId})` +
          (toCollect > 0.001 ? ` · leftover to collect ₹${toCollect}` : '') +
          (toSend > 0.001 ? ` · provider top-up ₹${toSend}` : ''),
        fullyAdjusted ? 1 : 0,
        now,
        fullyAdjusted ? 1 : 0,
        now,
        sourceApp.id,
        tenantId,
      ]
    );

    await conn.query(
      `INSERT INTO member_ledger_entries
       (member_id, tenant_id, type, amount, txn_date, ipo_application_id, notes)
       VALUES (?, ?, 'ADJUSTED_OUT', ?, ?, ?, ?)`,
      [
        sourceApp.member_id,
        tenantId,
        rolledFromOld,
        now,
        sourceApp.id,
        `Adjusted to ${targetIpo.name}`,
      ]
    );

    await conn.query(
      `INSERT INTO ipo_fund_adjustments
       (tenant_id, from_application_id, to_application_id, amount, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [tenantId, sourceApp.id, newAppId, rolledFromOld, userId || null]
    );

    // Track top-up for group leader activity (balances come from apps / paid_to)
    if (toSend > 0.001 && memberRow?.member_group_id) {
      const paidToLeader =
        (memberRow.owner_member_id && paidToMemberId === memberRow.owner_member_id) ||
        (memberRow.owner_external_name &&
          resolvedPaidToExternal &&
          String(resolvedPaidToExternal) === String(memberRow.owner_external_name));
      if (paidToLeader) {
        const gid = memberRow.member_group_id;
        if (!leaderTopUps.has(gid)) {
          leaderTopUps.set(gid, {
            memberGroupId: gid,
            ownerMemberId: memberRow.owner_member_id || null,
            ownerExternalName: memberRow.owner_external_name || null,
            totalToSend: 0,
            memberCount: 0,
          });
        }
        const g = leaderTopUps.get(gid);
        g.totalToSend = round2(g.totalToSend + toSend);
        g.memberCount += 1;
      }
    }

    results.push({
      fromApplicationId: sourceApp.id,
      toApplicationId: newAppId,
      memberId: sourceApp.member_id,
      memberName: sourceApp.display_name,
      adjustAmount: rolledFromOld,
      newAppAmount,
      toCollect,
      toSend,
      pendingCollect: toCollect,
      fullyAdjusted,
      groupId: memberRow?.member_group_id ?? null,
    });
  }

  for (const g of leaderTopUps.values()) {
    if (g.totalToSend <= 0.001) continue;
    await conn.query(
      `INSERT INTO member_group_bulk_payments
       (tenant_id, member_group_id, ipo_id, owner_member_id, owner_external_name,
        total_amount, member_count, investor_category, paid_at, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tenantId,
        g.memberGroupId,
        targetIpo.id,
        g.ownerMemberId,
        g.ownerExternalName,
        g.totalToSend,
        g.memberCount,
        investorCategory || DEFAULT_INVESTOR_CATEGORY,
        now,
        `Adjust top-up from ${sourceIpo.name} → ${targetIpo.name}`,
      ]
    );
  }

  if (totalToSendNeeded > 0.001 && resolvedAccountId) {
    await debitWallet(conn, {
      tenantId,
      amount: totalToSendNeeded,
      bankAccountId: resolvedAccountId,
      type: 'DISTRIBUTE_OUT',
      refType: 'ipo',
      refId: targetIpo.id,
      txnDate: now,
      notes: `Adjust top-up ${sourceIpo.name} → ${targetIpo.name} (${results.length} members)`,
      userId,
    });
  }

  return {
    targetIpo: { id: targetIpo.id, name: targetIpo.name },
    sourceIpo: { id: sourceIpo.id, name: sourceIpo.name },
    count: results.length,
    totalAdjusted: round2(results.reduce((s, r) => s + r.adjustAmount, 0)),
    totalNewApps: round2(results.reduce((s, r) => s + r.newAppAmount, 0)),
    totalToSend: round2(results.reduce((s, r) => s + r.toSend, 0)),
    totalPendingCollect: round2(results.reduce((s, r) => s + r.toCollect, 0)),
    totalToCollect: round2(results.reduce((s, r) => s + r.toCollect, 0)),
    providerDebited: totalToSendNeeded,
    bankAccountId: resolvedAccountId,
    results,
  };
}

/**
 * Meta for combine-adjust UI: adjustable source IPOs + open target IPOs.
 */
export async function getCombineAdjustMeta(conn, tenantId) {
  const [sources] = await conn.query(
    `SELECT i.id, i.name, i.status, i.lot_amount_rii, i.lot_amount_hni,
            COUNT(a.id) AS adjustable_count,
            COALESCE(SUM(GREATEST(a.amount - COALESCE(a.adjusted_out_amount, 0), 0)), 0) AS adjustable_principal
     FROM ipos i
     JOIN ipo_applications a ON a.ipo_id = i.id AND a.tenant_id = i.tenant_id
     WHERE i.tenant_id = ?
       AND (i.is_invalid IS NULL OR i.is_invalid = 0)
       AND (a.trns_received IS NULL OR a.trns_received <> 'Received')
       AND a.allotment_status IN ('NOT_ALLOTED', 'NOT_APPLIED')
       AND GREATEST(a.amount - COALESCE(a.adjusted_out_amount, 0), 0) > 0
     GROUP BY i.id, i.name, i.status, i.lot_amount_rii, i.lot_amount_hni
     HAVING adjustable_count > 0
     ORDER BY i.open_date DESC, i.id DESC`,
    [tenantId]
  );

  const [targets] = await conn.query(
    `SELECT i.id, i.name, i.status, i.lot_amount_rii, i.lot_amount_hni, i.allowed_categories
     FROM ipos i
     WHERE i.tenant_id = ?
       AND (i.is_invalid IS NULL OR i.is_invalid = 0)
       AND i.status = 'OPEN'
     ORDER BY i.open_date DESC, i.id DESC`,
    [tenantId]
  );

  return {
    sources: sources.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      lotAmountRii: r.lot_amount_rii,
      lotAmountHni: r.lot_amount_hni,
      adjustableCount: Number(r.adjustable_count),
      adjustablePrincipal: round2(r.adjustable_principal),
    })),
    targets: targets.map((r) => ({
      id: r.id,
      name: r.name,
      status: r.status,
      lotAmountRii: r.lot_amount_rii,
      lotAmountHni: r.lot_amount_hni,
      allowedCategories: r.allowed_categories,
    })),
  };
}

/**
 * Preview combine adjust across multiple source IPOs → multiple target IPOs.
 * assignments: optional [{ applicationId, targetIpoId }]
 */
export async function previewCombineAdjust(conn, {
  tenantId,
  fromIpoIds,
  targetIpoIds,
  investorCategory,
  assignments,
}) {
  const sourceIds = dedupeIds(fromIpoIds || []);
  const targetIds = dedupeIds(targetIpoIds || []);
  if (!sourceIds.length) throw new AppError('Select at least one old (source) IPO');
  if (!targetIds.length) throw new AppError('Select at least one new (target) IPO');

  const overlap = sourceIds.filter((id) => targetIds.includes(id));
  if (overlap.length) {
    throw new AppError('An IPO cannot be both source and target in the same combine');
  }

  const targets = [];
  for (const tid of targetIds) {
    targets.push(await loadTargetIpo(conn, tenantId, tid));
  }
  const targetById = new Map(targets.map((t) => [t.id, t]));

  const defaultCategory = investorCategory || DEFAULT_INVESTOR_CATEGORY;
  const assignmentMap = new Map();
  for (const a of assignments || []) {
    if (a?.applicationId && a?.targetIpoId) {
      assignmentMap.set(Number(a.applicationId), Number(a.targetIpoId));
    }
  }

  const placeholders = sourceIds.map(() => '?').join(',');
  const [apps] = await conn.query(
    `SELECT a.*, m.display_name, m.member_group_id, mg.name AS member_group_name,
            i.name AS source_ipo_name, i.id AS source_ipo_id
     FROM ipo_applications a
     JOIN members m ON m.id = a.member_id
     JOIN ipos i ON i.id = a.ipo_id
     LEFT JOIN member_groups mg ON mg.id = m.member_group_id
     WHERE a.tenant_id = ?
       AND a.ipo_id IN (${placeholders})
       AND (a.trns_received IS NULL OR a.trns_received <> 'Received')
       AND GREATEST(a.amount - COALESCE(a.adjusted_out_amount, 0), 0) > 0
     ORDER BY i.open_date DESC, mg.sort_order, mg.name, m.display_name, a.id`,
    [tenantId, ...sourceIds]
  );

  // Existing apps on each target (member already applied)
  const existingByTarget = new Map();
  for (const tid of targetIds) {
    const [ex] = await conn.query(
      `SELECT member_id FROM ipo_applications WHERE tenant_id = ? AND ipo_id = ?`,
      [tenantId, tid]
    );
    existingByTarget.set(tid, new Set(ex.map((r) => r.member_id)));
  }

  // Track members already assigned to a target in this preview (one new app per member per target)
  const claimedOnTarget = new Map(targetIds.map((tid) => [tid, new Set()]));

  const rows = [];
  const unadjustedPending = [];
  const allottedExcluded = [];

  for (const app of apps) {
    const rem = remainingPrincipal(app);
    const baseMeta = {
      applicationId: app.id,
      memberId: app.member_id,
      memberName: app.display_name,
      sourceIpoId: app.source_ipo_id,
      sourceIpoName: app.source_ipo_name,
      allotmentStatus: app.allotment_status,
      remainder: rem,
      groupId: app.member_group_id ?? null,
      groupName: app.member_group_name || null,
    };

    if (app.allotment_status === 'ALLOTED') {
      // Got shares — money is not available to roll into another IPO
      allottedExcluded.push({
        ...baseMeta,
        reason: 'Allotted — funds in shares, cannot adjust',
      });
      continue;
    }

    if (!ADJUSTABLE_STATUSES.has(app.allotment_status)) {
      unadjustedPending.push({
        ...baseMeta,
        toCollect: rem,
        reason:
          app.allotment_status === 'PENDING'
            ? 'Allotment still pending — full amount to collect'
            : 'Not adjustable — full amount to collect',
      });
      continue;
    }

    // Prefer assignment, else first target where member free and not same as source
    let chosenTargetId = assignmentMap.get(app.id) || null;
    if (chosenTargetId && !targetById.has(chosenTargetId)) chosenTargetId = null;
    if (chosenTargetId === app.source_ipo_id) chosenTargetId = null;

    if (!chosenTargetId) {
      for (const tid of targetIds) {
        if (tid === app.source_ipo_id) continue;
        const existing = existingByTarget.get(tid);
        const claimed = claimedOnTarget.get(tid);
        if (existing?.has(app.member_id) || claimed?.has(app.member_id)) continue;
        chosenTargetId = tid;
        break;
      }
    }

    const targetOptions = targetIds
      .filter((tid) => tid !== app.source_ipo_id)
      .map((tid) => {
        const tipo = targetById.get(tid);
        let cat;
        try {
          cat = normalizeInvestorCategory(defaultCategory, tipo.allowed_categories);
        } catch {
          cat = DEFAULT_INVESTOR_CATEGORY;
        }
        let newLot = null;
        let lotError = null;
        try {
          newLot = lotAmountForCategory(tipo, cat);
        } catch (err) {
          lotError = err.message;
        }
        const existing = existingByTarget.get(tid)?.has(app.member_id);
        const claimed = claimedOnTarget.get(tid)?.has(app.member_id);
        const toCollect = newLot != null ? round2(Math.max(0, rem - newLot)) : null;
        const toSend = newLot != null ? round2(Math.max(0, newLot - rem)) : null;
        return {
          targetIpoId: tid,
          targetIpoName: tipo.name,
          newLot,
          lotError,
          blocked: Boolean(existing || claimed || lotError),
          blockedReason: existing
            ? 'Already has app on this IPO'
            : claimed
              ? 'Another row already targets this IPO for this member'
              : lotError,
          toCollect,
          toSend,
          willMarkOldReceived: toCollect != null && toCollect <= 0.001,
        };
      });

    if (!chosenTargetId) {
      rows.push({
        ...baseMeta,
        eligible: false,
        blockedReason: 'No available target IPO for this member',
        targetIpoId: null,
        targetOptions,
        newLot: null,
        adjustAmount: null,
        newAppAmount: null,
        toCollect: rem,
        toSend: 0,
      });
      continue;
    }

    const tipo = targetById.get(chosenTargetId);
    let cat;
    try {
      cat = normalizeInvestorCategory(defaultCategory, tipo.allowed_categories);
    } catch {
      cat = DEFAULT_INVESTOR_CATEGORY;
    }

    const previewRow = buildPreviewRow({
      app,
      targetIpo: tipo,
      investorCategory: cat,
      existingOnTarget: existingByTarget.get(chosenTargetId)?.has(app.member_id),
    });

    if (previewRow.eligible) {
      claimedOnTarget.get(chosenTargetId).add(app.member_id);
    }

    rows.push({
      ...previewRow,
      sourceIpoId: app.source_ipo_id,
      sourceIpoName: app.source_ipo_name,
      targetIpoId: chosenTargetId,
      targetIpoName: tipo.name,
      targetOptions,
      groupId: app.member_group_id ?? null,
      groupName: app.member_group_name || null,
    });
  }

  const selected = rows.filter((r) => r.eligible && r.targetIpoId);
  const byTarget = new Map();
  for (const r of selected) {
    if (!byTarget.has(r.targetIpoId)) {
      byTarget.set(r.targetIpoId, {
        targetIpoId: r.targetIpoId,
        targetIpoName: r.targetIpoName,
        count: 0,
        totalAdjust: 0,
        totalToSend: 0,
        totalToCollect: 0,
      });
    }
    const t = byTarget.get(r.targetIpoId);
    t.count += 1;
    t.totalAdjust = round2(t.totalAdjust + (r.adjustAmount || 0));
    t.totalToSend = round2(t.totalToSend + (r.toSend || 0));
    t.totalToCollect = round2(t.totalToCollect + (r.toCollect || 0));
  }

  const bySource = new Map();
  for (const r of selected) {
    if (!bySource.has(r.sourceIpoId)) {
      bySource.set(r.sourceIpoId, {
        sourceIpoId: r.sourceIpoId,
        sourceIpoName: r.sourceIpoName,
        count: 0,
        totalAdjust: 0,
        totalToSend: 0,
        totalToCollect: 0,
      });
    }
    const s = bySource.get(r.sourceIpoId);
    s.count += 1;
    s.totalAdjust = round2(s.totalAdjust + (r.adjustAmount || 0));
    s.totalToSend = round2(s.totalToSend + (r.toSend || 0));
    s.totalToCollect = round2(s.totalToCollect + (r.toCollect || 0));
  }

  const unadjustedToCollect = round2(
    unadjustedPending.reduce((s, r) => s + (r.toCollect || 0), 0) +
      rows.filter((r) => !r.eligible).reduce((s, r) => s + (r.toCollect || r.remainder || 0), 0)
  );

  return {
    sourceIpos: sourceIds.map((id) => {
      const row = apps.find((a) => a.source_ipo_id === id);
      return { id, name: row?.source_ipo_name || `#${id}` };
    }),
    targetIpos: targets.map((t) => ({
      id: t.id,
      name: t.name,
      lotAmountRii: t.lot_amount_rii,
      lotAmountHni: t.lot_amount_hni,
    })),
    investorCategory: defaultCategory,
    rows,
    unadjustedPending,
    allottedExcluded,
    byTarget: [...byTarget.values()],
    bySource: [...bySource.values()],
    totals: {
      eligibleCount: selected.length,
      totalAdjust: round2(selected.reduce((s, r) => s + (r.adjustAmount || 0), 0)),
      totalToSend: round2(selected.reduce((s, r) => s + (r.toSend || 0), 0)),
      totalToCollect: round2(selected.reduce((s, r) => s + (r.toCollect || 0), 0)),
      unadjustedToCollect,
      allottedCount: allottedExcluded.length,
      allottedPrincipal: round2(allottedExcluded.reduce((s, r) => s + (r.remainder || 0), 0)),
      grandToCollect: round2(
        selected.reduce((s, r) => s + (r.toCollect || 0), 0) + unadjustedToCollect
      ),
    },
  };
}

/**
 * Execute combine adjust. items: [{ applicationId, targetIpoId, investorCategory? }]
 */
export async function executeCombineAdjust(conn, {
  tenantId,
  items,
  investorCategory,
  userId,
  bankAccountId,
}) {
  if (!Array.isArray(items) || !items.length) {
    throw new AppError('Select at least one member to adjust');
  }

  const byTarget = new Map();
  for (const item of items) {
    const appId = parsePositiveInt(item.applicationId, 'application id');
    const targetIpoId = parsePositiveInt(item.targetIpoId, 'target IPO id');
    if (!byTarget.has(targetIpoId)) byTarget.set(targetIpoId, []);
    byTarget.get(targetIpoId).push(appId);
  }

  // Resolve fromIpoId per application
  const allAppIds = [...new Set(items.map((i) => parsePositiveInt(i.applicationId, 'application id')))];
  const ph = allAppIds.map(() => '?').join(',');
  const [appRows] = await conn.query(
    `SELECT id, ipo_id FROM ipo_applications WHERE tenant_id = ? AND id IN (${ph})`,
    [tenantId, ...allAppIds]
  );
  const appSource = new Map(appRows.map((r) => [r.id, r.ipo_id]));

  const allResults = [];
  let totalAdjusted = 0;
  let totalToSend = 0;
  let totalToCollect = 0;
  let providerDebited = 0;

  for (const [targetIpoId, applicationIds] of byTarget.entries()) {
    // Group by source IPO because adjustFundsToIpo takes one fromIpoId
    const bySource = new Map();
    for (const appId of applicationIds) {
      const fromIpoId = appSource.get(appId);
      if (!fromIpoId) throw new AppError(`Application ${appId} not found`, 404);
      if (!bySource.has(fromIpoId)) bySource.set(fromIpoId, []);
      bySource.get(fromIpoId).push(appId);
    }

    for (const [fromIpoId, ids] of bySource.entries()) {
      const result = await adjustFundsToIpo(conn, {
        tenantId,
        targetIpoId,
        fromIpoId,
        applicationIds: ids,
        investorCategory: investorCategory || DEFAULT_INVESTOR_CATEGORY,
        userId,
        bankAccountId,
      });
      allResults.push(...result.results.map((r) => ({
        ...r,
        targetIpoId,
        targetIpoName: result.targetIpo.name,
        sourceIpoId: fromIpoId,
        sourceIpoName: result.sourceIpo.name,
      })));
      totalAdjusted = round2(totalAdjusted + result.totalAdjusted);
      totalToSend = round2(totalToSend + (result.totalToSend || 0));
      totalToCollect = round2(totalToCollect + (result.totalToCollect || result.totalPendingCollect || 0));
      providerDebited = round2(providerDebited + (result.providerDebited || 0));
    }
  }

  return {
    count: allResults.length,
    totalAdjusted,
    totalToSend,
    totalToCollect,
    providerDebited,
    results: allResults,
  };
}
