import type {Agency} from '../types';
import {normalizedValue,utcDay} from './documentedIntelligence';
import {buildReviewedAccountPriorities,type ReviewedSample,type RankedSignal} from './reviewedAccountPriorities';
import type {SharedEvidence} from './sharedEvidence';
export type CommercialLane='deadline'|'funding'|'award';
export type CommercialRow={agency:Agency;identityKey:string;signal:RankedSignal;lane:CommercialLane};
function recordGroup(e:SharedEvidence){
 const group=e.kind.startsWith('procurement-')?'procurement':e.kind;
 return JSON.stringify([group,normalizedValue(e.sourceName),normalizedValue(e.sourceRecordId)]);
}
/** Compare independently reviewed documents, never link a grant to a purchase or sum awards. */
export function buildCommercialQueue(agencies:Agency[],selected:string[],samples:ReviewedSample[],now=Date.now(),windowDays=90){
 const result=buildReviewedAccountPriorities(agencies,selected,samples,now,'all');
 const rows:CommercialRow[]=[];let ambiguous=0;
 const seen=new Set<string>();
 for(const account of result.ranked){
  const sample=samples.find(s=>s.agencyId===account.agency.id&&s.identityKey===account.identityKey);
  const variants=new Map<string,Set<string>>();
  // Check all raw review rows, including pending and closure records, not just positive signals.
  for(const r of sample?.rows??[]){
   const e=r.evidence,k=recordGroup(e),ids=variants.get(k)??new Set<string>();
   ids.add(e.sourceRecordId.trim());variants.set(k,ids);
  }
  for(const signal of account.signals){
   const s=signal.signal;
   if(s.kind==='competitor-equipment')continue;
   const group=recordGroup(s.evidence);
   if((variants.get(group)?.size??0)>1){ambiguous++;continue;}
   const lane:CommercialLane=s.kind==='open-procurement'||s.kind==='contract-renewal'?'deadline':s.kind==='grant-award'||s.kind==='capital-approved'?'funding':'award';
   const key=JSON.stringify([account.identityKey,group,s.kind,s.evidence.documentDate,normalizedValue(s.evidence.value),s.date??'']);
   if(seen.has(key))continue;seen.add(key);
   rows.push({agency:account.agency,identityKey:account.identityKey,signal,lane});
  }
 }
 const lanes:Record<CommercialLane,CommercialRow[]>={deadline:[],funding:[],award:[]};
 for(const row of rows)lanes[row.lane].push(row);
 const date=(r:CommercialRow)=>r.signal.signal.date??'9999-12-31';
 const byDocument=(a:CommercialRow,b:CommercialRow)=>b.signal.signal.evidence.documentDate.localeCompare(a.signal.signal.evidence.documentDate)||a.agency.name.localeCompare(b.agency.name)||a.signal.signal.evidence.factId.localeCompare(b.signal.signal.evidence.factId);
 lanes.deadline.sort((a,b)=>date(a).localeCompare(date(b))||(a.signal.signal.kind==='open-procurement'?0:1)-(b.signal.signal.kind==='open-procurement'?0:1)||byDocument(a,b));
 lanes.funding.sort(byDocument);lanes.award.sort(byDocument);
 const upcoming=lanes.deadline.filter(r=>r.signal.days!==undefined&&r.signal.days<=windowDays),later=lanes.deadline.filter(r=>r.signal.days!==undefined&&r.signal.days>windowDays);
 const accountsWithRecords=new Set(rows.map(r=>r.agency.id)).size;
 return {asOf:utcDay(now),checked:result.checked,selected:selected.length,invalidScope:result.invalidScope,accountsWithRecords,ambiguous,upcoming,later,funding:lanes.funding,awards:lanes.award,gaps:result.gaps.filter(g=>g.status!=='filtered')};
}
