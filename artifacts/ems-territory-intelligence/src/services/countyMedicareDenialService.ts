import type { CountyHealthRecord } from '../types';
import { getImportedCountyDenialMetric } from './medicareDenialImportService';

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
  sourceUrl?: string;
  sourceReference?: string;
  sourceType: 'source-backed' | 'local-import';
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
    return url.protocol === 'https:';
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
    hasCountyDenialProvenance(county) &&
    typeof denied === 'number' &&
    typeof adjudicated === 'number' &&
    Number.isSafeInteger(denied) &&
    Number.isSafeInteger(adjudicated) &&
    adjudicated > 0 &&
    denied >= 0 &&
    denied <= adjudicated
  ) {
    return {
      countyFips: county.countyFips,
      ratePct: Number(((denied / adjudicated) * 100).toFixed(1)),
      deniedClaimCount: denied,
      adjudicatedClaimCount: adjudicated,
      claimScope: county.medicareDenialClaimScope!.trim(),
      reportingPeriod: county.medicareDenialReportingPeriod!.trim(),
      source: county.medicareDenialSource!.trim(),
      sourceUrl: county.medicareDenialSourceUrl!.trim(),
      sourceType: 'source-backed',
    };
  }

  const imported = getImportedCountyDenialMetric(county.countyFips);
  if (!imported || imported.ratePct === null) return null;
  return {
    countyFips: county.countyFips,
    ratePct: imported.ratePct,
    deniedClaimCount: imported.deniedClaims,
    adjudicatedClaimCount: imported.adjudicatedClaims,
    claimScope: `${imported.claimScope}; ${imported.denialDefinition === 'any_service_line_denied' ? 'any service line denied' : 'entire claim denied'}`,
    reportingPeriod: imported.reportingPeriod,
    source: `${imported.sourceName} · ${imported.sourceReference}`,
    sourceUrl: imported.sourceUrl,
    sourceReference: imported.sourceReference,
    sourceType: 'local-import',
  };
}

export function getCountyMedicareDenialRatePct(county: CountyDenialInput): number | null {
  return getCountyMedicareDenialMetric(county)?.ratePct ?? null;
}
