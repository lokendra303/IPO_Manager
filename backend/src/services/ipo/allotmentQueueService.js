import { AppError } from '../../middleware/errorHandler.js';
import { ALLOTMENT_STATUSES } from '../../utils/validate.js';
import { toSqlDateTime } from '../../utils/validate.js';
import { maskPan } from '../../utils/pan.js';
import { getAllotmentPortalsMeta } from '../../utils/allotmentCheck.js';

const CHECKING_STALE_MINUTES = 15;

const RESULT_TO_STATUS = {
  ALLOTTED: 'ALLOTED',
  ALLOTED: 'ALLOTED',
  PARTIALLY_ALLOTTED: 'PARTIALLY_ALLOTTED',
  NOT_ALLOTTED: 'NOT_ALLOTED',
  NOT_ALLOTED: 'NOT_ALLOTED',
  REJECTED: 'REJECTED',
  ERROR: 'ERROR',
  RETRY: 'RETRY',
  PENDING: 'PENDING',
};

function serializeApplicant(row) {
  return {
    id: row.id,
    memberId: row.member_id,
    name: row.display_name,
    maskedPan: maskPan(row.pan),
    applicationNumber: row.application_number || null,
    appliedLots: row.applied_lots != null ? Number(row.applied_lots) : null,
    appliedAmount: Number(row.amount),
    allotmentStatus: row.allotment_status,
    allottedLots: row.allotted_lots != null ? Number(row.allotted_lots) : null,
    allottedAmount: row.allotted_amount != null ? Number(row.allotted_amount) : null,
    checkedAt: row.allotment_checked_at,
  };
}

async function releaseStaleChecking(conn, ipoId, tenantId) {
  await conn.query(
    `UPDATE ipo_applications
     SET allotment_status = 'PENDING'
     WHERE ipo_id = ? AND tenant_id = ? AND allotment_status = 'CHECKING'
       AND (allotment_checked_at IS NULL OR allotment_checked_at < (NOW() - INTERVAL ? MINUTE))`,
    [ipoId, tenantId, CHECKING_STALE_MINUTES]
  );
}

export async function getAllotmentQueue(conn, { tenantId, ipoId }) {
  const [ipoRows] = await conn.query(
    `SELECT i.id, i.name, i.status, i.registrar, i.catalog_id, i.listing_date,
            c.registrar_code, c.registrar_name
     FROM ipos i
     LEFT JOIN ipo_catalog c ON c.id = i.catalog_id
     WHERE i.id = ? AND i.tenant_id = ?`,
    [ipoId, tenantId]
  );
  if (!ipoRows.length) throw new AppError('IPO not found', 404);
  const ipo = ipoRows[0];
  const registrar = ipo.registrar || ipo.registrar_code;

  await releaseStaleChecking(conn, ipoId, tenantId);

  const [applications] = await conn.query(
    `SELECT a.id, a.member_id, a.amount, a.allotment_status, a.application_number,
            a.applied_lots, a.allotted_lots, a.allotted_amount, a.allotment_checked_at,
            m.display_name, m.pan
     FROM ipo_applications a
     JOIN members m ON m.id = a.member_id
     WHERE a.ipo_id = ? AND a.tenant_id = ?
     ORDER BY m.display_name`,
    [ipoId, tenantId]
  );

  const counts = {
    total: applications.length,
    checked: 0,
    allotted: 0,
    partiallyAllotted: 0,
    notAllotted: 0,
    pending: 0,
    checking: 0,
    rejected: 0,
    error: 0,
    retry: 0,
    notApplied: 0,
  };
  for (const a of applications) {
    const s = a.allotment_status;
    if (s === 'PENDING') counts.pending += 1;
    else if (s === 'CHECKING') counts.checking += 1;
    else if (s === 'ALLOTED') counts.allotted += 1;
    else if (s === 'PARTIALLY_ALLOTTED') counts.partiallyAllotted += 1;
    else if (s === 'NOT_ALLOTED') counts.notAllotted += 1;
    else if (s === 'REJECTED') counts.rejected += 1;
    else if (s === 'ERROR') counts.error += 1;
    else if (s === 'RETRY') counts.retry += 1;
    else if (s === 'NOT_APPLIED') counts.notApplied += 1;
    if (s !== 'PENDING' && s !== 'CHECKING' && s !== 'RETRY') counts.checked += 1;
  }

  const lastChecked = applications
    .filter((a) => a.allotment_checked_at)
    .sort((a, b) => new Date(b.allotment_checked_at) - new Date(a.allotment_checked_at))
    .slice(0, 8)
    .map(serializeApplicant);

  return {
    ipo: {
      id: ipo.id,
      name: ipo.name,
      status: ipo.status,
      registrar,
      registrarName: ipo.registrar_name || registrar,
      listing_date: ipo.listing_date || null,
      listingDate: ipo.listing_date || null,
    },
    counts,
    portals: getAllotmentPortalsMeta(registrar).portals,
    applications: applications.map(serializeApplicant),
    lastChecked,
    note: 'Click Check allotment to query MUFG Intime from the server and update each member. No registrar website is opened.',
  };
}

