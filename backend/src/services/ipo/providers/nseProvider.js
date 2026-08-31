import { AppError } from '../../../middleware/errorHandler.js';
import { normalizeLiveIpo } from '../normalize.js';
import { normalizeCompanyName } from '../identity.js';

/**
 * NSE India public IPO JSON used by https://www.nseindia.com/market-data/ipo
 * (same paths as nse-bse-api: /api/ipo-current-issue, /api/all-upcoming-issues,
 * /api/public-past-issues, /api/ipo-detail). No API key.
 */
const NSE_API = 'https://www.nseindia.com/api';
const NSE_HOME = 'https://www.nseindia.com/market-data/ipo';
const NSE_HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Referer: NSE_HOME,
};

let nseCookie = '';
let nseCookieAt = 0;
const NSE_COOKIE_TTL_MS = 8 * 60 * 1000;

function mergeCookies(existing, response) {
  const jar = new Map();
  for (const part of String(existing || '').split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k) jar.set(k, rest.join('='));
  }
  const raw = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [];
  for (const line of raw) {
    const nv = String(line).split(';')[0];
    const eq = nv.indexOf('=');
    if (eq > 0) jar.set(nv.slice(0, eq).trim(), nv.slice(eq + 1).trim());
  }
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

async function nseWarmup() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(NSE_HOME, { headers: NSE_HEADERS, signal: controller.signal, redirect: 'follow' });
    nseCookie = mergeCookies(nseCookie, res);
    nseCookieAt = Date.now();
  } finally {
    clearTimeout(timer);
  }
}

const MONTH3 = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function pad2(n) {
  return String(n).padStart(2, '0');
}

export function parseNseDate(value) {
  if (!value) return null;
  const s = String(value).trim();
  if (!s || s === '-') return null;
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const named = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (named) {
    const month = MONTH3[named[2].toLowerCase()];
    if (!month) return null;
    return `${named[3]}-${pad2(month)}-${pad2(Number(named[1]))}`;
  }
  return null;
}

export function parseNsePriceBand(value) {
  return String(value || '')
    .replace(/rs\.?/gi, '')
    .replace(/\/-/g, '')
    .replace(/per.*/i, '')
    .replace(/,/g, '')
    .trim();
}

export function parseNseLot(value) {
  const m = String(value || '').replace(/,/g, '').match(/(\d+)/);
  return m ? Number(m[1]) : null;
}

export function parseNseTimes(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return String(Math.round(n * 100) / 100);
}

function nseStatus(row) {
  const s = String(row.status || '').toLowerCase();
  if (s.includes('forthcoming') || s.includes('upcoming')) return 'Upcoming';
  if (s.includes('active') || s.includes('open')) return 'Open';
  if (parseNseDate(row.listingDate || row.listing_date)) return 'Listed';
  return 'Closed';
}

function mapIssueInfo(issueInfo) {
  const map = {};
  for (const row of issueInfo?.dataList || []) {
    const title = String(row?.title || '').trim().toLowerCase();
    if (!title) continue;
    map[title] = String(row.value || '').replace(/^"+|"+$/g, '').trim();
  }
  return map;
}

function mapBidDetails(bidDetails) {
  const sub = { qib: null, nii: null, retail: null, total: null, updated_at: new Date().toISOString() };
  for (const row of bidDetails || []) {
    const cat = String(row.category || '').trim();
    const times = parseNseTimes(row.noOfTime);
    if (!times) continue;
    if (cat === 'Total') sub.total = times;
    else if (cat.startsWith('Qualified Institutional Buyers')) sub.qib = times;
    else if (cat === 'Non Institutional Investors') sub.nii = times;
    else if (cat.startsWith('Retail Individual Investors')) sub.retail = times;
  }
  return sub;
}

export function applyNseDetails(item, detail) {
  if (!item || !detail) return item;
  const info = mapIssueInfo(detail.issueInfo);
  const lot = parseNseLot(info['bid lot'] || info['minimum order quantity']);
  const sub = mapBidDetails(detail.bidDetails);
  const registrar = info.registrar || info['registrar to the issue'] || null;
  return {
    ...item,
    lotSize: lot ?? item.lotSize,
    registrarName: registrar || item.registrarName,
    subscriptionQib: sub.qib || item.subscriptionQib,
    subscriptionNii: sub.nii || item.subscriptionNii,
    subscriptionRetail: sub.retail || item.subscriptionRetail,
    subscriptionTotal: sub.total || item.subscriptionTotal,
    subscriptionUpdatedAt: sub.updated_at || item.subscriptionUpdatedAt,
    rawPayload: { list: item.rawPayload, detail },
  };
}

