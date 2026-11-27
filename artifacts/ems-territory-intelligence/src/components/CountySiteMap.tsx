import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  APIProvider,
  AdvancedMarker,
  Map as GoogleMap,
  Polygon,
  useMap,
  useApiLoadingStatus,
  APILoadingStatus,
} from '@vis.gl/react-google-maps';
import { useQuery } from '@tanstack/react-query';
import {
  Ambulance,
  ArrowUpRight,
  Building2,
  Compass,
  Flame,
  LocateFixed,
  MapPin,
  Minus,
  Plus,
  Star,
  Warehouse,
} from 'lucide-react';
import { providerProfileHref, type ProviderProfileRef } from '../navigation/providerProfileUrl';
import type { CountyBoundaryNode } from '../services/countyBoundaryHierarchyService';
import { countyViewport, mapWidth, mapHeight, worldPoint, type XY } from '../services/countyMapProjection';
import { departmentProfile } from '../services/departmentIdentity';
import { loadProviderCatalog } from '../services/providerCatalog';
import { filterNerisCountyStations, loadNerisMapState } from '../services/nerisStationMap';
import { nerisAddressText } from '../services/nerisStationCatalog';
import './CountySiteMap.css';

type Layer = 'Departments' | 'Stations' | 'Places';
type Pin = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  kind: 'ems' | 'fire' | 'combined' | 'station' | 'place' | 'seat';
  note?: string;
  address?: string;
  ref?: ProviderProfileRef;
};
const marks = {
  ems: Ambulance,
  fire: Flame,
  combined: Building2,
  station: Warehouse,
  place: MapPin,
  seat: Star,
};
const layerIcons = { Departments: Building2, Stations: Warehouse, Places: MapPin };
const colors = {
  ems: '#1962ac',
  fire: '#a64023',
  combined: '#096a68',
  station: '#795692',
  place: '#3e5875',
  seat: '#96610b',
};
const refKey = (ref: ProviderProfileRef) => ref.source + '/' + ref.id;

function GoogleBounds({ county, failed }: { county: CountyBoundaryNode; failed: () => void }) {
  const map = useMap(),
    status = useApiLoadingStatus();
  const bounds = county.bbox;
  useEffect(() => {
    if (status === APILoadingStatus.AUTH_FAILURE || status === APILoadingStatus.FAILED) failed();
    if (!map) return;
    const [west, south, east, north] = bounds;
    map.fitBounds({ west, east, south, north }, 32);
  }, [map, bounds, status, failed]);
  return null;
}

