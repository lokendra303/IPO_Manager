function toNumber(value) {
  if (value == null || value === '') return null;
  const n = Number(String(value).replace(/,/g, '').replace(/₹/g, '').trim());
  return Number.isFinite(n) ? n : null;
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
 * inside the given window (default 15 minutes).
 */
export function isDuplicateGmpSample(previous, nextGmp, now = new Date(), windowMs = 15 * 60 * 1000) {
  if (!previous) return false;
  if (parseGmpValue(previous.gmp) !== parseGmpValue(nextGmp)) return false;
  const recorded = previous.recorded_at instanceof Date
    ? previous.recorded_at
    : new Date(previous.recorded_at);
  if (Number.isNaN(recorded.getTime())) return false;
  return now.getTime() - recorded.getTime() < windowMs;
}
