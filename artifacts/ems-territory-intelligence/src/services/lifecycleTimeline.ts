import {validIsoDay,DAY_MS} from './documentedIntelligence';
import type {ReviewedSignal} from './sharedOpportunityRadar';
export type LifecycleObservation={stationId:string;submissionId:string;family:string;maker:string;model:string;apparatus:string;observedOn:string;basis:string;sourceUrl:string;acquiredOn?:string;warrantyEnd?:string;serviceEnd?:string};
export type LifecycleSample={agencyId:string;parentId:string;stations:{id:string;name:string|null;stateCode:string}[];observations:LifecycleObservation[];acceptedRowsChecked:number;checkedAt:string};
export type LifecycleEvent={key:string;scope:'department'|'station';kind:'contract'|'solicitation'|'acquisition'|'warranty'|'service';date:string;label:string;observedOn:string;sourceUrl:string;stationId?:string;family?:string;ambiguous:boolean};
export function buildLifecycleTimeline(sample:LifecycleSample|undefined,signals:ReviewedSignal[],today:string){
 const events:LifecycleEvent[]=[];
 for(const s of signals){
  if((s.kind!=='contract-renewal'&&s.kind!=='open-procurement')||!validIsoDay(s.date)||!validIsoDay(s.evidence.documentDate)||s.evidence.documentDate>today)continue;
  events.push({key:'parent:'+s.evidence.factId,scope:'department',kind:s.kind==='contract-renewal'?'contract':'solicitation',date:s.date,label:s.kind==='contract-renewal'?'Documented agreement end':'Published response date',observedOn:s.evidence.documentDate,sourceUrl:s.evidence.sourceUrl,ambiguous:false});
 }
 const stations=new Map<string,NonNullable<LifecycleSample>['stations'][number]>();
 const duplicates=new Set<string>();
 for(const s of sample?.stations??[]){if(stations.has(s.id))duplicates.add(s.id);stations.set(s.id,s);}
 const ids=new Map<string,number>();
 for(const o of sample?.observations??[])ids.set(o.submissionId,(ids.get(o.submissionId)??0)+1);
 const groups=new Map<string,Set<string>>();
 const stationEvents:{event:LifecycleEvent;group:string}[]=[];
 for(const o of sample?.observations??[]){
  const station=stations.get(o.stationId);
  if(!station||duplicates.has(o.stationId)||ids.get(o.submissionId)!==1||!validIsoDay(o.observedOn)||o.observedOn>today)continue;
  for(const [field,kind] of [['acquiredOn','acquisition'],['warrantyEnd','warranty'],['serviceEnd','service']] as const){
   const date=o[field];if(!validIsoDay(date)||(kind==='acquisition'&&date>o.observedOn))continue;
   // Model/apparatus group is not an asset ID. Different dates are separate observations and ambiguity requires research.
   const group=JSON.stringify([o.stationId,o.family,o.maker,o.model.trim().toLowerCase(),o.apparatus.trim().toLowerCase(),kind]);
   const dates=groups.get(group)??new Set<string>();dates.add(date);groups.set(group,dates);
   stationEvents.push({group,event:{key:'station:'+o.submissionId+':'+kind,scope:'station',kind,date,label:[station.name??station.id,o.maker,o.model,o.apparatus].filter(Boolean).join(' · '),observedOn:o.observedOn,sourceUrl:o.sourceUrl,stationId:o.stationId,family:o.family,ambiguous:false}});
  }
 }
 for(const {event,group} of stationEvents)events.push({...event,ambiguous:(groups.get(group)?.size??0)>1});
 return events.sort((a,b)=>a.date.localeCompare(b.date)||a.key.localeCompare(b.key));
}
export function lifecycleWindow(e:LifecycleEvent,today:string,days:number){
 const delta=(Date.parse(e.date)-Date.parse(today))/DAY_MS;
 return e.ambiguous?'ambiguous':delta<0?'history':delta<=days?'within-window':'later';
}
