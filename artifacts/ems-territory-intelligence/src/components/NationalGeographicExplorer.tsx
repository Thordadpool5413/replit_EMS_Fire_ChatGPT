/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Agency, PredictiveWeights } from '../types';
import { DEFAULT_WEIGHTS } from '../utils/pulseIqScoring';
import { PulseIqEstimateLabel } from './PulseIqEstimateLabel';
import { AgencyCompareButton } from './AgencyCompareButton';
import { hasAgencyFactEvidence } from '../data/agencyFactEvidence';
import { ALL_50_STATES_SUMMARIES, NATIONAL_COUNTIES_DIRECTORY, CountyHealthRecord } from '../data/nationalGeographicData';
import { US_STATES_SVG_PATHS, EAST_COAST_CALLOUT_STATES } from '../data/usStatesSvgPaths';
import { NATIONAL_ZIP_CITY_REGISTRY, lookupZipCode, searchLocations, getZipCodesForState, ZipCityRecord } from '../data/nationalZipCityRegistry';
import { territoryEngine } from '../services/territoryIntelligenceEngine';
import { nationalProviderDb } from '../services/nationalProviderDatabase';
import { ProviderDenialDetails } from './ProviderDenialDetails';
import { CountyDirectoryCard } from './CountyDirectoryCard';
import './countyGeoTokens.css';
import './CountyProviders.css';
import {
  getStateZipDenialProfileSummary,
} from '../services/countyDenialProfileService';
import { 
  Globe, 
  MapPin, 
  Building2, 
  Search, 
  Filter, 
  ChevronRight, 
  Activity, 
  TrendingDown, 
  Award, 
  DollarSign, 
  ExternalLink, 
  ShieldCheck, 
  Layers, 
  CheckCircle2, 
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Phone,
  Mail,
  Navigation,
  Compass,
  FileText,
  Plus,
  Flame,
  Siren,
  BarChart3,
  ListOrdered,
  Scale,
  Car,
  Zap,
  LayoutGrid,
  Table as TableIcon,
  Share2,
  ArrowLeft,
  MapPinned
} from 'lucide-react';
import { PulseIqRegionalBreakdownChart } from './PulseIqRegionalBreakdownChart';
import { RealWorldCountyBoundaryMap } from './RealWorldCountyBoundaryMap';
import { countyBoundaryHierarchy } from '../services/countyBoundaryHierarchyService';
import {
  getGetNriCountyContextQueryKey,
  useGetNriCountyContext,
  type NriCountyContextRecord,
} from '@workspace/api-client-react';
import { PulseIqScoreTooltip } from './PulseIqScoreTooltip';
import { DealStoryBriefingView } from './DealStoryBriefingView';
import { CompetitiveBattlecardView } from './CompetitiveBattlecardView';
import { PulseIqScoreExplainerHub } from './PulseIqScoreExplainerHub';
import { DataLabel } from './DataLabel';
import { MobileFilterDisclosure } from './MobileFilterDisclosure';
import { MISSING_INPUT_COPY } from '../utils/missingInputCopy';


const STATE_MAP_PALETTE = ['#D1FAE5', '#A7F3D0', '#6EE7B7', '#34D399', '#059669'] as const;

const hasVerifiedModelInputs = (agency: Agency) =>
  hasAgencyFactEvidence(agency, 'frontlineApparatusStations') &&
  hasAgencyFactEvidence(agency, 'annualEmergencyVolume') &&
  hasAgencyFactEvidence(agency, 'clinicalOutcomes') &&
  hasAgencyFactEvidence(agency, 'defibrillatorBiomedicalFleet') &&
  hasAgencyFactEvidence(agency, 'maintenanceContracts') &&
  hasAgencyFactEvidence(agency, 'cmsClaims') &&
  hasAgencyFactEvidence(agency, 'federalGrant');

const formatCompactDollars = (value: number) => {
  if (!Number.isFinite(value)) return 'Not reported';
  const absoluteValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (absoluteValue >= 1_000_000) return `${sign}$${(absoluteValue / 1_000_000).toFixed(1)}M`;
  if (absoluteValue >= 1_000) return `${sign}$${Math.round(absoluteValue / 1_000).toLocaleString()}K`;
  return `${sign}$${absoluteValue.toLocaleString()}`;
};

const safeAgencyWebsiteUrl = (value?: string) => {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const candidate = /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
};

interface NationalGeographicExplorerProps {
  agencies: Agency[];
  initialMode?: 'states' | 'counties' | 'cities' | 'pulseiq_chart';
  onModeChange?: (mode: 'states' | 'counties' | 'cities' | 'pulseiq_chart') => void;
  onSelectAgency: (agency: Agency) => void;
  onPreviewAgency?: (agency: Agency) => void;
  onNavigateToQueueWithFilter?: (stateCode?: string, county?: string, city?: string, zip?: string) => void;
  onOpenRfpGenerator?: (agency: Agency) => void;
  onOpenDataLineage?: (agency?: Agency) => void;
  onAddAgency?: (agency: Agency) => void;
  globalState?: string;
  globalCounty?: string;
  globalCity?: string;
  globalCategory?: 'all' | 'ems' | 'fire';
  onShareTerritory?: () => void;
  activeAccount?: Agency | null;
  onSyncGlobalGeography?: (state: string, county: string, city: string, category?: 'all' | 'ems' | 'fire') => void;
  comparedAgencyIds?: string[];
  onToggleAgencyComparison?: (agency: Agency) => void;
  weights?: PredictiveWeights;
}

