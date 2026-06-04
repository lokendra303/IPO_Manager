import { AppError } from '../middleware/errorHandler.js';

export const IPO_SEGMENTS = ['SME', 'MAINBOARD'];

export const IPO_SEGMENT_LABELS = {
  SME: 'SME IPO',
  MAINBOARD: 'Mainboard IPO',
};

export const INVESTOR_CATEGORIES = ['RII', 'HNI'];

export const INVESTOR_CATEGORY_LABELS = {
  RII: 'Retail Individual Investor (RII)',
  HNI: 'High Net-worth Individual (HNI)',
};

export const DEFAULT_INVESTOR_CATEGORY = 'RII';

export const DEFAULT_ALLOWED_CATEGORIES = ['RII'];

export function parseAllowedCategories(raw) {
  if (raw == null || raw === '') return [...DEFAULT_ALLOWED_CATEGORIES];
  let list = raw;
  if (typeof raw === 'string') {
    try {
      list = JSON.parse(raw);
    } catch {
      list = raw.split(',').map((s) => s.trim());
    }
  }
  if (!Array.isArray(list)) return [...DEFAULT_ALLOWED_CATEGORIES];
  return [...new Set(list.map((c) => String(c).toUpperCase()))];
}

export function validateAllowedCategories(categories) {
  const list = parseAllowedCategories(categories);
  const valid = list.filter((c) => INVESTOR_CATEGORIES.includes(c));
  if (!valid.includes('RII')) {
    throw new AppError('RII (retail) category is required for every IPO');
  }
  const invalid = list.filter((c) => !INVESTOR_CATEGORIES.includes(c));
  if (invalid.length) {
    throw new AppError(`Invalid application categories: ${invalid.join(', ')}`);
  }
  return valid;
}

export function ipoAllowsHni(ipo) {
  return parseAllowedCategories(ipo?.allowed_categories).includes('HNI');
}

export function normalizeInvestorCategory(value, allowed) {
  const allowedList = parseAllowedCategories(allowed);
  const cat = String(value || DEFAULT_INVESTOR_CATEGORY).toUpperCase();
  if (!INVESTOR_CATEGORIES.includes(cat)) {
    throw new AppError(`Invalid investor category: ${value}`);
  }
  if (!allowedList.includes(cat)) {
    throw new AppError(`Category ${cat} is not enabled for this IPO`);
  }
  return cat;
}

export function serializeAllowedCategories(categories) {
  return JSON.stringify(validateAllowedCategories(categories));
}

export function getLotAmountField(category) {
  return String(category || DEFAULT_INVESTOR_CATEGORY).toUpperCase() === 'HNI'
    ? 'lot_amount_hni'
    : 'lot_amount_rii';
}

/** Raw lot value from IPO row for RII or HNI (RII falls back to legacy lot_amount). */
export function resolveLotAmountRaw(ipo, category) {
  if (!ipo) return null;
  const cat = String(category || DEFAULT_INVESTOR_CATEGORY).toUpperCase();
  if (cat === 'HNI') {
    return ipo.lot_amount_hni ?? null;
  }
  return ipo.lot_amount_rii ?? ipo.lot_amount ?? null;
}
