import { providerFetch } from '../httpClient.js';
import { normalizeLiveIpo } from '../normalize.js';

/**
 * IPO Alerts public list — https://ipoalerts.in/docs/api-reference/endpoints/get-all-ipos
 * Without an API key the docs return a partial list (1 IPO per status). Used only
 * to fill lot size / listing date when NSE/Downstox omit them.
 */
const STATUSES = ['open', 'upcoming', 'closed', 'listed'];

export function mapIpoAlertsRow(row) {
  if (!row || typeof row !== 'object') return null;
  const name = String(row.name || '').trim();
  if (!name) return null;
  return normalizeLiveIpo({
    name: /ipo$/i.test(name) ? name : `${name} IPO`,
    companyName: name,
    symbol: row.symbol || null,
    externalId: row.slug || row.id || name,
    type: row.type,
    status: row.status,
    open_date: row.startDate,
    close_date: row.endDate,
    listing_date: row.listingDate,
    price_band: row.priceRange,
    lot_size: row.minQty,
    issue_size: row.issueSize,
  }, 'ipoalerts');
}

export function createIpoAlertsPublicProvider({
  baseUrl = process.env.IPOALERTS_API_BASE_URL || 'https://api.ipoalerts.in',
  apiKey = process.env.IPOALERTS_API_KEY,
} = {}) {
  const root = String(baseUrl || '').replace(/\/$/, '');
  const key = apiKey ? String(apiKey).trim() : '';

  async function fetchStatus(status) {
    const url = new URL(`${root}/ipos`);
    url.searchParams.set('status', status);
    url.searchParams.set('limit', key ? '50' : '1');
    const headers = { Accept: 'application/json' };
    if (key) headers['x-api-key'] = key;
    const json = await providerFetch(url.toString(), { headers, timeoutMs: 10000, retries: 1 });
    const rows = Array.isArray(json?.ipos) ? json.ipos : [];
    return rows.map(mapIpoAlertsRow).filter(Boolean);
  }

  return {
    name: 'ipoalerts',
    supportsDedicatedGmp: false,
    async getLiveIpos() {
      const chunks = await Promise.allSettled(STATUSES.map((status) => fetchStatus(status)));
      const byId = new Map();
      for (const chunk of chunks) {
        if (chunk.status !== 'fulfilled') continue;
        for (const row of chunk.value) {
          const key = row.externalId || row.identityKey;
          if (key) byId.set(key, row);
        }
      }
      return [...byId.values()];
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
