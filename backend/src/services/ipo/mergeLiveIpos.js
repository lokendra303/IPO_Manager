import { buildIdentityKey, normalizeCompanyName } from './identity.js';
import { estimatedListingPrice } from './gmpCalc.js';
import { normalizeLiveStatus } from './normalize.js';

const FILL_KEYS = [
  'symbol', 'ipoType', 'openDate', 'closeDate', 'allotmentDate', 'listingDate',
  'priceMin', 'priceMax', 'issuePrice', 'lotSize', 'issueSize',
  'registrarCode', 'registrarName', 'exchange',
  'subscriptionQib', 'subscriptionNii', 'subscriptionRetail', 'subscriptionTotal', 'subscriptionUpdatedAt',
];

export function mergeKey(item) {
  return normalizeCompanyName(item?.companyName || item?.name);
}

export function mergeLiveIpoPair(base, extra) {
  if (!base) return extra;
  if (!extra) return base;
  const out = { ...base };
  for (const key of FILL_KEYS) {
    if (out[key] == null || out[key] === '') out[key] = extra[key];
  }
  if (extra.marketType === 'SME' || base.marketType === 'SME') out.marketType = 'SME';
  if (extra.gmp != null) {
    out.gmp = extra.gmp;
    out.gmpPercentage = extra.gmpPercentage ?? out.gmpPercentage;
    out.estimatedListingPrice = extra.estimatedListingPrice
      ?? estimatedListingPrice(out.issuePrice, extra.gmp);
    out.gmpUpdatedAt = extra.gmpUpdatedAt || out.gmpUpdatedAt;
  }
  if (extra.issueSize && /cr/i.test(String(extra.issueSize)) && out.issueSize && /shares/i.test(String(out.issueSize))) {
    out.issueSize = extra.issueSize;
  }
  out.status = normalizeLiveStatus(out.status || extra.status, {
    openDate: out.openDate,
    closeDate: out.closeDate,
    listingDate: out.listingDate,
  });
  out.identityKey = buildIdentityKey(out);
  out.rawPayload = {
    mergedFrom: [base.sourceProvider, extra.sourceProvider].filter(Boolean),
    sources: [base.rawPayload, extra.rawPayload],
  };
  return out;
}

/** Merge provider lists. First list wins for core fields; later lists fill gaps (and GMP). */
export function mergeLiveIpoLists(lists) {
  const byKey = new Map();
  for (const list of lists) {
    for (const item of list || []) {
      if (!item) continue;
      const key = mergeKey(item);
      if (!key) continue;
      const prev = byKey.get(key);
      byKey.set(key, prev ? mergeLiveIpoPair(prev, item) : { ...item });
    }
  }
  return [...byKey.values()].map((item) => ({
    ...item,
    sourceProvider: 'composite',
    identityKey: buildIdentityKey(item),
  }));
}
