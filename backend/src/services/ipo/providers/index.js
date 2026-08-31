import { createIpoGuruProvider } from './ipoGuruProvider.js';
import { createUpstoxProvider } from './upstoxProvider.js';
import { createDownstoxProvider } from './downstoxProvider.js';
import { createNseProvider } from './nseProvider.js';
import { createIpoAlertsPublicProvider } from './ipoAlertsProvider.js';
import { createFreeCompositeProvider } from './compositeProvider.js';
import { createMockIpoProvider } from './mockIpoProvider.js';

const FACTORIES = {
  ipoguru: createIpoGuruProvider,
  upstox: createUpstoxProvider,
  downstox: createDownstoxProvider,
  nse: createNseProvider,
  ipoalerts: createIpoAlertsPublicProvider,
  composite: createFreeCompositeProvider,
  free: createFreeCompositeProvider,
  mock: createMockIpoProvider,
};

export function getConfiguredProviderName() {
  return String(process.env.IPO_PROVIDER || 'ipoguru').trim().toLowerCase() || 'ipoguru';
}

export function providerHasCredentials(name = getConfiguredProviderName()) {
  if (name === 'mock' || name === 'downstox' || name === 'nse' || name === 'composite' || name === 'free') return true;
  if (name === 'ipoalerts') return true;
  if (name === 'ipoguru') return Boolean(String(process.env.IPO_API_KEY || '').trim());
  if (name === 'upstox') return Boolean(String(process.env.UPSTOX_ACCESS_TOKEN || '').trim());
  return false;
}

/**
 * Provider that will actually be called. Paid/keyed providers when configured;
 * otherwise the free NSE + Downstox + IPO Alerts composite.
 */
export function resolveActiveProviderName() {
  const configured = getConfiguredProviderName();
  if (configured === 'mock') return 'mock';
  if (FACTORIES[configured] && providerHasCredentials(configured) && configured !== 'ipoguru' && configured !== 'upstox') {
    return configured === 'free' ? 'composite' : configured;
  }
  if ((configured === 'ipoguru' || configured === 'upstox') && providerHasCredentials(configured)) {
    return configured;
  }
  return 'composite';
}

export function getIpoProvider() {
  const configured = getConfiguredProviderName();
  const active = resolveActiveProviderName();
  if (active !== configured) {
    console.info(`[ipo] IPO_PROVIDER=${configured} has no credentials; using free NSE + Downstox + IPO Alerts feeds`);
  }
  const factory = FACTORIES[active] || createFreeCompositeProvider;
  return factory();
}

export { FACTORIES };
