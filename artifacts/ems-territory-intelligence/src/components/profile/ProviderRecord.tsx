import { loadDepartmentBrief } from '../../services/departmentBrief';
import { DepartmentAwardLedger } from './DepartmentAwardLedger';
import { StationContactHistory } from './StationContactHistory';
import {loadSourceDirectoryManifest} from '../../services/nationalSourceDirectory';
import { DepartmentContacts } from './DepartmentContacts';
import { WorkspaceDepartmentFacts } from './WorkspaceDepartmentFacts';
import { loadProviderCatalog } from '../../services/providerCatalog';
import { profileSourceKey } from '../../services/departmentIdentity';
import { ServiceBrief, DepartmentSourceFields } from './ServiceBrief';
import { departmentAliases, isCombinedDepartment } from '../../services/departmentIdentity';
import { ProviderChanges } from './ProviderChanges';
import { DiscoveryCoach } from './DiscoveryCoach';
import { ProviderStory } from './ProviderStory';
import { InlineAgencyRecords } from './InlineAgencyRecords';
import { KingCountyOutcome } from '../PublicProviderEvidenceCoverage';
import { ProviderEvidenceStatus } from '../PublicProviderEvidenceCoverage';
import { RegionalAedSources } from '../RegionalAedSources';
import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, ArrowLeft, ArrowUpRight, Building2, CalendarDays, ClipboardList, FileText, HeartPulse, MapPin, Shield, Truck, Landmark, Users, Receipt } from 'lucide-react';
import { findProviderEvidenceByConfirmedKeys, findProviderEvidence, providerEvidenceFloridaLicense, providerEvidenceNerisId, linkedBillingOrganization, type ProviderEvidence, type ProviderEvidenceSource } from '../../data/providerProfileEvidence';
import { parseProviderProfileRef } from '../../navigation/providerProfileUrl';
import { loadPublicProviderProfile, type PublicProviderProfile } from '../../services/publicProviderProfile';
import { canCreateRegistryAccount } from '../../services/registryAccountLink';
import { createSourceNativeAgency } from '../../services/sourceNativeAgency';
import { loadUsfaProfileOperations } from '../../services/usfaProfileOperations';
import { safeSourceUrl } from '../../services/factReviewStore';
import brandLogo from '../../assets/images/nicks_ems_logo_1792367124466.jpg';
import combinedArt from '../../assets/provider-station-art.webp';
import fireArt from '../../assets/provider-fire-art.webp';
import emsArt from '../../assets/provider-ems-art.webp';
import { CmsAmbulanceEvidencePanel } from './CmsAmbulanceEvidencePanel';
import { NppesPracticeLocationsPanel } from './NppesPracticeLocationsPanel';
import { ProviderEquipmentFunding, ProviderSourceLink } from './ProviderEquipmentFunding';
import { ProviderFootprint } from './ProviderFootprint';
import { ProviderCallBrief } from './ProviderCallBrief';
import { ProviderPurchasing } from './ProviderPurchasing';
import { ProviderPublishedBilling } from './ProviderPublishedBilling';
import { ProviderMetrics } from './ProviderMetrics';
import { ProviderGrants, ProviderPeople, ProviderStations, FloridaProviderContacts } from './ProviderPublicSources';
import { formatProviderMetric, providerCurrency } from '../../services/providerCardIntelligence';

const sections = [
  { id: 'overview', label: 'Overview', icon: Building2 },
  { id: 'discovery', label: 'Discovery', icon: Users },
  { id: 'equipment', label: 'Equipment & funding', icon: ClipboardList },
  { id: 'grants', label: 'Grants', icon: Landmark },
  { id: 'people', label: 'People', icon: Users },
  { id: 'stations', label: 'Stations', icon: Truck },
  { id: 'quality', label: 'Quality & outcomes', icon: HeartPulse },
  { id: 'operations', label: 'Operations', icon: Activity },
  { id: 'claims', label: 'Claims', icon: Receipt },
  { id: 'sources', label: 'Sources', icon: FileText },
] as const;

function selectedSection() {
  return sections.find(({ id }) => '#' + id === window.location.hash)?.id ?? 'overview';
}

function directoryHref(profile?: PublicProviderProfile, county?: string) {
  if (!profile) return import.meta.env.BASE_URL;
  const params = new URLSearchParams({ state: profile.stateCode, provider: profile.kind === 'Fire department' ? 'fire' : 'ems' });
  if (county) params.set('county', county);
  return '?' + params + '#territory-public-source-directory';
}

