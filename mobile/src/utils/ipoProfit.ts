/** Profit = withdrawal proceeds minus distributed application amount. */
export function computeProfitFromWithdrawal(withdrawalMoney: number | string | null | undefined, distributedAmount: number | string | null | undefined) {
  if (withdrawalMoney == null || withdrawalMoney === '') return null;
  const withdrawal = Number(withdrawalMoney);
  const distributed = Number(distributedAmount ?? 0);
  if (Number.isNaN(withdrawal)) return null;
  return Math.round((withdrawal - distributed) * 100) / 100;
}

/** Resolve P&L from withdrawal when set, else legacy profit_loss. */
export function getApplicationProfit(app: {
  withdrawalMoney?: number | string | null;
  withdrawal_money?: number | string | null;
  amount?: number | string | null;
  profitLoss?: number | string | null;
  profit_loss?: number | string | null;
}) {
  const withdrawal = app.withdrawalMoney ?? app.withdrawal_money;
  if (withdrawal != null && withdrawal !== '') {
    return computeProfitFromWithdrawal(withdrawal, app.amount);
  }
  const pl = app.profitLoss ?? app.profit_loss;
  if (pl != null && pl !== '') return Number(pl);
  return null;
}

/** Resolve withdrawal display: stored value, or inferred from legacy profit_loss. */
export function getApplicationWithdrawal(app: {
  withdrawalMoney?: number | string | null;
  withdrawal_money?: number | string | null;
  amount?: number | string | null;
  profitLoss?: number | string | null;
  profit_loss?: number | string | null;
}) {
  const withdrawal = app.withdrawalMoney ?? app.withdrawal_money;
  if (withdrawal != null && withdrawal !== '') return Number(withdrawal);
  const pl = app.profitLoss ?? app.profit_loss;
  if (pl != null && pl !== '' && app.amount != null) {
    return Math.round((Number(app.amount) + Number(pl)) * 100) / 100;
  }
  return null;
}

export function ipoListingDate(ipo?: {
  listing_date?: string | Date | null;
  listingDate?: string | Date | null;
  catalog_listing_date?: string | Date | null;
  catalogListingDate?: string | Date | null;
} | null) {
  const raw = ipo?.listing_date ?? ipo?.listingDate ?? ipo?.catalog_listing_date ?? ipo?.catalogListingDate;
  if (raw == null || raw === '') return null;
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return null;
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(raw);
  }
  const s = String(raw).trim();
  if (!s || s.startsWith('0000-00-00')) return null;
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function todayIst() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function ipoIsListed(ipo?: {
  listing_date?: string | Date | null;
  listingDate?: string | Date | null;
  catalog_listing_date?: string | Date | null;
  catalogListingDate?: string | Date | null;
  catalogStatus?: string | null;
  catalog_status?: string | null;
} | null) {
  const listing = ipoListingDate(ipo);
  if (listing) return listing <= todayIst();
  const status = String(ipo?.catalogStatus || ipo?.catalog_status || '').trim().toUpperCase();
  return status === 'LISTED' || status.startsWith('LISTED');
}

function formatPlainAmount(value: number | string | null | undefined) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded);
}

/** Amount the member should send: withdrawal minus member profit. */
export function memberWillSendNote(record?: {
  profit_share_distribution_id?: number | string | null;
  withdrawalMoney?: number | string | null;
  withdrawal_money?: number | string | null;
  share_member_amount?: number | string | null;
} | null) {
  if (!record?.profit_share_distribution_id) return '';
  const withdrawal = Number(record.withdrawalMoney ?? record.withdrawal_money);
  if (!Number.isFinite(withdrawal)) return '';
  const memberShare = Number(record.share_member_amount);
  if (!Number.isFinite(memberShare) || memberShare === 0) return formatPlainAmount(withdrawal) || '';
  return formatPlainAmount(withdrawal - memberShare) || '';
}

export function remarksOrMemberSendNote(
  record?: {
    profit_share_distribution_id?: number | string | null;
    withdrawalMoney?: number | string | null;
    withdrawal_money?: number | string | null;
    share_member_amount?: number | string | null;
  } | null,
  storedRemarks?: string | null,
) {
  const autoNote = memberWillSendNote(record);
  const stored = storedRemarks == null ? '' : String(storedRemarks).trim();
  if (!stored) return autoNote;
  const amount = formatPlainAmount(record?.withdrawalMoney ?? record?.withdrawal_money);
  if (
    autoNote
    && (
      stored === autoNote
      || (amount && stored === amount)
      || stored === `${amount}-member profit`
      || /member profit$/i.test(stored)
      || /=\s*[\d.]+$/.test(stored)
    )
  ) {
    return autoNote;
  }
  return stored;
}
