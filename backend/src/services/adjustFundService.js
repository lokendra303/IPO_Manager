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

function buildPreviewRow({ app, targetIpo, investorCategory, existingOnTarget }) {
  const oldAmount = round2(app.amount);
  const remainder = remainingPrincipal(app);
  const memberName = app.display_name;
  const base = {
    applicationId: app.id,
    memberId: app.member_id,
    memberName,
    allotmentStatus: app.allotment_status,
    oldAmount,
    remainder,
    adjustedOutAmount: round2(app.adjusted_out_amount || 0),
  };

  if (app.trns_received === 'Received') {
    return {
      ...base,
      eligible: false,
      blockedReason: 'Already settled',
      newLot: null,
      adjustAmount: null,
      pendingCollect: null,
    };
  }
  if (!ADJUSTABLE_STATUSES.has(app.allotment_status)) {
    return {
      ...base,
      eligible: false,
      blockedReason: 'Only not-allotted / not-applied applications can be adjusted',
      newLot: null,
      adjustAmount: null,
      pendingCollect: null,
    };
  }
  if (remainder <= 0) {
    return {
      ...base,
      eligible: false,
      blockedReason: 'No remaining principal to adjust',
      newLot: null,
      adjustAmount: null,
      pendingCollect: null,
    };
  }
  if (existingOnTarget) {
    return {
      ...base,
      eligible: false,
      blockedReason: 'Member already has an application on the target IPO',
      newLot: null,
      adjustAmount: null,
      pendingCollect: null,
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
      pendingCollect: null,
    };
  }

  if (newLot > remainder + 0.001) {
    return {
      ...base,
      eligible: false,
      blockedReason: `New lot ₹${newLot} is higher than remaining ₹${remainder}`,
      newLot,
      adjustAmount: null,
      pendingCollect: null,
    };
  }

  const adjustAmount = newLot;
  const pendingCollect = round2(remainder - adjustAmount);
  return {
    ...base,
    eligible: true,
    blockedReason: null,
    newLot,
    adjustAmount,
    pendingCollect,
    investorCategory,
  };
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

  const filterIds = applicationIds?.length
    ? dedupeIds(applicationIds)
    : null;

  let sql = `
    SELECT a.*, m.display_name
    FROM ipo_applications a
    JOIN members m ON m.id = a.member_id
    WHERE a.tenant_id = ? AND a.ipo_id = ?
      AND (a.trns_received IS NULL OR a.trns_received <> 'Received')
      AND a.allotment_status IN ('NOT_ALLOTED', 'NOT_APPLIED')
  `;
  const params = [tenantId, sourceIpo.id];
  if (filterIds?.length) {
    sql += ` AND a.id IN (${filterIds.map(() => '?').join(',')})`;
    params.push(...filterIds);
  }
  sql += ' ORDER BY m.display_name ASC, a.id ASC';

  const [apps] = await conn.query(sql, params);
  if (!apps.length) {
    return {
      targetIpo: { id: targetIpo.id, name: targetIpo.name },
      sourceIpo: { id: sourceIpo.id, name: sourceIpo.name },
      investorCategory: category,
      rows: [],
      eligibleCount: 0,
      totalAdjust: 0,
      totalPendingCollect: 0,
    };
  }

  const memberIds = apps.map((a) => a.member_id);
  const placeholders = memberIds.map(() => '?').join(',');
  const [existing] = await conn.query(
    `SELECT member_id FROM ipo_applications
     WHERE tenant_id = ? AND ipo_id = ? AND member_id IN (${placeholders})`,
    [tenantId, targetIpo.id, ...memberIds]
  );
  const existingSet = new Set(existing.map((r) => r.member_id));

  const rows = apps.map((app) =>
    buildPreviewRow({
      app,
      targetIpo,
      investorCategory: category,
      existingOnTarget: existingSet.has(app.member_id),
    })
  );

  const eligible = rows.filter((r) => r.eligible);
  return {
    targetIpo: { id: targetIpo.id, name: targetIpo.name },
    sourceIpo: { id: sourceIpo.id, name: sourceIpo.name },
    investorCategory: category,
    rows,
    eligibleCount: eligible.length,
    totalAdjust: round2(eligible.reduce((s, r) => s + r.adjustAmount, 0)),
    totalPendingCollect: round2(eligible.reduce((s, r) => s + r.pendingCollect, 0)),
  };
}

export async function adjustFundsToIpo(conn, {
  tenantId,
  targetIpoId,
  fromIpoId,
  applicationIds,
  investorCategory,
  userId,
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

  for (const row of selected) {
    const [appRows] = await conn.query(
      `SELECT a.* FROM ipo_applications a
       WHERE a.id = ? AND a.tenant_id = ? FOR UPDATE`,
      [row.applicationId, tenantId]
    );
    if (!appRows.length) throw new AppError(`Application ${row.applicationId} not found`, 404);
    const sourceApp = appRows[0];
    const [[memberRow]] = await conn.query(
      `SELECT display_name FROM members WHERE id = ? AND tenant_id = ?`,
      [sourceApp.member_id, tenantId]
    );
    sourceApp.display_name = memberRow?.display_name || row.memberName;

    const remainder = remainingPrincipal(sourceApp);
    const adjustAmount = row.adjustAmount;
    if (adjustAmount > remainder + 0.001) {
      throw new AppError(
        `${sourceApp.display_name}: new lot exceeds remaining principal`
      );
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

    const [insertResult] = await conn.query(
      `INSERT INTO ipo_applications
       (ipo_id, member_id, tenant_id, amount, adjusted_from_application_id,
        date_given, trns_given, allotment_status, investor_category, paid_to_member_id)
       VALUES (?, ?, ?, ?, ?, ?, 'Given', 'PENDING', ?, ?)`,
      [
        targetIpo.id,
        sourceApp.member_id,
        tenantId,
        adjustAmount,
        sourceApp.id,
        now,
        row.investorCategory,
        sourceApp.paid_to_member_id || sourceApp.member_id,
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
        adjustAmount,
        now,
        newAppId,
        `Adjusted from ${sourceIpo.name}`,
      ]
    );

    const newAdjustedOut = round2((Number(sourceApp.adjusted_out_amount) || 0) + adjustAmount);
    const pendingCollect = round2(Number(sourceApp.amount) - newAdjustedOut);
    const fullyAdjusted = pendingCollect <= 0.001;

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
        `Adjusted ₹${adjustAmount} → ${targetIpo.name} (app #${newAppId})`,
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
        adjustAmount,
        now,
        sourceApp.id,
        `Adjusted to ${targetIpo.name}`,
      ]
    );

    await conn.query(
      `INSERT INTO ipo_fund_adjustments
       (tenant_id, from_application_id, to_application_id, amount, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [tenantId, sourceApp.id, newAppId, adjustAmount, userId || null]
    );

    results.push({
      fromApplicationId: sourceApp.id,
      toApplicationId: newAppId,
      memberId: sourceApp.member_id,
      memberName: sourceApp.display_name,
      adjustAmount,
      pendingCollect: Math.max(0, pendingCollect),
      fullyAdjusted,
    });
  }

  return {
    targetIpo: { id: targetIpo.id, name: targetIpo.name },
    sourceIpo: { id: sourceIpo.id, name: sourceIpo.name },
    count: results.length,
    totalAdjusted: round2(results.reduce((s, r) => s + r.adjustAmount, 0)),
    totalPendingCollect: round2(results.reduce((s, r) => s + r.pendingCollect, 0)),
    results,
  };
}
