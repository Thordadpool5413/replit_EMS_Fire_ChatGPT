/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useMemo } from 'react';
import { Agency } from '../types';
import {
  countyBoundaryHierarchy,
  CountyBoundaryNode,
  StateHierarchyNode,
  SvgProjectedCounty,
} from '../services/countyBoundaryHierarchyService';
import { getCountyDenialDisplay } from '../services/countyDenialProfileService';
import {
  getGetNriCountyContextQueryKey,
  useGetNriCountyContext,
} from '@workspace/api-client-react';
import { Compass, Layers, MapPin, Building2, CheckCircle2, ExternalLink } from 'lucide-react';

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
  const [countyMapLayer, setCountyMapLayer] = useState<'denial' | 'nri-risk'>('denial');
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
  const hasDenialProfileData = projectedState.projectedCounties.some(
    (county) =>
      county.medicareDenialRatePct !== null ||
      getCountyDenialDisplay(county.node.countyRecord).kind === 'zip-profile',
  );
  const inspectedNri = inspectedCounty
    ? nriByCountyFips.get(inspectedCounty.countyFips) ?? null
    : null;
  const nriRatingColors: Record<string, string> = {
    'Very Low': '#D1FAE5',
    'Relatively Low': '#A7F3D0',
    'Relatively Moderate': '#FDE68A',
    'Relatively High': '#FDBA74',
    'Very High': '#FCA5A5',
  };
  const nriColorFor = (fips: string) => {
    const rating = nriByCountyFips.get(fips)?.riskRating;
    return rating ? nriRatingColors[rating] ?? '#E2E8F0' : '#E2E8F0';
  };

  if (!stateNode) return null;

  return (
    <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-5 space-y-4">
      {/* Top Bar: Boundary Source & Hierarchy Summary */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#1E3A8A]">
            <Compass className="w-4 h-4 text-[#1E3A8A]" />
            <a
              href="https://tigerweb.geo.census.gov/tigerwebmain/TIGERweb_main.html"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[#1E3A8A] hover:underline"
            >
              U.S. Census TIGERweb county boundaries
              <ExternalLink className="h-3 w-3" />
            </a>
            <span className="text-slate-300" aria-hidden="true">·</span>
            <span className="font-mono text-slate-600 tabular-nums">State FIPS {stateNode.stateFips}</span>
          </div>
          <h3 className="text-base font-bold text-[#0F172A] mt-0.5">
            {activeCountyNode
              ? `${activeCountyNode.countyName} (${stateNode.stateName}) — Real-World Boundary & Mapped Cities`
              : `${stateNode.stateName} (${stateNode.stateCode}) — ${stateNode.countiesList.length} Census county boundaries & ${stateNode.totalCitiesCount} city/place reference labels`}
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs font-mono tabular-nums text-slate-600">
          <div>
            <span className="font-sans text-slate-400 mr-1">Land Area:</span>
            <strong className="text-[#0F172A]">
              {(activeCountyNode ? activeCountyNode.landAreaSqMiles : stateNode.totalLandAreaSqMiles).toLocaleString()} sq mi
            </strong>
          </div>
          <span className="text-slate-300" aria-hidden="true">·</span>
          <div>
            <span className="font-sans text-slate-400 mr-1">Bounding Box:</span>
            <strong className="text-[#0F172A]">
              {activeCountyNode
                ? `[${activeCountyNode.bbox[1].toFixed(2)}°N, ${activeCountyNode.bbox[0].toFixed(2)}°W]`
                : `[${stateNode.bbox[1].toFixed(2)}°N, ${stateNode.bbox[0].toFixed(2)}°W]`}
            </strong>
          </div>
          <span className="text-slate-300" aria-hidden="true">·</span>
          <div className="flex items-center gap-1 text-emerald-700 font-sans font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Census TIGER FIPS/GEOID join</span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Layers className="h-4 w-4 shrink-0 text-[#1E3A8A]" />
          <label htmlFor="county-map-layer" className="text-xs font-semibold text-slate-700">
            County map layer
          </label>
          <select
            id="county-map-layer"
            value={countyMapLayer}
            onChange={(event) => setCountyMapLayer(event.target.value as 'denial' | 'nri-risk')}
            className="h-8 rounded-md border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-800"
          >
            <option value="denial">Medicare denial profiles</option>
            <option value="nri-risk">FEMA National Risk Index</option>
          </select>
        </div>
        {countyMapLayer === 'nri-risk' && (
          <div className="text-[11px] text-slate-600" role="status">
            {nriQuery.isLoading
              ? `Loading FEMA county records for ${stateNode.stateCode}…`
              : nriQuery.isError
                ? 'FEMA county risk layer could not be loaded.'
                : `${nriByCountyFips.size} county records · ${nriQuery.data?.sourceVersion ?? 'version not stated'} · `}
            {!nriQuery.isLoading && !nriQuery.isError && nriQuery.data?.sourceUrl && (
              <a
                href={nriQuery.data.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-blue-700 hover:underline"
              >
                FEMA source
              </a>
            )}
          </div>
        )}
      </div>

      {/* Mode A: Statewide County Boundary Choropleth + Hierarchy Inspector */}
      {!activeCountyNode && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          {/* Left 7 Cols: Interactive SVG County Boundary Map */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between min-h-[380px]">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
              <span>Click any county boundary polygon to drill down into its cities &amp; EMS/Fire providers</span>
              <span className="font-mono tabular-nums text-[11px] text-slate-400">
                {projectedState.projectedCounties.length} / {stateNode.countiesList.length} Polygons Loaded
              </span>
            </div>

            {isLoadingBoundaries && projectedState.projectedCounties.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-xs text-slate-500 font-mono">
                Loading U.S. Census TIGER/Line county boundary polygons for {stateNode.stateName}...
              </div>
            ) : (
              <div className="relative w-full overflow-hidden flex items-center justify-center">
                <svg
                  viewBox="0 0 720 400"
                  className="w-full h-auto max-h-[360px] select-none"
                  role="img"
                  aria-label={`${stateNode.stateName} County Boundaries Map`}
                >
                  <g>
                    {projectedState.projectedCounties.map((pc) => {
                      const isHovered = hoveredCountyFips === pc.countyFips;
                      const denialDisplay = getCountyDenialDisplay(pc.node.countyRecord);
                      const denialRate =
                        denialDisplay.kind === 'unavailable' ? null : denialDisplay.ratePct;
                      const hasDenialValue = denialDisplay.kind !== 'unavailable';
                      const fillColor = countyMapLayer === 'nri-risk'
                        ? nriColorFor(pc.countyFips)
                        : isHovered
                          ? '#1E3A8A'
                          : hasDenialValue
                            ? '#DBEAFE'
                            : '#F1F5F9';
                      const strokeColor = isHovered ? '#0F172A' : '#94A3B8';

                      return (
                        <path
                          key={pc.countyFips}
                          d={pc.svgPath}
                          fill={fillColor}
                          stroke={strokeColor}
                          strokeWidth={isHovered ? 1.8 : 0.85}
                          className="cursor-pointer transition-colors duration-150"
                          onMouseEnter={() => setHoveredCountyFips(pc.countyFips)}
                          onClick={() => onSelectCounty(pc.countyName, stateNode.stateCode)}
                        >
                          <title>
                             {`${pc.countyName} (FIPS ${pc.countyFips}) · Seat: ${pc.countySeat} · ${pc.citiesCount} Cities · ${pc.landAreaSqMiles} sq mi · ${countyMapLayer === 'nri-risk' ? `FEMA NRI ${nriByCountyFips.get(pc.countyFips)?.riskRating ?? 'no county record'} · risk score ${nriByCountyFips.get(pc.countyFips)?.riskScore?.toFixed(2) ?? 'not stated'} · expected annual loss ${nriByCountyFips.get(pc.countyFips)?.expectedAnnualLoss == null ? 'not stated' : `$${nriByCountyFips.get(pc.countyFips)!.expectedAnnualLoss!.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} · ${nriByCountyFips.get(pc.countyFips)?.sourceVersion ?? 'version not stated'} · ${nriByCountyFips.get(pc.countyFips)?.sourceUrl ?? 'no source record'}` : denialDisplay.kind === 'county-claims-rate' ? `County Medicare ambulance claim denial rate: ${denialRate!.toFixed(1)}% · denied ${denialDisplay.deniedClaimCount} / adjudicated ${denialDisplay.adjudicatedClaimCount} · FIPS ${denialDisplay.countyFips} · ${denialDisplay.claimScope} · ${denialDisplay.reportingPeriod} · ${denialDisplay.source}${denialDisplay.sourceType === 'local-import' ? ' · local import; verify the report directly' : ''}` : denialDisplay.kind === 'zip-profile' ? `ZIP ${denialDisplay.zipCode} profile: ${denialRate!.toFixed(1)}% · ${denialDisplay.claimScope} · ${denialDisplay.reportingPeriod} · ${denialDisplay.sourceUrl}; not a county claims rate` : 'No county claims rate or source-backed ZIP profile'}`}
                          </title>
                        </path>
                      );
                    })}
                  </g>
                </svg>
              </div>
            )}

            <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
              <div className="flex flex-wrap items-center gap-3">
                {countyMapLayer === 'nri-risk' ? (
                  <>
                    {Object.entries(nriRatingColors).map(([rating, color]) => (
                      <span key={rating} className="flex items-center gap-1.5">
                        <span className="inline-block h-2.5 w-2.5 rounded-xs border border-slate-400" style={{ backgroundColor: color }} />
                        <span>{rating}</span>
                      </span>
                    ))}
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-2.5 w-2.5 rounded-xs border border-slate-400 bg-slate-200" />
                      <span>No county NRI record</span>
                    </span>
                  </>
                ) : (
                  <>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-xs bg-[#F1F5F9] border border-slate-400 inline-block" />
                      <span>No rate profile</span>
                    </span>
                    {hasDenialProfileData ? (
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-xs bg-[#DBEAFE] border border-slate-400 inline-block" />
                        <span>Rate profile available</span>
                      </span>
                    ) : (
                      <span>No mapped rate profiles in this state</span>
                    )}
                  </>
                )}
              </div>
              <span className="font-mono">NAD83 / WGS84 Projection</span>
            </div>
          </div>

          {/* Right 5 Cols: Real-Time County Boundary & City Hierarchy Node Inspector */}
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between">
            {inspectedCounty ? (
              <div className="space-y-4">
                <div className="border-b border-slate-100 pb-3">
                  <div className="flex items-center justify-between text-xs text-slate-500 font-mono tabular-nums">
                    <span>GEOID / FIPS {inspectedCounty.countyFips}</span>
                    <span>{inspectedCounty.landAreaSqMiles.toLocaleString()} sq mi</span>
                  </div>
                  <h4 className="text-lg font-bold text-[#0F172A] mt-0.5">
                    {inspectedCounty.countyName}, {stateNode.stateName}
                  </h4>
                  <div className="text-xs text-slate-600 mt-0.5">
                    County Seat: <strong className="text-[#0F172A]">{inspectedCounty.countySeat}</strong>
                    <span className="mx-1.5 text-slate-300" aria-hidden="true">·</span>
                    Centroid: <span className="font-mono tabular-nums">{inspectedCounty.node.centroid.lat.toFixed(4)}°N, {inspectedCounty.node.centroid.lng.toFixed(4)}°W</span>
                  </div>
                </div>

                {/* Boundary & Clinical KPIs */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono tabular-nums">
                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/70">
                    <span className="text-[11px] font-sans text-slate-500 block">App population reference</span>
                    <span className="text-sm font-bold text-[#0F172A] mt-0.5 block">
                      {inspectedCounty.population.toLocaleString()}
                    </span>
                    <span className="mt-0.5 block font-sans text-[9px] text-slate-500">
                      Source/vintage not attached
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/70">
                    <span className="text-[11px] font-sans text-slate-500 block">
                      {inspectedCountyDenialDisplay?.kind === 'county-claims-rate'
                        ? 'Medicare ambulance claim denial rate'
                        : inspectedCountyDenialDisplay?.kind === 'zip-profile'
                          ? 'ZIP-profile rate'
                          : 'County ambulance denial rate'}
                    </span>
                    <span className="text-sm font-bold text-rose-700 mt-0.5 block">
                      {inspectedCountyDenialDisplay && inspectedCountyDenialDisplay.kind !== 'unavailable'
                        ? `${inspectedCountyDenialDisplay.ratePct.toFixed(1)}%`
                        : 'Not published'}
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
                        {inspectedCountyDenialDisplay?.adjudicatedClaimCount} · {inspectedCountyDenialDisplay?.claimScope} ·{' '}
                        {inspectedCountyDenialDisplay?.reportingPeriod} ·{' '}
                        <a
                          href={inspectedCountyDenialDisplay?.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-700 hover:underline"
                        >
                          {inspectedCountyDenialDisplay?.source}
                        </a>
                      </span>
                    )}
                  </div>
                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/70">
                    <span className="text-[11px] font-sans text-slate-500 block">Avg Transport</span>
                    <span className="text-sm font-bold text-[#1E3A8A] mt-0.5 block">
                      {inspectedCounty.averageTransportMinutes} min
                    </span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200/70">
                    <span className="text-[11px] font-sans text-slate-600 block">FEMA county risk rating</span>
                    <span className="text-sm font-bold text-slate-900 mt-0.5 block">
                      {inspectedNri?.riskRating ?? 'No NRI record'}
                    </span>
                    <span className="text-[10px] font-sans text-slate-600 mt-0.5 block">
                      {inspectedNri?.riskScore != null ? `Score ${inspectedNri.riskScore.toFixed(2)} · ${inspectedNri.sourceVersion}` : 'No value reported for this county'}
                    </span>
                    {inspectedNri?.sourceUrl && (
                      <a
                        href={inspectedNri.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-0.5 inline-block text-[10px] font-sans text-blue-700 hover:underline"
                      >
                        Open FEMA county record
                      </a>
                    )}
                  </div>
                </div>
                {inspectedNri && (
                  <p className="text-[10px] leading-relaxed text-slate-500">
                    FEMA National Risk Index county context · population {inspectedNri.population?.toLocaleString() ?? 'not stated'} · expected annual loss ${inspectedNri.expectedAnnualLoss?.toLocaleString(undefined, { maximumFractionDigits: 0 }) ?? 'not stated'} · social vulnerability {inspectedNri.socialVulnerabilityRating ?? 'not stated'} · community resilience {inspectedNri.communityResilienceRating ?? 'not stated'} · {inspectedNri.sourceVersion}. These county-level measures are context only; they are not values for the city or an individual agency.
                  </p>
                )}

                {/* Mapped Real-World Cities in this County Node */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#0F172A]">
                      City/place reference labels ({inspectedCounty.node.citiesList.length})
                    </span>
                    <span className="font-mono text-[11px] text-slate-500">
                      ZIPs: {inspectedCounty.node.primaryZipCodes.slice(0, 4).join(', ')}
                    </span>
                  </div>

                  <div className="max-h-44 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                    {inspectedCounty.node.citiesList.map((cityNode) => (
                      <div
                        key={`${inspectedCounty.countyFips}-${cityNode.cityName}`}
                        onClick={() => onSelectCity(cityNode.cityName, inspectedCounty.countyName, stateNode.stateCode)}
                        className="px-3 py-2 hover:bg-slate-50 flex items-center justify-between gap-2 text-xs cursor-pointer transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Building2 className="w-3.5 h-3.5 text-[#1E3A8A] shrink-0" />
                          <span className="font-semibold text-[#0F172A] truncate">{cityNode.cityName}</span>
                          {cityNode.isCountySeat && (
                            <span className="text-[10px] text-[#1E3A8A] font-medium shrink-0">(County Seat)</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 font-mono text-[11px] text-slate-500 tabular-nums shrink-0">
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
              <div className="pt-4 border-t border-slate-100 flex items-center justify-between gap-2 mt-4">
                <a
                  href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(`${inspectedCounty.countyName}, ${stateNode.stateName}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#1E3A8A] hover:underline"
                >
                  <span>Verify Boundary on Maps</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>

                <button
                  type="button"
                  onClick={() => onSelectCounty(inspectedCounty.countyName, stateNode.stateCode)}
                  className="px-4 py-2 rounded-lg bg-[#0F172A] hover:bg-[#1E3A8A] text-white text-xs font-semibold transition-colors cursor-pointer"
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
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          {/* Left 6 Cols: High-Detail Single County Boundary SVG with Plotted City Pins */}
          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between min-h-[340px]">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
              <span>
                FIPS <strong className="font-mono text-[#0F172A]">{activeCountyNode.countyFips}</strong> Boundary Polygon &amp; Plotted Municipalities
              </span>
              <span className="font-mono tabular-nums text-[11px]">
                Centroid {activeCountyNode.centroid.lat.toFixed(4)}°N, {activeCountyNode.centroid.lng.toFixed(4)}°W
              </span>
            </div>

            <div className="relative w-full flex items-center justify-center">
              <svg
                viewBox="0 0 520 340"
                className="w-full h-auto max-h-[300px] select-none"
                role="img"
                aria-label={`${activeCountyNode.countyName} Boundary Polygon and Cities`}
              >
                {projectedSingleCounty.svgPath && (
                  <path
                    d={projectedSingleCounty.svgPath}
                    fill="#EFF6FF"
                    stroke="#1E3A8A"
                    strokeWidth={2.2}
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
                        r={isSelected || isHovered ? 7 : pin.isCountySeat ? 5.5 : 4.5}
                        fill={isSelected ? '#DC2626' : pin.isCountySeat ? '#1E3A8A' : '#0F172A'}
                        stroke="#FFFFFF"
                        strokeWidth={1.8}
                      />
                      <text
                        x={pin.svgX + 8}
                        y={pin.svgY + 4}
                        className="text-[11px] font-sans font-semibold fill-[#0F172A]"
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

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#1E3A8A] inline-block" />
                  <span>County Seat ({activeCountyNode.countySeat})</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#0F172A] inline-block" />
                  <span>Incorporated City / Town</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-600 inline-block" />
                  <span>Active Selected City</span>
                </span>
              </div>
              <span className="font-mono tabular-nums">{activeCountyNode.landAreaSqMiles} sq mi</span>
            </div>
          </div>

          {/* Right 6 Cols: Hierarchical State -> County -> City -> Provider Mapping Table */}
          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <div>
                  <div className="text-xs font-semibold text-[#1E3A8A]">
                    State ({stateNode.stateCode}) › {activeCountyNode.countyName} (FIPS {activeCountyNode.countyFips})
                  </div>
                  <h4 className="text-sm font-bold text-[#0F172A]">
                    Connected Municipal Cities &amp; Postal Jurisdictions ({projectedSingleCounty.cityPins.length})
                  </h4>
                </div>
                {selectedCityName !== 'all' && (
                  <button
                    type="button"
                    onClick={() => onSelectCity(selectedCityName, activeCountyNode.countyName, stateNode.stateCode)}
                    className="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 cursor-pointer"
                  >
                    Show All County Cities
                  </button>
                )}
              </div>

              <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg">
                {projectedSingleCounty.cityPins.map((pin) => {
                  const isSelected = selectedCityName.toLowerCase() === pin.cityName.toLowerCase();
                  return (
                    <div
                      key={pin.cityName}
                      onClick={() => onSelectCity(pin.cityName, activeCountyNode.countyName, stateNode.stateCode)}
                      className={`px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs cursor-pointer transition-colors ${
                        isSelected ? 'bg-[#1E3A8A]/10 font-semibold' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-[#0F172A] font-semibold">
                          <MapPin className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-rose-600' : 'text-[#1E3A8A]'}`} />
                          <span className="truncate">{pin.cityName}</span>
                          {pin.isCountySeat && (
                            <span className="text-[10px] font-normal text-slate-500">(County Seat)</span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">
                          ZIP {pin.zipCode} · {pin.latitude.toFixed(4)}°N, {pin.longitude.toFixed(4)}°W
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="font-mono text-xs font-semibold text-[#0F172A] tabular-nums">
                          {pin.providersCount} Providers
                        </span>
                        <span className="text-[#1E3A8A] font-semibold">&rarr;</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 mt-3">
              <span>
                ZIP reference values: <strong className="font-mono text-slate-700">{activeCountyNode.primaryZipCodes.join(', ')}</strong>
              </span>
              <a
                href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(`${activeCountyNode.countyName}, ${stateNode.stateName}`)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-[#1E3A8A] hover:underline"
              >
                <span>Open County on OpenStreetMap</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