export const NationalGeographicExplorer: React.FC<NationalGeographicExplorerProps> = ({
  agencies,
  initialMode,
  onModeChange,
  onSelectAgency,
  onPreviewAgency,
  onNavigateToQueueWithFilter,
  onOpenRfpGenerator,
  onOpenDataLineage,
  onAddAgency,
  globalState,
  globalCounty,
  globalCity,
  globalCategory,
  onShareTerritory,
  activeAccount,
  onSyncGlobalGeography,
  comparedAgencyIds = [],
  onToggleAgencyComparison,
  weights = DEFAULT_WEIGHTS
}) => {
  // Navigation / Drill-down state
  const [selectedStateCode, setSelectedStateCode] = useState<string>(globalState || 'all');
  const [selectedCountyName, setSelectedCountyName] = useState<string>(globalCounty || 'all');
  const [selectedCityName, setSelectedCityName] = useState<string>(globalCity || 'all');
  const [agencyCategoryFilter, setAgencyCategoryFilter] = useState<'all' | 'ems' | 'fire'>(globalCategory || 'all');
  const [middleTab, setMiddleTabState] = useState<'states' | 'counties' | 'cities' | 'pulseiq_chart'>(initialMode || 'states');
  const [zipSearchQuery, setZipSearchQuery] = useState<string>('');
  const [debouncedZipQuery, setDebouncedZipQuery] = useState<string>('');
  const [stateFilterInput, setStateFilterInput] = useState<string>('');
  const [cityFilterInput, setCityFilterInput] = useState<string>('');
  const [debouncedCityFilter, setDebouncedCityFilter] = useState<string>('');
  const [countyFilterInput, setCountyFilterInput] = useState<string>('');
  const [debouncedCountyFilter, setDebouncedCountyFilter] = useState<string>('');
  const [regionFilter, setRegionFilter] = useState<'All' | 'Northeast' | 'Midwest' | 'South' | 'West'>('All');
  const [showCityPillsDrawer, setShowCityPillsDrawer] = useState<boolean>(false);
  const [providerSortBy, setProviderSortBy] = useState<'pulseIq' | 'fleetAge' | 'value'>('pulseIq');
  const [stateMapLayer, setStateMapLayer] = useState<'agency-records' | 'fema-loss'>('agency-records');

  const [providerViewMode, setProviderViewModeState] = useState<'cards' | 'table'>(() => {
    try {
      const saved = localStorage.getItem('nicks_agency_view_mode_v2');
      if (saved === 'cards' || saved === 'table') return saved;
    } catch {
      // ignore
    }
    return 'table';
  });

  const setProviderViewMode = (mode: 'cards' | 'table') => {
    setProviderViewModeState(mode);
    try {
      localStorage.setItem('nicks_agency_view_mode_v2', mode);
    } catch {
      // ignore
    }
  };

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedZipQuery(zipSearchQuery), 120);
    return () => clearTimeout(timer);
  }, [zipSearchQuery]);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedCityFilter(cityFilterInput), 120);
    return () => clearTimeout(timer);
  }, [cityFilterInput]);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedCountyFilter(countyFilterInput), 120);
    return () => clearTimeout(timer);
  }, [countyFilterInput]);

  const setMiddleTab = (nextMode: 'states' | 'counties' | 'cities' | 'pulseiq_chart') => {
    setMiddleTabState(nextMode);
    if (onModeChange) {
      onModeChange(nextMode);
    }
  };

  React.useEffect(() => {
    if (initialMode && initialMode !== middleTab) {
      setMiddleTabState(initialMode);
    }
  }, [initialMode]);

  // Synchronize when Global Selector Bar changes State, County, City, or Category
  React.useEffect(() => {
    if (globalState !== undefined && globalState !== selectedStateCode) {
      setSelectedStateCode(globalState);
      if (globalState === 'all') {
        setMiddleTabState('states');
      } else if (!globalCounty || globalCounty === 'all') {
        setMiddleTabState('counties');
      }
      setCountyPage(1);
      setCityPage(1);
      setAgencyPage(1);
    }
  }, [globalState]);

  React.useEffect(() => {
    if (globalCounty !== undefined && globalCounty !== selectedCountyName) {
      setSelectedCountyName(globalCounty);
      if (globalCounty !== 'all') {
        setMiddleTabState('cities');
      } else if (selectedStateCode !== 'all') {
        setMiddleTabState('counties');
      }
      setCityPage(1);
      setAgencyPage(1);
    }
  }, [globalCounty, selectedStateCode]);

  React.useEffect(() => {
    if (globalCity !== undefined && globalCity !== selectedCityName) {
      setSelectedCityName(globalCity);
      if (globalCity !== 'all') {
        setMiddleTab('cities');
      }
      setAgencyPage(1);
    }
  }, [globalCity]);

  React.useEffect(() => {
    if (globalCategory !== undefined && globalCategory !== agencyCategoryFilter) {
      setAgencyCategoryFilter(globalCategory);
      setAgencyPage(1);
    }
  }, [globalCategory]);

  // Hierarchical data structure mapping all 50 States + DC -> 3,144 County Boundaries -> Incorporated US Census/USPS Cities -> Providers
  const nationalHierarchy = useMemo(() => {
    return countyBoundaryHierarchy.getHierarchy(agencies);
  }, [agencies]);

  // Search locations query matching across cities, counties, and zips
  const matchingLocations = useMemo(() => {
    if (!zipSearchQuery.trim()) return [];
    return searchLocations(zipSearchQuery).slice(0, 8);
  }, [zipSearchQuery]);

  // Direct Zip search result or primary matched record
  const searchedZipRecord = useMemo(() => {
    if (!zipSearchQuery.trim()) return null;
    const clean = zipSearchQuery.trim();
    if (/^\d{5}$/.test(clean)) {
      return lookupZipCode(clean) || null;
    }
    if (matchingLocations.length > 0) {
      return matchingLocations[0];
    }
    return null;
  }, [zipSearchQuery, matchingLocations]);

  // States list sorted alphabetically and filtered by region / stateFilterInput
  const statesList = useMemo(() => {
    const q = stateFilterInput.toLowerCase().trim();
    return Object.values(ALL_50_STATES_SUMMARIES)
      .filter(s => regionFilter === 'All' || s.region === regionFilter)
      .filter(s => {
        if (!q) return true;
        return (
          s.state.toLowerCase().includes(q) ||
          s.code.toLowerCase().includes(q) ||
          s.region.toLowerCase().includes(q) ||
          s.majorCounties.some(mc => mc.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => a.state.localeCompare(b.state));
  }, [regionFilter, stateFilterInput]);

  // Selected state summary
  const activeStateSummary = useMemo(() => {
    if (selectedStateCode === 'all') return null;
    return ALL_50_STATES_SUMMARIES[selectedStateCode] || null;
  }, [selectedStateCode]);

  // Available counties for selected state
  const availableCounties = useMemo(() => {
    let list: CountyHealthRecord[] = [];
    if (selectedStateCode !== 'all') {
      list = territoryEngine.getCountiesForState(selectedStateCode);
    } else {
      list = NATIONAL_COUNTIES_DIRECTORY;
    }

    if (debouncedCountyFilter.trim()) {
      const q = debouncedCountyFilter.toLowerCase().trim();
      list = list.filter(c => 
        c.countyName.toLowerCase().includes(q) || 
        c.countySeat.toLowerCase().includes(q) ||
        (c.cities && c.cities.some((city: string) => city.toLowerCase().includes(q)))
      );
    }

    if (debouncedZipQuery.trim()) {
      const q = debouncedZipQuery.toLowerCase().trim();
      list = list.filter(c => 
        c.countyName.toLowerCase().includes(q) || 
        c.stateName.toLowerCase().includes(q) ||
        c.stateCode.toLowerCase() === q ||
        c.countySeat.toLowerCase().includes(q)
      );
    }
    return list;
  }, [selectedStateCode, debouncedCountyFilter, debouncedZipQuery]);

  const [countyPage, setCountyPage] = useState<number>(1);
  const [cityPage, setCityPage] = useState<number>(1);
  const [agencyPage, setAgencyPage] = useState<number>(1);
  const GEO_LIST_PAGE_SIZE = 60;
  const AGENCY_PAGE_SIZE = 30;

  // Precompute state agency counts for O(1) display in the 50-state directory
  const stateAgencyCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 0; i < agencies.length; i++) {
      const sc = agencies[i].stateCode;
      map.set(sc, (map.get(sc) || 0) + 1);
    }
    return map;
  }, [agencies]);
  const nriNationalQuery = useGetNriCountyContext(undefined, {
    query: {
      enabled: stateMapLayer === 'fema-loss',
      queryKey: getGetNriCountyContextQueryKey(undefined),
      staleTime: 6 * 60 * 60 * 1000,
    },
  });
  const selectedStateNriParams = useMemo(
    () => selectedStateCode !== 'all' ? { stateCode: selectedStateCode } : undefined,
    [selectedStateCode],
  );
  const selectedStateNriQuery = useGetNriCountyContext(selectedStateNriParams, {
    query: {
      enabled: selectedStateCode !== 'all' && middleTab === 'counties',
      queryKey: getGetNriCountyContextQueryKey(selectedStateNriParams),
      staleTime: 6 * 60 * 60 * 1000,
    },
  });
  const selectedStateNriByCountyFips = useMemo(
    () => new Map(
      (selectedStateNriQuery.data?.records ?? []).map((record) => [record.countyFips, record]),
    ),
    [selectedStateNriQuery.data?.records],
  );
  const nriNationalVintageLabel = useMemo(() => {
    const records = nriNationalQuery.data?.records ?? [];
    const versions = new Set(
      records
        .map((record) => record.sourceVersion.trim())
        .filter((version) => version && version !== 'Version not stated'),
    );
    const hasUnstatedVersion = records.some(
      (record) =>
        !record.sourceVersion.trim() ||
        record.sourceVersion.trim() === 'Version not stated',
    );
    if (versions.size > 1) return 'varies across county records';
    if (hasUnstatedVersion) return 'not stated for every county';
    return versions.size === 1 ? [...versions][0] : 'version not stated';
  }, [nriNationalQuery.data?.records]);
  const stateNriSummaryByCode = useMemo(() => {
    const byState = new Map<string, NriCountyContextRecord[]>();
    for (const record of nriNationalQuery.data?.records ?? []) {
      if (!byState.has(record.stateCode)) byState.set(record.stateCode, []);
      byState.get(record.stateCode)!.push(record);
    }
    const summary = new Map<string, {
      totalExpectedAnnualLoss: number | null;
      availableRecords: number;
      sourceRecordCount: number;
      coverageComplete: boolean;
      duplicateFips: boolean;
      invalidFips: boolean;
      sourceVersion: string | null;
      mixedSourceVersions: boolean;
      unstatedSourceVersion: boolean;
    }>();
    for (const state of Object.values(ALL_50_STATES_SUMMARIES)) {
      const rows = byState.get(state.code);
      const sourceRows = rows ?? [];
      const uniqueFips = new Set(sourceRows.map((record) => record.countyFips));
      const duplicateFips = uniqueFips.size !== sourceRows.length;
      const invalidFips = sourceRows.some((record) => !/^\d{5}$/.test(record.countyFips));
      const availableRecords = sourceRows.filter(
        (record) => Number.isFinite(record.expectedAnnualLoss),
      ).length;
      const sourceVersions = new Set(
        sourceRows
          .map((record) => record.sourceVersion.trim())
          .filter((version) => version && version !== 'Version not stated'),
      );
      const mixedSourceVersions = sourceVersions.size > 1;
      const unstatedSourceVersion = sourceRows.some(
        (record) => !record.sourceVersion.trim() || record.sourceVersion.trim() === 'Version not stated',
      );
      const sourceVersion =
        sourceVersions.size === 1 &&
        !unstatedSourceVersion
          ? [...sourceVersions][0]
          : null;
      const coverageComplete =
        sourceRows.length > 0 &&
        !duplicateFips &&
        !invalidFips &&
        availableRecords === sourceRows.length &&
        sourceVersion !== null;
      const totalExpectedAnnualLoss = coverageComplete
        ? sourceRows.reduce(
            (total, record) => total + (record.expectedAnnualLoss ?? 0),
            0,
          )
        : null;
      summary.set(state.code, {
        totalExpectedAnnualLoss,
        availableRecords,
        sourceRecordCount: sourceRows.length,
        coverageComplete,
        duplicateFips,
        invalidFips,
        sourceVersion,
        mixedSourceVersions,
        unstatedSourceVersion,
      });
    }
    return summary;
  }, [nriNationalQuery.data?.records]);
  const stateMapColorByCode = useMemo(() => {
    const selectedValues = stateMapLayer === 'fema-loss'
      ? [...stateNriSummaryByCode.entries()]
          .filter(([, value]) => value.coverageComplete && value.totalExpectedAnnualLoss != null)
          .map(([code, value]) => ({ code, value: value.totalExpectedAnnualLoss! }))
      : Object.keys(ALL_50_STATES_SUMMARIES).map((code) => ({
          code,
          value: stateAgencyCounts.get(code) ?? 0,
        }));
    selectedValues.sort((a, b) => a.value - b.value);
    const colors = new Map<string, string>();
    selectedValues.forEach((item, index) => {
      const bucket = Math.min(STATE_MAP_PALETTE.length - 1, Math.floor(index * STATE_MAP_PALETTE.length / Math.max(selectedValues.length, 1)));
      colors.set(item.code, STATE_MAP_PALETTE[bucket]);
    });
    return colors;
  }, [stateMapLayer, stateNriSummaryByCode, stateAgencyCounts]);

  // Available cities for selected state & county with rich metadata across all 50 states
  const availableCities = useMemo(() => {
    // Optimization: Skip computing all 20,973 cities if in states mode with no search
    if (
      selectedStateCode === 'all' &&
      selectedCountyName === 'all' &&
      middleTab !== 'cities' &&
      !debouncedCityFilter.trim() &&
      !debouncedZipQuery.trim()
    ) {
      return [];
    }

    let cities = territoryEngine.getAllCitiesWithMetadata(
      selectedStateCode, 
      selectedCountyName !== 'all' ? selectedCountyName : undefined
    );

    if (debouncedCityFilter.trim()) {
      const q = debouncedCityFilter.toLowerCase().trim();
      cities = cities.filter(c => 
        c.city.toLowerCase().includes(q) || 
        c.county.toLowerCase().includes(q) ||
        c.stateCode.toLowerCase().includes(q) ||
        (c.primaryZip && c.primaryZip.includes(q))
      );
    }

    if (debouncedZipQuery.trim()) {
      const q = debouncedZipQuery.toLowerCase().trim();
      cities = cities.filter(c =>
        c.city.toLowerCase().includes(q) ||
        c.county.toLowerCase().includes(q) ||
        c.stateCode.toLowerCase() === q ||
        (c.primaryZip && c.primaryZip.includes(q))
      );
    }

    return cities;
  }, [selectedStateCode, selectedCountyName, middleTab, debouncedCityFilter, debouncedZipQuery]);

  // Active county record (normalizing County / Parish / Borough suffixes)
  const activeCountyRecord = useMemo(() => {
    if (selectedCountyName === 'all') return null;
    const normTarget = selectedCountyName.toLowerCase().replace(/\s+(county|parish|borough|census area|municipality)$/i, '').trim();
    return availableCounties.find(c => {
      const normCandidate = c.countyName.toLowerCase().replace(/\s+(county|parish|borough|census area|municipality)$/i, '').trim();
      return c.countyName.toLowerCase() === selectedCountyName.toLowerCase() || normCandidate === normTarget;
    }) || null;
  }, [selectedCountyName, availableCounties]);

  // Available postal zip codes in this jurisdiction
  const availableZipRecords = useMemo(() => {
    if (selectedStateCode === 'all') {
      return NATIONAL_ZIP_CITY_REGISTRY.slice(0, 36);
    }

    if (selectedCountyName !== 'all' && activeCountyRecord && activeCountyRecord.primaryZipCodes) {
      return activeCountyRecord.primaryZipCodes.map(z => {
        const found = lookupZipCode(z);
        if (found) return found;
        return {
          zipCode: z,
          city: activeCountyRecord.countySeat,
          county: activeCountyRecord.countyName,
          stateCode: activeCountyRecord.stateCode,
          stateName: activeCountyRecord.stateName,
          fipsCounty: activeCountyRecord.countyFips,
          population: Math.round(activeCountyRecord.population * 0.45),
          seniorPopPct: activeCountyRecord.seniorPopPct,
          medianIncome: activeCountyRecord.medianIncome,
          latitude: 38.0,
          longitude: -95.0,
          primaryAgencyName: `${activeCountyRecord.countySeat} Fire & EMS`,
          annualEmergencyTransports: Math.round(activeCountyRecord.annualEmergencyTransports * 0.4),
          annualCardiacCalls: Math.round(activeCountyRecord.annualCardiacArrestIncidents * 0.4),
          cathLabDistanceMiles: activeCountyRecord.primaryCathLabDistanceMiles,
          avgTransportMinutes: activeCountyRecord.averageTransportMinutes,
          medicareDenialRate: null
        } as ZipCityRecord;
      });
    }

    return getZipCodesForState(selectedStateCode).slice(0, 48);
  }, [selectedStateCode, selectedCountyName, activeCountyRecord, activeStateSummary]);

  // Base agency pool for the active geographic jurisdiction (before EMS/Fire category filter)
  const jurisdictionBaseAgencies = useMemo(() => {
    const q = debouncedZipQuery.toLowerCase().trim();
    let list: Agency[] = [];

    if (selectedStateCode !== 'all') {
      if (selectedCityName !== 'all') {
        const countyToTarget = selectedCountyName !== 'all' ? selectedCountyName : (availableCounties[0]?.countyName || `${selectedStateCode} County`);
        list = territoryEngine.getAgenciesForJurisdiction(
          selectedStateCode,
          countyToTarget,
          selectedCityName,
          agencies,
          'all'
        );
      } else if (selectedCountyName !== 'all') {
        list = territoryEngine.getAgenciesForCountyAndCities(
          selectedStateCode,
          selectedCountyName,
          availableCities.map(c => c.city),
          agencies,
          'all'
        );
      } else {
        list = territoryEngine.getAgenciesForState(selectedStateCode, agencies, 'all');
      }
    } else {
      // National view (or if county/city was selected directly from national list)
      if (selectedCountyName !== 'all' && activeCountyRecord?.stateCode) {
        list = territoryEngine.getAgenciesForCountyAndCities(
          activeCountyRecord.stateCode,
          selectedCountyName,
          selectedCityName !== 'all' ? [selectedCityName] : undefined,
          agencies,
          'all'
        );
      } else {
        list = agencies;
      }
      if (selectedCityName !== 'all' && selectedCountyName === 'all') {
        const ctClean = selectedCityName.toLowerCase().trim();
        list = list.filter(a => a.city.toLowerCase().trim() === ctClean);
      }
    }

    if (q) {
      const filtered: Agency[] = [];
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        if (
          a.name.toLowerCase().includes(q) ||
          a.county.toLowerCase().includes(q) ||
          a.city.toLowerCase().includes(q) ||
          a.stateCode.toLowerCase() === q ||
          a.state.toLowerCase().includes(q) ||
          a.zipCode.includes(q) ||
          a.agencyType.toLowerCase().includes(q)
        ) {
          filtered.push(a);
          if (filtered.length >= 300) break;
        }
      }
      list = filtered;
    }

    return list;
  }, [agencies, selectedStateCode, selectedCountyName, selectedCityName, debouncedZipQuery, availableCounties, availableCities]);

  const emsJurisdictionCount = useMemo(() => {
    let count = 0;
    for (let i = 0; i < jurisdictionBaseAgencies.length; i++) {
      if (!jurisdictionBaseAgencies[i].agencyType.toLowerCase().includes('fire')) count++;
    }
    return count;
  }, [jurisdictionBaseAgencies]);

  const fireJurisdictionCount = useMemo(() => {
    return jurisdictionBaseAgencies.length - emsJurisdictionCount;
  }, [jurisdictionBaseAgencies.length, emsJurisdictionCount]);

  // Matching agencies after EMS/Fire category filter & sorting
  const matchingAgencies = useMemo(() => {
    const filtered = territoryEngine.filterByCategory(jurisdictionBaseAgencies, agencyCategoryFilter);
    return [...filtered].sort((a, b) => {
      if (providerSortBy === 'pulseIq') return (b.zollOpportunity.pulseIqScore || 0) - (a.zollOpportunity.pulseIqScore || 0);
      if (providerSortBy === 'fleetAge') return b.installedFleet.defibAgeYears - a.installedFleet.defibAgeYears;
      if (providerSortBy === 'value') return b.zollOpportunity.projectedPipelineValue - a.zollOpportunity.projectedPipelineValue;
      return 0;
    });
  }, [jurisdictionBaseAgencies, agencyCategoryFilter, providerSortBy]);

  // Aggregated metrics for 'County Summary' mode across the active state or county
  const aggregatedMetrics = useMemo(() => {
    const count = matchingAgencies.length;
    if (count === 0) {
      return {
        totalPipelineValue: 0,
        totalMedicareBilled: 0,
        totalRecoverableRevenue: 0,
        avgUtsteinSurvival: 0,
        totalAmbulances: 0,
        totalFireEngines: 0,
        total911Transports: 0,
        totalCardiacCalls: 0,
        competitorFleetCount: 0,
        competitorFleetPct: 0,
        afgAwardedCount: 0,
        totalAfgGrantDollars: 0,
        avgPulseIqScore: 0
      };
    }

    let totalPipelineValue = 0;
    let totalMedicareBilled = 0;
    let totalRecoverableRevenue = 0;
    let sumSurvival = 0;
    let totalAmbulances = 0;
    let totalFireEngines = 0;
    let total911Transports = 0;
    let totalCardiacCalls = 0;
    let competitorFleetCount = 0;
    let afgAwardedCount = 0;
    let totalAfgGrantDollars = 0;
    let sumPulseIq = 0;

    for (let i = 0; i < count; i++) {
      const a = matchingAgencies[i];
      totalPipelineValue += a.zollOpportunity.projectedPipelineValue;
      totalMedicareBilled += a.cmsData.medicareBilledAnnual;
      if (a.cmsData.estimatedRecoverableRevenue != null && Number.isFinite(a.cmsData.estimatedRecoverableRevenue)) {
        totalRecoverableRevenue += a.cmsData.estimatedRecoverableRevenue;
      }
      sumSurvival += a.utsteinSurvivalRate;
      totalAmbulances += a.totalAmbulances;
      totalFireEngines += a.totalFireEngines;
      total911Transports += a.annual911Transports;
      totalCardiacCalls += a.annualCardiacArrestCalls;
      sumPulseIq += a.zollOpportunity.pulseIqScore;
      if (!a.installedFleet.defibBrand.toLowerCase().includes('zoll')) {
        competitorFleetCount++;
      }
      if (a.grantStatus.afgAwarded) {
        afgAwardedCount++;
        totalAfgGrantDollars += a.grantStatus.afgAwardAmount;
      }
    }

    return {
      totalPipelineValue,
      totalMedicareBilled,
      totalRecoverableRevenue,
      avgUtsteinSurvival: +(sumSurvival / count).toFixed(1),
      totalAmbulances,
      totalFireEngines,
      total911Transports,
      totalCardiacCalls,
      competitorFleetCount,
      competitorFleetPct: Math.round((competitorFleetCount / count) * 100),
      afgAwardedCount,
      totalAfgGrantDollars,
      avgPulseIqScore: Math.round(sumPulseIq / count)
    };
  }, [matchingAgencies]);

  const paginatedCounties = useMemo(() => {
    const start = (countyPage - 1) * GEO_LIST_PAGE_SIZE;
    return availableCounties.slice(start, start + GEO_LIST_PAGE_SIZE);
  }, [availableCounties, countyPage]);

  const totalCountyPages = Math.max(1, Math.ceil(availableCounties.length / GEO_LIST_PAGE_SIZE));

  const pagerControls = (position: 'top' | 'bottom') => {
    const first = availableCounties.length === 0 ? 0 : (countyPage - 1) * GEO_LIST_PAGE_SIZE + 1;
    const last = Math.min(countyPage * GEO_LIST_PAGE_SIZE, availableCounties.length);
    return (
      <nav className="cv-pager" aria-label={`County pages (${position})`}>
        <span data-testid={`text-county-range-${position}`}>
          {first}&ndash;{last} of {availableCounties.length.toLocaleString()}
          {totalCountyPages > 1 ? ` · page ${countyPage} of ${totalCountyPages}` : ''}
        </span>
        {totalCountyPages > 1 && (
          <>
            <button
              type="button"
              className="cv-btn cv-btn--ghost"
              disabled={countyPage <= 1}
              onClick={() => setCountyPage(p => Math.max(1, p - 1))}
              data-testid={`button-county-prev-${position}`}
            >
              Previous
            </button>
            <button
              type="button"
              className="cv-btn cv-btn--ghost"
              disabled={countyPage >= totalCountyPages}
              onClick={() => {
                setCountyPage(p => Math.min(totalCountyPages, p + 1));
                if (position === 'bottom') document.getElementById('county-directory')?.scrollIntoView({ block: 'start' });
              }}
              data-testid={`button-county-next-${position}`}
            >
              Next
            </button>
          </>
        )}
      </nav>
    );
  };

  const paginatedCities = useMemo(() => {
    const start = (cityPage - 1) * GEO_LIST_PAGE_SIZE;
    return availableCities.slice(start, start + GEO_LIST_PAGE_SIZE);
  }, [availableCities, cityPage]);

  const totalCityPages = Math.max(1, Math.ceil(availableCities.length / GEO_LIST_PAGE_SIZE));

  const [liveVerifiedVersion, setLiveVerifiedVersion] = useState<number>(0);

  const paginatedAgencies = useMemo(() => {
    const start = (agencyPage - 1) * AGENCY_PAGE_SIZE;
    const slice = matchingAgencies.slice(start, start + AGENCY_PAGE_SIZE);
    if (activeAccount && agencyPage === 1) {
      const withoutActive = slice.filter(a => a.id !== activeAccount.id);
      return [activeAccount, ...withoutActive];
    }
    return slice;
  }, [matchingAgencies, agencyPage, activeAccount, liveVerifiedVersion]);

  const totalAgencyPages = Math.max(1, Math.ceil(matchingAgencies.length / AGENCY_PAGE_SIZE));
  const [hoveredMapStateCode, setHoveredMapStateCode] = useState<string | null>(null);

  // Handle drill down to a state
  const handleSelectState = (stateCode: string) => {
    setSelectedStateCode(stateCode);
    setSelectedCountyName('all');
    setSelectedCityName('all');
    setMiddleTab(stateCode === 'all' ? 'states' : 'counties');
    setZipSearchQuery('');
    setCityFilterInput('');
    setCountyFilterInput('');
    setCountyPage(1);
    setCityPage(1);
    setAgencyPage(1);
    if (onSyncGlobalGeography) {
      onSyncGlobalGeography(stateCode, 'all', 'all', agencyCategoryFilter);
    }
  };

  // Handle select county (synchronizing stateCode when clicked from National view)
  const handleSelectCounty = (countyName: string, stateCode?: string) => {
    const nextState = stateCode && selectedStateCode === 'all' ? stateCode : selectedStateCode;
    const normCurrent = selectedCountyName.toLowerCase().replace(/\s+(county|parish|borough|census area|municipality)$/i, '').trim();
    const normNext = countyName.toLowerCase().replace(/\s+(county|parish|borough|census area|municipality)$/i, '').trim();
    if (selectedCountyName !== 'all' && normCurrent === normNext) {
      setSelectedCountyName('all');
      setSelectedCityName('all');
      setMiddleTab('counties');
      if (onSyncGlobalGeography) {
        onSyncGlobalGeography(nextState, 'all', 'all', agencyCategoryFilter);
      }
    } else {
      if (stateCode && selectedStateCode === 'all') {
        setSelectedStateCode(stateCode);
      }
      setSelectedCountyName(countyName);
      setSelectedCityName('all');
      setMiddleTab('cities');
      if (onSyncGlobalGeography) {
        onSyncGlobalGeography(nextState, countyName, 'all', agencyCategoryFilter);
      }
    }
    setCityPage(1);
    setAgencyPage(1);
  };

  // Handle select city (synchronizing stateCode and countyName)
  const handleSelectCity = (cityName: string, countyName: string, stateCode?: string) => {
    const nextState = stateCode && selectedStateCode === 'all' ? stateCode : selectedStateCode;
    if (selectedCityName === cityName) {
      setSelectedCityName('all');
      setMiddleTab('cities');
      if (onSyncGlobalGeography) {
        onSyncGlobalGeography(nextState, countyName, 'all', agencyCategoryFilter);
      }
    } else {
      if (stateCode && selectedStateCode === 'all') {
        setSelectedStateCode(stateCode);
      }
      setSelectedCityName(cityName);
      setSelectedCountyName(countyName);
      setMiddleTab('cities');
      if (onSyncGlobalGeography) {
        onSyncGlobalGeography(nextState, countyName, cityName, agencyCategoryFilter);
      }
    }
    setAgencyPage(1);
  };

  // Reset filters
  const handleResetFilters = () => {
    setSelectedStateCode('all');
    setSelectedCountyName('all');
    setSelectedCityName('all');
    setAgencyCategoryFilter('all');
    setMiddleTab('states');
    setZipSearchQuery('');
    setCityFilterInput('');
    setCountyFilterInput('');
    setRegionFilter('All');
    setCountyPage(1);
    setCityPage(1);
    setAgencyPage(1);
    if (onSyncGlobalGeography) {
      onSyncGlobalGeography('all', 'all', 'all', 'all');
    }
  };

  // Progressive disclosure state for state cards
  const [expandedStateCodes, setExpandedStateCodes] = useState<Record<string, boolean>>({});
  const toggleStateExpand = (code: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedStateCodes(prev => ({ ...prev, [code]: !prev[code] }));
  };

  // Determine which single focused view level to display:
  // - 'pulseiq_chart': Recharts breakdown if explicitly selected
  // - 'states': When viewing all 50 states (selectedStateCode === 'all')
  // - 'counties': When a state is selected and no specific county/city is selected yet
  // - 'providers': When a county or city is selected (or user clicked to view providers)
  const activeFocusLevel: 'pulseiq_chart' | 'states' | 'counties' | 'providers' =
    middleTab === 'pulseiq_chart'
      ? 'pulseiq_chart'
      : selectedStateCode === 'all'
        ? 'states'
        : selectedCountyName === 'all' && selectedCityName === 'all' && middleTab !== 'cities'
          ? 'counties'
          : 'providers';

  const geographyAreaMenu = (
    <details className="geography-area-menu">
      <summary>
        <Filter className="h-3.5 w-3.5" />
        <span>Change area</span>
      </summary>
      <div className="geography-drilldown-controls">
        <div className="geography-drilldown-select flex items-center gap-1.5 shrink-0">
          <label htmlFor="breadcrumb-state-dropdown" className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider hidden sm:inline">
            State:
          </label>
          <select
            id="breadcrumb-state-dropdown"
            value={selectedStateCode}
            onChange={(e) => handleSelectState(e.target.value)}
            className="h-8 bg-slate-50 dark:bg-slate-800 hover:bg-white dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded-lg px-2 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-[#1E3A8A] cursor-pointer"
            title="Switch state or jurisdiction"
          >
            <option value="all">All 50 States</option>
            {Object.values(ALL_50_STATES_SUMMARIES)
              .sort((a, b) => a.state.localeCompare(b.state))
              .map((st) => (
                <option key={st.code} value={st.code}>
                  {st.state} ({st.code})
                </option>
              ))}
          </select>
        </div>

        {selectedStateCode !== 'all' && availableCounties.length > 0 && (
          <div className="geography-drilldown-select flex items-center gap-1.5 shrink-0">
            <label htmlFor="breadcrumb-county-dropdown" className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider hidden sm:inline">
              County:
            </label>
            <select
              id="breadcrumb-county-dropdown"
              value={selectedCountyName}
              onChange={(e) => {
                const county = e.target.value;
                if (county === 'all') {
                  setSelectedCountyName('all');
                  setSelectedCityName('all');
                  setMiddleTab('counties');
                  setCountyPage(1);
                  setAgencyPage(1);
                  if (onSyncGlobalGeography) onSyncGlobalGeography(selectedStateCode, 'all', 'all', agencyCategoryFilter);
                } else {
                  handleSelectCounty(county, selectedStateCode);
                }
              }}
              className="h-8 bg-slate-50 dark:bg-slate-800 hover:bg-white dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded-lg px-2 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-[#1E3A8A] cursor-pointer max-w-[170px] truncate"
              title="Switch county"
            >
              <option value="all">All {availableCounties.length} Counties</option>
              {availableCounties.map((county) => (
                <option key={county.countyFips || county.countyName} value={county.countyName}>
                  {county.countyName}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="geography-drilldown-actions">
          {selectedStateCode !== 'all' && onShareTerritory && (
            <button
              type="button"
              onClick={onShareTerritory}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#1E3A8A] dark:text-blue-300 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/60 border border-blue-200 dark:border-blue-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              aria-label="Copy territory link"
            >
              <Share2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Copy territory link</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleResetFilters}
            className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title="Reset all geography and provider filters"
          >
            Reset filters
          </button>
        </div>
      </div>
    </details>
  );

  return (
    <div className="workspace-section-grid territory-explorer-screen">
      {/* Contextual Drill-Down Breadcrumb Bar (Only shown when drilled into a State, County, or City) */}
      {activeFocusLevel !== 'states' && activeFocusLevel !== 'counties' && (
        <div className="geography-drilldown-breadcrumb bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 shadow-2xs grid grid-cols-1 sm:grid-cols-[1fr_auto] items-center justify-between gap-2 min-w-0">
          <nav aria-label="Geographic navigation" className="flex min-w-0 items-center text-xs">
            {selectedCityName !== 'all' ? (
              <button
                type="button"
                onClick={() => {
                  setSelectedCityName('all');
                  setMiddleTab('cities');
                  setAgencyPage(1);
                  if (onSyncGlobalGeography) {
                    onSyncGlobalGeography(selectedStateCode, selectedCountyName, 'all', agencyCategoryFilter);
                  }
                }}
                className="flex min-h-[1.85rem] items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 font-semibold text-slate-700 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <span aria-hidden="true">&larr;</span>
                <span>{selectedCountyName}</span>
              </button>
            ) : selectedCountyName !== 'all' ? (
              <button
                type="button"
                onClick={() => {
                  setSelectedCountyName('all');
                  setSelectedCityName('all');
                  setMiddleTab('counties');
                  setCountyPage(1);
                  setAgencyPage(1);
                  if (onSyncGlobalGeography) {
                    onSyncGlobalGeography(selectedStateCode, 'all', 'all', agencyCategoryFilter);
                  }
                }}
                className="flex min-h-[1.85rem] items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 font-semibold text-slate-700 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <span aria-hidden="true">&larr;</span>
                <span>{activeStateSummary?.state || selectedStateCode} counties</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleResetFilters}
                className="flex min-h-[1.85rem] items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 font-semibold text-slate-700 transition-colors hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <span aria-hidden="true">&larr;</span>
                <span>All states</span>
              </button>
            )}
          </nav>

          {geographyAreaMenu}
        </div>
      )}

      {/* ---------------------------------------------------------------------
          LEVEL 1: CLEAN TERRITORY SELECTOR & INTERACTIVE U.S. MAP (NO 50-STATE CARD WALL)
         --------------------------------------------------------------------- */}
      {activeFocusLevel === 'states' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 lg:gap-6 items-start w-full min-w-0">
          
          {/* Left 7/8 Cols: Interactive U.S. Territory Map */}
          <div className="lg:col-span-7 xl:col-span-8 min-w-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 shadow-xs grid grid-cols-1 gap-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3.5 border-b border-slate-200 dark:border-slate-800">
              <div className="min-w-0">
                <h1 className="text-lg font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-2">
                  <Compass className="w-5 h-5 text-[#1E3A8A] dark:text-blue-400 shrink-0" />
                  <span>Interactive U.S. Territory Map</span>
                </h1>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                  Choose a state to inspect counties, equipment estimates, and candidate EMS &amp; Fire records. Verify agency status and operations with primary sources.
                </p>
              </div>

              {/* Region Filter Segmented Control (Zero horizontal scrollbar, all 5 regions always visible) */}
              <div className="flex flex-wrap items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 shrink-0">
                {(['All', 'Northeast', 'Midwest', 'South', 'West'] as const).map(reg => (
                  <button
                    key={reg}
                    type="button"
                    onClick={() => setRegionFilter(reg)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 transition-all cursor-pointer ${
                      regionFilter === reg
                        ? 'bg-[#0F172A] dark:bg-blue-600 text-white shadow-2xs'
                        : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {reg}
                  </button>
                ))}
              </div>
            </div>

            {/* Interactive SVG U.S. State Boundary Choropleth Map Canvas */}
            <div className="relative bg-slate-50 dark:bg-slate-950/60 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden p-3">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
                <div className="flex items-center gap-2">
                  <label htmlFor="us-state-map-layer" className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    Map data
                  </label>
                  <select
                    id="us-state-map-layer"
                    value={stateMapLayer}
                    onChange={(event) => setStateMapLayer(event.target.value as 'agency-records' | 'fema-loss')}
                    className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="agency-records">Agency records in this app</option>
                    <option value="fema-loss">FEMA county expected annual loss</option>
                  </select>
                </div>
                {stateMapLayer === 'fema-loss' && (
                  <span className="text-[10px] text-slate-500 dark:text-slate-400" role="status">
                    {nriNationalQuery.isLoading
                      ? 'Loading FEMA county records…'
                      : nriNationalQuery.isError
                        ? 'FEMA risk layer unavailable'
                        : `${nriNationalQuery.data?.records.length.toLocaleString() ?? 0} county-equivalent records · native scope: county FIPS · reporting period not stated · FEMA NRI data vintage: ${nriNationalVintageLabel}`}
                  </span>
                )}
              </div>
              <svg
                viewBox="0 0 920 500"
                className="w-full h-[380px] sm:h-[440px] select-none"
                role="group"
                preserveAspectRatio="xMidYMid meet"
                aria-label="United States state boundary map. Select a state to inspect its counties."
              >
                <defs>
                  <pattern id="us-map-missing-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                    <rect width="6" height="6" fill="#E2E8F0" />
                    <line x1="0" y1="0" x2="0" y2="6" stroke="#94A3B8" strokeWidth="1.5" />
                  </pattern>
                </defs>

                {/* Alaska & Hawaii Cartographic Inset Frames */}
                <g>
                  <rect x="14" y="356" width="174" height="134" rx="10" fill="#FFFFFF" fillOpacity="0.9" stroke="#CBD5E1" strokeWidth="1.25" strokeDasharray="4 4" />
                  <text x="24" y="373" fill="#475569" fontSize="10" fontWeight="800" fontFamily="monospace">ALASKA (AK)</text>

                  <rect x="196" y="396" width="124" height="94" rx="10" fill="#FFFFFF" fillOpacity="0.9" stroke="#CBD5E1" strokeWidth="1.25" strokeDasharray="4 4" />
                  <text x="206" y="413" fill="#475569" fontSize="10" fontWeight="800" fontFamily="monospace">HAWAII (HI)</text>
                </g>

                {/* Layer 1: Authoritative U.S. State Boundary Polygons */}
                <g>
                  {Object.values(ALL_50_STATES_SUMMARIES).map((st) => {
                    const boundary = US_STATES_SVG_PATHS[st.code];
                    if (!boundary || !boundary.d) return null;

                    const isInRegion = regionFilter === 'All' || st.region === regionFilter;
                    const isHovered = hoveredMapStateCode === st.code;
                    const countyCount = territoryEngine.getCountiesForState(st.code).length;
                    const countyScopeLabel = st.code === 'CT' ? 'legacy county polygons' : 'counties';

                    const nriSummary = stateNriSummaryByCode.get(st.code);
                    const hasMapValue = stateMapLayer === 'fema-loss'
                      ? nriSummary?.coverageComplete && nriSummary.totalExpectedAnnualLoss != null
                      : true;
                    const fillColor = !isInRegion
                      ? '#F1F5F9'
                      : hasMapValue
                        ? stateMapColorByCode.get(st.code) ?? '#E2E8F0'
                        : 'url(#us-map-missing-hatch)';

                    const strokeColor = isHovered || selectedStateCode === st.code
                      ? '#0F172A'
                      : !isInRegion
                        ? '#CBD5E1'
                        : '#64748B';

                    return (
                      <path
                        key={`poly-${st.code}`}
                        d={boundary.d}
                        fill={fillColor}
                        stroke={strokeColor}
                        strokeWidth={isHovered || selectedStateCode === st.code ? 2.5 : 1}
                        opacity={isInRegion ? 1 : 0.45}
                        onClick={() => {
                          handleSelectState(st.code);
                          setMiddleTab('counties');
                        }}
                        onMouseEnter={() => setHoveredMapStateCode(st.code)}
                        onMouseLeave={() => setHoveredMapStateCode(null)}
                        tabIndex={0}
                        role="button"
                        aria-label={`Inspect ${st.state} counties`}
                        aria-pressed={selectedStateCode === st.code}
                        onFocus={() => setHoveredMapStateCode(st.code)}
                        onBlur={() => setHoveredMapStateCode(null)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            handleSelectState(st.code);
                            setMiddleTab('counties');
                          }
                        }}
                        vectorEffect="non-scaling-stroke"
                        strokeLinejoin="round"
                        className="us-state-path cursor-pointer transition-colors duration-150"
                      >
                        <title>{`${st.state} (${st.code}) · ${stateMapLayer === 'fema-loss'
                          ? nriSummary?.coverageComplete && nriSummary.totalExpectedAnnualLoss != null
                            ? `State context only: sum of county-equivalent NRI expected annual loss ($${nriSummary.totalExpectedAnnualLoss.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}); native source scope is county FIPS; reporting period not stated; ${nriSummary.availableRecords}/${nriSummary.sourceRecordCount} source records; FEMA NRI data vintage ${nriSummary.sourceVersion}`
                            : `State total not shown; ${nriSummary?.availableRecords ?? 0}/${nriSummary?.sourceRecordCount ?? 0} NRI county-equivalent records with values${nriSummary?.duplicateFips ? ' · duplicate FIPS' : ''}${nriSummary?.invalidFips ? ' · malformed FIPS' : ''}${nriSummary?.mixedSourceVersions ? ' · mixed FEMA NRI vintages' : ''}${nriSummary?.unstatedSourceVersion ? ' · FEMA NRI vintage not stated for every county' : ''}`
                          : `${stateAgencyCounts.get(st.code) ?? 0} app agency records; not a census of operating departments`} · Click to inspect ${countyCount} ${countyScopeLabel}`}</title>
                      </path>
                    );
                  })}
                </g>

                {/* Layer 2: Interior State Labels (42 States + AK + HI, Zero Overlap) */}
                <g>
                  {Object.values(ALL_50_STATES_SUMMARIES).map((st) => {
                    const isCalloutState = EAST_COAST_CALLOUT_STATES.some((c) => c.code === st.code);
                    if (isCalloutState) return null;

                    const boundary = US_STATES_SVG_PATHS[st.code];
                    if (!boundary) return null;

                    const isInRegion = regionFilter === 'All' || st.region === regionFilter;
                    const isHovered = hoveredMapStateCode === st.code;

                    return (
                      <g
                        key={`lbl-${st.code}`}
                        transform={`translate(${boundary.labelX}, ${boundary.labelY})`}
                        onClick={() => {
                          handleSelectState(st.code);
                          setMiddleTab('counties');
                        }}
                        onMouseEnter={() => setHoveredMapStateCode(st.code)}
                        onMouseLeave={() => setHoveredMapStateCode(null)}
                        className="cursor-pointer"
                        opacity={isInRegion ? 1 : 0.4}
                      >
                        <rect
                          x="-13"
                          y="-9"
                          width="26"
                          height="18"
                          rx="5"
                          fill={isHovered ? '#111827' : '#FFFFFF'}
                          fillOpacity={isHovered ? 1 : 0.92}
                          stroke={isHovered ? '#FFFFFF' : '#94A3B8'}
                          strokeWidth={isHovered ? 1.5 : 1}
                        />
                        <text
                          textAnchor="middle"
                          dy="3.5"
                          fill={isHovered ? '#FFFFFF' : '#0F172A'}
                          fontSize="9.5"
                          fontWeight="800"
                          fontFamily="monospace"
                        >
                          {st.code}
                        </text>
                      </g>
                    );
                  })}
                </g>

                {/* Layer 3: Compact East Coast State Callout Column (VT, NH, MA, RI, CT, NJ, DE, MD, DC) */}
                <g>
                  {EAST_COAST_CALLOUT_STATES.map((item) => {
                    const st = ALL_50_STATES_SUMMARIES[item.code];
                    const boundary = US_STATES_SVG_PATHS[item.code];
                    if (!st || !boundary) return null;

                    const isInRegion = regionFilter === 'All' || st.region === regionFilter;
                    const isHovered = hoveredMapStateCode === st.code;
                    const countyCount = territoryEngine.getCountiesForState(st.code).length;

                    return (
                      <g
                        key={`callout-${st.code}`}
                        onClick={() => {
                          handleSelectState(st.code);
                          setMiddleTab('counties');
                        }}
                        onMouseEnter={() => setHoveredMapStateCode(st.code)}
                        onMouseLeave={() => setHoveredMapStateCode(null)}
                        className="cursor-pointer"
                        opacity={isInRegion ? 1 : 0.4}
                      >
                        <line
                          x1={boundary.labelX}
                          y1={boundary.labelY}
                          x2={item.calloutX}
                          y2={item.calloutY}
                          stroke={isHovered ? '#1E3A8A' : '#94A3B8'}
                          strokeWidth={isHovered ? 1.75 : 1}
                          strokeDasharray={isHovered ? undefined : '2 2'}
                        />
                        <circle
                          cx={boundary.labelX}
                          cy={boundary.labelY}
                          r={isHovered ? 4 : 2.5}
                          fill={isHovered ? '#1E3A8A' : '#475569'}
                        />
                        <rect
                          x={item.calloutX}
                          y={item.calloutY - 10}
                          width="64"
                          height="20"
                          rx="5"
                          fill={isHovered ? '#1E3A8A' : '#FFFFFF'}
                          stroke={isHovered ? '#0F172A' : '#CBD5E1'}
                          strokeWidth={isHovered ? 1.5 : 1}
                        />
                        <text
                          x={item.calloutX + 32}
                          y={item.calloutY + 3.5}
                          textAnchor="middle"
                          fill={isHovered ? '#FFFFFF' : '#0F172A'}
                          fontSize="9.5"
                          fontWeight="800"
                          fontFamily="monospace"
                        >
                          {st.code} · {countyCount}c
                        </text>
                        <title>{`${st.state} (${st.code}) — Click to inspect ${countyCount} ${st.code === 'CT' ? 'legacy county polygons' : 'counties'}`}</title>
                      </g>
                    );
                  })}
                </g>
              </svg>

              {/* Map Legend & Hovered State Live Callout Strip */}
              <div className="mt-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-900 dark:text-slate-100 tabular-nums">
                {hoveredMapStateCode && ALL_50_STATES_SUMMARIES[hoveredMapStateCode] ? (
                  (() => {
                    const hSt = ALL_50_STATES_SUMMARIES[hoveredMapStateCode];
                    const cCount = territoryEngine.getCountiesForState(hSt.code).length;
                    const denialProfileSummary = getStateZipDenialProfileSummary(hSt.code);
                    const nriSummary = stateNriSummaryByCode.get(hSt.code);
                    return (
                      <div className="flex flex-wrap items-center gap-2.5 tabular-nums">
                        <span className="px-2 py-0.5 rounded bg-[#1E3A8A] text-white font-semibold">
                          {hSt.code}
                        </span>
                        <strong className="text-slate-900 dark:text-white text-sm font-semibold tracking-[-0.01em]">{hSt.state}</strong>
                        <span className="text-slate-300 dark:text-slate-700">·</span>
                        <span className="font-semibold text-[#1E3A8A] dark:text-blue-400 tabular-nums">
                          {hSt.code === 'CT' ? `${cCount} legacy county polygons` : `${cCount} counties`}
                        </span>
                        <span className="text-slate-300 dark:text-slate-700">·</span>
                        {stateMapLayer === 'fema-loss' ? (
                          <span className="text-slate-700 dark:text-slate-300">
                            State context: sum of county-equivalent NRI expected annual loss; native source scope is county FIPS; reporting period not stated:{' '}
                            <strong className="font-semibold">
                              {nriSummary?.coverageComplete && nriSummary.totalExpectedAnnualLoss != null
                                ? `$${nriSummary.totalExpectedAnnualLoss.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                : 'Not shown'}
                            </strong>
                            <span className="ml-1 text-[10px] text-slate-500">
                              ({nriSummary?.availableRecords ?? 0}/{nriSummary?.sourceRecordCount ?? 0} source records have values; invalid/duplicate FIPS, missing values, mixed/unstated FEMA NRI vintages block the sum; data vintage {nriSummary?.sourceVersion ?? 'not consistent'})
                            </span>
                          </span>
                        ) : (
                          <span className="text-slate-700 dark:text-slate-300">
                            App agency records: <strong className="font-semibold">{stateAgencyCounts.get(hSt.code) ?? 0}</strong>
                            <span className="ml-1 text-[10px] text-slate-500">(directory entries; not a count of all operating agencies)</span>
                          </span>
                        )}
                        {stateMapLayer === 'fema-loss' && nriSummary?.coverageComplete && nriNationalQuery.data?.sourceUrl && (
                          <a
                            href={nriNationalQuery.data.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={event => event.stopPropagation()}
                            className="text-[10px] text-blue-700 dark:text-blue-300 underline underline-offset-2"
                          >
                            FEMA NRI source · data vintage {nriSummary.sourceVersion}
                          </a>
                        )}
                        <span className="text-slate-300 dark:text-slate-700">·</span>
                        {denialProfileSummary && (
                          <>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400">
                              {denialProfileSummary.reportingPeriod} · {denialProfileSummary.claimScope}
                            </span>
                            {denialProfileSummary.sources.map((source) => (
                              <a
                                key={source.zipCode}
                                href={source.sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                                onClick={event => event.stopPropagation()}
                                className="text-[10px] text-blue-700 dark:text-blue-300 underline underline-offset-2"
                              >
                                ZIP {source.zipCode} source
                              </a>
                            ))}
                          </>
                        )}
                        <span className="text-slate-300 dark:text-slate-700">·</span>
                        <span className="text-slate-700 dark:text-slate-300">FEMA Grants: <strong className="text-emerald-700 dark:text-emerald-400 font-semibold tabular-nums">${(hSt.totalAfgAwardsYtd / 1000000).toFixed(1)}M</strong></span>
                      </div>
                    );
                  })()
                ) : (
                  <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed tabular-nums">
                    <span className="flex items-center gap-1.5 font-medium text-slate-900 dark:text-white">
                      <MapPin className="w-3.5 h-3.5 text-[#1E3A8A] dark:text-blue-400 shrink-0" />
                      <span>Click any State boundary or East Coast callout badge to inspect its Counties</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="flex items-center gap-1">
                        {STATE_MAP_PALETTE.map((color, index) => (
                          <span
                            key={color}
                            className="inline-flex h-4 min-w-5 items-center justify-center rounded-sm border border-emerald-700/40 px-0.5 text-[8px] font-semibold text-slate-700"
                            style={{ backgroundColor: color }}
                            title={`Quantile ${index + 1}`}
                          >
                            Q{index + 1}
                          </span>
                        ))}
                      </span>
                      <span>
                        {stateMapLayer === 'fema-loss'
                          ? 'Lower to higher state sum of county expected annual loss'
                          : 'Lower to higher app agency-record count'}
                      </span>
                      {stateMapLayer === 'fema-loss' && (
                        <span className="flex items-center gap-1.5">
                          <span className="h-3 w-3 rounded-xs border border-slate-500" style={{ background: 'repeating-linear-gradient(45deg, #E2E8F0 0 2px, #94A3B8 2px 3.5px)' }} />
                          <span>Missing or incomplete county coverage</span>
                        </span>
                      )}
                    </span>
                  </div>
                )}
                <span className="tabular-nums text-[11px] text-slate-600 dark:text-slate-400 font-medium">
                  50 States &amp; DC · 3,144 Counties
                </span>
              </div>
            </div>
          </div>

          {/* Right 5/4 Cols: Clean Territory & Jurisdiction Picker */}
          <div className="lg:col-span-5 xl:col-span-4 min-w-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 shadow-xs grid grid-cols-1 gap-4">
            <div className="border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="text-xs font-bold uppercase tracking-wider text-[#1E3A8A] dark:text-blue-400">
                Step 1 · Select Territory Scope
              </div>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white mt-0.5">
                Quick State, County &amp; ZIP Selector
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                Choose a State or search by County, City, or 5-digit ZIP code to view EMS &amp; Fire providers.
              </p>
            </div>

            {/* Direct State Dropdown Selector */}
            <div className="space-y-1.5">
              <label htmlFor="home-state-picker" className="block text-xs font-bold text-slate-900 dark:text-white">
                1. Choose a State or Jurisdiction
              </label>
              <select
                id="home-state-picker"
                value={selectedStateCode}
                onChange={(e) => {
                  const code = e.target.value;
                  handleSelectState(code);
                }}
                className="w-full h-10 bg-slate-50 dark:bg-slate-800 hover:bg-white dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded-lg px-3 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-[#1E3A8A] cursor-pointer"
              >
                <option value="all">Select a State to inspect counties...</option>
                {Object.values(ALL_50_STATES_SUMMARIES)
                  .sort((a, b) => a.state.localeCompare(b.state))
                  .map((st) => (
                    <option key={st.code} value={st.code}>
                      {st.state} ({st.code}) — {territoryEngine.getCountiesForState(st.code).length} Counties
                    </option>
                  ))}
              </select>
            </div>

            {/* Direct Cascading County Dropdown Selector */}
            {selectedStateCode !== 'all' && availableCounties.length > 0 && (
              <div className="space-y-1.5 animate-fadeIn">
                <label htmlFor="home-county-picker" className="block text-xs font-bold text-slate-900 dark:text-white">
                  Choose County in {activeStateSummary?.state || selectedStateCode}
                </label>
                <select
                  id="home-county-picker"
                  value={selectedCountyName}
                  onChange={(e) => {
                    const c = e.target.value;
                    if (c === 'all') {
                      setSelectedCountyName('all');
                      setSelectedCityName('all');
                      setMiddleTab('counties');
                    } else {
                      handleSelectCounty(c, selectedStateCode);
                    }
                  }}
                  className="w-full h-10 bg-slate-50 dark:bg-slate-800 hover:bg-white dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded-lg px-3 text-xs font-bold text-slate-900 dark:text-white focus:outline-none focus:border-[#1E3A8A] cursor-pointer"
                >
                  <option value="all">All {availableCounties.length} Counties</option>
                  {availableCounties.map((c) => (
                    <option key={c.countyFips || c.countyName} value={c.countyName}>
                      {c.countyName} (Seat: {c.countySeat})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Direct City / County / ZIP Instant Jump */}
            <div className="space-y-1.5">
              <label htmlFor="home-zip-county-search" className="block text-xs font-bold text-slate-900 dark:text-white">
                2. Or Jump Directly by County, City, or ZIP Code
              </label>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  id="home-zip-county-search"
                  type="text"
                  value={zipSearchQuery}
                  onChange={(e) => setZipSearchQuery(e.target.value)}
                  placeholder="Enter County, City, or 5-digit ZIP (e.g., 78701, Cuyahoga)..."
                  className="w-full h-10 bg-slate-50 dark:bg-slate-800 hover:bg-white dark:hover:bg-slate-900 focus:bg-white dark:focus:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg pl-8 pr-7 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-[#1E3A8A]"
                />
                {zipSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setZipSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    ×
                  </button>
                )}
              </div>

              {/* Matching Location Instant Results */}
              {zipSearchQuery.trim() && (
                <div className="mt-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-800 divide-y divide-slate-200 dark:divide-slate-700 max-h-52 overflow-y-auto">
                  {matchingLocations.length > 0 ? (
                    matchingLocations.map((loc) => (
                      <button
                        key={`${loc.zipCode}-${loc.city}`}
                        type="button"
                        onClick={() => {
                          handleSelectCity(loc.city, loc.county, loc.stateCode);
                          setZipSearchQuery('');
                        }}
                        className="w-full text-left px-3 py-2.5 hover:bg-white dark:hover:bg-slate-700 transition-colors flex items-center justify-between gap-2 text-xs cursor-pointer"
                      >
                        <div>
                          <div className="font-bold text-slate-900 dark:text-white">
                            {loc.city}, {loc.stateCode} <span className="font-mono text-[#1E3A8A] dark:text-blue-400">({loc.zipCode})</span>
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">{loc.county}</div>
                        </div>
                        <span className="text-xs font-bold text-[#1E3A8A] dark:text-blue-400 shrink-0">Open &rarr;</span>
                      </button>
                    ))
                  ) : availableCounties.length > 0 ? (
                    availableCounties.slice(0, 6).map((c) => (
                      <button
                        key={`${c.stateCode}-${c.countyFips}`}
                        type="button"
                        onClick={() => {
                          handleSelectCounty(c.countyName, c.stateCode);
                          setZipSearchQuery('');
                        }}
                        className="w-full text-left px-3 py-2.5 hover:bg-white dark:hover:bg-slate-700 transition-colors flex items-center justify-between gap-2 text-xs cursor-pointer"
                      >
                        <div>
                          <div className="font-bold text-slate-900 dark:text-white">
                            {c.countyName}, {c.stateCode}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">County Seat: {c.countySeat}</div>
                        </div>
                         <span className="text-xs font-bold text-[var(--pi-action-ink)] shrink-0">Inspect &rarr;</span>
                      </button>
                    ))
                  ) : (
                    <div className="p-3 text-xs text-slate-500 text-center">
                      No matching County, City, or ZIP found.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 3. Quick Region State Pills (Filtered by active Region tab) */}
            <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-900 dark:text-white">
                  3. Quick Jump ({regionFilter === 'All' ? 'All Regions' : `${regionFilter} Region`})
                </span>
                <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                  {statesList.length} Jurisdictions
                </span>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5 max-h-40 overflow-y-auto pr-1">
                {statesList.map((st) => (
                  <button
                    key={`quick-${st.code}`}
                    type="button"
                    onClick={() => {
                      handleSelectState(st.code);
                      setMiddleTab('counties');
                    }}
                    onMouseEnter={() => setHoveredMapStateCode(st.code)}
                    onMouseLeave={() => setHoveredMapStateCode(null)}
                    className={`px-2 py-1.5 rounded-lg border text-left transition-all cursor-pointer flex items-center justify-between ${
                       hoveredMapStateCode === st.code
                         ? 'bg-[var(--pi-action)] text-white border-[var(--pi-action)]'
                        : 'bg-slate-50 dark:bg-slate-800 hover:bg-white dark:hover:bg-slate-700 text-slate-900 dark:text-white border-slate-200 dark:border-slate-700'
                    }`}
                    title={`${st.state} (${st.code})`}
                  >
                    <span className="font-mono font-bold text-xs">{st.code}</span>
                    <span className={`text-[10px] font-mono ${hoveredMapStateCode === st.code ? 'text-blue-200' : 'text-slate-500 dark:text-slate-400'}`}>
                      {territoryEngine.getCountiesForState(st.code).length}c
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Priority Accounts & Regional Summary */}
            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <div className="grid grid-cols-2 gap-px bg-slate-200 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden text-xs">
                <div className="p-2.5 bg-slate-50/80 dark:bg-slate-900">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Mapped Jurisdictions</span>
                  <span className="text-sm font-bold text-slate-900 dark:text-white mt-0.5 block tabular-nums">3,144 Counties</span>
                </div>
                <div className="p-2.5 bg-slate-50/80 dark:bg-slate-900">
                  <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Data Provenance</span>
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 mt-0.5 block">Registry coverage varies; operational facts need separate sources</span>
                </div>
              </div>

              {onNavigateToQueueWithFilter && (
                <button
                  type="button"
                  onClick={() => onNavigateToQueueWithFilter(
                    selectedStateCode,
                    selectedCountyName,
                    selectedCityName,
                    debouncedZipQuery || undefined,
                  )}
                  className="w-full h-10 px-4 rounded-lg font-bold text-xs bg-[var(--pi-action)] text-white hover:bg-[var(--pi-action-hover)] transition-all flex items-center justify-center gap-2 cursor-pointer shadow-2xs"
                >
                  <ListOrdered className="w-4 h-4 text-white" />
                  <span>Browse Priority Lead Accounts Queue &rarr;</span>
                </button>
              )}
            </div>
          </div>

        </div>
      )}

      {/* ---------------------------------------------------------------------
          LEVEL 2: COUNTIES IN SELECTED STATE (SINGLE FOCUSED VIEW)
         --------------------------------------------------------------------- */}
      {activeFocusLevel === 'counties' && (
        <div className="county-drilldown-shell county-geo grid min-w-0 grid-cols-1">
          <div className="county-selection-header">
            <div className="county-selection-copy min-w-0">
              <div className="county-selection-context-row">
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="county-selection-back"
                  title="Return to the national state map"
                >
                  <ArrowLeft aria-hidden="true" />
                  <span>All states</span>
                </button>
                {geographyAreaMenu}
              </div>
              <h2 className="county-selection-title">
                <MapPinned aria-hidden="true" />
                {activeStateSummary?.state || selectedStateCode}
              </h2>
              <p className="county-selection-meta">
                <strong>{availableCounties.length.toLocaleString()}</strong> counties · select one on the map or in the directory below
              </p>
            </div>

            <div className="county-selection-actions">
              <div className="county-selection-search">
                <Search aria-hidden="true" />
                <input
                  type="text"
                  value={countyFilterInput}
                  onChange={(e) => {
                    setCountyFilterInput(e.target.value);
                    setCountyPage(1);
                  }}
                  placeholder="Search county or seat"
                  aria-label="Search counties or county seats"
                  data-testid="input-county-search"
                />
                {countyFilterInput && (
                  <button
                    type="button"
                    onClick={() => {
                      setCountyFilterInput('');
                      setCountyPage(1);
                    }}
                    className="county-selection-clear"
                  >
                    Clear
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setMiddleTab('cities')}
                className="county-selection-providers county-providers-action"
                aria-label={`View all ${matchingAgencies.length} providers in ${activeStateSummary?.state || selectedStateCode}`}
              >
                <Building2 aria-hidden="true" />
                All providers
                <span className="county-selection-count">{matchingAgencies.length.toLocaleString()}</span>
                <ChevronRight aria-hidden="true" />
              </button>
            </div>
          </div>

          {selectedStateCode !== 'all' && (
            <RealWorldCountyBoundaryMap
              stateCode={selectedStateCode}
              selectedCountyName="all"
              selectedCityName="all"
              agencies={agencies}
              showExplorerHeader={false}
              onSelectCounty={(countyName, stCode) => {
                setSelectedStateCode(stCode);
                setSelectedCountyName(countyName);
                setSelectedCityName('all');
                setMiddleTab('cities');
                setAgencyPage(1);
                if (onSyncGlobalGeography) {
                  onSyncGlobalGeography(stCode, countyName, 'all', agencyCategoryFilter);
                }
              }}
              onSelectCity={(cityName, countyName, stCode) => {
                setSelectedStateCode(stCode);
                setSelectedCountyName(countyName);
                setSelectedCityName(cityName);
                setMiddleTab('cities');
                setAgencyPage(1);
                if (onSyncGlobalGeography) {
                  onSyncGlobalGeography(stCode, countyName, cityName, agencyCategoryFilter);
                }
              }}
            />
          )}

          <div className="cv-dir-head county-directory-heading" id="county-directory">
            <div>
              <h3 className="cv-title">County directory</h3>
              <p className="cv-note">
                Working county references for your confirmation. FEMA NRI is natural-hazard context, not agency performance; FIPS is display geography, not proof of source scope.
              </p>
            </div>
            {pagerControls('top')}
          </div>

          {paginatedCounties.length === 0 ? (
            <div className="py-10 text-center cv-note">
              No counties match &ldquo;{countyFilterInput}&rdquo;.{' '}
              <button type="button" className="cv-link" onClick={() => { setCountyFilterInput(''); setCountyPage(1); }}>Clear search</button>
            </div>
          ) : (
            <div className="county-signal-list">
              {paginatedCounties.map(c => {
                const countyNri = selectedStateNriByCountyFips.get(c.countyFips);
                return (
                  <CountyDirectoryCard
                    key={`${c.stateCode}-${c.countyFips}`}
                    county={c}
                    nri={countyNri}
                    nriSourceUrl={safeAgencyWebsiteUrl(countyNri?.sourceUrl)}
                    nriLoading={selectedStateNriQuery.isLoading}
                    nriError={selectedStateNriQuery.isError}
                    onInspectCounty={() => {
                      setSelectedCountyName(c.countyName);
                      setSelectedCityName('all');
                      setMiddleTab('cities');
                      setAgencyPage(1);
                      if (onSyncGlobalGeography) {
                        onSyncGlobalGeography(c.stateCode, c.countyName, 'all', agencyCategoryFilter);
                      }
                    }}
                    onSelectPlace={(cityName) => {
                      setSelectedStateCode(c.stateCode);
                      setSelectedCountyName(c.countyName);
                      setSelectedCityName(cityName);
                      setMiddleTab('cities');
                      setAgencyPage(1);
                      if (onSyncGlobalGeography) {
                        onSyncGlobalGeography(c.stateCode, c.countyName, cityName, agencyCategoryFilter);
                      }
                    }}
                  />
                );
              })}
            </div>
          )}

          {totalCountyPages > 1 && (
            <div className="flex justify-end pt-2 border-t border-[var(--pi-border)]">
              {pagerControls('bottom')}
            </div>
          )}
        </div>
      )}

      {/* ---------------------------------------------------------------------
          LEVEL 3: PROVIDERS IN SELECTED COUNTY / CITY (SINGLE FOCUSED VIEW)
         --------------------------------------------------------------------- */}
      {activeFocusLevel === 'providers' && (
        <div className="county-geo county-providers-shell grid grid-cols-1 min-w-0">
          
          {/* Streamlined Single-Row Filter Bar + Hybrid View Mode Toggle */}
          <div className="county-providers-head min-w-0">
            <div className="cv-geo-head" data-testid="provider-mobile-summary">
              <div className="min-w-0">
              <div className="cv-geo-kicker">
                {selectedCityName !== 'all'
                  ? `${selectedCityName} · ${selectedCountyName !== 'all' ? selectedCountyName : ''} ${selectedStateCode}`
                  : selectedCountyName !== 'all'
                    ? `${selectedCountyName}, ${activeStateSummary?.state || selectedStateCode}`
                    : `${activeStateSummary?.state || selectedStateCode} Statewide Providers`}
              </div>
              <h2 className="cv-geo-title">
                <Building2 aria-hidden="true" />EMS &amp; Fire Providers ({matchingAgencies.length.toLocaleString()})
              </h2>
              </div>
            </div>

            {/* Right Single-Row Filter Controls */}
            <div className="county-providers-tools flex flex-wrap items-center gap-2">
              {/* Instant Search Input */}
              <div className="relative w-full sm:w-56">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={zipSearchQuery}
                  onChange={(e) => {
                    setZipSearchQuery(e.target.value);
                    setAgencyPage(1);
                  }}
                  placeholder="Search provider, city, ZIP..."
                  className="w-full h-8 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg pl-8 pr-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-[#1E3A8A]"
                />
              </div>

              <MobileFilterDisclosure
                testId="provider-secondary-filters"
                extraContext={[
                  ...(providerSortBy !== 'pulseIq' ? [`Sort: ${providerSortBy === 'fleetAge' ? 'fleet age' : 'upgrade value'}`] : []),
                  ...(providerViewMode !== 'cards' ? ['Table view'] : []),
                ]}
                filters={[
                  { label: selectedCityName, active: selectedCityName !== 'all' },
                  { label: agencyCategoryFilter === 'ems' ? 'EMS' : 'Fire', active: agencyCategoryFilter !== 'all' },
                ]}
              >
              {/* Compact City Selector Dropdown */}
              {availableCities.length > 0 && (
                <select
                  value={selectedCityName}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'all') {
                      setSelectedCityName('all');
                      setAgencyPage(1);
                      if (onSyncGlobalGeography) {
                        onSyncGlobalGeography(selectedStateCode, selectedCountyName, 'all', agencyCategoryFilter);
                      }
                    } else {
                      const foundCity = availableCities.find(c => c.city === val);
                      if (foundCity) {
                        handleSelectCity(foundCity.city, foundCity.county, foundCity.stateCode);
                      }
                    }
                  }}
                  aria-label="Filter by City"
                  className="h-8 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 focus:outline-none focus:border-[#1E3A8A] max-w-[180px] truncate cursor-pointer"
                >
                  <option value="all">All Cities ({availableCities.length})</option>
                  {availableCities.map((c) => (
                    <option key={`${c.stateCode}-${c.county}-${c.city}`} value={c.city}>
                      {c.city}
                    </option>
                  ))}
                </select>
              )}

              {/* All / EMS / Fire Category Switcher */}
              <div className="flex items-center gap-0.5 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => { setAgencyCategoryFilter('all'); setAgencyPage(1); }}
                  className={`h-7 px-2.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                    agencyCategoryFilter === 'all'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  All ({jurisdictionBaseAgencies.length.toLocaleString()})
                </button>
                <button
                  type="button"
                  onClick={() => { setAgencyCategoryFilter('ems'); setAgencyPage(1); }}
                  className={`h-7 px-2.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                    agencyCategoryFilter === 'ems'
                      ? 'bg-white dark:bg-slate-900 text-[#1E3A8A] dark:text-blue-400 shadow-2xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  EMS ({emsJurisdictionCount.toLocaleString()})
                </button>
                <button
                  type="button"
                  onClick={() => { setAgencyCategoryFilter('fire'); setAgencyPage(1); }}
                  className={`h-7 px-2.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                    agencyCategoryFilter === 'fire'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Fire ({fireJurisdictionCount.toLocaleString()})
                </button>
              </div>

              {/* Collapsible City Grid Toggle */}
              {availableCities.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowCityPillsDrawer(prev => !prev)}
                  className={`h-8 px-2.5 rounded-lg border text-xs font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                    showCityPillsDrawer
                      ? 'bg-blue-50 dark:bg-blue-950/60 text-[#1E3A8A] dark:text-blue-400 border-blue-200 dark:border-blue-800 font-semibold'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Filter className="w-3.5 h-3.5" />
                  <span>City Directory</span>
                </button>
              )}


              {/* Sort control: always available, including phone card lists where table headers are hidden */}
              <label className="provider-sort-control inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                <span>Sort</span>
                <select
                  value={providerSortBy}
                  onChange={(e) => { setProviderSortBy(e.target.value as 'pulseIq' | 'fleetAge' | 'value'); setAgencyPage(1); }}
                  data-testid="select-provider-sort"
                  aria-label="Sort agencies"
                  className="h-8 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                >
                  <option value="pulseIq">PulseIQ estimate</option>
                  <option value="fleetAge">Monitor fleet age</option>
                  <option value="value">Upgrade value estimate</option>
                </select>
              </label>

              {/* Hybrid Cards | Table View Toggle (table falls back to labeled cards below md) */}
              <div role="group" aria-label="Agency layout" className="provider-view-toggle flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => setProviderViewMode('cards')}
                  aria-pressed={providerViewMode === 'cards'}
                  data-testid="button-provider-view-cards"
                  className={`h-7 px-2.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                    providerViewMode === 'cards'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Clean Executive Cards View"
                >
                  <LayoutGrid className="w-3.5 h-3.5" />
                  <span>Cards</span>
                </button>

                <button
                  type="button"
                  onClick={() => setProviderViewMode('table')}
                  aria-pressed={providerViewMode === 'table'}
                  data-testid="button-provider-view-table"
                  className={`h-7 px-2.5 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                    providerViewMode === 'table'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                  title="Compact Comparison Table View"
                >
                  <TableIcon className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">Table</span>
                  <span className="md:hidden">List</span>
                </button>
              </div>
              </MobileFilterDisclosure>
            </div>
          </div>

          {/* Real-World County Boundary Polygon & Plotted City Jurisdiction Inspector */}
          {selectedStateCode !== 'all' && selectedCountyName !== 'all' && (
            <RealWorldCountyBoundaryMap
              stateCode={selectedStateCode}
              selectedCountyName={selectedCountyName}
              selectedCityName={selectedCityName}
              agencies={agencies}
              onSelectCounty={(countyName, stCode) => handleSelectCounty(countyName, stCode)}
              onSelectCity={(cityName, countyName, stCode) => handleSelectCity(cityName, countyName, stCode)}
              showExplorerHeader={false}
              onShowAllPlaces={() => {
                setSelectedCityName('all');
                setAgencyPage(1);
                if (onSyncGlobalGeography) {
                  onSyncGlobalGeography(selectedStateCode, selectedCountyName, 'all', agencyCategoryFilter);
                }
              }}
            />
          )}

          {/* Collapsible Connected City Filter Drawer */}
          {showCityPillsDrawer && availableCities.length > 0 && (
            <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 space-y-2.5 animate-in fade-in duration-150">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-[#1E3A8A] dark:text-blue-400" />
                  <span>
                    {selectedCountyName !== 'all'
                      ? `Incorporated US Census / USPS Cities in ${selectedCountyName} (${availableCities.length})`
                      : `Incorporated US Census / USPS Cities in ${activeStateSummary?.state || selectedStateCode} (${availableCities.length})`}
                  </span>
                </div>
                {availableCities.length > 12 && (
                  <div className="relative w-56">
                    <Search className="w-3 h-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={cityFilterInput}
                      onChange={(e) => setCityFilterInput(e.target.value)}
                      placeholder="Filter cities or ZIP..."
                      className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg pl-7 pr-2.5 py-1 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-[#1E3A8A]"
                    />
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5 max-h-36 overflow-y-auto pr-1">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCityName('all');
                    setAgencyPage(1);
                    if (onSyncGlobalGeography) {
                      onSyncGlobalGeography(selectedStateCode, selectedCountyName, 'all', agencyCategoryFilter);
                    }
                  }}
                  className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors cursor-pointer ${
                    selectedCityName === 'all'
                      ? 'bg-[#0F172A] dark:bg-blue-600 text-white border-[#0F172A] dark:border-blue-600'
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  All Cities ({availableCities.length})
                </button>
                {availableCities.map((c) => {
                  const active = selectedCityName.toLowerCase() === c.city.toLowerCase();
                  return (
                    <button
                      key={`${c.stateCode}-${c.county}-${c.city}`}
                      type="button"
                      onClick={() => handleSelectCity(c.city, c.county, c.stateCode)}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold border transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                          : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span>{c.city}</span>
                      {selectedCountyName === 'all' && (
                        <span className="ml-1 text-[10px] opacity-70">({c.county.replace(' County', '')})</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Hybrid Provider Display: Cards vs. Compact Table */}
          {paginatedAgencies.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs">
              No providers matched the current filter. Click Reset or return to Counties.
            </div>
          ) : providerViewMode === 'cards' ? (
            <div className="workspace-cards-grid">
              {paginatedAgencies.map(agency => {
                const isFire = agency.agencyType.toLowerCase().includes('fire');
                const primaryContact = agency.keyContacts[0];
                const websiteUrl =
                  safeAgencyWebsiteUrl(agency.officialWebsite) ||
                  `https://www.google.com/search?q=${encodeURIComponent(`${agency.name} ${agency.city} ${agency.stateCode} official website`)}`;
                const mapsUrl =
                  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    agency.address
                      ? agency.address
                      : `${agency.name}, ${agency.city}, ${agency.stateCode}`
                  )}`;

                return (
                  <div
                    key={agency.id}
                    onClick={() => onSelectAgency(agency)}
                    className={`agency-directory-card ${isFire ? 'agency-directory-card--fire' : 'agency-directory-card--ems'} group relative grid min-w-0 cursor-pointer grid-cols-1 content-between gap-3 overflow-hidden rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-[0_6px_18px_-16px_rgba(15,23,42,0.5)] transition-colors duration-150 hover:border-blue-300 hover:shadow-[0_18px_42px_-28px_rgba(30,64,175,0.38)] dark:border-slate-800 dark:bg-slate-900 sm:p-4`}
                    data-testid={`agency-card-${agency.id}`}
                  >
                    <div aria-hidden="true" className={`absolute inset-x-0 top-0 h-1 ${isFire ? 'bg-gradient-to-r from-rose-500 to-orange-300' : 'bg-gradient-to-r from-blue-700 to-cyan-300'}`} />
                    <div className="space-y-2.5">
                      {/* Agency identity and linked public-record context */}
                      <div className="agency-identity-strip flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 pt-1 dark:border-slate-800">
                        <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide inline-flex items-center gap-1 ${isFire ? 'bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300' : 'bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300'}`}>
                            {isFire ? <Flame className="h-3.5 w-3.5" aria-hidden="true" /> : <Siren className="h-3.5 w-3.5" aria-hidden="true" />}
                            {isFire ? 'Fire Dept' : 'EMS Provider'}
                          </span>
                          <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs font-medium tabular-nums text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            FDID {agency.fdid || 'Not reported'}
                          </span>
                          {agency.npiNumber && (
                            <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-xs font-medium tabular-nums text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                              NPI {agency.npiNumber}
                            </span>
                          )}
                          {agency.grantStatus.afgAwarded && (
                            <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-bold tabular-nums text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                                FEMA AFG ${(agency.grantStatus.afgAwardAmount / 1000).toFixed(0)}K
                            </span>
                          )}
                        </div>

                        {onOpenDataLineage && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenDataLineage(agency);
                            }}
                            className="inline-flex shrink-0 cursor-pointer items-center rounded-md px-2 py-1 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-blue-800 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-blue-300"
                          >
                            Data sources
                          </button>
                        )}
                      </div>

                      {/* Provider Name + Connected Hierarchy + Score */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="agency-card-title text-[17px] font-bold leading-snug tracking-[-0.02em] text-slate-950 transition-colors group-hover:text-blue-800 dark:text-white dark:group-hover:text-blue-300">
                            {agency.name}
                            <small className="block text-[10px] font-normal text-slate-500 dark:text-slate-400">{agency.verificationSource?.includes('Geographic prospect generator') ? 'Generated prospect · needs review' : 'Imported · needs review'}</small>
                          </h3>
                          <div className="agency-card-geography mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                            {agency.state} ({agency.stateCode}) <span className="text-slate-400">›</span> {agency.county} <span className="text-slate-400">›</span>{' '}
                            <strong className="font-semibold text-slate-900 dark:text-white">{agency.city}</strong>{' '}
                            <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400"><DataLabel kind="zip">ZIP {agency.zipCode}</DataLabel></span>
                          </div>
                        </div>

                        <div
                          className="shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <PulseIqScoreTooltip agency={agency} weights={weights} size="compact" showLabel={true} />
                        </div>
                      </div>

                      {/* Leadership and address are separated so neither gets truncated. */}
                      <div
                        className="agency-context-panel rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-800/50"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="grid gap-2">
                          {primaryContact && (
                            <p className="text-sm leading-snug text-slate-700 dark:text-slate-200">
                              <span className="mr-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400"><DataLabel kind="contact">Leadership</DataLabel></span>
                              <strong className="font-semibold text-slate-950 dark:text-white">{primaryContact.name}</strong>
                              <span className="text-slate-500 dark:text-slate-400"> · {primaryContact.title}</span>
                            </p>
                          )}
                          <div className="flex flex-wrap items-end justify-between gap-2">
                            <p className="min-w-0 break-words text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                              <span className="mr-1.5 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400"><DataLabel kind="location">Address</DataLabel></span>
                              {agency.address || 'Not reported'}
                            </p>
                            <div className="flex shrink-0 items-center gap-1.5 font-semibold">
                              <a
                                href={mapsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-blue-800 transition-colors hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-950/40"
                              >
                                Maps
                                <ExternalLink className="h-3 w-3" />
                              </a>
                              <a
                                href={websiteUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-blue-800 transition-colors hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-950/40"
                              >
                                Website
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* 2 × 2 metric tiles retain each value without forcing narrow columns. */}
                      <div className="agency-metric-grid grid grid-cols-2 gap-2.5 text-sm tabular-nums" aria-label="Agency record and planning summary">
                        <div className="provider-metric provider-metric--planning provider-metric provider-metric--equipment provider-metric provider-metric--operations provider-metric provider-metric--calls min-w-0 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                          <span className="block text-xs font-semibold text-slate-500 dark:text-slate-400"><DataLabel kind="score">Planning value · estimate</DataLabel></span>
                          <span className="agency-card-metric-value mt-1 block break-words text-lg font-bold tracking-tight text-slate-950 dark:text-white">
                            {Number.isFinite(agency.zollOpportunity.projectedPipelineValue)
                              ? formatCompactDollars(agency.zollOpportunity.projectedPipelineValue)
                              : <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{MISSING_INPUT_COPY.planningValue}</span>}
                          </span>
                          <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">PulseIQ planning model · not agency performance</span>
                          <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                            {agency.competitorContract.contractEndDate
                              ? `Contract end · ${agency.competitorContract.contractEndDate}`
                              : 'Contract end · Not reported'}
                          </span>
                        </div>

                        <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                          <span className="block text-xs font-semibold text-slate-500 dark:text-slate-400"><DataLabel kind="monitor">{isFire ? 'Fire & EMS fleet' : 'EMS monitor fleet'}</DataLabel></span>
                          <span className="agency-card-metric-value mt-1 block break-words text-sm font-bold leading-snug text-slate-950 dark:text-white" title={agency.installedFleet.defibBrand}>
                            {hasAgencyFactEvidence(agency, 'defibrillatorBiomedicalFleet') && agency.installedFleet.defibBrand && agency.installedFleet.defibBrand !== 'Not reported'
                              ? `${Number.isFinite(agency.installedFleet.defibUnitsCount) ? agency.installedFleet.defibUnitsCount.toLocaleString() : 'Not reported'}× ${agency.installedFleet.defibBrand}`
                              : hasAgencyFactEvidence(agency, 'monitorModelTransition')
                                ? 'LIFEPAK-15; LIFEPAK-35 replacement reported'
                                : 'Not reported'}
                          </span>
                          <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                            {hasAgencyFactEvidence(agency, 'defibrillatorBiomedicalFleet') && Number.isFinite(agency.installedFleet.defibAgeYears) ? `${agency.installedFleet.defibAgeYears} years old` : 'Fleet age · Not reported'}
                            {' · '}
                            {hasAgencyFactEvidence(agency, 'frontlineApparatusStations')
                              ? `${agency.totalAmbulances.toLocaleString()} ambulances · ${agency.totalFireEngines.toLocaleString()} engines`
                              : 'Ambulance / engine counts · Not reported'}
                          </span>
                        </div>

                        <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                          <span className="block text-xs font-semibold text-slate-500 dark:text-slate-400"><DataLabel kind="stations">Stations · public record</DataLabel></span>
                          <span className="mt-1 block break-words text-lg font-bold tracking-tight text-slate-950 dark:text-white">
                            {hasAgencyFactEvidence(agency, 'stationCount') || hasAgencyFactEvidence(agency, 'frontlineApparatusStations')
                              ? agency.stationsCount.toLocaleString()
                              : 'Not reported'}
                          </span>
                          <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                            {agency.factEvidence?.stationCount?.reportingPeriod || agency.factEvidence?.frontlineApparatusStations?.reportingPeriod || 'Reporting period · Not reported'}
                          </span>
                        </div>

                        <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                          <span className="block text-xs font-semibold text-slate-500 dark:text-slate-400"><DataLabel kind="calls">{isFire ? 'Annual response volume' : 'Annual EMS volume'}</DataLabel></span>
                          <span className="agency-card-metric-value mt-1 block break-words text-lg font-bold tracking-tight text-slate-950 dark:text-white">
                            {hasAgencyFactEvidence(agency, 'annualCallsReceived')
                              ? `${Number.isFinite(agency.annualCallVolume) ? agency.annualCallVolume.toLocaleString() : 'Not reported'} calls`
                              : hasAgencyFactEvidence(agency, 'annualEmergencyVolume')
                                ? `${Number.isFinite(agency.annual911Transports) ? agency.annual911Transports.toLocaleString() : 'Not reported'} transports`
                                : 'Not reported'}
                          </span>
                          <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                            {hasAgencyFactEvidence(agency, 'annualCallsReceived')
                              ? agency.factEvidence?.annualCallsReceived?.reportingPeriod || 'Reported period not stated'
                              : hasAgencyFactEvidence(agency, 'annualEmergencyVolume')
                                ? 'Annual 911 transports'
                                : 'Clinical period · Not reported'}
                            {' · '}
                            {hasAgencyFactEvidence(agency, 'clinicalOutcomes') && Number.isFinite(agency.utsteinSurvivalRate)
                              ? `${agency.utsteinSurvivalRate}% ROSC`
                              : 'ROSC · Not reported'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Clean Card Footer */}
                    <div className="agency-card-footer border-t border-slate-100 pt-3 dark:border-slate-800">
                      <div className="mb-3 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                        {agency.zollOpportunity.primaryTargetProduct
                          ? <>Planning target · <strong className="text-slate-900 dark:text-white">{agency.zollOpportunity.primaryTargetProduct}</strong></>
                          : 'Planning target · Not reported'}
                      </div>

                      <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        {onToggleAgencyComparison && (
                          <AgencyCompareButton
                            agency={agency}
                            selected={comparedAgencyIds.includes(agency.id)}
                            limitReached={comparedAgencyIds.length >= 3}
                            onToggle={onToggleAgencyComparison}
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => (onPreviewAgency ? onPreviewAgency(agency) : onSelectAgency(agency))}
                          className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                        >
                          Quick Preview
                        </button>
                        <button
                          type="button"
                          onClick={() => onSelectAgency(agency)}
                          className="agency-card-primary-action ml-auto inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-slate-950 px-4 text-xs font-bold text-white transition-colors hover:bg-blue-800 dark:bg-blue-600 dark:hover:bg-blue-500"
                        >
                          Open profile
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <>
              <div className="provider-mobile-list space-y-2 md:hidden" role="list" aria-label="Agencies, compact phone summaries">
                {paginatedAgencies.map((agency) => {
                  const isFire = agency.agencyType.toLowerCase().includes('fire');
                  return (
                    <article
                      role="listitem"
                      key={agency.id}
                      className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_5px_16px_-14px_rgba(24,50,70,.45)] dark:border-slate-800 dark:bg-slate-900"
                    >
                      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 p-2.5">
                        <div className="min-w-0">
                          <div className="mb-1 flex items-center gap-2">
                            <span className={`rounded-full px-2 py-0.5 text-xs font-bold uppercase tracking-wide inline-flex items-center gap-1 ${isFire ? 'bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300' : 'bg-teal-50 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300'}`}>
                              {isFire ? <Flame className="h-3.5 w-3.5" aria-hidden="true" /> : <Siren className="h-3.5 w-3.5" aria-hidden="true" />}
                              {isFire ? 'Fire' : 'EMS'}
                            </span>
                            <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                              FDID {agency.fdid || 'Not reported'}
                            </span>
                          </div>
                          <h3 className="break-words text-sm font-bold leading-snug text-slate-950 dark:text-white">
                            {agency.name}
                            <small className="block text-[10px] font-normal text-slate-500 dark:text-slate-400">{agency.verificationSource?.includes('Geographic prospect generator') ? 'Generated prospect · needs review' : 'Imported · needs review'}</small>
                          </h3>
                          <p className="mt-1 text-xs leading-snug text-slate-600 dark:text-slate-300">
                            {agency.city}, {agency.stateCode} · {agency.county}
                          </p>
                          <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5 text-xs">
                            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                              Planning value · estimate
                            </span>
                            <span className="font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                              {Number.isFinite(agency.zollOpportunity.projectedPipelineValue)
                                ? formatCompactDollars(agency.zollOpportunity.projectedPipelineValue)
                                : <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{MISSING_INPUT_COPY.planningValue}</span>}
                            </span>
                          </p>
                        </div>
                        <div className="self-start text-right">
                          <PulseIqScoreTooltip agency={agency} weights={weights} size="badge" />
                          <PulseIqEstimateLabel className="mt-1 block text-xs leading-tight text-slate-500 dark:text-slate-400" />
                        </div>

                        <div className="col-span-2 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2.5 dark:border-slate-800">
                          {onToggleAgencyComparison && (
                            <AgencyCompareButton
                              agency={agency}
                              selected={comparedAgencyIds.includes(agency.id)}
                              limitReached={comparedAgencyIds.length >= 3}
                              onToggle={onToggleAgencyComparison}
                              className="min-h-9"
                            />
                          )}
                          <button
                            type="button"
                            onClick={() => (onPreviewAgency ? onPreviewAgency(agency) : onSelectAgency(agency))}
                            className="inline-flex min-h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                          >
                            Quick Preview
                          </button>
                          <button
                            type="button"
                            onClick={() => onSelectAgency(agency)}
                            className="ml-auto inline-flex min-h-11 items-center justify-center gap-1 rounded-lg bg-[#194d54] px-3 text-xs font-bold text-white transition-colors hover:bg-[#123c43]"
                          >
                            Open profile
                            <ChevronRight className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>

              {/* High-Density Sortable Provider Comparison Table */}
              <div className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 md:block">
              <div className="overflow-x-auto" role="region" aria-label="Agency comparison table, scrolls horizontally" tabIndex={0}>
                <table className="w-full text-left text-xs border-collapse tabular-nums">
                  <thead>
                    <tr className="bg-slate-100/90 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 uppercase font-bold tracking-wider text-xs">
                      <th
                        onClick={() => setProviderSortBy('pulseIq')}
                        className="py-2.5 px-3 w-24 font-mono cursor-pointer hover:text-[#1E3A8A]"
                      >
                        <DataLabel kind="score">Score</DataLabel> {providerSortBy === 'pulseIq' ? '↓' : ''}
                      </th>
                      <th className="py-2.5 px-4"><DataLabel kind="agency">Provider &amp; Jurisdiction</DataLabel></th>
                      <th
                        onClick={() => setProviderSortBy('fleetAge')}
                        className="py-2.5 px-3 hidden md:table-cell cursor-pointer hover:text-[#1E3A8A]"
                      >
                        <DataLabel kind="monitor">Monitor fleet · software</DataLabel> {providerSortBy === 'fleetAge' ? '↓' : ''}
                      </th>
                      <th
                        onClick={() => setProviderSortBy('value')}
                        className="py-2.5 px-3 text-right hidden sm:table-cell cursor-pointer hover:text-[#1E3A8A]"
                      >
                        <DataLabel kind="savings">Upgrade value · estimate</DataLabel> {providerSortBy === 'value' ? '↓' : ''}
                      </th>
                                            <th className="py-2.5 px-3 text-right hidden 2xl:table-cell"><DataLabel kind="calls">Runs · outcomes</DataLabel></th>
                      <th className="py-2.5 px-4 text-right"><DataLabel kind="review">Actions</DataLabel></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
                    {paginatedAgencies.map((agency) => {
                      const isFire = agency.agencyType.toLowerCase().includes('fire');
                      const hasVerifiedModel = hasVerifiedModelInputs(agency);
                      return (
                        <tr
                          key={agency.id}
                          onClick={() => (onPreviewAgency ? onPreviewAgency(agency) : onSelectAgency(agency))}
                          className="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer group"
                        >
                          <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-white tabular-nums">
                            <div>
                              <>{agency.zollOpportunity.pulseIqScore}<span className="text-xs text-slate-400 font-normal">/100</span></>
                            </div>
                            <PulseIqEstimateLabel className="block text-xs font-normal text-slate-500 dark:text-slate-400" />
                          </td>
                          <td className="py-2.5 px-4">
                            <div className="font-semibold text-slate-900 dark:text-white group-hover:text-[#1E3A8A] dark:group-hover:text-blue-400 transition-colors">
                              {agency.name}
                            <small className="block text-[10px] font-normal text-slate-500 dark:text-slate-400">{agency.verificationSource?.includes('Geographic prospect generator') ? 'Generated prospect · needs review' : 'Imported · needs review'}</small>
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                              <span className={`provider-discipline ${isFire ? 'provider-discipline--fire' : 'provider-discipline--ems'}`}>{isFire ? 'Fire' : 'EMS'}</span> <span className="provider-fdid">FDID {agency.fdid || 'Not reported'}</span> · {agency.city}, {agency.stateCode} · {agency.county}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 hidden md:table-cell">
                            <div className="font-semibold text-slate-900 dark:text-white tabular-nums">
                              {hasAgencyFactEvidence(agency, 'defibrillatorBiomedicalFleet')
                                ? `${agency.installedFleet.defibUnitsCount}× ${agency.installedFleet.defibBrand} (${agency.installedFleet.defibAgeYears}y)`
                                : hasAgencyFactEvidence(agency, 'monitorModelTransition')
                                  ? 'LIFEPAK-15; LIFEPAK-35 replacement reported'
                                : 'Not reported'}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[200px]">
                              <span className="provider-sub-k">ePCR/CAD</span> {hasAgencyFactEvidence(agency, 'epcrSystem') ? agency.installedFleet.epcrCadSoftware : 'Not reported'}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right hidden sm:table-cell">
                            <div className="font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
                              {hasVerifiedModel ? formatCompactDollars(agency.zollOpportunity.projectedPipelineValue) : <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{MISSING_INPUT_COPY.planningValue}</span>}
                            </div>
                            <div className="text-xs text-slate-500 tabular-nums">
                              {agency.competitorContract.contractEndDate ? `Contract end · ${agency.competitorContract.contractEndDate}` : 'Contract end · Not reported'}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right hidden 2xl:table-cell">
                            <div className="font-semibold text-slate-900 dark:text-white tabular-nums">
                              {hasAgencyFactEvidence(agency, 'annualCallsReceived')
                                ? `${agency.annualCallVolume.toLocaleString()} calls received · ${agency.factEvidence?.annualCallsReceived?.reportingPeriod || 'reported period'}`
                                : hasAgencyFactEvidence(agency, 'annualEmergencyVolume')
                                  ? agency.annual911Transports.toLocaleString()
                              : 'Not reported'}
                            </div>
                            <div className="text-xs text-slate-500 tabular-nums">
                              <span className="provider-sub-k">Outcome</span> {hasAgencyFactEvidence(agency, 'clinicalOutcomes') ? `${agency.utsteinSurvivalRate}% ROSC` : 'ROSC · Not reported'}
                            </div>
                          </td>
                          <td className="py-2.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1.5">
                              {onToggleAgencyComparison && (
                                <AgencyCompareButton
                                  agency={agency}
                                  selected={comparedAgencyIds.includes(agency.id)}
                                  limitReached={comparedAgencyIds.length >= 3}
                                  onToggle={onToggleAgencyComparison}
                                />
                              )}
                              <button
                                type="button"
                                onClick={() => (onPreviewAgency ? onPreviewAgency(agency) : onSelectAgency(agency))}
                                className="h-8 shrink-0 whitespace-nowrap px-2.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                              >
                                Preview
                              </button>
                              <button
                                type="button"
                                onClick={() => onSelectAgency(agency)}
                                aria-label={`Open agency profile for ${agency.name}`}
                                title="Open agency profile"
                                className="h-9 shrink-0 whitespace-nowrap px-3 rounded-lg text-xs font-bold bg-[#1E3A8A] text-white hover:bg-[#172554] transition-colors flex items-center gap-1 cursor-pointer"
                              >
                                <span>Open profile</span>
                                <ChevronRight className="w-3 h-3" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              </div>
            </>
          )}

          {totalAgencyPages > 1 && (
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs pi-data-inline text-slate-500">
              <span>Page {agencyPage} of {totalAgencyPages} ({matchingAgencies.length.toLocaleString()} Providers)</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={agencyPage <= 1}
                  onClick={() => setAgencyPage(p => Math.max(1, p - 1))}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 disabled:opacity-40 text-slate-700 dark:text-slate-200 font-sans font-semibold cursor-pointer"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={agencyPage >= totalAgencyPages}
                  onClick={() => setAgencyPage(p => Math.min(totalAgencyPages, p + 1))}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 disabled:opacity-40 text-slate-700 dark:text-slate-200 font-sans font-semibold cursor-pointer"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Optional PulseIQ Recharts View */}
      {activeFocusLevel === 'pulseiq_chart' && (
        <div className="space-y-4">
          <PulseIqRegionalBreakdownChart
            selectedState={selectedStateCode}
            selectedCounty={selectedCountyName}
            agencies={agencies}
            onSelectCounty={(c) => handleSelectCounty(c)}
            onSelectState={(st) => handleSelectState(st)}
            onSelectAgency={onSelectAgency}
            globalCategory={agencyCategoryFilter}
            weights={weights}
          />
        </div>
      )}

    </div>
  );
};
