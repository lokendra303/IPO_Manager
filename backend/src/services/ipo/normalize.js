import { buildExternalId, buildIdentityKey } from './identity.js';
import { estimatedListingPrice, gmpPercentage, parseGmpValue, parseIssuePrice } from './gmpCalc.js';
import { normalizeRegistrarCode } from './registrarNormalize.js';

export const LIVE_STATUSES = ['UPCOMING', 'OPEN', 'CLOSED', 'LISTED'];
/** Indian mainboard/SME bidding typically closes at 5:00 PM IST on the close date. */
export const IPO_CLOSE_MINUTES_IST = 17 * 60;

export function formatDateIst(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function istMinutesSinceMidnight(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return 0;
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value || 0);
  const minute = Number(parts.find((p) => p.type === 'minute')?.value || 0);
  return hour * 60 + minute;
}

const MONTH_INDEX = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4,
  may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8,
  september: 9, sep: 9, sept: 9, october: 10, oct: 10, november: 11, nov: 11,
  december: 12, dec: 12,
};

function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * Parse provider timestamps in IST. Year-less stamps like "31 Aug, 14:36"
 * must not go through Date.parse (V8 treats that as 2001).
 */
export function parseIstDateTime(value, now = new Date()) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number' || /^\d{10,13}$/.test(String(value).trim())) {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    const ms = n > 1e12 ? n : n * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const s = String(value).trim();
  const named = s.match(
    /^(\d{1,2})\s+([A-Za-z]+)(?:\s+(\d{4}))?,?\s+(\d{1,2}):(\d{2})(?:\s*(AM|PM))?(?:\s*IST)?$/i
  );
  if (named) {
    const day = Number(named[1]);
    const month = MONTH_INDEX[named[2].toLowerCase()];
    const year = named[3] ? Number(named[3]) : Number(formatDateIst(now).slice(0, 4));
    let hour = Number(named[4]);
    const minute = Number(named[5]);
    const ampm = named[6] ? named[6].toUpperCase() : null;
    if (ampm === 'PM' && hour < 12) hour += 12;
    if (ampm === 'AM' && hour === 12) hour = 0;
    if (!month || day < 1 || day > 31) return null;
    const d = new Date(`${year}-${pad2(month)}-${pad2(day)}T${pad2(hour)}:${pad2(minute)}:00+05:30`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const parsed = Date.parse(s);
  if (Number.isNaN(parsed)) return null;
  const d = new Date(parsed);
  if (d.getFullYear() < 2020 && !/\d{4}/.test(s)) return null;
  return d;
}

export function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return formatDateIst(value);
  }
  const s = String(value).trim();
  if (!s || s.startsWith('0000-00-00')) return null;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return formatDateIst(d);
}

