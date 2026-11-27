import { matchesAgencyScope, activeProviderRecords } from '../utils/providerRecordTrust';
import { normalizeCountyName } from '../utils/countyIdentity';
import { filterSavedAgencyRecordsForJurisdiction } from '../utils/countyAgencySelection';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Agency, ZollProductLine } from '../types';
import { ALL_NATIONWIDE_COUNTIES, ComprehensiveCountyRecord } from '../data/allCountiesDatabase';
import { CITIES_BY_STATE_AND_COUNTY, ALL_CITIES_BY_STATE, STATE_GEO_AND_AREA_CODES } from '../data/allCitiesDatabase';
import { ALL_50_STATES_SUMMARIES } from '../data/nationalGeographicData';
import { calculatePulseIqContributions, calculateScore, DEFAULT_WEIGHTS } from '../utils/pulseIqScoring';
import { nationalProviderDb } from './nationalProviderDatabase';

/**
 * ZOLL Territory Manager Intelligence Engine
 * Provides comprehensive, nationwide geographic and account resolution across
 * all 50 US States + DC, covering all 3,144 counties, 9,800+ US Census cities
 * and Fire/EMS protection districts, and 5-digit postal jurisdictions.
 */
class TerritoryIntelligenceService {
  private countyIndex: Map<string, ComprehensiveCountyRecord[]> = new Map();
  private countyByFips: Map<string, ComprehensiveCountyRecord> = new Map();

  constructor() {
    this.buildIndices();
  }

  private buildIndices() {
    const seen = new Set<string>();
    for (const county of ALL_NATIONWIDE_COUNTIES) {
      if (seen.has(county.countyFips)) continue;
      seen.add(county.countyFips);
      const st = county.stateCode.toUpperCase();
      if (!this.countyIndex.has(st)) {
        this.countyIndex.set(st, []);
      }
      this.countyIndex.get(st)!.push(county);
      this.countyByFips.set(county.countyFips, county);
    }
  }

  /**
   * Get all counties for any given US State (e.g. 'TX' -> 254 counties, 'OH' -> 88 counties, or 'Georgia')
   */
  public getCountiesForState(stateCode: string): ComprehensiveCountyRecord[] {
    if (!stateCode || stateCode.toLowerCase() === 'all') {
      return ALL_NATIONWIDE_COUNTIES;
    }
    const sc = stateCode.toUpperCase().trim();
    if (this.countyIndex.has(sc)) {
      return this.countyIndex.get(sc) || [];
    }
    const match = Object.entries(ALL_50_STATES_SUMMARIES).find(
      ([code, s]) => s.state.toLowerCase() === stateCode.toLowerCase().trim()
    );
    if (match) {
      return this.countyIndex.get(match[0]) || [];
    }
    return [];
  }

  /**
   * Find a specific county record
   */
  public getCountyRecord(stateCode: string, countyName: string): ComprehensiveCountyRecord | undefined {
    const counties = this.getCountiesForState(stateCode);
    const clean = normalizeCountyName(countyName);
    const matches = counties.filter(c => [c.countyName, c.rawName, ...(c.aliases ?? [])].some(name => normalizeCountyName(name) === clean));
    return matches.length === 1 ? matches[0] : undefined;
  }

  private static majorMetroCitiesCache: string[] | null = null;
  private static allCitiesMetadataCache: Array<{
    city: string;
    county: string;
    countyFips: string;
    stateCode: string;
    isCountySeat: boolean;
    primaryZip?: string;
    latitude?: number;
    longitude?: number;
  }> | null = null;

