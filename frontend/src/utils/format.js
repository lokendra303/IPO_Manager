export function formatCurrency(value) {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n);
}

export function pnlClassName(value) {
  const n = Number(value ?? 0);
  if (n < 0) return 'amount-negative';
  if (n > 0) return 'amount-positive';
  return '';
}
