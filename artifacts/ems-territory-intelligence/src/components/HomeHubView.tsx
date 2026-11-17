import type { DirectoryLoadStatus } from '../services/agencyDirectoryLoader';
import {buildEquipmentGeography,equipmentCoverageColor} from '../utils/equipmentGeography';
import {ALL_NATIONWIDE_COUNTIES} from '../data/allCountiesDatabase';
import {EquipmentCoverageLegend,EquipmentMapFilter,useEquipmentMapFilter} from './EquipmentMapFilter';
import {matchesEquipmentFilter,equipmentGeographyScope} from '../utils/equipmentPresence';
import {WorkspaceIcon} from './design/WorkspaceIcon';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Agency } from '../types';
import {
  Compass,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  SlidersHorizontal,
} from 'lucide-react';
import { ALL_50_STATES_SUMMARIES } from '../data/nationalGeographicData';
import { US_STATES_SVG_PATHS, EAST_COAST_CALLOUT_STATES } from '../data/usStatesSvgPaths';
import { territoryEngine } from '../services/territoryIntelligenceEngine';
import { formatInteger, formatScore } from '../utils/numberFormatting';
import { DataLabel, inferDataLabelKind } from './DataLabel';
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
  { key: 'agency-records', label: 'Agency directory records' },
  { key: 'ambulances', label: 'Agency-profile ambulance total' },
  { key: 'fire-engines', label: 'Agency-profile fire-engine total' },
  { key: 'pulseiq', label: 'PulseIQ estimate · modeled average' },
  { key: 'cardiac-survival', label: 'Cardiac survival estimate (%)' },
  { key: 'scene-transit', label: 'EMS transit estimate (minutes)' },
] as const;

type StateMapMetricKey =
  (typeof STATE_MAP_METRICS)[number]['key'];

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
  if (value === null) return 'Not reported';
  if (metric === 'cardiac-survival') return `${value.toFixed(1)}%`;
  if (metric === 'scene-transit') return `${value.toFixed(1)} min`;
  if (metric === 'pulseiq') return formatScore(value);
  return formatInteger(value);
};

const MAP_PALETTES: Record<StateMapMetricKey, StateMapPalette> = {
  'agency-records': { stops: ['#DDF5FF', '#A8E4F5', '#62C9E7', '#249FCB', '#126B98'], lowLabel: 'Fewer', highLabel: 'More' },
  ambulances: { stops: ['#DDF5FF', '#A8E4F5', '#62C9E7', '#249FCB', '#126B98'], lowLabel: 'Fewer', highLabel: 'More' },
  'fire-engines': { stops: ['#DDF5FF', '#A8E4F5', '#62C9E7', '#249FCB', '#126B98'], lowLabel: 'Fewer', highLabel: 'More' },
  pulseiq: { stops: ['#F3E8FF', '#D8B4FE', '#B174F0', '#8B43D0', '#612B9B'], lowLabel: 'Lower priority', highLabel: 'Higher priority' },
  'cardiac-survival': { stops: ['#FF1744', '#FF9100', '#FFEA00', '#AEEA00', '#00E676'], lowLabel: 'Lower', highLabel: 'Higher · stronger' },
  'scene-transit': { stops: ['#00E676', '#AEEA00', '#FFEA00', '#FF9100', '#FF1744'], lowLabel: 'Shorter', highLabel: 'Longer · concerning' },
};

// A blue-to-gold progression remains ordered without relying on red/green
// distinctions. Its lightest stops also stay visible on the dark map canvas.
const COLORBLIND_SAFE_STOPS = ['#63779D', '#688EAA', '#83A99E', '#BFC37D', '#F0DF65'];

const isQualityMapMetric = (metric: StateMapMetricKey) =>
  metric === 'cardiac-survival' || metric === 'scene-transit';

