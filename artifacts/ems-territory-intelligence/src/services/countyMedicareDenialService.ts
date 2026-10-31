import type { CountyHealthRecord } from '../types';

type CountyDenialInput = Pick<
  CountyHealthRecord,
  | 'countyFips'
  | 'medicareDenialRatePct'
  | 'medicareDeniedClaimCount'
  | 'medicareAdjudicatedClaimCount'
  | 'medicareDenialClaimScope'
  | 'medicareDenialReportingPeriod'
  | 'medicareDenialSource'
  | 'medicareDenialSourceUrl'
>;

function hasCountyDenialProvenance(county: CountyDenialInput): boolean {
  if (
    !county.medicareDenialClaimScope?.trim() ||
    !county.medicareDenialReportingPeriod?.trim() ||
    !county.medicareDenialSource?.trim() ||
    !county.medicareDenialSourceUrl?.trim()
  ) {
    return false;
  }

  try {
    const url = new URL(county.medicareDenialSourceUrl);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Returns a county-only Medicare denial rate.
 * The formula is denied finalized ambulance claims / all finalized adjudicated ambulance
 * claims * 100. Counts must share a scope and reporting period and include source
 * attribution. A reported percentage is accepted only from the exact county record.
 * This function never substitutes a state, ZIP, or neighboring-county value.
 */
export function getCountyMedicareDenialRatePct(county: CountyDenialInput): number | null {
  if (!/^\d{5}$/.test(county.countyFips)) return null;

  const denied = county.medicareDeniedClaimCount;
  const adjudicated = county.medicareAdjudicatedClaimCount;
  if (denied !== undefined || adjudicated !== undefined) {
    if (
      !hasCountyDenialProvenance(county) ||
      typeof denied !== 'number' ||
      typeof adjudicated !== 'number' ||
      !Number.isInteger(denied) ||
      !Number.isInteger(adjudicated) ||
      adjudicated <= 0 ||
      denied < 0 ||
      denied > adjudicated
    ) {
      return null;
    }
    return Number(((denied / adjudicated) * 100).toFixed(1));
  }

  const reportedRate = county.medicareDenialRatePct;
  return hasCountyDenialProvenance(county) &&
    typeof reportedRate === 'number' &&
    Number.isFinite(reportedRate) &&
    reportedRate >= 0 &&
    reportedRate <= 100
    ? reportedRate
    : null;
}
