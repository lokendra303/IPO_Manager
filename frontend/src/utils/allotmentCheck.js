/** Official IPO allotment check portals (no public API — users verify on these sites). */

export const REGISTRAR_OPTIONS = [
  { value: 'KFIN', label: 'KFintech (KFin)' },
  { value: 'LINK_INTIME', label: 'MUFG / Link Intime' },
  { value: 'BIGSHARE', label: 'Bigshare' },
  { value: 'CAMEO', label: 'Cameo' },
  { value: 'SKYLINE', label: 'Skyline' },
];

export const REGISTRAR_PORTALS = {
  KFIN: {
    id: 'kfin',
    name: 'KFintech',
    url: 'https://ipostatus.kfintech.com/',
    steps: 'Select IPO → choose PAN → enter PAN → submit',
  },
  LINK_INTIME: {
    id: 'link_intime',
    name: 'MUFG / Link Intime',
    url: 'https://in.mpms.mufg.com/Initial_Offer/public-issues.html',
    steps: 'Select company → PAN → search',
  },
  BIGSHARE: {
    id: 'bigshare',
    name: 'Bigshare',
    url: 'https://ipo.bigshareonline.com/IPO_Status.html',
    steps: 'Select company → PAN → search',
  },
  CAMEO: {
    id: 'cameo',
    name: 'Cameo',
    url: 'https://ipostatus.cameoindia.com/',
    steps: 'Select IPO → PAN → submit',
  },
  SKYLINE: {
    id: 'skyline',
    name: 'Skyline',
    url: 'https://www.skylinerta.com/ipo.php',
    steps: 'Select company → PAN or application no.',
  },
};

export const EXCHANGE_PORTALS = [
  {
    id: 'bse',
    name: 'BSE',
    url: 'https://www.bseindia.com/investors/appli_check.aspx',
    steps: 'Select issue name → enter PAN → Search',
  },
  {
    id: 'nse',
    name: 'NSE',
    url: 'https://www.nseindia.com/market-data/allotment-status',
    steps: 'Select IPO → enter PAN or application number',
  },
];

export function getAllotmentPortals(registrar) {
  const portals = [...EXCHANGE_PORTALS];
  if (registrar && REGISTRAR_PORTALS[registrar]) {
    return [{ ...REGISTRAR_PORTALS[registrar], recommended: true }, ...portals];
  }
  return portals;
}

export function openAllotmentPortal(url) {
  window.open(url, '_blank', 'noopener,noreferrer');
}

export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Load registrar dropdown options from API; falls back to static list if unavailable. */
export async function fetchRegistrarOptions(apiClient) {
  try {
    const { data } = await apiClient.get('/ipos/registrars');
    if (Array.isArray(data) && data.length) return data;
  } catch {
    /* use fallback */
  }
  return REGISTRAR_OPTIONS;
}
