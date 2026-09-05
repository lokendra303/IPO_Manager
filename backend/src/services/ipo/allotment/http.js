import { AppError } from '../../../middleware/errorHandler.js';

export const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export async function fetchRegistrar(url, { method = 'GET', headers, body, timeout = 15000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, {
      method,
      headers,
      body,
      redirect: 'follow',
      signal: controller.signal,
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text, res };
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

export function createCompanyCache(loader, ttlMs = 5 * 60 * 1000) {
  let cache = { at: 0, companies: [] };
  return async function listCompanies({ force = false } = {}) {
    if (!force && cache.companies.length && Date.now() - cache.at < ttlMs) {
      return cache.companies;
    }
    const companies = await loader();
    cache = { at: Date.now(), companies: companies || [] };
    return cache.companies;
  };
}

export function createCookieJar() {
  const jar = {};
  return {
    absorb(res) {
      const list = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
      const raw = list.length ? list : [res.headers.get('set-cookie')].filter(Boolean);
      for (const cookie of raw) {
        const nv = String(cookie).split(';')[0];
        const eq = nv.indexOf('=');
        if (eq > 0) jar[nv.slice(0, eq).trim()] = nv.slice(eq + 1).trim();
      }
    },
    header() {
      return Object.entries(jar).map(([key, value]) => `${key}=${value}`).join('; ');
    },
  };
}
