import { AppError } from '../../../middleware/errorHandler.js';
import { formatPan, toSqlDateTime } from '../../../utils/validate.js';
import { maskPan } from '../../../utils/pan.js';
import { withTransaction } from '../../../db/pool.js';
import { saveAllotmentResult } from '../allotmentQueueService.js';
import { mufgPlatform, resolveMufgCompany } from './mufgProvider.js';
import { sharesToLots } from './parseAllotment.js';

const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const DELAY_MS = 400;
const MAX_PER_RUN = 40;
const CHECKABLE = new Set(['PENDING', 'CHECKING', 'RETRY', 'ERROR']);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ipoSearchNames(ipo) {
  return [ipo.company_name, ipo.name, ipo.registrar_name].filter(Boolean);
}

export async function pickAllotmentResult(ipoNames, pan, platforms = [mufgPlatform]) {
  let unmatched = null;
  for (const platform of platforms) {
    try {
      const result = await platform.check({ ipoNames, pan });
      if (!result) continue;
      if (result.kind === 'unmatched') {
        unmatched = result;
        continue;
      }
      if (result.kind === 'message') {
        return { ...result, status: 'RETRY' };
      }
      if (result.kind === 'empty') {
        return { ...result, status: 'NOT_ALLOTED', allottedShares: 0 };
      }
      if (result.kind === 'result' && result.status) {
        return result;
      }
    } catch (err) {
      unmatched = {
        platform: platform.id,
        kind: 'error',
        status: 'RETRY',
        message: err.message || 'Registrar temporarily unavailable',
      };
    }
  }
  return unmatched || {
    kind: 'unmatched',
    status: null,
    message: 'No registrar returned allotment for this IPO yet.',
  };
}