export function mapNseListRow(row) {
  if (!row || typeof row !== 'object') return null;
  const company = String(row.companyName || row.company || '').trim();
  if (!company) return null;
  const openDate = parseNseDate(row.issueStartDate || row.ipoStartDate);
  const closeDate = parseNseDate(row.issueEndDate || row.ipoEndDate);
  const listingDate = parseNseDate(row.listingDate);
  const series = String(row.series || row.securityType || 'EQ');
  const band = parseNsePriceBand(row.issuePrice || row.priceRange);
  const subTotal = parseNseTimes(row.noOfTime);
  return normalizeLiveIpo({
    name: /ipo$/i.test(company) ? company : `${company} IPO`,
    companyName: company,
    symbol: row.symbol || row.htmSym || null,
    externalId: row.symbol || company,
    series,
    type: series,
    status: nseStatus(row),
    open_date: openDate,
    close_date: closeDate,
    listing_date: listingDate,
    price_band: band,
    issue_size: row.issueSize && !String(row.issueSize).includes('Rs')
      ? `${row.issueSize} shares`
      : row.issueSize,
    listing_on: 'NSE',
    subscription: subTotal ? { total: subTotal, updated_at: new Date().toISOString() } : {},
  }, 'nse');
}

function asArray(json) {
  if (Array.isArray(json)) return json;
  if (json && Array.isArray(json.data)) return json.data;
  return [];
}

function dmy(d) {
  return `${pad2(d.getDate())}-${pad2(d.getMonth() + 1)}-${d.getFullYear()}`;
}

async function nseGet(path, { retried = false } = {}) {
  if (!nseCookie || Date.now() - nseCookieAt > NSE_COOKIE_TTL_MS) {
    try {
      await nseWarmup();
    } catch {
      // List endpoints sometimes work without a prior homepage hit.
    }
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(`${NSE_API}${path}`, {
      headers: { ...NSE_HEADERS, ...(nseCookie ? { Cookie: nseCookie } : {}) },
      signal: controller.signal,
    });
    nseCookie = mergeCookies(nseCookie, res);
    nseCookieAt = Date.now();
    if ((res.status === 401 || res.status === 403) && !retried) {
      nseCookie = '';
      try {
        await nseWarmup();
      } catch {
        throw new AppError('IPO provider temporarily unavailable', 503, { code: 'PROVIDER_UNAVAILABLE' });
      }
      return nseGet(path, { retried: true });
    }
    if (!res.ok) {
      throw new AppError('IPO provider temporarily unavailable', 503, { code: 'PROVIDER_UNAVAILABLE' });
    }
    const text = await res.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      throw new AppError('IPO provider returned an invalid response', 503, { code: 'PROVIDER_INVALID' });
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    const aborted = err?.name === 'AbortError';
    throw new AppError(
      aborted ? 'IPO provider request timed out' : 'IPO provider temporarily unavailable',
      503,
      { code: aborted ? 'PROVIDER_TIMEOUT' : 'PROVIDER_UNAVAILABLE' }
    );
  } finally {
    clearTimeout(timer);
  }
}

export function createNseProvider({ fetchDetails = process.env.NSE_IPO_DETAILS !== '0' } = {}) {
  return {
    name: 'nse',
    supportsDedicatedGmp: false,
    async getLiveIpos() {
      const now = new Date();
      const from = new Date(now.getTime() - 90 * 86400000);
      const [current, upcoming, past] = await Promise.allSettled([
        nseGet('/ipo-current-issue'),
        nseGet('/all-upcoming-issues?category=ipo'),
        nseGet(`/public-past-issues?from_date=${dmy(from)}&to_date=${dmy(now)}`),
      ]);
      const lists = [current, upcoming, past]
        .filter((r) => r.status === 'fulfilled')
        .flatMap((r) => asArray(r.value).map(mapNseListRow).filter(Boolean));
      if (!lists.length) {
        throw new AppError('IPO provider temporarily unavailable', 503, { code: 'PROVIDER_UNAVAILABLE' });
      }
      const byKey = new Map();
      for (const row of lists) {
        const key = normalizeCompanyName(row.companyName || row.name);
        if (!key) continue;
        const prev = byKey.get(key);
        if (!prev || (row.subscriptionTotal && !prev.subscriptionTotal)) byKey.set(key, row);
      }
      let items = [...byKey.values()];
      if (fetchDetails) {
        const toEnrich = items.filter((r) => r.symbol && (r.status === 'OPEN' || r.status === 'UPCOMING' || r.status === 'CLOSED')).slice(0, 12);
        const concurrency = 3;
        for (let i = 0; i < toEnrich.length; i += concurrency) {
          const batch = toEnrich.slice(i, i + concurrency);
          await Promise.all(batch.map(async (item) => {
            try {
              const series = item.marketType === 'SME' ? 'SME' : 'EQ';
              const detail = await nseGet(`/ipo-detail?symbol=${encodeURIComponent(item.symbol)}&series=${encodeURIComponent(series)}`);
              const enriched = applyNseDetails(item, detail);
              if (enriched) {
                const key = normalizeCompanyName(item.companyName || item.name);
                byKey.set(key, enriched);
              }
            } catch {
              // Keep the list row if details are unavailable.
            }
          }));
        }
        items = [...byKey.values()];
      }
      return items;
    },
    async getIpoDetails() {
      return null;
    },
    async getGmp() {
      return null;
    },
    async getSubscription() {
      return null;
    },
    async getRegistrar() {
      return null;
    },
  };
}
