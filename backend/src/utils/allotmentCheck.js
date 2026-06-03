/** Official IPO allotment portals — metadata for API responses. */

export const REGISTRAR_PORTALS = {
  KFIN: {
    id: 'kfin',
    name: 'KFintech',
    url: 'https://ipostatus.kfintech.com/',
    steps: 'Select IPO → PAN → submit',
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
    steps: 'Select company → PAN',
  },
};

export const EXCHANGE_PORTALS = [
  {
    id: 'bse',
    name: 'BSE',
    url: 'https://www.bseindia.com/investors/appli_check.aspx',
    steps: 'Select issue → PAN → Search',
  },
  {
    id: 'nse',
    name: 'NSE',
    url: 'https://www.nseindia.com/market-data/allotment-status',
    steps: 'Select IPO → PAN or application no.',
  },
];

export const VALID_REGISTRARS = ['KFIN', 'LINK_INTIME', 'BIGSHARE', 'CAMEO', 'SKYLINE'];

export function getAllotmentPortalsMeta(registrar) {
  const portals = [...EXCHANGE_PORTALS];
  if (registrar && REGISTRAR_PORTALS[registrar]) {
    portals.unshift({ ...REGISTRAR_PORTALS[registrar], recommended: true });
  }
  return {
    registrars: Object.entries(REGISTRAR_PORTALS).map(([value, p]) => ({
      value,
      label: p.name,
    })),
    portals,
  };
}
