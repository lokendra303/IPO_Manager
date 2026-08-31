import { AppError } from '../../../middleware/errorHandler.js';
import { providerFetch } from '../httpClient.js';
import { formatDateIst, normalizeLiveIpo, parseIstDateTime } from '../normalize.js';

/**
 * Downstox public IPO GMP API — documented at https://downstox.com/api-docs
 *
 * GET https://downstox.com/api/ipo/gmp
 * Auth: none (no API key, signup, or cookie)
 * OpenAPI: https://downstox.com/openapi.json  (operationId getIpoGmp)
 *
 * `type` is the IPO lifecycle (Upcoming / Open / Closed / Listed @ price),
 * not Mainboard vs SME. `date` is a bidding window like "27-31 August".
 * `status` is the GMP last-updated stamp, e.g. "31 Aug, 14:36".
 */
const MONTHS = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

function pad2(n) {
  return String(n).padStart(2, '0');
}

export function parseDownstoxDateRange(dateStr, now = new Date()) {
  const s = String(dateStr || '').trim();
  const m = s.match(/^(\d{1,2})\s*[-–]\s*(\d{1,2})\s+([A-Za-z]+)/);
  if (!m) return { openDate: null, closeDate: null };
  const startDay = Number(m[1]);
  const endDay = Number(m[2]);
  const endMonth = MONTHS[m[3].toLowerCase()];
  if (!endMonth || !startDay || !endDay) return { openDate: null, closeDate: null };

  const today = formatDateIst(now);
  const year = Number(today.slice(0, 4));
  const thisMonth = Number(today.slice(5, 7));
  let startMonth = endMonth;
  if (startDay > endDay) startMonth = endMonth === 1 ? 12 : endMonth - 1;

  let startYear = year;
  let endYear = year;
  if (startMonth === 12 && endMonth === 1) {
    if (thisMonth === 1) startYear = year - 1;
    else endYear = year + 1;
  }

  return {
    openDate: `${startYear}-${pad2(startMonth)}-${pad2(startDay)}`,
    closeDate: `${endYear}-${pad2(endMonth)}-${pad2(endDay)}`,
  };
}

export function mapDownstoxTypeToStatus(typeStr) {
  const s = String(typeStr || '').trim();
  if (/^listed/i.test(s)) return 'Listed';
  return s;
}

export function parseDownstoxListingPrice(typeStr) {
  const m = String(typeStr || '').match(/listed\s*@\s*([\d.]+)/i);
  return m ? m[1] : null;
}

function cleanCompanyName(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function mapDownstoxRow(row, now = new Date(), feedUpdatedAt = null) {
  if (!row || typeof row !== 'object') return null;
  const company = cleanCompanyName(row.company);
  if (!company) return null;
  const dates = parseDownstoxDateRange(row.date, now);
  const listingPrice = parseDownstoxListingPrice(row.type);
  const name = /ipo$/i.test(company) ? company : `${company} IPO`;
  const gmpUpdated = parseIstDateTime(row.status, now) || parseIstDateTime(feedUpdatedAt, now);
  return normalizeLiveIpo({
    name,
    companyName: company,
    externalId: row.slug || row.norm || company,
    symbol: row.norm || null,
    status: mapDownstoxTypeToStatus(row.type),
    open_date: dates.openDate,
    close_date: dates.closeDate,
    listing_price: listingPrice,
    issue_price: row.priceBand,
    price_min: row.priceBand,
    price_max: row.priceBand,
    gmp: {
      price: row.gmp,
      percentage: row.gainPct,
      updated_at: gmpUpdated ? gmpUpdated.toISOString() : null,
    },
    estimated_listing_price: row.estListing,
  }, 'downstox', { now });
}

export function createDownstoxProvider({
  baseUrl = process.env.DOWNSTOX_API_BASE_URL || 'https://downstox.com',
} = {}) {
  const root = String(baseUrl || '').replace(/\/$/, '');

  return {
    name: 'downstox',
    supportsDedicatedGmp: false,
    async getLiveIpos() {
      const json = await providerFetch(`${root}/api/ipo/gmp`, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'IPO-Team-Manager/1.0 (live IPO sync)',
        },
      });
      if (!json || json.success === false) {
        throw new AppError('IPO provider temporarily unavailable', 503, { code: 'PROVIDER_UNAVAILABLE' });
      }
      const rows = Array.isArray(json.rows) ? json.rows : [];
      const now = new Date();
      return rows.map((row) => mapDownstoxRow(row, now, json.updatedAt)).filter(Boolean);
    },
    async getIpoDetails(externalId) {
      const list = await this.getLiveIpos();
      return list.find((row) => row.externalId === externalId) || null;
    },
    async getGmp(externalId) {
      const details = await this.getIpoDetails(externalId);
      if (!details) return null;
      return {
        gmp: details.gmp,
        gmpPercentage: details.gmpPercentage,
        estimatedListingPrice: details.estimatedListingPrice,
        updatedAt: details.gmpUpdatedAt,
      };
    },
    async getSubscription() {
      return null;
    },
    async getRegistrar() {
      return null;
    },
  };
}
