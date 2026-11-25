import type {Agency} from '../types';
import {providerIdentityReady,type ProviderEquipmentKind} from './providerCompetitiveProfile';
import {DAY_MS,validIsoDay,utcDay,normalizedValue} from './documentedIntelligence';
import {buildReviewedRadar,type ReviewedEvidenceRow} from './sharedOpportunityRadar';
import {facilityParents} from './departmentFacilities';
import {buildLifecycleTimeline,type LifecycleSample} from './lifecycleTimeline';
import {reviewedCallPoints} from './preCallPlanning';
import type {OpportunityKind} from './opportunityRadar';
export const AUTHORITY_ROLES=['leadership','clinical','operations','biomedical','procurement','budget','final-approval','other'] as const;
type Role=typeof AUTHORITY_ROLES[number];
export type AuthorityCoverage={agencyId:string;name:string;stateCode:string;complete:boolean;recentReviewed:number;roles:Role[];checkedAt:string};
export type ReviewedCallSample={agencyId:string;started:number;documents?:{rows:ReviewedEvidenceRow[];checkedAt:string};station?:LifecycleSample;authority?:AuthorityCoverage};
type Topic=OpportunityKind|'equipment'|'discovery';
export type CallCandidate={key:string;label:string;kind:Topic;focus?:ProviderEquipmentKind;context:string;sourceUrl:string;scope:'department'|'station'};
const fresh=(s:string,now:number)=>Number.isFinite(Date.parse(s))&&Date.parse(s)<=now&&now-Date.parse(s)<300000;
const recent=(date:string,today:string,days:number)=>validIsoDay(date)&&date<=today&&Date.parse(today)-Date.parse(date)<=days*DAY_MS;
const focusFor=(kind:string):ProviderEquipmentKind|undefined=>{
 switch(kind){
  case 'installed-monitor':case 'monitors':return 'installed-monitor';
  case 'installed-cpr':case 'cpr':return 'installed-cpr';
  case 'installed-ventilator':case 'ventilators':return 'installed-ventilator';
  case 'installed-epcr':case 'installed-cad':case 'installed-billing':return kind;
  default:return undefined;
 }
};
const group=(kind:string,source:string,id:string)=>JSON.stringify([kind.startsWith('procurement-')?'procurement':kind,normalizedValue(source),normalizedValue(id)]);
const named=new Set(['zoll','stryker','philips','hamilton','weinmann','draeger','medtronic','mindray','schiller','nihon-kohden','eso','imagetrend']);
export function buildReviewedCallContext(agency:Agency,directory:Agency[],sample:ReviewedCallSample|undefined,now=Date.now()){
 const candidates:CallCandidate[]=[],roles:Role[]=[];
 const result={candidates,roles,documentsChecked:false,stationsChecked:false,authorityChecked:false,identityReady:providerIdentityReady(agency,directory)};
 if(!result.identityReady||!sample||sample.agencyId!==agency.id||!Number.isFinite(sample.started)||sample.started>now||now-sample.started>=300000)return result;
 const today=utcDay(now);
 if(sample.documents&&fresh(sample.documents.checkedAt,now)){
  const r=buildReviewedRadar(agency,sample.documents.rows,{complete:true,withheld:0},now);
  result.documentsChecked=r.complete;
  if(r.complete){
   const variants=new Map<string,Set<string>>();
   for(const row of sample.documents.rows){const e=row.evidence,k=group(e.kind,e.sourceName,e.sourceRecordId),set=variants.get(k)??new Set<string>();set.add(e.sourceRecordId.trim());variants.set(k,set);}
   const safe=(e:{kind:string;sourceName:string;sourceRecordId:string})=>(variants.get(group(e.kind,e.sourceName,e.sourceRecordId))?.size??0)<=1;
   for(const s of r.signals){
    const e=s.evidence;
    if(s.kind==='competitor-equipment'||!safe(e)||!recent(e.documentDate,today,365))continue;
    if((s.kind==='open-procurement'||s.kind==='contract-renewal')&&(!validIsoDay(s.date)||s.date<today||Date.parse(s.date)-Date.parse(today)>365*DAY_MS))continue;
    candidates.push({key:'document:'+e.factId,label:s.kind.replaceAll('-',' ')+' · '+e.sourceRecordId,kind:s.kind,context:'Reviewed department document '+e.documentDate+' reports: '+e.value+(s.date?' · Published date '+s.date:'')+'. Confirm current scope, amendments and status.',sourceUrl:e.sourceUrl,scope:'department'});
   }
   for(const item of r.equipment){const e=item.evidence,focus=focusFor(e.kind);if(!focus||!safe(e)||!recent(e.documentDate,today,730))continue;
    candidates.push({key:'equipment:'+e.factId,label:'Equipment document · '+e.value,kind:'equipment',focus,context:'Reviewed department equipment observation '+e.documentDate+' reports: '+e.value+'. This does not establish current deployment, quantity or purchase intent.',sourceUrl:e.sourceUrl,scope:'department'});
   }
  }
 }
 const s=sample.station,parent=facilityParents(agency).find(p=>p.source==='NERIS');
 if(s&&parent&&s.agencyId===agency.id&&s.parentId===parent.identifier&&fresh(s.checkedAt,now)&&s.acceptedRowsChecked===s.observations.length){
  const stations=new Map(s.stations.map(v=>[v.id,v])),ids=new Set(s.observations.map(o=>o.submissionId));
  result.stationsChecked=stations.size===s.stations.length&&ids.size===s.observations.length&&s.stations.every(v=>v.stateCode===agency.stateCode)&&s.observations.every(o=>stations.has(o.stationId));
  if(result.stationsChecked){
   const dates=buildLifecycleTimeline(s,[],today);
   for(const o of s.observations){
    const focus=focusFor(o.family);
    if(!focus||!named.has(o.maker)||!recent(o.observedOn,today,730))continue;
    const station=stations.get(o.stationId)!;
    const same=s.observations.filter(v=>v.stationId===o.stationId&&v.family===o.family&&recent(v.observedOn,today,730));
    const mixed=new Set(same.filter(v=>named.has(v.maker)).map(v=>v.maker)).size>1;
    const timing=dates.filter(d=>d.key.startsWith('station:'+o.submissionId+':')&&!d.ambiguous).map(d=>d.kind+' '+d.date).join('; ');
    candidates.push({key:'station:'+o.submissionId,label:(station.name??station.id)+' · '+o.maker+' '+o.model,kind:'equipment',focus,context:'Reviewed dated station observation '+o.observedOn+' · '+(station.name??station.id)+' · '+o.maker+' '+(o.model||'model not stated')+(o.apparatus?' · '+o.apparatus:'')+(timing?' · Reported dates: '+timing:'')+(mixed?' · Multiple manufacturers observed; verify scope.':'')+'. Confirm present use, quantity and decision process.',sourceUrl:o.sourceUrl,scope:'station'});
   }
  }
 }
 const a=sample.authority;
 if(a&&a.agencyId===agency.id&&a.name===agency.name&&a.stateCode===agency.stateCode&&a.complete===true&&fresh(a.checkedAt,now)&&Number.isSafeInteger(a.recentReviewed)&&a.recentReviewed>=0&&a.recentReviewed<=100&&Array.isArray(a.roles)&&a.roles.every(r=>AUTHORITY_ROLES.includes(r))&&new Set(a.roles).size===a.roles.length&&a.roles.length<=a.recentReviewed){
  result.authorityChecked=true;roles.push(...a.roles);
 }
 candidates.sort((a,b)=>a.scope.localeCompare(b.scope)||a.label.localeCompare(b.label)||a.key.localeCompare(b.key));
 return result;
}
export function buildReviewedCallBrief(agency:Agency,candidate:CallCandidate|undefined,roles:Role[],now=Date.now()){
 const p=reviewedCallPoints(candidate?.kind??'discovery',candidate?.focus);
 const roleNote=roles.length?'Separate dated authority evidence exists for: '+roles.map(r=>r.replaceAll('-',' ')).join(', ')+'. Confirm current responsibilities and purchase-specific authority; no person is linked to this equipment or document.':'Decision authority remains unconfirmed; identify the authorized owner.';
 const preparation=candidate?.kind==='open-procurement'?'Check the official solicitation and permitted communication channel before contacting anyone. Do not request nonpublic evaluation information.':'Verify the original evidence, current situation and authorized communication before contact.';
 return {points:p,roleNote,preparation,context:candidate?.context??'Discovery only. No eligible reviewed source selected; do not infer equipment, funding or purchasing intent.',text:['ATLAS | Internal reviewed pre-call research draft',agency.name+' · '+agency.stateCode,'Prepared '+utcDay(now)+' UTC · '+(candidate?.scope??'discovery'),candidate?.context??'No reviewed source selected.',preparation,'Objective: '+p.objective,'Suggested opening: '+p.opening,'Three qualifying questions:',...p.questions.map((q,i)=>(i+1)+'. '+q),'Roles to confirm: '+p.role,roleNote,'Possible objection (hypothetical): '+p.objection,'Suggested response: '+p.response,'Proposed next commitment: '+p.commitment,...(candidate?.sourceUrl?['Submitted source: '+candidate.sourceUrl]:[]),'Internal preparation only. Independently reviewed dated claims are not verified current facts. Do not share private evidence without authorization.'].join('\n')};
}
