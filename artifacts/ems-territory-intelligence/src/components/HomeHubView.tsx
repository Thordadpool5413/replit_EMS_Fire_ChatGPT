import {useNationalSourceDirectory} from '../hooks/useNationalSourceDirectory';
import {NationalSourceDirectory} from './NationalSourceDirectory';
import type { DirectoryLoadStatus } from '../services/agencyDirectoryLoader';
import {ALL_NATIONWIDE_COUNTIES} from '../data/allCountiesDatabase';
import {WorkspaceIcon} from './design/WorkspaceIcon';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { hasRecordedEquipmentValue } from '../utils/equipmentPresence';
import { useIsMobile } from '../hooks/use-mobile';
import { Agency } from '../types';
import {
  Compass,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  SlidersHorizontal,
  Search,
  Layers,
  MapPin,
  ChevronDown,
} from 'lucide-react';
import { ALL_50_STATES_SUMMARIES } from '../data/nationalGeographicData';
import { US_STATES_SVG_PATHS, EAST_COAST_CALLOUT_STATES } from '../data/usStatesSvgPaths';
import { ACS_COUNTY_METRICS, ACS_COUNTY_SOURCE } from '../data/acsCountyData';
import { buildAcsStateRollups } from '../data/acsCountyRollups';
import { territoryEngine } from '../services/territoryIntelligenceEngine';
import { formatInteger, formatScore } from '../utils/numberFormatting';
import { DataLabel, inferDataLabelKind } from './DataLabel';
import { HomeDirectoryStatus } from './HomeDirectoryStatus';
import { HomeMapUnavailableFallback } from './HomeMapFallbacks';

const HOME_MAP_TRANSLATE_X = 48;
// Tight frame around the drawn content (states, AK/HI insets, east-coast callouts)
// in translated SVG units, so no internal letterbox margin is rendered.
const HOME_MAP_VIEWBOX = { x: 40, y: 0, width: 872, height: 494 } as const;
const HOME_MAP_GEOMETRY_SCALE = 1.08;
const HOME_MAP_SCALE_ORIGIN_X = 460;
const HOME_MAP_SCALE_ORIGIN_Y = 250;
const HOME_MAP_GEOMETRY_TRANSFORM =
  `translate(${HOME_MAP_SCALE_ORIGIN_X} ${HOME_MAP_SCALE_ORIGIN_Y}) ` +
  `scale(${HOME_MAP_GEOMETRY_SCALE}) ` +
  `translate(${-HOME_MAP_SCALE_ORIGIN_X} ${-HOME_MAP_SCALE_ORIGIN_Y})`;
const isHomeMapInsetState = (stateCode: string) => stateCode === 'AK' || stateCode === 'HI';
const getHomeMapGeometryPoint = (x: number, y: number, scaleGeometry: boolean) => ({
  x: scaleGeometry ? HOME_MAP_SCALE_ORIGIN_X + (x - HOME_MAP_SCALE_ORIGIN_X) * HOME_MAP_GEOMETRY_SCALE : x,
  y: scaleGeometry ? HOME_MAP_SCALE_ORIGIN_Y + (y - HOME_MAP_SCALE_ORIGIN_Y) * HOME_MAP_GEOMETRY_SCALE : y,
});

const hasReportedValue = (value: number | null | undefined): value is number =>
  value != null && Number.isFinite(value);

const STATE_MAP_METRICS = [
  { key: 'cardiac-survival', label: 'Cardiac survival estimate (%)' },
  { key: 'source-listings', label: 'National registry listings' },
  { key: 'agency-records', label: 'Agency directory records' },
  { key: 'ambulances', label: 'Agency-profile ambulance total' },
  { key: 'fire-engines', label: 'Agency-profile fire-engine total' },
  { key: 'pulseiq', label: 'PulseIQ estimate · modeled average' },
  { key: 'scene-transit', label: 'EMS transit estimate (minutes)' },
  { key: 'acs-population', label: 'ACS population · county sum' },
  { key: 'acs-age65-share', label: 'ACS residents age 65+ (%)' },
  { key: 'acs-poverty-rate', label: 'ACS poverty rate (%)' },
  { key: 'acs-county-income-median', label: 'Median of county incomes (not state median)' },
] as const;

type StateMapMetricKey =
  (typeof STATE_MAP_METRICS)[number]['key'];

const DEFAULT_STATE_MAP_METRIC: StateMapMetricKey = 'cardiac-survival';
const MAP_METRIC_DEFAULT_MIGRATION_KEY = 'metric-default-migrated-v1';

type MapColorScheme = 'standard' | 'colorblind-safe';
type StateMapPalette = { stops: string[]; lowLabel: string; highLabel: string };

type StateMapRegion = 'All' | 'Northeast' | 'Midwest' | 'South' | 'West';

const readMapPreference = (key: string, fallback: string) => {
  try {
    if (typeof window === 'undefined') return fallback;
    return window.sessionStorage.getItem(`ems-map-${key}`) ?? fallback;
  } catch {
    return fallback;
  }
};

const saveMapPreference = (key: string, value: string) => {
  try {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(`ems-map-${key}`, value);
  } catch {
    // Keep the map usable when browser storage is unavailable.
  }
};

interface StateStats {
  count: number;
  avgPulseIq: number | null;
  pulseIqDataCount: number;
  totalAmbulances: number | null;
  ambulanceDataCount: number;
  totalFireEngines: number | null;
  fireEngineDataCount: number;
}

interface StateMapMetricDatum {
  value: number | null;
  coverage: string;
  period: string;
  sourceAction: 'agency-records' | 'zip-profiles' | 'claims-import' | 'reference-estimate' | 'census-acs';
  deniedClaims?: number;
  adjudicatedClaims?: number;
  claimScope?: string;
  denialDefinition?: string;
  source?: string;
  sourceUrl?: string;
  sourceReference?: string;
  coverageCount?: number;
  expectedCount?: number;
  partialValue?: number | null;
}

const formatStateMapValue = (metric: StateMapMetricKey, value: number | null) => {
  if (value === null) return 'Not reported';
  if (metric === 'cardiac-survival' || metric === 'acs-age65-share' || metric === 'acs-poverty-rate') return `${value.toFixed(1)}%`;
  if (metric === 'scene-transit') return `${value.toFixed(1)} min`;
  if (metric === 'pulseiq') return formatScore(value);
  if (metric === 'acs-county-income-median') return `$${Math.round(value).toLocaleString()}`;
  return formatInteger(value);
};

