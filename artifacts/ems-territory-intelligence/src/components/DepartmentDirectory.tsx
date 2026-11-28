import { loadCountyPracticeLocations } from '../services/countyPracticeLocations';
import { providerProfileHref } from '../navigation/providerProfileUrl';
import {coverageLabels,loadDepartmentCoverage,type Coverage} from '../services/departmentCoverage';
import { workspaceFactsFor } from '../services/matchedWorkspaceFacts';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Ambulance,
  Building2,
  ChevronLeft,
  ChevronRight,
  Flame,
  Layers3,
  Search,
  Warehouse,
} from 'lucide-react';
import { useNationalSourceDirectory } from '../hooks/useNationalSourceDirectory';
import { filterProviders, loadProviderCatalog, type DirectoryProvider } from '../services/providerCatalog';
import { loadPublicProviderProfile } from '../services/publicProviderProfile';
import { withholdReviewedRegistryCounty } from '../services/registryAccountLink';
import type { PublicSearchScope } from '../services/publicProviderSearch';
import type { Agency, AgencySourceRecordAssociation } from '../types';
import { ServiceBrief } from './profile/ServiceBrief';
import { RegistryAccountReview } from './RegistryAccountReview';
import { CountyNerisStationDirectory } from './CountyNerisStationDirectory';

type Actions = {
  agencies: Agency[];
  onOpen?: (a: Agency) => void;
  onCreate?: (a: Agency) => void | Promise<void>;
  onDecide?: (id: string, association: AgencySourceRecordAssociation) => void;
};

function RecordDetails({ row, ...actions }: { row: DirectoryProvider } & Actions) {
  const source = useQuery({
    queryKey: ['directory-source-details', row.ref],
    queryFn: () => loadPublicProviderProfile(row.ref).then((p) => p ?? null),
  });
  const profile = source.data;
  const id =
    profile?.identity && withholdReviewedRegistryCounty(profile.identity, !!profile.withholdGeography);
  return (
    <div className="dd-source" data-testid={profile ? 'public-provider-profile' : undefined}>
      {source.isPending && <p role="status">Loading source record…</p>}
      {source.isError && <button onClick={() => void source.refetch()}>Retry source record</button>}
      {profile && (
        <>
          <strong>{profile.source.name}</strong>
          <p>
            {profile.identifier} · {profile.source.date}
          </p>
          <p>{profile.address}</p>
          <small>End-user validation required</small>
          {id && <RegistryAccountReview showPublicProfile={false} identity={id} {...actions} />}
        </>
      )}
    </div>
  );
}

