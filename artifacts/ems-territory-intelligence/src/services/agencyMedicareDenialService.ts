import type { Agency } from '../types';
import { validateNpiCheckDigit } from './npiVerificationService';

export interface AgencyMedicareDenialMetric {
  npi: string;
  ratePct: number;
  deniedClaimCount: number;
  adjudicatedClaimCount: number;
  claimScope: string;
  reportingPeriod: string;
  source: string;
  sourceUrl: string;
}

/**
 * Calculates a provider-specific Medicare denial rate only from matching,
 * source-backed claim counts. A standalone percentage is not sufficient.
 */
export function getAgencyMedicareDenialMetric(
  agency: Pick<Agency, 'npiNumber' | 'cmsData'>,
): AgencyMedicareDenialMetric | null {
  const npi = agency.npiNumber?.trim() ?? '';
  const cmsData = agency.cmsData;
  const denied = cmsData?.medicareDeniedClaimCount;
  const adjudicated = cmsData?.medicareAdjudicatedClaimCount;
  const claimScope = cmsData?.medicareDenialClaimScope?.trim() ?? '';
  const reportingPeriod = cmsData?.medicareDenialReportingPeriod?.trim() ?? '';
  const source = cmsData?.medicareDenialSource?.trim() ?? '';
  const sourceUrl = cmsData?.medicareDenialSourceUrl?.trim() ?? '';

  if (
    !/^\d{10}$/.test(npi) ||
    !validateNpiCheckDigit(npi) ||
    !claimScope ||
    !reportingPeriod ||
    !source ||
    !sourceUrl
  ) {
    return null;
  }

  try {
    if (new URL(sourceUrl).protocol !== 'https:') return null;
  } catch {
    return null;
  }

  if (
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
    npi,
    ratePct: Number(((denied / adjudicated) * 100).toFixed(1)),
    deniedClaimCount: denied,
    adjudicatedClaimCount: adjudicated,
    claimScope,
    reportingPeriod,
    source,
    sourceUrl,
  };
}
