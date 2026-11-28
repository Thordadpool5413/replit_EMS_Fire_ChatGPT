import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  Ambulance,
  ArrowRight,
  ArrowUpRight,
  BadgeDollarSign,
  Building2,
  CalendarClock,
  ClipboardList,
  Flame,
  HeartPulse,
  IdCard,
  Landmark,
  MapPin,
  Radio,
  Users,
  Warehouse,
} from 'lucide-react';
import { providerProfileHref, type ProviderProfileRef } from '../../navigation/providerProfileUrl';
import {
  departmentProfile,
  isCombinedDepartment,
  profileSourceKey,
} from '../../services/departmentIdentity';
import {
  type BriefFact,
  type FactKind,
  factSection,
  loadDepartmentBrief,
} from '../../services/departmentBrief';
import type { DirectoryProvider } from '../../services/providerCatalog';
import type { FloridaEmsLicense } from '../../services/floridaEmsRoster';

type Props = {
  workspaceFacts?: BriefFact[];
  record: ProviderProfileRef;
  name: string;
  location?: string;
  license?: FloridaEmsLicense;
  overview?: boolean;
  linkToPublicProfile?: boolean;
  serviceLevel?: string | null;
  reportedStations?: number | null;
  reportDate?: string | null;
  category?: DirectoryProvider['kind'];
  directoryRow?: DirectoryProvider;
};
const symbols = {
  equipment: HeartPulse,
  funding: Landmark,
  quality: HeartPulse,
  operations: Activity,
  stations: Warehouse,
  staff: Users,
  service: Radio,
  people: Users,
  claims: BadgeDollarSign,
  license: CalendarClock,
  identity: IdCard,
};
const priority: FactKind[] = [
  'equipment',
  'funding',
  'quality',
  'operations',
  'claims',
  'staff',
  'stations',
  'service',
  'people',
  'license',
  'identity',
];

function selectFacts(facts: BriefFact[]) {
  return priority.flatMap((kind) => facts.find((f) => f.kind === kind) ?? []);
}
export function useDepartmentBrief(record: ProviderProfileRef) {
  const ref = departmentProfile(record);
  return useQuery({
    queryKey: ['department-brief', ref.state, ref.source, ref.id],
    queryFn: () => loadDepartmentBrief(ref),
    staleTime: 15 * 60000,
  });
}

function StaffMix({ data }: { data: Awaited<ReturnType<typeof loadDepartmentBrief>> }) {
  if (!data.staffing.some((row) => row.value > 0)) return null;
  const total = data.staffing.reduce((sum, row) => sum + row.value, 0);
  return (
    <figure className="db-chart">
      <figcaption>
        <Users size={16} />
        Firefighter staffing
      </figcaption>
      <div className="db-staff-bar" aria-hidden="true">
        {data.staffing.map((row) => (
          <i
            key={row.label}
            className={'staff-' + row.label.split(' ')[0].toLowerCase()}
            style={{ flexBasis: (100 * row.value) / total + '%' }}
          />
        ))}
      </div>
      <dl>
        {data.staffing.map((row) => (
          <div key={row.label}>
            <dt>
              <i className={'staff-' + row.label.split(' ')[0].toLowerCase()} />
              {row.label.replace(' firefighters', '')}
            </dt>
            <dd>{row.value.toLocaleString()}</dd>
          </div>
        ))}
      </dl>
      <small>USFA registry · {data.ops?.retrievedAt}</small>
    </figure>
  );
}
function PaymentChart({ npi, years }: { npi: string; years: Record<string, [number, number]> }) {
  const rows = Object.entries(years).sort(([a], [b]) => a.localeCompare(b));
  if (!rows.length) return null;
  const peak = Math.max(1, ...rows.map(([, v]) => v[0]));
  return (
    <figure className="db-chart">
      <figcaption>
        <BadgeDollarSign size={16} />
        Medicaid &amp; CHIP claim lines
      </figcaption>
      <ol className="db-annual">
        {rows.map(([year, [lines]]) => (
          <li key={year}>
            <span>{lines.toLocaleString()}</span>
            <div>
              <i style={{ height: (lines / peak) * 100 + '%' }} />
            </div>
            <small>{year}</small>
          </li>
        ))}
      </ol>
      <small>HHS published ambulance billing · NPI {npi}</small>
    </figure>
  );
}
function FactTile({ fact, href }: { fact: BriefFact; href: string }) {
  const Icon = symbols[fact.kind];
  return (
    <a className="db-fact" href={href}>
      <span>
        <Icon size={15} />
        {fact.label}
      </span>
      <strong>{fact.value}</strong>
      <small>{fact.source}</small>
    </a>
  );
}

