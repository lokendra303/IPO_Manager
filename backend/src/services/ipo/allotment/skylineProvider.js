import { BROWSER_UA, createCompanyCache, createCookieJar, fetchRegistrar } from './http.js';
import { matchRegistrarCompany, parseHtmlSelectCompanies, parseSkylineResultHtml } from './parseAllotment.js';

const SKYLINE_HOME = 'https://www.skylinerta.com/ipo.php';
const SKYLINE_SEARCH = 'https://www.skylinerta.com/display_application.php';

function skylineHeaders(cookie, extra = {}) {
  return {
    'User-Agent': BROWSER_UA,
    Accept: 'text/html,application/xhtml+xml,*/*',
    Origin: 'https://www.skylinerta.com',
    Cookie: cookie || '',
    ...extra,
  };
}

async function loadSkylineCompanies() {
  const { text } = await fetchRegistrar(SKYLINE_HOME, {
    headers: skylineHeaders(''),
  });
  return parseHtmlSelectCompanies(text);
}

const listSkylineCompanies = createCompanyCache(loadSkylineCompanies);

export async function resolveSkylineCompany(ipoNames) {
  const companies = await listSkylineCompanies();
  return matchRegistrarCompany(ipoNames, companies);
}

async function searchSkylineByPan({ companyId, pan }) {
  const cookies = createCookieJar();
  const home = await fetchRegistrar(SKYLINE_HOME, { headers: skylineHeaders('') });
  cookies.absorb(home.res);

  const companyPage = await fetchRegistrar(SKYLINE_SEARCH, {
    method: 'POST',
    headers: {
      ...skylineHeaders(cookies.header(), {
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: SKYLINE_HOME,
      }),
    },
    body: new URLSearchParams({ company: String(companyId) }),
  });
  cookies.absorb(companyPage.res);
  const csrf = (companyPage.text.match(/name="csrf_token"[^>]*value="([^"]+)"/i) || [])[1];
  if (!csrf) {
    return { kind: 'message', message: 'Skyline did not return a search token' };
  }

  const result = await fetchRegistrar(SKYLINE_SEARCH, {
    method: 'POST',
    headers: {
      ...skylineHeaders(cookies.header(), {
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: SKYLINE_SEARCH,
      }),
    },
    body: new URLSearchParams({
      pan: String(pan).toUpperCase(),
      csrf_token: csrf,
      company: String(companyId),
      action: 'search',
    }),
  });
  return parseSkylineResultHtml(result.text);
}

export const skylinePlatform = {
  id: 'skyline',
  name: 'Skyline',
  registrarCode: 'SKYLINE',
  url: SKYLINE_HOME,
  canCheck: true,
  async resolve(ipoNames) {
    return resolveSkylineCompany(ipoNames);
  },
  async check({ ipoNames, pan, company }) {
    const hit = company || await resolveSkylineCompany(ipoNames);
    if (!hit) {
      return {
        platform: 'skyline',
        kind: 'unmatched',
        message: 'This IPO is not on Skyline yet.',
      };
    }
    const parsed = await searchSkylineByPan({ companyId: hit.companyId, pan });
    return {
      platform: 'skyline',
      platformCompany: hit.companyName,
      ...parsed,
    };
  },
};
