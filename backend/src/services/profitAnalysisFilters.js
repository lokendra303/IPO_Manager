/** Shared period filters for profit analysis (year + multi-month). */

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** IPO calendar date used for month/year buckets. */
export const IPO_PERIOD_DATE_SQL = 'COALESCE(i.open_date, DATE(i.created_at))';

/**
 * @param {Record<string, unknown>} query
 * @returns {{ year: number|null, months: number[] }}
 */
export function parseProfitAnalysisFilters(query = {}) {
  const yearRaw = query.year;
  const yearNum = yearRaw != null && yearRaw !== '' ? Number(yearRaw) : null;
  const year = yearNum && yearNum >= 2000 && yearNum <= 2100 ? yearNum : null;

  let months = [];
  // Months only make sense with a year (Jun alone is ambiguous across years).
  if (year) {
    const rawMonths = query.months;
    if (Array.isArray(rawMonths)) {
      months = rawMonths.map((m) => Number(m));
    } else if (typeof rawMonths === 'string' && rawMonths.trim()) {
      months = rawMonths.split(/[,\s]+/).map((s) => Number(s.trim()));
    } else if (rawMonths != null && rawMonths !== '') {
      months = [Number(rawMonths)];
    }
    months = [...new Set(months.filter((m) => Number.isInteger(m) && m >= 1 && m <= 12))].sort(
      (a, b) => a - b
    );
  }

  return { year, months };
}

/**
 * @param {{ year: number|null, months: number[] }} filters
 */
export function formatPeriodLabel(filters = {}) {
  const year = filters.year ?? null;
  const months = year ? (filters.months || []) : [];
  if (!year) return 'All time';
  if (!months.length) return String(year);
  const names = months.map((m) => MONTH_SHORT[m - 1] || String(m));
  return `${names.join(', ')} ${year}`;
}

export function hasPeriodFilter(filters = {}) {
  return Boolean(filters?.year);
}

/**
 * @returns {Promise<number[]|null>} null = no filter (all IPOs); [] = none match
 */
export async function resolvePeriodIpoIds(pool, tenantId, filters = {}) {
  if (!hasPeriodFilter(filters)) return null;

  const params = [tenantId];
  let sql = `
    SELECT i.id
    FROM ipos i
    WHERE i.tenant_id = ?
      AND COALESCE(i.is_invalid, 0) = 0`;

  if (filters.year) {
    sql += ` AND YEAR(${IPO_PERIOD_DATE_SQL}) = ?`;
    params.push(filters.year);
  }
  if (filters.months?.length) {
    sql += ` AND MONTH(${IPO_PERIOD_DATE_SQL}) IN (${filters.months.map(() => '?').join(',')})`;
    params.push(...filters.months);
  }

  const [rows] = await pool.query(sql, params);
  return rows.map((r) => Number(r.id));
}

/**
 * Append `AND col IN (...)` (or `AND 1=0` when empty).
 * @param {number[]|null} ipoIds
 * @param {unknown[]} params
 */
export function appendIpoIdIn(columnSql, ipoIds, params) {
  if (ipoIds == null) return '';
  if (!ipoIds.length) return ' AND 1=0';
  params.push(...ipoIds);
  return ` AND ${columnSql} IN (${ipoIds.map(() => '?').join(',')})`;
}