export function ServiceBrief({
  record,
  name,
  location,
  category,
  directoryRow,
  overview,
  workspaceFacts = [],
  linkToPublicProfile = false,
}: Props) {
  const ref = departmentProfile(record),
    key = profileSourceKey(ref),
    href = providerProfileHref(ref);
  const query = useDepartmentBrief(ref),
    data = query.data;
  if (linkToPublicProfile && !data?.records.length) return null;
  const kind =
    category ??
    (isCombinedDepartment(key) || data?.evidence?.combinedServices
      ? 'combined'
      : key.startsWith('FDID:') || key.startsWith('NERIS:')
        ? 'fire'
        : 'ems');
  const Mark = kind === 'ems' ? Ambulance : kind === 'fire' ? Flame : Building2;
  const label = kind === 'ems' ? 'EMS provider' : kind === 'combined' ? 'Fire & EMS' : 'Fire department';
  const facts = selectFacts([...(data?.facts ?? []), ...workspaceFacts]),
    lead = facts[0],
    Lead = lead ? symbols[lead.kind] : ClipboardList;
  const other = facts
    .slice(1)
    .filter((f) => f.kind !== 'identity')
    .slice(0, overview ? 5 : 2);
  const target = (fact: BriefFact) => (overview && !linkToPublicProfile ? '' : href) + '#' + factSection[fact.kind];
  const status = query.isPending ? (
    <p role="status" className="db-loading">
      Loading department records…
    </p>
  ) : query.isError || !!data?.unavailable.length ? (
    <p className="db-loading" role="status">
      Some sources are unavailable. <button onClick={() => void query.refetch()}>Retry</button>
    </p>
  ) : null;
  const story = lead && (
    <a className="db-lead" href={target(lead)}>
      <span className="db-lead-glyph">
        <Lead size={overview ? 26 : 21} />
      </span>
      <div>
        <span>{lead.label}</span>
        <strong>{lead.value}</strong>
        {lead.note && <p>{lead.note}</p>}
        <small>{lead.source}</small>
      </div>
      <ArrowUpRight size={16} className="db-signal-arrow" />
    </a>
  );
  return (
    <div className={'department-brief ' + (overview ? 'db-overview' : 'db-card')} data-kind={kind}>
      {overview ? (
        <header className="db-section-head">
          <Activity size={22} />
          <h2>Department at a glance</h2>
        </header>
      ) : (
        <a className="db-identity" href={href} aria-label={'Open provider profile for ' + name}>
          <span className="db-art-band" title={'Illustrative ' + label + ' artwork'}>
            <span className="db-emblem">
              <Mark size={19} aria-hidden="true" />
            </span>
            <span className="db-kind">{label}</span>
          </span>
          <div className="db-nameplate">
            <h3>{name}</h3>
            {location && (
              <small>
                <MapPin size={13} />
                {location}
              </small>
            )}
          </div>
        </a>
      )}
      {status}
      {lead && (
        <div className="db-band">
          {story}
          {other.length > 0 && (
            <div className="db-facts">
              {other.map((f) => (
                <FactTile key={f.kind} fact={f} href={target(f)} />
              ))}
            </div>
          )}
        </div>
      )}
      {overview && data && (
        <div className="db-visuals">
          <StaffMix data={data} />
          {data.payments.map((p) => p.years && <PaymentChart key={p.npi} npi={p.npi} years={p.years} />)}
        </div>
      )}
      {!overview && (
        <a className="db-open" href={href}>
          <span>{directoryRow?.address || 'View department profile'}</span>
          <span className="db-open-icon" aria-label="Open department">
            <ArrowRight size={16} />
          </span>
        </a>
      )}
    </div>
  );
}

export function DepartmentSourceFields({ record }: { record: ProviderProfileRef }) {
  const { data } = useDepartmentBrief(record);
  if (!data?.records.length) return null;
  return (
    <section className="pr-panel db-source-fields">
      <h2 className="pr-icon-heading">
        <IdCard size={20} />
        Registry &amp; license details
      </h2>
      {data.records.map((p) => (
        <article key={p.source.name + p.identifier}>
          <h3>{p.name}</h3>
          <small>
            {p.source.name} · {p.identifier} · {p.source.date}
          </small>
          <dl>
            {[
              ...(p.registryFields ?? []),
              { label: 'Address on record', value: p.address },
              { label: 'Service level', value: p.identity?.serviceLevel },
              { label: 'License issued', value: p.identity?.licenseIssuedAt },
              { label: 'License expires', value: p.identity?.licenseExpiresAt },
            ]
              .filter((f) => f.value)
              .map((f) => (
                <div key={f.label}>
                  <dt>{f.label}</dt>
                  <dd>{f.value}</dd>
                </div>
              ))}
          </dl>
        </article>
      ))}
    </section>
  );
}
