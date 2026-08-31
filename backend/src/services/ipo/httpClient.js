import { AppError } from '../../middleware/errorHandler.js';

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_RETRIES = 2;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfter(header, fallbackMs) {
  if (!header) return fallbackMs;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1000, 60_000);
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.min(Math.max(date - Date.now(), 0), 60_000);
  return fallbackMs;
}

/**
 * fetch() with timeout, retry on 429/5xx/network, and no thrown crash for provider outages.
 */
export async function providerFetch(url, {
  headers = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
  retries = DEFAULT_RETRIES,
  method = 'GET',
} = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { method, headers, signal: controller.signal });
      clearTimeout(timer);
      if (res.status === 429) {
        const retryAfter = parseRetryAfter(res.headers.get('retry-after'), 1500 * (attempt + 1));
        lastError = new AppError('IPO provider rate limit exceeded', 503, { code: 'PROVIDER_RATE_LIMIT' });
        if (attempt < retries) {
          await sleep(retryAfter);
          continue;
        }
        throw lastError;
      }
      if (res.status >= 500) {
        lastError = new AppError('IPO provider temporarily unavailable', 503, { code: 'PROVIDER_UNAVAILABLE' });
        if (attempt < retries) {
          await sleep(400 * (attempt + 1));
          continue;
        }
        throw lastError;
      }
      if (!res.ok) {
        throw new AppError('IPO provider temporarily unavailable', 503, { code: 'PROVIDER_UNAVAILABLE' });
      }
      const text = await res.text();
      if (!text) return null;
      try {
        return JSON.parse(text);
      } catch {
        throw new AppError('IPO provider returned an invalid response', 503, { code: 'PROVIDER_INVALID' });
      }
    } catch (err) {
      clearTimeout(timer);
      if (err instanceof AppError) {
        lastError = err;
        if (err.code === 'PROVIDER_RATE_LIMIT' && attempt < retries) continue;
        throw err;
      }
      const aborted = err?.name === 'AbortError';
      lastError = new AppError(
        aborted ? 'IPO provider request timed out' : 'IPO provider temporarily unavailable',
        503,
        { code: aborted ? 'PROVIDER_TIMEOUT' : 'PROVIDER_UNAVAILABLE' }
      );
      if (attempt < retries) {
        await sleep(400 * (attempt + 1));
        continue;
      }
      throw lastError;
    }
  }
  throw lastError || new AppError('IPO provider temporarily unavailable', 503, { code: 'PROVIDER_UNAVAILABLE' });
}
