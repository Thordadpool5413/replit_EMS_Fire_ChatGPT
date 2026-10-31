import type { CountyHealthRecord } from '../types';

type CountyDenialInput = Pick<
  CountyHealthRecord,
  | 'countyFips'
  | 'medicareDenialRatePct'
  | 'medicareDeniedClaimCount'
  | 'medicareAdjudicatedClaimCount'
>;

/**
 * Returns a county-only Medicare denial rate.
 * Claim counts take precedence and must share the same scope and reporting period.
 * A reported percentage is accepted only from the county record itself; this function
 * never substitutes a state, ZIP, or neighboring-county value.
 */
export function getCountyMedicareDenialRatePct(county: CountyDenialInput): number | null {
  if (!/^\d{5}$/.test(county.countyFips)) return null;

  const denied = county.medicareDeniedClaimCount;
  const adjudicated = county.medicareAdjudicatedClaimCount;
  if (denied !== undefined || adjudicated !== undefined) {
    if (
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
  return typeof reportedRate === 'number' &&
    Number.isFinite(reportedRate) &&
    reportedRate >= 0 &&
    reportedRate <= 100
    ? reportedRate
    : null;
}
