import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Compass, RotateCcw, ZoomIn, ZoomOut } from 'lucide-react';
import { EAST_COAST_CALLOUT_STATES, US_STATES_SVG_PATHS } from './usStatesSvgPaths';
import './_group.css';
import './CompactMap.css';

type StateMapRegion = 'All' | 'Northeast' | 'Midwest' | 'South' | 'West';
type StateMapMetricKey = 'agency-records' | 'ambulances' | 'fire-engines' | 'pulseiq' | 'cardiac-survival' | 'scene-transit';

interface DemoState {
  code: string;
  state: string;
  region: Exclude<StateMapRegion, 'All'>;
  agencies: number;
  survival: number;
  transit: number;
}

// State reference figures are copied from the source app's national state summaries.
// The directory asset rollups below are realistic sandbox demo values, not live app data.
const STATES: DemoState[] = [
  { code: 'AL', state: 'Alabama', region: 'South', agencies: 420, survival: 24.1, transit: 24.2 },
  { code: 'AK', state: 'Alaska', region: 'West', agencies: 160, survival: 27.8, transit: 38.4 },
  { code: 'AZ', state: 'Arizona', region: 'West', agencies: 380, survival: 32.4, transit: 22.8 },
  { code: 'AR', state: 'Arkansas', region: 'South', agencies: 310, survival: 22.9, transit: 26.1 },
  { code: 'CA', state: 'California', region: 'West', agencies: 1420, survival: 32.8, transit: 19.5 },
  { code: 'CO', state: 'Colorado', region: 'West', agencies: 480, survival: 34.1, transit: 24.4 },
  { code: 'CT', state: 'Connecticut', region: 'Northeast', agencies: 290, survival: 33.6, transit: 16.8 },
  { code: 'DE', state: 'Delaware', region: 'South', agencies: 80, survival: 28.9, transit: 18.2 },
  { code: 'DC', state: 'District of Columbia', region: 'South', agencies: 12, survival: 25.4, transit: 15.1 },
  { code: 'FL', state: 'Florida', region: 'South', agencies: 960, survival: 27.5, transit: 21.2 },
  { code: 'GA', state: 'Georgia', region: 'South', agencies: 620, survival: 23.8, transit: 24.9 },
  { code: 'HI', state: 'Hawaii', region: 'West', agencies: 40, survival: 31.9, transit: 23.1 },
  { code: 'ID', state: 'Idaho', region: 'West', agencies: 220, survival: 29.8, transit: 28.9 },
  { code: 'IL', state: 'Illinois', region: 'Midwest', agencies: 1220, survival: 28.2, transit: 17.9 },
  { code: 'IN', state: 'Indiana', region: 'Midwest', agencies: 740, survival: 25.1, transit: 21.4 },
  { code: 'IA', state: 'Iowa', region: 'Midwest', agencies: 510, survival: 28.7, transit: 23.5 },
  { code: 'KS', state: 'Kansas', region: 'Midwest', agencies: 440, survival: 26.5, transit: 25.8 },
  { code: 'KY', state: 'Kentucky', region: 'South', agencies: 580, survival: 23.4, transit: 24.8 },
  { code: 'LA', state: 'Louisiana', region: 'South', agencies: 390, survival: 21.8, transit: 25.2 },
  { code: 'ME', state: 'Maine', region: 'Northeast', agencies: 260, survival: 29.4, transit: 29.1 },
  { code: 'MD', state: 'Maryland', region: 'South', agencies: 360, survival: 30.8, transit: 19.1 },
  { code: 'MA', state: 'Massachusetts', region: 'Northeast', agencies: 460, survival: 34.6, transit: 16.5 },
  { code: 'MI', state: 'Michigan', region: 'Midwest', agencies: 790, survival: 26.8, transit: 21.8 },
  { code: 'MN', state: 'Minnesota', region: 'Midwest', agencies: 590, survival: 35.8, transit: 20.4 },
  { code: 'MS', state: 'Mississippi', region: 'South', agencies: 340, survival: 20.4, transit: 27.8 },
  { code: 'MO', state: 'Missouri', region: 'Midwest', agencies: 670, survival: 24.9, transit: 23.1 },
  { code: 'MT', state: 'Montana', region: 'West', agencies: 190, survival: 28.1, transit: 34.6 },
  { code: 'NE', state: 'Nebraska', region: 'Midwest', agencies: 360, survival: 31.4, transit: 24.1 },
  { code: 'NV', state: 'Nevada', region: 'West', agencies: 130, survival: 28.4, transit: 21.9 },
  { code: 'NH', state: 'New Hampshire', region: 'Northeast', agencies: 210, survival: 33.1, transit: 20.5 },
  { code: 'NJ', state: 'New Jersey', region: 'Northeast', agencies: 680, survival: 31.5, transit: 16.4 },
  { code: 'NM', state: 'New Mexico', region: 'West', agencies: 240, survival: 25.8, transit: 29.4 },
  { code: 'NY', state: 'New York', region: 'Northeast', agencies: 1280, survival: 30.2, transit: 18.2 },
  { code: 'NC', state: 'North Carolina', region: 'South', agencies: 840, survival: 31.2, transit: 24.5 },
  { code: 'ND', state: 'North Dakota', region: 'Midwest', agencies: 170, survival: 30.1, transit: 31.2 },
  { code: 'OH', state: 'Ohio', region: 'Midwest', agencies: 1180, survival: 26.4, transit: 18.4 },
  { code: 'OK', state: 'Oklahoma', region: 'South', agencies: 490, survival: 22.4, transit: 26.4 },
  { code: 'OR', state: 'Oregon', region: 'West', agencies: 320, survival: 35.1, transit: 22.1 },
  { code: 'PA', state: 'Pennsylvania', region: 'Northeast', agencies: 1650, survival: 25.8, transit: 22 },
  { code: 'RI', state: 'Rhode Island', region: 'Northeast', agencies: 90, survival: 31.8, transit: 15.9 },
  { code: 'SC', state: 'South Carolina', region: 'South', agencies: 490, survival: 25.9, transit: 23.9 },
  { code: 'SD', state: 'South Dakota', region: 'Midwest', agencies: 180, survival: 28.9, transit: 29.8 },
  { code: 'TN', state: 'Tennessee', region: 'South', agencies: 610, survival: 24.6, transit: 23.4 },
  { code: 'TX', state: 'Texas', region: 'South', agencies: 1840, survival: 23.1, transit: 24.8 },
  { code: 'UT', state: 'Utah', region: 'West', agencies: 210, survival: 36.4, transit: 21.2 },
  { code: 'VT', state: 'Vermont', region: 'Northeast', agencies: 140, survival: 32.7, transit: 27.6 },
  { code: 'VA', state: 'Virginia', region: 'South', agencies: 590, survival: 29.8, transit: 21.6 },
  { code: 'WA', state: 'Washington', region: 'West', agencies: 540, survival: 38.4, transit: 20.8 },
  { code: 'WV', state: 'West Virginia', region: 'South', agencies: 320, survival: 21.4, transit: 31.4 },
  { code: 'WI', state: 'Wisconsin', region: 'Midwest', agencies: 650, survival: 30.6, transit: 21.5 },
  { code: 'WY', state: 'Wyoming', region: 'West', agencies: 110, survival: 26.9, transit: 36.2 },
];

