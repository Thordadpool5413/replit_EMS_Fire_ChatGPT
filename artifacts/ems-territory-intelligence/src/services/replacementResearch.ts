import type {Agency} from '../types';
import {facilityParents} from './departmentFacilities';
import {providerIdentityReady,type ProviderEquipmentKind} from './providerCompetitiveProfile';
import {buildLifecycleTimeline,type LifecycleSample,type LifecycleEvent,type LifecycleObservation} from './lifecycleTimeline';
import {DAY_MS,validIsoDay,utcDay,normalizedValue} from './documentedIntelligence';
import {reviewedCallPoints} from './preCallPlanning';
export const REPLACEMENT_WINDOWS=[30,90,180,365] as const;
export type ReplacementWindow=typeof REPLACEMENT_WINDOWS[number];
export const REPLACEMENT_FAMILIES=['monitors','cpr','ventilators','software'] as const;
export type ReplacementFamily=typeof REPLACEMENT_FAMILIES[number];
export type ReplacementStatus='verify-upcoming'|'verify-past'|'reconcile'|'date-gap'|'later';
const makers=new Set(['zoll','stryker','philips','hamilton','weinmann','draeger','medtronic','mindray','schiller','nihon-kohden','eso','imagetrend','other','unknown']);
const fresh=(value:string,now:number)=>Number.isFinite(Date.parse(value))&&Date.parse(value)<=now&&now-Date.parse(value)<300000;
const bounded=(v:unknown,n:number):v is string=>typeof v==='string'&&v.length<=n;
const day=(v:unknown):v is string=>validIsoDay(v)&&v>='1900-01-01'&&v<='2100-12-31';
function sourceValid(o:LifecycleObservation){
 if(o.basis==='direct-observation')return o.sourceUrl==='';
 if(o.basis!=='public-document'||!bounded(o.sourceUrl,1500))return false;
 try{const u=new URL(o.sourceUrl);return u.protocol==='https:'&&!!u.hostname&&!u.username&&!u.password&&!u.hash&&(!u.port||u.port==='443');}catch{return false;}
}
/** Require the complete independently accepted response from the existing authenticated station endpoint. */
export function acceptedLifecycleSample(agency:Agency,directory:Agency[],sample:LifecycleSample|undefined,started:number,now=Date.now()):LifecycleSample|undefined{
 if(!Number.isFinite(now)||!Number.isFinite(started)||started>now||now-started>=300000||!providerIdentityReady(agency,directory)||!sample)return;
 const parent=facilityParents(agency).find(p=>p.source==='NERIS');
 if(!parent||sample.agencyId!==agency.id||sample.parentId!==parent.identifier||!fresh(sample.checkedAt,now)||!Array.isArray(sample.stations)||!Array.isArray(sample.observations)||sample.stations.length>1000||sample.observations.length>2000||sample.acceptedRowsChecked!==sample.observations.length)return;
 const stations=new Set<string>(),ids=new Set<string>(),today=utcDay(now);
 for(const s of sample.stations){
  if(!s||!bounded(s.id,14)||!/^[-A-Z0-9]{1,14}$/.test(s.id)||stations.has(s.id)||s.stateCode!==agency.stateCode||!(s.name===null||bounded(s.name,500)))return;
  stations.add(s.id);
 }
 for(const o of sample.observations){
  if(!o||!stations.has(o.stationId)||!bounded(o.submissionId,100)||!o.submissionId.trim()||ids.has(o.submissionId)||!REPLACEMENT_FAMILIES.some(f=>f===o.family)||!makers.has(o.maker)||!bounded(o.model,120)||!bounded(o.apparatus,120)||!day(o.observedOn)||o.observedOn>today||!sourceValid(o))return;
  if(o.acquiredOn!==undefined&&(!day(o.acquiredOn)||o.acquiredOn>o.observedOn))return;
  for(const d of [o.warrantyEnd,o.serviceEnd])if(d!==undefined&&(!day(d)||o.acquiredOn&&d<o.acquiredOn))return;
  ids.add(o.submissionId);
 }
 return sample;
}
const groupKey=(o:LifecycleObservation)=>JSON.stringify([o.stationId,o.family,o.maker,normalizedValue(o.model),normalizedValue(o.apparatus)]);
const focus:Partial<Record<ReplacementFamily,ProviderEquipmentKind>>={monitors:'installed-monitor',cpr:'installed-cpr',ventilators:'installed-ventilator'};
export type ReplacementRow={key:string;stationId:string;stationName:string;family:ReplacementFamily;maker:string;model:string;apparatus:string;latest:string;status:ReplacementStatus;observations:LifecycleObservation[];events:LifecycleEvent[];nextDate?:string;preparation:ReturnType<typeof reviewedCallPoints>};
/** A group is a research scope, not a unique asset. Dates never become expected replacement dates. */
export function buildReplacementResearch(agency:Agency,directory:Agency[],sample:LifecycleSample|undefined,started:number,window:ReplacementWindow,now=Date.now()){
 const accepted=REPLACEMENT_WINDOWS.includes(window)?acceptedLifecycleSample(agency,directory,sample,started,now):undefined;
 const rows:ReplacementRow[]=[];
 if(!accepted)return {available:false,rows,stations:0,observations:0,stale:0,upcoming:0,past:0,gaps:0,ambiguous:0};
 const today=utcDay(now),timeline=buildLifecycleTimeline(accepted,[],today);
 const groups=new Map<string,LifecycleObservation[]>();let stale=0;
 for(const o of accepted.observations){
  if(Date.parse(today)-Date.parse(o.observedOn)>730*DAY_MS){stale++;continue;}
  const k=groupKey(o),g=groups.get(k)??[];g.push(o);groups.set(k,g);
 }
 for(const [key,observations] of groups){
  observations.sort((a,b)=>b.observedOn.localeCompare(a.observedOn)||a.submissionId.localeCompare(b.submissionId));
  const o=observations[0],family=o.family as ReplacementFamily;
  const eventKeys=new Set(observations.flatMap(v=>['acquisition','warranty','service'].map(k=>'station:'+v.submissionId+':'+k)));
  const events=timeline.filter(e=>eventKeys.has(e.key)),coverage=events.filter(e=>e.kind!=='acquisition');
  const future=coverage.filter(e=>e.date>=today&&Date.parse(e.date)-Date.parse(today)<=window*DAY_MS);
  const past=coverage.filter(e=>e.date<today);
  const ambiguous=events.some(e=>e.ambiguous);
  const status:ReplacementStatus=ambiguous?'reconcile':!o.model.trim()||o.maker==='unknown'||o.maker==='other'?'date-gap':future.length?'verify-upcoming':past.length?'verify-past':coverage.length?'later':'date-gap';
  rows.push({key,stationId:o.stationId,stationName:accepted.stations.find(s=>s.id===o.stationId)?.name??o.stationId,family,maker:o.maker,model:o.model,apparatus:o.apparatus,latest:o.observedOn,status,observations,events,nextDate:status==='verify-upcoming'?future[0].date:undefined,preparation:reviewedCallPoints('equipment',focus[family])});
 }
 const order:Record<ReplacementStatus,number>={'verify-upcoming':0,'verify-past':1,reconcile:2,'date-gap':3,later:4};
 rows.sort((a,b)=>order[a.status]-order[b.status]||(a.nextDate??'9999-12-31').localeCompare(b.nextDate??'9999-12-31')||a.key.localeCompare(b.key));
 return {available:true,rows,stations:accepted.stations.length,observations:accepted.observations.length,stale,upcoming:rows.filter(r=>r.status==='verify-upcoming').length,past:rows.filter(r=>r.status==='verify-past').length,gaps:rows.filter(r=>r.status==='date-gap').length,ambiguous:rows.filter(r=>r.status==='reconcile').length};
}
