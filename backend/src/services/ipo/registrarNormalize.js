/**
 * Map provider registrar strings onto our registrar codes.
 * Keep this table-driven so new registrars can be added without touching callers.
 */
export const REGISTRAR_ALIASES = [
  { code: 'KFIN', patterns: ['kfin', 'kfintech', 'kfin technologies', 'karvy'] },
  { code: 'LINK_INTIME', patterns: ['mufg', 'link intime', 'intime', 'linkintime'] },
  { code: 'BIGSHARE', patterns: ['bigshare'] },
  { code: 'CAMEO', patterns: ['cameo'] },
  { code: 'SKYLINE', patterns: ['skyline'] },
  { code: 'PURVA', patterns: ['purva', 'purvashare'] },
];

export function normalizeRegistrarCode(raw) {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  if (!s) return null;
  const upper = s.toUpperCase().replace(/[\s-]+/g, '_');
  const exact = REGISTRAR_ALIASES.find((r) => r.code === upper);
  if (exact) return exact.code;
  const hay = s.toLowerCase();
  const hit = REGISTRAR_ALIASES.find((r) => r.patterns.some((p) => hay.includes(p)));
  return hit ? hit.code : null;
}

export const DEFAULT_REGISTRARS = [
  { code: 'KFIN', name: 'KFintech', website: 'https://ipostatus.kfintech.com/' },
  { code: 'LINK_INTIME', name: 'MUFG Intime', website: 'https://in.mpms.mufg.com/Initial_Offer/public-issues.html' },
  { code: 'BIGSHARE', name: 'Bigshare', website: 'https://ipo.bigshareonline.com/IPO_Status.html' },
  { code: 'CAMEO', name: 'Cameo', website: 'https://ipostatus.cameoindia.com/' },
  { code: 'SKYLINE', name: 'Skyline', website: 'https://www.skylinerta.com/ipo.php' },
  { code: 'PURVA', name: 'Purva Sharegistry', website: 'https://www.purvashare.com/investor-service/ipo-query' },
];
