import type { Agency } from '../types';
import {
  equipmentPresence,
  getRecordedVendorMatches,
  hasRecordedEquipmentValue,
  matchesEquipmentFilter,
  type EquipmentMapFilter,
} from './equipmentPresence';

export type Coverage = {
  total: number;
  zoll: number;
  competitor: number;
  mixed: number;
  /** Loaded agency records with no recognized manufacturer in the chosen category. */
  unknown: number;
  matched: number;
  /** Agency records with a substantive equipment entry, even if its maker is not recognized. */
  reported: number;
  unreported: number;
  unrecognized: number;
  /** An agency may be counted for more than one named manufacturer. */
  vendorCounts: Record<string, number>;
};

export type StateEquipmentCoverage = Coverage & {
  countyCount: number;
  countiesWithAgencyRecords: number;
  countiesWithRecognizedEquipment: number;
  countiesWithEquipmentDetails: number;
};

export const emptyCoverage = (): Coverage => ({
  total: 0,
  zoll: 0,
  competitor: 0,
  mixed: 0,
  unknown: 0,
  matched: 0,
  reported: 0,
  unreported: 0,
  unrecognized: 0,
  vendorCounts: {},
});

const clean = (value: string = '') =>
  value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(county|parish|borough|census area|municipality)\b/g, '')
    .replace(/[^a-z0-9]/g, '');

function addRecord(summary: Coverage, agency: Agency, filter: EquipmentMapFilter) {
  summary.total++;
  summary[equipmentPresence(agency, filter.family)]++;
  if (matchesEquipmentFilter(agency, filter)) summary.matched++;

  const hasDetails = hasRecordedEquipmentValue(agency, filter.family);
  if (hasDetails) summary.reported++;
  else summary.unreported++;

  const matches = getRecordedVendorMatches(agency, filter.family);
  if (matches.length) {
    for (const vendor of new Set(matches.map((match) => match.vendor))) {
      summary.vendorCounts[vendor] = (summary.vendorCounts[vendor] || 0) + 1;
    }
  } else if (hasDetails) {
    summary.unrecognized++;
  }
}

function addCoverage(target: Coverage, source: Coverage) {
  target.total += source.total;
  target.zoll += source.zoll;
  target.competitor += source.competitor;
  target.mixed += source.mixed;
  target.unknown += source.unknown;
  target.matched += source.matched;
  target.reported += source.reported;
  target.unreported += source.unreported;
  target.unrecognized += source.unrecognized;
  for (const [vendor, count] of Object.entries(source.vendorCounts)) {
    target.vendorCounts[vendor] = (target.vendorCounts[vendor] || 0) + count;
  }
}

/**
 * Builds county summaries first, then rolls those county totals into each state.
 * Agency records with a known state but unresolved county stay in the state
 * subtotal and are also reported as unassigned; they are never guessed into a county.
 */
export function buildEquipmentGeography(
  agencies: Agency[],
  states: Array<{ code: string; state: string }>,
  counties: Array<{ stateCode: string; countyFips: string; countyName: string }>,
  filter: EquipmentMapFilter,
) {
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
    };
  }

  for (const county of counties) {
    byCounty[county.countyFips] = emptyCoverage();
    fips.set(county.countyFips, county);
    const nameKey = `${county.stateCode}:${clean(county.countyName)}`;
    names.set(nameKey, [...(names.get(nameKey) || []), county]);
    countiesByState.set(county.stateCode, [...(countiesByState.get(county.stateCode) || []), county]);
  }

  const unresolvedByState = new Map<string, Agency[]>();
  let unassignedState = 0;
  let unassignedCounty = 0;
  let conflictingCounty = 0;

  for (const agency of agencies) {
    const stateCode =
      stateNames.get(clean(agency.stateCode)) ||
      stateNames.get(clean((agency as Agency & { state?: string }).state));
    if (!stateCode || !byState[stateCode]) {
      unassignedState++;
      continue;
    }

    const explicit = agency.countyFips
      ? fips.get(String(agency.countyFips).padStart(5, '0'))
      : undefined;
    if (agency.countyFips && (!explicit || explicit.stateCode !== stateCode)) {
      conflictingCounty++;
      unassignedCounty++;
      unresolvedByState.set(stateCode, [...(unresolvedByState.get(stateCode) || []), agency]);
      continue;
    }

    const candidates = names.get(`${stateCode}:${clean(agency.county)}`) || [];
    const county = explicit || (candidates.length === 1 ? candidates[0] : undefined);
    if (!county) {
      unassignedCounty++;
      unresolvedByState.set(stateCode, [...(unresolvedByState.get(stateCode) || []), agency]);
      continue;
    }

    addRecord(byCounty[county.countyFips], agency, filter);
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
    }

    for (const agency of unresolvedByState.get(state.code) || []) {
      addRecord(stateSummary, agency, filter);
    }
  }

  return { byState, byCounty, unassignedState, unassignedCounty, conflictingCounty };
}

export const EQUIPMENT_COVERAGE_STYLES = {
  zoll: { label: 'ZOLL recorded', color: '#12B8A6' },
  competitor: { label: 'Competitor recorded', color: '#F59E0B' },
  mixed: { label: 'Both found in area', color: '#A78BFA' },
  unknown: { label: 'No recognized maker', color: '#718096' },
  noMatch: { label: 'No match for filter', color: '#D3DEE8' },
  noRecords: { label: 'No loaded agency records', color: '#183047' },
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
  'Colors distinguish ZOLL, competitor, mixed, no recognized maker, no selected match, and no loaded agency records. Missing equipment data is not evidence of absence.';
