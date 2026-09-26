export const FUNDING_MODE_DISTRIBUTED = 'DISTRIBUTED';
export const FUNDING_MODE_THIRD_PARTY_MANDATE = 'THIRD_PARTY_MANDATE';

export function isThirdPartyMandate(row) {
  return String(row?.funding_mode || row?.fundingMode || '') === FUNDING_MODE_THIRD_PARTY_MANDATE;
}

export function parseFundingMode(value) {
  if (value === true || value === FUNDING_MODE_THIRD_PARTY_MANDATE) {
    return FUNDING_MODE_THIRD_PARTY_MANDATE;
  }
  return FUNDING_MODE_DISTRIBUTED;
}
