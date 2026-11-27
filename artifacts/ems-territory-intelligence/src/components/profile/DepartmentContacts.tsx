import { useQuery } from '@tanstack/react-query';
import { Building2, Phone, UserRound, Radio } from 'lucide-react';
import type { ProviderProfileRef } from '../../navigation/providerProfileUrl';
import { queryOfficialNppesByNpi } from '../../services/npiVerificationService';
import { useDepartmentBrief } from './ServiceBrief';

function Telephone({ value }: { value: string }) {
  const digits = value.replace(/[^\d+]/g, '');
  return digits.length >= 7 ? (
    <a className="pr-source-link" href={'tel:' + digits}>
      <Phone size={15} />
      {value}
    </a>
  ) : (
    <span>{value}</span>
  );
}
function RegisteredOfficial({ npi }: { npi: string }) {
  const lookup = useQuery({
    queryKey: ['directory-public-officer', npi],
    queryFn: async () => {
      const result = await queryOfficialNppesByNpi(npi, 12000);
      if (result.status === 'SOURCE_UNAVAILABLE') throw Error('Official registry unavailable');
      const e = result.entity;
      return e?.isOrganization && String(e.npi) === npi ? e : null;
    },
    staleTime: 15 * 60000,
    retry: false,
  });
  const org = lookup.data;
  if (lookup.isError)
    return (
      <p className="pr-muted">
        Live NPPES contact lookup unavailable for {npi}.{' '}
        <button className="pr-source-link" onClick={() => void lookup.refetch()}>
          Retry
        </button>
      </p>
    );
  if (lookup.isPending) return <p role="status">Looking up the organization’s registered contact…</p>;
  if (!org || (!org.authorizedOfficial && !org.practiceLocationAddress?.telephone)) return null;
  return (
    <article className="pr-source-tile">
      <h3>
        <UserRound size={16} /> NPPES organization contact
      </h3>
      <p>{org.legalEntityName}</p>
      {org.authorizedOfficial && (
        <div>
          <strong>{org.authorizedOfficial.name}</strong>
          <p>{org.authorizedOfficial.title}</p>
          {org.authorizedOfficial.telephone && <Telephone value={org.authorizedOfficial.telephone} />}
        </div>
      )}
      {org.practiceLocationAddress?.telephone && (
        <p>
          Practice location · <Telephone value={org.practiceLocationAddress.telephone} />
        </p>
      )}
      <small>
        CMS NPPES · NPI {npi}
        {org.lastUpdated && ' · Updated ' + org.lastUpdated}
      </small>
    </article>
  );
}

export function DepartmentContacts({
  record,
  summary = false,
}: {
  record: ProviderProfileRef;
  summary?: boolean;
}) {
  const query = useDepartmentBrief(record),
    data = query.data;
  if (!data) return null;
  const offices = data.contacts.filter((c) => c.phone || c.fax || c.website || c.mailing);
  if (summary && !offices.some((c) => c.phone)) return null;
  if (summary) {
    const c = offices.find((c) => c.phone)!;
    return (
      <aside className="pr-panel db-contact">
        <h2>
          <Phone size={18} />
          {c.key.startsWith('FDID:') ? 'Headquarters' : 'Practice location'}
        </h2>
        <Telephone value={c.phone!} />
        <small>
          {c.label} · {c.date}
        </small>
        <a className="pr-source-link" href="#people">
          All department contacts
        </a>
      </aside>
    );
  }
  if (!offices.length && !data.payments.length) return null;
  return (
    <section className="pr-panel db-contacts">
      <h2>
        <Building2 size={21} /> Department contact directory
      </h2>
      <div className="pr-source-grid">
        {offices.map((c) => (
          <article className="pr-source-tile" key={c.key}>
            <h3>{c.key.startsWith('FDID:') ? 'Fire department headquarters' : 'EMS practice location'}</h3>
            <strong>{c.agency}</strong>
            {c.phone && (
              <p>
                <Telephone value={c.phone} />
              </p>
            )}
            {c.fax && <p>Fax · {c.fax}</p>}
            {c.website && <p>Website · {c.website}</p>}
            {c.mailing && <p>Mailing address · {c.mailing}</p>}
            {c.organization && <p>{c.organization}</p>}
            {c.emergencyManagement && <p>Primary emergency management agency · {c.emergencyManagement}</p>}
            {c.licenses?.map((license) => (
              <p key={license}>NPPES-reported license · {license}</p>
            ))}
            <small>
              {c.label} · {c.date}
            </small>
          </article>
        ))}
      </div>
      {data.payments.map((p) => (
        <RegisteredOfficial key={p.npi} npi={p.npi} />
      ))}
    </section>
  );
}
