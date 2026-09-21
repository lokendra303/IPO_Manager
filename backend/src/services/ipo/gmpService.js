import { toSqlDateTime } from '../../utils/validate.js';
import {
  attachCurrentGmp,
  collapseGmpHistoryByDay,
  estimatedListingPrice,
  gmpChangedSignificantly,
  gmpPercentage,
  isDuplicateGmpSample,
  parseGmpValue,
  summarizeGmpHistory,
} from './gmpCalc.js';
import { recordNotification } from './notificationService.js';

function parseMaybeDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export async function recordGmpSample(conn, catalogRow, { gmp, gmpPercentage: pct, estimatedListingPrice: est, source, now = new Date() }) {
  const prem = parseGmpValue(gmp);
  if (prem == null) return { saved: false, reason: 'no_gmp' };

  const issuePrice = catalogRow.issue_price != null ? Number(catalogRow.issue_price) : null;
  const percentage = pct != null && Number(pct) !== 0 ? Number(pct) : gmpPercentage(prem, issuePrice);
  const providedEst = est != null ? Number(est) : null;
  const estimated = providedEst != null && providedEst > 0
    ? providedEst
    : estimatedListingPrice(issuePrice, prem);

  const [prevRows] = await conn.query(
    `SELECT gmp, recorded_at FROM ipo_gmp_history
     WHERE catalog_id = ? ORDER BY recorded_at DESC, id DESC LIMIT 1`,
    [catalogRow.id]
  );
  const previous = prevRows[0] || null;
  if (isDuplicateGmpSample(previous, prem, now)) {
    return { saved: false, reason: 'duplicate' };
  }

  await conn.query(
    `INSERT INTO ipo_gmp_history
     (catalog_id, gmp, gmp_percentage, estimated_listing_price, source, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [catalogRow.id, prem, percentage, estimated, source || catalogRow.source_provider, toSqlDateTime(now)]
  );

  if (previous && gmpChangedSignificantly(previous.gmp, prem)) {
    await recordNotification(conn, {
      catalogId: catalogRow.id,
      type: 'GMP_CHANGED',
      title: `${catalogRow.name}: GMP changed significantly`,
      body: `GMP moved from ₹${previous.gmp} to ₹${prem}`,
      payload: { previous: Number(previous.gmp), current: prem },
    });
  }

  return { saved: true, gmp: prem, gmpPercentage: percentage, estimatedListingPrice: estimated };
}

export async function getGmpHistory(pool, catalogId) {
  const [rows] = await pool.query(
    `SELECT id, gmp, gmp_percentage, estimated_listing_price, source, recorded_at
     FROM ipo_gmp_history WHERE catalog_id = ? ORDER BY recorded_at ASC, id ASC`,
    [catalogId]
  );
  return rows.map((r) => ({
    id: r.id,
    gmp: Number(r.gmp),
    gmpPercentage: r.gmp_percentage != null ? Number(r.gmp_percentage) : null,
    estimatedListingPrice: r.estimated_listing_price != null ? Number(r.estimated_listing_price) : null,
    source: r.source,
    recordedAt: r.recorded_at,
  }));
}

export function presentGmpHistory(rows, current = null) {
  const daily = collapseGmpHistoryByDay(rows);
  const history = attachCurrentGmp(daily, current);
  return {
    history,
    summary: summarizeGmpHistory(history),
  };
}

function positivePrice(value) {
  const n = value != null ? Number(value) : null;
  return n != null && Number.isFinite(n) && n > 0 ? n : null;
}

export function toGmpCurrent(row) {
  if (!row) return null;
  const gmp = parseGmpValue(row.gmp);
  const issuePrice = parseGmpValue(row.issuePrice ?? row.issue_price);
  let pct = row.gmpPercentage ?? row.gmp_percentage;
  pct = pct != null && pct !== '' ? Number(pct) : null;
  if ((pct == null || pct === 0) && gmp) pct = gmpPercentage(gmp, issuePrice);
  const est = positivePrice(row.estimatedListingPrice ?? row.estimated_listing_price)
    ?? estimatedListingPrice(issuePrice, gmp);
  return {
    gmp,
    gmpPercentage: pct,
    estimatedListingPrice: est,
    lastUpdated: row.lastUpdated ?? row.gmpLastUpdated ?? row.gmp_updated_at ?? null,
  };
}

export { parseMaybeDate };
