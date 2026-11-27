import { departmentAliases } from '../../services/departmentIdentity';
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2 } from 'lucide-react';
import { findProviderEvidence, linkedBillingOrganization, linkedFireDepartment, providerEvidenceNerisId, type ProviderEvidence } from '../../data/providerProfileEvidence';
import type { ProviderProfileRef } from '../../navigation/providerProfileUrl';
import { loadPublicProviderProfile } from '../../services/publicProviderProfile';
import { loadUsfaProfileOperations } from '../../services/usfaProfileOperations';
import { MedicaidAmbulanceTotals } from '../MedicaidAmbulanceTotals';
import { ProviderEquipmentFunding } from './ProviderEquipmentFunding';
import { ProviderPeople, ProviderStations } from './ProviderPublicSources';
import { ProviderMetrics } from './ProviderMetrics';

function MatchedRecord({ record, title }: { record: ProviderProfileRef; title: string }) {
  const query = useQuery({
    queryKey: ['public-provider-profile', [record.state, record.source, record.id].join('/')],
    queryFn: async () => (await loadPublicProviderProfile(record)) ?? null,
    retry: false,
  });
  const profile = query.data;
  const fire = record.id.startsWith('usfa:') ? record.id.replace('usfa:', 'FDID:') : undefined;
  const staffing = useQuery({
    queryKey: ['usfa-profile-operations', record.state, fire],
    queryFn: () => fire ? loadUsfaProfileOperations(record.state, fire) : null,
    enabled: Boolean(fire),
  });
  const facts = profile && findProviderEvidence(profile.registryKey, profile.name);
  return <section className="pr-panel">
    <h3 className="pr-icon-heading"><Building2 size={18} aria-hidden="true" />{title}</h3>
    {query.isPending ? <p role="status">Loading matched record…</p> : query.isError ? <button onClick={() => void query.refetch()}>Retry record</button> :
      profile ? <><strong>{profile.name}</strong><p>{[profile.address ?? profile.recordedAddress, profile.city, profile.stateCode].filter(Boolean).join(' · ')}</p>
        <small>{profile.source.name} · {profile.identifier} · {profile.source.date}</small>
        {profile.reportedStationCount != null && <p>{profile.reportedStationCount} reported stations</p>}
        {record.source === 'neris' && <ProviderStations profile={profile} evidence={facts ?? undefined} />}
      </> : <p>Registry details unavailable for {record.id}.</p>}
    {staffing.data && <><small>USFA staffing and facilities · {staffing.data.retrievedAt}</small><dl className="pr-metrics">{staffing.data.metrics.map(row => <div key={row.label}><dt>{row.label}</dt><dd>{row.value.toLocaleString()}</dd></div>)}</dl></>}
    {record.id.startsWith('nppes:') && <MedicaidAmbulanceTotals npi={record.id.slice(6)} />}
    {(facts?.equipment?.length || facts?.funding?.length) ? <ProviderEquipmentFunding evidence={facts} showProfileSources={false} /> : null}
    {facts?.contacts?.length ? <ProviderPeople evidence={facts} /> : null}
    {facts?.quality?.length ? <ProviderMetrics metrics={facts.quality} /> : null}
  </section>;
}

export function InlineAgencyRecords({ state, registryKey, evidence }: { state: string; registryKey?: string; evidence?: ProviderEvidence }) {
  const fire = linkedFireDepartment(registryKey, evidence);
  const npi = linkedBillingOrganization(registryKey, evidence);
  const neris = providerEvidenceNerisId(evidence);
  const records = new Map<string,{record:ProviderProfileRef;title:string}>();
  const add = (source:ProviderProfileRef['source'], id:string, title:string) =>
    records.set(source+'/'+id,{record:{state,source,id},title});
  if (fire && fire !== registryKey) add('registry','usfa:'+fire.slice(5),'Matched fire department');
  if (npi && 'NPI:'+npi !== registryKey) add('registry','nppes:'+npi,'Matched billing organization');
  if (neris && 'NERIS:'+neris !== registryKey) add('neris',neris,'Matched station registry');
  for (const alias of departmentAliases(state,registryKey)) {
    if (alias.startsWith('NERIS:')) add('neris',alias.slice(6),'Matched station registry');
    else if (alias.startsWith('NPI:')) add('registry','nppes:'+alias.slice(4),'Matched billing organization');
    else if (alias.startsWith('STATE-EMS:')) add('state-ems',alias.split(':')[3],'EMS license or agency record');
    else add('regional-ems',alias,'Regional EMS record');
  }
  return <>{[...records].map(([key,props])=><MatchedRecord key={key} {...props}/>)}</>;
}
