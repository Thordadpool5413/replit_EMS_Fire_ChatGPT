import { useQuery } from '@tanstack/react-query';
import { ExternalLink, HeartPulse, Receipt } from 'lucide-react';

type Inventory = {
  sourceDate: string;
  byState: Record<string, number>;
  byCounty: Record<string, number>;
};
type Award = { id: string; recipient: string; description: string | null; startDate: string | null; awardAmount: number | null; county: string };
type Procurement = {
  throughDate: string;
  fromYear: number;
  byState: Record<string, { status: string; awards: Award[] }>;
};

async function loadSnapshot<T>(file: string, source: string, signal: AbortSignal): Promise<T> {
  const response = await fetch((import.meta.env.BASE_URL ?? '/') + 'data/' + file, { signal });
  if (!response.ok) throw Error('Public source snapshot unavailable.');
  const data = await response.json();
  if (data?.schemaVersion !== 1 || data?.source !== source) throw Error('Public source snapshot has an unexpected format.');
  return data;
}

const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export function RegionalAedSources({ state, county, nerisId, profile = false }: {
  state: string; county?: string; nerisId?: string; profile?: boolean;
}) {
  const headquarters = useQuery({
    queryKey: ['neris-headquarters-counties'],
    queryFn: ({ signal }) => loadSnapshot<{ byDepartment: Record<string, string> }>('neris-headquarters-counties.json', 'NERIS', signal),
    enabled: !county && Boolean(nerisId), staleTime: Infinity, retry: false,
  });
  const reportedCounty = county ?? (nerisId ? headquarters.data?.byDepartment[nerisId] : undefined);
  const inventory = useQuery({
    queryKey: ['national-public-aed-coverage'],
    queryFn: ({ signal }) => loadSnapshot<Inventory>('national-public-aed-coverage.json', 'OpenStreetMap', signal),
    staleTime: Infinity, retry: false,
  });
  const procurement = useQuery({
    queryKey: ['national-aed-procurement'],
    queryFn: ({ signal }) => loadSnapshot<Procurement>('national-aed-procurement.json', 'USAspending', signal),
    staleTime: Infinity, retry: false,
  });
  const portals = useQuery({
    queryKey: ['state-procurement-portals'],
    queryFn: ({ signal }) => loadSnapshot<{ byState: Record<string, { name: string; url: string }[]> }>(
      'state-procurement-portals.json', 'GovSentry', signal),
    staleTime: Infinity, retry: false,
  });
  const count = reportedCounty ? inventory.data?.byCounty[reportedCounty] : inventory.data?.byState[state];
  const scanned = procurement.data?.byState[state];
  const awards = reportedCounty ? scanned?.awards.filter(row => row.county === reportedCounty) : scanned?.awards;
  const area = reportedCounty ? 'county' : 'state';

  return <div className={profile ? 'pr-panel' : 'cv-note'}>
    <details>
      <summary>{profile ? 'Public AED and award research near this provider' : 'Public AED and award research'}</summary>
      <p><HeartPulse size={16} aria-hidden="true" /> <strong>Mapped AED sites</strong>{' '}
        {count === undefined ? (inventory.isPending ? 'Loading' : 'Source or geography unavailable') :
          count > 0 ? count.toLocaleString() + ' mapped records in this ' + area : 'No mapped records in this snapshot for this ' + area}
        {inventory.data && ' · ' + inventory.data.sourceDate.slice(0, 10)}
      </p>
      {reportedCounty && profile && <p>Headquarters county FIPS {reportedCounty}{!county && ' · mapped from the NERIS headquarters geography'}.</p>}
      <p>Community-mapped AED locations. Coverage and public access vary. These counts describe geography only.</p>
      <a className={profile ? 'pr-source-link' : 'cv-link'} href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors · ODbL <ExternalLink size={12} aria-hidden="true" /></a>
      <p><Receipt size={16} aria-hidden="true" /> <strong>Federal defibrillator award search</strong>{' '}
        {awards ? awards.length + ' candidates · ' + procurement.data?.fromYear + ' to ' + procurement.data?.throughDate :
          procurement.isPending ? 'Loading' : 'Source or geography unavailable'}
      </p>
      <p>One federal search page per state by award recipient address. Awards may be unrelated to EMS and provide no evidence of a local agency purchase.</p>
      {awards && awards.length > 0 && <ul>
        {awards.slice(0, profile ? 3 : 8).map(award => <li key={award.id}>
          <a className={profile ? 'pr-source-link' : 'cv-link'} href={'https://www.usaspending.gov/award/' + encodeURIComponent(award.id)} target="_blank" rel="noreferrer">{award.recipient}</a>
          {award.startDate && ' · ' + award.startDate}
          {award.awardAmount !== null && ' · ' + dollars.format(award.awardAmount)}
          {award.description && <span> · {award.description.slice(0, 160)}</span>}
        </li>)}
      </ul>}
      <a className={profile ? 'pr-source-link' : 'cv-link'} href="https://www.usaspending.gov/search" target="_blank" rel="noreferrer">Search all USAspending awards <ExternalLink size={12} aria-hidden="true" /></a>
      {portals.data?.byState[state]?.length ? <>
        <p><strong>State and local purchasing portals</strong></p>
        <ul>{portals.data.byState[state].map(portal => <li key={portal.url}>
          <a className={profile ? 'pr-source-link' : 'cv-link'} href={portal.url} target="_blank" rel="noreferrer">{portal.name} <ExternalLink size={12} aria-hidden="true" /></a>
        </li>)}</ul>
        <p>Portal links by <a href="https://govsentry.ai/developers" target="_blank" rel="noreferrer">GovSentry</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a></p>
      </> : null}
    </details>
  </div>;
}
