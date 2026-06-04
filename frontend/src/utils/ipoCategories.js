export const IPO_SEGMENT_OPTIONS = [
  { value: 'MAINBOARD', label: 'Mainboard IPO' },
  { value: 'SME', label: 'SME IPO' },
];

export const INVESTOR_CATEGORY_OPTIONS = [
  { value: 'RII', label: 'Retail Individual Investor (RII)' },
  { value: 'HNI', label: 'High Net-worth Individual (HNI)' },
];

export const INVESTOR_CATEGORY_LABELS = Object.fromEntries(
  INVESTOR_CATEGORY_OPTIONS.map((o) => [o.value, o.label])
);

export const DEFAULT_ALLOWED_CATEGORIES = ['RII'];

export function parseAllowedCategories(ipo) {
  if (!ipo?.allowed_categories) return [...DEFAULT_ALLOWED_CATEGORIES];
  const raw = ipo.allowed_categories;
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [...DEFAULT_ALLOWED_CATEGORIES];
  } catch {
    return [...DEFAULT_ALLOWED_CATEGORIES];
  }
}

export function categoryOptionsForIpo(ipo) {
  const allowed = parseAllowedCategories(ipo);
  return INVESTOR_CATEGORY_OPTIONS.filter((o) => {
    if (!allowed.includes(o.value)) return false;
    if (o.value === 'HNI' && !ipoHasHniLot(ipo)) return false;
    return true;
  });
}

export function categoryTagColor(cat) {
  if (cat === 'HNI') return 'purple';
  return 'green';
}

export function ipoAllowsHni(ipo) {
  return parseAllowedCategories(ipo).includes('HNI');
}

export function ipoHasHniLot(ipo) {
  return ipo?.lot_amount_hni != null && Number(ipo.lot_amount_hni) > 0;
}

export function getLotAmountForCategory(ipo, category = 'RII') {
  if (!ipo) return null;
  const cat = String(category).toUpperCase();
  if (cat === 'HNI') {
    return ipo.lot_amount_hni != null ? Number(ipo.lot_amount_hni) : null;
  }
  return Number(ipo.lot_amount_rii ?? ipo.lot_amount ?? 0);
}

export function formatIpoLotSizes(ipo) {
  if (!ipo) return '—';
  const rii = getLotAmountForCategory(ipo, 'RII');
  const hni = getLotAmountForCategory(ipo, 'HNI');
  if (rii === hni) return null;
  return { rii, hni };
}
