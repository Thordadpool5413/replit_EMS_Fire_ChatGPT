import { equipmentGeographyScope,isEquipmentFilterActive } from '../utils/equipmentPresence';
import {EquipmentCoverageLegend,EquipmentMapFilter,useEquipmentMapFilter} from './EquipmentMapFilter';
import {buildEquipmentGeography,equipmentCoverageColor} from '../utils/equipmentGeography';
import {ALL_NATIONWIDE_COUNTIES} from '../data/allCountiesDatabase';
import {ALL_50_STATES_SUMMARIES} from '../data/nationalGeographicData';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { APIProvider, AdvancedMarker, InfoWindow, Map as GoogleMap, Polygon, useMap } from '@vis.gl/react-google-maps';
import { Agency } from '../types';
import {
  countyBoundaryHierarchy,
  CountyBoundaryNode,
  GeoJsonGeometry,
  StateHierarchyNode,
  SvgProjectedCounty,
} from '../services/countyBoundaryHierarchyService';
import { PublicProviderEvidenceCoverage } from './PublicProviderEvidenceCoverage';
import { RegionalAedSources } from './RegionalAedSources';
import { CountyFigureSourceDetails } from './CountyFigureSourceDetails';
import { FEMA_NRI_RATING_COLORS } from '../utils/femaNriRisk';
import {
  getGetNriCountyContextQueryKey,
  useGetNriCountyContext,
} from '@workspace/api-client-react';
import { ExternalLink, ChevronRight, ArrowLeft, Users, HeartPulse, Ambulance, Hospital, ZoomIn, ZoomOut, Maximize2, MapPin, Map as MapIcon, ShieldAlert, Landmark, Timer, Shield, BadgeDollarSign, HeartHandshake, FileText } from 'lucide-react';
import { formatCoordinates } from '../utils/countyPresentation';
import './countyGeoTokens.css';
import './CountyFigures.css';
import './CountyInspector.css';

type GoogleCountyCoordinate = { lat: number; lng: number };
type GoogleCountyPolygon = GoogleCountyCoordinate[][];

function toGoogleCountyPolygons(geometry: GeoJsonGeometry | null): GoogleCountyPolygon[] {
  if (!geometry) return [];
  const polygons: number[][][][] = geometry.type === 'Polygon'
    ? [geometry.coordinates as number[][][]]
    : geometry.coordinates as number[][][][];
  return polygons
    .map((polygon) => polygon.map((ring) => ring
      .filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180)
      .map(([lng, lat]) => ({ lat, lng }))))
    .filter((polygon) => polygon[0]?.length >= 3);
}

function FitCountyMapBounds({ bbox, countyFips }: { bbox: [number, number, number, number]; countyFips: string }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    const [west, south, east, north] = bbox;
    if (![west, south, east, north].every(Number.isFinite) || south >= north || west >= east) return;
    map.fitBounds({ west, south, east, north }, 34);
  }, [map, bbox, countyFips]);
  return null;
}

interface RealWorldCountyBoundaryMapProps {
  stateCode: string;
  providerScope?: 'all' | 'ems' | 'fire';
  selectedCountyName: string;
  selectedCityName: string;
  agencies: Agency[];
  showExplorerHeader?: boolean;
  onSelectCounty: (countyName: string, stateCode: string) => void;
  onSelectCity: (cityName: string, countyName: string, stateCode: string) => void;
  /** Clears the city filter while keeping the current county. */
  onShowAllPlaces?: () => void;
  onSelectAgency?: (agency: Agency) => void;
}