function toNum(value) {
  if (value == null || value === '') return null;
  const n = Number(String(value).replace(/,/g, '').replace(/₹/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

function parsePriceBand(band) {
  if (band == null || band === '') return { min: null, max: null };
  if (typeof band === 'object') {
    return { min: toNum(band.min ?? band.priceMin), max: toNum(band.max ?? band.priceMax) };
  }
  const parts = String(band).split(/-|–|to/i).map((p) => toNum(p.trim())).filter((n) => n != null);
  if (!parts.length) return { min: null, max: null };
  if (parts.length === 1) return { min: parts[0], max: parts[0] };
  return { min: parts[0], max: parts[parts.length - 1] };
}

export function normalizeMarketType(value) {
  const s = String(value || '').toLowerCase();
  if (s.includes('sme') || s === 'emerge') return 'SME';
  return 'MAINBOARD';
}

export function deriveStatusFromDates({ openDate, closeDate, listingDate, now = new Date() } = {}) {
  const today = formatDateIst(now);
  const minutes = istMinutesSinceMidnight(now);
  const open = toDate(openDate);
  const close = toDate(closeDate);
  const listing = toDate(listingDate);

  if (listing && listing <= today) return 'LISTED';
  if (close) {
    if (close < today) return 'CLOSED';
    if (close === today && minutes >= IPO_CLOSE_MINUTES_IST) return 'CLOSED';
  }
  if (open && open > today) return 'UPCOMING';
  if (open && open <= today) {
    if (!close || close > today || (close === today && minutes < IPO_CLOSE_MINUTES_IST)) return 'OPEN';
  }
  if (!open && close && close > today) return 'UPCOMING';
  if (!open && close && close === today && minutes < IPO_CLOSE_MINUTES_IST) return 'OPEN';
  return null;
}

export function normalizeLiveStatus(value, dates = {}) {
  const s = String(value || '').trim().toLowerCase();
  if (s === 'listed' || s === 'listing' || s.startsWith('listed')) return 'LISTED';
  const fromDates = deriveStatusFromDates(dates);
  if (fromDates) return fromDates;
  if (['upcoming', 'forthcoming', 'announced'].includes(s)) return 'UPCOMING';
  if (['open', 'live', 'ongoing'].includes(s)) return 'OPEN';
  if (['closed', 'close', 'allotment'].includes(s)) return 'CLOSED';
  return 'UPCOMING';
}

/**
 * Convert any provider payload into the internal catalog shape.
 * Missing provider fields stay null — never fabricate values.
 */
export function normalizeLiveIpo(raw, sourceProvider, { now } = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const name = String(raw.name || raw.ipoName || raw.company || '').trim();
  if (!name) return null;

  const companyName = String(raw.companyName || raw.company_name || raw.company || name).trim() || name;
  const openDate = toDate(raw.openDate || raw.open_date || raw.bidding_start_date);
  const closeDate = toDate(raw.closeDate || raw.close_date || raw.bidding_end_date);
  const allotmentDate = toDate(raw.allotmentDate || raw.allotment_date || raw.timeline?.allotment_date);
  const listingDate = toDate(raw.listingDate || raw.listing_date || raw.timeline?.listing_date);
  const band = parsePriceBand(raw.priceBand || raw.price_band);
  const priceMin = toNum(raw.priceMin || raw.price_min || raw.minimum_price) ?? band.min;
  const priceMax = toNum(raw.priceMax || raw.price_max || raw.maximum_price) ?? band.max;
  const issuePrice = parseIssuePrice(raw.issuePrice || raw.issue_price || raw.cut_off_price) ?? priceMax;
  const lotSize = toNum(raw.lotSize || raw.lot_size);
  const gmpSource = raw.gmp && typeof raw.gmp === 'object' ? raw.gmp.price : (raw.gmp ?? raw.gmpPrice);
  const gmp = parseGmpValue(gmpSource);
  const providedPct = raw.gmpPercentage ?? raw.gmp_percentage ?? raw.gmp?.percentage;
  const gmpPct = providedPct != null && providedPct !== ''
    ? toNum(providedPct)
    : gmpPercentage(gmp, issuePrice);
  const estimated = raw.estimatedListingPrice ?? raw.estimated_listing_price
    ?? estimatedListingPrice(issuePrice, gmp);
  const registrarRaw = raw.registrar || raw.registrar_name || raw.registrar_info?.name || raw.registrar_info?.registrar || null;
  const sub = raw.subscription && typeof raw.subscription === 'object' ? raw.subscription : {};
  const status = normalizeLiveStatus(raw.status, { openDate, closeDate, listingDate, now });
  const marketType = normalizeMarketType(raw.marketType || raw.market_type || raw.type || raw.issue_type || raw.ipo_type);
  const externalId = buildExternalId({
    externalId: raw.externalId || raw.external_id || raw.id || raw.symbol,
    name,
    companyName,
    openDate,
  });
  const identityKey = buildIdentityKey({ companyName, name, openDate, closeDate });

  return {
    externalId,
    identityKey,
    name,
    companyName,
    symbol: raw.symbol ? String(raw.symbol).trim() : null,
    ipoType: raw.ipoType || raw.ipo_type || raw.sub_type || raw.issue_type || null,
    marketType,
    status,
    openDate,
    closeDate,
    allotmentDate,
    listingDate,
    priceMin,
    priceMax,
    issuePrice,
    lotSize: lotSize != null ? Math.round(lotSize) : null,
    issueSize: raw.issueSize != null
      ? String(raw.issueSize)
      : raw.issue_size != null
        ? String(raw.issue_size)
        : null,
    registrarCode: normalizeRegistrarCode(registrarRaw),
    registrarName: registrarRaw ? String(registrarRaw).trim() : null,
    exchange: raw.exchange || raw.listing_on || raw.listing_exchange || null,
    sourceProvider,
    gmp,
    gmpPercentage: gmpPct,
    estimatedListingPrice: estimated != null ? toNum(estimated) : null,
    gmpUpdatedAt: raw.gmpUpdatedAt || raw.gmp_updated_at || raw.gmp?.updated_at || null,
    subscriptionQib: sub.qib != null ? String(sub.qib) : (raw.subscription_qib != null ? String(raw.subscription_qib) : null),
    subscriptionNii: sub.nii != null ? String(sub.nii) : (raw.subscription_nii != null ? String(raw.subscription_nii) : null),
    subscriptionRetail: sub.retail != null ? String(sub.retail) : (raw.subscription_retail != null ? String(raw.subscription_retail) : null),
    subscriptionTotal: sub.total != null
      ? String(sub.total)
      : (raw.subscription_total != null ? String(raw.subscription_total) : (raw.total_subscription != null ? String(raw.total_subscription) : null)),
    subscriptionUpdatedAt: sub.updated_at || raw.subscription_updated_at || null,
    rawPayload: raw,
  };
}

export function canAddCatalogToMyIpos(status) {
  return status === 'OPEN' || status === 'UPCOMING';
}

export function serializeCatalogIpo(row, { isMyIpo = false, myIpoId = null } = {}) {
  if (!row) return null;
  const status = normalizeLiveStatus(row.status, {
    openDate: row.open_date,
    closeDate: row.close_date,
    listingDate: row.listing_date,
  });
  return {
    id: row.id,
    name: row.name,
    companyName: row.company_name,
    symbol: row.symbol,
    ipoType: row.ipo_type,
    marketType: row.market_type,
    status,
    canAddToMyIpos: canAddCatalogToMyIpos(status),
    openDate: row.open_date,
    closeDate: row.close_date,
    allotmentDate: row.allotment_date,
    listingDate: row.listing_date,
    priceMin: row.price_min != null ? Number(row.price_min) : null,
    priceMax: row.price_max != null ? Number(row.price_max) : null,
    issuePrice: row.issue_price != null ? Number(row.issue_price) : null,
    lotSize: row.lot_size != null ? Number(row.lot_size) : null,
    issueSize: row.issue_size,
    registrar: row.registrar_code || row.registrar_name,
    registrarCode: row.registrar_code,
    registrarName: row.registrar_name,
    exchange: row.exchange,
    gmp: row.gmp != null ? Number(row.gmp) : null,
    gmpPercentage: row.gmp_percentage != null ? Number(row.gmp_percentage) : null,
    estimatedListingPrice: row.estimated_listing_price != null ? Number(row.estimated_listing_price) : null,
    gmpLastUpdated: row.gmp_updated_at,
    subscription: {
      qib: row.subscription_qib,
      nii: row.subscription_nii,
      retail: row.subscription_retail,
      total: row.subscription_total,
      updatedAt: row.subscription_updated_at,
    },
    sourceProvider: row.source_provider,
    sourceLastUpdated: row.source_last_updated,
    isMyIpo: Boolean(isMyIpo),
    myIpoId,
    addedToMyIpoAt: row.added_to_my_ipo_at || null,
  };
}
