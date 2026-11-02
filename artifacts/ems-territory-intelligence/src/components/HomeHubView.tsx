/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Agency, PushAlert } from '../types';
import {
  Search,
  ArrowRight,
  Compass,
  MapPin,
  Layers,
  Activity,
  DollarSign,
  Box,
  Database,
  Award,
  Clock,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Siren,
  Flame,
  Globe,
  SlidersHorizontal,
  Building2,
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw
} from 'lucide-react';
import { ALL_50_STATES_SUMMARIES } from '../data/nationalGeographicData';
import { US_STATES_SVG_PATHS, EAST_COAST_CALLOUT_STATES } from '../data/usStatesSvgPaths';
import { territoryEngine } from '../services/territoryIntelligenceEngine';
import {
  getStateZipDenialProfileSummary,
  getStateZipDenialProfiles,
} from '../services/countyDenialProfileService';
import {
  getImportedStateDenialMetric,
  MEDICARE_DENIAL_IMPORT_EVENT,
} from '../services/medicareDenialImportService';
import { formatCurrency, formatPercent, formatInteger, formatScore } from '../utils/numberFormatting';
import { NationalAmbulanceReference } from './NationalAmbulanceReference';

const hasReportedValue = (value: number | null | undefined): value is number =>
  value != null && Number.isFinite(value);

const STATE_MAP_METRICS = [
  { key: 'agency-records', label: 'Agency directory records' },
  { key: 'ambulances', label: 'Agency-profile ambulance total' },
  { key: 'fire-engines', label: 'Agency-profile fire-engine total' },
  { key: 'pulseiq', label: 'Modeled average PulseIQ' },
  { key: 'cardiac-survival', label: 'Cardiac survival estimate (%)' },
  { key: 'scene-transit', label: 'EMS transit estimate (minutes)' },
] as const;

type StateMapMetricKey =
  | (typeof STATE_MAP_METRICS)[number]['key']
  | 'state-claims-denial'
  | 'zip-denial';

interface StateStats {
  count: number;
  countiesCount: number;
  avgPulseIq: number | null;
  pulseIqDataCount: number;
  totalAmbulances: number | null;
  ambulanceDataCount: number;
  totalFireEngines: number | null;
  fireEngineDataCount: number;
  medicareAllowed: number | null;
  medicareAllowedDataCount: number;
  grantFunds: number;
}

interface StateMapMetricDatum {
  value: number | null;
  coverage: string;
  period: string;
  sourceAction: 'agency-records' | 'zip-profiles' | 'claims-import' | 'reference-estimate';
  deniedClaims?: number;
  adjudicatedClaims?: number;
  claimScope?: string;
  denialDefinition?: string;
  source?: string;
  sourceUrl?: string;
  sourceReference?: string;
}

const formatStateMapValue = (metric: StateMapMetricKey, value: number | null) => {
  if (value === null) return metric === 'state-claims-denial' ? 'Not published' : 'Not reported';
  if (metric === 'zip-denial' || metric === 'state-claims-denial') return `${value.toFixed(1)}%`;
  if (metric === 'cardiac-survival') return `${value.toFixed(1)}%`;
  if (metric === 'scene-transit') return `${value.toFixed(1)} min`;
  if (metric === 'pulseiq') return `${formatScore(value)} / 100`;
  return formatInteger(value);
};

const MAP_PALETTES: Record<string, { stops: string[]; lowLabel: string; highLabel: string }> = {
  'agency-records': { stops: ['#00E5FF', '#2979FF', '#7C4DFF', '#FF6D00', '#F5002F'], lowLabel: 'Fewer', highLabel: 'More' },
  ambulances: { stops: ['#00E5FF', '#2979FF', '#7C4DFF', '#FF6D00', '#F5002F'], lowLabel: 'Fewer', highLabel: 'More' },
  'fire-engines': { stops: ['#00E5FF', '#2979FF', '#7C4DFF', '#FF6D00', '#F5002F'], lowLabel: 'Fewer', highLabel: 'More' },
  pulseiq: { stops: ['#00E5FF', '#2979FF', '#7C4DFF', '#FF6D00', '#F5002F'], lowLabel: 'Lower priority', highLabel: 'Higher priority' },
  'cardiac-survival': { stops: ['#F5002F', '#FF6D00', '#FFEA00', '#76FF03', '#00C853'], lowLabel: 'Lower', highLabel: 'Higher · stronger' },
  'scene-transit': { stops: ['#00C853', '#76FF03', '#FFEA00', '#FF6D00', '#F5002F'], lowLabel: 'Shorter', highLabel: 'Longer · concerning' },
};

const hexToRgb = (hex: string) =>
  hex.match(/[0-9a-f]{2}/gi)?.map((channel) => parseInt(channel, 16)) ?? [0, 0, 0];

const interpolateStateFill = (metric: StateMapMetricKey, value: number, min: number, max: number) => {
  const t = max === min ? 0.5 : Math.max(0, Math.min(1, (value - min) / (max - min)));
  const stops = MAP_PALETTES[metric]?.stops ?? MAP_PALETTES['agency-records'].stops;
  const scaled = t * (stops.length - 1);
  const stopIndex = Math.min(stops.length - 2, Math.floor(scaled));
  const localT = scaled - stopIndex;
  const start = hexToRgb(stops[stopIndex]);
  const end = hexToRgb(stops[stopIndex + 1]);
  const channels = start.map((channel, index) => Math.round(channel + (end[index] - channel) * localT));
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
};

const getMapGradient = (metric: StateMapMetricKey) =>
  `linear-gradient(to right, ${(MAP_PALETTES[metric]?.stops ?? MAP_PALETTES['agency-records'].stops).join(', ')})`;

const readableTextForFill = (hexColor: string) => {
  const channels = hexColor.match(/[0-9a-f]{2}/gi)?.map((channel) => parseInt(channel, 16)) ?? [219, 234, 254];
  const [red, green, blue] = channels.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue > 0.45 ? '#10233A' : '#FFFFFF';
};

interface HomeHubViewProps {
  agencies: Agency[];
  onNavigateTab: (tab: string) => void;
  onSelectAgency: (agency: Agency) => void;
  onOpenRfpGenerator?: (agency: Agency) => void;
  onOpenWeightsModal?: () => void;
  onOpenCommandPalette?: () => void;
  onOpenDataLineageModal?: () => void;
  isOnline: boolean;
  isDarkMode: boolean;
  onToggleDarkMode?: () => void;
  alerts: PushAlert[];
  isCloudConnected?: boolean;
  cloudSyncCount?: number;
  globalCategory: 'all' | 'ems' | 'fire';
  setGlobalCategory: (cat: 'all' | 'ems' | 'fire') => void;
  onSelectState?: (stateCode: string) => void;
}

