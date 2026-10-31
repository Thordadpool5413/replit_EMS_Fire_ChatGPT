import { NATIONAL_ZIP_CITY_REGISTRY } from '../data/nationalZipCityRegistry';
import type { CountyHealthRecord } from '../types';
import { getCountyMedicareDenialMetric } from './countyMedicareDenialService';

type ZipDenialProfile = (typeof NATIONAL_ZIP_CITY_REGISTRY)[number];

export type CountyDenialDisplay =
  | {
      kind: 'county-claims-rate';
      countyFips: string;
      ratePct: number;
      deniedClaimCount: number;
      adjudicatedClaimCount: number;
      claimScope: string;
      reportingPeriod: string;
      source: string;
      sourceUrl: string;
    }
  | {
      kind: 'zip-profile';
      countyFips: string;
      ratePct: number;
      zipCode: string;
      city: string;
      reportingPeriod: string;
      claimScope: string;
      sourceUrl: string;
    }
  | { kind: 'unavailable'; countyFips: string };

function hasTraceableZipDenialRate(record: ZipDenialProfile): boolean {
  return (
    typeof record.medicareDenialRate === 'number' &&
    Number.isFinite(record.medicareDenialRate) &&
    record.medicareDenialRate >= 0 &&
    record.medicareDenialRate <= 100 &&
    /^https:\/\//i.test(record.medicareDenialRateSourceUrl ?? '') &&
    Boolean(record.medicareDenialRateReportingPeriod?.trim()) &&
    Boolean(record.medicareDenialClaimScope?.trim())
  );
}

export function getCountyZipDenialProfiles(countyFips: string): ZipDenialProfile[] {
  const fips = countyFips.trim();
  if (!/^\d{5}$/.test(fips)) return [];

  return NATIONAL_ZIP_CITY_REGISTRY
    .filter(
      (record) =>
        record.fipsCounty === fips &&
        hasTraceableZipDenialRate(record),
    )
    .sort((a, b) => a.zipCode.localeCompare(b.zipCode));
}

export function getCountyZipDenialProfile(
  countyFips: string,
  countySeat?: string,
  primaryZipCodes: string[] = [],
): ZipDenialProfile | null {
  const profiles = getCountyZipDenialProfiles(countyFips);
  if (profiles.length === 0) return null;

  const normalizedSeat = countySeat?.trim().toLocaleLowerCase();
  return (
    profiles.find(
      (profile) =>
        normalizedSeat &&
        profile.city.trim().toLocaleLowerCase() === normalizedSeat,
    ) ??
    profiles.find((profile) => primaryZipCodes.includes(profile.zipCode)) ??
    profiles[0] ??
    null
  );
}

/**
 * Prefer a matched county-claims calculation. A ZIP-profile value is only a
 * fallback when its source, reporting period, and claim scope are documented;
 * it is never presented as a county-claims aggregate.
 */
export function getCountyDenialDisplay(county: CountyHealthRecord): CountyDenialDisplay {
  const countyMetric = getCountyMedicareDenialMetric(county);
  if (countyMetric) {
    return { kind: 'county-claims-rate', ...countyMetric };
  }

  const zipProfile = getCountyZipDenialProfile(
    county.countyFips,
    county.countySeat,
    county.primaryZipCodes ?? [],
  );
  if (zipProfile && typeof zipProfile.medicareDenialRate === 'number') {
    return {
      kind: 'zip-profile',
      countyFips: county.countyFips,
      ratePct: zipProfile.medicareDenialRate,
      zipCode: zipProfile.zipCode,
      city: zipProfile.city,
      reportingPeriod: zipProfile.medicareDenialRateReportingPeriod!,
      claimScope: zipProfile.medicareDenialClaimScope!,
      sourceUrl: zipProfile.medicareDenialRateSourceUrl!,
    };
  }

  return { kind: 'unavailable', countyFips: county.countyFips };
}

export function getStateZipDenialProfiles(stateCode: string): ZipDenialProfile[] {
  const code = stateCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return [];

  return NATIONAL_ZIP_CITY_REGISTRY
    .filter(
      (record) =>
        record.stateCode === code &&
        hasTraceableZipDenialRate(record),
    )
    .sort((a, b) => a.zipCode.localeCompare(b.zipCode));
}

export function getStateZipDenialProfileSummary(stateCode: string): {
  ratePct: number;
  profileCount: number;
  reportingPeriod: string;
  claimScope: string;
  sources: Array<{ zipCode: string; sourceUrl: string }>;
} | null {
  const profiles = getStateZipDenialProfiles(stateCode);
  if (profiles.length === 0) return null;

  const reportingPeriods = new Set(profiles.map((profile) => profile.medicareDenialRateReportingPeriod));
  const claimScopes = new Set(profiles.map((profile) => profile.medicareDenialClaimScope));
  if (reportingPeriods.size !== 1 || claimScopes.size !== 1) return null;

  const mean =
    profiles.reduce((sum, profile) => sum + (profile.medicareDenialRate ?? 0), 0) /
    profiles.length;

  return {
    ratePct: Math.round(mean * 10) / 10,
    profileCount: profiles.length,
    reportingPeriod: profiles[0].medicareDenialRateReportingPeriod!,
    claimScope: profiles[0].medicareDenialClaimScope!,
    sources: profiles.map((profile) => ({
      zipCode: profile.zipCode,
      sourceUrl: profile.medicareDenialRateSourceUrl!,
    })),
  };
}
