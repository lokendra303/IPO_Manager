import { AppError } from '../../../middleware/errorHandler.js';
import { createDownstoxProvider } from './downstoxProvider.js';
import { createNseProvider } from './nseProvider.js';
import { createIpoAlertsPublicProvider } from './ipoAlertsProvider.js';
import { mergeLiveIpoLists } from '../mergeLiveIpos.js';

/**
 * Combine free public feeds:
 * - NSE current/upcoming/past + per-IPO details (lot, subscription)
 * - Downstox GMP (https://downstox.com/api-docs)
 * - IPO Alerts partial list without a key (lot size / listing date gaps)
 */
export function createFreeCompositeProvider() {
  const nse = createNseProvider();
  const downstox = createDownstoxProvider();
  const alerts = createIpoAlertsPublicProvider();

  return {
    name: 'composite',
    supportsDedicatedGmp: false,
    async getLiveIpos() {
      const settled = await Promise.allSettled([
        nse.getLiveIpos(),
        downstox.getLiveIpos(),
        alerts.getLiveIpos(),
      ]);
      const lists = [];
      const sources = [];
      const names = ['nse', 'downstox', 'ipoalerts'];
      settled.forEach((result, i) => {
        if (result.status === 'fulfilled' && Array.isArray(result.value) && result.value.length) {
          lists.push(result.value);
          sources.push(names[i]);
        } else if (result.status === 'rejected') {
          console.warn(`[ipo] ${names[i]} feed failed:`, result.reason?.message || result.reason);
        }
      });
      if (!lists.length) {
        throw new AppError('IPO provider temporarily unavailable', 503, { code: 'PROVIDER_UNAVAILABLE' });
      }
      const merged = mergeLiveIpoLists(lists);
      merged.forEach((row) => {
        row.rawPayload = { ...(row.rawPayload || {}), feeds: sources };
      });
      return merged;
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
