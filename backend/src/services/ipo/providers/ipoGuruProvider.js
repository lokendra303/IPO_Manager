import { AppError } from '../../../middleware/errorHandler.js';
import { providerFetch } from '../httpClient.js';
import { normalizeLiveIpo } from '../normalize.js';

/**
 * IPO Guru — documented at https://www.ipoguru.in/ipo-gmp-details-developer-api
 *
 * Base: https://www.ipoguru.in/api/v1
 * Auth: X-API-KEY header (or api_key query)
 * Endpoint: GET /ipos  (optional type=mainboard|sme, status=open|upcoming|closed)
 * Limits: 15 req/min, 300 req/day
 *
 * The list payload already includes GMP, subscription, and registrar.
 * There is no documented per-IPO details endpoint — getIpoDetails searches the list.
 */
export function createIpoGuruProvider({
  apiKey = process.env.IPO_API_KEY,
  baseUrl = process.env.IPO_API_BASE_URL || 'https://www.ipoguru.in/api/v1',
} = {}) {
  const key = apiKey ? String(apiKey).trim() : '';
  const root = String(baseUrl || '').replace(/\/$/, '');

  async function fetchIpos(params = {}) {
    if (!key) {
      throw new AppError('IPO provider is not configured', 503, { code: 'PROVIDER_UNCONFIGURED' });
    }
    const url = new URL(`${root}/ipos`);
    if (params.type) url.searchParams.set('type', params.type);
    if (params.status) url.searchParams.set('status', params.status);
    const json = await providerFetch(url.toString(), {
      headers: { 'X-API-KEY': key, Accept: 'application/json' },
    });
    if (!json || json.success === false) {
      throw new AppError('IPO provider temporarily unavailable', 503, { code: 'PROVIDER_UNAVAILABLE' });
    }
    const rows = Array.isArray(json.data) ? json.data : Array.isArray(json) ? json : [];
    return rows.map((row) => normalizeLiveIpo(row, 'ipoguru')).filter(Boolean);
  }

  return {
    name: 'ipoguru',
    supportsDedicatedGmp: false,
    async getLiveIpos(filters = {}) {
      const status = filters.status ? String(filters.status).toLowerCase() : null;
      const allowedStatus = ['open', 'upcoming', 'closed'].includes(status) ? status : null;
      if (filters.marketType === 'SME' || filters.marketType === 'MAINBOARD') {
        const type = filters.marketType === 'SME' ? 'sme' : 'mainboard';
        return fetchIpos({ type, status: allowedStatus });
      }
      // The API type filter is optional, but some responses only include one
      // market. Fetch both and merge so Live IPOs is never Mainboard-only.
      const [mainboard, sme] = await Promise.all([
        fetchIpos({ type: 'mainboard', status: allowedStatus }),
        fetchIpos({ type: 'sme', status: allowedStatus }),
      ]);
      const byKey = new Map();
      for (const row of [...mainboard, ...sme]) {
        const key = row.externalId || row.identityKey;
        if (key) byKey.set(key, row);
      }
      return [...byKey.values()];
    },
    async getIpoDetails(externalId) {
      const list = await fetchIpos();
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
    async getSubscription(externalId) {
      const details = await this.getIpoDetails(externalId);
      if (!details) return null;
      return {
        qib: details.subscriptionQib,
        nii: details.subscriptionNii,
        retail: details.subscriptionRetail,
        total: details.subscriptionTotal,
        updatedAt: details.subscriptionUpdatedAt,
      };
    },
    async getRegistrar(externalId) {
      const details = await this.getIpoDetails(externalId);
      return details?.registrarName || details?.registrarCode || null;
    },
  };
}