export async function claimNextPending(conn, { tenantId, ipoId }) {
  await releaseStaleChecking(conn, ipoId, tenantId);

  const [checking] = await conn.query(
    `SELECT a.id, a.member_id, a.amount, a.allotment_status, a.application_number,
            a.applied_lots, a.allotted_lots, a.allotted_amount, a.allotment_checked_at,
            m.display_name, m.pan
     FROM ipo_applications a
     JOIN members m ON m.id = a.member_id
     WHERE a.ipo_id = ? AND a.tenant_id = ? AND a.allotment_status = 'CHECKING'
     ORDER BY a.id ASC LIMIT 1`,
    [ipoId, tenantId]
  );
  if (checking.length) {
    return { applicant: serializeApplicant(checking[0]), claimed: false };
  }

  const [pending] = await conn.query(
    `SELECT a.id
     FROM ipo_applications a
     WHERE a.ipo_id = ? AND a.tenant_id = ?
       AND a.allotment_status IN ('PENDING', 'RETRY', 'ERROR')
     ORDER BY a.id ASC LIMIT 1
     FOR UPDATE`,
    [ipoId, tenantId]
  );
  if (!pending.length) return { applicant: null, claimed: false, done: true };

  await conn.query(
    `UPDATE ipo_applications
     SET allotment_status = 'CHECKING', allotment_checked_at = ?
     WHERE id = ? AND tenant_id = ?`,
    [toSqlDateTime(new Date()), pending[0].id, tenantId]
  );

  const [rows] = await conn.query(
    `SELECT a.id, a.member_id, a.amount, a.allotment_status, a.application_number,
            a.applied_lots, a.allotted_lots, a.allotted_amount, a.allotment_checked_at,
            m.display_name, m.pan
     FROM ipo_applications a
     JOIN members m ON m.id = a.member_id
     WHERE a.id = ?`,
    [pending[0].id]
  );
  return { applicant: serializeApplicant(rows[0]), claimed: true, done: false };
}

export async function saveAllotmentResult(conn, { tenantId, applicationId, result, allottedLots, applicationNumber }) {
  const status = RESULT_TO_STATUS[String(result || '').toUpperCase()];
  if (!status || !ALLOTMENT_STATUSES.includes(status)) {
    throw new AppError('Invalid allotment result');
  }

  const [rows] = await conn.query(
    `SELECT a.*, i.id AS ipo_exists
     FROM ipo_applications a
     JOIN ipos i ON i.id = a.ipo_id AND i.tenant_id = a.tenant_id
     WHERE a.id = ? AND a.tenant_id = ?`,
    [applicationId, tenantId]
  );
  if (!rows.length) throw new AppError('Application not found', 404);
  const app = rows[0];

  const lots = allottedLots == null || allottedLots === '' ? null : Number(allottedLots);
  if ((status === 'ALLOTED' || status === 'PARTIALLY_ALLOTTED') && (lots == null || Number.isNaN(lots) || lots < 0)) {
    throw new AppError('Allotted lots are required for allotted / partial results');
  }

  const fields = ['allotment_status = ?', 'allotment_checked_at = ?'];
  const values = [status, toSqlDateTime(new Date())];
  if (lots != null && !Number.isNaN(lots)) {
    fields.push('allotted_lots = ?');
    values.push(lots);
  }
  if (applicationNumber != null) {
    fields.push('application_number = ?');
    values.push(String(applicationNumber).slice(0, 50) || null);
  }
  values.push(applicationId, tenantId);
  await conn.query(
    `UPDATE ipo_applications SET ${fields.join(', ')} WHERE id = ? AND tenant_id = ?`,
    values
  );

  return { ipoId: app.ipo_id, status };
}
