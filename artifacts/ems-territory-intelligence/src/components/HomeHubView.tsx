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
  RotateCcw
} from 'lucide-react';
import { ALL_50_STATES_SUMMARIES } from '../data/nationalGeographicData';
import { US_STATES_SVG_PATHS, EAST_COAST_CALLOUT_STATES } from '../data/usStatesSvgPaths';
import { territoryEngine } from '../services/territoryIntelligenceEngine';
import { formatInteger, formatScore } from '../utils/numberFormatting';

const HOME_MAP_TRANSLATE_X = 48;

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

const MAP_PALETTES: Record<string, { stops: string[]; lowLabel: string; highLabel: string }> = {
  'agency-records': { stops: ['#00E676', '#AEEA00', '#FFEA00', '#FF9100', '#FF1744'], lowLabel: 'Fewer', highLabel: 'More' },
  ambulances: { stops: ['#00E676', '#AEEA00', '#FFEA00', '#FF9100', '#FF1744'], lowLabel: 'Fewer', highLabel: 'More' },
  'fire-engines': { stops: ['#00E676', '#AEEA00', '#FFEA00', '#FF9100', '#FF1744'], lowLabel: 'Fewer', highLabel: 'More' },
  pulseiq: { stops: ['#00E676', '#AEEA00', '#FFEA00', '#FF9100', '#FF1744'], lowLabel: 'Lower priority', highLabel: 'Higher priority' },
  'cardiac-survival': { stops: ['#FF1744', '#FF9100', '#FFEA00', '#AEEA00', '#00E676'], lowLabel: 'Lower', highLabel: 'Higher · stronger' },
  'scene-transit': { stops: ['#00E676', '#AEEA00', '#FFEA00', '#FF9100', '#FF1744'], lowLabel: 'Shorter', highLabel: 'Longer · concerning' },
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
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue > 0.2 ? '#10233A' : '#FFFFFF';
};

interface HomeHubViewProps {
  agencies: Agency[];
  onNavigateTab: (tab: string) => void;
  globalCategory: 'all' | 'ems' | 'fire';
  globalState?: string;
  globalCounty?: string;
  globalCity?: string;
  onSelectState?: (stateCode: string) => void;
}

