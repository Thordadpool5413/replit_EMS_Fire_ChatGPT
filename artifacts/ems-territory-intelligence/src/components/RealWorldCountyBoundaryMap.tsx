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
import { getCountyDenialDisplay } from '../services/countyDenialProfileService';
import { CountyFigureSourceDetails } from './CountyFigureSourceDetails';
import {
  getGetNriCountyContextQueryKey,
  useGetNriCountyContext,
} from '@workspace/api-client-react';
import { Compass, Layers, MapPin, Building2, ExternalLink, ChevronRight } from 'lucide-react';

const CMS_MEDICARE_GEOGRAPHIC_VARIATION_URL =
  'https://data.cms.gov/summary-statistics-on-use-and-payments/medicare-geographic-comparisons/medicare-geographic-variation-by-national-state-county';

interface RealWorldCountyBoundaryMapProps {
  stateCode: string;
  selectedCountyName: string;
  selectedCityName: string;
  agencies: Agency[];
  onSelectCounty: (countyName: string, stateCode: string) => void;
  onSelectCity: (cityName: string, countyName: string, stateCode: string) => void;
}

export const RealWorldCountyBoundaryMap: React.FC<RealWorldCountyBoundaryMapProps> = ({
  stateCode,
  selectedCountyName,
  selectedCityName,
  agencies,
  onSelectCounty,
  onSelectCity,
}) => {
  const [isLoadingBoundaries, setIsLoadingBoundaries] = useState<boolean>(false);
  const [boundaryVersion, setBoundaryVersion] = useState<number>(0);
  const [hoveredCountyFips, setHoveredCountyFips] = useState<string | null>(null);
  const [hoveredCityName, setHoveredCityName] = useState<string | null>(null);
  const [countyMapViewBox, setCountyMapViewBox] = useState('0 0 720 400');
  const countyMapPathsRef = useRef<SVGGElement>(null);
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
  const inspectedCountyDenialDisplay = useMemo(
    () => inspectedCounty ? getCountyDenialDisplay(inspectedCounty.node.countyRecord) : null,
    [inspectedCounty],
  );
  const inspectedNri = inspectedCounty
    ? nriByCountyFips.get(inspectedCounty.countyFips) ?? null
    : null;
  const nriRatingColors: Record<string, string> = {
    'Very Low': '#34D399',
    'Relatively Low': '#10B981',
    'Relatively Moderate': '#FACC15',
    'Relatively High': '#FB923C',
    'Very High': '#F43F5E',
  };
  const nriColorFor = (fips: string) => {
    const rating = nriByCountyFips.get(fips)?.riskRating;
    return rating ? nriRatingColors[rating] ?? '#475569' : '#475569';
  };

  if (!stateNode) return null;

  return (
    <div className="space-y-3">
      <header className="county-risk-explorer-header flex flex-col gap-3 rounded-xl border border-slate-200/80 bg-white p-3 shadow-[0_10px_35px_-28px_rgba(15,23,42,0.4)] sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-blue-700">
            <Compass className="h-4 w-4" />
            County risk explorer
          </div>
          <h3 className="mt-1 text-lg font-bold tracking-tight text-slate-950 sm:text-xl">
            {stateNode.stateName} county profiles
          </h3>
          <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-slate-600">
            Select a county on the map to inspect local context and connected cities.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-800">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            FEMA National Risk Index
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 tabular-nums">
            {stateNode.countiesList.length} counties
          </span>
        </div>
      </header>

      <details className="group rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-[0_6px_20px_-18px_rgba(15,23,42,0.35)]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold text-slate-700 marker:hidden">
          <span className="inline-flex items-center gap-2">
            <Layers className="h-4 w-4 text-blue-700" />
            Boundary and source details
          </span>
          <span className="text-xs font-medium text-slate-500 group-open:hidden">Show</span>
          <span className="hidden text-xs font-medium text-slate-500 group-open:inline">Hide</span>
        </summary>
        <div className="mt-3 grid gap-3 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-600 sm:grid-cols-2">
          <div>
            <a
              href="https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline"
            >
              Bundled U.S. Census TIGER/Line boundaries · vintage not stated
              <ExternalLink className="h-3 w-3" />
            </a>
            <p className="mt-1">
              State FIPS {stateNode.stateFips} · {(activeCountyNode ? activeCountyNode.landAreaSqMiles : stateNode.totalLandAreaSqMiles).toLocaleString()} sq mi · Census TIGER FIPS/GEOID join
            </p>
          </div>
          <div>
            <span className="font-semibold text-slate-700">FEMA NRI</span>
            <p className="mt-1">
              {nriQuery.isLoading
                ? `Loading county-equivalent records for ${stateNode.stateCode}…`
                : nriQuery.isError
                  ? 'County risk data could not be loaded.'
                  : `${nriByCountyFips.size} county-equivalent records · native scope: county FIPS · reporting period not stated · FEMA NRI data vintage: ${nriQuery.data?.sourceVersion ?? 'version not stated'}`}
              {!nriQuery.isLoading && !nriQuery.isError && nriQuery.data?.sourceUrl && (
                <>
                  {' · '}
                  <a
                    href={nriQuery.data.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-blue-700 hover:underline"
                  >
                    Open FEMA source
                  </a>
                </>
              )}
            </p>
            <p className="mt-1">
              Boundary area: {(activeCountyNode ? activeCountyNode.bbox[1] : stateNode.bbox[1]).toFixed(2)}°N, {(activeCountyNode ? activeCountyNode.bbox[0] : stateNode.bbox[0]).toFixed(2)}°W
            </p>
          </div>
        </div>
      </details>

      {countyMapLayer === 'nri-risk' && unmatchedNriRecords.length > 0 && (
        <section
          className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950"
          aria-label="FEMA source geographies that do not match the app map"
        >
          <h4 className="text-xs font-bold">
            FEMA county-equivalent records not matched to these map boundaries
          </h4>
          <p className="mt-1 text-[10px] leading-relaxed">
            These source records have their own FIPS IDs and exact values. They are listed below, not shaded onto a different app boundary.
            {stateNode.stateCode === 'CT' && (
              <>
                {' '}For Connecticut, the app boundary file still contains 8 legacy counties, while current Census statistical geography uses 9 planning-region county-equivalents since 2022.
                {' '}
                <a
                  href="https://www2.census.gov/geo/pdfs/reference/ct_county_equiv_change.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold underline underline-offset-2"
                >
                  Census change notice
                </a>
                .
              </>
            )}
          </p>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {unmatchedNriRecords.map((record) => (
              <li key={record.countyFips} className="rounded-md border border-amber-200 bg-white/80 p-2 text-[10px]">
                <div className="font-semibold">
                  {record.countyName} · FIPS {record.countyFips}
                </div>
                <div className="mt-0.5">
                  Native scope: {record.countyName}, {record.stateCode} county-equivalent · FIPS {record.countyFips} · reporting period not stated · data vintage {record.sourceVersion} · {record.riskRating ?? 'Risk rating not stated'} · risk score {record.riskScore?.toFixed(2) ?? 'not stated'} · expected annual loss {record.expectedAnnualLoss == null
                    ? 'not stated'
                    : `$${record.expectedAnnualLoss.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                </div>
                <a
                  href={record.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 inline-block font-medium text-blue-800 underline underline-offset-2"
                >
                  FEMA NRI data vintage · {record.sourceVersion}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Mode A: Statewide County Boundary Choropleth + Hierarchy Inspector */}
      {!activeCountyNode && (
        <div className="county-state-map-grid grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
          {/* Left 7 Cols: Interactive SVG County Boundary Map */}
          <div className="county-state-map-panel relative isolate overflow-hidden rounded-xl border border-[#243751] bg-[#0A1526] p-3 shadow-[0_20px_50px_-30px_rgba(8,20,39,0.75)] sm:p-4 lg:col-span-7 flex min-h-[320px] flex-col justify-between">
            <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-28 -z-10 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-medium text-slate-300">Select any county boundary to explore its cities and providers</span>
              <span className="rounded-full border border-white/10 bg-white/[0.05] px-2.5 py-1 font-mono text-[11px] tabular-nums text-slate-300">
                {projectedState.projectedCounties.length} / {stateNode.countiesList.length} boundaries
              </span>
            </div>

            {isLoadingBoundaries && projectedState.projectedCounties.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-sm text-slate-300">
                Loading U.S. Census TIGER/Line county boundary polygons for {stateNode.stateName}...
              </div>
            ) : (
              <div className="county-state-map-viewport relative flex w-full min-h-0 flex-1 items-center justify-center overflow-hidden">
                <svg
                  viewBox={countyMapViewBox}
                  preserveAspectRatio="xMidYMid meet"
                  className="county-state-map-svg h-full max-h-[300px] w-full min-h-0 select-none drop-shadow-[0_8px_22px_rgba(0,0,0,0.24)]"
                  role="img"
                  aria-label={`${stateNode.stateName} County Boundaries Map`}
                >
                  <g ref={countyMapPathsRef}>
                    {projectedState.projectedCounties.map((pc) => {
                      const isHovered = hoveredCountyFips === pc.countyFips;
                      const isSelected =
                        selectedCountyName !== 'all' &&
                        pc.countyName.toLowerCase() === selectedCountyName.toLowerCase();
                      const fillColor = nriColorFor(pc.countyFips);
                      const strokeColor = isHovered ? '#FFFFFF' : isSelected ? '#BAE6FD' : '#20334A';

                      return (
                        <path
                          key={pc.countyFips}
                          d={pc.svgPath}
                          fill={fillColor}
                          stroke={strokeColor}
                          strokeWidth={isHovered ? 2.7 : isSelected ? 2.1 : 1.05}
                          strokeLinejoin="round"
                          tabIndex={0}
                          role="button"
                          aria-label={`Open ${pc.countyName}, ${stateNode.stateName}`}
                          className="cursor-pointer transition-[fill,stroke,opacity] duration-150 hover:brightness-110 focus-visible:outline-none"
                          onMouseEnter={() => setHoveredCountyFips(pc.countyFips)}
                          onMouseLeave={() => setHoveredCountyFips(null)}
                          onClick={() => onSelectCounty(pc.countyName, stateNode.stateCode)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              onSelectCounty(pc.countyName, stateNode.stateCode);
                            }
                          }}
                        >
                          <title>
                            {`${pc.countyName}, ${stateNode.stateCode} · native scope: county-equivalent FIPS ${pc.countyFips} · Seat: ${pc.countySeat} · ${pc.citiesCount} Cities · ${pc.landAreaSqMiles} sq mi · FEMA NRI ${nriByCountyFips.get(pc.countyFips)?.riskRating ?? 'no county-equivalent record'} · risk score ${nriByCountyFips.get(pc.countyFips)?.riskScore?.toFixed(2) ?? 'not stated'} · expected annual loss ${nriByCountyFips.get(pc.countyFips)?.expectedAnnualLoss == null ? 'not stated' : `$${nriByCountyFips.get(pc.countyFips)!.expectedAnnualLoss!.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} · reporting period not stated · data vintage ${nriByCountyFips.get(pc.countyFips)?.sourceVersion ?? 'version not stated'} · ${nriByCountyFips.get(pc.countyFips)?.sourceUrl ?? 'no source record'}`}
                          </title>
                        </path>
                      );
                    })}
                  </g>
                </svg>
              </div>
            )}

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2 text-[10px] text-slate-300">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {Object.entries(nriRatingColors).map(([rating, color]) => (
                  <span key={rating} className="flex items-center gap-2">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm ring-1 ring-white/30" style={{ backgroundColor: color }} />
                    <span>{rating}</span>
                  </span>
                ))}
                <span className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm bg-slate-600 ring-1 ring-white/30" />
                  <span>No matching data</span>
                </span>
              </div>
              <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">FEMA risk level</span>
            </div>
          </div>

          {/* Right 5 Cols: Real-Time County Boundary & City Hierarchy Node Inspector */}
          <div className="county-state-summary-panel county-inspector-panel lg:col-span-5 flex flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-[0_12px_40px_-32px_rgba(15,23,42,0.42)] sm:p-4">
            {inspectedCounty ? (
              <div className="county-inspector-content">
                <div className="county-inspector-heading">
                  <div className="county-inspector-kicker-row">
                    <span className="county-inspector-kicker">
                      {hoveredCountyFips || !activeCountyNode ? 'Map preview' : 'Selected county'}
                    </span>
                    <span className="county-inspector-fips">
                      FIPS {inspectedCounty.countyFips}
                    </span>
                  </div>
                  <h4 className="county-inspector-title">
                    {inspectedCounty.countyName}, {stateNode.stateName}
                  </h4>
                  <div className="county-inspector-meta">
                    <span>County seat <strong>{inspectedCounty.countySeat}</strong></span>
                    <span aria-hidden="true">·</span>
                    <span>{inspectedCounty.landAreaSqMiles.toLocaleString()} sq mi</span>
                  </div>
                </div>

                <div className="county-inspector-metrics">
                  <div className="county-inspector-metric county-inspector-metric-population">
                    <span className="county-inspector-metric-label">Population reference</span>
                    <span className="county-inspector-metric-value">
                      {inspectedCounty.population.toLocaleString()}
                    </span>
                  </div>
                  <div className="hidden">
                    <span className="text-[11px] font-sans text-slate-500 block">
                      {inspectedCountyDenialDisplay?.kind === 'county-claims-rate'
                        ? 'Medicare claim summary'
                        : inspectedCountyDenialDisplay?.kind === 'zip-profile'
                          ? 'ZIP-profile source record'
                          : 'County claim source record'}
                    </span>
                    <span className="text-sm font-bold text-rose-700 mt-0.5 block">
                      {inspectedCountyDenialDisplay?.kind === 'county-claims-rate'
                        ? `${inspectedCountyDenialDisplay.deniedClaimCount.toLocaleString()} denied / ${inspectedCountyDenialDisplay.adjudicatedClaimCount.toLocaleString()} adjudicated`
                        : inspectedCountyDenialDisplay?.kind === 'zip-profile'
                          ? `ZIP ${inspectedCountyDenialDisplay.zipCode} record`
                          : 'No source record'}
                    </span>
                    {inspectedCountyDenialDisplay?.kind === 'zip-profile' ? (
                      <span className="text-[10px] text-slate-500 block mt-0.5 leading-tight font-sans">
                        {inspectedCountyDenialDisplay.city} · ZIP {inspectedCountyDenialDisplay.zipCode} profile · {inspectedCountyDenialDisplay.reportingPeriod} · {inspectedCountyDenialDisplay.claimScope} ·{' '}
                        <a
                          href={inspectedCountyDenialDisplay.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-700 hover:underline"
                        >
                          source
                        </a>
                        ; not a county claims aggregate.
                      </span>
                    ) : inspectedCountyDenialDisplay?.kind === 'unavailable' ? (
                      <span className="text-[10px] text-slate-500 block mt-0.5 leading-tight font-sans">
                        No source-backed denied/adjudicated ambulance claim counts are loaded for this county. CMS PSPS reports service counts by carrier/locality, not county claim totals, and masks cells under 11. A county rate needs counts for this FIPS, claim scope, and period.
                        {' '}
                        <a
                          href="https://data.cms.gov/summary-statistics-on-use-and-payments/physiciansupplier-procedure-summary"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-700 hover:underline"
                        >
                          CMS PSPS limits
                        </a>
                        {' · '}
                        <a
                          href={CMS_MEDICARE_GEOGRAPHIC_VARIATION_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-700 hover:underline"
                        >
                          CMS use/spending data (not denials)
                        </a>
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-500 block mt-0.5 leading-tight font-sans">
                        FIPS {inspectedCountyDenialDisplay?.countyFips} · denied{' '}
                        {inspectedCountyDenialDisplay?.deniedClaimCount} / adjudicated{' '}
                        {inspectedCountyDenialDisplay?.adjudicatedClaimCount} · {inspectedCountyDenialDisplay?.claimScope} · definition: {inspectedCountyDenialDisplay?.denialDefinition} ·{' '}
                        {inspectedCountyDenialDisplay?.reportingPeriod} ·{' '}
                        {inspectedCountyDenialDisplay?.sourceUrl ? (
                          <a
                            href={inspectedCountyDenialDisplay.sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-700 hover:underline"
                          >
                            {inspectedCountyDenialDisplay.source}
                          </a>
                        ) : (
                          <>Source: {inspectedCountyDenialDisplay?.source}</>
                        )}
                      </span>
                    )}
                  </div>
                  <div className="county-inspector-metric county-inspector-metric-transport">
                    <span className="county-inspector-metric-label">Average transport</span>
                    <span className="county-inspector-metric-value county-inspector-metric-value-accent">
                      {inspectedCounty.averageTransportMinutes}<small> min</small>
                    </span>
                  </div>
                </div>

                <section
                  className="county-nri-panel"
                  aria-label="FEMA National Risk Index"
                  style={{
                    borderLeftColor: inspectedNri?.riskRating
                      ? nriRatingColors[inspectedNri.riskRating] ?? '#64748B'
                      : '#64748B',
                  }}
                >
                  <div className="county-nri-main">
                    <span
                      className="county-nri-marker"
                      style={{ backgroundColor: inspectedNri?.riskRating ? nriRatingColors[inspectedNri.riskRating] ?? '#64748B' : '#64748B' }}
                      aria-hidden="true"
                    />
                    <div className="county-nri-copy">
                      <span className="county-inspector-metric-label">FEMA National Risk Index</span>
                      <strong>{inspectedNri?.riskRating ?? 'No NRI record'}</strong>
                    </div>
                  </div>
                  <div
                    className="county-nri-score"
                    style={{
                      borderColor: inspectedNri?.riskRating
                        ? nriRatingColors[inspectedNri.riskRating] ?? '#64748B'
                        : '#64748B',
                    }}
                  >
                    <span>Score</span>
                    <strong>{inspectedNri?.riskScore != null ? inspectedNri.riskScore.toFixed(2) : '—'}</strong>
                  </div>
                  <div className="county-nri-source">
                    <span>
                      {inspectedNri
                        ? `County-equivalent FIPS ${inspectedNri.countyFips} · reporting period not stated · FEMA NRI vintage ${inspectedNri.sourceVersion}`
                        : 'No risk score reported'}
                    </span>
                    {inspectedNri?.sourceUrl && (
                      <a
                        href={inspectedNri.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex shrink-0 items-center gap-1 font-semibold"
                      >
                        FEMA record
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </section>

                <CountyFigureSourceDetails
                  countyFips={inspectedCounty.countyFips}
                  sources={inspectedCounty.node.countyRecord.figureSources}
                />
                {inspectedNri && (
                  <details className="county-inspector-disclosure">
                    <summary>Additional FEMA context</summary>
                    <p>
                      FEMA National Risk Index context for {inspectedNri.countyName}, {inspectedNri.stateCode} · native scope: county-equivalent FIPS {inspectedNri.countyFips} · reporting period not stated · data vintage: {inspectedNri.sourceVersion} · population {inspectedNri.population?.toLocaleString() ?? 'not stated'} · expected annual loss ${inspectedNri.expectedAnnualLoss?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? 'not stated'} · social vulnerability {inspectedNri.socialVulnerabilityRating ?? 'not stated'} · community resilience {inspectedNri.communityResilienceRating ?? 'not stated'}. These county-level measures are context only; they are not values for the city or an individual agency.
                    </p>
                  </details>
                )}

                {/* Mapped Real-World Cities in this County Node */}
                <div className="county-inspector-places">
                  <div className="county-inspector-places-heading">
                    <span className="county-inspector-subheading">
                      City/place reference labels ({inspectedCounty.node.citiesList.length})
                    </span>
                    <span className="county-inspector-zip">
                      ZIPs: {inspectedCounty.node.primaryZipCodes.slice(0, 4).join(', ')}
                    </span>
                  </div>

                  <div className="county-inspector-city-list max-h-48 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
                    {inspectedCounty.node.citiesList.map((cityNode) => (
                      <div
                        key={`${inspectedCounty.countyFips}-${cityNode.cityName}`}
                        onClick={() => onSelectCity(cityNode.cityName, inspectedCounty.countyName, stateNode.stateCode)}
                        className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2.5 text-sm transition-colors hover:bg-blue-50/60"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Building2 className="county-inspector-city-icon w-3.5 h-3.5 shrink-0" />
                          <span className="county-inspector-city-name truncate">{cityNode.cityName}</span>
                          {cityNode.isCountySeat && (
                            <span className="county-inspector-seat shrink-0">(County Seat)</span>
                          )}
                        </div>
                        <div className="county-inspector-city-meta flex items-center gap-2 font-mono text-[11px] tabular-nums shrink-0">
                          <span>ZIP {cityNode.zipCode}</span>
                          <span aria-hidden="true">·</span>
                          <span>{cityNode.latitude.toFixed(2)}°N</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {inspectedCounty && (
              <div className="county-inspector-actions pt-4 border-t border-slate-100 flex items-center justify-between gap-2 mt-4">
                <a
                  href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(`${inspectedCounty.countyName}, ${stateNode.stateName}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="county-inspector-map-link inline-flex items-center gap-1 text-xs font-semibold hover:underline"
                >
                  <span>Verify Boundary on Maps</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>

                <button
                  type="button"
                  onClick={() => onSelectCounty(inspectedCounty.countyName, stateNode.stateCode)}
                  className="county-inspector-open-button px-4 py-2 rounded-lg text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  Open {inspectedCounty.countyName} Providers &rarr;
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mode B: Single County Boundary Polygon + Plotted Real-World City Coordinates */}
      {activeCountyNode && projectedSingleCounty && (
        <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-12">
          {/* Map-first county view with the geographic detail kept visually prominent. */}
          <div className="county-single-map-panel relative isolate flex min-h-[440px] flex-col justify-between overflow-hidden rounded-2xl border border-[#243751] bg-[radial-gradient(ellipse_at_52%_45%,rgba(37,99,235,0.12),transparent_58%),linear-gradient(145deg,#0a1527,#10243b)] p-4 text-white shadow-[0_20px_50px_-30px_rgba(8,20,39,0.75)] sm:p-5 xl:col-span-7">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-3">
              <div>
                <div className="text-[11px] font-bold uppercase tracking-[0.15em] text-cyan-200">Municipality map</div>
                <h4 className="mt-1 text-lg font-bold tracking-tight text-white sm:text-xl">
                  {activeCountyNode.countyName}
                </h4>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-lg border border-white/10 bg-white/[0.06] px-2.5 py-1.5 text-xs font-semibold text-slate-200">
                  FIPS <span className="font-mono tabular-nums text-white">{activeCountyNode.countyFips}</span>
                </span>
                <span className="rounded-lg border border-white/10 bg-white/[0.06] px-2.5 py-1.5 text-xs font-medium text-slate-300">
                  {activeCountyNode.landAreaSqMiles.toLocaleString()} sq mi
                </span>
              </div>
            </div>

            <div className="relative flex min-h-[340px] w-full flex-1 items-center justify-center py-2">
              <svg
                viewBox="0 0 520 340"
                className="county-single-map-svg h-auto max-h-[440px] w-full select-none"
                role="img"
                aria-label={`${activeCountyNode.countyName} Boundary Polygon and Cities`}
              >
                {projectedSingleCounty.svgPath && (
                  <path
                    d={projectedSingleCounty.svgPath}
                    fill="#18324F"
                    stroke="#60A5FA"
                    strokeWidth={3}
                    strokeLinejoin="round"
                  />
                )}

                {projectedSingleCounty.cityPins.map((pin) => {
                  const isSelected = selectedCityName.toLowerCase() === pin.cityName.toLowerCase();
                  const isHovered = hoveredCityName === pin.cityName;
                  return (
                    <g
                      key={pin.cityName}
                      className="cursor-pointer"
                      onMouseEnter={() => setHoveredCityName(pin.cityName)}
                      onMouseLeave={() => setHoveredCityName(null)}
                      onClick={() => onSelectCity(pin.cityName, activeCountyNode.countyName, stateNode.stateCode)}
                    >
                      <circle
                        cx={pin.svgX}
                        cy={pin.svgY}
                        r={isSelected || isHovered ? 8 : pin.isCountySeat ? 6.5 : 5.5}
                        fill={isSelected ? '#FB7185' : pin.isCountySeat ? '#22D3EE' : '#A5B4FC'}
                        stroke="#081426"
                        strokeWidth={2.4}
                      />
                      <text
                        x={pin.svgX + 8}
                        y={pin.svgY + 4}
                        fontSize="12"
                        fontWeight="700"
                        fill="#F8FAFC"
                        stroke="#0A1526"
                        strokeWidth="3"
                        paintOrder="stroke"
                      >
                        {pin.cityName}
                      </text>
                      <title>
                        {`${pin.cityName} (ZIP ${pin.zipCode}) · ${pin.latitude.toFixed(4)}°N, ${pin.longitude.toFixed(4)}°W · ${pin.providersCount} EMS/Fire Providers`}
                      </title>
                    </g>
                  );
                })}
              </svg>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3 text-xs text-slate-300">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.5)]" />
                  <span>County seat · {activeCountyNode.countySeat}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-indigo-300" />
                  <span>City / town</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-rose-400" />
                  <span>Selected city</span>
                </span>
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Census geography</span>
            </div>
          </div>

          {/* Connected city and provider directory */}
          <div className="county-city-directory-panel flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_12px_40px_-32px_rgba(15,23,42,0.42)] sm:p-5 xl:col-span-5">
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-700">
                    {stateNode.stateName} · {stateNode.stateCode}
                  </div>
                  <h4 className="mt-1 text-lg font-bold tracking-tight text-slate-950">
                    Cities and places
                  </h4>
                  <p className="mt-0.5 text-sm text-slate-600">
                    {projectedSingleCounty.cityPins.length} mapped locations · {projectedSingleCounty.cityPins.reduce((total, pin) => total + pin.providersCount, 0)} provider records
                  </p>
                </div>
                {selectedCityName !== 'all' && (
                  <button
                    type="button"
                    onClick={() => onSelectCity(selectedCityName, activeCountyNode.countyName, stateNode.stateCode)}
                    className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
                  >
                    Show all
                  </button>
                )}
              </div>

              <div className="max-h-[420px] overflow-y-auto divide-y divide-slate-100 rounded-xl border border-slate-200">
                {projectedSingleCounty.cityPins.map((pin) => {
                  const isSelected = selectedCityName.toLowerCase() === pin.cityName.toLowerCase();
                  return (
                    <div
                      key={pin.cityName}
                      onClick={() => onSelectCity(pin.cityName, activeCountyNode.countyName, stateNode.stateCode)}
                      className={`flex min-h-[62px] cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm transition-colors ${
                        isSelected ? 'bg-blue-50 font-semibold' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-slate-950 font-semibold">
                          <MapPin className={`h-4 w-4 shrink-0 ${isSelected ? 'text-rose-600' : pin.isCountySeat ? 'text-cyan-700' : 'text-blue-700'}`} />
                          <span className="truncate">{pin.cityName}</span>
                          {pin.isCountySeat && (
                            <span className="shrink-0 rounded-full bg-cyan-50 px-2 py-0.5 text-[10px] font-semibold text-cyan-800">County seat</span>
                          )}
                        </div>
                        <div className="mt-1 pl-6 text-xs tabular-nums text-slate-500">
                          ZIP {pin.zipCode} · {pin.latitude.toFixed(4)}°N, {pin.longitude.toFixed(4)}°W
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold tabular-nums text-slate-700">
                          {pin.providersCount} providers
                        </span>
                        <ChevronRight className="h-4 w-4 text-blue-700" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
              <details className="group min-w-0 text-xs text-slate-600">
                <summary className="cursor-pointer font-semibold text-slate-700">
                  ZIP references ({activeCountyNode.primaryZipCodes.length})
                </summary>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {activeCountyNode.primaryZipCodes.map((zip) => (
                    <span key={zip} className="rounded-md bg-slate-100 px-2 py-1 font-mono text-[11px] tabular-nums text-slate-700">{zip}</span>
                  ))}
                </div>
              </details>
              <a
                href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(`${activeCountyNode.countyName}, ${stateNode.stateName}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-blue-800"
              >
                <span>Open map</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
