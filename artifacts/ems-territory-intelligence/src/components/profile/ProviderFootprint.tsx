import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Building2, MapPin } from 'lucide-react';
import { loadNerisDepartment, nerisAddressText, nerisObjectUrl } from '../../services/nerisStationCatalog';
import type { PublicProviderProfile } from '../../services/publicProviderProfile';

type FootprintPoint = {
  id: string;
  label: string;
  kind: 'station' | 'headquarters' | 'recorded';
  latitude: number;
  longitude: number;
  address?: string;
  sourceUrl?: string;
  relationshipUncertain?: boolean;
};

const pointKind = { station: 'Reported station', headquarters: 'Reported headquarters', recorded: 'Recorded agency location' };

function plotPositions(points: FootprintPoint[]) {
  const { latitude, longitude } = points[0];
  const horizontalScale = Math.max(.05, Math.cos(latitude * Math.PI / 180));
  const positions = points.map(point => ({
    x: (((point.longitude - longitude + 540) % 360) - 180) * horizontalScale,
    y: latitude - point.latitude,
  }));
  const xs = positions.map(({ x }) => x);
  const ys = positions.map(({ y }) => y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX;
  const spanY = Math.max(...ys) - minY;
  const scale = 1 / Math.max(spanX, spanY * 2, .002);
  return positions.map(({ x, y }) => ({
    left: 50 + (x - minX - spanX / 2) * scale * 78,
    top: 50 + (y - minY - spanY / 2) * scale * 156,
  }));
}

export function ProviderFootprint({ profile }: { profile: PublicProviderProfile }) {
  const nativeId = profile.identity?.sourceName === 'NERIS' ? profile.identity.identifier : undefined;
  const [selectedId, setSelectedId] = useState<string>();
  const query = useQuery({
    queryKey: ['neris-provider-footprint', nativeId],
    queryFn: () => nativeId ? loadNerisDepartment(nativeId) : null,
    enabled: Boolean(nativeId),
    retry: false,
  });
  const department = query.data;
  const points: FootprintPoint[] = [];

  if (department?.coordinates) points.push({
    id: 'headquarters', label: department.name, kind: 'headquarters',
    latitude: department.coordinates[0], longitude: department.coordinates[1], address: nerisAddressText(department.address),
    sourceUrl: nerisObjectUrl(0, department.oid),
  });
  if (profile.coordinates) points.push({
    id: 'recorded', label: profile.name, kind: 'recorded', ...profile.coordinates, address: profile.address,
    sourceUrl: profile.addressSource?.url,
  });
  for (const station of department?.stations ?? []) {
    if (!station.coordinates) continue;
    points.push({
      id: station.id, label: station.name || station.id, kind: 'station',
      latitude: station.coordinates[0], longitude: station.coordinates[1], address: nerisAddressText(station.address),
      sourceUrl: nerisObjectUrl(1, station.oid), relationshipUncertain: station.parentNameConflict || station.sharedPoint,
    });
  }

  const selected = points.find(point => point.id === selectedId) ?? points[0];
  const plotted = points.length ? plotPositions(points) : [];
  const compactPoints = points.length <= 36;
  const reportedAddress = [profile.address, profile.city, profile.state].filter(Boolean).join(', ');
  return <section className="pr-panel pr-footprint" aria-label="Agency locations">
    <h2><MapPin size={21} aria-hidden="true" /> Agency locations</h2>
    {nativeId && query.isPending && <p className="pr-muted" role="status">Loading NERIS locations…</p>}
    {nativeId && query.isError && <p className="pr-muted" role="status">Station source unavailable. <button className="pr-source-link" type="button" onClick={() => void query.refetch()}>Retry</button></p>}
    {!nativeId && !selected && <>
      <p className="pr-muted">No mapped agency or station coordinates on file.</p>
      {profile.address && <>
        <p>{reportedAddress}</p>
        <a className="pr-source-link" href={'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(reportedAddress)}
          target="_blank" rel="noreferrer">Search reported address <ArrowUpRight size={13} aria-hidden="true" /></a>
      </>}
    </>}
    {nativeId && query.isSuccess && !selected && <p className="pr-muted">No headquarters or station coordinates reported in this source.</p>}
    {selected && <>
      <div className="pr-point-map" role="group" aria-label="Reported coordinate map">
        <span className="pr-map-north" aria-hidden="true">↑ N</span>
        {points.map((point, index) => {
          const { left, top } = plotted[index];
          if (!compactPoints && point.id !== selected.id) return <span key={point.id} className="pr-map-dot" style={{ left: left + '%', top: top + '%' }} aria-hidden="true" />;
          const Icon = point.kind === 'station' ? MapPin : Building2;
          return <button key={point.id} type="button" className="pr-map-marker" data-kind={point.kind}
            aria-pressed={point.id === selected.id} aria-label={pointKind[point.kind] + ': ' + point.label}
            style={{ left: left + '%', top: top + '%' }} onClick={() => setSelectedId(point.id)}>
            <Icon size={15} aria-hidden="true" />
          </button>;
        })}
      </div>
      <p className="pr-muted pr-map-caption">Relative position of source coordinates. Geographic context comes from the map link.</p>
      <div className="pr-point-detail" aria-live="polite">
        {points.length > 1 && <label>Choose a location
          <select aria-label="Choose a location" value={selected.id} onChange={event => setSelectedId(event.target.value)}>
            {points.map(point => <option key={point.id} value={point.id}>{pointKind[point.kind]} · {point.label}</option>)}
          </select>
        </label>}
        <p className="pr-point-kind">{pointKind[selected.kind]}</p>
        <h3>{selected.label}</h3>
        {selected.address && <p>{selected.address}</p>}
        {selected.relationshipUncertain && <p className="pr-muted">Shared coordinate or parent name discrepancy reported.</p>}
        {selected.kind === 'station' && <p className="pr-muted">Apparatus and equipment assignments are not reported in this station source.</p>}
        <div className="pr-map-links">
          <a className="pr-source-link" href={'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent([selected.latitude, selected.longitude].join(','))} target="_blank" rel="noreferrer">Open location in Maps <ArrowUpRight size={13} aria-hidden="true" /></a>
          {selected.sourceUrl && <a className="pr-source-link" href={selected.sourceUrl} target="_blank" rel="noreferrer">Original location source</a>}
        </div>
      </div>
    </>}
  </section>;
}