function SourceSummary({ profile }: { profile: PublicProviderProfile }) {
  const sourceUrl = safeSourceUrl(profile.source.url);
  return <aside className="pr-panel pr-source-summary" aria-label="Registry and dates">
    <div>
      <h2><FileText size={19} aria-hidden="true" />Registry</h2>
      <p>{profile.source.name}</p>
      <p className="pr-muted">{profile.identifier}</p>
      {sourceUrl && <a className="pr-source-link" href={sourceUrl} target="_blank" rel="noreferrer">Open registry record <ArrowUpRight size={14} aria-hidden="true" /></a>}
    </div>
    <div>
      <h2><CalendarDays size={19} aria-hidden="true" />Reporting dates</h2>
      <p>{profile.source.date || 'Registry date not reported'}</p>
      <p className="pr-muted">Department records carry their own dates and reporting periods.</p>
    </div>
  </aside>;
}

function Operations({ profile, evidence }: { profile: PublicProviderProfile; evidence?: ProviderEvidence }) {
  const metrics = evidence?.operations ?? [];
  const identity = profile.identity;
  const usfaKey = evidence?.registryKey ?? (identity?.sourceName === 'USFA NFDR' ? profile.registryKey : undefined);
  const usfa = useQuery({
    queryKey: ['usfa-profile-operations', profile.stateCode, usfaKey],
    queryFn: () => usfaKey ? loadUsfaProfileOperations(profile.stateCode, usfaKey) : null,
    enabled: Boolean(usfaKey),
    retry: false,
  });
  return <section className="pr-panel pr-operations">
    <h2>Operations</h2>
    {metrics.length ? (
      <ProviderMetrics metrics={metrics} />
    ) : <p className="pr-muted">No local department report on file.</p>}
    {usfaKey && usfa.isPending && <p className="pr-muted" role="status">Loading registry staffing and station figures…</p>}
    {usfaKey && usfa.isError && <p className="pr-muted" role="status">Registry staffing and station figures are unavailable. <button type="button" className="pr-source-link" onClick={() => void usfa.refetch()}>Retry</button></p>}
    {usfa.data && <section className="pr-reported">
      <h3>USFA registry figures</h3>
      <p className="pr-muted">Archived registry retrieved {usfa.data.retrievedAt}. Counts reflect the source listing.</p>
      {usfa.data.departmentType && <p>Department type · {usfa.data.departmentType}</p>}
      <dl className="pr-metrics">
        {usfa.data.metrics.map(({ label, value }) => <div key={label}><dt>{label}</dt><dd>{value.toLocaleString('en-US')}</dd></div>)}
      </dl>
      <ProviderSourceLink source={{ label: 'USFA Fire Department Registry', date: usfa.data.retrievedAt, url: 'https://apps.usfa.fema.gov/registry/download' }} />
    </section>}
    {profile.reportedStationCount != null && <p>{profile.reportedStationCount.toLocaleString('en-US')} stations reported by {profile.stationCountSource}.</p>}
    <div className="pr-contact-links">
      <a href="#stations"><Truck size={16} aria-hidden="true" /> Stations &amp; apparatus</a>
      <a href="#claims"><Receipt size={16} aria-hidden="true" /> Medicare claims and reimbursement</a>
    </div>
  </section>;
}