const getMapPalette = (metric: StateMapMetricKey, scheme: MapColorScheme): StateMapPalette => {
  const standard = MAP_PALETTES[metric];
  if (scheme !== 'colorblind-safe' || !isQualityMapMetric(metric)) return standard;
  return {
    ...standard,
    stops: metric === 'cardiac-survival'
      ? COLORBLIND_SAFE_STOPS
      : [...COLORBLIND_SAFE_STOPS].reverse(),
  };
};

const hexToRgb = (hex: string) =>
  hex.match(/[0-9a-f]{2}/gi)?.map((channel) => parseInt(channel, 16)) ?? [0, 0, 0];

const interpolateStateFill = (
  metric: StateMapMetricKey,
  value: number,
  min: number,
  max: number,
  palette = MAP_PALETTES[metric],
) => {
  const t = max === min ? 0.5 : Math.max(0, Math.min(1, (value - min) / (max - min)));
  const stops = palette.stops;
  const scaled = t * (stops.length - 1);
  const stopIndex = Math.min(stops.length - 2, Math.floor(scaled));
  const localT = scaled - stopIndex;
  const start = hexToRgb(stops[stopIndex]);
  const end = hexToRgb(stops[stopIndex + 1]);
  const channels = start.map((channel, index) => Math.round(channel + (end[index] - channel) * localT));
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
};

