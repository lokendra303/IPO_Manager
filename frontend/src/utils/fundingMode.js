export const FUNDING_MODE_THIRD_PARTY_MANDATE = 'THIRD_PARTY_MANDATE';

export function isThirdPartyMandate(app) {
  return (app?.funding_mode || app?.fundingMode) === FUNDING_MODE_THIRD_PARTY_MANDATE;
}

export function isMandateAllotted(status) {
  return status === 'ALLOTED' || status === 'PARTIALLY_ALLOTTED';
}