function Overview({ profile, evidence }: { profile: PublicProviderProfile; evidence?: ProviderEvidence }) {
  return <section className="pr-panel pr-overview">
    <h2>Department overview</h2>
    <div className="pr-overview-grid">
      <div>
        <h3><MapPin size={18} aria-hidden="true" />Recorded location</h3>
        <p className="pr-record-value">{profile.address || 'Street address not reported'}</p>
        <p>{[profile.city, profile.state].filter(Boolean).join(', ')}</p>
        {profile.locationLabel && <p className="pr-muted">{profile.locationLabel}</p>}
        {profile.locationNote && <p>{profile.locationNote}</p>}
        {profile.recordedAddress && <p className="pr-muted">Original registry address · {profile.recordedAddress}</p>}
        {profile.addressSource && <a className="pr-source-link" href={profile.addressSource.url} target="_blank" rel="noreferrer">{profile.addressSource.label}</a>}
        {profile.directionsUrl && <a className="pr-source-link pr-directions" href={profile.directionsUrl} target="_blank" rel="noreferrer">Directions <ArrowUpRight size={14} aria-hidden="true" /></a>}
      </div>
      <div>
        <h3><Shield size={18} aria-hidden="true" />Agency record</h3>
        <p className="pr-record-value">{profile.kind}</p>
        <p>{profile.identifier}</p>
        {profile.countyFips && <p className="pr-muted">County FIPS {profile.countyFips}</p>}
        {profile.identity?.serviceLevel && <p>Reported service level · {profile.identity.serviceLevel}</p>}
        {profile.identity?.licenseIssuedAt && <p>Reported license issued · {profile.identity.licenseIssuedAt}</p>}
        {profile.identity?.licenseExpiresAt && <p>Reported license expiration · {profile.identity.licenseExpiresAt}</p>}
      </div>
    </div>
    <div className="pr-overview-links">
      <a href="#equipment"><ClipboardList size={19} aria-hidden="true" /><span><strong>Equipment &amp; funding</strong><small>{evidence?.equipment?.length || evidence?.funding?.length ? 'Inventory, purchasing and funding records' : 'Equipment categories and source availability'}</small></span><ArrowUpRight size={16} aria-hidden="true" /></a>
      <a href="#quality"><HeartPulse size={19} aria-hidden="true" /><span><strong>Quality &amp; outcomes</strong><small>Reported clinical measures and response performance</small></span><ArrowUpRight size={16} aria-hidden="true" /></a>
      <a href="#operations"><Truck size={19} aria-hidden="true" /><span><strong>Operations</strong><small>Fleet, stations, service activity and reported metrics</small></span><ArrowUpRight size={16} aria-hidden="true" /></a>
    </div>
  </section>;
}

function Quality({ evidence }: { evidence?: ProviderEvidence }) {
  const metrics = evidence?.quality ?? [];
  return <section className="pr-panel pr-operations">
    <h2>Quality &amp; outcomes</h2>
    <p className="pr-muted">Department-level figures with the original reporting dates. When the report includes a measure definition, it appears next to the value.</p>
    {metrics.length > 0
      ? <ProviderMetrics metrics={metrics} />
      : <p>No department-level outcome or response performance report on file.</p>}
    <div className="pr-quality-followup">
      <h3>Measures to confirm with the department</h3>
      <p className="pr-muted">Cardiac arrest survival to discharge, bystander CPR or AED use, CPR fraction and compression quality, first-shock timing, and case-review workflow.</p>
    </div>
  </section>;
}

function Sources({ profile, evidence }: { profile: PublicProviderProfile; evidence?: ProviderEvidence }) {
  const rows: { source: ProviderEvidenceSource }[] = [...(evidence?.equipment ?? []), ...(evidence?.funding ?? []), ...(evidence?.operations ?? []), ...(evidence?.quality ?? []), ...(evidence?.billing ?? []), ...(evidence?.payerMix ?? []), ...(evidence?.billingDenials ?? []), ...(evidence?.accountContext ?? []), ...(evidence?.contacts ?? [])];
  rows.push(...(evidence?.identitySources ?? []).map(source => ({ source })));
  if (evidence?.stationDirectory) rows.push(evidence.stationDirectory);
  const sources = [...new Map(rows.map(({ source }) => [source.url, source])).values()];
  return <section className="pr-panel pr-sources">
    <h2>Sources</h2>
    <ul>
      {safeSourceUrl(profile.source.url) && <li><ProviderSourceLink source={{ label: profile.source.name, url: profile.source.url, date: profile.source.date || 'date not reported' }} /></li>}
      {sources.map((source) => <li key={source.url}><ProviderSourceLink source={source} /></li>)}
    </ul>
    <p className="pr-muted">Review the original record before relying on locations, equipment, funding or clinical data.</p>
  </section>;
}

