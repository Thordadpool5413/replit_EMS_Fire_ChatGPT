import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, ArrowLeft, ArrowUpRight, Building2, CalendarDays, ClipboardList, FileText, HeartPulse, MapPin, Shield, Truck } from 'lucide-react';
import { findProviderEvidence, type ProviderEvidence } from '../../data/providerProfileEvidence';
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
import { NerisDepartmentStations } from './NerisDepartmentStations';
import { NppesPracticeLocationsPanel } from './NppesPracticeLocationsPanel';
import { ProviderEquipmentFunding, ProviderSourceLink } from './ProviderEquipmentFunding';
import { ProviderFootprint } from './ProviderFootprint';
import { ProviderCallBrief } from './ProviderCallBrief';
import { ProviderMetrics } from './ProviderMetrics';
import { UsfaLegacyStations } from './UsfaLegacyStations';

const sections = [
  { id: 'overview', label: 'Overview', icon: Building2 },
  { id: 'equipment', label: 'Equipment & funding', icon: ClipboardList },
  { id: 'quality', label: 'Quality & outcomes', icon: HeartPulse },
  { id: 'operations', label: 'Operations', icon: Activity },
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
  const usfaKey = identity?.sourceName === 'USFA NFDR' ? profile.registryKey : undefined;
  const usfa = useQuery({
    queryKey: ['usfa-profile-operations', profile.stateCode, usfaKey],
    queryFn: () => usfaKey ? loadUsfaProfileOperations(profile.stateCode, usfaKey) : null,
    enabled: Boolean(usfaKey),
    retry: false,
  });
  const cmsAgency = identity?.sourceName === 'NPPES' && canCreateRegistryAccount(identity)
    ? createSourceNativeAgency(identity, [])
    : undefined;
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
    {identity?.sourceName === 'NERIS' && <NerisDepartmentStations id={identity.identifier} />}
    {identity?.sourceName === 'USFA NFDR' && profile.registryKey && <UsfaLegacyStations parentKey={profile.registryKey} />}
    {cmsAgency && <><NppesPracticeLocationsPanel agency={cmsAgency} /><CmsAmbulanceEvidencePanel agency={cmsAgency} /></>}
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
  const rows = [...(evidence?.equipment ?? []), ...(evidence?.funding ?? []), ...(evidence?.operations ?? []), ...(evidence?.quality ?? []), ...(evidence?.accountContext ?? [])];
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
  const profile = query.data;
  const evidence = profile ? findProviderEvidence(profile.registryKey, profile.name) : undefined;

  const artKind = evidence?.combinedServices ? 'combined' : profile?.kind === 'Fire department' ? 'fire' : 'ems';
  const art = { combined: combinedArt, fire: fireArt, ems: emsArt }[artKind];
  const agencyLabel = evidence?.combinedServices ? 'Fire & EMS department' : profile?.kind;

  useEffect(() => {
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
      {section === 'equipment' ? <div className="pr-detail-wrap">
        <ProviderEquipmentFunding evidence={evidence}>
          <ProviderFootprint key={reference} profile={profile} />
        </ProviderEquipmentFunding>
      </div> : <div className="pr-layout">
        <div className="pr-detail">
          {section === 'overview' && <><ProviderCallBrief evidence={evidence} /><Overview profile={profile} evidence={evidence} /></>}
          {section === 'quality' && <Quality evidence={evidence} />}
          {section === 'operations' && <Operations profile={profile} evidence={evidence} />}
          {section === 'sources' && <Sources profile={profile} evidence={evidence} />}
        </div>
        <div className="pr-section-rail">
          {section !== 'sources' && <ProviderFootprint key={reference} profile={profile} />}
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
