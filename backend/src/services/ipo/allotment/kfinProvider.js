import { AppError } from '../../../middleware/errorHandler.js';
import { BROWSER_UA, createCompanyCache, fetchRegistrar } from './http.js';
import { matchRegistrarCompany, parseKfinCompanyScript, parseKfinSearchJson } from './parseAllotment.js';

const KFIN_HOME = 'https://ipostatus.kfintech.com/';
const KFIN_QUERY = 'https://0uz601ms56.execute-api.ap-south-1.amazonaws.com/prod/api/query?type=';

function kfinHeaders(extra = {}) {
  return {
    Accept: 'application/json, text/plain, */*',
    Origin: 'https://ipostatus.kfintech.com',
    Referer: KFIN_HOME,
    'User-Agent': BROWSER_UA,
    ...extra,
  };
}

async function loadKfinCompanies() {
  const home = await fetchRegistrar(KFIN_HOME, { headers: kfinHeaders({ Accept: 'text/html,*/*' }) });
  const script = (home.text.match(/src="(\.\/static\/js\/main\.[^"]+\.js)"/) || [])[1];
  if (!script) {
    throw new AppError('KFintech allotment list is unavailable', 503, { code: 'ALLOTMENT_UNAVAILABLE' });
  }
  const jsUrl = new URL(script, KFIN_HOME).href;
  const bundle = await fetchRegistrar(jsUrl, {
    headers: kfinHeaders({ Accept: 'application/javascript,*/*' }),
  });
  return parseKfinCompanyScript(bundle.text);
}

const listKfinCompanies = createCompanyCache(loadKfinCompanies);

export async function resolveKfinCompany(ipoNames) {
  const companies = await listKfinCompanies();
  return matchRegistrarCompany(ipoNames, companies);
}

export async function searchKfinByPan({ companyId, pan }) {
  const { status, text } = await fetchRegistrar(`${KFIN_QUERY}pan`, {
    headers: kfinHeaders({
      reqparam: String(pan).toUpperCase(),
      client_id: String(companyId),
    }),
  });
  if (status === 404) return { kind: 'empty' };
  if (status === 429) return { kind: 'message', message: 'KFintech asked to wait and retry' };
  if (status === 500 || status === 502 || status === 504) {
    return { kind: 'message', message: 'KFintech is busy, retry shortly' };
  }
  if (status !== 200) {
    throw new AppError('KFintech allotment lookup failed', 503, { code: 'ALLOTMENT_UNAVAILABLE' });
  }
  try {
    return parseKfinSearchJson(JSON.parse(text));
  } catch {
    throw new AppError('KFintech returned an invalid response', 503, { code: 'ALLOTMENT_INVALID' });
  }
}

export const kfinPlatform = {
  id: 'kfin',
  name: 'KFintech',
  registrarCode: 'KFIN',
  url: KFIN_HOME,
  canCheck: true,
  async resolve(ipoNames) {
    return resolveKfinCompany(ipoNames);
  },
  async check({ ipoNames, pan, company }) {
    const hit = company || await resolveKfinCompany(ipoNames);
    if (!hit) {
      return {
        platform: 'kfin',
        kind: 'unmatched',
        message: 'This IPO is not on KFintech yet.',
      };
    }
    const parsed = await searchKfinByPan({ companyId: hit.companyId, pan });
    return {
      platform: 'kfin',
      platformCompany: hit.companyName,
      ...parsed,
    };
  },
};