const MAP_PALETTES: Record<StateMapMetricKey, StateMapPalette> = {
  'source-listings': { stops: ['#D8F0FF', '#91D2FF', '#45A9F2', '#1674C9', '#084783'], lowLabel: 'Fewer', highLabel: 'More' },
  'agency-records': { stops: ['#D8F0FF', '#91D2FF', '#45A9F2', '#1674C9', '#084783'], lowLabel: 'Fewer', highLabel: 'More' },
  ambulances: { stops: ['#D8F0FF', '#91D2FF', '#45A9F2', '#1674C9', '#084783'], lowLabel: 'Fewer', highLabel: 'More' },
  'fire-engines': { stops: ['#D8F0FF', '#91D2FF', '#45A9F2', '#1674C9', '#084783'], lowLabel: 'Fewer', highLabel: 'More' },
  pulseiq: { stops: ['#F1E5FF', '#D0AEFF', '#A56CF4', '#753ED1', '#462080'], lowLabel: 'Lower priority', highLabel: 'Higher priority' },
  'cardiac-survival': { stops: ['#C62835', '#EC6B3D', '#F1C64B', '#88BC4A', '#198A4C'], lowLabel: 'Lower', highLabel: 'Higher · stronger' },
  'scene-transit': { stops: ['#168958', '#63B85D', '#E0C446', '#F08C35', '#C93535'], lowLabel: 'Shorter', highLabel: 'Longer · concerning' },
  'acs-population': { stops: ['#D8EEFF', '#9ACFFF', '#58A9ED', '#247BC7', '#0B4C8C'], lowLabel: 'Lower', highLabel: 'Higher' },
  'acs-age65-share': { stops: ['#D8EEFF', '#9ACFFF', '#58A9ED', '#247BC7', '#0B4C8C'], lowLabel: 'Lower share', highLabel: 'Higher share' },
  'acs-poverty-rate': { stops: ['#FFF0B8', '#FFD166', '#FFA63B', '#EE702F', '#BD342E'], lowLabel: 'Lower rate', highLabel: 'Higher rate' },
  'acs-county-income-median': { stops: ['#E9DFFF', '#C5A8FF', '#9670EB', '#6844C3', '#3D2387'], lowLabel: 'Lower', highLabel: 'Higher' },
};

// A colorblind-safe blue ramp stays legible on the white map surface.
const COLORBLIND_SAFE_STOPS = ['#DCEEFF', '#A5CFF2', '#6EAADE', '#397BB6', '#164D7E'];

const isQualityMapMetric = (metric: StateMapMetricKey) =>
  metric === 'cardiac-survival' ||
  metric === 'scene-transit' ||
  metric.startsWith('acs-');

const getMapPalette = (metric: StateMapMetricKey, scheme: MapColorScheme): StateMapPalette => {
  const standard = MAP_PALETTES[metric];
  if (scheme !== 'colorblind-safe' || !isQualityMapMetric(metric)) return standard;
  return {
    ...standard,
    stops: COLORBLIND_SAFE_STOPS,
  };
};

const getMapGradient = (palette: StateMapPalette) => {
  const step = 100 / palette.stops.length;
  const segments = palette.stops.map((color, index) =>
    `${color} ${(index * step).toFixed(2)}%, ${color} ${((index + 1) * step).toFixed(2)}%`,
  );
  return `linear-gradient(to right, ${segments.join(', ')})`;
};

const readableTextForFill = (hexColor: string) => {
  const channels = hexColor.match(/[0-9a-f]{2}/gi)?.map((channel) => parseInt(channel, 16)) ?? [219, 234, 254];
  const [red, green, blue] = channels.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue > 0.2 ? '#10233A' : '#FFFFFF';
};

interface HomeHubViewProps {
  directoryLoad?: DirectoryLoadStatus;
  onRetryDirectory?: () => void;
  agencies: Agency[];
  onNavigateTab: (tab: string) => void;
  onClearGeography?: () => void;
  globalCategory: 'all' | 'ems' | 'fire';
  globalState?: string;
  globalCounty?: string;
  globalCity?: string;
  onSelectState?: (stateCode: string) => void;
}

