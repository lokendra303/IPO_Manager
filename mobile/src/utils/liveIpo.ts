export function liveStatusLabel(status?: string) {
  if (status === 'OPEN') return 'Open';
  if (status === 'UPCOMING') return 'Upcoming';
  if (status === 'CLOSED') return 'Closed';
  if (status === 'LISTED') return 'Listed';
  return status || '—';
}

export function canAddLiveIpoToMyIpos(ipo: any) {
  if (!ipo || ipo.isMyIpo) return false;
  if (typeof ipo.canAddToMyIpos === 'boolean') return ipo.canAddToMyIpos;
  return ipo.status === 'OPEN' || ipo.status === 'UPCOMING';
}

export function formatPriceBand(ipo: any) {
  if (ipo?.priceMin != null && ipo?.priceMax != null) {
    if (Number(ipo.priceMin) === Number(ipo.priceMax)) return `₹${ipo.priceMin}`;
    return `₹${ipo.priceMin} – ₹${ipo.priceMax}`;
  }
  if (ipo?.issuePrice != null) return `₹${ipo.issuePrice}`;
  return '—';
}

export function formatGmp(value: unknown) {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}₹${n}`;
}

export function formatShortDate(value: unknown) {
  if (!value) return '—';
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function relativeTime(value: unknown) {
  if (!value) return '—';
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return '—';
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}
