import type { Agency } from '../types';
import { getImportedProviderDenialMetric } from './medicareDenialImportService';
import { validateNpiCheckDigit } from './npiVerificationService';

export interface AgencyMedicareDenialMetric {
  npi: string;
  ratePct: number;
  deniedClaimCount: number;
  adjudicatedClaimCount: number;
  claimScope: string;
  denialDefinition: string;
  reportingPeriod: string;
  source: string;
  sourceUrl: string;
}

export interface AgencyMedicareDenialDisplayMetric {
  npi: string;
  ratePct: number;
  deniedClaimCount: number;
  adjudicatedClaimCount: number;
  claimScope: string;
  denialDefinition: string;
  reportingPeriod: string;
  source: string;
  sourceUrl?: string;
  sourceReference?: string;
  sourceType: 'source-backed' | 'local-import';
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
  const denialDefinition = cmsData?.medicareDenialDefinition?.trim() ?? '';
  const reportingPeriod = cmsData?.medicareDenialReportingPeriod?.trim() ?? '';
  const source = cmsData?.medicareDenialSource?.trim() ?? '';
  const sourceUrl = cmsData?.medicareDenialSourceUrl?.trim() ?? '';

  if (
    !/^\d{10}$/.test(npi) ||
    !validateNpiCheckDigit(npi) ||
    !claimScope ||
    !denialDefinition ||
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
    denialDefinition,
    reportingPeriod,
    source,
    sourceUrl,
  };
}

/**
 * Adds browser-local, explicitly coverage-attested imports for UI display only.
 * Keep the strict source-backed helper above in sanitization and cloud-write paths.
 */
export function getAgencyMedicareDenialMetricForDisplay(
  agency: Pick<Agency, 'npiNumber' | 'cmsData' | 'isVerifiedRecord' | 'lastVerifiedAt' | 'nppesRegistryUrl'>,
): AgencyMedicareDenialDisplayMetric | null {
  const npi = agency.npiNumber?.trim() ?? '';
  const hasVerifiedNpiIdentity =
    agency.isVerifiedRecord === true &&
    Boolean(agency.lastVerifiedAt) &&
    Boolean(agency.nppesRegistryUrl) &&
    /^\d{10}$/.test(npi) &&
    validateNpiCheckDigit(npi);
  if (!hasVerifiedNpiIdentity) return null;

  const sourceMetric = getAgencyMedicareDenialMetric(agency);
  if (sourceMetric) return { ...sourceMetric, sourceType: 'source-backed' };

  const imported = getImportedProviderDenialMetric(npi);
  if (!imported || imported.ratePct === null) return null;
  return {
    npi,
    ratePct: imported.ratePct,
    deniedClaimCount: imported.deniedClaims,
    adjudicatedClaimCount: imported.adjudicatedClaims,
    claimScope: `${imported.claimScope}; ${imported.denialDefinition === 'any_service_line_denied' ? 'any service line denied' : 'entire claim denied'}`,
    denialDefinition: imported.denialDefinition === 'any_service_line_denied' ? 'Any service line denied' : 'Entire claim denied',
    reportingPeriod: imported.reportingPeriod,
    source: imported.sourceName,
    sourceUrl: imported.sourceUrl,
    sourceReference: imported.sourceReference,
    sourceType: 'local-import',
  };
}