const COUNTY_COUNTS: Record<string, number> = {
  AL: 67, AK: 29, AZ: 15, AR: 75, CA: 58, CO: 64, CT: 8, DE: 3, DC: 1, FL: 67,
  GA: 159, HI: 5, ID: 44, IL: 102, IN: 92, IA: 99, KS: 105, KY: 120, LA: 64, ME: 16,
  MD: 24, MA: 14, MI: 83, MN: 87, MS: 82, MO: 115, MT: 56, NE: 93, NV: 17, NH: 10,
  NJ: 21, NM: 33, NY: 62, NC: 100, ND: 53, OH: 88, OK: 77, OR: 36, PA: 67, RI: 5,
  SC: 46, SD: 66, TN: 95, TX: 254, UT: 29, VT: 14, VA: 133, WA: 39, WV: 55, WI: 72, WY: 23,
};

const STATE_MAP_METRICS: { key: StateMapMetricKey; label: string }[] = [
  { key: 'agency-records', label: 'Agency directory records' },
  { key: 'ambulances', label: 'Agency-profile ambulance total' },
  { key: 'fire-engines', label: 'Agency-profile fire-engine total' },
  { key: 'pulseiq', label: 'PulseIQ estimate · modeled average' },
  { key: 'cardiac-survival', label: 'Cardiac survival estimate (%)' },
  { key: 'scene-transit', label: 'EMS transit estimate (minutes)' },
];
const MAP_PALETTES: Record<StateMapMetricKey, { stops: string[]; lowLabel: string; highLabel: string }> = {
  'agency-records': { stops: ['#00E676', '#AEEA00', '#FFEA00', '#FF9100', '#FF1744'], lowLabel: 'Fewer', highLabel: 'More' },
  ambulances: { stops: ['#00E676', '#AEEA00', '#FFEA00', '#FF9100', '#FF1744'], lowLabel: 'Fewer', highLabel: 'More' },
  'fire-engines': { stops: ['#00E676', '#AEEA00', '#FFEA00', '#FF9100', '#FF1744'], lowLabel: 'Fewer', highLabel: 'More' },
  pulseiq: { stops: ['#00E676', '#AEEA00', '#FFEA00', '#FF9100', '#FF1744'], lowLabel: 'Lower priority', highLabel: 'Higher priority' },
  'cardiac-survival': { stops: ['#FF1744', '#FF9100', '#FFEA00', '#AEEA00', '#00E676'], lowLabel: 'Lower', highLabel: 'Higher · stronger' },
  'scene-transit': { stops: ['#00E676', '#AEEA00', '#FFEA00', '#FF9100', '#FF1744'], lowLabel: 'Shorter', highLabel: 'Longer · concerning' },
};
const MISSING_AMBULANCES = new Set(['AK', 'HI', 'ME', 'ND', 'SD', 'VT', 'WY']);
const MISSING_ENGINES = new Set(['AK', 'HI', 'ME', 'NH', 'RI', 'VT', 'WY']);
const MISSING_PULSEIQ = new Set(['AK', 'HI', 'WY']);

