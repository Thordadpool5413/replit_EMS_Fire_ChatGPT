import type {Agency} from '../types';
import {eligiblePriorityAccounts,MAX_REVIEW_ACCOUNTS,type ReviewedSample} from './reviewedAccountPriorities';
import {providerIdentityReady,PROVIDER_EQUIPMENT_KINDS,type ProviderEquipmentKind} from './providerCompetitiveProfile';
import {buildReviewedRadar,type ReviewedEquipmentObservation} from './sharedOpportunityRadar';
import {buildCommercialQueue,type CommercialRow} from './commercialOpportunityQueue';
import {normalizedValue,validIsoDay,utcDay,DAY_MS} from './documentedIntelligence';
import {reviewedCallPoints} from './preCallPlanning';

export const DISPLACEMENT_WINDOWS=[90,180,365] as const;
export type DisplacementWindow=typeof DISPLACEMENT_WINDOWS[number];
const fresh=(date:string,now:number)=>Number.isFinite(Date.parse(date))&&Date.parse(date)<=now&&now-Date.parse(date)<300000;
const recordKey=(e:{kind:string;sourceName:string;sourceRecordId:string})=>JSON.stringify([e.kind,normalizedValue(e.sourceName),normalizedValue(e.sourceRecordId)]);
const isEquipment=(kind:string):kind is ProviderEquipmentKind=>PROVIDER_EQUIPMENT_KINDS.some(k=>k===kind);
export type CompetitiveResearchRow={key:string;agency:Agency;identityKey:string;kind:ProviderEquipmentKind;observations:ReviewedEquipmentObservation[];preparation:ReturnType<typeof reviewedCallPoints>};
export type CompetitiveContext={agency:Agency;identityKey:string;status:'review-unavailable'|'no-eligible-competitor'|'competitor-observed';rows:CompetitiveResearchRow[];dates:CommercialRow[];funding:CommercialRow[];awards:CommercialRow[];withheld:number};
/** Separate source-backed equipment observations from department commercial context. Never infer a relationship between documents. */
export function buildCompetitiveDisplacement(agencies:Agency[],selected:string[],samples:ReviewedSample[],started:number,window:DisplacementWindow,now=Date.now()){
 const active=Number.isFinite(now)&&Number.isFinite(started)&&started<=now&&now-started<300000&&selected.length<=MAX_REVIEW_ACCOUNTS&&selected.length===new Set(selected).size&&DISPLACEMENT_WINDOWS.includes(window);
 const accounts:CompetitiveContext[]=[];
 if(!active)return {active,selected:selected.length,eligible:0,checked:0,accounts,rows:[] as CompetitiveResearchRow[],withheld:0,competitorAccounts:0,datedContextAccounts:0};
 const commercial=buildCommercialQueue(agencies,selected,samples,now,window),today=utcDay(now);
 for(const a of eligiblePriorityAccounts(agencies)){
  if(!selected.includes(a.agency.id)||!providerIdentityReady(a.agency,agencies))continue;
  const found=samples.filter(s=>s.agencyId===a.agency.id),s=found[0];
  const review=found.length===1&&s.identityKey===a.identityKey&&fresh(s.checkedAt,now)?buildReviewedRadar(a.agency,s.rows,{complete:true,withheld:0},now):undefined;
  const base={...a,dates:[] as CommercialRow[],funding:[] as CommercialRow[],awards:[] as CommercialRow[],rows:[] as CompetitiveResearchRow[],withheld:0};
  if(!review?.complete){accounts.push({...base,status:'review-unavailable'});continue;}
  const variants=new Map<string,Set<string>>();
  for(const r of s.rows){
   const e=r.evidence,k=recordKey(e),v=variants.get(k)??new Set<string>();v.add(e.sourceRecordId.trim());variants.set(k,v);
  }
  const groups=new Map<ProviderEquipmentKind,ReviewedEquipmentObservation[]>();
  let withheld=0;
  for(const e of review.equipment){
   const k=e.evidence.kind;
   if(!isEquipment(k)||!validIsoDay(e.evidence.documentDate)||e.evidence.documentDate>today||Date.parse(today)-Date.parse(e.evidence.documentDate)>730*DAY_MS||(variants.get(recordKey(e.evidence))?.size??0)>1){withheld++;continue;}
   const list=groups.get(k)??[];list.push(e);groups.set(k,list);
  }
  const rows:CompetitiveResearchRow[]=[];
  for(const [kind,observations] of groups){
   const other=observations.filter(o=>o.vendorId!=='zoll');
   if(!other.length)continue;
   // Never label contradictory manufacturer evidence a confirmed mixed fleet.
   if(new Set(observations.map(o=>o.vendorId)).size!==1){withheld+=observations.length;continue;}
   rows.push({key:JSON.stringify([a.identityKey,kind]),agency:a.agency,identityKey:a.identityKey,kind,observations:other.sort((x,y)=>y.evidence.documentDate.localeCompare(x.evidence.documentDate)||x.evidence.factId.localeCompare(y.evidence.factId)),preparation:reviewedCallPoints('competitor-equipment',kind)});
  }
  rows.sort((x,y)=>PROVIDER_EQUIPMENT_KINDS.indexOf(x.kind)-PROVIDER_EQUIPMENT_KINDS.indexOf(y.kind));
  const context=(r:CommercialRow)=>r.identityKey===a.identityKey&&r.agency.id===a.agency.id;
  accounts.push({...base,rows,withheld,status:rows.length?'competitor-observed':'no-eligible-competitor',dates:commercial.upcoming.filter(context),funding:commercial.funding.filter(context),awards:commercial.awards.filter(context)});
 }
 accounts.sort((a,b)=>Number(b.rows.length>0)-Number(a.rows.length>0)||a.agency.name.localeCompare(b.agency.name)||a.identityKey.localeCompare(b.identityKey));
 return {active,selected:selected.length,eligible:accounts.length,checked:accounts.filter(a=>a.status!=='review-unavailable').length,accounts,rows:accounts.flatMap(a=>a.rows),withheld:accounts.reduce((n,a)=>n+a.withheld,0),competitorAccounts:accounts.filter(a=>a.rows.length>0).length,datedContextAccounts:accounts.filter(a=>a.rows.length>0&&a.dates.length>0).length};
}