function ProfileGlance({ evidence }: { evidence?: ProviderEvidence }) {
  const equipment = evidence?.equipment?.slice().sort((a, b) => {
    const date = (item: typeof a) => item.lastPurchasedOn ?? item.acquiredOn ?? item.paidOn ?? item.approvedOn ?? item.source.date.match(/\d{4}(?:-\d{2}){0,2}/)?.[0] ?? '';
    return date(b).localeCompare(date(a));
  })[0];
  const fundingDate = (item: NonNullable<ProviderEvidence['funding']>[number]) =>
    item.source.date.match(/\d{4}(?:-\d{2}){0,2}/)?.[0] ?? String(item.fiscalYear ?? '');
  const funding = evidence?.funding?.slice().sort((a, b) => fundingDate(b).localeCompare(fundingDate(a)))[0];
  const person = evidence?.contacts?.find(row => row.name);
  const metric = evidence?.quality?.find(row => /ROSC/i.test(row.label)) ?? evidence?.operations?.[0] ?? evidence?.quality?.[0];
  const glance = [
    equipment && { anchor: 'equipment', label: 'Equipment', value: equipment.model ?? equipment.deployment ?? equipment.category,
      note: [equipment.manufacturer, equipment.supplier, equipment.quantity != null && equipment.quantity + ' units', equipment.deployment, equipment.status, equipment.lastPurchasedOn ?? equipment.acquiredOn ?? equipment.paidOn ?? equipment.approvedOn ?? equipment.source.date].filter(Boolean).join(' · '), icon: ClipboardList },
    funding && { anchor: 'equipment', label: 'Funding & purchasing', value: funding.amount === undefined ? funding.title : providerCurrency.format(funding.amount),
      note: [funding.title, funding.status, funding.source.date, funding.spendBy && 'Spend by ' + funding.spendBy].filter(Boolean).join(' · '), icon: Landmark },
    person && { anchor: 'people', label: person.role, value: person.name, note: [person.phone ?? person.email, person.source.date].filter(Boolean).join(' · '), icon: Users },
    metric && { anchor: evidence?.quality?.includes(metric) ? 'quality' : 'operations', label: metric.label,
      value: formatProviderMetric(metric), note: metric.reportingPeriod ?? metric.source.date, icon: Activity },
  ];
  if (!glance.some(Boolean)) return null;
  return <section className="pr-glance" aria-label="Profile at a glance">
    {glance.map(item => item && <a className="pr-panel" key={item.label} href={'#' + item.anchor}>
      <span className="pr-icon-heading"><item.icon size={17} aria-hidden="true" />{item.label}</span>
      <strong>{item.value}</strong><small className="pr-muted">{item.note}</small>
    </a>)}
  </section>;
}

function Claims({ profile, evidence }: { profile: PublicProviderProfile; evidence?: ProviderEvidence }) {
  const identity = profile.identity;
  const linkedNpis = new Set(departmentAliases(profile.stateCode,profile.registryKey).filter(k=>k.startsWith('NPI:')).map(k=>k.slice(4)));
  const preferred = linkedBillingOrganization(profile.registryKey,evidence);
  if (preferred) linkedNpis.add(preferred);
  const linkedNpi = preferred ?? [...linkedNpis][0];
  const agency = identity?.sourceName === 'NPPES' && canCreateRegistryAccount(identity)
    ? createSourceNativeAgency(identity, []) : linkedNpi && identity
      ? { ...createSourceNativeAgency(identity, []), npiNumber: linkedNpi } : undefined;
  return <section className="pr-panel">
    <h2 className="pr-icon-heading"><Receipt size={22} aria-hidden="true" /> Claims &amp; reimbursement</h2>
    <ProviderPublishedBilling evidence={evidence} />
    {agency && [...linkedNpis].filter(npi=>npi!==agency.npiNumber).map(npi=><CmsAmbulanceEvidencePanel key={npi} agency={{...agency,npiNumber:npi}} autoLoad/>)}
    {agency ? <CmsAmbulanceEvidencePanel agency={agency} autoLoad /> : <p className="pr-muted">No organization NPI linked to this public profile. Use the NPPES organization listing or the linked workspace account to look up reported Medicare service units and payments.</p>}
  </section>;
}

