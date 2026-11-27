import { formatProviderMetric } from '../../services/providerCardIntelligence';
import { useQuery } from '@tanstack/react-query';
import { Activity, Ambulance, ArrowUpRight, Building2, CalendarDays, Flame, HeartPulse, MapPin, Users } from 'lucide-react';
import { departmentAliases, departmentProfile, isCombinedDepartment, profileSourceKey } from '../../services/departmentIdentity';
import { providerProfileHref, type ProviderProfileRef } from '../../navigation/providerProfileUrl';
import { findProviderEvidenceByConfirmedKeys } from '../../data/providerProfileEvidence';
import { loadUsfaProfileOperations } from '../../services/usfaProfileOperations';
import { loadFloridaRoster, type FloridaEmsLicense } from '../../services/floridaEmsRoster';
import { loadNerisStateCatalog } from '../../services/nerisStationCatalog';
const fireArt = new URL('../../assets/provider-fire-art.webp', import.meta.url).href;
const emsArt = new URL('../../assets/provider-ems-art.webp', import.meta.url).href;
const combinedArt = new URL('../../assets/provider-station-art.webp', import.meta.url).href;

type Props = { record: ProviderProfileRef; name: string; location?: string; license?: FloridaEmsLicense; overview?: boolean; serviceLevel?:string|null; reportedStations?:number|null; reportDate?:string|null };
const levels: Record<string,string> = {'ALS/T':'ALS transport','ALS/N':'ALS nontransport','BLS/T':'BLS transport','BLS/N':'BLS nontransport'};

export function ServiceBrief({record,name,location,license,overview,serviceLevel,reportedStations,reportDate}: Props) {
  const canonical = departmentProfile(record);
  const key = profileSourceKey(canonical);
  const state = record.state;
  const aliases = departmentAliases(state,key);
  const evidence = findProviderEvidenceByConfirmedKeys([key]);
  const isFire = key.startsWith('FDID:') || key.startsWith('NERIS:');
  const combined = isCombinedDepartment(key) || evidence?.combinedServices;
  const neris = (key.startsWith('NERIS:') ? key : aliases.find(k=>k.startsWith('NERIS:')))?.slice(6);
  const flLicense = state === 'FL' && (key.startsWith('STATE-EMS:') ? key : aliases.find(k=>k.startsWith('STATE-EMS:FL:license:')))?.split(':').pop();
  const operations = useQuery({queryKey:['usfa-profile-operations',state,key],queryFn:()=>loadUsfaProfileOperations(state,key),enabled:key.startsWith('FDID:')});
  const stations = useQuery({queryKey:['brief-neris',state],queryFn:()=>loadNerisStateCatalog(state),enabled:!!neris});
  const roster = useQuery({queryKey:['brief-license','FL'],queryFn:loadFloridaRoster,enabled:!!flLicense && !license});
  const lic = license ?? roster.data?.records.find(r=>r.identifier===flLicense);
  const op = operations.data;
  const n = stations.data?.departments.find(r=>r.id===neris);
  const count = n?.reportedStationCount ?? reportedStations ?? op?.metrics.find(m=>m.label==='Fire stations')?.value;
  const staff = op?.metrics.filter(m=>m.value>0 && /firefighters/.test(m.label)).sort((a,b)=>b.value-a.value)[0];
  const metric = evidence?.operations?.[0];
  const gear = evidence?.equipment?.find(row=>row.model);
  const chief = evidence?.contacts?.find(row=>row.name);
  const npi = (key.startsWith('NPI:') ? key : aliases.find(k=>k.startsWith('NPI:')))?.slice(4);
  const prefix = npi?.slice(0,2);
  const payments = useQuery({
    queryKey:['brief-medicaid',prefix], enabled:!!prefix,
    queryFn: async () => {
      const response = await fetch((import.meta.env?.BASE_URL ?? '/')+'data/medicaid/'+prefix+'.json');
      if (!response.ok) throw Error('Payment records unavailable');
      return await response.json() as Record<string,Record<string,[number,number]>>;
    },
  });
  const payment = npi && Object.entries(payments.data?.[npi] ?? {}).sort(([a],[b])=>b.localeCompare(a))[0];
  const facts = [
    count != null && {icon:Building2,value:String(count),label:'Reported stations',source:n?.reportedStationCount!=null?'NERIS · '+stations.data?.retrievedAt.slice(0,10):reportedStations!=null?(reportDate ?? 'Source roster'):'USFA · '+op?.retrievedAt},
    metric && {icon:Activity,value:formatProviderMetric(metric),label:metric.label,source:metric.reportingPeriod ?? metric.source.date},
    lic && {icon:HeartPulse,value:levels[lic.serviceLevel] ?? lic.serviceLevel,label:'Licensed service',source:'Florida EMS · '+lic.identifier},
    payment && {icon:Activity,value:payment[1][0].toLocaleString(),label:'Medicaid claim lines',source:'HHS · '+payment[0]},
    serviceLevel && !lic && {icon:HeartPulse,value:serviceLevel,label:'Reported service level',source:reportDate ?? 'EMS roster'},
    evidence?.quality?.[0] && {icon:HeartPulse,value:formatProviderMetric(evidence.quality[0]),label:evidence.quality[0].label,source:evidence.quality[0].reportingPeriod ?? evidence.quality[0].source.date},
    evidence?.funding?.[0] && {icon:CalendarDays,value:evidence.funding[0].amount!=null?'$'+evidence.funding[0].amount.toLocaleString():evidence.funding[0].title,label:'Funding · '+evidence.funding[0].status,source:evidence.funding[0].source.date},
    staff && {icon:Users,value:staff.value.toLocaleString(),label:staff.label,source:'USFA · '+op?.retrievedAt},
    gear && {icon:HeartPulse,value:gear.model!,label:gear.status,source:gear.source.date},
    chief && {icon:Users,value:chief.name!,label:chief.role,source:chief.source.date},
    lic && {icon:CalendarDays,value:lic.expiresAt,label:'License expiration',source:'Florida EMS · '+lic.identifier},
  ].filter(item=>!!item);
  const mark = isFire ? <Flame size={17}/> : <Ambulance size={17}/>;
  const label = combined?'Fire & EMS':isFire?'Fire department':'EMS provider';
  const href=providerProfileHref(canonical);
  return <div className={'service-brief'+(overview?' expanded':'')}>
    {!overview && <a className="sb-cover" href={href} aria-label={'Open provider profile for '+name}>
      <img alt="" src={combined?combinedArt:isFire?fireArt:emsArt} loading="lazy"/>
      <span className="sb-category">{mark}{label}</span><strong>{name}</strong>
      {location && <small><MapPin size={14}/>{location}</small>}
    </a>}
    {overview && <h2>Department at a glance</h2>}
    {facts.length>0 && <div className="sb-facts">{facts.slice(0,overview?7:3).map(f=><div key={f.label}>
      <f.icon size={17} aria-hidden="true"/><strong>{f.value}</strong><span>{f.label}</span><small>{f.source}</small>
    </div>)}</div>}
    {!overview && <a className="sb-open" href={href}>View department profile <ArrowUpRight size={16}/></a>}
    {overview && !facts.length && <p>{location} · {label} · {record.id}</p>}
  </div>;
}