export function CountySiteMap({
  county,
  apiKey,
  scope,
  onCity,
  selectedCity,
}: {
  county: CountyBoundaryNode;
  apiKey: string;
  scope: 'all' | 'ems' | 'fire';
  onCity: (city: string) => void;
  selectedCity: string;
}) {
  const state = county.stateCode;
  const departments = useQuery({
    queryKey: ['county-map-catalog', state],
    queryFn: () => loadProviderCatalog(state),
    staleTime: Infinity,
  });
  const stations = useQuery({
    queryKey: ['county-map-stations', state],
    queryFn: () => loadNerisMapState(state),
    staleTime: Infinity,
  });
  const [layer, setLayer] = useState<Layer>('Departments');
  const [selected, setSelected] = useState(''),
    [googleFailed, setGoogleFailed] = useState(false);
  const [zoom, setZoom] = useState(1),
    [focus, setFocus] = useState<XY>();
  const [loadedTiles, setLoadedTiles] = useState<ReadonlySet<string>>(() => new Set());
  const [imagery, setImagery] = useState(true),
    [googleZoom, setGoogleZoom] = useState(8);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ x: number; y: number; center: XY; scale: number } | null>(null);
  const setGoogleFailure = useCallback(() => setGoogleFailed(true), []);
  const useGoogle = !!apiKey && !googleFailed && imagery;
  const { geometry, bbox, centroid } = county;
  const viewport = useMemo(
    () => countyViewport({ geometry, bbox, centroid }, zoom, focus),
    [geometry, bbox, centroid, zoom, focus],
  );
  const pins = useMemo(() => {
    const layers: Record<Layer, Pin[]> = { Departments: [], Stations: [], Places: [] };
    const catalog = departments.data ?? [];
    const kinds = new Map(catalog.map((p) => [refKey(p.ref), p.kind]));
    for (const row of catalog)
      if (
        row.point &&
        row.county === county.countyFips &&
        (scope === 'all' || row.kind === scope || row.kind === 'combined')
      ) {
        layers.Departments.push({
          id: refKey(row.ref),
          label: row.name,
          lat: row.point[0],
          lng: row.point[1],
          kind: row.kind,
          address: row.pointAddress || row.address,
          note: row.pointBasis,
          ref: row.ref,
        });
      }
    for (const station of stations.data
      ? filterNerisCountyStations(stations.data, county.countyFips)
      : []) {
      if (!station.coordinates) continue;
      const ref = departmentProfile({ source: 'neris', state, id: station.parentId });
      if (scope === 'fire' && kinds.get(refKey(ref)) === 'ems') continue;
      if (scope === 'ems' && !['combined', 'ems'].includes(kinds.get(refKey(ref)) ?? '')) continue;
      layers.Stations.push({
        id: station.id,
        label: (station.name || station.id) + ' · ' + station.parentName,
        kind: 'station',
        lat: station.coordinates[0],
        lng: station.coordinates[1],
        address: nerisAddressText(station.address),
        note:
          'NERIS reported station point' +
          (station.sharedPoint ? ' · Shared coordinates' : '') +
          (station.parentNameConflict ? ' · Parent name under review' : ''),
        ref: station.parentNameConflict ? undefined : ref,
      });
    }
    layers.Places = county.citiesList.map((p) => ({
      id: p.cityName,
      label: p.cityName,
      lat: p.latitude,
      lng: p.longitude,
      kind: p.isCountySeat ? 'seat' : 'place',
      note: p.isCountySeat ? 'County seat' : 'Place center',
    }));
    return layers;
  }, [county, scope, departments.data, state, stations.data]);
  const points = pins[layer],
    active = points.find(
      (p) => p.id === selected || (layer === 'Places' && !selected && p.id === selectedCity),
    );
  const groups = useMemo(() => {
    const grouped = new Map<string, Pin[]>();
    for (const pin of points) {
      const world = worldPoint(pin.lat, pin.lng, county.centroid.lng);
      const [x, y] = useGoogle ? world.map((v) => v * 256 * 2 ** googleZoom) : viewport.project(world);
      const cell = Math.floor(x / 24) + ',' + Math.floor(y / 24);
      const list = grouped.get(cell) ?? [];
      list.push(pin);
      grouped.set(cell, list);
    }
    return [...grouped.values()];
  }, [points, county, viewport, useGoogle, googleZoom]);
  const selectedGroup = active && groups.find((group) => group.some((p) => p.id === active.id));
  const choose = (pin: Pin) => {
    setSelected(pin.id);
    if (layer === 'Places') onCity(pin.id);
  };
  const change = (value: Layer) => {
    setLayer(value);
    setSelected('');
  };
  const selectFromList = (pin: Pin) => {
    choose(pin);
    if (!useGoogle && zoom > 1) setFocus(worldPoint(pin.lat, pin.lng, county.centroid.lng));
  };
  const showingTiles = imagery && viewport.tiles.some((tile) => loadedTiles.has(tile.id));
  const pinTypes = [...new Set(points.map((pin) => pin.kind))];
  const layerPending =
    layer === 'Departments' ? departments.isPending : layer === 'Stations' ? stations.isPending : false;
  const failed =
    layer === 'Departments' ? departments.isError : layer === 'Stations' ? stations.isError : false;
  return (
    <div className="cv-map-panel county-geo county-single-map-panel county-municipality-map-panel cm-field">
      <div className="cm-title">
        <Compass size={22} />
        <div>
          <strong>{county.countyName} satellite view</strong>
          <small>
            {county.landAreaSqMiles.toLocaleString()} sq mi · FIPS {county.countyFips}
          </small>
        </div>
      </div>
      <div className="cm-layers" role="group" aria-label="County map layers">
        {(Object.keys(layerIcons) as Layer[]).map((name) => {
          const Icon = layerIcons[name];
          return (
            <button key={name} aria-pressed={layer === name} onClick={() => change(name)}>
              <Icon size={15} />
              {name}
              <b>{pins[name].length}</b>
            </button>
          );
        })}
      </div>
      <div className="cm-canvas">
        {useGoogle ? (
          <APIProvider apiKey={apiKey} libraries={['marker']} onError={() => setGoogleFailed(true)}>
            <GoogleMap
              mapId="DEMO_MAP_ID"
              mapTypeId="satellite"
              defaultCenter={county.centroid}
              defaultZoom={8}
              disableDefaultUI
              zoomControl
              gestureHandling="cooperative"
              clickableIcons={false}
              onZoomChanged={(e) => setGoogleZoom(e.detail.zoom)}
            >
              <GoogleBounds county={county} failed={setGoogleFailure} />
              {(county.geometry?.type === 'Polygon'
                ? [county.geometry.coordinates as number[][][]]
                : ((county.geometry?.coordinates as number[][][][]) ?? [])
              ).map((polygon, i) => (
                <Polygon
                  key={i}
                  paths={polygon.map((r) => r.map(([lng, lat]) => ({ lat, lng })))}
                  strokeColor="#baeee2"
                  strokeWeight={3}
                  fillColor="#338084"
                  fillOpacity={0.09}
                  clickable={false}
                />
              ))}
              {groups.map((group) => {
                const p = group.find((pin) => active?.id === pin.id) ?? group[0],
                  Icon = marks[p.kind];
                return (
                  <AdvancedMarker
                    key={group[0].id}
                    position={{ lat: p.lat, lng: p.lng }}
                    title={group.length > 1 ? group.length + ' locations near ' + p.label : p.label}
                    onClick={() => choose(p)}
                  >
                    <span
                      className={'cm-pin' + (active?.id === p.id ? ' current' : '')}
                      style={{ background: colors[p.kind] }}
                    >
                      {group.length > 1 ? group.length : <Icon size={15} />}
                    </span>
                  </AdvancedMarker>
                );
              })}
            </GoogleMap>
          </APIProvider>
        ) : (
          <>
            <svg
              ref={svg}
              className="county-single-map-svg"
              viewBox={'0 0 ' + mapWidth + ' ' + mapHeight}
              role="group"
              aria-label={county.countyName + ' county map, ' + layer.toLowerCase()}
              onPointerDown={(e) => {
                if ((e.target as Element).closest('[role="button"]') || zoom === 1) return;
                drag.current = {
                  x: e.clientX,
                  y: e.clientY,
                  center: viewport.center,
                  scale: viewport.scale,
                };
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerUp={() => (drag.current = null)}
              onPointerCancel={() => (drag.current = null)}
              onPointerMove={(e) => {
                const d = drag.current,
                  ratio = svg.current?.getScreenCTM()?.a;
                if (d && ratio)
                  setFocus([
                    d.center[0] - (e.clientX - d.x) / ratio / d.scale,
                    d.center[1] - (e.clientY - d.y) / ratio / d.scale,
                  ]);
              }}
            >
              <defs>
                <pattern id="county-grid" width="32" height="32" patternUnits="userSpaceOnUse">
                  <path d="M32 0H0V32" fill="none" stroke="#719da4" strokeOpacity=".22" />
                </pattern>
              </defs>
              <rect width={mapWidth} height={mapHeight} fill="#1c383f" />
              {imagery &&
                viewport.tiles.map((t) => (
                  <image
                    key={t.id}
                    href={t.url}
                    x={t.x}
                    y={t.y}
                    width={t.size + 0.15}
                    height={t.size + 0.15}
                    opacity={loadedTiles.has(t.id) ? 1 : 0}
                    onLoad={() =>
                      setLoadedTiles((previous) =>
                        previous.has(t.id) ? previous : new Set([...previous, t.id]),
                      )
                    }
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                    aria-hidden="true"
                  />
                ))}
              {!showingTiles && <rect width={mapWidth} height={mapHeight} fill="url(#county-grid)" />}
              <path
                d={viewport.path}
                fill={showingTiles ? '#30777a' : '#34575b'}
                fillOpacity={showingTiles ? 0.12 : 0.72}
                fillRule="evenodd"
                stroke="#0b2b32"
                strokeWidth={4.3}
              />
              <path d={viewport.path} fill="none" stroke="#c7f2df" strokeWidth={2.2} />
              {groups.map((group) => {
                const p = group.find((pin) => pin.id === active?.id) ?? group[0];
                const [x, y] = viewport.project(worldPoint(p.lat, p.lng, county.centroid.lng));
                const Icon = marks[p.kind];
                const title =
                  group.length > 1 ? group.length + ' mapped locations near ' + p.label : p.label;
                return (
                  <g
                    key={group[0].id}
                    role="button"
                    tabIndex={0}
                    aria-label={title}
                    aria-pressed={active?.id === p.id}
                    onClick={() => choose(p)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        choose(p);
                      }
                    }}
                    transform={'translate(' + x + ',' + y + ')'}
                  >
                    <title>{title}</title>
                    <circle r="17" fill="transparent" />
                    <circle
                      r={active?.id === p.id ? 13 : 10.5}
                      fill={colors[p.kind]}
                      stroke={active?.id === p.id ? '#ffe180' : '#fff'}
                      strokeWidth="2.1"
                    />
                    {group.length > 1 ? (
                      <text y="4" textAnchor="middle" fill="white" fontSize="11" fontWeight="700">
                        {group.length}
                      </text>
                    ) : (
                      <Icon x="-6.5" y="-6.5" width="13" height="13" color="white" strokeWidth={2.4} />
                    )}
                  </g>
                );
              })}
            </svg>
            <div className="cm-north" aria-hidden="true">
              N<span>▲</span>
            </div>
            <div className="cm-zoom" aria-label="Map controls">
              <button aria-label="Zoom in" disabled={zoom >= 16} onClick={() => setZoom((v) => v * 2)}>
                <Plus size={16} />
              </button>
              <button
                aria-label="Zoom out"
                disabled={zoom <= 1}
                onClick={() => {
                  if (zoom === 2) setFocus(undefined);
                  setZoom((v) => v / 2);
                }}
              >
                <Minus size={16} />
              </button>
              <button
                aria-label="Fit county"
                onClick={() => {
                  setZoom(1);
                  setFocus(undefined);
                }}
              >
                <LocateFixed size={16} />
              </button>
            </div>
          </>
        )}
        <span className="cm-credit">
          {useGoogle
            ? 'Google Maps'
            : showingTiles
              ? 'USDA · USGS The National Map'
              : viewport.path
                ? 'Census county boundary'
                : 'County area'}
        </span>
      </div>
      <div className="cm-legend" aria-label="Marker legend">
        {pinTypes.map((type) => {
          const Icon = marks[type];
          return (
            <span key={type}>
              <i style={{ background: colors[type] }}>
                <Icon size={11} />
              </i>
              {
                {
                  ems: 'EMS',
                  fire: 'Fire',
                  combined: 'Fire & EMS',
                  station: 'Station',
                  place: 'Place',
                  seat: 'County seat',
                }[type]
              }
            </span>
          );
        })}
      </div>
      <div className="cm-inspect">
        <label>
          <span>
            {layer === 'Departments'
              ? 'Mapped departments'
              : layer === 'Stations'
                ? 'Reported station sites'
                : 'Places'}
          </span>
          <select
            value={active?.id ?? ''}
            onChange={(e) => {
              const p = points.find((pin) => pin.id === e.target.value);
              if (p) selectFromList(p);
            }}
          >
            <option value="">
              {layerPending
                ? 'Loading locations…'
                : failed
                  ? 'Locations unavailable'
                  : points.length
                    ? 'Select a location'
                    : 'No mapped locations in this layer'}
            </option>
            {points.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        <button className="cm-mode" aria-pressed={imagery} onClick={() => setImagery((v) => !v)}>
          {imagery ? 'Boundary view' : 'Show imagery'}
        </button>
        {failed && (
          <button onClick={() => void (layer === 'Stations' ? stations : departments).refetch()}>
            Retry locations
          </button>
        )}
      </div>
      {active && (
        <div className="cm-detail">
          {selectedGroup && selectedGroup.length > 1 && (
            <label className="cm-shared">
              Locations at this marker
              <select
                aria-label="Locations at this marker"
                value={active.id}
                onChange={(e) => {
                  const p = selectedGroup.find((p) => p.id === e.target.value);
                  if (p) choose(p);
                }}
              >
                {selectedGroup.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <strong>{active.label}</strong>
          <span>{[active.address, active.note].filter(Boolean).join(' · ')}</span>
          {active.ref && (
            <a href={providerProfileHref(active.ref)}>
              Open department profile <ArrowUpRight size={14} />
            </a>
          )}
        </div>
      )}
    </div>
  );
}