const hasReportedValue = (value: number | null): value is number => value !== null && Number.isFinite(value);
const formatInteger = (value: number) => Math.round(value).toLocaleString('en-US');
const formatScore = (value: number) => `${Math.max(0, Math.min(100, Math.round(value)))}/100`;
const formatStateMapValue = (metric: StateMapMetricKey, value: number | null) => {
  if (value === null) return 'Not reported';
  if (metric === 'cardiac-survival') return `${value.toFixed(1)}%`;
  if (metric === 'scene-transit') return `${value.toFixed(1)} min`;
  if (metric === 'pulseiq') return formatScore(value);
  return formatInteger(value);
};
const hexToRgb = (hex: string) => hex.match(/[0-9a-f]{2}/gi)?.map((channel) => parseInt(channel, 16)) ?? [0, 0, 0];
const interpolateStateFill = (metric: StateMapMetricKey, value: number, min: number, max: number) => {
  const t = max === min ? 0.5 : Math.max(0, Math.min(1, (value - min) / (max - min)));
  const stops = MAP_PALETTES[metric].stops;
  const scaled = t * (stops.length - 1);
  const stopIndex = Math.min(stops.length - 2, Math.floor(scaled));
  const localT = scaled - stopIndex;
  const start = hexToRgb(stops[stopIndex]);
  const end = hexToRgb(stops[stopIndex + 1]);
  const channels = start.map((channel, index) => Math.round(channel + (end[index] - channel) * localT));
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
};
const getMapGradient = (metric: StateMapMetricKey) => `linear-gradient(to right, ${MAP_PALETTES[metric].stops.join(', ')})`;
const readableTextForFill = (hexColor: string) => {
  const channels = hexColor.match(/[0-9a-f]{2}/gi)?.map((channel) => parseInt(channel, 16)) ?? [219, 234, 254];
  const [red, green, blue] = channels.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue > 0.2 ? '#10233A' : '#FFFFFF';
};

