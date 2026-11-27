import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@workspace/replit-auth-web';
import { CalendarClock, ClipboardList, Truck } from 'lucide-react';
import type { Agency } from '../../types';
import { facilityParents } from '../../services/departmentFacilities';
import { providerIdentityReady } from '../../services/providerCompetitiveProfile';
import type { LifecycleSample } from '../../services/lifecycleTimeline';
import { acceptedLifecycleSample } from '../../services/replacementResearch';

export function StationEquipmentSummary({ agency, directory }: { agency: Agency; directory: Agency[] }) {
  const { user } = useAuth();
  const parent = facilityParents(agency).find(item => item.source === 'NERIS');
  const ready = Boolean(user && parent && providerIdentityReady(agency, directory));
  const evidence = useQuery({
    queryKey: ['private-station-equipment-summary', user?.id, agency.id, parent?.identifier],
    enabled: ready,
    gcTime: 0,
    staleTime: 0,
    retry: false,
    queryFn: async ({ signal }) => {
      const started = Date.now();
      const url = '/api/agencies/' + encodeURIComponent(agency.id) + '/facilities/' + encodeURIComponent(parent!.identifier) + '/equipment-conversion';
      const response = await fetch(url, { credentials: 'include', cache: 'no-store', signal });
      if (!response.ok) throw Error('Station equipment evidence unavailable.');
      const sample = acceptedLifecycleSample(agency, directory, await response.json() as LifecycleSample, started);
      if (!sample) throw Error('Station equipment evidence is incomplete or belongs to another department.');
      return sample;
    },
  });
  if (!ready) return null;
  const sample = evidence.data;
  const stationNames = new Map(sample?.stations.map(station => [station.id, station.name ?? station.id]));
  const observations = [...(sample?.observations ?? [])].sort((a,b) => b.observedOn.localeCompare(a.observedOn));
  return <section className="pr-panel">
    <h2 className="pr-icon-heading"><ClipboardList size={20} aria-hidden="true" /> Reviewed equipment by station</h2>
    <p className="pr-muted">Dated observations from the signed-in workspace. Multiple observations can refer to the same unit.</p>
    {evidence.isPending && <p role="status">Loading station equipment…</p>}
    {evidence.isError && <p>Station equipment is unavailable. <button className="pr-source-link" onClick={() => void evidence.refetch()}>Retry</button></p>}
    {sample && observations.length === 0 && <p>No independently reviewed observations were returned for this department.</p>}
    {observations.length > 0 && <><p>{observations.length} observations across {new Set(observations.map(row => row.stationId)).size} stations.</p>
      <ul className="pr-source-grid">{Array.from(new Set(observations.map(row => row.stationId))).map(stationId => <li className="pr-source-tile" key={stationId}>
        <h3>{stationNames.get(stationId) ?? stationId}</h3>
        {observations.filter(row => row.stationId === stationId).map(row => <article key={row.submissionId}>
        <span className="pr-evidence-status"><Truck size={14} aria-hidden="true" />{row.apparatus ?? "Station equipment"}</span>
        <h3>{row.maker === 'unknown' ? 'Manufacturer unlisted' : row.maker.toUpperCase()}{row.model && ' · ' + row.model}</h3>
        <p>{row.family}{row.apparatus && ' · ' + row.apparatus}</p>
        <p className="pr-icon-heading"><CalendarClock size={14} aria-hidden="true" />Observed {row.observedOn}</p>
        {row.acquiredOn && <p>Acquired · {row.acquiredOn}</p>}
        {row.warrantyEnd && <p>Warranty end · {row.warrantyEnd}</p>}
        {row.serviceEnd && <p>Service end · {row.serviceEnd}</p>}
        {row.sourceUrl && <a className="pr-source-link" href={row.sourceUrl} target="_blank" rel="noreferrer">Equipment source</a>}
      </article>)}</li>)}</ul>

    </>}
  </section>;
}
