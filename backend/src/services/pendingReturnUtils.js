/**
 * Principal still held on an application after any fund adjust out.
 */
export function remainingPrincipal(row) {
  const amount = Number(row?.amount) || 0;
  const adjustedOut = Number(row?.adjusted_out_amount) || 0;
  return Math.max(0, Math.round((amount - adjustedOut) * 100) / 100);
}

/**
 * Principal return is due only after allotment is known (not while status is PENDING).
 */
export function isApplicationReturnDue(row) {
  if (row.trns_received === 'Received') return false;
  if (row.allotment_status === 'PENDING') return false;
  return true;
}

export function pendingReturnPrincipal(row) {
  if (!isApplicationReturnDue(row)) return 0;
  return remainingPrincipal(row);
}

/** SQL CASE expression — alias table ipo_applications as `a`. */
export const PENDING_RETURN_PRINCIPAL_SQL = `
  CASE
    WHEN a.trns_received = 'Received' THEN 0
    WHEN a.allotment_status = 'PENDING' THEN 0
    ELSE GREATEST(a.amount - COALESCE(a.adjusted_out_amount, 0), 0)
  END
`;

/**
 * All unsettled remaining principal on this IPO (includes PENDING allotment).
 * Alias table ipo_applications as `a`.
 */
export const PENDING_FUND_TOTAL_SQL = `
  CASE
    WHEN a.trns_received = 'Received' THEN 0
    ELSE GREATEST(a.amount - COALESCE(a.adjusted_out_amount, 0), 0)
  END
`;

/**
 * Leftover to collect after fund was adjusted to another IPO.
 * Alias table ipo_applications as `a`.
 */
export const PENDING_AFTER_ADJUST_SQL = `
  CASE
    WHEN a.trns_received = 'Received' THEN 0
    WHEN COALESCE(a.adjusted_out_amount, 0) <= 0 THEN 0
    ELSE GREATEST(a.amount - COALESCE(a.adjusted_out_amount, 0), 0)
  END
`;

/** Apps where return is due but not yet marked received. */
export const APPLICATION_RETURN_DUE_SQL = `
  (a.trns_received IS NULL OR a.trns_received <> 'Received')
  AND a.allotment_status <> 'PENDING'
`;
