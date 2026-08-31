import crypto from 'crypto';
import { AppError } from '../../../middleware/errorHandler.js';
import { matchRegistrarCompany, parseMufgCompanyList, parseMufgSearchXml } from './parseAllotment.js';

const MUFG_BASE = 'https://in.mpms.mufg.com/Initial_Offer';
const AES_KEY = Buffer.from('8080808080808080');

function encryptToken(value) {
  const cipher = crypto.createCipheriv('aes-128-cbc', AES_KEY, AES_KEY);
  return cipher.update(String(value), 'utf8', 'base64') + cipher.final('base64');
}

function mufgHeaders() {
  return {
    Accept: 'application/json, text/javascript, */*; q=0.01',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Requested-With': 'XMLHttpRequest',
    Referer: `${MUFG_BASE}/public-issues.html`,
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };
}

async function mufgPost(path, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${MUFG_BASE}${path}`, {
      method: 'POST',
      headers: mufgHeaders(),
      body: JSON.stringify(body ?? {}),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new AppError('Allotment registrar temporarily unavailable', 503, { code: 'ALLOTMENT_UNAVAILABLE' });
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new AppError('Allotment registrar returned an invalid response', 503, { code: 'ALLOTMENT_INVALID' });
    }
  } catch (err) {
    if (err instanceof AppError) throw err;
    const aborted = err?.name === 'AbortError';
    throw new AppError(
      aborted ? 'Allotment registrar timed out' : 'Allotment registrar temporarily unavailable',
      503,
      { code: aborted ? 'ALLOTMENT_TIMEOUT' : 'ALLOTMENT_UNAVAILABLE' }
    );
  } finally {
    clearTimeout(timer);
  }
}

let companyCache = { at: 0, companies: [] };

export async function listMufgCompanies({ force = false } = {}) {
  if (!force && companyCache.companies.length && Date.now() - companyCache.at < 5 * 60 * 1000) {
    return companyCache.companies;
  }
  const json = await mufgPost('/IPO.aspx/GetDetails', {});
  const companies = parseMufgCompanyList(json?.d || '');
  companyCache = { at: Date.now(), companies };
  return companies;
}

export async function resolveMufgCompany(ipoNames) {
  const companies = await listMufgCompanies();
  return matchRegistrarCompany(ipoNames, companies);
}

export async function searchMufgByPan({ companyId, pan }) {
  const tokenJson = await mufgPost('/IPO.aspx/generateToken', {});
  const token = encryptToken(tokenJson?.d ?? '');
  const json = await mufgPost('/IPO.aspx/SearchOnPan', {
    clientid: String(companyId),
    PAN: String(pan).toUpperCase(),
    IFSC: '',
    CHKVAL: '1',
    token,
  });
  return parseMufgSearchXml(json?.d || '');
}

export const mufgPlatform = {
  id: 'mufg',
  name: 'MUFG Intime',
  async check({ ipoNames, pan }) {
    const company = await resolveMufgCompany(ipoNames);
    if (!company) {
      return {
        platform: 'mufg',
        kind: 'unmatched',
        message: 'This IPO is not on MUFG Intime yet (allotment not published, or another registrar handles it).',
      };
    }
    const parsed = await searchMufgByPan({ companyId: company.companyId, pan });
    return {
      platform: 'mufg',
      platformCompany: company.companyName,
      ...parsed,
    };
  },
};
