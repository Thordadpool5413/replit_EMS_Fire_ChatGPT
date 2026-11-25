import type {Agency} from '../types';
import {sharedAgencyKey} from './sharedEvidence';
import {DAY_MS,validIsoDay,utcDay,normalizedValue} from './documentedIntelligence';
import {buildReviewedRadar,type ReviewedEvidenceRow,type ReviewedSignal} from './sharedOpportunityRadar';
import type {OpportunityKind} from './opportunityRadar';
export const MAX_REVIEW_ACCOUNTS=8;
export const BANDS=['verify-now','verify-soon','plan-research','explore'] as const;
export type Band=typeof BANDS[number];
export type ReviewedSample={agencyId:string;identityKey:string;rows:ReviewedEvidenceRow[];checkedAt:string};
export type RankedSignal={signal:ReviewedSignal;band:Band;days?:number};
const kindOrder:Record<OpportunityKind,number>={'open-procurement':0,'contract-renewal':1,'capital-approved':2,'grant-award':3,'competitor-equipment':4,'awarded-procurement':5};
export function eligiblePriorityAccounts(agencies:Agency[]){
 const ids=new Map<string,number>(),keys=new Map<string,number>();
 for(const a of agencies){ids.set(a.id,(ids.get(a.id)??0)+1);const k=sharedAgencyKey(a);if(k)keys.set(k,(keys.get(k)??0)+1);}
 return agencies.flatMap(agency=>{const identityKey=sharedAgencyKey(agency);return agency.id&&identityKey&&ids.get(agency.id)===1&&keys.get(identityKey)===1&&!agency.registryIdentity?.deactivatedAt&&agency.dataProvenanceTier!=='generated_prospect'?[{agency,identityKey}]:[];});
}
function rank(s:ReviewedSignal,today:string):RankedSignal|undefined{
 const age=(Date.parse(today)-Date.parse(s.evidence.documentDate))/DAY_MS;
 if(!Number.isFinite(age)||age<0)return;
 if(s.kind==='open-procurement'||s.kind==='contract-renewal'){
  if(!validIsoDay(s.date)||age>365)return;
  const days=(Date.parse(s.date)-Date.parse(today))/DAY_MS;if(days<0||days>365)return;
  return {signal:s,days,band:s.kind==='open-procurement'&&days<=14?'verify-now':s.kind==='open-procurement'&&days<=45||s.kind==='contract-renewal'&&days<=90?'verify-soon':'plan-research'};
 }
 if(s.kind==='capital-approved'||s.kind==='grant-award')return age<=365?{signal:s,band:'plan-research'}:undefined;
 if(s.kind==='awarded-procurement'||s.kind==='competitor-equipment')return age<=(s.kind==='competitor-equipment'?730:365)?{signal:s,band:'explore'}:undefined;
 return undefined;
}
function compare(a:RankedSignal,b:RankedSignal){return BANDS.indexOf(a.band)-BANDS.indexOf(b.band)||(a.days??Infinity)-(b.days??Infinity)||kindOrder[a.signal.kind]-kindOrder[b.signal.kind]||b.signal.evidence.documentDate.localeCompare(a.signal.evidence.documentDate)||a.signal.evidence.factId.localeCompare(b.signal.evidence.factId);}
export function buildReviewedAccountPriorities(agencies:Agency[],selected:string[],samples:ReviewedSample[],now=Date.now(),kind:OpportunityKind|'all'='all'){
 const eligible=new Map(eligiblePriorityAccounts(agencies).map(a=>[a.agency.id,a]));
 const today=utcDay(now),unique=[...new Set(selected)];
 const ranked:{agency:Agency;identityKey:string;primary:RankedSignal;signals:RankedSignal[]}[]=[];
 const gaps:{id:string;name:string;status:'identity-excluded'|'unavailable'|'no-signal'|'filtered'}[]=[];
 if(unique.length>MAX_REVIEW_ACCOUNTS||selected.length!==unique.length)return {ranked,gaps,invalidScope:true,checked:0};
 let checked=0;
 for(const id of unique){
  const a=eligible.get(id);if(!a){gaps.push({id,name:id,status:'identity-excluded'});continue;}
  const matches=samples.filter(s=>s.agencyId===id);
  const sample=matches[0],time=Date.parse(sample?.checkedAt??'');
  if(matches.length!==1||sample.identityKey!==a.identityKey||!Number.isFinite(time)||time>now||now-time>=300000){gaps.push({id,name:a.agency.name,status:'unavailable'});continue;}
  const r=buildReviewedRadar(a.agency,sample.rows,{complete:true,withheld:0},now);
  if(!r.complete){gaps.push({id,name:a.agency.name,status:'unavailable'});continue;}
  checked++;
  const distinct=new Map<string,RankedSignal>();
  for(const s of r.signals){
   const v=rank(s,today);if(!v)continue;
   const k=JSON.stringify([s.kind,normalizedValue(s.evidence.sourceName),normalizedValue(s.evidence.sourceRecordId),s.evidence.documentDate,normalizedValue(s.evidence.value),s.date??'']);
   const old=distinct.get(k);if(!old||compare(v,old)<0)distinct.set(k,v);
  }
  const all=[...distinct.values()],signals=all.filter(s=>kind==='all'||s.signal.kind===kind).sort(compare);
  if(!signals.length){gaps.push({id,name:a.agency.name,status:all.length?'filtered':'no-signal'});continue;}
  ranked.push({...a,primary:signals[0],signals});
 }
 ranked.sort((a,b)=>compare(a.primary,b.primary)||a.agency.name.localeCompare(b.agency.name)||a.identityKey.localeCompare(b.identityKey));
 return {ranked,gaps,invalidScope:false,checked};
}
