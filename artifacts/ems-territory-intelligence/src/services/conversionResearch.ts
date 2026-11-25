import {DAY_MS,validIsoDay,normalizedValue} from './documentedIntelligence';
import {buildLifecycleTimeline,type LifecycleSample,type LifecycleObservation} from './lifecycleTimeline';
import type {ReviewedSignal,ReviewedEquipmentObservation} from './sharedOpportunityRadar';
export const FAMILIES=['monitors','cpr','ventilators','software'] as const;
export type Family=typeof FAMILIES[number];
const competitors=new Set(['stryker','philips','hamilton','weinmann','draeger','medtronic','mindray','schiller','nihon-kohden','eso','imagetrend']);
export type ConversionStatus='verify-date'|'confirm-equipment'|'mixed-evidence';
export type ConversionRow={key:string;stationId:string;stationName:string;family:Family;status:ConversionStatus;observations:LifecycleObservation[];latest:string;dates:{date:string;kind:string;submissionId:string}[];ambiguousDates:number};
export function buildConversionResearch(sample:LifecycleSample|undefined,equipment:ReviewedEquipmentObservation[],signals:ReviewedSignal[],today:string,days:number,family:Family|'all'){
 const stations=new Map<string,number>(),submissions=new Map<string,number>();
 for(const s of sample?.stations??[])stations.set(s.id,(stations.get(s.id)??0)+1);
 for(const o of sample?.observations??[])submissions.set(o.submissionId,(submissions.get(o.submissionId)??0)+1);
 const groups=new Map<string,LifecycleObservation[]>();let stale=0,withheld=0;
 for(const o of sample?.observations??[]){
  if(stations.get(o.stationId)!==1||submissions.get(o.submissionId)!==1||!validIsoDay(o.observedOn)||o.observedOn>today||!FAMILIES.includes(o.family as Family)){withheld++;continue;}
  if((Date.parse(today)-Date.parse(o.observedOn))/DAY_MS>730){stale++;continue;}
  const key=JSON.stringify([o.stationId,o.family]),rows=groups.get(key)??[];rows.push(o);groups.set(key,rows);
 }
 const lifecycle=buildLifecycleTimeline(sample,[],today),dateByKey=new Map(lifecycle.map(e=>[e.key,e]));
 const rows:ConversionRow[]=[];
 for(const [key,group] of groups){
  const o=group[0],product=o.family as Family;
  if(family!=='all'&&family!==product)continue;
  const named=group.filter(v=>competitors.has(v.maker));if(!named.length)continue;
  const mixed=group.some(v=>v.maker==='zoll');
  const distinct=new Map<string,LifecycleObservation>();
  for(const v of named){const k=JSON.stringify([v.maker,normalizedValue(v.model),normalizedValue(v.apparatus),v.observedOn,v.acquiredOn,v.warrantyEnd,v.serviceEnd,v.sourceUrl]);if(!distinct.has(k))distinct.set(k,v);}
  const observations=[...distinct.values()].sort((a,b)=>b.observedOn.localeCompare(a.observedOn)||a.submissionId.localeCompare(b.submissionId));
  const dates:ConversionRow['dates']=[];let ambiguousDates=0;
  for(const v of observations)for(const kind of ['warranty','service'] as const){
   const e=dateByKey.get('station:'+v.submissionId+':'+kind);if(!e)continue;
   if(e.ambiguous){ambiguousDates++;continue;}
   const delta=(Date.parse(e.date)-Date.parse(today))/DAY_MS;
   // A date is attached only to the same accepted observation, never another device or parent contract.
   if(v.model.trim()&&delta>=0&&delta<=days)dates.push({date:e.date,kind,submissionId:v.submissionId});
  }
  dates.sort((a,b)=>a.date.localeCompare(b.date));
  rows.push({key,stationId:o.stationId,stationName:sample!.stations.find(s=>s.id===o.stationId)?.name??o.stationId,family:product,status:mixed?'mixed-evidence':dates.length?'verify-date':'confirm-equipment',observations,latest:observations[0].observedOn,dates,ambiguousDates});
 }
 const order:Record<ConversionStatus,number>={'verify-date':0,'confirm-equipment':1,'mixed-evidence':2};
 rows.sort((a,b)=>order[a.status]-order[b.status]||(a.dates[0]?.date??'9999-12-31').localeCompare(b.dates[0]?.date??'9999-12-31')||b.latest.localeCompare(a.latest)||a.key.localeCompare(b.key));
 const parentEquipment=equipment.filter(e=>e.vendorId!=='zoll'&&(family==='all'||e.family===family)&&validIsoDay(e.evidence.documentDate)&&e.evidence.documentDate<=today&&(Date.parse(today)-Date.parse(e.evidence.documentDate))/DAY_MS<=730);
 const parentContext=signals.filter(s=>s.kind!=='competitor-equipment'&&validIsoDay(s.evidence.documentDate)&&s.evidence.documentDate<=today&&(Date.parse(today)-Date.parse(s.evidence.documentDate))/DAY_MS<=365);
 return {rows,parentEquipment,parentContext,stale,withheld,stationsChecked:sample?.stations.length??0,stationAvailable:!!sample};
}
