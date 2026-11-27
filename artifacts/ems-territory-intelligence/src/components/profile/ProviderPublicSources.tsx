import { departmentAliases } from '../../services/departmentIdentity';
import { useState } from 'react';
import { FLORIDA_EMS_ROSTER_URL, loadFloridaRoster } from '../../services/floridaEmsRoster';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Building2, CalendarDays, CarFront, CircleDollarSign, Mail, MapPin, Phone, Users } from 'lucide-react';
import { providerEvidenceNerisId, type ProviderContact, type ProviderEvidence } from '../../data/providerProfileEvidence';
import type { PublicProviderProfile } from '../../services/publicProviderProfile';
import { providerCurrency } from '../../services/providerCardIntelligence';
import { matchingProviderGrants, loadProviderGrantState, loadProviderFederalGrants, grantIdentity } from '../../services/providerGrantMatches';
import { loadLegacyStationParent } from '../../services/usfaStationCatalog';
import { DISCOVERY_STATES } from '../../services/publicIntelligenceDiscovery';
import { NerisDepartmentStations } from './NerisDepartmentStations';
import { ProviderSourceLink } from './ProviderEquipmentFunding';

function ContactLinks({ contact }: { contact: ProviderContact }) {
  return <div className="pr-contact-links">
    {contact.phone && <a href={'tel:' + contact.phone}><Phone size={14} aria-hidden="true" />{contact.phone}</a>}
    {contact.email && <a href={'mailto:' + contact.email}><Mail size={14} aria-hidden="true" />{contact.email}</a>}
  </div>;
}

export function ProviderPeople({ evidence }: { evidence?: ProviderEvidence }) {
  const contacts = evidence?.contacts ?? [];
  const context = evidence?.accountContext ?? [];
  return <section className="pr-panel">
    <h2 className="pr-icon-heading"><Users size={22} aria-hidden="true" /> Leadership &amp; contacts</h2>
    {contacts.length > 0 ? <ul className="pr-source-grid">
      {contacts.map(contact => <li className="pr-source-tile" key={contact.role + ':' + (contact.name ?? contact.phone ?? contact.email ?? '')}>
        <h3>{contact.name ?? contact.role}</h3>
        {contact.name && <p className="pr-muted">{contact.role}</p>}
        <ContactLinks contact={contact} />
        <ProviderSourceLink source={contact.source} />
      </li>)}
    </ul> : <p className="pr-muted">No named leadership contact in the department reports on file.</p>}
    {context.length > 0 && <div className="pr-call-context">
      <h3>Buying roles &amp; workflow</h3>
      {context.map(item => <div key={item.title}>
        <h4>{item.title}</h4><p>{item.detail}</p><ProviderSourceLink source={item.source} />
      </div>)}
    </div>}
  </section>;
}

