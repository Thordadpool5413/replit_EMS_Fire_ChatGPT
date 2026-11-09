/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Agency } from '../types';
import {
  countyBoundaryHierarchy,
  CountyBoundaryNode,
  StateHierarchyNode,
  SvgProjectedCounty,
} from '../services/countyBoundaryHierarchyService';
import { CountyFigureSourceDetails } from './CountyFigureSourceDetails';
import { FEMA_NRI_RATING_COLORS } from '../utils/femaNriRisk';
import {
  getGetNriCountyContextQueryKey,
  useGetNriCountyContext,
} from '@workspace/api-client-react';
import { ExternalLink, ChevronRight, ArrowLeft } from 'lucide-react';
import { formatCoordinates } from '../utils/countyPresentation';
import './CountyInspector.css';

interface RealWorldCountyBoundaryMapProps {
  stateCode: string;
  selectedCountyName: string;
  selectedCityName: string;
  agencies: Agency[];
  showExplorerHeader?: boolean;
  onSelectCounty: (countyName: string, stateCode: string) => void;
  onSelectCity: (cityName: string, countyName: string, stateCode: string) => void;
  /** Clears the city filter while keeping the current county. */
  onShowAllPlaces?: () => void;
}

export const RealWorldCountyBoundaryMap: React.FC<RealWorldCountyBoundaryMapProps> = ({
  stateCode,
  selectedCountyName,
  selectedCityName,
  agencies,
  showExplorerHeader = true,
  onSelectCounty,
  onSelectCity,
  onShowAllPlaces,
}) => {
  const [isLoadingBoundaries, setIsLoadingBoundaries] = useState<boolean>(false);
  const [boundaryVersion, setBoundaryVersion] = useState<number>(0);
  const [hoveredCountyFips, setHoveredCountyFips] = useState<string | null>(null);
  const [hoveredCityName, setHoveredCityName] = useState<string | null>(null);
  const [countyMapViewBox, setCountyMapViewBox] = useState('0 0 720 400');
  const countyMapPathsRef = useRef<SVGGElement>(null);
  const singleCountyRef = useRef<SVGGElement>(null);
  const singleSvgRef = useRef<SVGSVGElement>(null);
  const [singleMapScale, setSingleMapScale] = useState(1);
  const [compactCountyMap, setCompactCountyMap] = useState(false);
  const [singleViewBox, setSingleViewBox] = useState('0 0 520 340');
  const [countyMapLayer] = useState<'nri-risk'>('nri-risk');
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
      setCompactCountyMap(svg.getBoundingClientRect().width < 420);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(svg);
    return () => observer.disconnect();
  }, [singleViewBox, activeCountyNode?.countyFips]);

  const inspectedCounty: SvgProjectedCounty | null = useMemo(() => {
    if (hoveredCountyFips) {
      const found = projectedState.projectedCounties.find((c) => c.countyFips === hoveredCountyFips);
      if (found) return found;
    }
    if (activeCountyNode) {
      const found = projectedState.projectedCounties.find((c) => c.countyFips === activeCountyNode.countyFips);
      if (found) return found;
    }
    return projectedState.projectedCounties[0] || null;
  }, [hoveredCountyFips, activeCountyNode, projectedState]);
  const inspectedNri = inspectedCounty
    ? nriByCountyFips.get(inspectedCounty.countyFips) ?? null
    : null;
  const nriColorFor = (fips: string) => {
    const rating = nriByCountyFips.get(fips)?.riskRating;
    return rating ? FEMA_NRI_RATING_COLORS[rating] ?? '#475569' : '#475569';
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
      <span><span className="cv-swatch" style={{ backgroundColor: '#475569' }} />No FEMA record</span>
    </div>
  );

  return (
    <div className="cv-stack">
      {showExplorerHeader && !activeCountyNode && (
        <header className="cv-dir-head">
          <div>
            <p className="cv-kicker">County boundaries</p>
            <h3 className="cv-title">{stateNode.stateName} counties</h3>
          </div>
          <span className="cv-meta tabular-nums">{stateNode.countiesList.length} counties</span>
        </header>
      )}

      {/* Mode A: statewide county boundaries + inspector */}
      {!activeCountyNode && (
        <>
          <div className="cv-state-grid county-state-map-grid">
            <div className="cv-map-panel county-state-map-panel">
              <div className="cv-map-head">
                <strong>{stateNode.stateName} · FEMA NRI risk by county</strong>
                <span className="tabular-nums">
                  {projectedState.projectedCounties.length} of {stateNode.countiesList.length} boundaries drawn
                </span>
              </div>

              {isLoadingBoundaries && projectedState.projectedCounties.length === 0 ? (
                <div className="cv-map-stage" role="status">
                  <span className="text-sm text-slate-300">Loading county boundaries for {stateNode.stateName}…</span>
                </div>
              ) : (
                <div className="cv-map-stage county-state-map-viewport">
                  <svg
                    viewBox={countyMapViewBox}
                    preserveAspectRatio="xMidYMid meet"
                    className="county-state-map-svg select-none"
                    role="group"
                    aria-label={`${stateNode.stateName} county boundaries. Select a county to open it.`}
                  >
                    <g ref={countyMapPathsRef}>
                      {projectedState.projectedCounties.map((pc) => {
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
                            stroke={isHovered ? '#FFFFFF' : isSelected ? '#BFD3FF' : '#1C2E45'}
                            strokeWidth={isHovered ? 2.6 : isSelected ? 2.1 : 1}
                            strokeLinejoin="round"
                            vectorEffect="non-scaling-stroke"
                            tabIndex={0}
                            role="button"
                            aria-label={`Open ${pc.countyName}, ${stateNode.stateName}. FEMA NRI ${nri?.riskRating ?? 'no record'}`}
                            className="cursor-pointer"
                            onMouseEnter={() => setHoveredCountyFips(pc.countyFips)}
                            onMouseLeave={() => setHoveredCountyFips(null)}
                            onFocus={() => setHoveredCountyFips(pc.countyFips)}
                            onBlur={() => setHoveredCountyFips(null)}
                            onClick={() => onSelectCounty(pc.countyName, stateNode.stateCode)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                onSelectCounty(pc.countyName, stateNode.stateCode);
                              }
                            }}
                          >
                            <title>
                              {`${pc.countyName}, ${stateNode.stateCode} · FIPS ${pc.countyFips} · Seat ${pc.countySeat} · ${pc.landAreaSqMiles.toLocaleString()} sq mi · FEMA NRI ${nri?.riskRating ?? 'no county-equivalent record'} · score ${nri?.riskScore?.toFixed(2) ?? 'not stated'} · expected annual loss ${formatLoss(nri?.expectedAnnualLoss)} · vintage ${nri?.sourceVersion ?? 'not stated'}`}
                            </title>
                          </path>
                        );
                      })}
                    </g>
                  </svg>
                </div>
              )}
              {legend}
            </div>

            <div className="cv-panel county-inspector-panel ci" aria-live="polite">
              {inspectedCounty ? (
                <>
                  <header className="ci-head">
                    <p className="ci-kicker">{hoveredCountyFips ? 'Previewing on map' : 'County preview · first county'}</p>
                    <h4 className="ci-name">{inspectedCounty.countyName}</h4>
                    <dl className="ci-ident">
                      <div><dt>Seat</dt><dd>{inspectedCounty.countySeat}</dd></div>
                      <div><dt>Area</dt><dd>{inspectedCounty.landAreaSqMiles.toLocaleString()} sq mi</dd></div>
                      <div><dt>FIPS</dt><dd>{inspectedCounty.countyFips}</dd></div>
                    </dl>
                  </header>

                  <dl className="ci-stats">
                    <div>
                      <dt>Population</dt>
                      <dd>{inspectedCounty.population.toLocaleString()}</dd>
                    </div>
                    <div>
                      <dt>Avg. EMS transport</dt>
                      <dd>{inspectedCounty.averageTransportMinutes}<small> min</small></dd>
                    </div>
                  </dl>

                  <section className="ci-risk" aria-label="FEMA National Risk Index" style={riskStyle(inspectedNri?.riskRating)}>
                    <div className="ci-risk-top">
                      <span className="ci-risk-label">FEMA National Risk Index</span>
                      {inspectedNri && (
                        <span className="ci-risk-score">
                          Score <strong>{inspectedNri.riskScore != null ? inspectedNri.riskScore.toFixed(2) : 'not stated'}</strong>
                        </span>
                      )}
                    </div>
                    <p className={`ci-risk-rating ${inspectedNri?.riskRating ? '' : 'ci-risk-rating--none'}`}>
                      <span className="ci-swatch" aria-hidden="true" />
                      {inspectedNri?.riskRating ?? (nriQuery.isLoading ? 'Loading FEMA record' : 'No FEMA NRI record')}
                    </p>
                    {inspectedNri && (
                      <dl className="ci-risk-facts">
                        <div><dt>Expected annual loss</dt><dd>{formatLoss(inspectedNri.expectedAnnualLoss)}</dd></div>
                        <div><dt>Social vulnerability</dt><dd>{inspectedNri.socialVulnerabilityRating ?? 'not stated'}</dd></div>
                        <div><dt>Community resilience</dt><dd>{inspectedNri.communityResilienceRating ?? 'not stated'}</dd></div>
                      </dl>
                    )}
                    {inspectedNri && (
                      <p className="ci-prov">
                        <span>Vintage {inspectedNri.sourceVersion}</span>
                        {inspectedNri.sourceUrl && (
                          <a href={inspectedNri.sourceUrl} target="_blank" rel="noopener noreferrer" className="ci-link">
                            FEMA record <ExternalLink aria-hidden="true" />
                          </a>
                        )}
                      </p>
                    )}
                  </section>

                  <section className="ci-places" aria-label="Mapped places">
                    <h5 className="ci-section">
                      <span>Mapped places</span>
                      <span className="ci-count">{inspectedCounty.node.citiesList.length}</span>
                    </h5>
                    <ul className="ci-place-list">
                      {inspectedCounty.node.citiesList.map((cityNode) => (
                        <li key={`${inspectedCounty.countyFips}-${cityNode.cityName}`}>
                          <button
                            type="button"
                            className="ci-place"
                            onClick={() => onSelectCity(cityNode.cityName, inspectedCounty.countyName, stateNode.stateCode)}
                            title={`ZIP ${cityNode.zipCodes.join(', ') || 'not listed'} · ${formatCoordinates(cityNode.latitude, cityNode.longitude, 3)}`}
                          >
                            <span className="ci-place-main">
                              <span className="ci-place-name">{cityNode.cityName}</span>
                              {cityNode.isCountySeat && <span className="ci-tag">Seat</span>}
                            </span>
                            <span className="ci-place-sub">
                              ZIP {cityNode.zipCodes.join(', ') || 'not listed'}
                            </span>
                            <ChevronRight aria-hidden="true" className="ci-place-chev" />
                          </button>
                        </li>
                      ))}
                    </ul>
                    {inspectedCounty.node.primaryZipCodes.length > 0 && (
                      <p className="ci-zips">
                        <strong>All ZIPs ({inspectedCounty.node.primaryZipCodes.length})</strong>{' '}
                        {inspectedCounty.node.primaryZipCodes.join(', ')}
                      </p>
                    )}
                  </section>

                  <footer className="ci-foot">
                    <button
                      type="button"
                      onClick={() => onSelectCounty(inspectedCounty.countyName, stateNode.stateCode)}
                      className="ci-btn"
                      data-testid="button-open-inspected-county"
                    >
                      <span className="ci-btn-text">Open {inspectedCounty.countyName}</span> <ChevronRight aria-hidden="true" />
                    </button>
                    <a
                      href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(`${inspectedCounty.countyName}, ${stateNode.stateName}`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ci-link ci-link--foot"
                    >
                      Check boundary on OpenStreetMap <ExternalLink aria-hidden="true" />
                    </a>
                  </footer>
                </>
              ) : (
                <p className="cv-note">County boundaries are not available for this state.</p>
              )}
            </div>
          </div>
          {sourceStrip}
          {unmatchedSection}
        </>
      )}

      {/* Mode B: single county boundary + places */}
      {activeCountyNode && projectedSingleCounty && (
        <>
          <div className="cv-state-grid">
            <div className="cv-map-panel county-single-map-panel county-municipality-map-panel">
              <div className="cv-map-head">
                <strong>{activeCountyNode.countyName} boundary and mapped places</strong>
                <span className="tabular-nums">{activeCountyNode.landAreaSqMiles.toLocaleString()} sq mi · FIPS {activeCountyNode.countyFips}</span>
              </div>
              <div className="cv-map-stage cv-map-stage--county">
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
                      <path d={projectedSingleCounty.svgPath} fill="#1A3456" stroke="#7FA7F5" strokeWidth={2.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                    )}
                    {projectedSingleCounty.cityPins.map((pin) => {
                      const isSelected = selectedCityName.toLowerCase() === pin.cityName.toLowerCase();
                      const isHovered = hoveredCityName === pin.cityName;
                      const showLabel = isSelected || isHovered || pin.isCountySeat || (!compactCountyMap && projectedSingleCounty.cityPins.length <= 10);
                      const label = pin.cityName.length > 22 && !isHovered && !isSelected ? `${pin.cityName.slice(0, 20)}…` : pin.cityName;
                      const [viewX, , viewWidth] = singleViewBox.split(' ').map(Number);
                      const labelOnLeft = pin.svgX > viewX + viewWidth * 0.65;
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
                          <circle className="cv-pin-ring" cx={pin.svgX} cy={pin.svgY} r={12 / singleMapScale} />
                          <circle
                            cx={pin.svgX}
                            cy={pin.svgY}
                            r={(isSelected || isHovered ? 6 : pin.isCountySeat ? 5 : 4) / singleMapScale}
                            fill={isSelected ? '#FFFFFF' : pin.isCountySeat ? '#F5B94A' : '#9DBBF7'}
                            stroke={isSelected ? '#2456C8' : '#0C1829'}
                            strokeWidth={isSelected ? 3 : 2}
                            vectorEffect="non-scaling-stroke"
                          />
                          {showLabel && (
                            <text
                              className="cv-pin-label"
                              x={pin.svgX + (labelOnLeft ? -10 : 10) / singleMapScale}
                              y={pin.svgY + 4 / singleMapScale}
                              textAnchor={labelOnLeft ? 'end' : 'start'}
                              fontSize={12 / singleMapScale}
                              fontWeight={isSelected ? 700 : 600}
                              fill="#F3F7FC"
                              stroke="#0C1829"
                              strokeWidth={3 / singleMapScale}
                              paintOrder="stroke"
                            >
                              {label}
                            </text>
                          )}
                          <title>
                            {`${pin.cityName} · ZIP ${pin.zipCodes.join(', ') || 'not listed'} · ${formatCoordinates(pin.latitude, pin.longitude, 4)} · ${pin.providersCount} provider records`}
                          </title>
                        </g>
                      );
                    })}
                  </g>
                </svg>
              </div>
              <div className="cv-legend">
                <span><span className="cv-dot" style={{ backgroundColor: '#F5B94A' }} />County seat · {activeCountyNode.countySeat}</span>
                <span><span className="cv-dot" style={{ backgroundColor: '#9DBBF7' }} />Place</span>
                <span><span className="cv-dot" style={{ backgroundColor: '#FFFFFF', boxShadow: '0 0 0 2px #2456C8' }} />Selected</span>
              </div>
            </div>

            <div className="cv-panel county-city-directory-panel">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="cv-kicker">{stateNode.stateName}</p>
                  <h4 className="cv-title">Places in {activeCountyNode.countyName}</h4>
                  <p className="cv-meta tabular-nums" data-testid="text-county-place-summary">
                    {projectedSingleCounty.cityPins.length} mapped places · {projectedSingleCounty.providerRecordCount} unique provider records
                  </p>
                </div>
                {selectedCityName !== 'all' && onShowAllPlaces && (
                  <button type="button" onClick={onShowAllPlaces} className="cv-btn cv-btn--ghost shrink-0" data-testid="button-show-all-places">
                    <ArrowLeft aria-hidden="true" /> Show all places
                  </button>
                )}
              </div>

              <div className="cv-place-list" role="list">
                {projectedSingleCounty.cityPins.map((pin) => {
                  const isSelected = selectedCityName.toLowerCase() === pin.cityName.toLowerCase();
                  return (
                    <div role="listitem" key={pin.cityName}>
                      <button
                        type="button"
                        className="cv-place-row"
                        aria-pressed={isSelected}
                        data-hover={hoveredCityName === pin.cityName}
                        onMouseEnter={() => setHoveredCityName(pin.cityName)}
                        onMouseLeave={() => setHoveredCityName(null)}
                        onFocus={() => setHoveredCityName(pin.cityName)}
                        onBlur={() => setHoveredCityName(null)}
                        onClick={() => onSelectCity(pin.cityName, activeCountyNode.countyName, stateNode.stateCode)}
                        data-testid={`button-place-${pin.cityName}`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className="cv-place-name">{pin.cityName}</span>
                            {pin.isCountySeat && <span className="cv-tag">County seat</span>}
                          </span>
                          <span className="cv-place-sub block">
                            ZIP {pin.zipCodes.join(', ') || 'not listed'} · {formatCoordinates(pin.latitude, pin.longitude, 3)}
                          </span>
                        </span>
                        <span className="cv-place-count">
                          {pin.providersCount} {pin.providersCount === 1 ? 'record' : 'records'}
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>

              <div>
                <div className="cv-section-label"><span>County ZIP references</span><span>{activeCountyNode.primaryZipCodes.length}</span></div>
                <p className="cv-zips mt-1">{activeCountyNode.primaryZipCodes.join(', ') || 'None listed'}</p>
              </div>

              <a
                href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(`${activeCountyNode.countyName}, ${stateNode.stateName}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="cv-link mt-auto"
              >
                Check boundary on OpenStreetMap <ExternalLink aria-hidden="true" />
              </a>
            </div>
          </div>

          <section className="cv-panel" aria-label={`${activeCountyNode.countyName} reference figures and sources`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h4 className="cv-title !text-base">County reference figures</h4>
                <p className="cv-note">County-level working references for your confirmation; not values for an individual provider.</p>
              </div>
              <div className="cv-risk">
                <span className={`cv-risk-badge ${nriByCountyFips.get(activeCountyNode.countyFips)?.riskRating ? '' : 'cv-risk-badge--none'}`} style={riskStyle(nriByCountyFips.get(activeCountyNode.countyFips)?.riskRating)}>
                  FEMA NRI · {nriByCountyFips.get(activeCountyNode.countyFips)?.riskRating ?? 'No record'}
                </span>
                {nriByCountyFips.get(activeCountyNode.countyFips)?.riskScore != null && (
                  <span className="cv-risk-score">Score <strong>{nriByCountyFips.get(activeCountyNode.countyFips)!.riskScore!.toFixed(2)}</strong></span>
                )}
              </div>
            </div>
            <CountyFigureSourceDetails
              countyFips={activeCountyNode.countyFips}
              sources={activeCountyNode.countyRecord.figureSources}
              record={activeCountyNode.countyRecord}
            />
            {sourceStrip}
          </section>
          {unmatchedSection}
        </>
      )}
    </div>
  );
};
