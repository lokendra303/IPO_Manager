/** Duplicate-protection keys for live IPOs. Never rely on name alone. */

export function slugify(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
}

export function normalizeCompanyName(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\b(limited|ltd|pvt|private|ipo|sme)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function dateKey(value) {
  if (!value) return '';
  const s = String(value).trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : s.slice(0, 10);
}

/**
 * Stable identity when a provider has no external id:
 * normalized company/name + open date + close date.
 */
export function buildIdentityKey({ companyName, name, openDate, closeDate }) {
  const company = normalizeCompanyName(companyName || name);
  return [company, dateKey(openDate), dateKey(closeDate)].join('|').slice(0, 191);
}

export function buildExternalId({ externalId, name, companyName, openDate }) {
  if (externalId) return String(externalId).slice(0, 191);
  const base = slugify(name || companyName) || 'ipo';
  const open = dateKey(openDate);
  return (open ? `${base}-${open}` : base).slice(0, 191);
}
