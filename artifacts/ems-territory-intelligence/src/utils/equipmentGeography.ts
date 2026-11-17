import { canonicalizeAgencyCounty, normalizeCountyName } from './countyIdentity';
import type { Agency } from '../types';
import {
  getRecordedEquipmentEntries,
  getRecordedVendorMatches,
  type EquipmentFamily,
  type EquipmentMapFilter,
} from './equipmentPresence';
import {
  buildCountyAgencyEquipmentRecord,
  type CountyAgencyEquipmentRecord,
} from './countyEquipmentRecords';

export type Coverage = {
  /** Unique directory IDs assigned to this county; service areas never add copies. */
  total: number;
  zoll: number;
  competitor: number;
  mixed: number;
  /** Agencies with a substantive installed-field entry but no recognized manufacturer. */
  unknown: number;
  /** Agencies without an installed-field entry in the chosen product category. */
  notReported: number;
  matched: number;
  /** Agency records with a substantive equipment entry, even if its maker is not recognized. */
  reported: number;
  unreported: number;
  unrecognized: number;
  /** An agency may be counted for more than one named manufacturer. */
  vendorCounts: Record<string, number>;
  verifiedAgencyCount: number;
  unverifiedAgencyCount: number;
  /** Installed-field entries, distinct from historical or other source facts. */
  equipmentRecordCount: number;
  documentedEquipmentRecordCount: number;
  unverifiedEquipmentRecordCount: number;
  sourceFactRecordCount: number;
  notReportedByFamily: Record<Exclude<EquipmentFamily, 'all'>, number>;
  /** Present only for county drill-down views. */
  agencyRecords?: CountyAgencyEquipmentRecord[];
};

export type StateEquipmentCoverage = Coverage & {
  countyCount: number;
  countiesWithAgencyRecords: number;
  countiesWithRecognizedEquipment: number;
  countiesWithEquipmentDetails: number;
  countiesWithDocumentedEquipment: number;
  countiesWithUnverifiedEquipment: number;
  countiesWithSourceFacts: number;
  countiesWithAgenciesButNoEquipmentReported: number;
  /** County-unassigned records are reported separately, not rolled into county totals. */
  unassignedAgencyCount: number;
  conflictingAgencyCount: number;
};

const EQUIPMENT_FAMILIES: Exclude<EquipmentFamily, 'all'>[] = [
  'monitors',
  'cpr',
  'ventilators',
  'software',
];

export const emptyCoverage = (includeAgencyRecords = false): Coverage => ({
  total: 0,
  zoll: 0,
  competitor: 0,
  mixed: 0,
  unknown: 0,
  notReported: 0,
  matched: 0,
  reported: 0,
  unreported: 0,
  unrecognized: 0,
  vendorCounts: {},
  verifiedAgencyCount: 0,
  unverifiedAgencyCount: 0,
  equipmentRecordCount: 0,
  documentedEquipmentRecordCount: 0,
  unverifiedEquipmentRecordCount: 0,
  sourceFactRecordCount: 0,
  notReportedByFamily: { monitors: 0, cpr: 0, ventilators: 0, software: 0 },
  ...(includeAgencyRecords ? { agencyRecords: [] } : {}),
});

const clean = normalizeCountyName;

type LocationCandidate = {
  countyFips: string;
  countyName: string;
  basis: CountyAgencyEquipmentRecord['assignmentBasis'];
};

const assignmentBasisRank: Record<LocationCandidate['basis'], number> = {
  'source-fips': 4,
  'town-crosswalk': 3,
  'canonical-name': 2,
  'unique-county-name': 1,
};

