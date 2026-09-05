import { BROWSER_UA, createCompanyCache, fetchRegistrar } from './http.js';
import { matchRegistrarCompany, parseHtmlSelectCompanies } from './parseAllotment.js';

function htmlListPlatform({ id, name, registrarCode, url, listUrl }) {
  const listCompanies = createCompanyCache(async () => {
    const { text } = await fetchRegistrar(listUrl, {
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml,*/*',
        Referer: url,
      },
    });
    return parseHtmlSelectCompanies(text);
  });

  return {
    id,
    name,
    registrarCode,
    url,
    canCheck: false,
    async resolve(ipoNames) {
      const companies = await listCompanies();
      return matchRegistrarCompany(ipoNames, companies);
    },
    async check() {
      return {
        platform: id,
        kind: 'unmatched',
        message: `${name} uses a website captcha, so auto-check cannot read PANs.`,
      };
    },
  };
}

export const bigsharePlatform = htmlListPlatform({
  id: 'bigshare',
  name: 'Bigshare',
  registrarCode: 'BIGSHARE',
  url: 'https://ipo.bigshareonline.com/IPO_Status.html',
  listUrl: 'https://ipo.bigshareonline.com/IPO_Status.html',
});

export const cameoPlatform = htmlListPlatform({
  id: 'cameo',
  name: 'Cameo',
  registrarCode: 'CAMEO',
  url: 'https://ipostatus1.cameoindia.com/',
  listUrl: 'https://ipostatus1.cameoindia.com/',
});

export const purvaPlatform = htmlListPlatform({
  id: 'purva',
  name: 'Purva Sharegistry',
  registrarCode: 'PURVA',
  url: 'https://www.purvashare.com/investor-service/ipo-query',
  listUrl: 'https://www.purvashare.com/investor-service/ipo-query',
});
