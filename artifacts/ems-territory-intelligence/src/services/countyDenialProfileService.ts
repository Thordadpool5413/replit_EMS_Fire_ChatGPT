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
    }
  | { kind: 'unavailable'; countyFips: string };

export function getCountyZipDenialProfiles(countyFips: string): ZipDenialProfile[] {
  const fips = countyFips.trim();
  if (!/^\d{5}$/.test(fips)) return [];

  return NATIONAL_ZIP_CITY_REGISTRY
    .filter(
      (record) =>
        record.fipsCounty === fips &&
        typeof record.medicareDenialRate === 'number' &&
        Number.isFinite(record.medicareDenialRate) &&
        record.medicareDenialRate >= 0 &&
        record.medicareDenialRate <= 100,
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
 * Prefer a verified county claims calculation, then preserve the established
 * deterministic ZIP-profile fallback. The fallback is explicitly not a county
 * claims aggregate.
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
        typeof record.medicareDenialRate === 'number' &&
        Number.isFinite(record.medicareDenialRate) &&
        record.medicareDenialRate >= 0 &&
        record.medicareDenialRate <= 100,
    )
    .sort((a, b) => a.zipCode.localeCompare(b.zipCode));
}

export function getStateZipDenialProfileSummary(stateCode: string): {
  ratePct: number;
  profileCount: number;
} | null {
  const profiles = getStateZipDenialProfiles(stateCode);
  if (profiles.length === 0) return null;

  const mean =
    profiles.reduce((sum, profile) => sum + (profile.medicareDenialRate ?? 0), 0) /
    profiles.length;

  return {
    ratePct: Math.round(mean * 10) / 10,
    profileCount: profiles.length,
  };
}
