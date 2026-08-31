/** PAN helpers — never log the full PAN. */

export function maskPan(pan) {
  if (pan == null || pan === '') return '';
  const p = String(pan).toUpperCase().trim();
  if (p.length < 10) return 'XXXXX****';
  return `XXXXX${p.slice(5)}`;
}

export function sanitizeForLog(value) {
  if (value == null) return value;
  const s = String(value);
  return s.replace(/[A-Z]{5}[0-9]{4}[A-Z]/gi, (m) => maskPan(m));
}
