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

export interface CountyMedicareDenialMetric {
  countyFips: string;
  ratePct: number;
  deniedClaimCount: number;
  adjudicatedClaimCount: number;
  claimScope: string;
  reportingPeriod: string;
  source: string;
  sourceUrl: string;
}

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
 * Returns a county-only Medicare denial rate calculated from matching claim counts.
 * A standalone reported percentage is not sufficient: the denied and adjudicated
 * counts, reporting period, claim scope, and source must all come from this exact
 * five-digit county record. This never substitutes ZIP, provider, state, or
 * neighboring-county values.
 */
export function getCountyMedicareDenialMetric(
  county: CountyDenialInput,
): CountyMedicareDenialMetric | null {
  if (!/^\d{5}$/.test(county.countyFips)) return null;

  const denied = county.medicareDeniedClaimCount;
  const adjudicated = county.medicareAdjudicatedClaimCount;
  if (
    !hasCountyDenialProvenance(county) ||
    typeof denied !== 'number' ||
    typeof adjudicated !== 'number' ||
    !Number.isSafeInteger(denied) ||
    !Number.isSafeInteger(adjudicated) ||
    adjudicated <= 0 ||
    denied < 0 ||
    denied > adjudicated
  ) {
    return null;
  }

  return {
    countyFips: county.countyFips,
    ratePct: Number(((denied / adjudicated) * 100).toFixed(1)),
    deniedClaimCount: denied,
    adjudicatedClaimCount: adjudicated,
    claimScope: county.medicareDenialClaimScope!.trim(),
    reportingPeriod: county.medicareDenialReportingPeriod!.trim(),
    source: county.medicareDenialSource!.trim(),
    sourceUrl: county.medicareDenialSourceUrl!.trim(),
  };
}

export function getCountyMedicareDenialRatePct(county: CountyDenialInput): number | null {
  return getCountyMedicareDenialMetric(county)?.ratePct ?? null;
}
