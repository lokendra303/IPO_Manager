/**
 * App config from Vite env (VITE_* in .env).
 * @see frontend/.env.example
 */
function normalizeBaseUrl(url) {
  const base = (url || '/api').trim();
  return base.endsWith('/') ? base.slice(0, -1) : base;
}

export const config = {
  apiBaseUrl: normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL),
  devPort: Number(import.meta.env.VITE_PORT) || 5173,
  apiProxyTarget: import.meta.env.VITE_API_PROXY_TARGET || 'http://localhost:5000',
};
