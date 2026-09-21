function toNumber(value) {
  if (value == null || value === '') return null;
  const n = Number(String(value).replace(/,/g, '').replace(/₹/g, '').replace(/%/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

/** Calendar day in IST, e.g. 2026-09-09. Used so GMP history is one point per day. */
export function istDateKey(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Last saved sample for each IST day, oldest day → newest. */
export function collapseGmpHistoryByDay(rows) {
  const byDay = new Map();
  for (const row of rows || []) {
    const key = istDateKey(row.recordedAt ?? row.recorded_at);
    if (!key) continue;
    const prev = byDay.get(key);
    if (!prev || sampleRank(row) >= sampleRank(prev)) byDay.set(key, row);
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, row]) => row);
}

function sampleRank(row) {
  if (row?.id === 'current') return Number.MAX_SAFE_INTEGER;
  const id = Number(row?.id);
  return Number.isFinite(id) ? id : -1;
}

export function attachCurrentGmp(history, current) {
  const gmp = parseGmpValue(current?.gmp);
  if (gmp == null) return history || [];
  const rows = [...(history || [])];
  const last = rows[rows.length - 1];
  const today = istDateKey(current.lastUpdated || current.last_updated || new Date());
  const lastDay = last ? istDateKey(last.recordedAt ?? last.recorded_at) : null;
  const lastGmp = last ? parseGmpValue(last.gmp) : null;
  const point = {
    id: last && lastDay === today ? last.id : 'current',
    gmp,
    gmpPercentage: current.gmpPercentage ?? current.gmp_percentage ?? null,
    estimatedListingPrice: (() => {
      const v = current.estimatedListingPrice ?? current.estimated_listing_price;
      return v != null && Number(v) > 0 ? Number(v) : null;
    })(),
    source: last?.source || null,
    recordedAt: current.lastUpdated || current.last_updated || last?.recordedAt || new Date(),
  };
  if (!last) return [point];
  if (lastGmp === gmp && lastDay === today) {
    rows[rows.length - 1] = { ...last, ...point, id: last.id };
    return rows;
  }
  if (lastGmp === gmp) return rows;
  rows.push(point);
  return rows;
}

export function parseGmpValue(value) {
  return toNumber(value);
}

export function parseIssuePrice(value) {
  return toNumber(value);
}

/** estimated_listing_price = issue_price + gmp */
export function estimatedListingPrice(issuePrice, gmp) {
  const price = parseIssuePrice(issuePrice);
  const prem = parseGmpValue(gmp);
  if (price == null || prem == null) return null;
  return Math.round((price + prem) * 100) / 100;
}

/** (gmp / issue_price) * 100 */
export function gmpPercentage(gmp, issuePrice) {
  const price = parseIssuePrice(issuePrice);
  const prem = parseGmpValue(gmp);
  if (price == null || price === 0 || prem == null) return null;
  return Math.round((prem / price) * 10000) / 100;
}

export function summarizeGmpHistory(rows) {
  const values = (rows || [])
    .map((r) => parseGmpValue(r.gmp))
    .filter((n) => n != null);
  if (!values.length) {
    return { highest: null, lowest: null, current: null, change: null };
  }
  const current = values[values.length - 1];
  const previous = values.length > 1 ? values[values.length - 2] : current;
  return {
    highest: Math.max(...values),
    lowest: Math.min(...values),
    current,
    change: Math.round((current - previous) * 100) / 100,
  };
}

export function gmpChangedSignificantly(previous, next, thresholdPercent = 20) {
  const prev = parseGmpValue(previous);
  const cur = parseGmpValue(next);
  if (prev == null || cur == null) return false;
  if (prev === 0) return cur !== 0;
  const delta = Math.abs((cur - prev) / prev) * 100;
  return delta >= thresholdPercent;
}

/**
 * Skip a new history row when the same GMP was already recorded
 * on this IST calendar day (or inside the short fallback window).
 */
export function isDuplicateGmpSample(previous, nextGmp, now = new Date(), windowMs = 15 * 60 * 1000) {
  if (!previous) return false;
  if (parseGmpValue(previous.gmp) !== parseGmpValue(nextGmp)) return false;
  const recorded = previous.recorded_at instanceof Date
    ? previous.recorded_at
    : new Date(previous.recorded_at ?? previous.recordedAt);
  if (Number.isNaN(recorded.getTime())) return false;
  if (istDateKey(recorded) === istDateKey(now)) return true;
  return now.getTime() - recorded.getTime() < windowMs;
}
