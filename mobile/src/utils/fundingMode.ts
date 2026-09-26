export const FUNDING_MODE_THIRD_PARTY_MANDATE = 'THIRD_PARTY_MANDATE';

export function isThirdPartyMandate(app: { funding_mode?: string; fundingMode?: string } | null | undefined) {
  return (app?.funding_mode || app?.fundingMode) === FUNDING_MODE_THIRD_PARTY_MANDATE;
}

export function isMandateAllotted(status: string | undefined) {
  return status === 'ALLOTED' || status === 'PARTIALLY_ALLOTTED';
}
