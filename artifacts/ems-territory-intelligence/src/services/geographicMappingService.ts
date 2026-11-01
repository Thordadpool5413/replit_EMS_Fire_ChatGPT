import type { Agency, AgencyGeographicLink } from '../types';

const COUNTY_FIPS_PATTERN = /^\d{5}$/;
const STATE_FIPS_PATTERN = /^\d{2}$/;
const PLACE_GEOID_PATTERN = /^\d{7}$/;
const TRACT_GEOID_PATTERN = /^\d{11}$/;
const CT_LEGACY_COUNTY_FIPS = new Set([
  '09001', '09003', '09005', '09007',
  '09009', '09011', '09013', '09015',
]);

/**
 * Creates only location relationships supported by identifiers already on the
 * agency record. County/city text is returned as a candidate label, never as a
 * proven service-area assignment.
 */
export function getAgencyGeographicLinks(agency: Agency): AgencyGeographicLink[] {
  const hasValidStateFips = STATE_FIPS_PATTERN.test(agency.stateFips ?? '');
  const hasValidCountyFips =
    COUNTY_FIPS_PATTERN.test(agency.countyFips ?? '') &&
    (!hasValidStateFips || agency.countyFips?.startsWith(agency.stateFips ?? ''));
  const hasValidPlaceGeoid =
    PLACE_GEOID_PATTERN.test(agency.placeGeoid ?? '') &&
    (!hasValidStateFips || agency.placeGeoid?.startsWith(agency.stateFips ?? ''));
  const hasValidTractGeoid =
    TRACT_GEOID_PATTERN.test(agency.tractGeoid ?? '') &&
    (!hasValidStateFips || agency.tractGeoid?.startsWith(agency.stateFips ?? '')) &&
    (!hasValidCountyFips || agency.tractGeoid?.startsWith(agency.countyFips ?? ''));
  const links: AgencyGeographicLink[] = [
    {
      relationship: 'located-at',
      level: 'state',
      label: agency.state || agency.stateCode,
      sourceGeographyId: hasValidStateFips ? agency.stateFips : undefined,
      matchBasis: hasValidStateFips ? 'source-id' : 'display-label',
      sourceName: hasValidStateFips ? 'U.S. Census Bureau state FIPS' : undefined,
      sourceUrl: hasValidStateFips
        ? 'https://www.census.gov/library/reference/code-lists/ansi.html'
        : undefined,
    },
  ];

  if (agency.county || agency.countyFips) {
    const isLegacyCtCounty =
      agency.stateCode.toUpperCase() === 'CT' &&
      Boolean(agency.countyFips && CT_LEGACY_COUNTY_FIPS.has(agency.countyFips));
    links.push({
      relationship: 'located-at',
      level: 'county',
      label: agency.county || agency.countyFips || 'County',
      sourceGeographyId: hasValidCountyFips ? agency.countyFips : undefined,
      matchBasis: hasValidCountyFips ? 'source-id' : 'name-state-candidate',
      sourceName: isLegacyCtCounty
        ? 'U.S. Census legacy county FIPS'
        : hasValidCountyFips
          ? 'U.S. Census Bureau county FIPS'
          : undefined,
      sourceUrl: isLegacyCtCounty
        ? 'https://www2.census.gov/geo/pdfs/reference/ct_county_equiv_change.pdf'
        : hasValidCountyFips
          ? 'https://www.census.gov/library/reference/code-lists/ansi.html'
          : undefined,
      geographyVintage: isLegacyCtCounty
        ? 'Legacy county geography; not a current county-equivalent FIPS'
        : undefined,
    });
  }

  if (agency.city || agency.placeGeoid) {
    links.push({
      relationship: 'located-at',
      level: 'place',
      label: agency.city || agency.placeGeoid || 'Census place',
      sourceGeographyId: hasValidPlaceGeoid ? agency.placeGeoid : undefined,
      matchBasis: hasValidPlaceGeoid ? 'source-id' : 'name-state-candidate',
    });
  }

  if (agency.zipCode) {
    links.push({
      relationship: 'located-at',
      level: 'zip',
      label: agency.zipCode,
      matchBasis: /^\d{5}$/.test(agency.zipCode)
        ? 'display-label'
        : 'name-state-candidate',
    });
  }

  if (agency.tractGeoid && hasValidTractGeoid) {
    links.push({
      relationship: 'located-at',
      level: 'tract',
      label: `Census tract ${agency.tractGeoid}`,
      sourceGeographyId: agency.tractGeoid,
      matchBasis: 'source-id',
      sourceName: 'U.S. Census Bureau tract GEOID',
      sourceUrl: 'https://www.census.gov/geographies/reference-files/time-series/geo/tiger-line-file.html',
    });
  }

  for (const geographyId of agency.serviceAreaGeographyIds ?? []) {
    if (!geographyId.trim()) continue;
    links.push({
      relationship: 'serves',
      level: 'service-area',
      label: geographyId,
      sourceGeographyId: geographyId,
      matchBasis: 'user-confirmed',
    });
  }

  for (const link of agency.geographicLinks ?? []) {
    if (!links.some((existing) =>
      existing.relationship === link.relationship &&
      existing.level === link.level &&
      existing.sourceGeographyId === link.sourceGeographyId &&
      existing.label === link.label
    )) {
      links.push(link);
    }
  }

  return links;
}
