export function formatPan(pan: string | null | undefined): string {
  if (pan == null || pan === '') return '';
  return String(pan).toUpperCase().trim();
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-IN');
}

export function formatCurrency(value: number | string | null | undefined): string {
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

function wordsUnder1000(n: number): string {
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

export function amountToWordsInr(value: number | string | null | undefined): string {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return '';
  let n = Math.round(Math.abs(num));
  if (n === 0) return 'Zero Rupees Only';

  const parts: string[] = [];
  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;

  if (crore) parts.push(`${wordsUnder1000(crore)} Crore`);
  if (lakh) parts.push(`${wordsUnder1000(lakh)} Lakh`);
  if (thousand) parts.push(`${wordsUnder1000(thousand)} Thousand`);
  if (n) parts.push(wordsUnder1000(n));

  const prefix = num < 0 ? 'Minus ' : '';
  return `${prefix}${parts.join(' ')} Rupees Only`;
}

export function pnlColor(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  if (n < 0) return '#dc2626';
  if (n > 0) return '#059669';
  return '#64748b';
}