type MapDatum = { value: number | null; coverage: string; period: string };
type StateMetrics = Record<StateMapMetricKey, MapDatum>;
const STATE_MAP_METRICS_BY_CODE: Record<string, StateMetrics> = Object.fromEntries(
  STATES.map((state) => {
    const ambulances = MISSING_AMBULANCES.has(state.code) ? null : Math.round(state.agencies * 1.85);
    const fireEngines = MISSING_ENGINES.has(state.code)
      ? null
      : state.code === 'DC'
        ? 0
        : Math.round(state.agencies * 0.45);
    const pulseIq = MISSING_PULSEIQ.has(state.code)
      ? null
      : Math.round(50 + state.survival * 0.75 - state.transit * 0.2);
    const profilePeriod = 'Sandbox demo profile rollup; profile periods vary or are not stated.';
    return [state.code, {
      'agency-records': {
        value: state.agencies,
        coverage: `${formatInteger(state.agencies)} sandbox demo directory records for ${state.state}.`,
        period: 'Sandbox demo values based on the app’s state reference summary.',
      },
      ambulances: {
        value: ambulances,
        coverage: ambulances === null
          ? `Ambulance profile total is not reported for this sandbox demo state.`
          : `Sandbox demo ambulance sum across state agency profiles.`,
        period: profilePeriod,
      },
      'fire-engines': {
        value: fireEngines,
        coverage: fireEngines === null
          ? `Fire-engine profile total is not reported for this sandbox demo state.`
          : `Sandbox demo fire-engine sum across state agency profiles.`,
        period: profilePeriod,
      },
      pulseiq: {
        value: pulseIq,
        coverage: pulseIq === null
          ? 'Modeled average is not reported for this sandbox demo state.'
          : 'Sandbox demo mean of available modeled agency profile scores.',
        period: 'Modeled demo estimate; source periods are not standardized.',
      },
      'cardiac-survival': {
        value: state.survival,
        coverage: 'State-level cardiac survival estimate from the app’s reference profile.',
        period: 'Reporting period is not stated.',
      },
      'scene-transit': {
        value: state.transit,
        coverage: 'State-level EMS transit estimate from the app’s reference profile.',
        period: 'Reporting period is not stated.',
      },
    } satisfies StateMetrics];
  }),
);