  /**
   * Get all cities and fire/EMS districts for a state, optionally narrowed by county.
   */
  public getCitiesForState(stateCode: string, countyName?: string): string[] {
    const isAllStates = !stateCode || stateCode.toLowerCase().trim() === 'all';

    if (isAllStates) {
      if (countyName && countyName.toLowerCase() !== 'all') {
        const citySet = new Set<string>();
        const cleanCounty = countyName.toLowerCase().replace(/ county| parish| borough/gi, '').trim();
        for (const c of ALL_NATIONWIDE_COUNTIES) {
          if (
            c.countyName.toLowerCase() === countyName.toLowerCase().trim() ||
            c.rawName.toLowerCase() === cleanCounty
          ) {
            if (c.countySeat) citySet.add(c.countySeat);
            if (c.cities) c.cities.forEach(ct => citySet.add(ct));
            const stObj = CITIES_BY_STATE_AND_COUNTY[c.stateCode];
            if (stObj) {
              const extra = stObj[c.rawName] || stObj[c.countyName] || [];
              extra.forEach(ct => citySet.add(ct));
            }
          }
        }
        return Array.from(citySet).sort();
      }

      // Fast-path: When viewing All States with no specific county, return top metro cities instead of iterating 75,000 lines
      if (!TerritoryIntelligenceService.majorMetroCitiesCache) {
        TerritoryIntelligenceService.majorMetroCitiesCache = [
          'New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia',
          'San Antonio', 'San Diego', 'Dallas', 'Austin', 'San Jose', 'Fort Worth',
          'Jacksonville', 'Columbus', 'Charlotte', 'Indianapolis', 'San Francisco',
          'Seattle', 'Denver', 'Nashville', 'Oklahoma City', 'El Paso', 'Boston',
          'Portland', 'Las Vegas', 'Detroit', 'Memphis', 'Louisville', 'Baltimore',
          'Milwaukee', 'Albuquerque', 'Tucson', 'Fresno', 'Mesa', 'Atlanta', 'Kansas City'
        ].sort();
      }
      return TerritoryIntelligenceService.majorMetroCitiesCache;
    }

    const sc = stateCode.toUpperCase().trim();
    const citySet = new Set<string>();

    if (countyName && countyName.toLowerCase() !== 'all') {
      const countyRecord = this.getCountyRecord(sc, countyName);
      if (countyRecord) {
        if (countyRecord.countySeat) citySet.add(countyRecord.countySeat);
        if (countyRecord.cities) countyRecord.cities.forEach(c => citySet.add(c));
      }
      const stateObj = CITIES_BY_STATE_AND_COUNTY[sc];
      if (stateObj) {
        const raw = countyName.replace(/ County| Parish| Borough/gi, '').trim();
        if (stateObj[raw]) stateObj[raw].forEach(c => citySet.add(c));
        if (stateObj[countyName]) stateObj[countyName].forEach(c => citySet.add(c));
      }
      return Array.from(citySet).sort();
    }

    const stateList = ALL_CITIES_BY_STATE[sc] || [];
    stateList.forEach(c => citySet.add(c));

    const counties = this.getCountiesForState(sc);
    for (const c of counties) {
      if (c.countySeat) citySet.add(c.countySeat);
      if (c.cities) c.cities.forEach(city => citySet.add(city));
    }

    return Array.from(citySet).sort();
  }

  /**
   * Return all incorporated US Census / USPS cities and towns in a state (or nationwide when stateCode === 'all')
   * with their county, countyFips, stateCode, county seat flag, coordinates, and primary zip
   */
  public getAllCitiesWithMetadata(stateCode: string, countyName?: string): Array<{
    city: string;
    county: string;
    countyFips: string;
    stateCode: string;
    isCountySeat: boolean;
    primaryZip?: string;
    latitude?: number;
    longitude?: number;
  }> {
    const isAllStates = !stateCode || stateCode.toLowerCase().trim() === 'all';
    const hasSpecificCounty = Boolean(countyName && countyName.toLowerCase() !== 'all');

    if (isAllStates && !hasSpecificCounty && TerritoryIntelligenceService.allCitiesMetadataCache) {
      return TerritoryIntelligenceService.allCitiesMetadataCache;
    }

    const counties = isAllStates ? ALL_NATIONWIDE_COUNTIES : this.getCountiesForState(stateCode.toUpperCase().trim());
    const results: Array<{
      city: string;
      county: string;
      countyFips: string;
      stateCode: string;
      isCountySeat: boolean;
      primaryZip?: string;
      latitude?: number;
      longitude?: number;
    }> = [];
    const seen = new Set<string>();

    const targetCounties = (countyName && countyName.toLowerCase() !== 'all')
      ? counties.filter(c => 
          c.countyName.toLowerCase() === countyName.toLowerCase() || 
          c.rawName.toLowerCase() === countyName.toLowerCase() ||
          c.countyName.toLowerCase().replace(/ county| parish| borough/gi, '').trim() === countyName.toLowerCase().replace(/ county| parish| borough/gi, '').trim()
        )
      : counties;

    for (const c of targetCounties) {
      const sc = c.stateCode.toUpperCase();
      if (c.cityRecords && c.cityRecords.length > 0) {
        for (const cr of c.cityRecords) {
          const key = `${sc}:${cr.name}:${c.countyName}`;
          if (!seen.has(key)) {
            seen.add(key);
            results.push({
              city: cr.name,
              county: c.countyName,
              countyFips: c.countyFips,
              stateCode: sc,
              isCountySeat: cr.isCountySeat,
              primaryZip: cr.zipCode || c.primaryZipCodes?.[0],
              latitude: cr.latitude,
              longitude: cr.longitude
            });
          }
        }
      } else if (c.cities) {
        for (const cityName of c.cities) {
          const key = `${sc}:${cityName}:${c.countyName}`;
          if (!seen.has(key)) {
            seen.add(key);
            results.push({
              city: cityName,
              county: c.countyName,
              countyFips: c.countyFips,
              stateCode: sc,
              isCountySeat: cityName === c.countySeat,
              primaryZip: c.primaryZipCodes?.[0],
              latitude: c.centroidLat,
              longitude: c.centroidLng
            });
          }
        }
      }
    }

    const sorted = results.sort((a, b) => a.city.localeCompare(b.city));
    if (isAllStates && !hasSpecificCounty) {
      TerritoryIntelligenceService.allCitiesMetadataCache = sorted;
    }
    return sorted;
  }

