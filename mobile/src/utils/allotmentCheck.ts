import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';

export const REGISTRAR_OPTIONS = [
  { value: 'KFIN', label: 'KFintech (KFin)' },
  { value: 'LINK_INTIME', label: 'MUFG / Link Intime' },
  { value: 'BIGSHARE', label: 'Bigshare' },
  { value: 'CAMEO', label: 'Cameo' },
  { value: 'SKYLINE', label: 'Skyline' },
];

export const REGISTRAR_PORTALS: Record<string, { id: string; name: string; url: string; steps: string }> = {
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

export function getAllotmentPortals(registrar?: string) {
  const portals = [...EXCHANGE_PORTALS];
  if (registrar && REGISTRAR_PORTALS[registrar]) {
    return [{ ...REGISTRAR_PORTALS[registrar], recommended: true }, ...portals];
  }
  return portals;
}

export async function openAllotmentPortal(url: string) {
  await WebBrowser.openBrowserAsync(url);
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await Clipboard.setStringAsync(text);
    return true;
  } catch {
    return false;
  }
}
