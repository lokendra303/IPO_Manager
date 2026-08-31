export function formatPan(pan) {
  if (pan == null || pan === '') return '';
  return String(pan).toUpperCase().trim();
}

/** Display form: XXXXX1234F. Never put full PAN in URLs. */
export function maskPan(pan) {
  if (pan == null || pan === '') return '';
  const p = String(pan).toUpperCase().trim();
  if (p.length < 10) return 'XXXXX****';
  return `XXXXX${p.slice(5)}`;
}

export function relativeTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const seconds = Math.round((Date.now() - d.getTime()) / 1000);
  if (seconds < 0 && seconds > -120) return 'just now';
  if (seconds < 0) return d.toLocaleString('en-IN');
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days > 400) return d.toLocaleString('en-IN');
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-IN');
}

export function formatCurrency(value) {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n);
}

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function wordsUnder1000(n) {
  if (n === 0) return '';
  let s = '';
  if (n >= 100) {
    s += `${ONES[Math.floor(n / 100)]} Hundred`;
    n %= 100;
    if (n) s += ' ';
  }
  if (n >= 20) {
    s += TENS[Math.floor(n / 10)];
    if (n % 10) s += ` ${ONES[n % 10]}`;
  } else if (n > 0) {
    s += ONES[n];
  }
  return s;
}

/** Indian numbering: e.g. 374400 → "Three Lakh Seventy Four Thousand Four Hundred Rupees Only" */
export function amountToWordsInr(value) {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return '';
  let n = Math.round(Math.abs(num));
  if (n === 0) return 'Zero Rupees Only';

  const parts = [];
  let crore = Math.floor(n / 10000000);
  n %= 10000000;
  let lakh = Math.floor(n / 100000);
  n %= 100000;
  let thousand = Math.floor(n / 1000);
  n %= 1000;

  if (crore) parts.push(`${wordsUnder1000(crore)} Crore`);
  if (lakh) parts.push(`${wordsUnder1000(lakh)} Lakh`);
  if (thousand) parts.push(`${wordsUnder1000(thousand)} Thousand`);
  if (n) parts.push(wordsUnder1000(n));

  const prefix = num < 0 ? 'Minus ' : '';
  return `${prefix}${parts.join(' ')} Rupees Only`;
}

export function pnlClassName(value) {
  const n = Number(value ?? 0);
  if (n < 0) return 'amount-negative';
  if (n > 0) return 'amount-positive';
  return '';
}