function addRecord(
  summary: Coverage,
  agencies: Agency[],
  location: LocationCandidate,
  filter: EquipmentMapFilter,
  includeAgencyRecords: boolean,
) {
  const agencyId = agencies[0]?.id?.trim() || 'directory-id-not-stated';
  const profile = buildCountyAgencyEquipmentRecord(agencyId, agencies, location);
  const entries = profile.equipmentRecords;
  const matches = agencies.flatMap((agency) => getRecordedVendorMatches(agency, filter.family));
  const vendorIds = new Set(matches.map((match) => match.vendor));
  const zoll = vendorIds.has('zoll');
  const competitor = [...vendorIds].some((vendor) => vendor !== 'zoll');

  const hasDetails = getRecordedEquipmentEntries(agencies[0], filter.family).length > 0
    || agencies.slice(1).some((agency) => getRecordedEquipmentEntries(agency, filter.family).length > 0);
  summary.total++;
  if (!hasDetails) summary.notReported++;
  else summary[zoll && competitor ? 'mixed' : zoll ? 'zoll' : competitor ? 'competitor' : 'unknown']++;

  const filterMatches = filter.vendor && filter.vendor !== 'all'
    ? vendorIds.has(filter.vendor)
    : filter.presence === 'all'
      ? true
      : filter.presence === 'zoll'
        ? zoll
        : filter.presence === 'competitor'
          ? competitor
          : filter.presence === 'mixed'
            ? zoll && competitor
            : !zoll && !competitor;
  if (filterMatches) summary.matched++;

  if (hasDetails) summary.reported++;
  else summary.unreported++;

  if (vendorIds.size) {
    for (const vendor of vendorIds) {
      summary.vendorCounts[vendor] = (summary.vendorCounts[vendor] || 0) + 1;
    }
  } else if (hasDetails) {
    summary.unrecognized++;
  }

  if (profile.agencyIdentityStatus === 'verified') summary.verifiedAgencyCount++;
  else summary.unverifiedAgencyCount++;

  const allInstalledEntries = entries.filter((entry) => entry.recordType === 'installed-field');
  const installedEntries = allInstalledEntries.filter((entry) => filter.family === 'all' || entry.family === filter.family);
  summary.equipmentRecordCount += installedEntries.length;
  summary.sourceFactRecordCount += profile.sourceFactRecordCount;
  for (const entry of installedEntries) {
    if (entry.status === 'documented') summary.documentedEquipmentRecordCount++;
    else summary.unverifiedEquipmentRecordCount++;
  }
  for (const family of EQUIPMENT_FAMILIES) {
    if (!allInstalledEntries.some((entry) => entry.family === family)) summary.notReportedByFamily[family]++;
  }
  if (includeAgencyRecords) summary.agencyRecords?.push(profile);
}

function addCoverage(target: Coverage, source: Coverage) {
  target.total += source.total;
  target.zoll += source.zoll;
  target.competitor += source.competitor;
  target.mixed += source.mixed;
  target.unknown += source.unknown;
  target.notReported += source.notReported;
  target.matched += source.matched;
  target.reported += source.reported;
  target.unreported += source.unreported;
  target.unrecognized += source.unrecognized;
  target.verifiedAgencyCount += source.verifiedAgencyCount;
  target.unverifiedAgencyCount += source.unverifiedAgencyCount;
  target.equipmentRecordCount += source.equipmentRecordCount;
  target.documentedEquipmentRecordCount += source.documentedEquipmentRecordCount;
  target.unverifiedEquipmentRecordCount += source.unverifiedEquipmentRecordCount;
  target.sourceFactRecordCount += source.sourceFactRecordCount;
  for (const family of EQUIPMENT_FAMILIES) {
    target.notReportedByFamily[family] += source.notReportedByFamily[family];
  }
  for (const [vendor, count] of Object.entries(source.vendorCounts)) {
    target.vendorCounts[vendor] = (target.vendorCounts[vendor] || 0) + count;
  }
}

/**
 * Assigns each directory ID to one county from its recorded physical location.
 * Documented service areas are retained on the county record but never create
 * additional assignments. State totals are built only from county summaries;
 * unresolved records are counted separately instead of being guessed into a county.
 */