  /**
   * Get all agencies for a state, providing full dual coverage across
   * 100% of the state's counties AND incorporated municipal cities for BOTH EMS Providers AND Fire Departments.
   */
  public getAgenciesForState(
    stateCode: string, 
    existingAgencies: Agency[] = [],
    categoryFilter: 'all' | 'ems' | 'fire' = 'all'
  ): Agency[] {
    let sc = stateCode ? stateCode.toUpperCase().trim() : '';
    if (!sc || sc.toLowerCase() === 'all') return this.filterByCategory(existingAgencies, categoryFilter);
    if (!ALL_50_STATES_SUMMARIES[sc]) {
      const match = Object.entries(ALL_50_STATES_SUMMARIES).find(
        ([code, s]) => s.state.toLowerCase() === stateCode.toLowerCase().trim()
      );
      if (match) sc = match[0];
    }

    const dbAgencies = nationalProviderDb.getProviders({ state: sc, category: categoryFilter });
    if (dbAgencies.length > 0) {
      // Merge any user-edited existing agencies with database agencies
      const byId = new Map<string, Agency>();
      for (const a of dbAgencies) byId.set(a.id, a);
      for (const ex of existingAgencies) {
        if (ex.stateCode.toUpperCase() === sc) {
          byId.set(ex.id, ex);
        }
      }
      return this.filterByCategory(Array.from(byId.values()), categoryFilter);
    }

    return this.filterByCategory(existingAgencies.filter(a=>a.stateCode.toUpperCase()===sc), categoryFilter);
  }

  public filterByCategory(list: Agency[], categoryFilter: 'all' | 'ems' | 'fire'): Agency[] {
    list = activeProviderRecords(list);
    if (categoryFilter === 'all') return list;
    return list.filter(a => matchesAgencyScope(a, categoryFilter));
  }

  /**
   * Get all authoritative agencies for a specific jurisdiction (State, County, or City),
   * providing BOTH the EMS Provider AND the Fire Department for full dual coverage.
   */
  public getAgenciesForJurisdiction(
    stateCode: string,
    countyName?: string,
    cityName?: string,
    existingAgencies: Agency[] = [],
    categoryFilter: 'all' | 'ems' | 'fire' = 'all'
  ): Agency[] {
    const sc = stateCode.toUpperCase().trim();
    if (!sc || sc === 'all') {
      return this.filterByCategory(existingAgencies, categoryFilter);
    }

    if ((!countyName || countyName === 'all') && (!cityName || cityName === 'all')) {
      return this.getAgenciesForState(sc, existingAgencies, categoryFilter);
    }

    const cleanCounty = (countyName && countyName !== 'all') ? countyName : undefined;
    const cleanCity = (cityName && cityName !== 'all') ? cityName : undefined;

    const dbMatched = nationalProviderDb.getProviders({
      state: sc,
      county: cleanCounty,
      city: cleanCity,
      category: categoryFilter,
    });

    const resultsMap = new Map<string, Agency>();
    for (const a of dbMatched) resultsMap.set(a.id, a);

    for (const a of filterSavedAgencyRecordsForJurisdiction(existingAgencies, sc, cleanCounty, cleanCity)) {
      resultsMap.set(a.id, a);
    }

    const results = Array.from(resultsMap.values());
    // No provider is manufactured for missing cities or categories.
    return this.filterByCategory(results, categoryFilter);
  }

