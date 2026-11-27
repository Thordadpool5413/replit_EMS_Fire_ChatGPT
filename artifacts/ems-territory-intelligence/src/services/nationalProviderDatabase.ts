import { matchesAgencyScope } from '../utils/providerRecordTrust';
// Legacy geography-derived and illustrative provider records are not loaded in production.
import { hasCountyPlanningInputs } from '../utils/countyPlanningInputs';
import { canonicalizeAgencyCounty, normalizeCountyName } from '../utils/countyIdentity';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  Agency, 
  AgencyType, 
  ZollProductLine, 
  PriorityTier, 
  LeadStage
} from '../types';
import { ALL_NATIONWIDE_COUNTIES, ComprehensiveCountyRecord } from '../data/allCountiesDatabase';
import { CITIES_BY_STATE_AND_COUNTY, STATE_GEO_AND_AREA_CODES } from '../data/allCitiesDatabase';
import { ALL_50_STATES_SUMMARIES } from '../data/nationalGeographicData';
import { NATIONAL_ZIP_CITY_REGISTRY } from '../data/nationalZipCityRegistry';
import { calculatePulseIqContributions, DEFAULT_WEIGHTS } from '../utils/pulseIqScoring';

export interface ProviderFilterOptions {
  state?: string;
  county?: string;
  city?: string;
  category?: 'all' | 'ems' | 'fire';
  search?: string;
  stage?: LeadStage | 'all';
  product?: ZollProductLine | 'all';
  limit?: number;
}

export interface NationalProviderStats {
  totalProviders: number;
  totalEmsProviders: number;
  totalFireDepartments: number;
  totalStates: number;
  totalCounties: number;
  totalCities: number;
  totalPipelineValue: number;
  totalCriticalOpportunities: number;
  totalAfgFunding: number;
  totalRecoverableRevenue: number;
  totalCardiacArrests: number;
}

const LIVE_VERIFIED_STORAGE_KEY = 'zoll_verified_providers_cache_v5';
const LEGACY_VERIFIED_KEYS = [
  'zoll_verified_providers_cache_v1',
  'zoll_verified_providers_cache_v2',
  'zoll_verified_providers_cache_v3',
  'zoll_verified_providers_cache_v4',
];

/**
 * National Provider & Fire Department Database Infrastructure
 * Compatibility accessor for the retired local seed directory. No generated provider records.
 */
function verifiedCacheKey(): string {
  let session = 'visitor';
  try { session = sessionStorage.getItem('ems_authenticated_user') || 'visitor'; } catch {}
  return LIVE_VERIFIED_STORAGE_KEY + '_' + encodeURIComponent(session);
}

class NationalProviderDatabaseService {
  private providers: Agency[] = [];
  private providersById: Map<string, Agency> = new Map();
  private providersByState: Map<string, Agency[]> = new Map();
  private providersByCounty: Map<string, Agency[]> = new Map();
  private providersByCity: Map<string, Agency[]> = new Map();
  private emsProviders: Agency[] = [];
  private fireDepartments: Agency[] = [];
  private zipCityLookup: Map<string, { zipCode: string; lat: number; lng: number }> = new Map();
  private isInitialized = false;

  constructor() {
    this.buildDatabase();
  }

  private buildZipCityLookup() {
    for (const z of NATIONAL_ZIP_CITY_REGISTRY) {
      const key = `${z.stateCode.toUpperCase()}:${z.city.toLowerCase().trim()}`;
      if (!this.zipCityLookup.has(key)) {
        this.zipCityLookup.set(key, {
          zipCode: z.zipCode,
          lat: z.latitude,
          lng: z.longitude,
        });
      }
    }
  }

