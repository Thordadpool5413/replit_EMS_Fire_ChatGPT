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
import { Compass, Layers, MapPin, Building2, ExternalLink } from 'lucide-react';

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
  const [boundaryRetry, setBoundaryRetry] = useState<number>(0);
  const [boundaryError, setBoundaryError] = useState<string | null>(null);
  const [hoveredCountyFips, setHoveredCountyFips] = useState<string | null>(null);

  const hierarchy = useMemo(() => countyBoundaryHierarchy.getHierarchy(agencies), [agencies]);
  const stateNode: StateHierarchyNode | null = useMemo(() => {
    if (!stateCode || stateCode === 'all') return null;
    return hierarchy.statesByCode[stateCode.toUpperCase()] || null;
  }, [hierarchy, stateCode]);

  useEffect(() => {
    if (!stateCode || stateCode === 'all') return;
    let cancelled = false;
    setIsLoadingBoundaries(true);
    setBoundaryError(null);

    countyBoundaryHierarchy
      .fetchStateCountyBoundaries(stateCode)
      .then(() => {
        if (!cancelled) {
          setBoundaryVersion((v) => v + 1);
          setIsLoadingBoundaries(false);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setIsLoadingBoundaries(false);
          setBoundaryError(error instanceof Error ? error.message : 'County boundaries could not be loaded.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [stateCode, boundaryRetry]);

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

  if (!stateNode) return null;

  return (
    <div className="bg-slate-50/80 border border-slate-200 rounded-xl p-5 space-y-4">
      {/* Top Bar: Boundary Source & Hierarchy Summary */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 pb-3 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#1E3A8A]">
            <Compass className="w-4 h-4 text-[#1E3A8A]" />
            <span>{stateNode.boundarySourceInfo?.source || 'U.S. Census Bureau TIGERweb'}</span>
            <span className="text-slate-300" aria-hidden="true">·</span>
            <span className="font-mono text-slate-600 tabular-nums">State FIPS {stateNode.stateFips}</span>
          </div>
          <h3 className="text-base font-bold text-[#0F172A] mt-0.5">
            {activeCountyNode
              ? `${activeCountyNode.countyName} (${stateNode.stateName}) — ${stateNode.boundarySourceInfo?.vintage || '2020 Census'} boundary`
              : `${stateNode.stateName} (${stateNode.stateCode}) — ${stateNode.countiesList.length} County Equivalents`}
          </h3>
          {stateNode.boundarySourceInfo && (
            <div
              className={`mt-1 text-[11px] ${stateNode.boundarySourceInfo.isFallback ? 'text-amber-700' : 'text-slate-500'}`}
              role="status"
            >
              {stateNode.boundarySourceInfo.source} · {stateNode.boundarySourceInfo.vintage} · retrieved{' '}
              {new Date(stateNode.boundarySourceInfo.retrievedAt).toLocaleString()}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs font-mono tabular-nums text-slate-600">
          <div>
            <span className="font-sans text-slate-400 mr-1">
              {stateNode.boundarySourceInfo?.isFallback ? 'Bundled land area:' : 'Land area:'}
            </span>
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
        </div>
      </div>

      {/* Mode A: Statewide County Boundary Choropleth + Hierarchy Inspector */}
      {!activeCountyNode && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          {/* Left 7 Cols: Interactive SVG County Boundary Map */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between min-h-[380px]">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
              <span>Click a county polygon to inspect its boundary and available directory records</span>
              <span className="font-mono tabular-nums text-[11px] text-slate-400">
                {projectedState.projectedCounties.length} / {stateNode.countiesList.length} Polygons Loaded
              </span>
            </div>

            {boundaryError ? (
              <div role="alert" className="flex-1 flex flex-col items-center justify-center gap-3 text-center text-xs text-rose-700">
                <span>{boundaryError}. The county list remains available below.</span>
                <button
                  type="button"
                  onClick={() => setBoundaryRetry((value) => value + 1)}
                  className="rounded-md border border-rose-300 px-3 py-1.5 font-semibold hover:bg-rose-50"
                >
                  Retry Census boundary load
                </button>
              </div>
            ) : isLoadingBoundaries && projectedState.projectedCounties.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-xs text-slate-500 font-mono">
                Loading U.S. Census 2020 county boundaries for {stateNode.stateName}...
              </div>
            ) : projectedState.projectedCounties.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-xs text-slate-500">
                No boundary polygons were returned for this state.
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
                      const fillColor = isHovered
                        ? '#1E3A8A'
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
                            {`${pc.countyName} (FIPS ${pc.countyFips}) · ${pc.landAreaSqMiles} sq mi`}
                          </title>
                        </path>
                      );
                    })}
                  </g>
                </svg>
              </div>
            )}

            <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-[#F1F5F9] border border-slate-400 inline-block" />
                  <span>Standard County Boundary</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-[#F1F5F9] border border-slate-400 inline-block" />
                  <span>Operational metrics not supplied by boundary source</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-xs bg-[#1E3A8A] inline-block" />
                  <span>Active / Hovered County</span>
                </span>
              </div>
              <span className="font-mono">GeoJSON coordinates · WGS84 (EPSG:4326)</span>
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
                    {stateNode.boundarySourceInfo?.isFallback ? 'Bundled boundary point: ' : 'Census internal point: '}
                    <span className="font-mono tabular-nums">
                      {inspectedCounty.node.centroid.lat.toFixed(4)}, {inspectedCounty.node.centroid.lng.toFixed(4)}
                    </span>
                  </div>
                </div>

                <div className="rounded-lg bg-slate-50 border border-slate-200/70 p-3 text-xs text-slate-600">
                  Operational and population metrics are not provided by this boundary source and are not inferred here.
                </div>

                {/* Mapped Real-World Cities in this County Node */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#0F172A]">
                      Local place-name index ({inspectedCounty.node.citiesList.length})
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Names support navigation only. Source vintage, ZIP associations, and city coordinates are not verified in this view.
                  </p>

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
                  View source-backed profiles for {inspectedCounty.countyName}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mode B: Single County Census Boundary */}
      {activeCountyNode && projectedSingleCounty && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          {/* Left 6 Cols: Single County Census Boundary SVG */}
          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-4 flex flex-col justify-between min-h-[340px]">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-2">
              <span>
                FIPS <strong className="font-mono text-[#0F172A]">{activeCountyNode.countyFips}</strong> · {stateNode.boundarySourceInfo?.isFallback ? 'bundled boundary polygon' : 'Census boundary polygon'}
              </span>
              <span className="font-mono tabular-nums text-[11px]">
                {stateNode.boundarySourceInfo?.isFallback ? 'Boundary point' : 'Census internal point'}{' '}
                {activeCountyNode.centroid.lat.toFixed(4)}, {activeCountyNode.centroid.lng.toFixed(4)}
              </span>
            </div>

            <div className="relative w-full flex items-center justify-center">
              <svg
                viewBox="0 0 520 340"
                className="w-full h-auto max-h-[300px] select-none"
                role="img"
                aria-label={`${activeCountyNode.countyName} ${stateNode.boundarySourceInfo?.isFallback ? 'bundled' : '2020 Census'} boundary polygon`}
              >
                {projectedSingleCounty.svgPath && (
                  <path
                    d={projectedSingleCounty.svgPath}
                    fill="#EFF6FF"
                    stroke="#1E3A8A"
                    strokeWidth={2.2}
                  />
                )}

              </svg>
            </div>

            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
              <div className="flex items-center gap-3">
                  <span>Place coordinates are not plotted because the local index does not include source evidence.</span>
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
                    Local place-name index ({activeCountyNode.citiesList.length})
                  </h4>
                </div>
                {selectedCityName !== 'all' && (
                  <button
                    type="button"
                    onClick={() => onSelectCity(selectedCityName, activeCountyNode.countyName, stateNode.stateCode)}
                    className="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 cursor-pointer"
                  >
                    Show All Place Names
                  </button>
                )}
              </div>

              <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg">
                {activeCountyNode.citiesList.map((cityNode) => {
                  const isSelected = selectedCityName.toLowerCase() === cityNode.cityName.toLowerCase();
                  return (
                    <div
                      key={cityNode.cityName}
                      onClick={() => onSelectCity(cityNode.cityName, activeCountyNode.countyName, stateNode.stateCode)}
                      className={`px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs cursor-pointer transition-colors ${
                        isSelected ? 'bg-[#1E3A8A]/10 font-semibold' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-[#0F172A] font-semibold">
                          <MapPin className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-rose-600' : 'text-[#1E3A8A]'}`} />
                          <span className="truncate">{cityNode.cityName}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[#1E3A8A] font-semibold">&rarr;</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500 mt-3">
              <span>
                Local place names and ZIP references are not verified by the boundary source.
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