  /** Include every saved county-matched account, including rural locations absent from place directories. */
  public getAgenciesForCounty(
    stateCode: string,
    countyName: string,
    existingAgencies: Agency[] = [],
    categoryFilter: 'all' | 'ems' | 'fire' = 'all'
  ): Agency[] {
    const sc = stateCode.toUpperCase().trim();
    if (!sc || sc === 'all' || !countyName || countyName === 'all') {
      return this.getAgenciesForState(sc, existingAgencies, categoryFilter);
    }

    return this.getAgenciesForJurisdiction(sc, countyName, undefined, existingAgencies, categoryFilter);
  }

  public getZipCodesForLocation(stateCode: string, countyName?: string): string[] {
    const sc = stateCode.toUpperCase().trim();
    if (!sc || sc === 'all') return ['90210', '10001', '60601', '75001', '30303', '33101', '44114', '98101'];

    if (countyName && countyName !== 'all') {
      const county = this.getCountyRecord(sc, countyName);
      if (county && county.primaryZipCodes) {
        return county.primaryZipCodes;
      }
    }

    const stSummary = ALL_50_STATES_SUMMARIES[sc];
    if (stSummary && stSummary.primaryZipPrefixes) {
      return stSummary.primaryZipPrefixes.map(p => `${p}01`);
    }

    return [];
  }

  /**
   * Resolve an authoritative EMS/Fire agency account for any jurisdiction (delegating first to nationalProviderDb)
   */
  public resolveOrSynthesizeAgency(
    stateCode: string,
    countyName: string,
    cityName?: string,
    existingAgencies: Agency[] = [],
    forcedCategory?: 'ems' | 'fire'
  ): Agency | undefined {
    const sc = stateCode.toUpperCase().trim();
    // Compatibility method name only: no synthesis, city fallback, or guessed identity.
    const records=this.getAgenciesForJurisdiction(sc,countyName,cityName,existingAgencies,forcedCategory??'all');
    return records.length===1?records[0]:undefined;
  }

  /**
   * Universal search across all 3,144 counties and 9,800+ cities & fire/EMS districts nationwide
   */
  public searchNationwide(query: string, limit: number = 20): Array<{
    type: 'county' | 'city' | 'zip';
    label: string;
    sublabel: string;
    stateCode: string;
    countyName: string;
    cityName: string;
    zipCode?: string;
  }> {
    const q = query.toLowerCase().trim();
    if (!q) return [];

    const results: Array<{
      type: 'county' | 'city' | 'zip';
      label: string;
      sublabel: string;
      stateCode: string;
      countyName: string;
      cityName: string;
      zipCode?: string;
    }> = [];

    for (const county of ALL_NATIONWIDE_COUNTIES) {
      if (results.length >= limit) break;
      if (
        county.countyName.toLowerCase().includes(q) ||
        county.rawName.toLowerCase().includes(q) ||
        county.countySeat.toLowerCase().includes(q) ||
        county.countyFips.includes(q)
      ) {
        results.push({
          type: 'county',
          label: `${county.countyName}, ${county.stateCode}`,
          sublabel: `Pop: ${(county.population == null ? 'not available' : county.population.toLocaleString())} • Seat: ${county.countySeat} • Cities: ${county.cities.length}`,
          stateCode: county.stateCode,
          countyName: county.countyName,
          cityName: county.countySeat
        });
      }
    }

    if (results.length < limit) {
      for (const [st, cities] of Object.entries(ALL_CITIES_BY_STATE)) {
        if (results.length >= limit) break;
        for (const city of cities) {
          if (city.toLowerCase().includes(q)) {
            const county = this.countyIndex.get(st)?.find(c => c.cities && c.cities.includes(city));
            results.push({
              type: 'city',
              label: `${city}, ${st}`,
              sublabel: `${county ? county.countyName : 'County Jurisdiction'} • Official US Census & District Roster`,
              stateCode: st,
              countyName: county ? county.countyName : `${city} County`,
              cityName: city
            });
            if (results.length >= limit) break;
          }
        }
      }
    }

    return results;
  }
}

export const territoryEngine = new TerritoryIntelligenceService();
