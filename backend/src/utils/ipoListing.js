import { AppError } from '../middleware/errorHandler.js';
import { formatDateIst, toDate } from '../services/ipo/normalize.js';

/** IST calendar date used in SQL listing checks. */
export const IST_TODAY_SQL = `DATE(UTC_TIMESTAMP() + INTERVAL 330 MINUTE)`;

export function ipoListingDate(row) {
  if (!row) return null;
  return toDate(
    row.listing_date
    ?? row.listingDate
    ?? row.ipo_listing_date
    ?? row.catalog_listing_date
    ?? row.catalogListingDate
  );
}

/**
 * Withdrawal / P&L / receive are allowed once listing day has arrived.
 * Uses tenant listing_date, else the live catalog listing date or LISTED status.
 */
export function ipoIsListed(row, now = new Date()) {
  if (!row) return false;
  const today = formatDateIst(now);
  const listing = ipoListingDate(row);
  if (listing) return listing <= today;
  const status = String(row.catalog_status || row.catalogStatus || '').trim().toUpperCase();
  return status === 'LISTED' || status.startsWith('LISTED');
}

export function assertIpoListedForWithdrawal(row) {
  if (ipoIsListed(row)) return;
  throw new AppError('IPO is not listed yet. Wait for listing before entering withdrawal money.');
}

export function assertIpoListedForReceive(row) {
  if (row?.allotment_status !== 'ALLOTED') return;
  if (ipoIsListed(row)) return;
  throw new AppError(
    'This IPO is allotted but not listed yet. Wait for listing before receiving funds.'
  );
}

/** EXISTS(...) — application table alias `a`, joins tenant IPO + catalog. */
export const IPO_LISTED_EXISTS_SQL = `EXISTS (
  SELECT 1 FROM ipos ix
  LEFT JOIN ipo_catalog cx ON cx.id = ix.catalog_id
  WHERE ix.id = a.ipo_id
    AND (
      (COALESCE(ix.listing_date, cx.listing_date) IS NOT NULL
        AND COALESCE(ix.listing_date, cx.listing_date) <= ${IST_TODAY_SQL})
      OR (
        COALESCE(ix.listing_date, cx.listing_date) IS NULL
        AND UPPER(COALESCE(cx.status, '')) LIKE 'LISTED%'
      )
    )
)`;