export const RealWorldCountyBoundaryMap: React.FC<RealWorldCountyBoundaryMapProps> = ({
  stateCode,
  providerScope = 'all',
  selectedCountyName,
  selectedCityName,
  agencies,
  showExplorerHeader = true,
  onSelectCounty,
  onSelectCity,
  onShowAllPlaces,
}) => {
  const [equipmentFilter,setEquipmentFilter]=useEquipmentMapFilter();
  const isEquipmentMapActive=isEquipmentFilterActive(equipmentFilter);
  const equipmentAgencies = useMemo(() => equipmentGeographyScope(agencies, { state: stateCode, category: providerScope }), [agencies, stateCode, providerScope]);
  const equipmentCoverage=useMemo(()=>buildEquipmentGeography(
    equipmentAgencies,
    Object.values(ALL_50_STATES_SUMMARIES),
    ALL_NATIONWIDE_COUNTIES,
    equipmentFilter,
    { includeAgencyRecords: selectedCountyName !== 'all' },
  ),[equipmentAgencies,equipmentFilter,selectedCountyName]);
  const [isLoadingBoundaries, setIsLoadingBoundaries] = useState<boolean>(false);
  const [googleMapsApiKey] = useState(() => {
    const envKey = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_GOOGLE_MAPS_API_KEY || '';
    try {
      return envKey || localStorage.getItem('gmp_api_key') || '';
    } catch {
      return envKey;
    }
  });
  const [boundaryVersion, setBoundaryVersion] = useState<number>(0);
  const [previewCountyFips, setPreviewCountyFips] = useState<string | null>(null);
  const [hoveredCountyFips, setHoveredCountyFips] = useState<string | null>(null);
  const [hoveredCityName, setHoveredCityName] = useState<string | null>(null);
  const [countyMapViewBox, setCountyMapViewBox] = useState('0 0 720 400');
  const countyMapPathsRef = useRef<SVGGElement>(null);
  const singleCountyRef = useRef<SVGGElement>(null);
  const singleSvgRef = useRef<SVGSVGElement>(null);
  const [singleMapScale, setSingleMapScale] = useState(1);
  const [singleViewBox, setSingleViewBox] = useState('0 0 520 340');
  const [countyMapLayer] = useState<'nri-risk'>('nri-risk');
  const [countyZoom, setCountyZoom] = useState(1);
  const [countyPan, setCountyPan] = useState({ x: 0, y: 0 });
  const countySvgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);
  const nriParams = useMemo(
    () => stateCode && stateCode !== 'all' ? { stateCode } : undefined,
    [stateCode],
  );
  const nriQuery = useGetNriCountyContext(nriParams, {
    query: {
      enabled: Boolean(nriParams),
      queryKey: getGetNriCountyContextQueryKey(nriParams),
      staleTime: 6 * 60 * 60 * 1000,
    },
  });
  const nriByCountyFips = useMemo(
    () => new Map((nriQuery.data?.records ?? []).map((record) => [record.countyFips, record])),
    [nriQuery.data?.records],
  );

  const hierarchy = useMemo(() => countyBoundaryHierarchy.getHierarchy(agencies), [agencies]);
  const stateNode: StateHierarchyNode | null = useMemo(() => {
    if (!stateCode || stateCode === 'all') return null;
    return hierarchy.statesByCode[stateCode.toUpperCase()] || null;
  }, [hierarchy, stateCode]);
  const unmatchedNriRecords = useMemo(() => {
    const appBoundaryFips = new Set(
      stateNode?.countiesList.map((county) => county.countyFips) ?? [],
    );
    return (nriQuery.data?.records ?? []).filter(
      (record) => !appBoundaryFips.has(record.countyFips),
    );
  }, [nriQuery.data?.records, stateNode]);

  useEffect(() => {
    setPreviewCountyFips(null);
    setHoveredCountyFips(null);
    setCountyZoom(1);
    setCountyPan({ x: 0, y: 0 });
  }, [stateCode]);

  useEffect(() => {
    if (!stateCode || stateCode === 'all') return;
    let cancelled = false;
    setIsLoadingBoundaries(true);

    countyBoundaryHierarchy
      .fetchStateCountyBoundaries(stateCode)
      .then(() => {
        if (!cancelled) {
          setBoundaryVersion((v) => v + 1);
          setIsLoadingBoundaries(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsLoadingBoundaries(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [stateCode]);

  const projectedState = useMemo(() => {
    if (!stateCode || stateCode === 'all') return { projectedCounties: [], bbox: [-98, 38, -97, 39] as [number, number, number, number] };
    return countyBoundaryHierarchy.projectStateCountiesToSvg(stateCode, 720, 400, 22);
  }, [stateCode, boundaryVersion]);

  useLayoutEffect(() => {
    const mapGroup = countyMapPathsRef.current;
    if (!mapGroup || projectedState.projectedCounties.length === 0) {
      setCountyMapViewBox('0 0 720 400');
      return;
    }

    try {
      const bounds = mapGroup.getBBox();
      if (bounds.width <= 0 || bounds.height <= 0) return;
      const padX = Math.max(10, bounds.width * 0.045);
      const padY = Math.max(10, bounds.height * 0.045);
      const nextViewBox = [
        bounds.x - padX,
        bounds.y - padY,
        bounds.width + padX * 2,
        bounds.height + padY * 2,
      ].map((value) => Number(value.toFixed(1))).join(' ');
      setCountyMapViewBox(nextViewBox);
    } catch {
      setCountyMapViewBox('0 0 720 400');
    }
  }, [projectedState.projectedCounties]);

  const displayedCountyViewBox = useMemo(() => {
    const [bx, by, bw, bh] = countyMapViewBox.split(' ').map(Number);
    if (countyZoom === 1) return countyMapViewBox;
    const w = bw / countyZoom;
    const h = bh / countyZoom;
    const maxX = (bw - w) / 2;
    const maxY = (bh - h) / 2;
    const px = Math.max(-maxX, Math.min(maxX, countyPan.x));
    const py = Math.max(-maxY, Math.min(maxY, countyPan.y));
    return [bx + (bw - w) / 2 + px, by + (bh - h) / 2 + py, w, h].map((v) => Number(v.toFixed(1))).join(' ');
  }, [countyMapViewBox, countyZoom, countyPan]);

  const setZoomClamped = (next: number) => {
    const z = Math.max(1, Math.min(6, Number(next.toFixed(2))));
    if (countyZoom === 1 && z > 1) {
      // A long/coastal state's geometric center can be ocean. Begin zooming
      // around the previewed county so enlarging the map reveals useful land.
      const anchor = projectedState.projectedCounties.find((c) => c.countyFips === hoveredCountyFips)
        ?? projectedState.projectedCounties[0];
      if (anchor) {
        const [x, y, w, h] = countyMapViewBox.split(' ').map(Number);
        setCountyPan({ x: anchor.labelX - (x + w / 2), y: anchor.labelY - (y + h / 2) });
      }
    }
    setCountyZoom(z);
    if (z === 1) setCountyPan({ x: 0, y: 0 });
  };
  const fitCountyMap = () => {
    setCountyZoom(1);
    setCountyPan({ x: 0, y: 0 });
  };

  const handleCountyPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (countyZoom === 1) return;
    dragRef.current = { x: event.clientX, y: event.clientY, panX: countyPan.x, panY: countyPan.y, moved: false };
  };
  const handleCountyPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    const svg = countySvgRef.current;
    if (!drag || !svg) return;
    const dxPx = event.clientX - drag.x;
    const dyPx = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dxPx, dyPx) < 4) return;
    if (!drag.moved) {
      drag.moved = true;
      try { svg.setPointerCapture(event.pointerId); } catch { /* ignore */ }
    }
    const rect = svg.getBoundingClientRect();
    const [, , vw, vh] = displayedCountyViewBox.split(' ').map(Number);
    const unitsPerPx = Math.max(vw / Math.max(rect.width, 1), vh / Math.max(rect.height, 1));
    const [, , bw, bh] = countyMapViewBox.split(' ').map(Number);
    const maxX = (bw - bw / countyZoom) / 2;
    const maxY = (bh - bh / countyZoom) / 2;
    setCountyPan({
      x: Math.max(-maxX, Math.min(maxX, drag.panX - dxPx * unitsPerPx)),
      y: Math.max(-maxY, Math.min(maxY, drag.panY - dyPx * unitsPerPx)),
    });
  };
  const handleCountyPointerUp = () => {
    if (dragRef.current?.moved) {
      suppressClickRef.current = true;
      window.setTimeout(() => { suppressClickRef.current = false; }, 0);
    }
    dragRef.current = null;
  };

  const activeCountyNode: CountyBoundaryNode | null = useMemo(() => {
    if (!stateNode || !selectedCountyName || selectedCountyName === 'all') return null;
    const clean = selectedCountyName.toLowerCase().trim();
    const raw = clean.replace(/ county| parish| borough/gi, '').trim();
    return stateNode.countiesByName[clean] || stateNode.countiesByName[raw] || null;
  }, [stateNode, selectedCountyName, boundaryVersion]);

  const projectedSingleCounty = useMemo(() => {
    if (!activeCountyNode) return null;
    return countyBoundaryHierarchy.projectSingleCountyBoundaryToSvg(activeCountyNode, agencies, 520, 340, 32);
  }, [activeCountyNode, agencies, boundaryVersion]);
  const googleCountyPolygons = useMemo(
    () => toGoogleCountyPolygons(activeCountyNode?.geometry ?? null),
    [activeCountyNode?.geometry],
  );
  const selectedPlace = useMemo(
    () => projectedSingleCounty?.cityPins.find((pin) => pin.cityName.toLowerCase() === selectedCityName.toLowerCase()) ?? null,
    [projectedSingleCounty, selectedCityName],
  );

  useLayoutEffect(() => {
    const group = singleCountyRef.current;
    if (!group || !projectedSingleCounty) return;
    try {
      const b = group.getBBox();
      if (b.width <= 0 || b.height <= 0) return;
      const pad = Math.max(14, Math.max(b.width, b.height) * 0.05);
      setSingleViewBox([b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2].map((v) => Number(v.toFixed(1))).join(' '));
    } catch {
      setSingleViewBox('0 0 520 340');
    }
  }, [projectedSingleCounty]);

  useLayoutEffect(() => {
    const svg = singleSvgRef.current;
    if (!svg) return;
    const resize = () => {
      const scale = svg.getScreenCTM()?.a;
      if (scale && scale > 0) setSingleMapScale(scale);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(svg);
    return () => observer.disconnect();
  }, [singleViewBox, activeCountyNode?.countyFips]);

  const inspectedCounty: SvgProjectedCounty | null = useMemo(() => {
    if (previewCountyFips) {
      const found = projectedState.projectedCounties.find((c) => c.countyFips === previewCountyFips);
      if (found) return found;
    }
    if (activeCountyNode) {
      const found = projectedState.projectedCounties.find((c) => c.countyFips === activeCountyNode.countyFips);
      if (found) return found;
    }
    return projectedState.projectedCounties[0] || null;
  }, [previewCountyFips, activeCountyNode, projectedState]);
  const inspectedNri = inspectedCounty
    ? nriByCountyFips.get(inspectedCounty.countyFips) ?? null
    : null;
  const activeCountyNri = activeCountyNode
    ? nriByCountyFips.get(activeCountyNode.countyFips) ?? null
    : null;
  const nriColorFor = (fips: string) => {
    if(isEquipmentMapActive)return equipmentCoverageColor(equipmentCoverage.byCounty[fips],equipmentFilter);
    const rating = nriByCountyFips.get(fips)?.riskRating;
    return rating ? FEMA_NRI_RATING_COLORS[rating] ?? 'url(#cv-missing-hatch)' : 'url(#cv-missing-hatch)';
  };

  if (!stateNode) return null;

  const riskStyle = (rating?: string | null) =>
    ({ '--risk': rating ? FEMA_NRI_RATING_COLORS[rating] ?? '#94a3b8' : '#b6c1cf' }) as React.CSSProperties;
  const formatLoss = (value?: number | null) =>
    value == null ? 'not stated' : `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const nriSummary = nriQuery.isLoading
    ? `Loading FEMA NRI county records for ${stateNode.stateCode}`
    : nriQuery.isError
      ? 'FEMA NRI county records could not be loaded.'
      : `FEMA NRI · ${nriByCountyFips.size} county-equivalent records · vintage ${nriQuery.data?.sourceVersion ?? 'not stated'}`;

  const sourceStrip = (
    <p className="cv-note" data-testid="text-boundary-sources">
      <a
        href="https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html"
        target="_blank"
        rel="noopener noreferrer"
        className="cv-link"
      >
        Census TIGER/Line boundaries <ExternalLink aria-hidden="true" />
      </a>
      {' '}(vintage not stated) · State FIPS {stateNode.stateFips} · {nriSummary}
      {!nriQuery.isLoading && !nriQuery.isError && nriQuery.data?.sourceUrl && (
        <>
          {' · '}
          <a href={nriQuery.data.sourceUrl} target="_blank" rel="noopener noreferrer" className="cv-link">
            FEMA source <ExternalLink aria-hidden="true" />
          </a>
        </>
      )}
    </p>
  );

  const unmatchedSection = countyMapLayer === 'nri-risk' && unmatchedNriRecords.length > 0 && (
    <section className="cv-panel" aria-label="FEMA source geographies that do not match the app map">
      <div className="cv-section-label">
        <span>FEMA records without a matching map boundary</span>
        <span>{unmatchedNriRecords.length} listed, not shaded</span>
      </div>
      <p className="cv-note">
        These source records keep their own FIPS IDs and values.
        {stateNode.stateCode === 'CT' && (
          <>
            {' '}The app boundary file has 8 legacy Connecticut counties; Census statistical geography uses 9 planning regions since 2022.{' '}
            <a href="https://www2.census.gov/geo/pdfs/reference/ct_county_equiv_change.pdf" target="_blank" rel="noopener noreferrer" className="cv-link">
              Census change notice
            </a>
          </>
        )}
      </p>
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {unmatchedNriRecords.map((record) => (
          <li key={record.countyFips} className="cv-note rounded-md border border-[var(--pi-border)] p-2">
            <div className="font-semibold text-[var(--pi-text-primary)]">{record.countyName} · FIPS {record.countyFips}</div>
            <div className="cv-risk mt-1">
              <span className={`cv-risk-badge ${record.riskRating ? '' : 'cv-risk-badge--none'}`} style={riskStyle(record.riskRating)}>
                {record.riskRating ?? 'Rating not stated'}
              </span>
              <span className="cv-risk-score">Score <strong>{record.riskScore?.toFixed(2) ?? 'not stated'}</strong></span>
            </div>
            <div className="mt-1">Expected annual loss {formatLoss(record.expectedAnnualLoss)} · reporting period not stated</div>
            <a href={record.sourceUrl} target="_blank" rel="noopener noreferrer" className="cv-link mt-1">
              FEMA NRI · {record.sourceVersion} <ExternalLink aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );

  const legend = (
    <div className="cv-legend" aria-label="FEMA NRI risk category legend">
      {Object.entries(FEMA_NRI_RATING_COLORS).map(([rating, color]) => (
        <span key={rating}><span className="cv-swatch" style={{ backgroundColor: color }} />{rating}</span>
      ))}
      <span><span className="cv-swatch cv-swatch--missing" />No FEMA record</span>
    </div>
  );

  return (
    <div className={`cv-stack${isEquipmentMapActive?' equipment-county-warm':''}`}>
      {showExplorerHeader && !activeCountyNode && (
        <header className="cv-dir-head">
          <div>
            <p className="cv-kicker">County boundaries</p>
            <h3 className="cv-title">{stateNode.stateName} counties</h3>
          </div>
          <span className="cv-meta tabular-nums">{stateNode.countiesList.length} counties</span>
        </header>
      )}

      {!activeCountyNode && <>
      <EquipmentMapFilter value={equipmentFilter} onChange={setEquipmentFilter} agencies={equipmentAgencies} scopeLabel="loaded records for this state and provider scope, before county selection"/>
      {isEquipmentMapActive&&<EquipmentCoverageLegend
        note={`County records are matched by FIPS or an unambiguous county name within ${stateNode.stateName}. “Both found in area” may be different agencies; candidate records still need confirmation. ${equipmentCoverage.unassignedCounty} loaded records have unresolved county geography and are not assigned to a county.`}
      />}
      {isEquipmentMapActive&&inspectedCounty&&<p className="cv-note" role="status" data-testid={`equipment-county-rollup-${inspectedCounty.countyFips}`}>
        {inspectedCounty.countyName} · {equipmentCoverage.byCounty[inspectedCounty.countyFips]?.total||0} loaded records ·
        {' '}ZOLL {equipmentCoverage.byCounty[inspectedCounty.countyFips]?.zoll||0} · other makers {equipmentCoverage.byCounty[inspectedCounty.countyFips]?.competitor||0} ·
        {' '}mixed {equipmentCoverage.byCounty[inspectedCounty.countyFips]?.mixed||0} · no recognized maker {equipmentCoverage.byCounty[inspectedCounty.countyFips]?.unknown||0} ·
        {' '}equipment details recorded {equipmentCoverage.byCounty[inspectedCounty.countyFips]?.reported||0} · no substantive equipment entry {equipmentCoverage.byCounty[inspectedCounty.countyFips]?.unreported||0}.
        {' '}Loaded-record counts, not a complete equipment census.
      </p>}
      </>}
      {/* Mode A: statewide county boundaries + inspector */}
      {!activeCountyNode && (
        <>
          <div className="cv-state-grid county-state-map-grid">
            <div className="cv-map-panel county-geo county-state-map-panel">
              <div className="cv-map-head">
                <strong className="cv-head-ico"><ShieldAlert aria-hidden="true" />{stateNode.stateName} · {!isEquipmentMapActive?'FEMA NRI risk by county':equipmentFilter.evidence==='documented'?'Dated equipment observations by county':'Recorded equipment by county'}</strong>
                <span className="tabular-nums">
                  {projectedState.projectedCounties.length} of {stateNode.countiesList.length} boundaries drawn
                </span>
                <div className="cv-map-tools" role="group" aria-label="County map zoom controls">
                  <button type="button" className="cv-map-tool" onClick={() => setZoomClamped(countyZoom * 1.5)} disabled={countyZoom >= 6} aria-label="Zoom in on county map" title="Zoom in" data-testid="button-county-map-zoom-in">
                    <ZoomIn aria-hidden="true" />
                  </button>
                  <span className="cv-map-tool-readout tabular-nums" aria-live="polite">{Math.round(countyZoom * 100)}%</span>
                  <button type="button" className="cv-map-tool" onClick={() => setZoomClamped(countyZoom / 1.5)} disabled={countyZoom <= 1} aria-label="Zoom out on county map" title="Zoom out" data-testid="button-county-map-zoom-out">
                    <ZoomOut aria-hidden="true" />
                  </button>
                  <button type="button" className="cv-map-tool cv-map-tool--text" onClick={fitCountyMap} disabled={countyZoom === 1} aria-label="Fit whole state" title="Fit whole state" data-testid="button-county-map-fit">
                    <Maximize2 aria-hidden="true" /> Fit
                  </button>
                </div>
              </div>

              {isLoadingBoundaries && projectedState.projectedCounties.length === 0 ? (
                <div className="cv-map-stage" role="status">
                  <span className="text-sm text-slate-300">Loading county boundaries for {stateNode.stateName}…</span>
                </div>
              ) : (
                <div className="cv-map-stage county-state-map-viewport">
                  <svg
                    ref={countySvgRef}
                    viewBox={displayedCountyViewBox}
                    preserveAspectRatio="xMidYMid meet"
                    className={`county-state-map-svg select-none${countyZoom > 1 ? ' is-zoomed' : ''}`}
                    onPointerDown={handleCountyPointerDown}
                    onPointerMove={handleCountyPointerMove}
                    onPointerUp={handleCountyPointerUp}
                    onPointerCancel={handleCountyPointerUp}
                    role="group"
                    aria-label={`${stateNode.stateName} county boundaries. Select a county to open it.`}
                  >
                    <defs>
                      <pattern id="cv-missing-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                        <rect width="6" height="6" fill="#33445c" />
                        <line x1="0" y1="0" x2="0" y2="6" stroke="#8193ab" strokeWidth="1.4" />
                      </pattern>
                    </defs>
                    <g aria-hidden="true" pointerEvents="none" className="cv-state-outline">
                      {projectedState.projectedCounties.map((pc) => (
                        <path key={`outline-${pc.countyFips}`} d={pc.svgPath} fill="none" stroke="#D5E1EE" strokeWidth={3.2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                      ))}
                    </g>
                    <g ref={countyMapPathsRef}>
                      {[...projectedState.projectedCounties]
                        .sort((a, b) => {
                          const rank = (c: SvgProjectedCounty) =>
                            selectedCountyName !== 'all' && c.countyName.toLowerCase() === selectedCountyName.toLowerCase()
                              ? 2
                              : c.countyFips === hoveredCountyFips ? 1 : 0;
                          return rank(a) - rank(b);
                        })
                        .map((pc) => {
                        const isHovered = hoveredCountyFips === pc.countyFips;
                        const isSelected =
                          selectedCountyName !== 'all' &&
                          pc.countyName.toLowerCase() === selectedCountyName.toLowerCase();
                        const nri = nriByCountyFips.get(pc.countyFips);
                        return (
                          <path
                            key={pc.countyFips}
                            d={pc.svgPath}
                            fill={nriColorFor(pc.countyFips)}
                            stroke={isEquipmentMapActive?(isSelected?'#FF4B36':isHovered?'#9A5C2F':'#B99573'):isSelected ? '#FFFFFF' : isHovered ? '#E2EAF5' : 'rgba(16,30,48,0.78)'}
                            strokeWidth={isSelected ? 3 : isHovered ? 2.2 : 0.55}
                            strokeLinejoin="round"
                            vectorEffect="non-scaling-stroke"
                            tabIndex={0}
                            role="button"
                            aria-label={isEquipmentMapActive?`Open ${pc.countyName}, ${stateNode.stateName}. ${equipmentCoverage.byCounty[pc.countyFips]?.total||0} loaded agency records; ZOLL ${equipmentCoverage.byCounty[pc.countyFips]?.zoll||0}; other manufacturers ${equipmentCoverage.byCounty[pc.countyFips]?.competitor||0}; mixed ${equipmentCoverage.byCounty[pc.countyFips]?.mixed||0}; no recognized maker ${equipmentCoverage.byCounty[pc.countyFips]?.unknown||0}.`:`Open ${pc.countyName}, ${stateNode.stateName}. FEMA NRI ${nri?.riskRating ?? 'no record'}`}
                            className={`cv-county-path cursor-pointer${isSelected ? ' is-selected' : ''}`}
                            aria-pressed={isSelected}
                            onMouseEnter={() => { setHoveredCountyFips(pc.countyFips); setPreviewCountyFips(pc.countyFips); }}
                            onMouseLeave={() => setHoveredCountyFips(null)}
                            onFocus={() => { setHoveredCountyFips(pc.countyFips); setPreviewCountyFips(pc.countyFips); }}
                            onBlur={() => setHoveredCountyFips(null)}
                            onClick={() => {
                              if (suppressClickRef.current) return;
                              onSelectCounty(pc.countyName, stateNode.stateCode);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                onSelectCounty(pc.countyName, stateNode.stateCode);
                              }
                            }}
                          >
                            <title>
                              {isEquipmentMapActive
                                ? `${pc.countyName}, ${stateNode.stateCode} · FIPS ${pc.countyFips} · loaded records ${equipmentCoverage.byCounty[pc.countyFips]?.total||0} · ZOLL ${equipmentCoverage.byCounty[pc.countyFips]?.zoll||0} · other makers ${equipmentCoverage.byCounty[pc.countyFips]?.competitor||0} · mixed ${equipmentCoverage.byCounty[pc.countyFips]?.mixed||0} · no recognized maker ${equipmentCoverage.byCounty[pc.countyFips]?.unknown||0}`
                                : `${pc.countyName}, ${stateNode.stateCode} · FIPS ${pc.countyFips} · Seat ${pc.countySeat} · ${pc.landAreaSqMiles.toLocaleString()} sq mi · FEMA NRI ${nri?.riskRating ?? 'no county-equivalent record'} · score ${nri?.riskScore?.toFixed(2) ?? 'not stated'} · expected annual loss ${formatLoss(nri?.expectedAnnualLoss)} · vintage ${nri?.sourceVersion ?? 'not stated'}`}
                            </title>
                          </path>
                        );
                      })}
                    </g>
                    {(() => {
                      const [vx, vy, vw, vh] = displayedCountyViewBox.split(' ').map(Number);
                      const rect = countySvgRef.current?.getBoundingClientRect();
                      const scale = Math.min((rect?.width || 432) / vw, (rect?.height || 300) / vh);
                      const fontSize = 12 / scale;
                      const showAll = countyZoom >= 2.25;
                      // Keep names readable rather than showing overlapping labels.
                      // Active labels get first choice; zoom progressively makes room.
                      const boxes: { x: number; y: number; w: number; h: number }[] = [];
                      const labelCounties = [...projectedState.projectedCounties]
                        .sort((a, b) => Number(b.countyFips === hoveredCountyFips) - Number(a.countyFips === hoveredCountyFips))
                        .filter((pc) => {
                          const active = pc.countyFips === hoveredCountyFips ||
                            (selectedCountyName !== 'all' && pc.countyName.toLowerCase() === selectedCountyName.toLowerCase());
                          if (!showAll && !active) return false;
                          const name = pc.countyName.replace(/ (County|Parish|Borough|Census Area|Municipality)$/i, '');
                          const w = (name.length * .6 + 1.5) * fontSize;
                          const h = fontSize * 1.7;
                          const box = { x: pc.labelX - w / 2, y: pc.labelY - h / 2, w, h };
                          if (!active && (box.x < vx || box.y < vy || box.x + w > vx + vw || box.y + h > vy + vh)) return false;
                          if (!active && boxes.some((b) => box.x < b.x + b.w && box.x + w > b.x && box.y < b.y + b.h && box.y + h > b.y)) return false;
                          boxes.push(box);
                          return true;
                        });
                      return (
                        <g className="cv-county-labels" pointerEvents="none" aria-hidden="true">
                          {labelCounties.map((pc) => {
                            const isSel = selectedCountyName !== 'all' && pc.countyName.toLowerCase() === selectedCountyName.toLowerCase();
                            const isHov = pc.countyFips === hoveredCountyFips;
                            if (!showAll && !isSel && !isHov) return null;
                            const name = pc.countyName.replace(/ (County|Parish|Borough|Census Area|Municipality)$/i, '');
                            return (
                              <text
                                key={`lbl-${pc.countyFips}`}
                                x={pc.labelX}
                                y={pc.labelY}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                fontSize={isSel || isHov ? fontSize * 1.15 : fontSize}
                                fontWeight={isSel || isHov ? 750 : 600}
                                className={`cv-county-label${isSel ? ' is-selected' : ''}${isHov ? ' is-hovered' : ''}`}
                                style={{ strokeWidth: fontSize * 0.28 }}
                              >
                                {name}
                              </text>
                            );
                          })}
                        </g>
                      );
                    })()}
                  </svg>
                </div>
              )}
              <p className="cv-zoom-hint" aria-live="polite">
                {countyZoom >= 2.25 ? 'County names appear where space allows. Drag to pan.' : 'Hover or focus a county for its name. Zoom in for more labels.'}
              </p>
              {!isEquipmentMapActive?legend:<EquipmentCoverageLegend className="cv-legend-equipment"/>}
            </div>

            <div className="cv-panel county-inspector-panel ci" aria-live="polite">
              {inspectedCounty ? (
                <>
                  <header className="ci-head">
                    <p className="ci-kicker">{hoveredCountyFips ? 'Map preview' : 'County preview'}</p>
                    <h4 className="ci-name">{inspectedCounty.countyName}</h4>
                    <dl className="ci-ident">
                      <div><dt>Seat</dt><dd>{inspectedCounty.countySeat}</dd></div>
                      <div><dt>Area</dt><dd>{inspectedCounty.landAreaSqMiles.toLocaleString()}<small> sq mi</small></dd></div>
                      <div><dt>FIPS</dt><dd>{inspectedCounty.countyFips}</dd></div>
                    </dl>
                  </header>

                  {(() => {
                    const rec = inspectedCounty.node.countyRecord;
                    const n = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
                    const na = <span className="cfs-na">Not reported</span>;
                    return (
                      <div className="ci-figs cfs-brief">
                        <dl className="cfs-lead" aria-label="Primary county figures">
                          <div className="cfs-fig" data-tone="community"><dt><Users className="cfs-ico" aria-hidden="true" />Population</dt><dd>{(inspectedCounty.population == null ? 'Not available' : inspectedCounty.population.toLocaleString())}</dd></div>
                          <div className="cfs-fig" data-tone="ops"><dt><Timer className="cfs-ico" aria-hidden="true" />Avg transport time</dt><dd>{n(inspectedCounty.averageTransportMinutes) ? <>{inspectedCounty.averageTransportMinutes}<small>min</small></> : na}</dd></div>
                          <div className="cfs-fig" data-tone="cardiac"><dt title="Out-of-hospital cardiac arrest (OHCA) incidents per year"><HeartPulse className="cfs-ico" aria-hidden="true" />Cardiac arrests</dt><dd>{n(rec?.annualCardiacArrestIncidents) ? <>{rec!.annualCardiacArrestIncidents.toLocaleString()}<small>/yr</small></> : na}</dd></div>
                        </dl>
                        <dl className="cfs-ledger" aria-label="Supporting county figures">
                          <div className="cfs-fig" data-tone="ops"><dt title="Emergency EMS transports per year"><Ambulance className="cfs-ico" aria-hidden="true" />EMS transports</dt><dd>{n(rec?.annualEmergencyTransports) ? <>{rec!.annualEmergencyTransports.toLocaleString()}<small>/yr</small></> : na}</dd></div>
                          <div className="cfs-fig" data-tone="access"><dt><Hospital className="cfs-ico" aria-hidden="true" />Nearest cath lab</dt><dd>{n(rec?.primaryCathLabDistanceMiles) ? <>{rec!.primaryCathLabDistanceMiles.toFixed(1)}<small>mi</small></> : na}</dd></div>
                        </dl>
                      </div>
                    );
                  })()}

                  <section className="ci-fema" style={riskStyle(inspectedNri?.riskRating)} aria-label="FEMA National Risk Index">
                    <h5 className="ci-section"><Shield className="ci-ico" aria-hidden="true" />FEMA natural hazard</h5>
                    <div className="ci-fema-row">
                      <span className={`ci-risk-rating ${inspectedNri?.riskRating ? '' : 'ci-risk-rating--none'}`}>
                        <span className="ci-swatch" aria-hidden="true" />
                        {inspectedNri?.riskRating ?? (nriQuery.isLoading ? 'Loading FEMA record' : nriQuery.isError ? 'FEMA source unavailable' : 'No record')}
                      </span>
                      {inspectedNri && (
                        <span>Score <strong>{inspectedNri.riskScore != null ? inspectedNri.riskScore.toFixed(2) : 'not stated'}</strong></span>
                      )}
                      {inspectedNri && <span>Vintage <strong>{inspectedNri.sourceVersion}</strong></span>}
                      {inspectedNri?.sourceUrl && (
                        <a href={inspectedNri.sourceUrl} target="_blank" rel="noopener noreferrer" className="ci-link">FEMA record <ExternalLink aria-hidden="true" /></a>
                      )}
                    </div>
                    {inspectedNri && (
                      <dl className="ci-fema-facts" aria-label="FEMA National Risk Index details">
                        <div><dt><BadgeDollarSign className="ci-ico" aria-hidden="true" />Expected annual loss</dt><dd>{formatLoss(inspectedNri.expectedAnnualLoss)}</dd></div>
                        <div><dt><Users className="ci-ico" aria-hidden="true" />Social vulnerability</dt><dd>{inspectedNri.socialVulnerabilityRating ?? 'not stated'}</dd></div>
                        <div><dt><HeartHandshake className="ci-ico" aria-hidden="true" />Community resilience</dt><dd>{inspectedNri.communityResilienceRating ?? 'not stated'}</dd></div>
                      </dl>
                    )}
                  </section>


                  <footer className="ci-foot">
                    <a
                      href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(`${inspectedCounty.countyName}, ${stateNode.stateName}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ci-link"
                    >
                      Check boundary on OpenStreetMap <ExternalLink aria-hidden="true" />
                    </a>
                    <button
                      type="button"
                      onClick={() => onSelectCounty(inspectedCounty.countyName, stateNode.stateCode)}
                      className="ci-btn"
                      data-testid="button-open-inspected-county"
                    >
                      <span className="ci-btn-text">Open {inspectedCounty.countyName}</span> <ChevronRight aria-hidden="true" />
                    </button>
                  </footer>
                </>
              ) : (
                <p className="cv-note">County boundaries are not available for this state.</p>
              )}
            </div>
          </div>
          <PublicProviderEvidenceCoverage state={stateNode.stateCode} />
          <RegionalAedSources state={stateNode.stateCode} />
          {sourceStrip}
          {unmatchedSection}
        </>
      )}

      {/* Mode B: single county boundary + places */}
      {activeCountyNode && projectedSingleCounty && (
        <>
          <div className="cv-state-grid county-selected-grid">
            <div className="cv-map-panel county-geo county-single-map-panel county-municipality-map-panel">
              <div className="cv-map-head">
                <strong className="cv-head-ico"><MapIcon aria-hidden="true" />{activeCountyNode.countyName} satellite view</strong>
                <span className="tabular-nums">{activeCountyNode.landAreaSqMiles.toLocaleString()} sq mi · FIPS {activeCountyNode.countyFips}</span>
              </div>
              <div className="cv-map-stage cv-map-stage--county">
                {googleMapsApiKey ? (
                  <APIProvider apiKey={googleMapsApiKey} libraries={['marker']}>
                    <GoogleMap
                      mapId="DEMO_MAP_ID"
                      className="county-satellite-map-canvas"
                      style={{ width: '100%', height: '100%' }}
                      defaultCenter={activeCountyNode.centroid}
                      defaultZoom={8}
                      mapTypeId="satellite"
                      gestureHandling="cooperative"
                      disableDefaultUI
                      zoomControl
                      clickableIcons={false}
                      aria-label={`${activeCountyNode.countyName} satellite map with county boundary and ${projectedSingleCounty.cityPins.length} place markers`}
                    >
                      <FitCountyMapBounds bbox={activeCountyNode.bbox} countyFips={activeCountyNode.countyFips} />
                      {googleCountyPolygons.map((paths, index) => (
                        <Polygon
                          key={`${activeCountyNode.countyFips}-${index}`}
                          paths={paths}
                          clickable={false}
                          fillColor={isEquipmentMapActive ? '#f3b34c' : '#32a4c8'}
                          fillOpacity={isEquipmentMapActive ? 0.16 : 0.11}
                          strokeColor="#c6fff7"
                          strokeOpacity={0.95}
                          strokeWeight={3}
                          zIndex={20}
                        />
                      ))}
                      {projectedSingleCounty.cityPins.map((pin) => {
                        const isSelected = selectedCityName.toLowerCase() === pin.cityName.toLowerCase();
                        return (
                          <AdvancedMarker
                            key={pin.cityName}
                            position={{ lat: pin.latitude, lng: pin.longitude }}
                            title={`${pin.cityName}${pin.isCountySeat ? ' · County seat' : ''} · ${pin.providersCount} provider records`}
                            onClick={() => onSelectCity(pin.cityName, activeCountyNode.countyName, stateNode.stateCode)}
                            zIndex={isSelected ? 1000 : pin.isCountySeat ? 700 : 500}
                          >
                            <span aria-hidden="true" className={'county-service-pin' + (pin.isCountySeat ? ' seat' : '') + (isSelected ? ' selected' : '')}>
                              {isSelected ? '✓' : pin.isCountySeat ? '★' : '•'}
                            </span>
                          </AdvancedMarker>
                        );
                      })}
                      {selectedPlace && (
                        <InfoWindow
                          position={{ lat: selectedPlace.latitude, lng: selectedPlace.longitude }}
                          onCloseClick={() => onShowAllPlaces?.()}
                        >
                          <div className="county-satellite-place-info">
                            <strong>{selectedPlace.cityName}</strong>
                            <span>{selectedPlace.isCountySeat ? 'County seat · ' : ''}{selectedPlace.providersCount} provider records</span>
                          </div>
                        </InfoWindow>
                      )}
                    </GoogleMap>
                  </APIProvider>
                ) : (
                  <div className="county-satellite-fallback" role="status">
                    <p>Satellite imagery is unavailable here. Showing the county boundary and place pins instead.</p>
                    <svg
                      ref={singleSvgRef}
                      viewBox={singleViewBox}
                      preserveAspectRatio="xMidYMid meet"
                      className="county-single-map-svg select-none"
                      role="group"
                      aria-label={`${activeCountyNode.countyName} boundary with ${projectedSingleCounty.cityPins.length} mapped places`}
                    >
                      <g ref={singleCountyRef}>
                        {projectedSingleCounty.svgPath && (
                          <path d={projectedSingleCounty.svgPath} fill="#e5ece9" stroke="#607d74" strokeWidth={2.2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                        )}
                        {projectedSingleCounty.cityPins.map((pin) => {
                          const isSelected = selectedCityName.toLowerCase() === pin.cityName.toLowerCase();
                          const isHovered = hoveredCityName === pin.cityName;
                          const showLabel = isSelected || isHovered;
                          const pinColor = isSelected ? '#2563eb' : pin.isCountySeat ? '#b7791f' : '#286987';
                          return (
                            <g
                              key={pin.cityName}
                              className="cv-pin"
                              tabIndex={0}
                              role="button"
                              aria-pressed={isSelected}
                              aria-label={`${pin.cityName}${pin.isCountySeat ? ', county seat' : ''}. Show providers for this place`}
                              onMouseEnter={() => setHoveredCityName(pin.cityName)}
                              onMouseLeave={() => setHoveredCityName(null)}
                              onFocus={() => setHoveredCityName(pin.cityName)}
                              onBlur={() => setHoveredCityName(null)}
                              onClick={() => onSelectCity(pin.cityName, activeCountyNode.countyName, stateNode.stateCode)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  onSelectCity(pin.cityName, activeCountyNode.countyName, stateNode.stateCode);
                                }
                              }}
                            >
                              <g transform={`translate(${pin.svgX},${pin.svgY}) scale(${1 / singleMapScale})`}>
                                <circle className="cv-pin-hit-area" cx="0" cy="0" r="18" />
                                <circle className="cv-map-place-dot" cx="0" cy="0" r={isSelected ? 7 : 5.5} fill={pinColor} />
                                <circle className="cv-map-place-dot-center" cx="0" cy="0" r="2" />
                              </g>
                              {showLabel && (
                                <text
                                  className="cv-pin-label"
                                  x={pin.svgX + 10 / singleMapScale}
                                  y={pin.svgY - 7 / singleMapScale}
                                  fontSize={12 / singleMapScale}
                                >
                                  {pin.cityName}
                                </text>
                              )}
                            </g>
                          );
                        })}
                      </g>
                    </svg>
                  </div>
                )}
              </div>
              <div className="cv-legend">
                <span><span className="cv-dot" style={{ backgroundColor: '#d4a72c' }} />County seat · {activeCountyNode.countySeat}</span>
                <span><span className="cv-dot" style={{ backgroundColor: '#2872b9' }} />Place</span>
                {selectedCityName !== 'all' && <span><span className="cv-dot" style={{ backgroundColor: '#d94b3d' }} />Selected place</span>}
                <span>Imagery: Google Maps satellite</span>
              </div>
            </div>

            <section className="cv-panel county-geo county-reference-panel county-city-directory-panel" aria-label={`${activeCountyNode.countyName} county reference`} data-testid="county-reference-panel">
              <div className="cv-geo-head">
                <div className="min-w-0">
                  <p className="cv-geo-kicker"><Landmark aria-hidden="true" />County reference</p>
                  <h4 className="cv-geo-title">{activeCountyNode.countyName}</h4>
                  <p className="county-reference-meta">{stateNode.stateName} · County FIPS {activeCountyNode.countyFips}</p>
                </div>
                <p className="cv-geo-note">County-level context for confirmation; not agency-level values.</p>
                {selectedCityName !== 'all' && onShowAllPlaces && (
                  <button type="button" onClick={onShowAllPlaces} className="cv-btn cv-btn--ghost shrink-0" data-testid="button-show-all-places">
                    <ArrowLeft aria-hidden="true" /> Show all places
                  </button>
                )}
              </div>

              <section className="county-reference-section" aria-labelledby="county-reference-figures-title">
                <h5 className="county-ref-section-title" id="county-reference-figures-title"><Users aria-hidden="true" />County figures</h5>
                <CountyFigureSourceDetails
                  countyFips={activeCountyNode.countyFips}
                  sources={activeCountyNode.countyRecord.figureSources}
                  record={activeCountyNode.countyRecord}
                  variant="brief"
                  showGeneralNotes={false}
                  showCitations={false}
                  className="cv-ref-figures"
                />
              </section>

              <section className="county-reference-section" aria-labelledby="county-reference-risk-title">
                <h5 className="county-ref-section-title" id="county-reference-risk-title"><Shield aria-hidden="true" />FEMA hazard context</h5>
                <div className="cv-ref-fema" style={riskStyle(activeCountyNri?.riskRating)} aria-label="FEMA National Risk Index natural hazard">
                  <p className="cv-ref-fema-head">
                    <span className="cv-ref-fema-label">National Risk Index</span>
                    <span className={`cv-ref-fema-rating${activeCountyNri?.riskRating ? '' : ' is-none'}`}>
                      {activeCountyNri?.riskRating ?? (nriQuery.isLoading ? 'Loading FEMA record' : nriQuery.isError ? 'FEMA source unavailable' : 'No county-equivalent record')}
                    </span>
                    {activeCountyNri?.riskScore != null && <span className="cv-ref-fema-meta">Score <strong>{activeCountyNri.riskScore.toFixed(2)}</strong></span>}
                    {activeCountyNri && <span className="cv-ref-fema-meta">{activeCountyNri.sourceVersion}</span>}
                    {activeCountyNri?.sourceUrl && <a href={activeCountyNri.sourceUrl} target="_blank" rel="noopener noreferrer" className="cv-link">FEMA record <ExternalLink aria-hidden="true" /></a>}
                  </p>
                  {activeCountyNri && (
                    <dl className="cv-ref-fema-facts">
                      <div><dt><BadgeDollarSign aria-hidden="true" />Expected annual loss</dt><dd>{formatLoss(activeCountyNri.expectedAnnualLoss)}</dd></div>
                      <div><dt><Users aria-hidden="true" />Social vulnerability</dt><dd>{activeCountyNri.socialVulnerabilityRating ?? 'not stated'}</dd></div>
                      <div><dt><HeartHandshake aria-hidden="true" />Community resilience</dt><dd>{activeCountyNri.communityResilienceRating ?? 'not stated'}</dd></div>
                    </dl>
                  )}
                </div>
              </section>

              <section className="county-reference-section county-reference-sources" aria-labelledby="county-reference-sources-title">
                <h5 className="county-ref-section-title" id="county-reference-sources-title"><FileText aria-hidden="true" />Sources &amp; coverage</h5>
                <CountyFigureSourceDetails
                  countyFips={activeCountyNode.countyFips}
                  sources={activeCountyNode.countyRecord.figureSources}
                  showValues={false}
                  showGeneralNotes
                  variant="brief"
                  className="cv-ref-figures"
                />
                <PublicProviderEvidenceCoverage state={stateNode.stateCode} county={activeCountyNode.countyFips} />
                <RegionalAedSources state={stateNode.stateCode} county={activeCountyNode.countyFips} />
                {sourceStrip}
              </section>

            </section>
          </div>
          <details className="county-layer-options"><summary>Equipment map layers</summary>
      <EquipmentMapFilter value={equipmentFilter} onChange={setEquipmentFilter} agencies={equipmentAgencies} scopeLabel="loaded records for this state and provider scope, before county selection"/>
      {isEquipmentMapActive&&<EquipmentCoverageLegend
        note={`County records are matched by FIPS or an unambiguous county name within ${stateNode.stateName}. “Both found in area” may be different agencies; candidate records still need confirmation. ${equipmentCoverage.unassignedCounty} loaded records have unresolved county geography and are not assigned to a county.`}
      />}
      {isEquipmentMapActive&&inspectedCounty&&<p className="cv-note" role="status" data-testid={`equipment-county-rollup-${inspectedCounty.countyFips}`}>
        {inspectedCounty.countyName} · {equipmentCoverage.byCounty[inspectedCounty.countyFips]?.total||0} loaded records ·
        {' '}ZOLL {equipmentCoverage.byCounty[inspectedCounty.countyFips]?.zoll||0} · other makers {equipmentCoverage.byCounty[inspectedCounty.countyFips]?.competitor||0} ·
        {' '}mixed {equipmentCoverage.byCounty[inspectedCounty.countyFips]?.mixed||0} · no recognized maker {equipmentCoverage.byCounty[inspectedCounty.countyFips]?.unknown||0} ·
        {' '}equipment details recorded {equipmentCoverage.byCounty[inspectedCounty.countyFips]?.reported||0} · no substantive equipment entry {equipmentCoverage.byCounty[inspectedCounty.countyFips]?.unreported||0}.
        {' '}Loaded-record counts, not a complete equipment census.
      </p>}
          </details>
          {unmatchedSection}
        </>
      )}
    </div>
  );
};
