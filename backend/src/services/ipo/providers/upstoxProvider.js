import { AppError } from '../../../middleware/errorHandler.js';
import { providerFetch } from '../httpClient.js';
import { normalizeLiveIpo } from '../normalize.js';

/**
 * Upstox IPO APIs — documented at:
 *   https://upstox.com/developer/api-documentation/get-ipos/
 *   https://upstox.com/developer/api-documentation/get-ipo-details/
 *
 * GET https://api.upstox.com/v2/ipos
 * GET https://api.upstox.com/v2/ipos/{id}
 * Auth: Authorization: Bearer {access_token}
 *
 * Query: status=open|closed|listed|upcoming, issue_type=regular|sme,
 *        page_number, records (max 30)
 *
 * Upstox does not document a GMP field. Leave GMP null rather than inventing it.
 */
export function createUpstoxProvider({
  accessToken = process.env.UPSTOX_ACCESS_TOKEN,
  baseUrl = process.env.UPSTOX_API_BASE_URL || 'https://api.upstox.com/v2',
} = {}) {
  const token = accessToken ? String(accessToken).trim() : '';
  const root = String(baseUrl || '').replace(/\/$/, '');

  async function get(path, params = {}) {
    if (!token) {
      throw new AppError('IPO provider is not configured', 503, { code: 'PROVIDER_UNCONFIGURED' });
    }
    const url = new URL(`${root}${path}`);
    Object.entries(params).forEach(([k, v]) => {
      if (v != null && v !== '') url.searchParams.set(k, String(v));
    });
    const json = await providerFetch(url.toString(), {
      headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    });
    if (!json || json.status === 'error') {
      throw new AppError('IPO provider temporarily unavailable', 503, { code: 'PROVIDER_UNAVAILABLE' });
    }
    return json;
  }

  function mapRow(row) {
    if (!row) return null;
    return normalizeLiveIpo({
      ...row,
      externalId: row.id,
      companyName: row.name,
      open_date: row.bidding_start_date,
      close_date: row.bidding_end_date,
      allotment_date: row.timeline?.allotment_date,
      listing_date: row.timeline?.listing_date || row.listing_date,
      price_min: row.minimum_price,
      price_max: row.maximum_price,
      issue_price: row.cut_off_price || row.maximum_price,
      lot_size: row.lot_size,
      issue_size: row.issue_size != null ? `₹${row.issue_size} Cr` : null,
      listing_on: row.listing_exchange,
      registrar: row.registrar_info?.name || row.registrar_info?.registrar,
      issue_type: row.issue_type === 'sme' ? 'SME' : 'Mainboard',
      total_subscription: row.total_subscription,
    }, 'upstox');
  }

  return {
    name: 'upstox',
    supportsDedicatedGmp: false,
    async getLiveIpos(filters = {}) {
      const statuses = filters.status
        ? [String(filters.status).toLowerCase()]
        : ['open', 'upcoming', 'closed', 'listed'];
      const issueType = filters.marketType === 'SME' ? 'sme' : filters.marketType === 'MAINBOARD' ? 'regular' : null;
      const seen = new Set();
      const out = [];
      for (const status of statuses) {
        let page = 1;
        let totalPages = 1;
        do {
          const json = await get('/ipos', {
            status,
            issue_type: issueType,
            page_number: page,
            records: 30,
          });
          const rows = Array.isArray(json.data) ? json.data : [];
          for (const row of rows) {
            const mapped = mapRow(row);
            if (mapped && !seen.has(mapped.externalId)) {
              seen.add(mapped.externalId);
              out.push(mapped);
            }
          }
          totalPages = Number(json.meta_data?.page?.total_pages || 1);
          page += 1;
        } while (page <= totalPages && page <= 10);
      }
      return out;
    },
    async getIpoDetails(externalId) {
      const json = await get(`/ipos/${encodeURIComponent(externalId)}`);
      return mapRow(json.data || json);
    },
    async getGmp() {
      return null;
    },
    async getSubscription(externalId) {
      const details = await this.getIpoDetails(externalId);
      if (!details) return null;
      return { total: details.subscriptionTotal };
    },
    async getRegistrar(externalId) {
      const details = await this.getIpoDetails(externalId);
      return details?.registrarName || details?.registrarCode || null;
    },
  };
}