export function ProviderStations({ profile, evidence }: { profile: Pick<PublicProviderProfile, 'registryKey' | 'identity'>; evidence?: ProviderEvidence }) {
  const fdid = evidence?.registryKey ?? (profile.identity?.sourceName === 'USFA NFDR' ? profile.registryKey : undefined);
  const nerisId = profile.identity?.sourceName === 'NERIS' ? profile.identity.identifier : providerEvidenceNerisId(evidence) ?? departmentAliases(profile.identity?.stateCode ?? '',profile.registryKey).find(k=>k.startsWith('NERIS:'))?.slice(6);
  const legacy = useQuery({
    queryKey: ['usfa-profile-stations', fdid],
    queryFn: () => fdid ? loadLegacyStationParent(fdid) : null,
    enabled: Boolean(fdid),
    staleTime: 15 * 60_000,
    retry: false,
  });
  const directory = evidence?.stationDirectory;
  const comparison = legacy.data?.nerisParentCandidates ?? [];
  return <section className="pr-panel">
    <h2 className="pr-icon-heading"><Building2 size={22} aria-hidden="true" /> Stations &amp; apparatus</h2>
    {directory && <>
      <p className="pr-muted">{directory.stations.length} locations in the department directory. Shared stations retain their published relationship.</p>
      <ProviderSourceLink source={directory.source} />
      {directory.visitContact && <div className="pr-station-call">
        <h3>{directory.visitContact.role}</h3><ContactLinks contact={directory.visitContact} />
        <ProviderSourceLink source={directory.visitContact.source} />
        <p className="pr-muted">Call ahead for a station visit. This number reaches the published office.</p>
      </div>}
      <ul className="pr-source-grid pr-stations">
        {directory.stations.map(station => <li className="pr-source-tile" key={station.number}>
          <span className="pr-evidence-status"><Building2 size={14} aria-hidden="true" /> Station {station.number} · {station.category}</span>
          <h3>{station.name}</h3>
          <p className="pr-icon-heading"><MapPin size={15} aria-hidden="true" />{station.address}</p>
          {station.apparatus && <p className="pr-icon-heading"><CarFront size={15} aria-hidden="true" />{station.apparatus}</p>}
          {station.activity && <dl className="pr-source-grid" aria-label={station.activity.period + ' station activity'}>
            <div><dt>EMS calls</dt><dd>{station.activity.emsCalls.toLocaleString('en-US')}</dd></div>
            <div><dt>Primary calls</dt><dd>{station.activity.primaryCalls.toLocaleString('en-US')}</dd></div>
            <div><dt>Responses with valid enroute time</dt><dd>{station.activity.responses.toLocaleString('en-US')}</dd></div>
          </dl>}
          {station.contact && <><p className="pr-muted">{station.contact.role}</p><ContactLinks contact={station.contact} /></>}
        </li>)}
      </ul>
    </>}
    {fdid && legacy.isPending && <p role="status">Loading archived USFA stations…</p>}
    {legacy.isError && <p role="status">Archived station source unavailable. <button type="button" className="pr-source-link" onClick={() => void legacy.refetch()}>Retry</button></p>}
    {legacy.data && <details className="pr-source-disclosure">
      <summary>Archived USFA station addresses ({legacy.data.stations.length})</summary>
      <ul className="pr-source-grid">
        {legacy.data.stations.map(station => <li className="pr-source-tile" key={station.sourceKey}>
          <h3>{station.name || 'Station name not reported'}</h3>
          <p>{station.address.filter(Boolean).join(', ')}</p>
          <p className="pr-muted">USFA historical station record</p>
        </li>)}
      </ul>
      <a className="pr-source-link" href="https://apps.usfa.fema.gov/registry/download" target="_blank" rel="noreferrer">USFA legacy download</a>
    </details>}
    {nerisId && <NerisDepartmentStations id={nerisId} autoLoad={!directory} />}
    {!nerisId && comparison.length > 0 && <details className="pr-source-disclosure">
      <summary>Possible NERIS department matches</summary>
      <p className="pr-muted">The archive supplies these comparison candidates. Confirm which one belongs to this agency.</p>
      <ul>{comparison.map(item => <li key={item.id}>
        <a className="pr-source-link" href={'?' + new URLSearchParams({profile: item.state + '/neris/' + item.id}) + '#stations'}>{item.name} · {item.id}</a>
      </li>)}</ul>
    </details>}
    {!directory && !nerisId && !legacy.data && !legacy.isError && (!fdid || !legacy.isPending) && <p className="pr-muted">No station records linked to this source identity.</p>}
    {!directory && <p className="pr-muted">Registry station sources provide addresses and IDs. Direct station phone and email details appear when a department publishes them.</p>}
  </section>;
}

