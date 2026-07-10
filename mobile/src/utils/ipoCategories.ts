export const IPO_SEGMENT_OPTIONS = [
  { value: 'MAINBOARD', label: 'Mainboard IPO' },
  { value: 'SME', label: 'SME IPO' },
];

export const INVESTOR_CATEGORY_OPTIONS = [
  { value: 'RII', label: 'Retail Individual Investor (RII)' },
  { value: 'HNI', label: 'High Net-worth Individual (HNI)' },
];

export const INVESTOR_CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  INVESTOR_CATEGORY_OPTIONS.map((o) => [o.value, o.label])
);

export const INVESTOR_CATEGORY_SHORT_LABELS: Record<string, string> = {
  RII: 'RII',
  HNI: 'HNI',
};

export const DEFAULT_ALLOWED_CATEGORIES = ['RII'];

export function parseAllowedCategories(ipo: { allowed_categories?: string | string[] } | null | undefined): string[] {
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

export function categoryOptionsForIpo(ipo: Record<string, unknown> | null | undefined) {
  const allowed = parseAllowedCategories(ipo as { allowed_categories?: string | string[] });
  return INVESTOR_CATEGORY_OPTIONS.filter((o) => {
    if (!allowed.includes(o.value)) return false;
    if (o.value === 'HNI' && !ipoHasHniLot(ipo)) return false;
    return true;
  });
}

export function categoryCompactOptionsForIpo(ipo: Record<string, unknown> | null | undefined) {
  return categoryOptionsForIpo(ipo).map((o) => ({
    value: o.value,
    label: INVESTOR_CATEGORY_SHORT_LABELS[o.value] || o.value,
    title: INVESTOR_CATEGORY_LABELS[o.value],
  }));
}

export function ipoAllowsHni(ipo: Record<string, unknown> | null | undefined): boolean {
  return parseAllowedCategories(ipo as { allowed_categories?: string | string[] }).includes('HNI');
}

export function categoryTagColor(cat: string): string {
  if (cat === 'HNI') return '#7c3aed';
  return '#059669';
}

export function ipoHasHniLot(ipo: Record<string, unknown> | null | undefined): boolean {
  return ipo?.lot_amount_hni != null && Number(ipo.lot_amount_hni) > 0;
}

export function getLotAmountForCategory(
  ipo: Record<string, unknown> | null | undefined,
  category = 'RII'
): number | null {
  if (!ipo) return null;
  const cat = String(category).toUpperCase();
  if (cat === 'HNI') {
    return ipo.lot_amount_hni != null ? Number(ipo.lot_amount_hni) : null;
  }
  return Number(ipo.lot_amount_rii ?? ipo.lot_amount ?? 0);
}