export async function autoCheckIpoAllotment(pool, { tenantId, ipoId, recheck = false, applicationId = null } = {}) {
  const [ipoRows] = await pool.query(
    `SELECT i.id, i.name, i.company_name, i.lot_size, i.registrar, i.catalog_id,
            c.lot_size AS catalog_lot_size, c.company_name AS catalog_company, c.registrar_name, c.registrar_code
     FROM ipos i
     LEFT JOIN ipo_catalog c ON c.id = i.catalog_id
     WHERE i.id = ? AND i.tenant_id = ?`,
    [ipoId, tenantId]
  );
  if (!ipoRows.length) throw new AppError('IPO not found', 404);
  const ipo = ipoRows[0];
  const lotSize = Number(ipo.lot_size || ipo.catalog_lot_size || 0) || null;
  const names = ipoSearchNames({
    name: ipo.name,
    company_name: ipo.company_name || ipo.catalog_company,
    registrar_name: ipo.registrar_name,
  });

  let registrarCompany = null;
  try {
    registrarCompany = await resolveMufgCompany(names);
  } catch (err) {
    throw new AppError(err.message || 'Allotment registrar temporarily unavailable', err.status || 503);
  }
  if (!registrarCompany) {
    return {
      success: true,
      provider: 'mufg',
      providerLabel: 'MUFG Intime',
      ipo: { id: ipo.id, name: ipo.name, registrar: ipo.registrar || ipo.registrar_code },
      checked: 0,
      allotted: 0,
      notAllotted: 0,
      skipped: 0,
      failed: 0,
      remaining: 0,
      results: [],
      message: 'This IPO is not on MUFG Intime yet. Allotment may not be published, or Bigshare/KFintech (captcha portals) handles it.',
    };
  }

  const params = [ipoId, tenantId];
  let statusFilter;
  if (applicationId) {
    statusFilter = 'a.id = ?';
    params.push(applicationId);
  } else if (recheck) {
    statusFilter = "a.allotment_status NOT IN ('NOT_APPLIED')";
  } else {
    statusFilter = `a.allotment_status IN ('${[...CHECKABLE].join("','")}')`;
  }

  const [apps] = await pool.query(
    `SELECT a.id, a.member_id, a.amount, a.allotment_status, a.application_number,
            a.applied_lots, a.allotted_lots, a.allotted_amount, a.allotment_checked_at,
            m.display_name, m.pan
     FROM ipo_applications a
     JOIN members m ON m.id = a.member_id
     WHERE a.ipo_id = ? AND a.tenant_id = ? AND ${statusFilter}
     ORDER BY a.id ASC
     LIMIT ?`,
    [...params, applicationId ? 1 : MAX_PER_RUN]
  );

  const results = [];
  let checked = 0;
  let allotted = 0;
  let notAllotted = 0;
  let skipped = 0;
  let failed = 0;

  for (const app of apps) {
    const pan = formatPan(app.pan);
    if (!pan || !PAN_RE.test(pan)) {
      skipped += 1;
      results.push({
        id: app.id,
        name: app.display_name,
        maskedPan: maskPan(app.pan),
        status: app.allotment_status,
        message: 'Member PAN is missing or invalid',
        skipped: true,
      });
      continue;
    }

    const lookup = await pickAllotmentResult(names, pan);
    if (!lookup?.status || lookup.kind === 'unmatched') {
      skipped += 1;
      results.push({
        id: app.id,
        name: app.display_name,
        maskedPan: maskPan(pan),
        status: app.allotment_status,
        platform: lookup.platform || null,
        message: lookup.message,
        skipped: true,
      });
      continue;
    }

    if (lookup.status === 'RETRY') {
      failed += 1;
      await pool.query(
        `UPDATE ipo_applications
         SET allotment_status = 'RETRY', allotment_checked_at = ?
         WHERE id = ? AND tenant_id = ?`,
        [toSqlDateTime(new Date()), app.id, tenantId]
      );
      results.push({
        id: app.id,
        name: app.display_name,
        maskedPan: maskPan(pan),
        status: 'RETRY',
        platform: lookup.platform,
        message: lookup.message || 'Registrar asked to retry',
      });
      await sleep(applicationId ? 0 : DELAY_MS);
      continue;
    }

    const allottedLots = lookup.status === 'ALLOTED' || lookup.status === 'PARTIALLY_ALLOTTED'
      ? sharesToLots(lookup.allottedShares, lotSize)
      : 0;

    await withTransaction((conn) => saveAllotmentResult(conn, {
      tenantId,
      applicationId: app.id,
      result: lookup.status,
      allottedLots: lookup.status === 'NOT_ALLOTED' ? 0 : allottedLots,
      applicationNumber: lookup.applicationNumber || app.application_number || undefined,
    }));
    checked += 1;
    if (lookup.status === 'ALLOTED' || lookup.status === 'PARTIALLY_ALLOTTED') allotted += 1;
    if (lookup.status === 'NOT_ALLOTED') notAllotted += 1;
    results.push({
      id: app.id,
      name: app.display_name,
      maskedPan: maskPan(pan),
      status: lookup.status,
      allottedLots: lookup.status === 'NOT_ALLOTED' ? 0 : allottedLots,
      allottedShares: lookup.allottedShares ?? null,
      platform: lookup.platform,
      platformCompany: lookup.platformCompany || null,
    });
    await sleep(applicationId ? 0 : DELAY_MS);
  }

  const [[remaining]] = await pool.query(
    `SELECT COUNT(*) AS c FROM ipo_applications a
     WHERE a.ipo_id = ? AND a.tenant_id = ? AND a.allotment_status IN ('PENDING', 'CHECKING', 'RETRY', 'ERROR')`,
    [ipoId, tenantId]
  );

  return {
    success: true,
    provider: 'mufg',
    providerLabel: 'MUFG Intime',
    ipo: { id: ipo.id, name: ipo.name, registrar: ipo.registrar || ipo.registrar_code },
    checked,
    allotted,
    notAllotted,
    skipped,
    failed,
    remaining: Number(remaining?.c || 0),
    results,
  };
}