export function CompactMap() {
  const [selectedStateCode, setSelectedStateCode] = useState('FL');
  const [hoveredStateCode, setHoveredStateCode] = useState<string | null>(null);
  const [regionFilter, setRegionFilter] = useState<StateMapRegion>('All');
  const [mapMetric, setMapMetric] = useState<StateMapMetricKey>('agency-records');
  const [mapZoom, setMapZoom] = useState(1);
  const mapViewportRef = useRef<HTMLDivElement>(null);
  const hasInitializedMapRef = useRef(false);
  const stateByCode = useMemo(() => Object.fromEntries(STATES.map((state) => [state.code, state])), []);
  const hoverReadoutStateCode = hoveredStateCode || selectedStateCode;
  const mapMetricValues = Object.values(STATE_MAP_METRICS_BY_CODE)
    .map((metrics) => metrics[mapMetric].value)
    .filter(hasReportedValue);
  const mapMetricMin = mapMetricValues.length ? Math.min(...mapMetricValues) : 0;
  const mapMetricMax = mapMetricValues.length ? Math.max(...mapMetricValues) : 0;
  const activeMapMetric = STATE_MAP_METRICS.find((metric) => metric.key === mapMetric)!;
  const activeMapPalette = MAP_PALETTES[mapMetric];
  const mapReadoutMetric = STATE_MAP_METRICS_BY_CODE[hoverReadoutStateCode][mapMetric];
  const mapReadoutState = stateByCode[hoverReadoutStateCode];

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
    const desiredLeft = stateBoundary.labelX * scale - viewport.clientWidth / 2;
    const desiredTop = stateBoundary.labelY * scale - viewport.clientHeight / 2;
    viewport.scrollTo({
      left: Math.max(0, Math.min(viewport.scrollWidth - viewport.clientWidth, desiredLeft)),
      top: Math.max(0, Math.min(viewport.scrollHeight - viewport.clientHeight, desiredTop)),
      behavior: 'smooth',
    });
  }, [selectedStateCode, mapZoom]);

  const handleStateClick = (code: string) => setSelectedStateCode(code);

  return (
    <div className="ems-territory-map-redesign compact-territory-map min-h-[100dvh]">
      <section
        aria-label="Interactive U.S. Territory Map"
        className="home-territory-map-screen pi-surface compact-map-shell p-4 sm:p-5 space-y-4"
      >
        <div className="home-map-page-heading flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-[#DFE6EF] dark:border-[#1E2D42]">
          <div>
            <h2 className="pi-section-heading flex items-center gap-2">
              <Compass className="w-5 h-5 text-[#176568] shrink-0" />
              <span>Interactive U.S. Territory Map</span>
            </h2>
            <p className="pi-supporting mt-0.5">
              Choose a state or region to review county coverage and available EMS and fire agency records.
            </p>
          </div>
          <div className="home-map-region-filter max-w-full overflow-x-auto">
            <div className="flex w-max items-center gap-1 bg-[#F5F7FA] dark:bg-[#16243A] p-1 rounded-xl border border-[#DFE6EF] dark:border-[#1E2D42]">
              {(['All', 'Northeast', 'Midwest', 'South', 'West'] as const).map((region) => (
                <button
                  key={region}
                  type="button"
                  onClick={() => setRegionFilter(region)}
                  className={`min-h-10 px-3 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    regionFilter === region
                      ? 'bg-white dark:bg-[#111C2D] text-[#14283F] dark:text-white shadow-2xs font-bold'
                      : 'text-[#53657B] dark:text-slate-400 hover:text-[#14283F] dark:hover:text-white'
                  }`}
                >
                  {region}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 items-start">
          <div className="min-w-0 space-y-3">
            <div
              className="home-territory-map-panel compact-map-stage relative bg-[#07111D] rounded-xl border border-[#294158] overflow-hidden p-3 sm:p-4 space-y-3 shadow-[0_16px_48px_rgba(2,8,18,0.18)]"
              onMouseLeave={() => setHoveredStateCode(null)}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setHoveredStateCode(null);
              }}
            >
              <div className="home-map-control-row compact-map-toolbar flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <label htmlFor="home-state-map-metric" className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9CB1C7]">
                  Shade states by
                  <select
                    id="home-state-map-metric"
                    data-testid="select-state-map-metric"
                    value={mapMetric}
                    onChange={(event) => setMapMetric(event.target.value as StateMapMetricKey)}
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
                    onClick={() => setMapZoom((zoom) => Math.min(1.8, +(zoom + 0.2).toFixed(1)))}
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
                    onClick={() => setMapZoom((zoom) => Math.max(1, +(zoom - 0.2).toFixed(1)))}
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
                    onClick={() => setMapZoom(1)}
                    disabled={mapZoom === 1}
                    aria-label="Reset map zoom"
                    title="Reset zoom"
                    className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-md text-[#C7D7E6] hover:bg-[#1C3449] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#65D7D0]"
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="home-map-legend compact-map-legend flex flex-nowrap items-center gap-x-5 overflow-x-auto rounded-lg bg-[#101F30] border border-[#294158] px-3.5 py-2">
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

              <div className="home-map-content-stack compact-map-content flex flex-col gap-3">
                <aside className="home-map-readout compact-map-inspector" aria-live="polite" aria-atomic="true" aria-label={`${mapReadoutState.state} territory details`}>
                  <div className="compact-inspector-kicker">Selected territory</div>
                  <div className="compact-inspector-title">
                    <h3>{mapReadoutState.state}</h3>
                    <span className="compact-state-code">{mapReadoutState.code}</span>
                  </div>
                  <div className="compact-inspector-value">
                    <span>{activeMapMetric.label}</span>
                    <strong data-testid={mapMetric === 'pulseiq' ? 'home-map-pulseiq-readout-value' : undefined}>
                      {mapMetric === 'pulseiq' && mapReadoutMetric.value !== null
                        ? formatScore(mapReadoutMetric.value)
                        : formatStateMapValue(mapMetric, mapReadoutMetric.value)}
                    </strong>
                  </div>
                  <div className="compact-inspector-section">
                    <h4>Coverage</h4>
                    <p>{mapReadoutMetric.coverage}</p>
                  </div>
                  <div className="compact-inspector-section">
                    <h4>Period &amp; source</h4>
                    <p>{mapReadoutMetric.period}</p>
                  </div>
                  <div className="compact-inspector-section compact-county-line">
                    <h4>Geography</h4>
                    <p>{COUNTY_COUNTS[hoverReadoutStateCode]} counties · {mapReadoutState.region}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleStateClick(hoverReadoutStateCode)}
                    className="compact-review-button"
                  >
                    Review agency records
                  </button>
                </aside>

                <div className="home-map-visual-stack compact-map-visual-stack order-1 sm:order-2 space-y-3">
                  <p className="text-[10px] text-[#A2B5C8] sm:hidden">Zoom in to inspect a state, then swipe to pan.</p>
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
                        <pattern id="home-map-grid" width="46" height="46" patternUnits="userSpaceOnUse">
                          <path d="M 46 0 L 0 0 0 46" fill="none" stroke="rgba(113, 155, 185, 0.10)" strokeWidth="1" />
                        </pattern>
                        <pattern id="home-map-missing-data" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
                          <rect width="7" height="7" fill="#172A3D" />
                          <path d="M 0 0 L 0 7" stroke="#8299AF" strokeWidth="2" />
                        </pattern>
                      </defs>
                      <rect width="920" height="500" fill="url(#home-map-grid)" />
                      <g>
                        <rect x="14" y="356" width="174" height="134" rx="10" fill="#0C1B2A" fillOpacity="0.98" stroke="#52718D" strokeWidth="1.25" strokeDasharray="4 4" />
                        <text x="24" y="373" fill="#C3D3E2" fontSize="10" fontWeight="800" fontFamily="monospace">ALASKA (AK)</text>
                        <rect x="196" y="396" width="124" height="94" rx="10" fill="#0C1B2A" fillOpacity="0.98" stroke="#52718D" strokeWidth="1.25" strokeDasharray="4 4" />
                        <text x="206" y="413" fill="#C3D3E2" fontSize="10" fontWeight="800" fontFamily="monospace">HAWAII (HI)</text>
                      </g>

                      <g>
                        {STATES.map((state) => {
                          const boundary = US_STATES_SVG_PATHS[state.code];
                          if (!boundary?.d) return null;
                          const isInRegion = regionFilter === 'All' || state.region === regionFilter;
                          const isSelected = selectedStateCode === state.code;
                          const isHovered = hoveredStateCode === state.code;
                          const datum = STATE_MAP_METRICS_BY_CODE[state.code][mapMetric];
                          const fillColor = hasReportedValue(datum.value)
                            ? interpolateStateFill(mapMetric, datum.value, mapMetricMin, mapMetricMax)
                            : 'url(#home-map-missing-data)';
                          const stateAriaLabel = `${state.state}. ${activeMapMetric.label}: ${formatStateMapValue(mapMetric, datum.value)}. ${datum.coverage}. Period: ${datum.period}`;
                          return (
                            <g key={`home-poly-${state.code}`} opacity={isInRegion ? 1 : 0.36}>
                              {isSelected && <path d={boundary.d} fill="none" stroke="#67D6CE" strokeWidth="7" strokeLinejoin="round" pointerEvents="none" />}
                              {isSelected && <path d={boundary.d} fill="none" stroke="#F4C86A" strokeWidth="3.5" strokeLinejoin="round" pointerEvents="none" />}
                              <path
                                d={boundary.d}
                                fill={fillColor}
                                stroke={isSelected ? '#F4C86A' : isHovered ? '#B6F1E8' : '#152A3D'}
                                strokeWidth={isSelected ? 2.3 : isHovered ? 1.8 : 1.15}
                                strokeLinejoin="round"
                                onClick={() => handleStateClick(state.code)}
                                onMouseEnter={() => setHoveredStateCode(state.code)}
                                onFocus={() => setHoveredStateCode(state.code)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    handleStateClick(state.code);
                                  }
                                }}
                                tabIndex={isInRegion ? 0 : -1}
                                role="button"
                                aria-pressed={isSelected}
                                aria-label={`${stateAriaLabel}. ${COUNTY_COUNTS[state.code]} counties. Select to explore.`}
                                className="cursor-pointer transition-[fill,stroke,opacity] duration-150 focus:outline-none focus:stroke-[#67D6CE] focus:stroke-[3px]"
                              >
                                <title>{`${state.state} (${state.code}) · ${activeMapMetric.label}: ${formatStateMapValue(mapMetric, datum.value)} · ${datum.coverage} · Period ${datum.period} · ${COUNTY_COUNTS[state.code]} counties`}</title>
                              </path>
                            </g>
                          );
                        })}
                      </g>

                      <g>
                        {STATES.map((state) => {
                          const isCalloutState = EAST_COAST_CALLOUT_STATES.some((callout) => callout.code === state.code);
                          if (isCalloutState) return null;
                          const boundary = US_STATES_SVG_PATHS[state.code];
                          if (!boundary) return null;
                          const isInRegion = regionFilter === 'All' || state.region === regionFilter;
                          const isSelected = selectedStateCode === state.code;
                          const isHovered = hoveredStateCode === state.code;
                          return (
                            <g
                              key={`home-lbl-${state.code}`}
                              transform={`translate(${boundary.labelX}, ${boundary.labelY})`}
                              pointerEvents="none"
                              opacity={isInRegion ? 1 : 0.4}
                            >
                              <rect
                                x="-13" y="-9" width="26" height="18" rx="5"
                                fill={isSelected ? '#F4C86A' : '#102235'}
                                fillOpacity="0.98"
                                stroke={isSelected ? '#FFF0C4' : isHovered ? '#67D6CE' : '#7590A8'}
                                strokeWidth={isSelected ? 2 : isHovered ? 1.6 : 1.1}
                              />
                              <text textAnchor="middle" dy="3.5" fill={isSelected ? '#17202A' : '#E1EDF7'} fontSize="10" fontWeight="800" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace">
                                {state.code}
                              </text>
                            </g>
                          );
                        })}
                      </g>
                    </svg>
                  </div>

                  <div className="home-map-shortcuts pt-2 border-t border-[#294158] flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="text-[11px] font-semibold text-[#91A6BB] mr-1">Small-state shortcuts:</span>
                    {EAST_COAST_CALLOUT_STATES.map((callout) => {
                      const isSelected = selectedStateCode === callout.code;
                      const datum = STATE_MAP_METRICS_BY_CODE[callout.code][mapMetric];
                      const chipFill = hasReportedValue(datum.value)
                        ? interpolateStateFill(mapMetric, datum.value, mapMetricMin, mapMetricMax)
                        : '#172A3D';
                      return (
                        <button
                          key={callout.code}
                          type="button"
                          onClick={() => handleStateClick(callout.code)}
                          onMouseEnter={() => setHoveredStateCode(callout.code)}
                          onFocus={() => setHoveredStateCode(callout.code)}
                          aria-pressed={isSelected}
                          aria-label={`${stateByCode[callout.code].state}: ${formatStateMapValue(mapMetric, datum.value)}`}
                          style={{
                            backgroundColor: chipFill,
                            color: hasReportedValue(datum.value) ? readableTextForFill(chipFill) : '#C3D3E2',
                            outline: isSelected ? '2px solid #F4C86A' : undefined,
                            outlineOffset: isSelected ? '1px' : undefined,
                          }}
                          className="min-h-10 min-w-10 px-2 rounded-md border border-[#7890A8] text-[12px] font-bold font-mono transition-[outline,filter] hover:brightness-110 focus:outline focus:outline-2 focus:outline-[#67D6CE]"
                        >
                          {callout.code}
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
}