  private getSavedVerifications(): Record<string, Partial<Agency>> {
    if (typeof window === 'undefined') return {};
    try {
      for (const k of LEGACY_VERIFIED_KEYS) {
        window.localStorage.removeItem(k);
      }
      const raw = window.localStorage.getItem(verifiedCacheKey());
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  public saveLiveVerification(agencyId: string, patch: Partial<Agency>): Agency | undefined {
    this.buildDatabase();
    const existing = this.providersById.get(agencyId);
    if (!existing) return undefined;

    const sanitizedContacts = (patch.keyContacts && patch.keyContacts.length > 0 ? patch.keyContacts : existing.keyContacts).map((kc) => ({
      ...kc,
      phone: '',
    }));

    const updated: Agency = {
      ...existing,
      ...patch,
      headquartersPhone: '',
      keyContacts: sanitizedContacts,
    };

    this.providersById.set(agencyId, updated);
    const idx = this.providers.findIndex((p) => p.id === agencyId);
    if (idx !== -1) this.providers[idx] = updated;

    const st = updated.stateCode.toUpperCase();
    const stList = this.providersByState.get(st);
    if (stList) {
      const sIdx = stList.findIndex((p) => p.id === agencyId);
      if (sIdx !== -1) stList[sIdx] = updated;
    }

    const countyKey = `${st}:${normalizeCountyName(updated.county)}`;
    const cList = this.providersByCounty.get(countyKey);
    if (cList) {
      const cIdx = cList.findIndex((p) => p.id === agencyId);
      if (cIdx !== -1) cList[cIdx] = updated;
    }

    const cityKey = `${st}:${updated.city.toLowerCase().trim()}`;
    const ctList = this.providersByCity.get(cityKey);
    if (ctList) {
      const ctIdx = ctList.findIndex((p) => p.id === agencyId);
      if (ctIdx !== -1) ctList[ctIdx] = updated;
    }

    if (typeof window !== 'undefined') {
      try {
        const current = this.getSavedVerifications();
        if (updated.isVerifiedRecord) {
          current[agencyId] = {
            address: updated.address,
            zipCode: updated.zipCode,
            npiNumber: updated.npiNumber,
            headquartersPhone: '',
            officialWebsite: updated.officialWebsite,
            mapSearchUri: updated.mapSearchUri,
            verificationSource: updated.verificationSource,
            isVerifiedRecord: true,
            lastVerifiedAt: updated.lastVerifiedAt || new Date().toISOString(),
            factEvidence: updated.factEvidence,
            keyContacts: updated.keyContacts,
          };
          window.localStorage.setItem(verifiedCacheKey(), JSON.stringify(current));
        } else {
          // P0 Protection: Do NOT delete user-entered or previously source-backed data on failed/timeout verification.
          // Preserve existing identifiers and record the verification attempt.
          if (current[agencyId]) {
            current[agencyId] = {
              ...current[agencyId],
              isVerifiedRecord: false,
              verificationAttempt: updated.verificationAttempt || current[agencyId]?.verificationAttempt,
            };
            window.localStorage.setItem(verifiedCacheKey(), JSON.stringify(current));
          }
        }
      } catch {
        // Ignore storage quota errors
      }
    }

    return updated;
  }

  public applyLiveVerification(
    agencyId: string,
    info: {
      npiNumber?: string;
      verifiedAddress?: string;
      verifiedPhone?: string;
      officialWebsite?: string;
      mapSearchUri?: string;
      authorizedOfficialName?: string;
      authorizedOfficialTitle?: string;
      verificationSource?: string;
    }
  ): Agency | undefined {
    this.buildDatabase();
    const existing = this.providersById.get(agencyId);
    if (!existing) return undefined;

    const nextContacts = existing.keyContacts.map((kc, idx) => {
      if (idx === 0) {
        return {
          ...kc,
          name: info.authorizedOfficialName || kc.name,
          title: info.authorizedOfficialTitle || kc.title,
          phone: '',
          officialWebsite: info.officialWebsite || kc.officialWebsite,
          headquartersAddress: info.verifiedAddress || kc.headquartersAddress,
          isVerifiedOfficial: true,
          verificationSource: info.verificationSource || kc.verificationSource,
        };
      }
      return { ...kc, phone: '' };
    });

    return this.saveLiveVerification(agencyId, {
      npiNumber: info.npiNumber || existing.npiNumber,
      address: info.verifiedAddress || existing.address,
      headquartersPhone: '',
      officialWebsite: info.officialWebsite || existing.officialWebsite,
      mapSearchUri: info.mapSearchUri || existing.mapSearchUri,
      verificationSource: info.verificationSource || existing.verificationSource,
      isVerifiedRecord: true,
      keyContacts: nextContacts,
    });
  }

  /** Provider accounts come from the explicit saved directory and source-native registry workflow.
   * The historic baseline and geography generators are deliberately not initialized.
   * Public source listings are browsed through NationalSourceDirectory, not synthetic accounts. */
  private buildDatabase() {
    if (this.isInitialized) return;
    this.isInitialized = true;
  }

  /**
   * Get all agencies with flexible filtering across all 50 states + DC, 3,144 counties, and 9,800+ cities & districts
   */
  public getProviders(options?: ProviderFilterOptions): Agency[] {
    this.buildDatabase();
    let result = this.providers;

    if (!options) return result;

    const { state, county, city, category, search, stage, product, limit } = options;

    if (state && state.toLowerCase() !== 'all') {
      let sc = state.toUpperCase().trim();
      if (!this.providersByState.has(sc)) {
        const match = Object.entries(ALL_50_STATES_SUMMARIES).find(
          ([code, s]) => s.state.toLowerCase() === state.toLowerCase().trim()
        );
        if (match) sc = match[0];
      }
      if (county && county.toLowerCase() !== 'all') {
        const cClean = normalizeCountyName(county);
        result = this.providersByCounty.get(`${sc}:${cClean}`) || [];
        if (result.length === 0) {
          const stList = this.providersByState.get(sc) || [];
          result = stList.filter(p => {
            const pClean = normalizeCountyName(p.county);
            return pClean === cClean;
          });
        }
      } else {
        result = this.providersByState.get(sc) || [];
      }
    } else if (county && county.toLowerCase() !== 'all') {
      const cClean = normalizeCountyName(county);
      result = result.filter(p => normalizeCountyName(p.county) === cClean);
    }

    if (city && city !== 'all') {
      const cClean = city.toLowerCase().trim();
      result = result.filter(p => p.city.toLowerCase().trim() === cClean);
    }

    if (category && category !== 'all') {
      if (category === 'ems') {
        result = result.filter(p => matchesAgencyScope(p, 'ems'));
      } else if (category === 'fire') {
        result = result.filter(p => matchesAgencyScope(p, 'fire'));
      }
    }

    if (stage && stage !== 'all') {
      result = result.filter(p => p.zollOpportunity.salesStage === stage);
    }

    if (product && product !== 'all') {
      result = result.filter(p => p.zollOpportunity.primaryTargetProduct === product);
    }

    if (search && search.trim()) {
      const q = search.toLowerCase().trim();
      result = result.filter(p => 
        p.name.toLowerCase().includes(q) ||
        p.county.toLowerCase().includes(q) ||
        p.city.toLowerCase().includes(q) ||
        p.stateCode.toLowerCase() === q ||
        p.state.toLowerCase().includes(q) ||
        p.zipCode.includes(q) ||
        p.fdid.toLowerCase().includes(q) ||
        p.keyContacts.some(c => c.name.toLowerCase().includes(q))
      );
    }

    if (limit && limit > 0) {
      return result.slice(0, limit);
    }

    return result;
  }

  /**
   * Get pair of EMS Provider and Fire Department for a given location
   */
  public getEmsAndFirePair(stateCode: string, countyName: string, cityName?: string): { emsProvider: Agency | null; fireDepartment: Agency | null } {
    this.buildDatabase();
    const sc = stateCode.toUpperCase().trim();
    if (cityName && cityName !== 'all') {
      const cityKey = `${sc}:${cityName.toLowerCase().trim()}`;
      const cityProviders = this.providersByCity.get(cityKey) || [];
      const ems = cityProviders.find(p => matchesAgencyScope(p, 'ems')) || null;
      const fire = cityProviders.find(p => matchesAgencyScope(p, 'fire')) || null;
      if (ems || fire) return { emsProvider: ems, fireDepartment: fire };
    }

    const countyKey = `${sc}:${normalizeCountyName(countyName)}`;
    const countyProviders = this.providersByCounty.get(countyKey) || [];

    const ems = countyProviders.find(p => matchesAgencyScope(p, 'ems')) || null;
    const fire = countyProviders.find(p => matchesAgencyScope(p, 'fire')) || null;

    return { emsProvider: ems, fireDepartment: fire };
  }

  public searchProviders(query: string, limit: number = 25): Agency[] {
    return this.getProviders({ search: query, limit });
  }

  public getStats(stateCode?: string): NationalProviderStats {
    this.buildDatabase();
    const list = stateCode && stateCode !== 'all' 
      ? (this.providersByState.get(stateCode.toUpperCase()) || []) 
      : this.providers;

    let totalPipeline = 0;
    let criticalCount = 0;
    let totalAfg = 0;
    let totalRecoverable = 0;
    let totalCardiac = 0;
    let emsCount = 0;
    let fireCount = 0;
    const citySet = new Set<string>();

    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      totalPipeline += p.zollOpportunity.projectedPipelineValue;
      if (p.zollOpportunity.pulseIqScore >= 90) criticalCount++;
      totalAfg += (p.grantStatus.afgAwardAmount || 0);
      totalRecoverable += (p.cmsData.estimatedRecoverableRevenue || 0);
      totalCardiac += p.annualCardiacArrestCalls;
      citySet.add(`${p.stateCode}:${p.city}`);

      if (matchesAgencyScope(p, 'fire')) fireCount++;
      if (matchesAgencyScope(p, 'ems')) emsCount++;
    }

    return {
      totalProviders: list.length,
      totalEmsProviders: emsCount,
      totalFireDepartments: fireCount,
      totalStates: stateCode && stateCode !== 'all' ? 1 : 51,
      totalCounties: stateCode && stateCode !== 'all' ? (ALL_NATIONWIDE_COUNTIES.filter(c => c.stateCode === stateCode).length) : 3144,
      totalCities: citySet.size,
      totalPipelineValue: totalPipeline,
      totalCriticalOpportunities: criticalCount,
      totalAfgFunding: totalAfg,
      totalRecoverableRevenue: totalRecoverable,
      totalCardiacArrests: totalCardiac
    };
  }

  public getInitialBaselineAgencies(): Agency[] {
    this.buildDatabase();
    return this.providers;
  }
}

export const nationalProviderDb = new NationalProviderDatabaseService();