export function ProviderGrants({ state, name, evidence }: { state: string; name: string; evidence?: ProviderEvidence }) {
  const currentYear = new Date().getUTCFullYear();
  const [fromYear, setFromYear] = useState(currentYear - 5);
  const query = useQuery({
    queryKey: ['provider-fema-awards', state, fromYear],
    queryFn: ({ signal }) => loadProviderGrantState(state, fromYear, signal),
    enabled: DISCOVERY_STATES.includes(state),
    staleTime: 15 * 60_000,
    retry: false,
  });
  const federal = useQuery({
    queryKey: ['provider-federal-grants', state, fromYear],
    queryFn: ({ signal }) => loadProviderFederalGrants(state, fromYear, signal),
    enabled: DISCOVERY_STATES.includes(state),
    staleTime: 15 * 60_000,
    retry: false,
  });
  const departmentMatches = matchingProviderGrants(query.data?.candidates ?? [], state, [name]);
  const exactIds = new Set(departmentMatches.map(row => row.id));
  const parentMatches = matchingProviderGrants(query.data?.candidates ?? [], state, evidence?.publicAwardRecipients ?? [])
    .filter(row => !exactIds.has(row.id));
  const rows = [...departmentMatches, ...parentMatches];
  const federalDepartment = matchingProviderGrants(federal.data?.candidates ?? [], state, [name]);
  const federalIds = new Set(federalDepartment.map(row => row.id));
  const federalMatches = [...federalDepartment, ...matchingProviderGrants(
    federal.data?.candidates ?? [], state, evidence?.publicAwardRecipients ?? [],
  ).filter(row => !federalIds.has(row.id))];
  const femaByIdentity = new Map<string, number>();
  const federalByIdentity = new Map<string, typeof federalMatches>();
  for (const row of rows) {
    const key = grantIdentity(row);
    if (key) femaByIdentity.set(key, (femaByIdentity.get(key) ?? 0) + 1);
  }
  for (const row of federalMatches) {
    const key = grantIdentity(row);
    if (key) {
      const group = federalByIdentity.get(key) ?? [];
      group.push(row);
      federalByIdentity.set(key, group);
    }
  }
  const overlap = new Map([...federalByIdentity].flatMap(([key, group]) =>
    group.length === 1 && femaByIdentity.get(key) === 1 ? [[key, group[0]] as const] : []));
  const federalRows = federalMatches.filter(row => !overlap.has(grantIdentity(row) ?? ''));
  const localAwards = evidence?.funding?.filter(row => row.status === 'Awarded') ?? [];
  return <section className="pr-panel">
    <h2 className="pr-icon-heading"><CircleDollarSign size={22} aria-hidden="true" /> Grant award history</h2>
    {localAwards.length > 0 && <><h3>Department awards reported locally</h3>
      <ul className="pr-source-grid">{localAwards.map(award => <li className="pr-source-tile" key={award.title}>
        <h3>{award.title}</h3>{award.amount !== undefined && <p>{providerCurrency.format(award.amount)}</p>}
        <p>{award.basis}</p><ProviderSourceLink source={award.source} />
      </li>)}</ul></>}
    <label>Search from fiscal year <select value={fromYear} onChange={event => setFromYear(Number(event.target.value))}>
      {[currentYear - 5, currentYear - 10, 2010].map(year => <option key={year} value={year}>FY{year}</option>)}
    </select></label>
    <p className="pr-muted">Published Assistance to Firefighters award rows since FY{fromYear}. Name matches and city or county recipient matches are research leads for this department.</p>
    {!DISCOVERY_STATES.includes(state) ? <p>OpenFEMA state lookup is unavailable for this jurisdiction.</p> :
      query.isPending && <p role="status">Looking up grant recipients…</p>}
    {query.isError && <p role="status">OpenFEMA lookup unavailable. <button type="button" className="pr-source-link" onClick={() => void query.refetch()}>Retry</button></p>}
    {query.data && !rows.length && <p>No recipient-name matches in the returned award rows.</p>}
    {query.data && (query.data.wasCapped || query.data.withheld > 0) && <p className="pr-muted">Some source rows were outside the lookup scope or could not be displayed.</p>}
    <ul className="pr-source-grid">
      {rows.map(row => {
        const alternate = overlap.get(grantIdentity(row) ?? '');
        return <li key={row.id} className="pr-source-tile">
        <span className="pr-evidence-status"><CalendarDays size={14} aria-hidden="true" /> FY{row.fiscalYear}</span>
        <h3>{row.awardAmount === null ? 'Amount not reported' : providerCurrency.format(row.awardAmount)}</h3>
        <p>{row.recipient} · {row.awardNumber}</p>
        <p className="pr-muted">{exactIds.has(row.id) ? 'Department name match' : 'City or county recipient · confirm department and project'}</p>
        <a className="pr-source-link" href={row.sourceUrl} target="_blank" rel="noreferrer">OpenFEMA source results <ArrowUpRight size={13} aria-hidden="true" /></a>
        {alternate && <div>
          {alternate.description && <p>{alternate.description}</p>}
          {alternate.startDate && <p>USAspending period · {alternate.startDate}{alternate.endDate && ' to ' + alternate.endDate}</p>}
          {alternate.awardAmount !== null && alternate.awardAmount !== row.awardAmount && <p>USAspending published amount · {providerCurrency.format(alternate.awardAmount)}</p>}
          <a className="pr-source-link" href={alternate.sourceUrl} target="_blank" rel="noreferrer">Same award in USAspending</a>
        </div>}
      </li>;
      })}
    </ul>
    <h3 className="pr-icon-heading"><CircleDollarSign size={18} aria-hidden="true" /> USAspending grant records</h3>
    <p className="pr-muted">Firefighter assistance awards since FY{fromYear}. Awards with the same number and recipient are shown together.</p>
    {DISCOVERY_STATES.includes(state) && federal.isPending && <p role="status">Looking up USAspending recipients…</p>}
    {federal.isError && <p role="status">USAspending lookup unavailable. <button type="button" className="pr-source-link" onClick={() => void federal.refetch()}>Retry USAspending</button></p>}
    {federal.data && !federalMatches.length && <p>No recipient-name matches in the returned USAspending awards.</p>}
    {federal.data && (federal.data.wasCapped || federal.data.withheld > 0) && <p className="pr-muted">Some USAspending rows were outside the lookup scope or contained incomplete source fields.</p>}
    <ul className="pr-source-grid">
      {federalRows.map(row => <li key={row.id} className="pr-source-tile">
        {row.startDate && <span className="pr-evidence-status"><CalendarDays size={14} aria-hidden="true" /> {row.startDate}{row.endDate && ' to ' + row.endDate}</span>}
        <h3>{row.awardAmount === null ? 'Amount not reported' : providerCurrency.format(row.awardAmount)}</h3>
        <p>{row.recipient} · {row.awardNumber}</p>
        {row.awardingAgency && <p>{row.awardingAgency}</p>}
        {row.description && <p>{row.description}</p>}
        <p className="pr-muted">{federalIds.has(row.id) ? 'Department name match' : 'City or county recipient · confirm department and project'}</p>
        <a className="pr-source-link" href={row.sourceUrl} target="_blank" rel="noreferrer">USAspending award <ArrowUpRight size={13} aria-hidden="true" /></a>
      </li>)}
    </ul>
  </section>;
}