export default function ProviderRecord({ reference }: { reference: string }) {
  const ref = parseProviderProfileRef(reference);
  const [section, setSection] = useState(selectedSection);
  useEffect(() => {
    const change = () => setSection(selectedSection());
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);
  const query = useQuery({
    queryKey: ['public-provider-profile', reference],
    queryFn: () => ref ? loadPublicProviderProfile(ref).then(profile => profile ?? null) : null,
    retry: false,
  });
  const catalog = useQuery({queryKey:['profile-directory-state',ref?.state],enabled:!!ref,queryFn:()=>loadProviderCatalog(ref!.state),staleTime:Infinity});
  const row = ref && catalog.data?.find(p=>p.ref.id===ref.id && p.ref.source===ref.source);
  const geography=useQuery({queryKey:['department-county-labels'],queryFn:loadSourceDirectoryManifest,enabled:!!row?.county && !query.data?.county,staleTime:Infinity});
  const profile=useMemo(()=>{
    const p=query.data;
    if(!p || !row || p.withholdGeography) return p;
    return {...p,countyFips:p.countyFips || row.county || undefined,county:p.county || geography.data?.countyNames[row.county],
      ...(!p.coordinates && row.point ? {coordinates:{latitude:row.point[0],longitude:row.point[1]},locationLabel:row.pointBasis,mappedAddress:row.pointAddress} : {})};
  },[query.data,row,geography.data]);
  const brief=useQuery({queryKey:['department-brief',ref?.state,ref?.source,ref?.id],enabled:!!ref,queryFn:()=>loadDepartmentBrief(ref!),staleTime:15*60000});
  const timelineEvidence=brief.data?.evidence;
  const evidence = profile ? (findProviderEvidence(profile.registryKey, profile.name) ?? (ref && findProviderEvidenceByConfirmedKeys([profileSourceKey(ref)]))) : undefined;
  const floridaLicenses = new Set<string>();
  if (profile?.stateCode === 'FL') {
    if (profile.identity?.sourceName === 'State EMS') floridaLicenses.add(profile.identity.identifier);
    const reviewed = providerEvidenceFloridaLicense(evidence);
    if (reviewed) floridaLicenses.add(reviewed);
    for (const key of departmentAliases('FL', profile.registryKey)) {
      if (key.startsWith('STATE-EMS:FL:license:')) floridaLicenses.add(key.slice('STATE-EMS:FL:license:'.length));
    }
  }

  const stationId = profile?.identity?.sourceName === 'NERIS' ? profile.identity.identifier : providerEvidenceNerisId(evidence) ?? departmentAliases(profile?.stateCode ?? '', profile?.registryKey).find(k=>k.startsWith('NERIS:'))?.slice(6);
  const combined = row?.kind === 'combined' || evidence?.combinedServices || isCombinedDepartment(profile?.registryKey);
  const artKind = combined ? 'combined' : row?.kind === 'fire' || profile?.kind === 'Fire department' ? 'fire' : 'ems';
  const art = { combined: combinedArt, fire: fireArt, ems: emsArt }[artKind];
  const agencyLabel = combined ? 'Fire & EMS department' : artKind==='fire' ? 'Fire department' : profile?.kind;

  useEffect(() => {
    if (profile && ref) {
      const url = new URL(window.location.href);
      const target = [ref.state, ref.source, ref.id].join('/');
      if (url.searchParams.get('profile') !== target) {
        url.searchParams.set('profile', target);
        window.history.replaceState(window.history.state, '', url);
      }
    }
    if (profile) document.title = profile.name + ' | Nick’s EMS & Fire Territory Intelligence';
  }, [profile]);

  return <div className="provider-record" data-agency={artKind}>
    <header className="pr-masthead">
      <div className="pr-brand"><img src={brandLogo} alt="" width={48} height={48} /><div><strong>Nick’s EMS &amp; Fire</strong><span>Territory Intelligence</span></div></div>
      <a href={directoryHref(profile ?? undefined, profile?.county)}><ArrowLeft size={17} aria-hidden="true" /> Provider directory</a>
    </header>
    {profile ? <main className="pr-shell">
      <div className="pr-hero">
        <div className="pr-identity">
          <nav className="pr-breadcrumb" aria-label="Provider location">
            <MapPin size={17} aria-hidden="true" />
            <a href={directoryHref(profile)}>{profile.state}</a>
            {profile.county && <><span aria-hidden="true">/</span><a href={directoryHref(profile, profile.county)}>{profile.county}</a></>}
          </nav>
          <h1>{profile.name}</h1>
          <p className="pr-profile-label">{agencyLabel} <span aria-hidden="true">·</span> {profile.identifier}</p>
        </div>
        <figure className="pr-art">
          <img src={art} alt="" width={760} height={440} />
          <figcaption>Illustrative {artKind === 'combined' ? 'fire & EMS' : artKind === 'fire' ? 'fire department' : 'EMS'} artwork</figcaption>
        </figure>
      </div>
      <nav className="pr-tabs" aria-label="Profile sections">
        {sections.map(({ id, label, icon: Icon }) => <a key={id} href={'#' + id} aria-current={section === id ? 'page' : undefined}>
          <Icon size={17} aria-hidden="true" />{label}
        </a>)}
      </nav>
      <div className="pr-mobile-tabs">
        <label htmlFor="provider-section">Profile section</label>
        <select id="provider-section" value={section} onChange={event => { window.location.hash = event.target.value; }}>
          {sections.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
        </select>
      </div>
      {section === 'overview' && ref && <ServiceBrief record={ref} name={profile.name} location={profile.address ?? profile.city} category={row?.kind} serviceLevel={profile.identity?.serviceLevel} reportedStations={profile.reportedStationCount} reportDate={profile.source.date} overview/>}
      {section === 'overview' && <ProviderChanges evidence={timelineEvidence ?? evidence}/>}
      {ref && <WorkspaceDepartmentFacts record={ref} section={section}/>}
      {section === 'equipment' ? <div className="pr-detail-wrap">
        {(timelineEvidence?.equipment?.length || timelineEvidence?.funding?.length) ? <ProviderStory key={reference} evidence={timelineEvidence} nerisId={stationId}/> : null}
        {ref && <DepartmentAwardLedger record={ref}/>}
        <ProviderEquipmentFunding evidence={evidence}>
          <ProviderPurchasing registryKey={evidence?.registryKey ?? profile.registryKey} />
          <RegionalAedSources state={profile.stateCode} county={profile.countyFips} nerisId={stationId} profile />
          <a className="pr-panel pr-icon-heading pr-source-link" href="#grants"><Landmark size={19} aria-hidden="true" /> Look up OpenFEMA grant records</a>
          <ProviderFootprint key={reference} profile={profile} linkedNerisId={stationId} />
        </ProviderEquipmentFunding>
      </div> : <div className="pr-layout">
        <div className="pr-detail">
          {section === 'discovery' && <><ProfileGlance evidence={evidence}/><DiscoveryCoach identity={profile.identity} evidence={evidence} key={reference} agency={profile.name} /></>}
          {section === 'overview' && <>{evidence?.equipment?.length || evidence?.funding?.length ? <ProviderCallBrief evidence={evidence} /> : null}<Overview profile={profile} evidence={evidence} /></>}
          {ref && (section==='equipment' || section==='grants' || section==='sources') && <DepartmentAwardLedger record={ref} coverage={section==='sources'}/>}
          {section === 'grants' && <ProviderGrants state={profile.stateCode} name={evidence?.registryName ?? profile.name} evidence={evidence} />}
          {section === 'people' && <>{ref && <DepartmentContacts record={ref}/>}<ProviderPeople evidence={evidence} />{[...floridaLicenses].map(license=><FloridaProviderContacts key={license} license={license} />)}{ref && <StationContactHistory record={ref}/>}</>}
          {section === 'stations' && <>{ref && <StationContactHistory record={ref}/>}<ProviderStations profile={profile} evidence={evidence} />
            {profile.identity?.sourceName === 'NPPES' && canCreateRegistryAccount(profile.identity) &&
              <NppesPracticeLocationsPanel agency={createSourceNativeAgency(profile.identity, [])} />}</>}
          {section === 'claims' && <Claims profile={profile} evidence={evidence} />}
          {section === 'quality' && <><Quality evidence={evidence} />{profile.countyFips === '53033' && <KingCountyOutcome />}</>}
          {section === 'operations' && <Operations profile={profile} evidence={evidence} />}
          {section === 'sources' && <>{ref && <DepartmentSourceFields record={ref}/>}<Sources profile={profile} evidence={evidence}/><InlineAgencyRecords state={profile.stateCode} registryKey={profile.registryKey} evidence={evidence}/><ProviderEvidenceStatus evidence={evidence}/></>}
        </div>
        <div className="pr-section-rail">
          {section !== 'sources' && <ProviderFootprint key={reference} profile={profile} linkedNerisId={stationId} />}
          {section === 'overview' && ref && <DepartmentContacts record={ref} summary/>}
          <SourceSummary profile={profile} />
        </div>
      </div>}
    </main> : <main className="pr-empty pr-panel">
      <h1>Provider profile</h1>
      {query.isPending
        ? <p role="status">Loading provider record…</p>
        : query.isError
          ? <><p role="alert">The provider directory could not be loaded.</p><button type="button" onClick={() => void query.refetch()}>Retry</button></>
          : <p>No provider record matches this link.</p>}
      <a className="pr-source-link" href={directoryHref()}>Browse the provider directory</a>
    </main>}
  </div>;
}