export function DepartmentResults({
  scope,
  states,
  ...actions
}: { scope: PublicSearchScope & { unassignedOnly?: boolean }; states: string[] } & Actions) {
  const stateKey = states.join(',');
  const query = useQuery({
    queryKey: ['department-results', stateKey],
    queryFn: async () => {
      const records: DirectoryProvider[] = [],
        failed: string[] = [];
      let next = 0;
      async function work() {
        while (next < states.length) {
          const code = states[next++];
          try {
            records.push(...(await loadProviderCatalog(code)));
          } catch {
            failed.push(code);
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(states.length, 4) }, work));
      return { records, failed };
    },
    staleTime: 300000,
  });
  const matches = useMemo(
    () =>
      filterProviders(query.data?.records ?? [], scope).sort(
        (a, b) =>
          a.name.localeCompare(b.name) ||
          a.ref.state.localeCompare(b.ref.state) ||
          a.ref.id.localeCompare(b.ref.id),
      ),
    [query.data, scope],
  );
  const [cursor, setCursor] = useState({ scope: '', page: 0 });
  const signature = [stateKey, scope.category, scope.city, scope.countyFips, scope.query, scope.zip, scope.unassignedOnly].join(
    '|',
  );
  const pages = Math.ceil(matches.length / 8),
    page = cursor.scope === signature ? Math.min(cursor.page, Math.max(0, pages - 1)) : 0;
  const [detail, setDetail] = useState('');
  if (query.isPending) return <p role="status">Loading department profiles…</p>;
  return (
    <>
      {(query.isError || !!query.data?.failed.length) && (
        <p role="alert">
          Department records unavailable for {query.data?.failed.join(', ') || stateKey}.{' '}
          <button className="workspace-button" onClick={() => void query.refetch()}>
            Retry
          </button>
        </p>
      )}
      <div className="dd-count" role="status" data-testid="public-provider-count">
        <Building2 size={16} />
        <strong>{matches.length.toLocaleString()}</strong>{' '}
        {matches.length === 1 ? 'department' : 'departments'}
        {query.data?.failed.length ? ' in loaded states' : ''}
      </div>
      {matches.length === 0 && !query.data?.failed.length && <p>No departments match this search.</p>}
      <ul className="dd-cards">
        {matches.slice(page * 8, page * 8 + 8).map((row) => {
          const key = [row.ref.state, row.ref.source, row.ref.id].join('/');
          const local =
            scope.countyFips &&
            row.otherPlaces?.find(
              (p) =>
                p.county === scope.countyFips &&
                (!scope.city || p.city.toLowerCase() === scope.city.toLowerCase()),
            );
          const where =
            local &&
            (row.county !== scope.countyFips ||
              (!!scope.city && row.city.toLowerCase() !== scope.city.toLowerCase()))
              ? local.basis + ' · ' + [local.city, row.ref.state].filter(Boolean).join(', ')
              : [row.city, row.ref.state].filter(Boolean).join(', ');
          return (
            <li key={key} data-testid="public-provider-result">
              <ServiceBrief
                workspaceFacts={workspaceFactsFor(row.ref, actions.agencies)}
                record={row.ref}
                name={row.name}
                category={row.kind}
                location={row.countyBasis && !local ? where + ' · ' + row.countyBasis : where}
                directoryRow={row}
              />
              <button
                className="dd-source-toggle"
                type="button"
                aria-expanded={detail === key}
                onClick={() => setDetail(detail === key ? '' : key)}
              >
                Registry details
              </button>
              {detail === key && <RecordDetails row={row} {...actions} />}
            </li>
          );
        })}
      </ul>
      {pages > 1 && (
        <nav className="dd-pages" aria-label="Department directory pages">
          <button disabled={!page} onClick={() => setCursor({ scope: signature, page: page - 1 })}>
            <ChevronLeft size={16} />
            Previous
          </button>
          <span>
            {page + 1} of {pages.toLocaleString()}
          </span>
          <button
            disabled={page + 1 >= pages}
            onClick={() => setCursor({ scope: signature, page: page + 1 })}
          >
            Next
            <ChevronRight size={16} />
          </button>
        </nav>
      )}
    </>
  );
}

function CoverageDetails({state,county}:{state:string;county:string}){
  const [open,setOpen]=useState(false);
  const edition=useQuery({queryKey:['department-coverage',state],enabled:open,staleTime:Infinity,queryFn:()=>loadDepartmentCoverage(state)});
  const counts=edition.data?.[county||state];
  return <details className="dd-archive" onToggle={e=>setOpen(e.currentTarget.open)}><summary>Department evidence coverage</summary>
    {open && (edition.isPending?<p>Loading coverage…</p>:edition.isError?<button onClick={()=>void edition.refetch()}>Retry coverage</button>:
    <><p>All departments with a recorded location or documented service agreement in this {county?'county':'state'}. Figures count profiles with a published record.</p><dl className="pr-metrics">{Object.entries(coverageLabels).map(([key,label])=><div key={key}><dt>{label}</dt><dd>{(counts?.[key as keyof Coverage]??0).toLocaleString()}</dd></div>)}</dl></>)}</details>;
}

