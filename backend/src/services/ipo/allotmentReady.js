import { AppError } from '../../middleware/errorHandler.js';
import { formatDateIst, normalizeLiveStatus, deriveStatusFromDates, toDate } from './normalize.js';

const GATE_SQL = `SELECT i.id, i.name, i.status, i.open_date, i.last_apply_date, i.listing_date, i.allotment_date,
        i.catalog_id, c.status AS catalog_status,
        c.open_date AS catalog_open_date,
        c.close_date AS catalog_close_date,
        c.allotment_date AS catalog_allotment_date,
        c.listing_date AS catalog_listing_date
     FROM ipos i
     LEFT JOIN ipo_catalog c ON c.id = i.catalog_id
     WHERE i.id = ? AND i.tenant_id = ?`;

export function allotmentCheckGate(ipo, { now = new Date() } = {}) {
  const today = formatDateIst(now);
  const openDate = toDate(ipo?.catalog_open_date || ipo?.open_date);
  const closeDate = toDate(ipo?.catalog_close_date || ipo?.last_apply_date || ipo?.close_date);
  const listingDate = toDate(ipo?.catalog_listing_date || ipo?.listing_date);
  const allotmentDate = toDate(ipo?.catalog_allotment_date || ipo?.allotment_date);
  const catalogStatus = ipo?.catalog_status || ipo?.catalogStatus || null;
  const liveStatus = catalogStatus
    ? normalizeLiveStatus(catalogStatus, { openDate, closeDate, listingDate, now })
    : deriveStatusFromDates({ openDate, closeDate, listingDate, now });

  if (liveStatus === 'UPCOMING') {
    return {
      ready: false,
      liveStatus,
      allotmentDate,
      closeDate,
      reason: 'This IPO has not opened yet on NSE/BSE. Allotment check opens after the issue closes and SEBI allotment is published.',
    };
  }
  if (liveStatus === 'OPEN') {
    return {
      ready: false,
      liveStatus,
      allotmentDate,
      closeDate,
      reason: closeDate
        ? `This IPO is still open on NSE/BSE until ${closeDate}. Allotment check opens after the issue closes.`
        : 'This IPO is still open on NSE/BSE. Allotment check opens after the issue closes.',
    };
  }
  if (allotmentDate && allotmentDate > today) {
    return {
      ready: false,
      liveStatus,
      allotmentDate,
      closeDate,
      reason: `NSE/BSE allotment date is ${allotmentDate}. Results are not published yet — check after that date.`,
    };
  }
  if (!liveStatus && closeDate && closeDate > today) {
    return {
      ready: false,
      liveStatus,
      allotmentDate,
      closeDate,
      reason: `Issue closes on ${closeDate}. Allotment check opens after the close date.`,
    };
  }

  return {
    ready: true,
    liveStatus: liveStatus || 'CLOSED',
    allotmentDate,
    closeDate,
    reason: null,
  };
}

export function assertAllotmentCheckReady(ipo, opts) {
  const gate = allotmentCheckGate(ipo, opts);
  if (!gate.ready) {
    throw new AppError(gate.reason, 409, { code: 'ALLOTMENT_NOT_OPEN', details: gate });
  }
  return gate;
}

export async function loadIpoForAllotmentGate(pool, { tenantId, ipoId }) {
  const [rows] = await pool.query(GATE_SQL, [ipoId, tenantId]);
  return rows[0] || null;
}

export async function assertIpoAllotmentCheckReady(pool, { tenantId, ipoId }) {
  const ipo = await loadIpoForAllotmentGate(pool, { tenantId, ipoId });
  if (!ipo) throw new AppError('IPO not found', 404);
  assertAllotmentCheckReady(ipo);
  return ipo;
}
