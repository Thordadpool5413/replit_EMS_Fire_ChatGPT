import type {Agency} from '../types';
import {sharedAgencyKey} from './sharedEvidence';
import type {ReviewedRadarResult,ReviewedSignal} from './sharedOpportunityRadar';
import {classifyStationSample,type StationSample} from './stationCompetitiveMap';
import {validIsoDay} from './documentedIntelligence';
export type ParentDocumentSample={agencyId:string;agencyKey:string;result:ReviewedRadarResult};
export type ResearchPriority='deadline'|'funding'|'equipment-check'|'award-followup'|'research-gap';
const rank:Record<ResearchPriority,number>={deadline:0,funding:1,'equipment-check':2,'award-followup':3,'research-gap':4};
export function buildStationOpportunityQueue(agencies:Agency[],samples:StationSample[],documents:ParentDocumentSample[],family:string,days:number,today:string){
 const map=classifyStationSample(samples,family,days,today);
 const parentCounts=new Map<string,number>();
 for(const s of samples)parentCounts.set(s.parentId,(parentCounts.get(s.parentId)??0)+1);
 const keys=new Map<string,number>();
 for(const a of agencies){const key=sharedAgencyKey(a);if(key)keys.set(key,(keys.get(key)??0)+1);}
 const rows=samples.flatMap(s=>{
  const matches=agencies.filter(a=>a.id===s.agencyId);if(matches.length!==1||parentCounts.get(s.parentId)!==1)return [];
  const agency=matches[0],key=sharedAgencyKey(agency);
  const matching=documents.filter(d=>d.agencyId===agency.id&&d.agencyKey===key);
  const review=key&&keys.get(key)===1&&matching.length===1&&matching[0].result.complete?matching[0].result:undefined;
  // Preserve the parent grain. No document is assumed to describe a particular station or product.
  const signals=(review?.signals??[]).filter(r=>r.evidence.agencyKey===key&&r.evidence.stateCode===agency.stateCode&&r.kind!=='competitor-equipment'&&validIsoDay(r.evidence.documentDate)&&r.evidence.documentDate<=today);
  const deadlines=signals.filter(r=>(r.kind==='open-procurement'||r.kind==='contract-renewal')&&validIsoDay(r.date)&&r.date>=today).sort((a,b)=>a.date!.localeCompare(b.date!));
  const funding=signals.filter(r=>r.kind==='grant-award'||r.kind==='capital-approved');
  const awards=signals.filter(r=>r.kind==='awarded-procurement');
  const stationRows=map.rows.filter(r=>r.agencyId===agency.id&&r.parentId===s.parentId);
  const competitors=stationRows.filter(r=>r.presence==='competitor'||r.presence==='mixed');
  const unknown=stationRows.filter(r=>r.presence==='unknown').length;
  const priority:ResearchPriority=deadlines.length?'deadline':funding.length?'funding':competitors.length?'equipment-check':awards.length?'award-followup':'research-gap';
  const seen=new Set<string>();const distinct:ReviewedSignal[]=[];
  for(const item of [...deadlines,...funding,...awards]){
   const id=[item.kind,item.evidence.sourceName,item.evidence.sourceRecordId].join('|');if(seen.has(id))continue;seen.add(id);distinct.push(item);
  }
  return [{agency,parentId:s.parentId,priority,deadline:deadlines[0]?.date,documentsAvailable:!!review,signals:distinct,stations:stationRows.length,unknown,competitors}];
 });
 rows.sort((a,b)=>rank[a.priority]-rank[b.priority]||(a.deadline??'9999-12-31').localeCompare(b.deadline??'9999-12-31')||a.agency.name.localeCompare(b.agency.name));
 return {rows,withheld:samples.length-rows.length,duplicateStations:map.ambiguous};
}
