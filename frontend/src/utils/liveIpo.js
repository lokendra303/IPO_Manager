export const LIVE_STATUS_META = {
  OPEN: { color: 'success', label: 'Open', dot: 'live-ipo-dot live-ipo-dot--open' },
  UPCOMING: { color: 'warning', label: 'Upcoming', dot: 'live-ipo-dot live-ipo-dot--upcoming' },
  CLOSED: { color: 'error', label: 'Closed', dot: 'live-ipo-dot live-ipo-dot--closed' },
  LISTED: { color: 'processing', label: 'Listed', dot: 'live-ipo-dot live-ipo-dot--listed' },
};

export function liveStatusMeta(status) {
  return LIVE_STATUS_META[status] || { color: 'default', label: status || '—', dot: 'live-ipo-dot' };
}

export function canAddLiveIpoToMyIpos(ipo) {
  if (!ipo || ipo.isMyIpo) return false;
  if (typeof ipo.canAddToMyIpos === 'boolean') return ipo.canAddToMyIpos;
  return ipo.status === 'OPEN' || ipo.status === 'UPCOMING';
}

export function formatPriceBand(ipo) {
  if (ipo?.priceMin != null && ipo?.priceMax != null) {
    if (Number(ipo.priceMin) === Number(ipo.priceMax)) return `₹${ipo.priceMin}`;
    return `₹${ipo.priceMin} – ₹${ipo.priceMax}`;
  }
  if (ipo?.issuePrice != null) return `₹${ipo.issuePrice}`;
  return '—';
}

export function formatGmp(value) {
  if (value == null || value === '') return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}₹${n}`;
}