type RosterContact = { sourcePage: number; rosterContact?: string; phone?: string; emails?: string[] };

export function FloridaProviderContacts({ license }: { license?: string }) {
  const query = useQuery({
    queryKey: ['florida-ems-provider-contacts', license],
    enabled: Boolean(license),
    retry: false,
    staleTime: 15 * 60_000,
    queryFn: async ({ signal }) => {
      const [roster, response] = await Promise.all([
        loadFloridaRoster(),
        fetch(import.meta.env.BASE_URL + 'registry/state-ems/FL-contacts.json', { signal }),
      ]);
      if (!response.ok) throw Error('Florida EMS contacts unavailable.');
      const snapshot = await response.json() as { sourceDate: string; records: Record<string, RosterContact> };
      if (snapshot.sourceDate !== roster.sourceDate) throw Error('Florida EMS contacts are from a different roster edition.');
      const record = roster.records.find(row => row.identifier === license && row.headquartersState === 'FL');
      return record && license ? { contact: snapshot.records[license], sourceDate: roster.sourceDate } : null;
    },
  });
  if (!license) return null;
  const contact = query.data?.contact;
  const phone = contact?.phone && /^\d{10}$/.test(contact.phone) ? contact.phone : undefined;
  return <section className="pr-panel">
    <h2 className="pr-icon-heading"><Phone size={20} aria-hidden="true" /> Florida EMS license contacts</h2>
    {query.isPending && <p role="status">Loading the state EMS roster contact…</p>}
    {query.isError && <p>State contact unavailable. <button className="pr-source-link" onClick={() => void query.refetch()}>Retry</button></p>}
    {contact && <div className="pr-source-tile">
      {contact.rosterContact && <h3>{contact.rosterContact}</h3>}
      <p className="pr-muted">Published EMS roster contact · license {license}. The phone and email are listed for the license record.</p>
      <div className="pr-contact-links">
        {phone && <a href={'tel:+1' + phone}><Phone size={14} aria-hidden="true" />{phone.replace(/^(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3')}</a>}
        {contact.emails?.filter(email => /^[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}$/.test(email)).map(email =>
          <a key={email} href={'mailto:' + email}><Mail size={14} aria-hidden="true" />{email}</a>)}
      </div>
      <ProviderSourceLink source={{ label: 'Florida Department of Health EMS roster', date: query.data?.sourceDate ?? '',
        url: FLORIDA_EMS_ROSTER_URL + '#page=' + contact.sourcePage }} />
    </div>}
  </section>;
}