function CountyPracticeAddresses({ state, county, city, search }: { state: string; county: string; city: string; search: string }) {
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ['county-nppes-practice', state],
    queryFn: () => loadCountyPracticeLocations(state),
    staleTime: Infinity,
    retry: false,
  });
  const rows = query.data?.[county] ?? [];
  if (query.isSuccess && !rows.length) return null;
  const terms = search.trim().toLowerCase().split(/\s+/);
  const matches = rows.filter((row) => {
    const text = [row.name, row.npi, row.address].join(' ').toLowerCase();
    return (!city || row.city.toLowerCase() === city.toLowerCase()) && terms.every((term) => text.includes(term));
  });
  return (
    <details className="dd-archive" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>Additional NPPES practice addresses{rows.length ? ' (' + rows.length + ')' : ''}</summary>
      {open && <>
        <p>CMS-reported addresses with an approximate Census county match. A practice address can belong to an organization based in another state.</p>
        {query.isPending && <p role="status">Loading practice addresses…</p>}
        {query.isError && <button type="button" onClick={() => void query.refetch()}>Retry practice addresses</button>}
        {query.isSuccess && !matches.length && <p>No practice addresses match the search.</p>}
        <ul>
          {matches.map((row) => <li key={row.key} className="pr-source-tile">
            <a className="pr-source-link" href={providerProfileHref(row.record) + '#stations'}>{row.name}</a>
            <p>{row.address}</p>
            <small>CMS NPPES · NPI {row.npi} · {row.reportingPeriod}{row.countyBasis ? ' · ' + row.countyBasis : ''}{row.record.state !== state ? ' · Parent profile in ' + row.record.state : ''}</small>
          </li>)}
        </ul>
      </>}
    </details>
  );
}

export function AreaDepartmentDirectory({
  state,
  county,
  city = '',
  category,
  ...actions
}: { state: string; county: string; city?: string; category: PublicSearchScope['category'] } & Actions) {
  const { manifest } = useNationalSourceDirectory();
  const [query, setQuery] = useState('');
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [selected, setSelected] = useState<PublicSearchScope['category'] | 'stations'>(category);
  const tabs = [
    { id: 'all', label: 'All departments', Icon: Layers3 },
    { id: 'ems', label: 'EMS', Icon: Ambulance },
    { id: 'fire', label: 'Fire', Icon: Flame },
    { id: 'stations', label: 'Stations', Icon: Warehouse },
  ] as const;
  const area = manifest?.countyNames[county] || manifest?.stateNames[state] || state;
  return (
    <section
      className="department-directory"
      id="territory-public-source-directory"
      aria-label="Department directory"
    >
      <header className="dd-head">
        <div>
          <p>
            {area} · {state}
          </p>
          <h2>Department directory</h2>
        </div>
        <label className="dd-search">
          <Search size={17} />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, city or ID"
            aria-label="Search departments"
          />
        </label>
      </header>
      <CoverageDetails state={state} county={county}/>
      {!county && <label className="dd-unassigned">
        <input type="checkbox" checked={unassignedOnly} onChange={(e) => setUnassignedOnly(e.target.checked)} />
        Show only departments awaiting a county
      </label>}
      <div className="dd-tabs" role="group" aria-label="Directory views">
        {tabs
          .filter((t) => (t.id === 'stations' ? !!county : category === 'all' || t.id === category))
          .map(({ id, label, Icon }) => (
            <button key={id} type="button" aria-pressed={selected === id} onClick={() => setSelected(id)}>
              <Icon size={16} />
              {label}
            </button>
          ))}
      </div>
      {county && (selected === 'all' || selected === 'ems') &&
        <CountyPracticeAddresses state={state} county={county} city={city} search={query} />}
      {selected === 'stations' ? (
        <CountyNerisStationDirectory
          stateCode={state}
          countyFips={county}
          countyName={area}
          city={city}
          externalQuery={query}
          scope={category}
          agencies={actions.agencies}
          onOpenSavedAgency={actions.onOpen}
          onDecideSourceRecord={actions.onDecide}
        />
      ) : (
        <DepartmentResults
          states={[state]}
          scope={{ state, countyFips: county, city, zip: '', category: selected, query, unassignedOnly }}
          {...actions}
        />
      )}
    </section>
  );
}
