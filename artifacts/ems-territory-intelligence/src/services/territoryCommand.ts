import type {Agency} from '../types';
import {buildReviewedAccountPriorities,eligiblePriorityAccounts,type ReviewedSample} from './reviewedAccountPriorities';
import {buildCommercialQueue} from './commercialOpportunityQueue';
import {buildGeographicResearch,type ResolveLocation} from './geographicResearch';
import {providerIdentityReady} from './providerCompetitiveProfile';
import {validIsoDay} from './documentedIntelligence';
export const COMMAND_VIEWS=['overview','priorities','commercial','geography','coverage','followups','plan','activity','competitive','pipeline','leadership','coaching'] as const;
export type CommandView=typeof COMMAND_VIEWS[number];
/** Only selected, unique source-native accounts. Task counts are local workflow, not commercial evidence. */
export function buildTerritoryCommand(agencies:Agency[],selected:string[],samples:ReviewedSample[],resolve:ResolveLocation,today:string,now=Date.now()){
 const ranked=buildReviewedAccountPriorities(agencies,selected,samples,now,'all');
 const commercial=buildCommercialQueue(agencies,selected,samples,now,90);
 const geography=buildGeographicResearch(agencies,selected,samples,resolve,25,now);
 const allowed=new Set(eligiblePriorityAccounts(agencies).filter(a=>providerIdentityReady(a.agency,agencies)).map(a=>a.agency.id));
 const safe=new Set([...commercial.upcoming,...commercial.later,...commercial.funding,...commercial.awards].map(r=>JSON.stringify([r.identityKey,r.signal.signal.evidence.factId])));
 const priorities=ranked.ranked.flatMap(r=>{
  if(!allowed.has(r.agency.id))return [];
  const signals=r.signals.filter(s=>s.signal.kind==='competitor-equipment'||safe.has(JSON.stringify([r.identityKey,s.signal.evidence.factId])));
  return signals.length?[{...r,primary:signals[0],signals}]:[];
 });
 const tasks:{agency:Agency;id:string;action:string;dueDate:string;owner:string;bucket:'overdue'|'today'|'upcoming'|'no-date'}[]=[];
 let withheldTasks=0;
 const scope=ranked.invalidScope?[]:agencies.filter(a=>allowed.has(a.id)&&selected.includes(a.id));
 for(const a of scope){
  const all=[...(a.fieldNotes??[]),...(a.followUpTasks??[])],counts=new Map<string,number>();
  for(const t of all)counts.set(t.id,(counts.get(t.id)??0)+1);
  for(const t of all){
   if(t.followUpStatus==='completed'||!t.nextAction?.trim())continue;
   if(!t.id||counts.get(t.id)!==1){withheldTasks++;continue;}
   const date=validIsoDay(t.dueDate)?t.dueDate:'';
   tasks.push({agency:a,id:t.id,action:t.nextAction,dueDate:date,owner:t.owner??'',bucket:!date?'no-date':date<today?'overdue':date===today?'today':'upcoming'});
  }
 }
 const order={overdue:0,today:1,upcoming:2,'no-date':3};
 tasks.sort((a,b)=>order[a.bucket]-order[b.bucket]||a.dueDate.localeCompare(b.dueDate)||a.agency.name.localeCompare(b.agency.name)||a.id.localeCompare(b.id));
 const countAccounts=(rows:typeof commercial.upcoming)=>new Set(rows.filter(r=>allowed.has(r.agency.id)).map(r=>r.agency.id)).size;
 return {selected:selected.length,eligible:scope.length,checked:ranked.checked,invalidScope:ranked.invalidScope,priorities,urgent:priorities.filter(r=>r.primary.band==='verify-now').length,deadlines:countAccounts(commercial.upcoming),funding:countAccounts(commercial.funding),awards:countAccounts(commercial.awards),competitive:priorities.filter(r=>r.signals.some(s=>s.signal.kind==='competitor-equipment')).length,mapped:geography.located.length,locationGaps:geography.unmapped.length,groups:geography.clusters.filter(g=>g.accounts.length>1).length,ambiguous:commercial.ambiguous,withheldTasks,tasks,overdue:tasks.filter(t=>t.bucket==='overdue').length,today:tasks.filter(t=>t.bucket==='today').length};
}