export const HomeHubView: React.FC<HomeHubViewProps> = ({
  agencies,
  onNavigateTab,
  onSelectAgency,
  onOpenCommandPalette,
  onOpenDataLineageModal,
  globalCategory,
  setGlobalCategory,
  onSelectState
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedStateCode, setSelectedStateCode] = useState<string>('FL');
  const [hoveredStateCode, setHoveredStateCode] = useState<string | null>(null);
  const [regionFilter, setRegionFilter] = useState<'All' | 'Northeast' | 'Midwest' | 'South' | 'West'>('All');
  const [mapMetric, setMapMetric] = useState<StateMapMetricKey>('agency-records');
  const [mapZoom, setMapZoom] = useState(1);
  const [denialImportRevision, setDenialImportRevision] = useState(0);
  const mapViewportRef = useRef<HTMLDivElement>(null);
  const hasInitializedMapRef = useRef(false);

  useEffect(() => {
    const refreshImportedDenials = () => setDenialImportRevision((revision) => revision + 1);
    window.addEventListener(MEDICARE_DENIAL_IMPORT_EVENT, refreshImportedDenials);
    window.addEventListener('storage', refreshImportedDenials);
    return () => {
      window.removeEventListener(MEDICARE_DENIAL_IMPORT_EVENT, refreshImportedDenials);
      window.removeEventListener('storage', refreshImportedDenials);
    };
  }, []);

  // Filter agencies by global category (All / EMS / Fire)
  const scopedAgencies = useMemo(() => {
    if (globalCategory === 'all') return agencies;
    return agencies.filter((a) => {
      const isFire = a.providerCategory === 'FIRE' || a.agencyType.toLowerCase().includes('fire');
      return globalCategory === 'fire' ? isFire : !isFire;
    });
  }, [agencies, globalCategory]);
  const providerScopeLabel = globalCategory === 'all'
    ? 'all-provider'
    : globalCategory === 'ems'
      ? 'EMS-only'
      : 'fire-only';

  // Instant inline universal search results
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    return scopedAgencies
      .filter((a) =>
        a.name.toLowerCase().includes(q) ||
        a.city.toLowerCase().includes(q) ||
        a.county.toLowerCase().includes(q) ||
        a.stateCode.toLowerCase().includes(q) ||
        (a.zipCode && a.zipCode.toLowerCase().includes(q)) ||
        (a.fdid && a.fdid.toLowerCase().includes(q)) ||
        (a.npiNumber && a.npiNumber.includes(q))
      )
      .slice(0, 8);
  }, [scopedAgencies, searchQuery]);

  // Keep the selected dossier stable while hovering only updates the map readout.
  const displayStateCode = selectedStateCode;
  const hoverReadoutStateCode = hoveredStateCode || selectedStateCode;
  const activeStateSummary = ALL_50_STATES_SUMMARIES[displayStateCode] || ALL_50_STATES_SUMMARIES['FL'];

  const stateStatsByCode = useMemo(() => {
    const agenciesByState = new Map<string, Agency[]>();
    for (const agency of scopedAgencies) {
      const group = agenciesByState.get(agency.stateCode) ?? [];
      group.push(agency);
      agenciesByState.set(agency.stateCode, group);
    }

    return Object.fromEntries(
      Object.values(ALL_50_STATES_SUMMARIES).map((state) => {
        const stateAgencies = agenciesByState.get(state.code) ?? [];
        let sumPulseIq = 0;
        let pulseIqDataCount = 0;
        let ambulances = 0;
        let ambulanceDataCount = 0;
        let fireEngines = 0;
        let fireEngineDataCount = 0;
        let medicare = 0;
        let medicareAllowedDataCount = 0;
        let grants = 0;

        for (const agency of stateAgencies) {
          const pulseIq = agency.zollOpportunity?.pulseIqScore;
          const ambulanceCount = agency.totalAmbulances;
          const fireEngineCount = agency.totalFireEngines;
          const medicareAllowed = agency.cmsData?.medicareAllowedAnnual;

          if (hasReportedValue(pulseIq)) {
            sumPulseIq += pulseIq;
            pulseIqDataCount++;
          }
          if (hasReportedValue(ambulanceCount)) {
            ambulances += ambulanceCount;
            ambulanceDataCount++;
          }
          if (hasReportedValue(fireEngineCount)) {
            fireEngines += fireEngineCount;
            fireEngineDataCount++;
          }
          if (hasReportedValue(medicareAllowed)) {
            medicare += medicareAllowed;
            medicareAllowedDataCount++;
          }
          const grantAmount = agency.grantStatus?.afgAwardAmount;
          if (agency.grantStatus?.afgAwarded && hasReportedValue(grantAmount)) {
            grants += grantAmount;
          }
        }

        const stats: StateStats = {
          count: stateAgencies.length,
          countiesCount: territoryEngine.getCountiesForState(state.code).length,
          avgPulseIq: pulseIqDataCount ? Math.round(sumPulseIq / pulseIqDataCount) : null,
          pulseIqDataCount,
          totalAmbulances: ambulanceDataCount ? ambulances : null,
          ambulanceDataCount,
          totalFireEngines: fireEngineDataCount ? fireEngines : null,
          fireEngineDataCount,
          medicareAllowed: medicareAllowedDataCount ? medicare : null,
          medicareAllowedDataCount,
          grantFunds: grants,
        };
        return [state.code, stats];
      }),
    ) as Record<string, StateStats>;
  }, [scopedAgencies]);

  const stateStats = stateStatsByCode[displayStateCode];

  const stateZipDenialProfiles = useMemo(
    () => getStateZipDenialProfiles(displayStateCode),
    [displayStateCode],
  );
  const stateZipDenialSummary = useMemo(
    () => getStateZipDenialProfileSummary(displayStateCode),
    [displayStateCode],
  );

  const stateMapMetricsByCode = useMemo(() => {
    return Object.fromEntries(
      Object.values(ALL_50_STATES_SUMMARIES).map((state) => {
        const stats = stateStatsByCode[state.code];
        const zipProfiles = getStateZipDenialProfiles(state.code);
        const zipDenialSummary = getStateZipDenialProfileSummary(state.code);
        const metricData: Record<StateMapMetricKey, StateMapMetricDatum> = {
          'agency-records': {
            value: stats.count,
            coverage: `${formatInteger(stats.count)} ${providerScopeLabel} agency records in the current directory.`,
            period: 'Current app directory snapshot; no as-of date is recorded.',
            sourceAction: 'agency-records',
          },
          ambulances: {
            value: stats.totalAmbulances,
            coverage: `Sum of ambulance counts in ${formatInteger(stats.ambulanceDataCount)} of ${formatInteger(stats.count)} ${providerScopeLabel} agency profiles.`,
            period: 'Agency profile periods vary or are not stated.',
            sourceAction: 'agency-records',
          },
          'fire-engines': {
            value: stats.totalFireEngines,
            coverage: `Sum of fire-engine counts in ${formatInteger(stats.fireEngineDataCount)} of ${formatInteger(stats.count)} ${providerScopeLabel} agency profiles.`,
            period: 'Agency profile periods vary or are not stated.',
            sourceAction: 'agency-records',
          },
          pulseiq: {
            value: stats.avgPulseIq,
            coverage: `Mean of available scores from ${formatInteger(stats.pulseIqDataCount)} of ${formatInteger(stats.count)} ${providerScopeLabel} agency records.`,
            period: 'Modeled from current agency profile inputs; source periods are not standardized.',
            sourceAction: 'agency-records',
          },
          'cardiac-survival': {
            value: state.avgUtsteinSurvival,
            coverage: 'State-level cardiac survival estimate from the app’s reference profile.',
            period: 'Reporting period is not stated.',
            sourceAction: 'reference-estimate',
          },
          'scene-transit': {
            value: state.avgTransportMinutes,
            coverage: 'State-level EMS transit estimate from the app’s reference profile.',
            period: 'Reporting period is not stated.',
            sourceAction: 'reference-estimate',
          },
          'state-claims-denial': {
            value: null,
            coverage: '',
            period: '',
            sourceAction: 'agency-records',
          },
          'zip-denial': {
            value: null,
            coverage: '',
            period: '',
            sourceAction: 'agency-records',
          },
        };
        return [state.code, metricData];
      }),
    ) as Record<string, Record<StateMapMetricKey, StateMapMetricDatum>>;
  }, [providerScopeLabel, stateStatsByCode, denialImportRevision]);

  const mapMetricValues = Object.values(stateMapMetricsByCode)
    .map((metrics) => metrics[mapMetric].value)
    .filter(hasReportedValue);
  const mapMetricMin = mapMetricValues.length ? Math.min(...mapMetricValues) : 0;
  const mapMetricMax = mapMetricValues.length ? Math.max(...mapMetricValues) : 0;
  const activeMapMetric = STATE_MAP_METRICS.find((metric) => metric.key === mapMetric)!;
  const activeMapPalette = MAP_PALETTES[mapMetric] ?? MAP_PALETTES['agency-records'];
  const mapReadoutMetric = stateMapMetricsByCode[hoverReadoutStateCode][mapMetric];
  const mapReadoutState = ALL_50_STATES_SUMMARIES[hoverReadoutStateCode];

  useEffect(() => {
    const viewport = mapViewportRef.current;
    const stateBoundary = US_STATES_SVG_PATHS[selectedStateCode];
    const svg = viewport?.querySelector('svg');
    if (!viewport || !stateBoundary || !svg) return;
    if (!hasInitializedMapRef.current) {
      hasInitializedMapRef.current = true;
      return;
    }

    const scale = svg.getBoundingClientRect().width / 920;
    const stateX = stateBoundary.labelX * scale;
    const stateY = stateBoundary.labelY * scale;
    const desiredLeft = stateX - viewport.clientWidth / 2;
    const desiredTop = stateY - viewport.clientHeight / 2;
    const maxScrollLeft = viewport.scrollWidth - viewport.clientWidth;
    const maxScrollTop = viewport.scrollHeight - viewport.clientHeight;
    viewport.scrollTo({
      left: Math.max(0, Math.min(maxScrollLeft, desiredLeft)),
      top: Math.max(0, Math.min(maxScrollTop, desiredTop)),
      behavior: 'smooth',
    });
  }, [selectedStateCode, mapZoom]);

  const handleStateClick = (code: string) => {
    setSelectedStateCode(code);
    if (onSelectState) {
      onSelectState(code);
    } else {
      onNavigateTab('states_directory');
    }
  };

  const handleMapSourceAction = (stateCode: string, sourceAction: StateMapMetricDatum['sourceAction']) => {
    if (sourceAction === 'zip-profiles') {
      setSelectedStateCode(stateCode);
      window.requestAnimationFrame(() => {
        document.getElementById('state-zip-profile-values')?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      });
      return;
    }
    if (sourceAction === 'claims-import') {
      setSelectedStateCode(stateCode);
      onNavigateTab('claims');
      return;
    }
    handleStateClick(stateCode);
  };

  return (
    <div>
      {/* ====================================================================
          1. COMPACT PREMIUM HEADER WITH DISCIPLINE FILTER & SEARCH
         ==================================================================== */}
      <section
        aria-label="Daily Territory Intelligence Briefing Header"
        className="hidden"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="pi-page-title">
              EMS &amp; Fire territory, at a glance
            </h1>
            <p className="pi-supporting">
              Explore agency records, locations, fleet details, and operational signals in one workspace.
            </p>
          </div>

          {/* Provider Scope Filter: All / EMS / Fire */}
          <div
            className="flex items-center gap-1 bg-[#F5F7FA] dark:bg-[#16243A] p-1 rounded-xl border border-[#DFE6EF] dark:border-[#1E2D42] self-start md:self-auto shrink-0"
            role="group"
            aria-label="Provider Discipline Scope"
          >
            {(['all', 'ems', 'fire'] as const).map((cat) => {
              const active = globalCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setGlobalCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                    active
                      ? 'bg-white dark:bg-[#111C2D] text-[#14283F] dark:text-white shadow-2xs font-bold'
                      : 'text-[#53657B] dark:text-slate-400 hover:text-[#14283F] dark:hover:text-white'
                  }`}
                >
                  {cat === 'ems' && <Siren className="w-3.5 h-3.5 text-[#285EE8]" />}
                  {cat === 'fire' && <Flame className="w-3.5 h-3.5 text-amber-500" />}
                  <span>{cat === 'all' ? 'All Providers' : cat === 'ems' ? 'EMS Only' : 'Fire Only'}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Global Quick Search Bar */}
        <div className="relative">
          <div className="relative flex items-center">
            <Search className="w-4 h-4 text-[#53657B] dark:text-slate-400 absolute left-3.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search EMS and fire agencies"
              autoComplete="off"
              spellCheck={false}
              placeholder="Search agencies by name, city, county, ZIP, NPI, or FDID"
              className="w-full h-11 pl-10 pr-24 rounded-xl bg-[#F5F7FA] dark:bg-[#16243A] border border-[#DFE6EF] dark:border-[#1E2D42] text-xs font-semibold text-[#14283F] dark:text-white placeholder-[#53657B] dark:placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#285EE8] focus:bg-white dark:focus:bg-[#111C2D] transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Clear agency search"
                className={`absolute ${onOpenCommandPalette ? 'right-[7.25rem]' : 'right-2'} p-2 rounded-md text-[#53657B] dark:text-slate-400 hover:bg-white dark:hover:bg-[#111C2D] hover:text-[#14283F] dark:hover:text-white transition-colors cursor-pointer`}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            {onOpenCommandPalette && (
              <button
                type="button"
                onClick={onOpenCommandPalette}
                aria-label="Open command palette"
                className="absolute right-2 px-2.5 py-1 rounded-md text-[11px] font-mono font-medium text-[#53657B] dark:text-slate-400 bg-white dark:bg-[#111C2D] border border-[#DFE6EF] dark:border-[#1E2D42] hover:text-[#285EE8] transition-colors cursor-pointer"
              >
                ⌘K Palette
              </button>
            )}
          </div>

          {/* Quick Search Dropdown Overlay */}
          {searchQuery.trim() && (
            <div
              role="region"
              aria-label="Agency search results"
              aria-live="polite"
              className="absolute top-full left-0 right-0 mt-1.5 bg-white dark:bg-[#111C2D] border border-[#DFE6EF] dark:border-[#1E2D42] rounded-xl shadow-xl z-30 divide-y divide-[#DFE6EF] dark:divide-[#1E2D42] max-h-80 overflow-y-auto"
            >
              {searchResults.length === 0 && (
                <div className="px-4 py-5 text-center">
                  <p className="text-sm font-semibold text-[#14283F] dark:text-slate-100">No matching agencies</p>
                  <p className="mt-1 text-xs text-[#53657B] dark:text-slate-400">Try a different agency name, location, ZIP, NPI, or FDID.</p>
                </div>
              )}
              {searchResults.map((agency) => (
                <div
                  key={agency.id}
                  className="p-3.5 hover:bg-[#F5F7FA] dark:hover:bg-[#16243A] flex items-center justify-between gap-3 transition-colors text-left"
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelectAgency(agency);
                      setSearchQuery('');
                    }}
                    className="min-w-0 flex-1 text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        agency.providerCategory === 'FIRE' || agency.agencyType.toLowerCase().includes('fire')
                          ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800/60'
                          : 'bg-blue-50 dark:bg-blue-950/60 text-[#285EE8] dark:text-blue-400 border border-blue-200 dark:border-blue-800/60'
                      }`}>
                        {agency.providerCategory === 'FIRE' || agency.agencyType.toLowerCase().includes('fire') ? <Flame className="w-2.5 h-2.5" /> : <Siren className="w-2.5 h-2.5" />}
                        <span>{agency.providerCategory === 'FIRE' || agency.agencyType.toLowerCase().includes('fire') ? 'Fire' : 'EMS'}</span>
                      </span>
                      <div className="text-sm font-semibold text-[#14283F] dark:text-white hover:text-[#285EE8] truncate">
                        {agency.name}
                      </div>
                    </div>
                    <div className="text-xs text-[#53657B] dark:text-slate-400 mt-1">
                      {agency.city}, {agency.stateCode} · {agency.county}
                      {agency.zipCode ? ` · ZIP ${agency.zipCode}` : ''}
                      {agency.npiNumber ? ` · NPI ${agency.npiNumber}` : ' · NPI not reported'}
                    </div>
                  </button>

                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-[#14283F] dark:text-slate-200 pi-data-inline">
                      PulseIQ <strong className="pi-data-number text-xs">
                        {hasReportedValue(agency.zollOpportunity?.pulseIqScore) ? formatScore(agency.zollOpportunity.pulseIqScore) : '—'}
                      </strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectAgency(agency);
                        setSearchQuery('');
                      }}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#285EE8] hover:bg-[#194BC8] text-white cursor-pointer"
                    >
                      Open Account 360
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ====================================================================
          2. INTERACTIVE U.S. TERRITORY MAP WITH STATE INTELLIGENCE DOSSIER
         ==================================================================== */}
      <section
        aria-label="Interactive U.S. Territory Map"
        className="pi-surface p-4 sm:p-5 space-y-4 sm:space-y-5"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-[#DFE6EF] dark:border-[#1E2D42]">
          <div>
            <h2 className="pi-section-heading flex items-center gap-2">
              <Compass className="w-5 h-5 text-[#285EE8] dark:text-blue-400 shrink-0" />
              <span>Interactive U.S. Territory Map</span>
            </h2>
            <p className="pi-supporting mt-0.5 hidden sm:block">
              Choose a state or region to review county coverage and available EMS and fire agency records.
            </p>
          </div>

          {/* Region Filter Segmented Control */}
          <div className="max-w-full overflow-x-auto">
            <div className="flex w-max items-center gap-1 bg-[#F5F7FA] dark:bg-[#16243A] p-1 rounded-xl border border-[#DFE6EF] dark:border-[#1E2D42]">
            {(['All', 'Northeast', 'Midwest', 'South', 'West'] as const).map((reg) => (
              <button
                key={reg}
                type="button"
                onClick={() => setRegionFilter(reg)}
                className={`min-h-10 px-3 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  regionFilter === reg
                    ? 'bg-white dark:bg-[#111C2D] text-[#14283F] dark:text-white shadow-2xs font-bold'
                    : 'text-[#53657B] dark:text-slate-400 hover:text-[#14283F] dark:hover:text-white'
                }`}
              >
                {reg}
              </button>
            ))}
            </div>
          </div>
        </div>

        {/* The Home screen keeps the interactive map as its only main content. */}
        <div className="grid grid-cols-1 gap-4 items-start">
          <div className="min-w-0 space-y-3">
            <div
              className="relative bg-[#E6EDF5] dark:bg-[#0B1728] rounded-xl border border-[#C5D2E1] dark:border-[#30445F] overflow-hidden p-3 sm:p-4 space-y-3"
              onMouseLeave={() => setHoveredStateCode(null)}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setHoveredStateCode(null);
                }
              }}
            >
              <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
                <label htmlFor="home-state-map-metric" className="flex flex-col gap-1 text-[11px] font-semibold text-[#53657B] dark:text-slate-300">
                  Shade states by
                  <select
                    id="home-state-map-metric"
                    data-testid="select-state-map-metric"
                    value={mapMetric}
                    onChange={(event) => setMapMetric(event.target.value as StateMapMetricKey)}
                    className="min-h-11 min-w-0 sm:min-w-[245px] rounded-lg border border-[#9AABC0] dark:border-[#425875] bg-white dark:bg-[#111C2D] px-3 text-sm font-semibold text-[#14283F] dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {STATE_MAP_METRICS.map((metric) => (
                      <option key={metric.key} value={metric.key}>{metric.label}</option>
                    ))}
                  </select>
                </label>
                <div className="flex items-center gap-1.5 self-start sm:self-auto rounded-lg border border-[#B7C6D8] dark:border-[#334A68] bg-white/85 dark:bg-[#111C2D]/90 p-1" role="group" aria-label="Map zoom controls">
                  <button
                    type="button"
                    data-testid="button-map-zoom-in"
                    onClick={() => setMapZoom((zoom) => Math.min(1.8, +(zoom + 0.2).toFixed(1)))}
                    disabled={mapZoom >= 1.8}
                    aria-label="Zoom in on map"
                    title="Zoom in"
                    className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md text-[#203A5A] dark:text-slate-100 hover:bg-[#EAF0F7] dark:hover:bg-[#20334D] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500"
                  >
                    <ZoomIn className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <span className="min-w-12 text-center font-mono text-[11px] font-bold tabular-nums text-[#334B68] dark:text-slate-300" aria-live="polite">{Math.round(mapZoom * 100)}%</span>
                  <button
                    type="button"
                    data-testid="button-map-zoom-out"
                    onClick={() => setMapZoom((zoom) => Math.max(1, +(zoom - 0.2).toFixed(1)))}
                    disabled={mapZoom <= 1}
                    aria-label="Zoom out on map"
                    title="Zoom out"
                    className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md text-[#203A5A] dark:text-slate-100 hover:bg-[#EAF0F7] dark:hover:bg-[#20334D] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500"
                  >
                    <ZoomOut className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    data-testid="button-map-zoom-reset"
                    onClick={() => setMapZoom(1)}
                    disabled={mapZoom === 1}
                    aria-label="Reset map zoom"
                    title="Reset zoom"
                    className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md text-[#203A5A] dark:text-slate-100 hover:bg-[#EAF0F7] dark:hover:bg-[#20334D] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-500"
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="flex flex-nowrap items-center gap-x-5 overflow-x-auto rounded-lg bg-white/90 dark:bg-[#111C2D]/90 border border-[#C7D3E1] dark:border-[#30445F] px-3.5 py-2.5">
                <span className="shrink-0 text-[11px] font-bold text-[#14283F] dark:text-slate-100">{activeMapMetric.label}</span>
                <span className="flex shrink-0 items-center gap-2 whitespace-nowrap text-[11px] font-medium text-[#334B68] dark:text-slate-300">
                  <span>{mapMetricValues.length ? formatStateMapValue(mapMetric, mapMetricMin) : '—'} · {activeMapPalette.lowLabel}</span>
                  <span className="h-3 w-24 rounded-full border border-[#526A7F]" style={{ background: getMapGradient(mapMetric) }} aria-hidden="true" />
                  <span>{mapMetricValues.length ? formatStateMapValue(mapMetric, mapMetricMax) : '—'} · {activeMapPalette.highLabel}</span>
                </span>
                {mapMetricValues.some((value) => value === 0) && (
                  <span className="flex shrink-0 items-center gap-2 whitespace-nowrap text-[11px] font-medium text-[#334B68] dark:text-slate-300">
                    <span className="inline-block h-4 w-4 rounded-sm border border-[#526A7F]" style={{ backgroundColor: interpolateStateFill(mapMetric, 0, mapMetricMin, mapMetricMax) }} aria-hidden="true" />
                    Reported 0
                  </span>
                )}
                <span className="flex shrink-0 items-center gap-2 whitespace-nowrap text-[11px] font-medium text-[#334B68] dark:text-slate-300">
                  <span className="inline-block h-4 w-4 rounded-sm border border-[#667B94] bg-[repeating-linear-gradient(135deg,#d9e2ec_0px,#d9e2ec_3px,#71849a_3px,#71849a_4px)] dark:bg-[repeating-linear-gradient(135deg,#25364b_0px,#25364b_3px,#8da0b7_3px,#8da0b7_4px)]" aria-hidden="true" />
                  Not reported
                </span>
                <span className="shrink-0 text-[10px] text-[#53657B] dark:text-slate-400">Hatch = missing</span>
              </div>

              <div className="flex flex-col gap-3">
              <div
                className="order-2 sm:order-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-xl bg-white dark:bg-[#111C2D] border border-[#DFE6EF] dark:border-[#1E2D42] px-3.5 py-3"
                aria-live="polite"
                aria-atomic="true"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="text-xs font-bold text-[#14283F] dark:text-white">
                      {mapReadoutState.state} ({mapReadoutState.code})
                    </span>
                    <span className="text-[10px] font-medium text-[#53657B] dark:text-slate-400">{activeMapMetric.label}</span>
                    <span className="text-sm font-bold tabular-nums text-[#1D4ED8] dark:text-blue-300">
                      {formatStateMapValue(mapMetric, mapReadoutMetric.value)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[10px] leading-4 text-[#53657B] dark:text-slate-400">
                    {mapReadoutMetric.coverage} · Period: {mapReadoutMetric.period}
                  </p>
                </div>
                {mapReadoutMetric.sourceAction !== 'reference-estimate' && <button
                  type="button"
                  onClick={() => handleMapSourceAction(hoverReadoutStateCode, mapReadoutMetric.sourceAction)}
                  className="min-h-9 shrink-0 self-start sm:self-center rounded-lg border border-blue-200 dark:border-blue-900/70 bg-blue-50 dark:bg-blue-950/40 px-3 text-[11px] font-semibold text-blue-800 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-950/70 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {mapReadoutMetric.sourceAction === 'zip-profiles'
                    ? 'View ZIP profile records'
                    : mapReadoutMetric.sourceAction === 'claims-import'
                      ? 'Open claim summary'
                      : 'Review agency records'}
                </button>}
              </div>

              <div className="order-1 sm:order-2 space-y-3">
              <p className="text-[10px] text-[#334B68] dark:text-slate-300 sm:hidden">
                Zoom in to inspect a state, then swipe to pan.
              </p>

              <div ref={mapViewportRef} className="overflow-auto overscroll-contain rounded-lg border border-[#BCCBDB] dark:border-[#30445F] bg-[#EAF0F6] dark:bg-[#0C192B]">
              <svg
                viewBox="0 0 920 500"
                className="block h-auto select-none"
                style={{ aspectRatio: '920 / 500', width: `${mapZoom * 100}%` }}
                role="group"
                aria-label={`Interactive United States map shaded by ${activeMapMetric.label}, zoom ${Math.round(mapZoom * 100)} percent`}
              >
                <defs>
                  <pattern id="home-map-grid" width="46" height="46" patternUnits="userSpaceOnUse">
                    <path d="M 46 0 L 0 0 0 46" fill="none" stroke="rgba(148, 163, 184, 0.12)" strokeWidth="1" />
                  </pattern>
                  <pattern id="home-map-missing-data" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
                    <rect width="7" height="7" fill="#D9E2EC" className="dark:fill-[#25364B]" />
                    <path d="M 0 0 L 0 7" stroke="#71849A" strokeWidth="2" className="dark:stroke-[#8DA0B7]" />
                  </pattern>
                </defs>
                <rect width="920" height="500" fill="url(#home-map-grid)" />

                {/* Alaska & Hawaii Cartographic Inset Frames */}
                <g>
                  <rect x="14" y="356" width="174" height="134" rx="10" fill="#FFFFFF" fillOpacity="0.85" stroke="#CBD5E1" strokeWidth="1.25" strokeDasharray="4 4" className="dark:fill-[#111C2D] dark:stroke-[#1E2D42]" />
                  <text x="24" y="373" fill="#64748B" fontSize="10" fontWeight="800" fontFamily="monospace">ALASKA (AK)</text>

                  <rect x="196" y="396" width="124" height="94" rx="10" fill="#FFFFFF" fillOpacity="0.85" stroke="#CBD5E1" strokeWidth="1.25" strokeDasharray="4 4" className="dark:fill-[#111C2D] dark:stroke-[#1E2D42]" />
                  <text x="206" y="413" fill="#64748B" fontSize="10" fontWeight="800" fontFamily="monospace">HAWAII (HI)</text>
                </g>

                {/* Layer 1: Authoritative U.S. State Boundary Polygons */}
                <g>
                  {Object.values(ALL_50_STATES_SUMMARIES).map((st) => {
                    const boundary = US_STATES_SVG_PATHS[st.code];
                    if (!boundary || !boundary.d) return null;

                    const isInRegion = regionFilter === 'All' || st.region === regionFilter;
                    const isSelected = selectedStateCode === st.code;
                    const isHovered = hoveredStateCode === st.code;
                    const countyCount = territoryEngine.getCountiesForState(st.code).length;
                    const datum = stateMapMetricsByCode[st.code][mapMetric];
                    const fillColor = hasReportedValue(datum.value)
                      ? interpolateStateFill(mapMetric, datum.value, mapMetricMin, mapMetricMax)
                      : 'url(#home-map-missing-data)';
                    const stateAriaLabel = `${st.state}. ${activeMapMetric.label}: ${formatStateMapValue(mapMetric, datum.value)}. ${datum.coverage}. Period: ${datum.period}${datum.claimScope ? `. Scope: ${datum.claimScope}. Definition: ${datum.denialDefinition}` : ''}${datum.source ? `. Source: ${datum.source}` : ''}`;

                    return (
                      <g key={`home-poly-${st.code}`} opacity={isInRegion ? 1 : 0.36}>
                        {isSelected && (
                          <path
                            d={boundary.d}
                            fill="none"
                            stroke="#F8FAFC"
                            strokeWidth="7"
                            strokeLinejoin="round"
                            pointerEvents="none"
                          />
                        )}
                        {isSelected && (
                          <path
                            d={boundary.d}
                            fill="none"
                            stroke="#D97706"
                            strokeWidth="4"
                            strokeLinejoin="round"
                            pointerEvents="none"
                          />
                        )}
                        <path
                          d={boundary.d}
                          fill={fillColor}
                          stroke={isSelected || isHovered ? '#14283F' : '#405A78'}
                          strokeWidth={isSelected ? 2.4 : isHovered ? 2 : 1.35}
                          strokeLinejoin="round"
                          onClick={() => handleStateClick(st.code)}
                          onMouseEnter={() => setHoveredStateCode(st.code)}
                          onFocus={() => setHoveredStateCode(st.code)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              handleStateClick(st.code);
                            }
                          }}
                          tabIndex={isInRegion ? 0 : -1}
                          role="button"
                          aria-pressed={isSelected}
                          aria-label={`${stateAriaLabel}. ${countyCount} counties. Select to explore.`}
                          className="cursor-pointer transition-[fill,stroke,opacity] duration-150 focus:outline-none focus:stroke-[#F59E0B] focus:stroke-[3px]"
                        >
                          <title>{`${st.state} (${st.code}) · ${activeMapMetric.label}: ${formatStateMapValue(mapMetric, datum.value)} · ${datum.coverage} · Period ${datum.period}${datum.claimScope ? ` · ${datum.claimScope} · ${datum.denialDefinition}` : ''}${datum.source ? ` · ${datum.source}` : ''} · ${countyCount} counties`}</title>
                        </path>
                      </g>
                    );
                  })}
                </g>

                {/* Layer 2: Interior State Labels */}
                <g>
                  {Object.values(ALL_50_STATES_SUMMARIES).map((st) => {
                    const isCalloutState = EAST_COAST_CALLOUT_STATES.some((c) => c.code === st.code);
                    if (isCalloutState) return null;

                    const boundary = US_STATES_SVG_PATHS[st.code];
                    if (!boundary) return null;

                    const isInRegion = regionFilter === 'All' || st.region === regionFilter;
                    const isSelected = selectedStateCode === st.code;
                    const isHovered = hoveredStateCode === st.code;
                    const datum = stateMapMetricsByCode[st.code][mapMetric];
                    return (
                      <g
                        key={`home-lbl-${st.code}`}
                        transform={`translate(${boundary.labelX}, ${boundary.labelY})`}
                        pointerEvents="none"
                        opacity={isInRegion ? 1 : 0.4}
                      >
                        <rect
                          x="-13"
                          y="-9"
                          width="26"
                          height="18"
                          rx="5"
                          fill={isSelected ? '#FDE68A' : '#F8FAFC'}
                          fillOpacity="0.98"
                          stroke={isSelected ? '#9A4D08' : isHovered ? '#203A5A' : '#405A78'}
                          strokeWidth={isSelected ? 2 : isHovered ? 1.6 : 1.2}
                        />
                        <text
                          textAnchor="middle"
                          dy="3.5"
                          fill={isSelected ? '#422006' : '#14283F'}
                          fontSize="10"
                          fontWeight="800"
                          fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                        >
                          {st.code}
                        </text>
                      </g>
                    );
                  })}
                </g>
              </svg>
              </div>

              {/* East Coast Compact Callout Buttons */}
              <div className="pt-2 border-t border-[#DFE6EF] dark:border-[#1E2D42] flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-[11px] font-semibold text-[#53657B] dark:text-slate-400 mr-1">
                  Small-state shortcuts:
                </span>
                {EAST_COAST_CALLOUT_STATES.map((c) => {
                  const isSelected = selectedStateCode === c.code;
                  const datum = stateMapMetricsByCode[c.code][mapMetric];
                  const chipFill = hasReportedValue(datum.value)
                    ? interpolateStateFill(mapMetric, datum.value, mapMetricMin, mapMetricMax)
                    : '#E2E8F0';
                  return (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => handleStateClick(c.code)}
                      onMouseEnter={() => setHoveredStateCode(c.code)}
                      onFocus={() => setHoveredStateCode(c.code)}
                      aria-pressed={isSelected}
                      aria-label={`${ALL_50_STATES_SUMMARIES[c.code].state}: ${formatStateMapValue(mapMetric, datum.value)}`}
                      style={{
                        backgroundColor: chipFill,
                        color: hasReportedValue(datum.value) ? readableTextForFill(chipFill) : '#334155',
                        outline: isSelected ? '2px solid #D97706' : undefined,
                        outlineOffset: isSelected ? '1px' : undefined,
                      }}
                      className="min-h-10 min-w-10 px-2 rounded-md border border-[#344F70] dark:border-[#8298B2] text-[12px] font-bold font-mono transition-[outline,filter] hover:brightness-95 focus:outline focus:outline-2 focus:outline-amber-500"
                    >
                      {c.code}
                    </button>
                  );
                })}
              </div>
              </div>
              </div>
            </div>
          </div>

          <div className="hidden">
            <div className="p-4 sm:p-5 rounded-xl bg-[#F5F7FA] dark:bg-[#16243A] border border-[#DFE6EF] dark:border-[#1E2D42] space-y-3">
              <div className="flex items-center justify-between border-b border-[#DFE6EF] dark:border-[#1E2D42] pb-3">
                <div className="min-w-0">
                  <span className="text-[10px] font-bold tracking-wider uppercase text-[#285EE8] dark:text-blue-400 block">
                    {activeStateSummary.region} Region
                  </span>
                  <h3 className="font-display font-bold text-lg text-[#14283F] dark:text-white truncate">
                    {activeStateSummary.state} ({activeStateSummary.code})
                  </h3>
                </div>
                <span className="px-2.5 py-1 rounded-lg text-xs font-bold pi-data-number bg-[#285EE8] text-white shadow-xs">
                  {displayStateCode}
                </span>
              </div>

                <div className="rounded-lg border border-blue-200 dark:border-blue-900/70 bg-blue-50/80 dark:bg-blue-950/30 p-3">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-blue-800 dark:text-blue-300">
                    Selected map layer
                  </span>
                  <div className="mt-0.5 flex items-baseline justify-between gap-2">
                    <span className="min-w-0 text-xs font-semibold text-[#14283F] dark:text-slate-200">
                      {activeMapMetric.label}
                    </span>
                    <span className="shrink-0 text-lg font-bold tabular-nums text-[#14283F] dark:text-white">
                      {formatStateMapValue(mapMetric, stateMapMetricsByCode[displayStateCode][mapMetric].value)}
                    </span>
                  </div>
                  <p className="mt-1 text-[10px] leading-4 text-[#53657B] dark:text-slate-400">
                    {stateMapMetricsByCode[displayStateCode][mapMetric].coverage}
                  </p>
                  <p className="text-[10px] leading-4 text-[#53657B] dark:text-slate-400">
                    Period: {stateMapMetricsByCode[displayStateCode][mapMetric].period}
                  </p>
                  {mapMetric === 'state-claims-denial' && stateMapMetricsByCode[displayStateCode][mapMetric].value !== null && (
                    <div className="text-[10px] leading-4 text-[#53657B] dark:text-slate-400">
                      <p>
                        Scope: {stateMapMetricsByCode[displayStateCode][mapMetric].claimScope} · Definition: {stateMapMetricsByCode[displayStateCode][mapMetric].denialDefinition}
                      </p>
                      {stateMapMetricsByCode[displayStateCode][mapMetric].sourceUrl ? (
                        <a
                          href={stateMapMetricsByCode[displayStateCode][mapMetric].sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-semibold text-blue-800 dark:text-blue-300 underline underline-offset-2"
                        >
                          Source: {stateMapMetricsByCode[displayStateCode][mapMetric].source}
                        </a>
                      ) : (
                        <p>
                          Source: {stateMapMetricsByCode[displayStateCode][mapMetric].source}
                        </p>
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => handleMapSourceAction(
                      displayStateCode,
                      stateMapMetricsByCode[displayStateCode][mapMetric].sourceAction,
                    )}
                    className="mt-1 min-h-8 rounded-md px-1 text-[10px] font-semibold text-blue-800 dark:text-blue-300 underline underline-offset-2 hover:bg-blue-100 dark:hover:bg-blue-900/50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {stateMapMetricsByCode[displayStateCode][mapMetric].sourceAction === 'zip-profiles'
                      ? 'View ZIP profile records'
                      : stateMapMetricsByCode[displayStateCode][mapMetric].sourceAction === 'claims-import'
                        ? 'Open claim summary'
                        : 'Review agency records'}
                  </button>
                </div>

              {/* State Key Statistics */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-3 rounded-lg bg-white dark:bg-[#111C2D] border border-[#DFE6EF] dark:border-[#1E2D42]">
                  <span className="text-[#53657B] dark:text-slate-400 block text-[11px]">
                    Counties
                  </span>
                  <span className="font-semibold text-[#14283F] dark:text-white text-base pi-metric-card">
                    {formatInteger(stateStats.countiesCount)}
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-white dark:bg-[#111C2D] border border-[#DFE6EF] dark:border-[#1E2D42]">
                  <span className="text-[#53657B] dark:text-slate-400 block text-[11px]">
                    Directory records
                  </span>
                  <span className="font-semibold text-[#285EE8] dark:text-blue-400 text-base pi-metric-card">
                    {formatInteger(stateStats.count)} entries
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-white dark:bg-[#111C2D] border border-[#DFE6EF] dark:border-[#1E2D42]">
                  <span className="text-[#53657B] dark:text-slate-400 block text-[11px]">
                    Modeled avg PulseIQ
                  </span>
                  <span className="font-semibold text-[#14283F] dark:text-white text-base pi-metric-card">
                    {stateStats.avgPulseIq === null ? 'Not available' : formatScore(stateStats.avgPulseIq)}
                  </span>
                  <span data-testid={`text-pulseiq-coverage-${displayStateCode}`} className="text-[10px] text-[#53657B] dark:text-slate-500 block">
                    {formatInteger(stateStats.pulseIqDataCount)} of {formatInteger(stateStats.count)} agency records
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-white dark:bg-[#111C2D] border border-[#DFE6EF] dark:border-[#1E2D42]">
                  <span className="text-[#53657B] dark:text-slate-400 block text-[11px]">
                    State ambulance claim denial rate
                  </span>
                  <span className="font-semibold text-[#14283F] dark:text-white text-base pi-metric-card tabular-nums">
                    {formatStateMapValue(
                      'state-claims-denial',
                      stateMapMetricsByCode[displayStateCode]['state-claims-denial'].value,
                    )}
                  </span>
                  <span className="text-[10px] text-[#53657B] dark:text-slate-500 block">
                    {stateMapMetricsByCode[displayStateCode]['state-claims-denial'].coverage}
                  </span>
                  <span className="text-[10px] text-[#53657B] dark:text-slate-500 block">
                    Period: {stateMapMetricsByCode[displayStateCode]['state-claims-denial'].period}
                  </span>
                  {stateMapMetricsByCode[displayStateCode]['state-claims-denial'].value !== null && (
                    <details className="mt-1 text-[10px] leading-4 text-[#53657B] dark:text-slate-400">
                      <summary className="cursor-pointer font-semibold text-blue-700 dark:text-blue-300">Scope &amp; source</summary>
                      <p>Scope: {stateMapMetricsByCode[displayStateCode]['state-claims-denial'].claimScope}</p>
                      <p>Definition: {stateMapMetricsByCode[displayStateCode]['state-claims-denial'].denialDefinition}</p>
                      {stateMapMetricsByCode[displayStateCode]['state-claims-denial'].sourceUrl ? (
                        <a
                          href={stateMapMetricsByCode[displayStateCode]['state-claims-denial'].sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline underline-offset-2"
                        >
                          {stateMapMetricsByCode[displayStateCode]['state-claims-denial'].source}
                        </a>
                      ) : (
                        <p>Source: {stateMapMetricsByCode[displayStateCode]['state-claims-denial'].source}</p>
                      )}
                    </details>
                  )}
                  {stateZipDenialSummary && (
                    <span className="text-[10px] text-[#53657B] dark:text-slate-500 block">
                      ZIP-profile average: {stateZipDenialSummary.ratePct.toFixed(1)}% · not a state claims rate
                    </span>
                  )}
                </div>
              </div>

              <div
                id="state-zip-profile-values"
                data-testid={`zip-denial-profile-values-${displayStateCode}`}
                className="rounded-lg border border-[#DFE6EF] dark:border-[#1E2D42] bg-white dark:bg-[#111C2D] p-3 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-[#14283F] dark:text-slate-200">
                    ZIP-profile denial values
                  </span>
                  <span className="text-[10px] text-[#53657B] dark:text-slate-400">
                    {stateZipDenialProfiles.length} source-backed entries
                  </span>
                </div>
                {stateZipDenialProfiles.length > 0 ? (
                  <>
                    <div className="space-y-1.5">
                      {stateZipDenialProfiles.map((record) => (
                        <div
                          key={`${record.fipsCounty}-${record.zipCode}`}
                          className="rounded-md bg-slate-50 dark:bg-slate-800 px-2.5 py-2"
                        >
                          <a
                            href={record.medicareDenialRateSourceUrl!}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] font-semibold text-blue-800 dark:text-blue-300 underline underline-offset-2"
                          >
                            {record.county} · {record.zipCode} · {record.medicareDenialRate}%
                          </a>
                          <div className="mt-0.5 text-[10px] text-[#53657B] dark:text-slate-400">
                            {record.medicareDenialRateReportingPeriod} · {record.medicareDenialClaimScope}
                          </div>
                        </div>
                      ))}
                    </div>
                    {stateZipDenialSummary && (
                      <p className="text-[10px] leading-4 text-[#53657B] dark:text-slate-400">
                        The state ZIP-profile average is an unweighted mean for one reporting period and claim scope. It is not a state claims denial rate.
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p className="text-[10px] leading-4 text-[#53657B] dark:text-slate-400">
                      No complete state or county ambulance claim-denial totals are available from the public CMS files. CMS&apos;s PSPS file has denied service counts by carrier/locality and HCPCS, but suppresses cells under 11 and has no NPI or county FIPS; it cannot produce complete state, county, or provider claim rates.
                    </p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px]">
                      <a
                        href="https://data.cms.gov/summary-statistics-on-use-and-payments/physiciansupplier-procedure-summary"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-blue-800 dark:text-blue-300 underline underline-offset-2"
                      >
                        CMS PSPS denied-service dataset
                      </a>
                      <a
                        href="https://data.cms.gov/summary-statistics-on-use-and-payments/physiciansupplier-procedure-summary/api-docs"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-blue-800 dark:text-blue-300 underline underline-offset-2"
                      >
                        CMS PSPS API
                      </a>
                      <a
                        href="https://www.cms.gov/medicare/payment/fee-schedules/ambulance/ambulance-fee-schedule-public-use-files"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-blue-800 dark:text-blue-300 underline underline-offset-2"
                      >
                        CMS ambulance ZIP/payment files
                      </a>
                      <a
                        href="https://data.cms.gov/summary-statistics-on-use-and-payments/program-integrity-market-saturation-by-type-of-service/market-saturation-utilization-state-county"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-blue-800 dark:text-blue-300 underline underline-offset-2"
                      >
                        CMS paid-claim county data
                      </a>
                    </div>
                  </>
                )}
              </div>

              {/* Apparatus Fleet & Grant Funding Overview */}
              <div className="space-y-2 text-xs border-t border-[#DFE6EF] dark:border-[#1E2D42] pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-[#53657B] dark:text-slate-400">Estimated ambulances:</span>
                  <span className="font-medium text-[#14283F] dark:text-white pi-data-number">
                    {stateStats.totalAmbulances === null
                      ? 'Not available'
                      : `${formatInteger(stateStats.totalAmbulances)} units`}
                  </span>
                </div>
                <div data-testid={`text-ambulance-coverage-${displayStateCode}`} className="text-[10px] text-[#53657B] dark:text-slate-500 text-right">
                  {formatInteger(stateStats.ambulanceDataCount)} of {formatInteger(stateStats.count)} agency records
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#53657B] dark:text-slate-400">Estimated fire engines:</span>
                  <span className="font-medium text-[#14283F] dark:text-white pi-data-number">
                    {stateStats.totalFireEngines === null
                      ? 'Not available'
                      : `${formatInteger(stateStats.totalFireEngines)} apparatus`}
                  </span>
                </div>
                <div data-testid={`text-fire-engine-coverage-${displayStateCode}`} className="text-[10px] text-[#53657B] dark:text-slate-500 text-right">
                  {formatInteger(stateStats.fireEngineDataCount)} of {formatInteger(stateStats.count)} agency records
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#53657B] dark:text-slate-400">Estimated Medicare allowed:</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400 pi-data-number">
                    {stateStats.medicareAllowed === null
                      ? 'Not available'
                      : formatCurrency(stateStats.medicareAllowed)}
                  </span>
                </div>
                <div data-testid={`text-medicare-allowed-coverage-${displayStateCode}`} className="text-[10px] text-[#53657B] dark:text-slate-500 text-right">
                  {formatInteger(stateStats.medicareAllowedDataCount)} of {formatInteger(stateStats.count)} agency records
                </div>
                <p className="text-[10px] leading-4 text-slate-500 dark:text-slate-400">
                  CMS PSPS contains aggregate denied-service counts, not unique provider claims; public cells under 11 are masked. It has no NPI or county FIPS, so it cannot support complete state, county, or individual-provider claim rates.
                </p>
              </div>

              {/* Action Buttons: Navigate into State or Accounts */}
              <div className="space-y-2 pt-2">
                <button
                  type="button"
                  onClick={() => handleStateClick(displayStateCode)}
                  className="w-full h-10 px-4 rounded-xl bg-[#285EE8] hover:bg-[#194BC8] text-white text-xs font-bold transition-all shadow-md cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>Explore {activeStateSummary.state} Territory</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => onNavigateTab('queue')}
                  className="w-full h-9 px-4 rounded-xl bg-white dark:bg-[#111C2D] hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-[#DFE6EF] dark:border-[#1E2D42] text-xs font-semibold transition-colors cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <Building2 className="w-3.5 h-3.5 text-[#285EE8]" />
                  <span>View Accounts in Discovery Queue</span>
                </button>
              </div>
            </div>

            {/* Quick Popular Territory Chips */}
            <div className="p-4 rounded-xl bg-white dark:bg-[#111C2D] border border-[#DFE6EF] dark:border-[#1E2D42] space-y-2">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                Popular Jurisdictions
              </span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { code: 'IL', name: 'Illinois' },
                  { code: 'TX', name: 'Texas' },
                  { code: 'FL', name: 'Florida' },
                  { code: 'CA', name: 'California' },
                  { code: 'OH', name: 'Ohio' },
                  { code: 'PA', name: 'Pennsylvania' }
                ].map((st) => (
                  <button
                    key={st.code}
                    type="button"
                    onClick={() => handleStateClick(st.code)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      selectedStateCode === st.code
                        ? 'bg-[#285EE8] text-white shadow-xs'
                        : 'bg-[#F5F7FA] dark:bg-[#16243A] text-slate-700 dark:text-slate-200 border border-[#DFE6EF] dark:border-[#1E2D42] hover:border-[#285EE8]'
                    }`}
                  >
                    {st.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ====================================================================
          3. SPECIALIZED GEOSPATIAL TOOLS & INTELLIGENCE RESOURCES (KEPT)
         ==================================================================== */}
      <section
        aria-label="Specialized Geospatial Tools & Intelligence Resources"
        className="hidden"
      >
        <div className="flex items-center justify-between pb-3 border-b border-[#DFE6EF] dark:border-[#1E2D42]">
          <div>
            <h2 className="pi-section-heading">
              Specialized Geospatial Tools &amp; Intelligence Resources
            </h2>
            <p className="pi-supporting mt-0.5">
              Direct 1-click launch to GIS heatmaps, live maps, grant registries, clinical TCO, and 3D apparatus studios.
            </p>
          </div>
          {onOpenCommandPalette && (
            <button
              type="button"
              onClick={onOpenCommandPalette}
              className="text-xs font-semibold text-[#285EE8] dark:text-blue-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
            >
              <span>Command Palette (⌘K)</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {[
            {
              id: 'map',
              title: 'GIS Fleet & Acuity Heatmap',
              desc: '50-State choropleth, hexbin density, competitor fleet aging & OHCA cardiac resuscitations',
              icon: Activity,
              badge: 'Geospatial'
            },
            {
              id: 'google_maps',
              title: 'Google Maps Live Explorer',
              desc: 'Interactive live Google Maps with GPS Near Me, hospitals, cath labs & fire stations',
              icon: MapPin,
              badge: 'Live Maps'
            },
            {
              id: 'grants',
              title: 'FEMA AFG & SAFER Grants',
              desc: 'OpenFEMA API v2 awards tracker, equipment grant payouts & fiscal liquidity',
              icon: Award,
              badge: 'Liquidity'
            },
            {
              id: 'contracts',
              title: 'Contracts & Expirations',
              desc: 'Competitor defib replacement window calendar and renewal cliff timelines',
              icon: Clock,
              badge: 'Procurement'
            },
            {
              id: 'knowledge',
              title: 'Clinical & TCO Knowledge Hub',
              desc: '5-Year TCO engine, FDA MAUDE adverse event recalls & cooperative contracts',
              icon: Layers,
              badge: 'Clinical'
            },
            {
              id: '3d_studio',
              title: '3D Apparatus Studio',
              desc: 'Interactive 3D emergency ambulance & fire pumper apparatus viewer with lighting',
              icon: Box,
              badge: 'Three.js'
            },
            {
              id: 'claims',
              title: 'Medicare Claims & Payer Mix',
              desc: 'CMS Ground Ambulance Cost Data (GADCS) and Medicare payment references',
              icon: DollarSign,
              badge: 'CMS Data'
            },
            {
              id: 'gateway',
              title: 'Federal Data Gateway',
              desc: 'Direct CMS NPPES NPI Registry v2.1 & OpenFEMA verification gateway',
              icon: Database,
              badge: 'Verified API'
            }
          ].map((tool) => {
            const ToolIcon = tool.icon;
            return (
              <button
                key={tool.id}
                type="button"
                onClick={() => onNavigateTab(tool.id)}
                className="p-3.5 rounded-xl bg-[#F5F7FA] dark:bg-[#16243A] hover:bg-white dark:hover:bg-[#111C2D] border border-[#DFE6EF] dark:border-[#1E2D42] hover:border-[#285EE8] text-left transition-all cursor-pointer group shadow-2xs"
              >
                <div className="flex items-center justify-between">
                  <span className="p-1.5 rounded-lg bg-white dark:bg-[#111C2D] border border-[#DFE6EF] dark:border-slate-700 text-[#285EE8] shadow-2xs">
                    <ToolIcon className="w-4 h-4" />
                  </span>
                  <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-200/60 dark:bg-slate-800 px-2 py-0.5 rounded">
                    {tool.badge}
                  </span>
                </div>
                <div className="text-xs font-bold text-[#14283F] dark:text-white mt-2.5 group-hover:text-[#285EE8] transition-colors">
                  {tool.title}
                </div>
                <p className="text-[11px] text-[#53657B] dark:text-slate-400 mt-1 leading-snug line-clamp-2">
                  {tool.desc}
                </p>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
};