export function buildEquipmentGeography(
  agencies: Agency[],
  states: Array<{ code: string; state: string }>,
  counties: Array<{ stateCode: string; countyFips: string; countyName: string }>,
  filter: EquipmentMapFilter,
  options: { includeAgencyRecords?: boolean } = {},
) {
  const includeAgencyRecords = options.includeAgencyRecords === true;
  const byCounty: Record<string, Coverage> = {};
  const byState: Record<string, StateEquipmentCoverage> = {};
  const stateNames = new Map<string, string>();
  const fips = new Map<string, (typeof counties)[number]>();
  const names = new Map<string, Array<(typeof counties)[number]>>();
  const countiesByState = new Map<string, Array<(typeof counties)[number]>>();

  for (const state of states) {
    stateNames.set(clean(state.code), state.code);
    stateNames.set(clean(state.state), state.code);
    byState[state.code] = {
      ...emptyCoverage(),
      countyCount: 0,
      countiesWithAgencyRecords: 0,
      countiesWithRecognizedEquipment: 0,
      countiesWithEquipmentDetails: 0,
      countiesWithDocumentedEquipment: 0,
      countiesWithUnverifiedEquipment: 0,
      countiesWithSourceFacts: 0,
      countiesWithAgenciesButNoEquipmentReported: 0,
      unassignedAgencyCount: 0,
      conflictingAgencyCount: 0,
    };
  }

  for (const county of counties) {
    byCounty[county.countyFips] = emptyCoverage(includeAgencyRecords);
    fips.set(county.countyFips, county);
    const nameKey = `${county.stateCode}:${clean(county.countyName)}`;
    names.set(nameKey, [...(names.get(nameKey) || []), county]);
    countiesByState.set(county.stateCode, [...(countiesByState.get(county.stateCode) || []), county]);
  }

  let excludedPlanningRecords = 0;
  const agencyGroups = new Map<string, Agency[]>();
  agencies.forEach((agency, index) => {
    if (agency.verificationSource?.includes('Geographic prospect generator') && !agency.isVerifiedRecord && !getRecordedEquipmentEntries(agency).length) { excludedPlanningRecords++; return; }
    const id = agency.id?.trim();
    const key = id ? `id:${id}` : `unidentified-row:${index}`;
    agencyGroups.set(key, [...(agencyGroups.get(key) || []), agency]);
  });

  let unassignedState = 0;
  let unassignedCounty = 0;
  let conflictingCounty = 0;

  for (const group of agencyGroups.values()) {
    const normalized = group.map((agency) => canonicalizeAgencyCounty(agency));
    const stateCodes = new Set(normalized.flatMap((agency) => {
      const code = stateNames.get(clean(agency.stateCode))
        || stateNames.get(clean((agency as Agency & { state?: string }).state));
      return code ? [code] : [];
    }));
    if (stateCodes.size !== 1) {
      unassignedState++;
      continue;
    }
    const stateCode = [...stateCodes][0];
    if (!byState[stateCode]) {
      unassignedState++;
      continue;
    }

    const candidates = new Map<string, LocationCandidate>();
    let hasConflictingLocation = false;
    for (const agency of normalized) {
      const explicit = agency.countyFips
        ? fips.get(String(agency.countyFips).padStart(5, '0'))
        : undefined;
      if (agency.countyFips && (!explicit || explicit.stateCode !== stateCode)) {
        hasConflictingLocation = true;
        continue;
      }
      const matchingNames = names.get(`${stateCode}:${clean(agency.county)}`) || [];
      const county = explicit || (matchingNames.length === 1 ? matchingNames[0] : undefined);
      if (!county) continue;

      const rawCountyFips = agency.countyFips
        ? String(agency.countyFips).padStart(5, '0')
        : '';
      const basis: LocationCandidate['basis'] = agency.countyLocationBasis === 'town-crosswalk'
        ? 'town-crosswalk'
        : rawCountyFips === county.countyFips
          ? 'source-fips'
          : agency.countyLocationBasis === 'canonical-name'
            ? 'canonical-name'
            : 'unique-county-name';
      const prior = candidates.get(county.countyFips);
      if (!prior || assignmentBasisRank[basis] > assignmentBasisRank[prior.basis]) {
        candidates.set(county.countyFips, {
          countyFips: county.countyFips,
          countyName: county.countyName,
          basis,
        });
      }
    }

    if (hasConflictingLocation || candidates.size !== 1) {
      unassignedCounty++;
      byState[stateCode].unassignedAgencyCount++;
      if (hasConflictingLocation || candidates.size > 1) {
        conflictingCounty++;
        byState[stateCode].conflictingAgencyCount++;
      }
      continue;
    }

    const location = [...candidates.values()][0];
    addRecord(
      byCounty[location.countyFips],
      group,
      location,
      filter,
      includeAgencyRecords,
    );
  }

  for (const state of states) {
    const stateSummary = byState[state.code];
    const stateCounties = countiesByState.get(state.code) || [];
    stateSummary.countyCount = stateCounties.length;

    for (const county of stateCounties) {
      const countySummary = byCounty[county.countyFips];
      addCoverage(stateSummary, countySummary);
      if (countySummary.total > 0) stateSummary.countiesWithAgencyRecords++;
      if (countySummary.zoll + countySummary.competitor + countySummary.mixed > 0) {
        stateSummary.countiesWithRecognizedEquipment++;
      }
      if (countySummary.reported > 0) stateSummary.countiesWithEquipmentDetails++;
      if (countySummary.documentedEquipmentRecordCount > 0) stateSummary.countiesWithDocumentedEquipment++;
      if (countySummary.unverifiedEquipmentRecordCount > 0) stateSummary.countiesWithUnverifiedEquipment++;
      if (countySummary.sourceFactRecordCount > 0) stateSummary.countiesWithSourceFacts++;
      if (countySummary.total > 0 && countySummary.reported === 0) {
        stateSummary.countiesWithAgenciesButNoEquipmentReported++;
      }
    }
  }

  return { byState, byCounty, unassignedState, unassignedCounty, conflictingCounty, excludedPlanningRecords };
}

