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
  return Number(row.amount) || 0;
}

/** SQL CASE expression — alias table ipo_applications as `a`. */
export const PENDING_RETURN_PRINCIPAL_SQL = `
  CASE
    WHEN a.trns_received = 'Received' THEN 0
    WHEN a.allotment_status = 'PENDING' THEN 0
    ELSE a.amount
  END
`;

/** Apps where return is due but not yet marked received. */
export const APPLICATION_RETURN_DUE_SQL = `
  (a.trns_received IS NULL OR a.trns_received <> 'Received')
  AND a.allotment_status <> 'PENDING'
`;