export const HomeHubView: React.FC<HomeHubViewProps> = ({
  directoryLoad,
  onRetryDirectory,
  agencies,
  onNavigateTab,
  onClearGeography,
  globalCategory,
  globalState,
  globalCounty,
  globalCity,
  onSelectState
}) => {
  const isPhone = useIsMobile();
  const {manifest:sourceDirectory}=useNationalSourceDirectory();
  const registryDialog=useRef<HTMLDialogElement>(null);
  const [registryOpen,setRegistryOpen]=useState(false);
  const [mapOptionsOpen, setMapOptionsOpen] = useState(false);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [stateSearch, setStateSearch] = useState('');
  const detailDialog = useRef<HTMLDialogElement>(null);
  const [detailCode, setDetailCode] = useState<string | null>(null);
  const [compactStatesOnly, setCompactStatesOnly] = useState(false);
  const statePicker = useRef<HTMLDialogElement>(null);
  const stateSearchInput = useRef<HTMLInputElement>(null);
  useEffect(()=>{if(registryOpen)registryDialog.current?.showModal();else registryDialog.current?.close();},[registryOpen]);
  const [selectedStateCode, setSelectedStateCode] = useState<string>(() => {
    const code = globalState?.trim().toUpperCase();
    return code && code !== 'ALL' && ALL_50_STATES_SUMMARIES[code]
      ? code
      : 'all';
  });
  const [hoveredStateCode, setHoveredStateCode] = useState<string | null>(null);
  const [focusedStateCode, setFocusedStateCode] = useState<string | null>(null);
  const [regionFilter, setRegionFilter] = useState<StateMapRegion>(() => {
    const saved = readMapPreference('region', 'All');
    return ['All', 'Northeast', 'Midwest', 'South', 'West'].includes(saved) ? saved as StateMapRegion : 'All';
  });
  const [mapMetric, setMapMetric] = useState<StateMapMetricKey>(() => {
    const saved = readMapPreference('metric', DEFAULT_STATE_MAP_METRIC);
    const defaultMigrationComplete = readMapPreference(MAP_METRIC_DEFAULT_MIGRATION_KEY, 'false') === 'true';
    if (!defaultMigrationComplete && saved === 'source-listings') return DEFAULT_STATE_MAP_METRIC;
    return STATE_MAP_METRICS.some((metric) => metric.key === saved)
      ? saved as StateMapMetricKey
      : DEFAULT_STATE_MAP_METRIC;
  });
  const [mapColorScheme, setMapColorScheme] = useState<MapColorScheme>(() => {
    const saved = readMapPreference('palette', 'standard');
    return saved === 'colorblind-safe' ? saved : 'standard';
  });
  const [mapZoom, setMapZoom] = useState(() => {
    const saved = Number(readMapPreference('zoom', '1'));
    return Number.isFinite(saved) ? Math.max(1, Math.min(1.8, saved)) : 1;
  });
  const mapViewportRef = useRef<HTMLDivElement>(null);
  const hasInitializedMapRef = useRef(false);

  useEffect(() => {
    if (readMapPreference(MAP_METRIC_DEFAULT_MIGRATION_KEY, 'false') === 'true') return;
    const savedMetric = readMapPreference('metric', '');
    if (!savedMetric || savedMetric === 'source-listings') {
      saveMapPreference('metric', mapMetric);
    }
    saveMapPreference(MAP_METRIC_DEFAULT_MIGRATION_KEY, 'true');
  }, [mapMetric]);

  // Filter agency figures by the existing provider scope (All / EMS / Fire).
  // Equipment-vendor filters remain available in the county map, not the U.S. map.
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

  useEffect(() => {
    const code = globalState?.trim().toUpperCase();
    if (code && code !== 'ALL' && ALL_50_STATES_SUMMARIES[code]) {
      setSelectedStateCode(code);
    } else {
      setSelectedStateCode('all');
    }
  }, [globalState]);

  const hasNationwideMapGeometry = Object.keys(US_STATES_SVG_PATHS).length >= 50;


  const acsStateRollupsByCode = useMemo(
    () =>
      buildAcsStateRollups(
        ALL_NATIONWIDE_COUNTIES.map(({ countyFips, stateCode }) => ({ countyFips, stateCode })),
        ACS_COUNTY_METRICS,
        Object.keys(ALL_50_STATES_SUMMARIES),
      ),
    [],
  );
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

        for (const agency of stateAgencies) {
          const pulseIq = agency.zollOpportunity?.pulseIqScore;
          const ambulanceCount = agency.totalAmbulances;
          const fireEngineCount = agency.totalFireEngines;

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
        }

        const stats: StateStats = {
          count: stateAgencies.length,
          avgPulseIq: pulseIqDataCount ? Math.round(sumPulseIq / pulseIqDataCount) : null,
          pulseIqDataCount,
          totalAmbulances: ambulanceDataCount ? ambulances : null,
          ambulanceDataCount,
          totalFireEngines: fireEngineDataCount ? fireEngines : null,
          fireEngineDataCount,
        };
        return [state.code, stats];
      }),
    ) as Record<string, StateStats>;
  }, [scopedAgencies]);

  const stateMapMetricsByCode = useMemo(() => {
    const acsMapDatum = (
      metric: StateMapMetricKey,
      coverage: {
        value: number | null;
        partialValue: number | null;
        availableCount: number;
        expectedCount: number;
        complete: boolean;
      },
      tableId: string,
      tableUrl: string,
    ): StateMapMetricDatum => {
      const method = metric === 'acs-population'
        ? 'Sum of county population estimates.'
        : metric === 'acs-age65-share'
          ? 'Sum of county residents age 65+ divided by summed population.'
          : metric === 'acs-poverty-rate'
            ? 'Summed below-poverty population divided by the summed poverty-status universe.'
            : 'Median of county median household incomes; not a state household-income median.';
      const coverageSummary = coverage.complete
        ? `${method} ${formatInteger(coverage.availableCount)} of ${formatInteger(coverage.expectedCount)} county-equivalent records; complete coverage.`
        : `${method} ${formatInteger(coverage.availableCount)} of ${formatInteger(coverage.expectedCount)} county-equivalent records; partial ${
            coverage.partialValue == null ? 'summary unavailable' : `summary ${formatStateMapValue(metric, coverage.partialValue)}`
          } is not shaded as a statewide total.`;
      return {
        value: coverage.value,
        coverage: coverageSummary,
        period: `${ACS_COUNTY_SOURCE.reportingPeriod} · ${ACS_COUNTY_SOURCE.vintage}`,
        sourceAction: 'census-acs',
        source: ACS_COUNTY_SOURCE.name,
        sourceUrl: tableUrl,
        sourceReference: tableId,
        coverageCount: coverage.availableCount,
        expectedCount: coverage.expectedCount,
        partialValue: coverage.partialValue,
      };
    };

    return Object.fromEntries(
      Object.values(ALL_50_STATES_SUMMARIES).map((state) => {
        const stats = stateStatsByCode[state.code];
        const sourceCounts=sourceDirectory?.byState[state.code];
        const sourceCount=sourceCounts?(globalCategory==='ems'?sourceCounts.nppes:globalCategory==='fire'?sourceCounts.usfa:sourceCounts.usfa+sourceCounts.nppes):null;
        const acs = acsStateRollupsByCode[state.code];
        const metricData: Record<StateMapMetricKey, StateMapMetricDatum> = {
          'source-listings': {
            value: sourceCount,
            coverage: sourceCounts?`${sourceCounts.usfa.toLocaleString()} USFA fire listings and ${sourceCounts.nppes.toLocaleString()} NPPES ambulance organization listings. ${sourceCounts.countiesWithRecords} of ${sourceCounts.countyCount} counties have assigned listings; ${sourceCounts.unassigned.toLocaleString()} records await county assignment. Sources may overlap; equipment is not reported.`:'National registry index not loaded.',
            period:'USFA retrieved November 16, 2026; retired registry. NPPES November 9, 2026 release.',
            sourceAction:'agency-records',
          },
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
            period: 'Modeled estimate from current agency profile inputs; source periods are not standardized.',
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
          'acs-population': acsMapDatum(
            'acs-population',
            acs.population,
            'B01001',
            ACS_COUNTY_SOURCE.tables.populationAndAge,
          ),
          'acs-age65-share': acsMapDatum(
            'acs-age65-share',
            acs.population65PlusShare,
            'B01001',
            ACS_COUNTY_SOURCE.tables.populationAndAge,
          ),
          'acs-poverty-rate': acsMapDatum(
            'acs-poverty-rate',
            acs.povertyRate,
            'B17001',
            ACS_COUNTY_SOURCE.tables.poverty,
          ),
          'acs-county-income-median': acsMapDatum(
            'acs-county-income-median',
            acs.medianCountyHouseholdIncome,
            'B19013',
            ACS_COUNTY_SOURCE.tables.householdIncome,
          ),
        };
        return [state.code, metricData];
      }),
    ) as Record<string, Record<StateMapMetricKey, StateMapMetricDatum>>;
  }, [providerScopeLabel, stateStatsByCode, sourceDirectory, globalCategory, acsStateRollupsByCode]);

  const mapMetricValues = Object.values(stateMapMetricsByCode)
    .map((metrics) => metrics[mapMetric].value)
    .filter(hasReportedValue);
  const mapMetricMin = mapMetricValues.length ? Math.min(...mapMetricValues) : 0;
  const mapMetricMax = mapMetricValues.length ? Math.max(...mapMetricValues) : 0;
  const activeMapMetric = STATE_MAP_METRICS.find((metric) => metric.key === mapMetric)!;
  const activeMapPalette = getMapPalette(mapMetric, mapColorScheme);
  const mapMetricQuantileColors = useMemo(() => {
    const values = Object.entries(stateMapMetricsByCode)
      .map(([code, metrics]) => ({ code, value: metrics[mapMetric].value }))
      .filter((entry): entry is { code: string; value: number } => hasReportedValue(entry.value))
      .sort((left, right) => left.value - right.value);
    if (!values.length) return new Map<string, string>();
    const thresholds = activeMapPalette.stops.map((_, index) => {
      const position = Math.min(values.length - 1, Math.ceil(((index + 1) / activeMapPalette.stops.length) * values.length) - 1);
      return values[position].value;
    });
    return new Map(values.map(({ code, value }) => {
      const match = thresholds.findIndex((threshold) => value <= threshold);
      const band = match < 0 ? activeMapPalette.stops.length - 1 : match;
      return [code, activeMapPalette.stops[band]];
    }));
  }, [activeMapPalette, mapMetric, stateMapMetricsByCode]);
  const legendBands = activeMapPalette.stops.map(color => {
    const values = Array.from(mapMetricQuantileColors.entries())
      .filter(([, fill]) => fill === color)
      .map(([code]) => stateMapMetricsByCode[code][mapMetric].value as number);
    if (!values.length) return {color, range: 'No areas'};
    const low = formatStateMapValue(mapMetric, Math.min(...values));
    const high = formatStateMapValue(mapMetric, Math.max(...values));
    return {color, range: low === high ? low : low + ' – ' + high};
  });
  const getStateMapFill = (code: string) =>
    mapMetricQuantileColors.get(code) ?? activeMapPalette.stops[0];

  useEffect(() => {
    const viewport = mapViewportRef.current;
    const stateBoundary = US_STATES_SVG_PATHS[selectedStateCode];
    const svg = viewport?.querySelector('svg');
    if (!viewport || !stateBoundary || !svg) return;
    if (!hasInitializedMapRef.current) {
      hasInitializedMapRef.current = true;
      return;
    }

    const scale = svg.getBoundingClientRect().width / HOME_MAP_VIEWBOX.width;
    const mapPoint = getHomeMapGeometryPoint(
      stateBoundary.labelX,
      stateBoundary.labelY,
      !isHomeMapInsetState(selectedStateCode),
    );
    const stateX = (mapPoint.x + HOME_MAP_TRANSLATE_X - HOME_MAP_VIEWBOX.x) * scale;
    const stateY = (mapPoint.y - HOME_MAP_VIEWBOX.y) * scale;
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

  const updateMapZoom = (delta: number) => {
    setMapZoom((zoom) => {
      const nextZoom = Math.max(1, Math.min(1.8, +(zoom + delta).toFixed(1)));
      saveMapPreference('zoom', String(nextZoom));
      return nextZoom;
    });
  };

  const resetMapZoom = () => {
    setMapZoom(1);
    saveMapPreference('zoom', '1');
  };

  const renderMapZoomControls = (testIdPrefix = 'button-map', compact = false) => (
    <div
      className={`home-map-zoom-control flex items-center gap-1.5 rounded-lg border border-[#304A61] bg-[#101F30] p-1 ${compact ? '' : 'hidden md:flex'}`}
      role="group"
      aria-label="Map zoom controls"
    >
      <button
        type="button"
        data-testid={`${testIdPrefix}-zoom-in`}
        onClick={() => updateMapZoom(0.2)}
        disabled={mapZoom >= 1.8}
        aria-label="Zoom in on map"
        title="Zoom in"
        className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md text-[#C7D7E6] hover:bg-[#1C3449] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#65D7D0]"
      >
        <ZoomIn className="h-4 w-4" aria-hidden="true" />
      </button>
      <span
        className="min-w-12 text-center font-mono text-[11px] font-bold tabular-nums text-[#9CB1C7]"
        aria-live="polite"
      >
        {Math.round(mapZoom * 100)}%
      </span>
      <button
        type="button"
        data-testid={`${testIdPrefix}-zoom-out`}
        onClick={() => updateMapZoom(-0.2)}
        disabled={mapZoom <= 1}
        aria-label="Zoom out on map"
        title="Zoom out"
        className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md text-[#C7D7E6] hover:bg-[#1C3449] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#65D7D0]"
      >
        <ZoomOut className="h-4 w-4" aria-hidden="true" />
      </button>
      <button
        type="button"
        data-testid={`${testIdPrefix}-zoom-reset`}
        onClick={resetMapZoom}
        disabled={mapZoom === 1}
        aria-label="Reset map zoom"
        title="Reset zoom"
        className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md text-[#C7D7E6] hover:bg-[#1C3449] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#65D7D0]"
      >
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );

  const handleStateClick = (code: string) => {
    setSelectedStateCode(code);
    saveMapPreference('state', code);
    if (onSelectState) {
      onSelectState(code);
    } else {
      onNavigateTab('states_directory');
    }
  };

  const inspectState = (code: string) => {
    if (!window.matchMedia('(max-width: 767px)').matches) return handleStateClick(code);
    setDetailCode(code);
    detailDialog.current?.showModal();
  };
  const detail = detailCode ? stateMapMetricsByCode[detailCode][mapMetric] : null;
  const equipmentCount = detailCode ? scopedAgencies.filter(agency =>
    agency.stateCode === detailCode && hasRecordedEquipmentValue(agency)).length : 0;
  const pickerStates = Object.entries(ALL_50_STATES_SUMMARIES)
    .filter(([code, state]) => (!compactStatesOnly || EAST_COAST_CALLOUT_STATES.some(s => s.code === code))
      && (state.state + ' ' + code).toLowerCase().includes(stateSearch.trim().toLowerCase()))
    .sort((a, b) => a[1].state.localeCompare(b[1].state));
  const mapActions = (
    <div className="home-map-phone-actions">
          <button type="button" aria-label="Choose a state" onClick={() => { setCompactStatesOnly(false); setStateSearch(''); statePicker.current?.showModal(); stateSearchInput.current?.focus(); }}><MapPin aria-hidden="true" size={19}/> Choose state</button>
          <button type="button" aria-expanded={mapOptionsOpen} aria-controls="home-map-options" onClick={() => setMapOptionsOpen(open => !open)}><Layers aria-hidden="true" size={19}/> Map options</button>
          {!isPhone && <p>Showing: <strong>{activeMapMetric.label}</strong></p>}
        </div>
  );

  const mapHeaderActions = (
    <>
      <button type="button" className="workspace-text-button" onClick={()=>{
        setSelectedStateCode('all');
        setRegionFilter('All');
        saveMapPreference('region','All');
        resetMapZoom();
        onClearGeography?.();
        setBrowseOpen(false);
      }}>National view</button>
      <button type="button" className="workspace-text-button" onClick={()=>{setBrowseOpen(false);onNavigateTab('states_directory');}}>Browse agency directory</button>
      <button type="button" className="workspace-text-button" data-testid="button-browse-national-records" onClick={()=>{setBrowseOpen(false);setRegistryOpen(true);}}>Browse national records</button>
    </>
  );

  return (
    <div>
      <dialog ref={registryDialog} onClose={()=>setRegistryOpen(false)} onCancel={()=>setRegistryOpen(false)} aria-label="Browse national registry listings" style={{width:'min(960px,94vw)',maxHeight:'90dvh',overflow:'auto',padding:16,borderRadius:12,background:'var(--pi-surface, white)',color:'var(--pi-text-primary, #14283f)'}}>
        <button autoFocus type="button" className="workspace-button mb-3" onClick={()=>setRegistryOpen(false)}>Close registry</button>
        {registryOpen&&<NationalSourceDirectory stateCode={selectedStateCode==='all'?'':selectedStateCode} providerScope={globalCategory}/>}
      </dialog>
      <dialog ref={statePicker} className="home-state-picker" aria-labelledby="home-state-picker-title">
        <div className="home-state-picker-heading">
          <h2 id="home-state-picker-title">Choose a state</h2>
          <button type="button" className="workspace-button" onClick={() => statePicker.current?.close()}>Close</button>
        </div>
        <label htmlFor="home-state-search">Search by state name or abbreviation</label>
        <input ref={stateSearchInput} id="home-state-search" type="search" autoComplete="off" placeholder="Florida or FL" value={stateSearch} onChange={event => setStateSearch(event.target.value)} />
        <div className="home-state-picker-results" aria-label="States">
          {Object.entries(ALL_50_STATES_SUMMARIES).filter(([code, state]) => `${state.state} ${code}`.toLowerCase().includes(stateSearch.trim().toLowerCase())).sort((a,b) => a[1].state.localeCompare(b[1].state)).map(([code, state]) => (
            <button type="button" key={code} onClick={() => { statePicker.current?.close(); handleStateClick(code); }}>
      <dialog ref={detailDialog} className="home-state-picker home-state-details" aria-labelledby="home-state-detail-title" onClose={() => setDetailCode(null)}>
        {detailCode && detail && <>
          <div className="home-state-picker-heading">
            <h2 id="home-state-detail-title">{ALL_50_STATES_SUMMARIES[detailCode].state}</h2>
            <button type="button" className="workspace-button" onClick={() => detailDialog.current?.close()}>Close</button>
          </div>
          <p>{activeMapMetric.label}</p>
          <strong className="home-detail-value">{formatStateMapValue(mapMetric, detail.value)}</strong>
          <p>{detail.coverage}</p>
          {detail.source && <p>{detail.sourceUrl ? <a href={detail.sourceUrl} target="_blank" rel="noreferrer">{detail.source}</a> : detail.source}</p>}
          <p>{detail.period}</p>
          {equipmentCount > 0 && <p>Equipment recorded in {formatInteger(equipmentCount)} of {formatInteger(stateStatsByCode[detailCode].count)} agency profiles in this view.</p>}
          <button type="button" className="workspace-button" onClick={() => { detailDialog.current?.close(); handleStateClick(detailCode); }}>Explore counties in {ALL_50_STATES_SUMMARIES[detailCode].state}</button>
        </>}
      </dialog>
      <dialog ref={statePicker} className="home-state-picker" aria-labelledby="home-state-picker-title">
        <div className="home-state-picker-heading">
          <h2 id="home-state-picker-title">{compactStatesOnly ? 'Small states and DC' : 'Choose a state'}</h2>
          <button type="button" className="workspace-button" onClick={() => statePicker.current?.close()}>Close</button>
        </div>
        {isPhone && <button className="atlas-picker-scope" type="button" aria-pressed={compactStatesOnly} onClick={() => { setCompactStatesOnly(value => !value); setStateSearch(''); }}>
          <MapPin size={17} aria-hidden="true"/>{compactStatesOnly ? 'Show all states' : 'Small states and DC'}
        </button>}
        <label htmlFor="home-state-search">Search by state name or abbreviation</label>
        <input ref={stateSearchInput} id="home-state-search" type="search" autoComplete="off" placeholder="Florida or FL" value={stateSearch} onChange={event => setStateSearch(event.target.value)} />
        <div className="home-state-picker-results" aria-label="States">
          {pickerStates.map(([code, state]) => (
            <button type="button" key={code} onClick={() => { statePicker.current?.close(); inspectState(code); }}>
              <span>{state.state} <small>{code}</small></span>
              <span>{formatStateMapValue(mapMetric, stateMapMetricsByCode[code][mapMetric].value)} <span aria-hidden="true">→</span></span>
            </button>
          ))}
          {!Object.entries(ALL_50_STATES_SUMMARIES).some(([code, state]) => `${state.state} ${code}`.toLowerCase().includes(stateSearch.trim().toLowerCase())) && <p role="status">No states match. Try a name or two-letter abbreviation.</p>}
          {!pickerStates.length && <p role="status">No states match. Try a name or two-letter abbreviation.</p>}
        </div>
        <p className="home-state-picker-note">{activeMapMetric.label} · Select a state to explore counties and agencies.</p>
      </dialog>
      {/* ====================================================================
          1. INTERACTIVE U.S. TERRITORY MAP
         ==================================================================== */}
      <section
        aria-label="Interactive U.S. Territory Map"
        className="home-territory-map-screen home-territory-map-screen-v2 pi-surface p-4 sm:p-5 space-y-4 sm:space-y-5"
      >
        <div className="home-map-page-heading flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-[#DFE6EF] dark:border-[#1E2D42]">
          <div className="home-map-heading-copy">
            <h2 className="pi-section-heading flex items-center gap-2">
              <WorkspaceIcon name="home"/>
              <span>Territory map</span>
            </h2>
            <p className="pi-supporting mt-0.5">
              {globalCity && globalCity !== 'all'
                ? `Current area: ${globalCity}, ${globalCounty && globalCounty !== 'all' ? `${globalCounty}, ` : ''}${globalState && globalState !== 'all' ? globalState : ''}`
                : globalCounty && globalCounty !== 'all'
                  ? `Current area: ${globalCounty}, ${globalState && globalState !== 'all' ? globalState : ''}`
                  : globalState && globalState !== 'all'
                    ? `Current area: ${ALL_50_STATES_SUMMARIES[globalState]?.state || globalState}`
                    : 'Select a state to explore its counties and EMS/fire agencies.'}
            </p>
          </div>

          <div className="home-map-browse"><button type="button" className="home-map-browse-toggle" aria-expanded={browseOpen} aria-controls="home-map-browse-links" onClick={() => setBrowseOpen(open => !open)}>Browse</button><div id="home-map-browse-links" className="home-map-heading-actions" data-mobile-open={browseOpen}>
            <button type="button" className="workspace-text-button" onClick={()=>{
              setSelectedStateCode('all');
              setRegionFilter('All');
              saveMapPreference('region','All');
              resetMapZoom();
              onClearGeography?.();
            }}>National view</button>
            <button type="button" className="workspace-text-button" onClick={()=>onNavigateTab('states_directory')}>Browse agency directory</button>
            <button type="button" className="workspace-text-button" data-testid="button-browse-national-records" onClick={()=>setRegistryOpen(true)}>Browse national records</button>
          <div className="home-map-browse">
            <button type="button" className="home-map-browse-toggle" aria-expanded={browseOpen} aria-controls="home-map-browse-links" onClick={() => setBrowseOpen(open => !open)}>Browse <ChevronDown size={15} aria-hidden="true"/></button>
            <div id="home-map-browse-links" className="home-map-heading-actions" data-mobile-open={browseOpen}>
              {mapHeaderActions}
            </div>
          </div>
          </div>
          {/* Region Filter Segmented Control */}
          {!isPhone && <div className="home-map-region-filter max-w-full overflow-x-auto" role="group" aria-label="Filter map by region">
            <div className="flex w-max items-center gap-1 bg-[#F5F7FA] dark:bg-[#16243A] p-1 rounded-xl border border-[#DFE6EF] dark:border-[#1E2D42]">
            {(['All', 'Northeast', 'Midwest', 'South', 'West'] as const).map((reg) => (
              <button
                key={reg}
                type="button"
                aria-pressed={regionFilter === reg}
                onClick={() => {
                  setRegionFilter(reg);
                  saveMapPreference('region', reg);
                }}
                className={`min-h-11 px-3 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  regionFilter === reg
                    ? 'bg-white dark:bg-[#111C2D] text-[#14283F] dark:text-white shadow-2xs font-bold'
                    : 'text-[#53657B] dark:text-slate-400 hover:text-[#14283F] dark:hover:text-white'
                }`}
              >
                {reg}
              </button>
            ))}
            </div>
          </div>}
        </div>

        <div className="home-map-phone-actions">
          <button type="button" onClick={() => { setStateSearch(''); statePicker.current?.showModal(); stateSearchInput.current?.focus(); }}>Choose a state <Search aria-hidden="true" size={16}/></button>
          <button type="button" aria-expanded={mapOptionsOpen} aria-controls="home-map-options" onClick={() => setMapOptionsOpen(open => !open)}>Map options <SlidersHorizontal aria-hidden="true" size={16}/></button>
          <p>Showing: <strong>{activeMapMetric.label}</strong></p>
        </div>
        {agencies.length === 0 && (
          <div className="home-map-data-status" role="status">
            <strong>No agency records are available in the saved directory.</strong>
            <span>Map coverage and agency records are separate. Check data status or open the directory to review what is available.</span>
            <button type="button" className="workspace-text-button" onClick={() => onNavigateTab('states_directory')}>Open agency directory</button>
          </div>
        )}

        {!isPhone && mapActions}
        {/* The Home screen keeps the interactive map as its only main content. */}
        <div className="grid grid-cols-1 gap-4 items-start">
          <div className="min-w-0 space-y-3">
            <div
              className="home-territory-map-panel home-map-stage-v2 relative rounded-xl border border-[#D7E0EA] bg-white overflow-hidden p-3 sm:p-4 shadow-sm"
              onMouseLeave={() => setHoveredStateCode(null)}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setHoveredStateCode(null);
                  setFocusedStateCode(null);
                }
              }}
            >
              {isPhone && mapActions}
              <aside className="home-map-control-rail" aria-label="Territory map controls and preview">
              <div id="home-map-options" data-mobile-open={mapOptionsOpen} className="home-map-control-row home-map-toolbar-v2 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
                {isPhone && <label htmlFor="atlas-phone-region">Region
                  <select id="atlas-phone-region" className="home-map-layer-select" value={regionFilter} onChange={event => {
                    const region = event.target.value as StateMapRegion;
                    setRegionFilter(region);
                    saveMapPreference('region', region);
                  }}>{(['All', 'Northeast', 'Midwest', 'South', 'West'] as const).map(region => <option key={region}>{region}</option>)}</select>
                </label>}
                <label htmlFor="home-state-map-metric" className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#53657A]">
                  <DataLabel kind="coverage">Shade states by</DataLabel>
                  <select
                    id="home-state-map-metric"
                    data-testid="select-state-map-metric"
                    value={mapMetric}
                    onChange={(event) => {
                      const metric = event.target.value as StateMapMetricKey;
                      setMapMetric(metric);
                      saveMapPreference('metric', metric);
                    }}
                    className="home-map-layer-select home-map-select--metric min-h-11 min-w-0 sm:min-w-[245px] rounded-lg border border-[#B9C7D7] bg-white px-3 text-sm font-semibold text-[#14283F] focus:outline-none focus:ring-2 focus:ring-[#2E64C5]"
                  >
                    {STATE_MAP_METRICS.map((metric) => (
                      <option key={metric.key} value={metric.key}>{metric.label}</option>
                    ))}
                  </select>
                </label>
                {isQualityMapMetric(mapMetric) && (
                  <label htmlFor="home-map-color-palette" className="home-map-palette-control flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#53657A]">
                    <DataLabel kind="coverage">Map palette</DataLabel>
                    <select
                      id="home-map-color-palette"
                      data-testid="select-map-color-palette"
                      value={mapColorScheme}
                      onChange={(event) => {
                        const scheme = event.target.value as MapColorScheme;
                        setMapColorScheme(scheme);
                        saveMapPreference('palette', scheme);
                      }}
                      className="home-map-layer-select home-map-palette-select home-map-select--palette min-h-11 min-w-0 rounded-lg border border-[#B9C7D7] bg-white px-3 text-sm font-semibold text-[#14283F] focus:outline-none focus:ring-2 focus:ring-[#2E64C5]"
                    >
                      <option value="standard">Standard</option>
                      <option value="colorblind-safe">Color-blind safe</option>
                    </select>
                  </label>
                )}
                {renderMapZoomControls()}
                <div className="home-map-phone-zoom">{renderMapZoomControls('mobile-button-map', true)}<p>Zoom to inspect. Drag the zoomed map to pan.</p></div>
              </div>

              {hasNationwideMapGeometry && isPhone && <details className="atlas-phone-key">
                <summary><div><strong>{activeMapMetric.label}</strong>
                  <span className="atlas-key-scale" aria-hidden="true">{legendBands.map(band => <i key={band.color} style={{backgroundColor:band.color}}/>)}</span>
                </div><span className="atlas-key-label">Legend <ChevronDown size={16} aria-hidden="true"/></span></summary>
                <ul>{legendBands.map(band => <li key={band.color}><i style={{backgroundColor: band.color}}/>{band.range}</li>)}</ul>
                <p>{mapMetricValues.length} of {Object.keys(stateMapMetricsByCode).length} areas reported. Colors group values from low to high. Hatching marks missing data.</p>
              </details>}
              {hasNationwideMapGeometry && !isPhone && <div className="home-map-legend home-map-legend-v2 flex flex-nowrap items-center gap-x-5 overflow-x-auto rounded-lg bg-white border border-[#D7E0EA] px-3.5 py-2.5">
                <span className="home-map-legend-title shrink-0 text-[11px] font-bold text-[#40546A]">
                  <DataLabel kind={inferDataLabelKind(activeMapMetric.label)}>{activeMapMetric.label}</DataLabel>
                  {mapColorScheme === 'colorblind-safe' && isQualityMapMetric(mapMetric) && (
                    <span className="home-map-legend-palette-note"> · Color-blind safe</span>
                  )}
                </span>
                <span className="home-map-legend-scale flex shrink-0 items-center gap-2 whitespace-nowrap text-[11px] font-medium text-[#53657A]">
                  <span className="home-map-legend-endpoint">{mapMetricValues.length ? formatStateMapValue(mapMetric, mapMetricMin) : '—'} · {activeMapPalette.lowLabel}</span>
                  <span className="home-map-legend-gradient h-3 w-24 rounded-sm border border-[#7790A7]" style={{ background: getMapGradient(activeMapPalette) }} aria-hidden="true" />
                  <span className="home-map-legend-endpoint home-map-legend-endpoint-high">{mapMetricValues.length ? formatStateMapValue(mapMetric, mapMetricMax) : '—'} · {activeMapPalette.highLabel}</span>
                </span>
                {mapMetricValues.some((value) => value === 0) && (
                  <span className="home-map-legend-zero flex shrink-0 items-center gap-2 whitespace-nowrap text-[11px] font-medium text-[#B2C2D2]">
                    <span className="inline-block h-4 w-4 rounded-sm border border-[#7790A7]" style={{ backgroundColor: activeMapPalette.stops[0] }} aria-hidden="true" />
                    Reported 0
                  </span>
                )}
                  <span className="home-map-legend-missing flex shrink-0 items-center gap-2 whitespace-nowrap text-[11px] font-medium text-[#53657A]">
                  <span className="inline-block h-4 w-4 rounded-sm border border-[#7890A8] bg-[repeating-linear-gradient(135deg,#F4E8D8_0px,#F4E8D8_3px,#7890A8_3px,#7890A8_4px)]" aria-hidden="true" />
                  Not reported
                </span>
                  <span className="home-map-legend-missing-note shrink-0 text-[10px] text-[#66788D]" data-testid="text-map-legend-coverage">
                  {formatInteger(mapMetricValues.length)} of {formatInteger(Object.keys(stateMapMetricsByCode).length)} areas reported (states + DC) · hatch = missing, not zero · colors = relative quintiles
                </span>
              </div>}

              {(() => {
                if (isPhone) return null;
                const previewStateCode = hoveredStateCode ?? focusedStateCode;
                const code = previewStateCode ?? selectedStateCode;
                const st = ALL_50_STATES_SUMMARIES[code];
                if (!st) return null;
                const datum = stateMapMetricsByCode[code][mapMetric];
                const count = stateStatsByCode[code]?.count ?? 0;
                const swatch = hasReportedValue(datum.value)
                  ? getStateMapFill(code)
                  : undefined;
                return (
                  <div className="home-map-state-preview" aria-live="polite" data-testid="panel-state-preview" data-preview-mode={previewStateCode ? 'preview' : 'selected'}>
                    <span className={`home-map-state-preview-swatch${swatch ? '' : ' is-missing'}`} style={swatch ? { backgroundColor: swatch } : undefined} aria-hidden="true" />
                    <div className="home-map-state-preview-id">
                      <span className="home-map-state-preview-kicker">{previewStateCode && previewStateCode !== selectedStateCode ? 'Preview' : 'Selected'}</span>
                      <strong data-testid="text-preview-state">{st.state} <span>{code}</span></strong>
                    </div>
                    <dl className="home-map-state-preview-facts">
                      <div><dt>{mapMetric === 'agency-records' ? 'Agency records' : activeMapMetric.label}</dt><dd data-testid="text-preview-metric">{formatStateMapValue(mapMetric, datum.value)}</dd></div>
                      {mapMetric === 'agency-records'
                        ? <div><dt>Counties in directory</dt><dd>{formatInteger(territoryEngine.getCountiesForState(code).length)}</dd></div>
                        : <div><dt>Agency records</dt><dd data-testid="text-preview-agencies">{formatInteger(count)}</dd></div>}
                    </dl>
                    {datum.source && (
                      <div className="home-map-source-context mt-2 space-y-1 rounded-md border border-slate-300 bg-slate-100/80 px-2.5 py-2 text-[10px] leading-4 text-slate-700 dark:border-slate-600 dark:bg-slate-900/70 dark:text-slate-200" data-testid="text-map-source-coverage">
                        <p className="break-words">{datum.coverage}</p>
                        <p>{datum.source} · {datum.period}</p>
                        {datum.sourceReference === 'B19013' && (
                          <p className="font-medium">Income is the median of county median household incomes, not a separately calculated state median.</p>
                        )}
                        {datum.sourceUrl && (
                          <a className="inline-flex min-h-6 items-center font-semibold text-blue-800 underline underline-offset-2 dark:text-blue-300" href={datum.sourceUrl} target="_blank" rel="noopener noreferrer" data-testid={`link-state-acs-source-${code}`}>
                            Open Census table {datum.sourceReference} <span aria-hidden="true">↗</span>
                          </a>
                        )}
                      </div>
                    )}
                    <button type="button" className="home-map-state-preview-action" data-testid="button-preview-explore" onClick={() => handleStateClick(code)}>
                      Explore {code}
                    </button>
                  </div>
                );
              })()}
              {/* East Coast Compact Callout Buttons */}
              {!isPhone && <div className="home-map-shortcuts pt-2 border-t border-[#D7E0EA] text-xs">
                <div className="home-map-shortcuts-heading">
                  <span>Small-state shortcuts</span>
                  <span className="home-map-shortcuts-swipe">Swipe to see all {EAST_COAST_CALLOUT_STATES.length}</span>
                </div>
                <div className="home-map-shortcut-row" role="group" aria-label="Small-state shortcuts">
                {EAST_COAST_CALLOUT_STATES.map((c) => {
                  const isSelected = selectedStateCode === c.code;
                  const datum = stateMapMetricsByCode[c.code][mapMetric];
                  return (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => inspectState(c.code)}
                      onMouseEnter={() => setHoveredStateCode(c.code)}
                      onFocus={() => setFocusedStateCode(c.code)}
                      aria-pressed={isSelected}
                      aria-label={`${ALL_50_STATES_SUMMARIES[c.code].state}: ${activeMapMetric.label}, ${formatStateMapValue(mapMetric, datum.value)}`}
                      style={{
                        backgroundColor: isSelected ? '#F4C86A' : undefined,
                        color: isSelected ? '#14283F' : undefined,
                        borderColor: isSelected ? '#FFE8AC' : undefined,
                        outline: isSelected ? '2px solid #F4C86A' : undefined,
                        outlineOffset: isSelected ? '1px' : undefined,
                      }}
                      className="min-h-10 min-w-10 px-2 rounded-md border border-[#CBD5E1] bg-white text-[12px] font-bold font-mono text-[#1E56A8] transition-[background-color,color,outline] hover:bg-[#F1F5F9] focus:outline focus:outline-2 focus:outline-[#2E64C5]"
                    >
                      {c.code}
                    </button>
                  );
                })}
                </div>
              </div>}
              </aside>
              <div className="home-map-content-stack home-map-content-v2 flex flex-col gap-3">
              <div className="home-map-visual-stack home-map-visual-v2">
              {hasNationwideMapGeometry ? (
              <div
                ref={mapViewportRef}
                data-map-zoom={mapZoom}
                className="home-map-viewport overflow-auto overscroll-contain rounded-lg border border-[#D7E0EA] bg-white shadow-[inset_0_0_0_1px_rgba(20,40,63,0.05)]"
              >
              <svg
                viewBox={`${HOME_MAP_VIEWBOX.x} ${HOME_MAP_VIEWBOX.y} ${HOME_MAP_VIEWBOX.width} ${HOME_MAP_VIEWBOX.height}`}
                className="home-map-svg block h-auto select-none"
                style={{ aspectRatio: `${HOME_MAP_VIEWBOX.width} / ${HOME_MAP_VIEWBOX.height}`, width: `${mapZoom * 100}%` }}
                data-fit-screen={mapZoom === 1 ? 'true' : 'false'}
                data-map-palette={isQualityMapMetric(mapMetric) ? mapColorScheme : 'standard'}
                role="group"
                aria-label={`Interactive United States map shaded by ${activeMapMetric.label}, zoom ${Math.round(mapZoom * 100)} percent`}
              >
                <defs>
                  <pattern id="home-map-missing-data" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
                    <rect width="7" height="7" fill="#F4E8D8" />
                    <path d="M 0 0 L 0 7" stroke="#AF8B6C" strokeWidth="2" />
                  </pattern>
                </defs>
                <g transform={`translate(${HOME_MAP_TRANSLATE_X} 0)`}>

                {/* Alaska & Hawaii Cartographic Inset Frames */}
                <g>
                  <rect x="14" y="356" width="174" height="134" rx="10" fill="#FFF0D8" fillOpacity="0.98" stroke="#B68A60" strokeWidth="1.25" strokeDasharray="4 4" />
                  <text x="24" y="373" fill="#674C38" fontSize="10" fontWeight="800" fontFamily="monospace">ALASKA (AK)</text>

                  <rect x="196" y="396" width="124" height="94" rx="10" fill="#FFF0D8" fillOpacity="0.98" stroke="#B68A60" strokeWidth="1.25" strokeDasharray="4 4" />
                  <text x="206" y="413" fill="#674C38" fontSize="10" fontWeight="800" fontFamily="monospace">HAWAII (HI)</text>
                </g>

                {/* Layer 1: Authoritative U.S. State Boundary Polygons */}
                <g>
                  {[...Object.values(ALL_50_STATES_SUMMARIES)]
                    .sort((a, b) => {
                      // Do not move a focused SVG node when its preview changes:
                      // Chromium blurs nodes that are reordered in the DOM.
                      const rank = (code: string) => (code === selectedStateCode ? 1 : 0);
                      return rank(a.code) - rank(b.code);
                    })
                    .map((st) => {
                    const boundary = US_STATES_SVG_PATHS[st.code];
                    if (!boundary || !boundary.d) return null;

                    const isInRegion = regionFilter === 'All' || st.region === regionFilter;
                    const isSelected = selectedStateCode === st.code;
                    const isHovered = hoveredStateCode === st.code;
                    const countyCount = territoryEngine.getCountiesForState(st.code).length;
                    const datum = stateMapMetricsByCode[st.code][mapMetric];
                    const fillColor = hasReportedValue(datum.value)
                      ? getStateMapFill(st.code)
                      : 'url(#home-map-missing-data)';
                    const stateAriaLabel = `${st.state}. ${activeMapMetric.label}: ${formatStateMapValue(mapMetric, datum.value)}. ${datum.coverage}. Period: ${datum.period}${datum.claimScope ? `. Scope: ${datum.claimScope}. Definition: ${datum.denialDefinition}` : ''}${datum.source ? `. Source: ${datum.source}` : ''}`;

                    return (
                      <g
                        key={`home-poly-${st.code}`}
                        transform={isHomeMapInsetState(st.code) ? undefined : HOME_MAP_GEOMETRY_TRANSFORM}
                        opacity={isInRegion ? 1 : 0.36}
                      >
                        <path
                          d={boundary.d}
                          fill={fillColor}
                          stroke={isSelected ? '#F4C86A' : isHovered ? '#FF4B36' : '#9A7658'}
                          strokeWidth={isSelected ? 2.6 : isHovered ? 1.8 : 1.15}
                          strokeLinejoin="round"
                          vectorEffect="non-scaling-stroke"
                          onClick={() => inspectState(st.code)}
                          onMouseEnter={() => setHoveredStateCode(st.code)}
                          onFocus={() => setFocusedStateCode(st.code)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              inspectState(st.code);
                            }
                          }}
                          tabIndex={isInRegion ? 0 : -1}
                          role="button"
                          aria-pressed={isSelected}
                          aria-label={`${stateAriaLabel}. ${countyCount} counties. Select to explore.`}
                          className={`home-map-state-path cursor-pointer transition-[fill,stroke,opacity] duration-150 focus:outline-none${isSelected ? ' is-selected' : ''}${isHovered ? ' is-hovered' : ''}`}
                        >
                          <title>{`${stateAriaLabel} · ${countyCount} counties`}</title>
                        </path>
                        {(isSelected || isHovered) && (
                          <g pointerEvents="none" className="home-map-state-ring">
                            <path d={boundary.d} fill="none" stroke="#06101B" strokeWidth={isSelected ? 5 : 3.6} strokeLinejoin="round" vectorEffect="non-scaling-stroke" strokeOpacity="0.85" />
                            <path d={boundary.d} fill="none" stroke={isSelected ? '#F4C86A' : '#FF4B36'} strokeWidth={isSelected ? 2.4 : 1.6} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                          </g>
                        )}
                      </g>
                    );
                  })}
                </g>

                {/* Layer 2: Interior State Labels */}
                <g>
                  {Object.values(ALL_50_STATES_SUMMARIES).map((st) => {
                    const callout = EAST_COAST_CALLOUT_STATES.find((c) => c.code === st.code);
                    const boundary = US_STATES_SVG_PATHS[st.code];
                    if (!boundary) return null;
                    if (callout) {
                      const anchor = getHomeMapGeometryPoint(boundary.labelX, boundary.labelY, true);
                      const cIn = regionFilter === 'All' || st.region === regionFilter;
                      const cSel = selectedStateCode === st.code;
                      const cHov = hoveredStateCode === st.code;
                      const cDatum = stateMapMetricsByCode[st.code][mapMetric];
                      const cFill = hasReportedValue(cDatum.value)
                        ? getStateMapFill(st.code)
                        : '#F4E8D8';
                      return (
                        <g
                          key={`home-lbl-${st.code}`}
                          className="home-map-leader"
                          opacity={cIn ? 1 : 0.4}
                          onClick={() => inspectState(st.code)}
                          onMouseEnter={() => setHoveredStateCode(st.code)}
                          style={{ cursor: 'pointer' }}
                          aria-hidden="true"
                        >
                          <polyline
                            points={`${anchor.x},${anchor.y} ${callout.calloutX - 22},${callout.calloutY} ${callout.calloutX - 14},${callout.calloutY}`}
                            fill="none"
                            stroke={cSel ? '#F4C86A' : cHov ? '#FF4B36' : '#BA906A'}
                            strokeWidth={cSel || cHov ? 1.3 : 0.8}
                            pointerEvents="none"
                          />
                          <circle cx={anchor.x} cy={anchor.y} r="1.8" fill={cSel ? '#F4C86A' : '#BA906A'} pointerEvents="none" />
                          <rect x={callout.calloutX - 14} y={callout.calloutY - 9} width="28" height="18" rx="4" fill="#FFE9C6" stroke={cSel ? '#F4C86A' : cHov ? '#67D6CE' : '#BA906A'} strokeWidth={cSel ? 2 : 1.1} />
                          <rect x={callout.calloutX - 12} y={callout.calloutY - 7} width="4" height="14" rx="1.5" fill={cFill} />
                          <text x={callout.calloutX + 3} y={callout.calloutY + 3.5} textAnchor="middle" fill={cSel ? '#F4C86A' : '#49372C'} fontSize="10" fontWeight="800" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">{st.code}</text>
                        </g>
                      );
                    }

                    const isInRegion = regionFilter === 'All' || st.region === regionFilter;
                    const isSelected = selectedStateCode === st.code;
                    const isHovered = hoveredStateCode === st.code;
                    const datum = stateMapMetricsByCode[st.code][mapMetric];
                    const labelPoint = getHomeMapGeometryPoint(
                      boundary.labelX,
                      boundary.labelY,
                      !isHomeMapInsetState(st.code),
                    );
                    return (
                      <g
                        key={`home-lbl-${st.code}`}
                        transform={`translate(${labelPoint.x}, ${labelPoint.y})`}
                        pointerEvents="none"
                        opacity={isInRegion ? 1 : 0.4}
                      >
                        <rect
                          x="-13"
                          y="-9"
                          width="26"
                          height="18"
                          rx="5"
                          fill={isSelected ? '#F4C86A' : '#FFE9C6'}
                          fillOpacity="0.98"
                          stroke={isSelected ? '#FFF0C4' : isHovered ? '#67D6CE' : '#BA906A'}
                          strokeWidth={isSelected ? 2 : isHovered ? 1.6 : 1.1}
                        />
                        <text
                          textAnchor="middle"
                          dy="3.5"
                          fill={isSelected ? '#17202A' : '#49372C'}
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
                </g>
              </svg>
              </div>
              ) : (
                <HomeMapUnavailableFallback onBrowseDirectory={() => onNavigateTab('states_directory')} />
              )}




              </div>
              </div>
            </div>
          </div>
        </div>

        <HomeDirectoryStatus
          status={directoryLoad}
          visibleAgencyCount={agencies.length}
          onRetry={onRetryDirectory}
          onBrowseDirectory={() => onNavigateTab('states_directory')}
        />

      </section>

    </div>
  );
};