export const HomeHubView: React.FC<HomeHubViewProps> = ({
  agencies,
  onNavigateTab,
  globalCategory,
  globalState,
  globalCounty,
  globalCity,
  onSelectState
}) => {
  const [selectedStateCode, setSelectedStateCode] = useState<string>(() => {
    const code = globalState?.trim().toUpperCase();
    const saved = readMapPreference('state', 'FL').toUpperCase();
    return code && code !== 'ALL' && ALL_50_STATES_SUMMARIES[code]
      ? code
      : ALL_50_STATES_SUMMARIES[saved]
        ? saved
        : 'FL';
  });
  const [hoveredStateCode, setHoveredStateCode] = useState<string | null>(null);
  const [regionFilter, setRegionFilter] = useState<StateMapRegion>(() => {
    const saved = readMapPreference('region', 'All');
    return ['All', 'Northeast', 'Midwest', 'South', 'West'].includes(saved) ? saved as StateMapRegion : 'All';
  });
  const [mapMetric, setMapMetric] = useState<StateMapMetricKey>(() => {
    const saved = readMapPreference('metric', 'agency-records');
    return STATE_MAP_METRICS.some((metric) => metric.key === saved) ? saved as StateMapMetricKey : 'agency-records';
  });
  const [mapZoom, setMapZoom] = useState(() => {
    const saved = Number(readMapPreference('zoom', '1'));
    return Number.isFinite(saved) ? Math.max(1, Math.min(1.8, saved)) : 1;
  });
  const mapViewportRef = useRef<HTMLDivElement>(null);
  const hasInitializedMapRef = useRef(false);

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

  useEffect(() => {
    const code = globalState?.trim().toUpperCase();
    if (code && code !== 'ALL' && ALL_50_STATES_SUMMARIES[code]) {
      setSelectedStateCode(code);
    }
  }, [globalState]);


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
  const activeMapPalette = MAP_PALETTES[mapMetric] ?? MAP_PALETTES['agency-records'];

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
    const stateX = (stateBoundary.labelX + HOME_MAP_TRANSLATE_X) * scale;
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
    saveMapPreference('state', code);
    if (onSelectState) {
      onSelectState(code);
    } else {
      onNavigateTab('states_directory');
    }
  };

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
              <Compass className="w-5 h-5 text-[#285EE8] dark:text-blue-400 shrink-0" />
              <span>Interactive U.S. Territory Map</span>
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

        {/* The Home screen keeps the interactive map as its only main content. */}
        <div className="grid grid-cols-1 gap-4 items-start">
          <div className="min-w-0 space-y-3">
            <div
              className="home-territory-map-panel home-map-stage-v2 relative bg-[#07111D] rounded-xl border border-[#294158] overflow-hidden p-3 sm:p-4 shadow-[0_16px_48px_rgba(2,8,18,0.28)]"
              onMouseLeave={() => setHoveredStateCode(null)}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setHoveredStateCode(null);
                }
              }}
            >
              <div className="home-map-control-row home-map-toolbar-v2 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
                <label htmlFor="home-state-map-metric" className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9CB1C7]">
                  Shade states by
                  <select
                    id="home-state-map-metric"
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
                <div className="home-map-zoom-control flex items-center gap-1.5 self-start sm:self-auto rounded-lg border border-[#304A61] bg-[#101F30] p-1" role="group" aria-label="Map zoom controls">
                  <button
                    type="button"
                    data-testid="button-map-zoom-in"
                    onClick={() => setMapZoom((zoom) => {
                      const nextZoom = Math.min(1.8, +(zoom + 0.2).toFixed(1));
                      saveMapPreference('zoom', String(nextZoom));
                      return nextZoom;
                    })}
                    disabled={mapZoom >= 1.8}
                    aria-label="Zoom in on map"
                    title="Zoom in"
                    className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md text-[#C7D7E6] hover:bg-[#1C3449] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#65D7D0]"
                  >
                    <ZoomIn className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <span className="min-w-12 text-center font-mono text-[11px] font-bold tabular-nums text-[#9CB1C7]" aria-live="polite">{Math.round(mapZoom * 100)}%</span>
                  <button
                    type="button"
                    data-testid="button-map-zoom-out"
                    onClick={() => setMapZoom((zoom) => {
                      const nextZoom = Math.max(1, +(zoom - 0.2).toFixed(1));
                      saveMapPreference('zoom', String(nextZoom));
                      return nextZoom;
                    })}
                    disabled={mapZoom <= 1}
                    aria-label="Zoom out on map"
                    title="Zoom out"
                    className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md text-[#C7D7E6] hover:bg-[#1C3449] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#65D7D0]"
                  >
                    <ZoomOut className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    data-testid="button-map-zoom-reset"
                    onClick={() => {
                      setMapZoom(1);
                      saveMapPreference('zoom', '1');
                    }}
                    disabled={mapZoom === 1}
                    aria-label="Reset map zoom"
                    title="Reset zoom"
                    className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md text-[#C7D7E6] hover:bg-[#1C3449] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#65D7D0]"
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="home-map-legend home-map-legend-v2 flex flex-nowrap items-center gap-x-5 overflow-x-auto rounded-lg bg-[#101F30] border border-[#294158] px-3.5 py-2.5">
                <span className="shrink-0 text-[11px] font-bold text-[#E4EEF8]">{activeMapMetric.label}</span>
                <span className="flex shrink-0 items-center gap-2 whitespace-nowrap text-[11px] font-medium text-[#B2C2D2]">
                  <span className="home-map-legend-endpoint">{mapMetricValues.length ? formatStateMapValue(mapMetric, mapMetricMin) : '—'} · {activeMapPalette.lowLabel}</span>
                  <span className="h-3 w-24 rounded-full border border-[#7790A7]" style={{ background: getMapGradient(mapMetric) }} aria-hidden="true" />
                  <span className="home-map-legend-endpoint home-map-legend-endpoint-high">{mapMetricValues.length ? formatStateMapValue(mapMetric, mapMetricMax) : '—'} · {activeMapPalette.highLabel}</span>
                </span>
                {mapMetricValues.some((value) => value === 0) && (
                  <span className="flex shrink-0 items-center gap-2 whitespace-nowrap text-[11px] font-medium text-[#B2C2D2]">
                    <span className="inline-block h-4 w-4 rounded-sm border border-[#7790A7]" style={{ backgroundColor: interpolateStateFill(mapMetric, 0, mapMetricMin, mapMetricMax) }} aria-hidden="true" />
                    Reported 0
                  </span>
                )}
                <span className="flex shrink-0 items-center gap-2 whitespace-nowrap text-[11px] font-medium text-[#B2C2D2]">
                  <span className="inline-block h-4 w-4 rounded-sm border border-[#7890A8] bg-[repeating-linear-gradient(135deg,#172A3D_0px,#172A3D_3px,#7890A8_3px,#7890A8_4px)]" aria-hidden="true" />
                  Not reported
                </span>
                <span className="shrink-0 text-[10px] text-[#8298AE]">Hatch = missing</span>
              </div>

              <div className="home-map-content-stack home-map-content-v2 flex flex-col gap-3">
              <div className="home-map-visual-stack home-map-visual-v2">
              <p className="text-[10px] text-[#A2B5C8] sm:hidden">
                Zoom in to inspect a state, then swipe to pan.
              </p>

              <div
                ref={mapViewportRef}
                data-map-zoom={mapZoom}
                className="home-map-viewport overflow-auto overscroll-contain rounded-lg border border-[#34536D] bg-[#081521] shadow-[inset_0_0_0_1px_rgba(106,150,183,0.08)]"
              >
              <svg
                viewBox="0 0 920 500"
                className="home-map-svg block h-auto select-none"
                style={{ aspectRatio: '920 / 500', width: `${mapZoom * 100}%` }}
                data-fit-screen={mapZoom === 1 ? 'true' : 'false'}
                role="group"
                aria-label={`Interactive United States map shaded by ${activeMapMetric.label}, zoom ${Math.round(mapZoom * 100)} percent`}
              >
                <defs>
                  <linearGradient id="home-map-ocean" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stopColor="#102c3b" />
                    <stop offset=".48" stopColor="#0a1e2d" />
                    <stop offset="1" stopColor="#071521" />
                  </linearGradient>
                  <radialGradient id="home-map-atmosphere" cx=".53" cy=".43" r=".7">
                    <stop offset="0" stopColor="#2a5a67" stopOpacity=".34" />
                    <stop offset=".55" stopColor="#183b4b" stopOpacity=".15" />
                    <stop offset="1" stopColor="#071521" stopOpacity="0" />
                  </radialGradient>
                  <filter id="home-map-land-glow" x="-12%" y="-12%" width="124%" height="124%">
                    <feGaussianBlur stdDeviation="9" />
                  </filter>
                  <pattern id="home-map-bathymetry" width="260" height="180" patternUnits="userSpaceOnUse">
                    <path d="M-34 111C12 58 67 47 110 72s79 29 136-15M-26 140C20 87 74 77 119 101s83 27 143-18M-9 168c39-43 84-48 126-27s78 24 129-12" fill="none" stroke="#75a3ae" strokeOpacity=".14" strokeWidth="1" />
                    <path d="M189-25c-35 28-42 58-16 83s29 56 6 95M225-21c-35 28-42 58-16 83s29 56 6 95" fill="none" stroke="#75a3ae" strokeOpacity=".095" strokeWidth="1" />
                  </pattern>
                  <pattern id="home-map-missing-data" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
                    <rect width="7" height="7" fill="#172A3D" />
                    <path d="M 0 0 L 0 7" stroke="#8299AF" strokeWidth="2" />
                  </pattern>
                </defs>
                <rect width="920" height="500" fill="url(#home-map-ocean)" />
                <rect width="920" height="500" fill="url(#home-map-atmosphere)" />
                <rect width="920" height="500" fill="url(#home-map-bathymetry)" />
                <g fill="none" stroke="#8ab5bd" strokeOpacity=".14" strokeWidth=".8" pointerEvents="none">
                  <path d="M0 116C220 94 480 99 920 74M0 194C232 174 534 180 920 151M0 272C238 249 538 260 920 232M0 350C236 329 554 339 920 311M0 428C252 409 590 415 920 389" />
                  <path d="M118 0C138 130 140 320 124 500M286 0C300 146 303 354 291 500M454 0C462 151 463 350 458 500M622 0C621 150 631 350 643 500M790 0C777 160 790 350 811 500" strokeDasharray="2 8" />
                  <ellipse cx="465" cy="245" rx="400" ry="206" strokeOpacity=".12" strokeDasharray="3 8" />
                  <ellipse cx="465" cy="245" rx="350" ry="178" strokeOpacity=".08" />
                </g>
                <g transform={`translate(${HOME_MAP_TRANSLATE_X} 0)`}>

                {/* Alaska & Hawaii Cartographic Inset Frames */}
                <g>
                  <rect x="14" y="356" width="174" height="134" rx="10" fill="#0C1B2A" fillOpacity="0.98" stroke="#52718D" strokeWidth="1.25" strokeDasharray="4 4" />
                  <text x="24" y="373" fill="#C3D3E2" fontSize="10" fontWeight="800" fontFamily="monospace">ALASKA (AK)</text>

                  <rect x="196" y="396" width="124" height="94" rx="10" fill="#0C1B2A" fillOpacity="0.98" stroke="#52718D" strokeWidth="1.25" strokeDasharray="4 4" />
                  <text x="206" y="413" fill="#C3D3E2" fontSize="10" fontWeight="800" fontFamily="monospace">HAWAII (HI)</text>
                </g>

                {/* A restrained coastal halo separates the national silhouette from the ocean field. */}
                <g fill="#58d2d1" opacity="0.3" filter="url(#home-map-land-glow)" pointerEvents="none" aria-hidden="true">
                  {Object.values(ALL_50_STATES_SUMMARIES).map((st) => {
                    const boundary = US_STATES_SVG_PATHS[st.code];
                    return boundary?.d ? <path key={`home-glow-${st.code}`} d={boundary.d} /> : null;
                  })}
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
                            stroke="#67D6CE"
                            strokeWidth="7"
                            strokeLinejoin="round"
                            pointerEvents="none"
                          />
                        )}
                        {isSelected && (
                          <path
                            d={boundary.d}
                            fill="none"
                            stroke="#F4C86A"
                            strokeWidth="3.5"
                            strokeLinejoin="round"
                            pointerEvents="none"
                          />
                        )}
                        <path
                          d={boundary.d}
                          fill={fillColor}
                          stroke={isSelected ? '#F4C86A' : isHovered ? '#B6F1E8' : '#152A3D'}
                          strokeWidth={isSelected ? 2.3 : isHovered ? 1.8 : 1.15}
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
                          className={`home-map-state-path cursor-pointer transition-[fill,stroke,opacity] duration-150 focus:outline-none focus:stroke-[#67D6CE] focus:stroke-[3px]${isSelected ? ' is-selected' : ''}${isHovered ? ' is-hovered' : ''}`}
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

              {/* East Coast Compact Callout Buttons */}
              <div className="home-map-shortcuts pt-2 border-t border-[#294158] flex flex-wrap items-center gap-1.5 text-xs">
                <span className="text-[11px] font-semibold text-[#91A6BB] mr-1">
                  Small-state shortcuts:
                </span>
                {EAST_COAST_CALLOUT_STATES.map((c) => {
                  const isSelected = selectedStateCode === c.code;
                  const datum = stateMapMetricsByCode[c.code][mapMetric];
                  return (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => handleStateClick(c.code)}
                      onMouseEnter={() => setHoveredStateCode(c.code)}
                      onFocus={() => setHoveredStateCode(c.code)}
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
              </div>
            </div>
          </div>
        </div>

      </section>

    </div>
  );
};