export const EQUIPMENT_COVERAGE_STYLES = {
  zoll: { label: 'ZOLL recorded', color: '#FF4B36' },
  competitor: { label: 'Competitor recorded', color: '#FFC400' },
  mixed: { label: 'Both found in area', color: '#ED3975' },
  unknown: { label: 'No recognized maker', color: '#B69B86' },
  notReported: { label: 'No equipment entry reported', color: '#E7DDD0' },
  noMatch: { label: 'No match for filter', color: '#FFF1DE' },
  noRecords: { label: 'No loaded agency records', color: '#D6B99B' },
} as const;

function hasZoll(c: Coverage) {
  return c.zoll + c.mixed > 0;
}

function hasCompetitor(c: Coverage) {
  return c.competitor + c.mixed > 0;
}

/** Distinct categorical colors replace the old single-color match highlighting. */
export function equipmentCoverageColor(c: Coverage | undefined, filter: EquipmentMapFilter) {
  if (!c?.total) return EQUIPMENT_COVERAGE_STYLES.noRecords.color;
  if (!c.reported) return EQUIPMENT_COVERAGE_STYLES.notReported.color;
  const zoll = hasZoll(c);
  const competitor = hasCompetitor(c);
  const vendorMatch = filter.vendor ? (c.vendorCounts[filter.vendor] || 0) > 0 : undefined;
  const selectedMatch = vendorMatch ?? (
    filter.presence === 'zoll' ? zoll :
    filter.presence === 'competitor' ? competitor :
    filter.presence === 'mixed' ? c.mixed > 0 :
    filter.presence === 'unknown' ? c.unknown > 0 :
    true
  );

  if (filter.presence === 'unknown' && c.unknown > 0) {
    return EQUIPMENT_COVERAGE_STYLES.unknown.color;
  }
  if (selectedMatch) {
    if (zoll && competitor) return EQUIPMENT_COVERAGE_STYLES.mixed.color;
    if (filter.vendor && filter.vendor !== 'zoll') return EQUIPMENT_COVERAGE_STYLES.competitor.color;
    if (filter.presence === 'competitor') return EQUIPMENT_COVERAGE_STYLES.competitor.color;
    if (zoll) return EQUIPMENT_COVERAGE_STYLES.zoll.color;
    if (competitor) return EQUIPMENT_COVERAGE_STYLES.competitor.color;
    return EQUIPMENT_COVERAGE_STYLES.unknown.color;
  }
  if (!zoll && !competitor) return EQUIPMENT_COVERAGE_STYLES.unknown.color;
  return EQUIPMENT_COVERAGE_STYLES.noMatch.color;
}

export const EQUIPMENT_COVERAGE_LEGEND =
  'Colors distinguish recorded makers, unknown makers, unreported equipment, unmatched filters, and counties with no loaded agency records. Missing equipment data is not evidence of absence.';