const getMapGradient = (palette: StateMapPalette) =>
  `linear-gradient(to right, ${palette.stops.join(', ')})`;

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
  agencies,
  directoryLoad,
  onRetryDirectory,
  onNavigateTab,
  onClearGeography,
  globalCategory,
  globalState,
  globalCounty,
  globalCity,
  onSelectState
}) => {
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
    const saved = readMapPreference('metric', 'agency-records');
    return STATE_MAP_METRICS.some((metric) => metric.key === saved) ? saved as StateMapMetricKey : 'agency-records';
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

  const [equipmentFilter,setEquipmentFilter]=useEquipmentMapFilter();
  useEffect(()=>{if(equipmentFilter.presence!=='all')setMapMetric('agency-records');},[equipmentFilter]);

  // Filter agencies by global category (All / EMS / Fire)
  const scopedAgencies = useMemo(() => {
    if (globalCategory === 'all') return agencies.filter(a=>matchesEquipmentFilter(a,equipmentFilter));
    return agencies.filter((a) => {
      const isFire = a.providerCategory === 'FIRE' || a.agencyType.toLowerCase().includes('fire');
      return matchesEquipmentFilter(a,equipmentFilter) && (globalCategory === 'fire' ? isFire : !isFire);
    });
  }, [agencies, globalCategory,equipmentFilter]);
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


  const equipmentCoverage=useMemo(()=>buildEquipmentGeography(equipmentGeographyScope(agencies,{category:globalCategory}),Object.values(ALL_50_STATES_SUMMARIES),ALL_NATIONWIDE_COUNTIES,equipmentFilter),[agencies,equipmentFilter,globalCategory]);
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
    return Object.fromEntries(
      Object.values(ALL_50_STATES_SUMMARIES).map((state) => {
        const stats = stateStatsByCode[state.code];
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
        };
        return [state.code, metricData];
      }),
    ) as Record<string, Record<StateMapMetricKey, StateMapMetricDatum>>;
  }, [providerScopeLabel, stateStatsByCode]);

  const mapMetricValues = Object.values(stateMapMetricsByCode)
    .map((metrics) => metrics[mapMetric].value)
    .filter(hasReportedValue);
  const mapMetricMin = mapMetricValues.length ? Math.min(...mapMetricValues) : 0;
  const mapMetricMax = mapMetricValues.length ? Math.max(...mapMetricValues) : 0;
  const activeMapMetric = STATE_MAP_METRICS.find((metric) => metric.key === mapMetric)!;
  const activeMapPalette = getMapPalette(mapMetric, mapColorScheme);

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

  const vendorScope=useMemo(()=>equipmentGeographyScope(agencies,{state:globalState,county:globalCounty,city:globalCity,category:globalCategory}),[agencies,globalState,globalCounty,globalCity,globalCategory]);

  return (
    <div>
      {/* ====================================================================
          1. INTERACTIVE U.S. TERRITORY MAP
         ==================================================================== */}
      <section
        aria-label="Interactive U.S. Territory Map"
        className="home-territory-map-screen home-territory-map-screen-v2 pi-surface p-4 sm:p-5 space-y-4 sm:space-y-5"
      >
        <div className="home-map-page-heading flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-[#DFE6EF] dark:border-[#1E2D42]">
          <div>
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
                    : 'Choose a state or region to review county coverage and available EMS and fire agency records.'}
            </p>
          </div>

          <button type="button" className="workspace-text-button" onClick={()=>{
            setSelectedStateCode('all');
            setRegionFilter('All');
            saveMapPreference('region','All');
            resetMapZoom();
            onClearGeography?.();
          }}>National view</button>
          <button type="button" className="workspace-text-button" onClick={()=>onNavigateTab('states_directory')}>Browse agency directory</button>
          {/* Region Filter Segmented Control */}
          <div className="home-map-region-filter max-w-full overflow-x-auto">
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

        {agencies.length === 0 && (
          <div className="home-map-data-status" role="status">
            <strong>No agency records are available in the saved directory.</strong>
            <span>Map coverage and agency records are separate. Check data status or open the directory to review what is available.</span>
            <button type="button" className="workspace-text-button" onClick={() => onNavigateTab('states_directory')}>Open agency directory</button>
          </div>
        )}

        {/* The Home screen keeps the interactive map as its only main content. */}
        <div className="grid grid-cols-1 gap-4 items-start">
          <div className="min-w-0 space-y-3">
            <div
              className="home-territory-map-panel home-map-stage-v2 relative bg-[#07111D] rounded-xl border border-[#294158] overflow-hidden p-3 sm:p-4 shadow-[0_16px_48px_rgba(2,8,18,0.28)]"
              onMouseLeave={() => setHoveredStateCode(null)}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setHoveredStateCode(null);
                  setFocusedStateCode(null);
                }
              }}
            >
              <aside className="home-map-control-rail" aria-label="Territory map controls and preview">
              {directoryLoad && <div className="home-equipment-coverage-legend" role="status" aria-live="polite">
                {directoryLoad.status === 'loading' ? `Loading cloud agency records… ${formatInteger(directoryLoad.loaded)} received. Counts are updating.`
                  : directoryLoad.status === 'unavailable' ? 'Cloud directory load incomplete. Showing available records; totals may be partial.'
                  : `Cloud directory loaded · ${formatInteger(directoryLoad.loaded)} records received.`}
                {directoryLoad.status === 'unavailable' && <button type="button" onClick={onRetryDirectory} className="ml-2 underline">Retry loading</button>}
              </div>}
              <div className="home-map-control-row home-map-toolbar-v2 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
                <EquipmentMapFilter value={equipmentFilter} onChange={setEquipmentFilter} agencies={vendorScope} scopeLabel="selected geography and provider scope, before equipment filtering"/>
                <label htmlFor="home-state-map-metric" className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9CB1C7]">
                  <DataLabel kind="coverage">Shade states by</DataLabel>
                  <select
                    id="home-state-map-metric"
                    disabled={equipmentFilter.presence!=='all'}
                    title={equipmentFilter.presence!=='all'?'Clear the equipment filter to select other shading layers.':undefined}
                    data-testid="select-state-map-metric"
                    value={mapMetric}
                    onChange={(event) => {
                      const metric = event.target.value as StateMapMetricKey;
                      setMapMetric(metric);
                      saveMapPreference('metric', metric);
                    }}
                    className="home-map-layer-select min-h-11 min-w-0 sm:min-w-[245px] rounded-lg border border-[#38536C] bg-[#101F30] px-3 text-sm font-semibold text-[#E6F0FA] focus:outline-none focus:ring-2 focus:ring-[#65D7D0]"
                  >
                    {STATE_MAP_METRICS.map((metric) => (
                      <option key={metric.key} value={metric.key}>{metric.label}</option>
                    ))}
                  </select>
                </label>
                {isQualityMapMetric(mapMetric) && (
                  <label htmlFor="home-map-color-palette" className="home-map-palette-control flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9CB1C7]">
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
                      className="home-map-layer-select home-map-palette-select min-h-11 min-w-0 rounded-lg border border-[#38536C] bg-[#101F30] px-3 text-sm font-semibold text-[#E6F0FA] focus:outline-none focus:ring-2 focus:ring-[#65D7D0]"
                    >
                      <option value="standard">Standard</option>
                      <option value="colorblind-safe">Color-blind safe</option>
                    </select>
                  </label>
                )}
                {renderMapZoomControls()}
                <details className="home-map-mobile-tools md:hidden">
                  <summary aria-label="Open map tools">
                    <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
                    <span>Tools</span>
                  </summary>
                  <div className="home-map-mobile-tools-panel">
                    {renderMapZoomControls('mobile-button-map', true)}
                    <p>Zoom in to inspect a state. Swipe to pan around the map.</p>
                  </div>
                </details>
              </div>

              {equipmentFilter.presence!=='all'&&<EquipmentCoverageLegend
                className="home-equipment-coverage-legend"
                note={`State colors roll up loaded directory records across ${formatInteger(ALL_NATIONWIDE_COUNTIES.length)} county-equivalent boundaries; “both found” may be different agencies. Records can include unverified candidates; confirm agency identity and current use. ${formatInteger(equipmentCoverage.unassignedState)} records have no resolved state; ${formatInteger(equipmentCoverage.unassignedCounty)} have no safe county match. Unassigned records remain in state totals when the state is known.`}
              />}
              {hasNationwideMapGeometry && equipmentFilter.presence==='all' && <div className="home-map-legend home-map-legend-v2 flex flex-nowrap items-center gap-x-5 overflow-x-auto rounded-lg bg-[#101F30] border border-[#294158] px-3.5 py-2.5">
                <span className="home-map-legend-title shrink-0 text-[11px] font-bold text-[#E4EEF8]">
                  <DataLabel kind={inferDataLabelKind(activeMapMetric.label)}>{activeMapMetric.label}</DataLabel>
                  {mapColorScheme === 'colorblind-safe' && isQualityMapMetric(mapMetric) && (
                    <span className="home-map-legend-palette-note"> · Color-blind safe</span>
                  )}
                </span>
                <span className="home-map-legend-scale flex shrink-0 items-center gap-2 whitespace-nowrap text-[11px] font-medium text-[#B2C2D2]">
                  <span className="home-map-legend-endpoint">{mapMetricValues.length ? formatStateMapValue(mapMetric, mapMetricMin) : '—'} · {activeMapPalette.lowLabel}</span>
                  <span className="home-map-legend-gradient h-3 w-24 rounded-full border border-[#7790A7]" style={{ background: getMapGradient(activeMapPalette) }} aria-hidden="true" />
                  <span className="home-map-legend-endpoint home-map-legend-endpoint-high">{mapMetricValues.length ? formatStateMapValue(mapMetric, mapMetricMax) : '—'} · {activeMapPalette.highLabel}</span>
                </span>
                {mapMetricValues.some((value) => value === 0) && (
                  <span className="home-map-legend-zero flex shrink-0 items-center gap-2 whitespace-nowrap text-[11px] font-medium text-[#B2C2D2]">
                    <span className="inline-block h-4 w-4 rounded-sm border border-[#7790A7]" style={{ backgroundColor: interpolateStateFill(mapMetric, 0, mapMetricMin, mapMetricMax, activeMapPalette) }} aria-hidden="true" />
                    Reported 0
                  </span>
                )}
                <span className="home-map-legend-missing flex shrink-0 items-center gap-2 whitespace-nowrap text-[11px] font-medium text-[#B2C2D2]">
                  <span className="inline-block h-4 w-4 rounded-sm border border-[#7890A8] bg-[repeating-linear-gradient(135deg,#172A3D_0px,#172A3D_3px,#7890A8_3px,#7890A8_4px)]" aria-hidden="true" />
                  Not reported
                </span>
                <span className="home-map-legend-missing-note shrink-0 text-[10px] text-[#8298AE]" data-testid="text-map-legend-coverage">
                  {formatInteger(mapMetricValues.length)} of {formatInteger(Object.keys(stateMapMetricsByCode).length)} areas reported (states + DC) · hatch = missing, not zero
                </span>
              </div>}

              {(() => {
                const previewStateCode = hoveredStateCode ?? focusedStateCode;
                const code = previewStateCode ?? selectedStateCode;
                const st = ALL_50_STATES_SUMMARIES[code];
                if (!st) return null;
                const datum = stateMapMetricsByCode[code][mapMetric];
                const count = stateStatsByCode[code]?.count ?? 0;
                const equipment=equipmentCoverage.byState[code];
                const swatch = equipmentFilter.presence!=='all'?equipmentCoverageColor(equipmentCoverage.byState[code],equipmentFilter):hasReportedValue(datum.value)
                  ? interpolateStateFill(mapMetric, datum.value, mapMetricMin, mapMetricMax, activeMapPalette)
                  : undefined;
                return (
                  <div className="home-map-state-preview" aria-live="polite" data-testid="panel-state-preview" data-preview-mode={previewStateCode ? 'preview' : 'selected'}>
                    <span className={`home-map-state-preview-swatch${swatch ? '' : ' is-missing'}`} style={swatch ? { backgroundColor: swatch } : undefined} aria-hidden="true" />
                    <div className="home-map-state-preview-id">
                      <span className="home-map-state-preview-kicker">{previewStateCode && previewStateCode !== selectedStateCode ? 'Preview' : 'Selected'}</span>
                      <strong data-testid="text-preview-state">{st.state} <span>{code}</span></strong>
                    </div>
                    {equipmentFilter.presence!=='all'&&<div className="home-equipment-state-counts" data-testid={`equipment-state-rollup-${code}`}>
                      <p>Loaded records · <b>ZOLL {formatInteger(equipment?.zoll||0)}</b> · <b>other makers {formatInteger(equipment?.competitor||0)}</b> · <b>mixed {formatInteger(equipment?.mixed||0)}</b></p>
                      <p>No recognized maker {formatInteger(equipment?.unknown||0)} · with equipment details {formatInteger(equipment?.reported||0)} · no substantive entry {formatInteger(equipment?.unreported||0)}</p>
                      <p>County coverage · records in {formatInteger(equipment?.countiesWithAgencyRecords||0)} of {formatInteger(equipment?.countyCount||0)} counties · recognized maker in {formatInteger(equipment?.countiesWithRecognizedEquipment||0)}</p>
                    </div>}
                    <dl className="home-map-state-preview-facts">
                      <div><dt>{mapMetric === 'agency-records' ? 'Agency records' : activeMapMetric.label}</dt><dd data-testid="text-preview-metric">{formatStateMapValue(mapMetric, datum.value)}</dd></div>
                      {mapMetric === 'agency-records'
                        ? <div><dt>Counties in directory</dt><dd>{formatInteger(territoryEngine.getCountiesForState(code).length)}</dd></div>
                        : <div><dt>Agency records</dt><dd data-testid="text-preview-agencies">{formatInteger(count)}</dd></div>}
                    </dl>
                    <button type="button" className="home-map-state-preview-action" data-testid="button-preview-explore" onClick={() => handleStateClick(code)}>
                      Explore {code}
                    </button>
                  </div>
                );
              })()}
              {/* East Coast Compact Callout Buttons */}
              <div className="home-map-shortcuts pt-2 border-t border-[#294158] text-xs">
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
                      onClick={() => handleStateClick(c.code)}
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
                      className="min-h-10 min-w-10 px-2 rounded-md border border-[#3B5668] bg-[#112333] text-[12px] font-bold font-mono text-[#D3E1E7] transition-[background-color,color,outline] hover:bg-[#1D3B50] focus:outline focus:outline-2 focus:outline-[#67D6CE]"
                    >
                      {c.code}
                    </button>
                  );
                })}
                </div>
              </div>
              </aside>
              <div className="home-map-content-stack home-map-content-v2 flex flex-col gap-3">
              <div className="home-map-visual-stack home-map-visual-v2">
              {hasNationwideMapGeometry ? (
              <div
                ref={mapViewportRef}
                data-map-zoom={mapZoom}
                className="home-map-viewport overflow-auto overscroll-contain rounded-lg border border-[#34536D] bg-[#081521] shadow-[inset_0_0_0_1px_rgba(106,150,183,0.08)]"
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
                    <rect width="7" height="7" fill="#172A3D" />
                    <path d="M 0 0 L 0 7" stroke="#8299AF" strokeWidth="2" />
                  </pattern>
                </defs>
                <g transform={`translate(${HOME_MAP_TRANSLATE_X} 0)`}>

                {/* Alaska & Hawaii Cartographic Inset Frames */}
                <g>
                  <rect x="14" y="356" width="174" height="134" rx="10" fill="#0C1B2A" fillOpacity="0.98" stroke="#52718D" strokeWidth="1.25" strokeDasharray="4 4" />
                  <text x="24" y="373" fill="#C3D3E2" fontSize="10" fontWeight="800" fontFamily="monospace">ALASKA (AK)</text>

                  <rect x="196" y="396" width="124" height="94" rx="10" fill="#0C1B2A" fillOpacity="0.98" stroke="#52718D" strokeWidth="1.25" strokeDasharray="4 4" />
                  <text x="206" y="413" fill="#C3D3E2" fontSize="10" fontWeight="800" fontFamily="monospace">HAWAII (HI)</text>
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
                    const fillColor = equipmentFilter.presence!=='all'?equipmentCoverageColor(equipmentCoverage.byState[st.code],equipmentFilter):hasReportedValue(datum.value)
                      ? interpolateStateFill(mapMetric, datum.value, mapMetricMin, mapMetricMax, activeMapPalette)
                      : 'url(#home-map-missing-data)';
                    const equipmentState=equipmentCoverage.byState[st.code];
                    const stateAriaLabel = equipmentFilter.presence!=='all'?`${st.state}. ${equipmentState?.matched||0} selected equipment matches; ZOLL records ${equipmentState?.zoll||0}; other manufacturer records ${equipmentState?.competitor||0}; mixed records ${equipmentState?.mixed||0}; no recognized maker ${equipmentState?.unknown||0}; loaded agency records in ${equipmentState?.countiesWithAgencyRecords||0} of ${equipmentState?.countyCount||0} counties. Totals describe loaded records.`:`${st.state}. ${activeMapMetric.label}: ${formatStateMapValue(mapMetric, datum.value)}. ${datum.coverage}. Period: ${datum.period}${datum.claimScope ? `. Scope: ${datum.claimScope}. Definition: ${datum.denialDefinition}` : ''}${datum.source ? `. Source: ${datum.source}` : ''}`;

                    return (
                      <g
                        key={`home-poly-${st.code}`}
                        transform={isHomeMapInsetState(st.code) ? undefined : HOME_MAP_GEOMETRY_TRANSFORM}
                        opacity={isInRegion ? 1 : 0.36}
                      >
                        <path
                          d={boundary.d}
                          fill={fillColor}
                          stroke={isSelected ? '#F4C86A' : isHovered ? '#B6F1E8' : '#152A3D'}
                          strokeWidth={isSelected ? 2.6 : isHovered ? 1.8 : 1.15}
                          strokeLinejoin="round"
                          vectorEffect="non-scaling-stroke"
                          onClick={() => handleStateClick(st.code)}
                          onMouseEnter={() => setHoveredStateCode(st.code)}
                          onFocus={() => setFocusedStateCode(st.code)}
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
                          className={`home-map-state-path cursor-pointer transition-[fill,stroke,opacity] duration-150 focus:outline-none${isSelected ? ' is-selected' : ''}${isHovered ? ' is-hovered' : ''}`}
                        >
                          <title>{`${st.state} (${st.code}) · ${activeMapMetric.label}: ${formatStateMapValue(mapMetric, datum.value)} · ${datum.coverage} · Period ${datum.period}${datum.claimScope ? ` · ${datum.claimScope} · ${datum.denialDefinition}` : ''}${datum.source ? ` · ${datum.source}` : ''} · ${countyCount} counties`}</title>
                        </path>
                        {(isSelected || isHovered) && (
                          <g pointerEvents="none" className="home-map-state-ring">
                            <path d={boundary.d} fill="none" stroke="#06101B" strokeWidth={isSelected ? 5 : 3.6} strokeLinejoin="round" vectorEffect="non-scaling-stroke" strokeOpacity="0.85" />
                            <path d={boundary.d} fill="none" stroke={isSelected ? '#F4C86A' : '#B6F1E8'} strokeWidth={isSelected ? 2.4 : 1.6} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
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
                      const cFill = equipmentFilter.presence!=='all'?equipmentCoverageColor(equipmentCoverage.byState[st.code],equipmentFilter):hasReportedValue(cDatum.value)
                        ? interpolateStateFill(mapMetric, cDatum.value, mapMetricMin, mapMetricMax, activeMapPalette)
                        : '#172A3D';
                      return (
                        <g
                          key={`home-lbl-${st.code}`}
                          className="home-map-leader"
                          opacity={cIn ? 1 : 0.4}
                          onClick={() => handleStateClick(st.code)}
                          onMouseEnter={() => setHoveredStateCode(st.code)}
                          style={{ cursor: 'pointer' }}
                          aria-hidden="true"
                        >
                          <polyline
                            points={`${anchor.x},${anchor.y} ${callout.calloutX - 22},${callout.calloutY} ${callout.calloutX - 14},${callout.calloutY}`}
                            fill="none"
                            stroke={cSel ? '#F4C86A' : cHov ? '#B6F1E8' : '#6F8AA3'}
                            strokeWidth={cSel || cHov ? 1.3 : 0.8}
                            pointerEvents="none"
                          />
                          <circle cx={anchor.x} cy={anchor.y} r="1.8" fill={cSel ? '#F4C86A' : '#C9D8E6'} pointerEvents="none" />
                          <rect x={callout.calloutX - 14} y={callout.calloutY - 9} width="28" height="18" rx="4" fill="#102235" stroke={cSel ? '#F4C86A' : cHov ? '#67D6CE' : '#7590A8'} strokeWidth={cSel ? 2 : 1.1} />
                          <rect x={callout.calloutX - 12} y={callout.calloutY - 7} width="4" height="14" rx="1.5" fill={cFill} />
                          <text x={callout.calloutX + 3} y={callout.calloutY + 3.5} textAnchor="middle" fill={cSel ? '#F4C86A' : '#E1EDF7'} fontSize="10" fontWeight="800" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">{st.code}</text>
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
                          fill={isSelected ? '#F4C86A' : '#102235'}
                          fillOpacity="0.98"
                          stroke={isSelected ? '#FFF0C4' : isHovered ? '#67D6CE' : '#7590A8'}
                          strokeWidth={isSelected ? 2 : isHovered ? 1.6 : 1.1}
                        />
                        <text
                          textAnchor="middle"
                          dy="3.5"
                          fill={isSelected ? '#17202A' : '#E1EDF7'}
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

      </section>

    </div>
  );
};
