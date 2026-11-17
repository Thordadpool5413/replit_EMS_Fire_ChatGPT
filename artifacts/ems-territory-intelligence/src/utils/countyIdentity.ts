import type { Agency } from '../types';
import corrections from '../data/county-geography-corrections.json';

/** Keep independent cities distinct from counties; normalize display aliases only. */
export function normalizeCountyName(value = ''): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+(county|parish|city and borough|borough|census area|municipality|planning region)$/i, '')
    .replace(/\bsaint\b/g, 'st').replace(/\bsainte\b/g, 'ste')
    .replace(/[^a-z0-9]/g, '');
}
const townKey = (value = '') => value.toLowerCase().replace(/[^a-z0-9]/g, '');
const aliases = new Map(corrections.aliases.flatMap(record =>
  [...record.aliases, record.countyName].map(alias => [record.stateCode + ':' + normalizeCountyName(alias), record] as const),
));
const towns = corrections.connecticutTowns as Record<string, {
  townName: string; countyFips: string; countyName: string; legacyCountyFips: string; legacyCountyName: string;
}>;
export function isLegacyConnecticutCounty(fips = '') {
  return /^090(01|03|05|07|09|11|13|15)$/.test(fips);
}

/** Resolve recorded location, never an agency's service area or equipment ownership.
 * Legacy Connecticut counties split across regions: only an exact recorded town
 * with a compatible legacy county can select a current region.
 */
export function canonicalizeAgencyCounty<T extends Pick<Agency, 'stateCode' | 'county'> & Partial<Agency>>(agency: T): T {
  const state = agency.stateCode?.trim().toUpperCase();
  const fips = agency.countyFips ? String(agency.countyFips).padStart(5, '0') : '';
  const originalName = agency.county ?? '';
  let resolved: {countyName: string; countyFips: string} | undefined;
  let basis: 'canonical-name' | 'town-crosswalk' = 'canonical-name';
  if (state === 'CT') {
    const town = towns[townKey(agency.city)];
    const legacyByName = Object.values(towns).some(row => normalizeCountyName(row.legacyCountyName) === normalizeCountyName(originalName));
    if (town && (isLegacyConnecticutCounty(fips) || (!fips && legacyByName))) {
      if (fips && fips !== town.legacyCountyFips) return agency;
      if (originalName && normalizeCountyName(originalName) !== normalizeCountyName(town.legacyCountyName)) return agency;
      resolved = town; basis = 'town-crosswalk';
    }
  }
  if (!resolved) resolved = aliases.get(state + ':' + normalizeCountyName(originalName));
  if (!resolved || (fips && fips !== resolved.countyFips && basis !== 'town-crosswalk')) return agency;
  if (originalName === resolved.countyName && fips === resolved.countyFips) return agency;
  return {
    ...agency,
    sourceCountyName: agency.sourceCountyName ?? originalName,
    ...(agency.sourceCountyFips || fips ? {sourceCountyFips: agency.sourceCountyFips ?? fips} : {}),
    county: resolved.countyName,
    countyFips: resolved.countyFips,
    countyLocationBasis: basis,
  };
}

export function matchesAgencyCounty(agency: Pick<Agency, 'stateCode' | 'county'> & Partial<Agency>, selectedCounty: string): boolean {
  const located = canonicalizeAgencyCounty(agency);
  return normalizeCountyName(located.county) === normalizeCountyName(selectedCounty);
}
