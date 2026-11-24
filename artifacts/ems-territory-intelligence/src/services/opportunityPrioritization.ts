import type {Agency} from '../types';
import {buildProviderCompetitiveProfile,type ProfileDocument} from './providerCompetitiveProfile';
import {sharedAgencyKey,type SharedEvidence} from './sharedEvidence';
import {definitionFor,normalizedValue,DAY_MS,utcDay} from './documentedIntelligence';
import {productMentions} from './nationalCompetitiveResearch';
import {OPPORTUNITY_LABELS,type OpportunityKind} from './opportunityRadar';

/** Research urgency, not likelihood to close, revenue, clinical need or a verified sales opportunity. */
export const PRIORITY_BANDS=['verify-now','verify-soon','plan-research','explore'] as const;
export type PriorityBand=typeof PRIORITY_BANDS[number];
export const PRIORITY_LABELS:Record<PriorityBand,string>={
 'verify-now':'Verify now',
 'verify-soon':'Verify soon',
 'plan-research':'Plan research',
 explore:'Explore account',
};
export const PRIORITY_RULES={
 bidNowDays:14,bidSoonDays:45,contractSoonDays:90,contractHorizonDays:365,
 contractDocumentMaxAgeDays:365,
} as const;
export type PrioritySignal={key:string;kind:OpportunityKind;band:PriorityBand;evidence:SharedEvidence;date?:string;days?:number;reason:string;nextAction:string};
export type RankedAccount={agency:Agency;identityKey:string;band:PriorityBand;primary:PrioritySignal;signals:PrioritySignal[];missingCategories:number;reviewRequired:boolean};
const kindOrder:Record<OpportunityKind,number>={'open-procurement':0,'contract-renewal':1,'capital-approved':2,'grant-award':3,'competitor-equipment':4,'awarded-procurement':5};
const compareSignals=(a:PrioritySignal,b:PrioritySignal)=>PRIORITY_BANDS.indexOf(a.band)-PRIORITY_BANDS.indexOf(b.band)||(a.days??Infinity)-(b.days??Infinity)||kindOrder[a.kind]-kindOrder[b.kind]||b.evidence.documentDate.localeCompare(a.evidence.documentDate)||a.key.localeCompare(b.key);
const compareAccounts=(a:RankedAccount,b:RankedAccount)=>PRIORITY_BANDS.indexOf(a.band)-PRIORITY_BANDS.indexOf(b.band)||(a.primary.days??Infinity)-(b.primary.days??Infinity)||kindOrder[a.primary.kind]-kindOrder[b.primary.kind]||b.primary.evidence.documentDate.localeCompare(a.primary.evidence.documentDate)||a.agency.name.localeCompare(b.agency.name)||a.identityKey.localeCompare(b.identityKey);
const signalKey=(e:SharedEvidence)=>JSON.stringify([e.kind,normalizedValue(e.sourceName),normalizedValue(e.sourceRecordId),e.documentDate,normalizedValue(e.value),e.dueDate]);
function daysUntil(date:string,now:number){return (Date.parse(date)-Date.parse(utcDay(now)))/DAY_MS;}

/** The profile already gates invalid, conflicting, stale and flagged local documents. */
function fromDocument(d:ProfileDocument,now:number):PrioritySignal|undefined{
 if(d.status!=='document-observation')return;
 const e=d.item.evidence,base={key:signalKey(e),evidence:e,nextAction:d.nextAction};
 const family=definitionFor(e.kind)?.family;
 if(family){
  const mentions=productMentions(e.value);
  const brands=new Set(mentions.map(m=>m.brand));
  // Require an explicit category-compatible product reference and one maker only.
  // Generic manufacturer names, ambiguous combinations and unknown makes do not rank.
  if(brands.size!==1||brands.has('ZOLL')||!mentions.some(m=>m.family===family))return;
  return {...base,kind:'competitor-equipment',band:'explore',reason:'Dated equipment observation contains a recognized non-ZOLL product reference. Current deployment and conversion potential are unconfirmed.'};
 }
 if(e.kind==='procurement-open'){
  const days=daysUntil(e.dueDate,now);
  if(!Number.isFinite(days)||days<0)return;
  const band=days<=PRIORITY_RULES.bidNowDays?'verify-now':days<=PRIORITY_RULES.bidSoonDays?'verify-soon':'plan-research';
  return {...base,kind:'open-procurement',band,date:e.dueDate,days,reason:days===0?'Published response date is today; confirm time, timezone and current status immediately.':'Published response date is '+days+' days away; confirm amendments and current status.'};
 }
 if(e.kind==='contract-expiration'){
  const days=daysUntil(e.value,now);
  if(!Number.isFinite(days)||days<0||days>PRIORITY_RULES.contractHorizonDays||-daysUntil(e.documentDate,now)>PRIORITY_RULES.contractDocumentMaxAgeDays)return;
  return {...base,kind:'contract-renewal',band:days<=PRIORITY_RULES.contractSoonDays?'verify-soon':'plan-research',date:e.value,days,reason:'Documented end date is '+days+' days away. Contract renewal, extension and product scope are unconfirmed.'};
 }
 if(e.kind==='capital-approved')return {...base,kind:'capital-approved',band:'plan-research',reason:'A recent local document reports approved capital funding; confirm purchase scope, timing and usable appropriation.'};
 if(e.kind==='grant-awarded')return {...base,kind:'grant-award',band:'plan-research',reason:'A recent local document reports a grant award; confirm eligible expenses, conditions and remaining funds.'};
 if(e.kind==='procurement-awarded')return {...base,kind:'awarded-procurement',band:'explore',reason:'A recent local document reports an award. Research service, implementation or future planning, not an open bid.'};
 return undefined;
}
/** Check normalized record identity collisions before relying on the older case-sensitive reconciliation. */
function ambiguousRecordKeys(documents:ProfileDocument[]):Set<string>{
 const groups=new Map<string,Set<string>>();
 for(const {item:{evidence:e}} of documents){
  if(definitionFor(e.kind)?.family)continue;
  const group=e.kind.startsWith('procurement-')?'procurement':e.kind;
  const key=JSON.stringify([group,normalizedValue(e.sourceName),normalizedValue(e.sourceRecordId)]);
  const variants=groups.get(key)??new Set<string>();variants.add(e.sourceRecordId.trim());groups.set(key,variants);
 }
 return new Set([...groups].filter(([,v])=>v.size>1).map(([k])=>k));
}
function recordKey(e:SharedEvidence){return JSON.stringify([e.kind.startsWith('procurement-')?'procurement':e.kind,normalizedValue(e.sourceName),normalizedValue(e.sourceRecordId)]);}

export function buildOpportunityPriorities(agencies:Agency[],state='all',kind:OpportunityKind|'all'='all',now=Date.now()){
 // Index globally, before territory filtering, so duplicate identities cannot be hidden by filters.
 // Never perform a directory-wide scan for every account.
 const ids=new Map<string,number>(),keys=new Map<string,number>();
 for(const a of agencies){if(a.id)ids.set(a.id,(ids.get(a.id)??0)+1);const k=sharedAgencyKey(a);if(k)keys.set(k,(keys.get(k)??0)+1);}
 const ranked:RankedAccount[]=[];
 let loadedRows=0,noTypedEvidence=0,typedRows=0,identityExcluded=0,reviewRequired=0,noEligibleSignals=0,filteredOut=0;
 for(const a of agencies){
  if(state!=='all'&&a.stateCode!==state)continue;
  loadedRows++;
  const typed=(a.sourceFacts??[]).some(f=>Boolean(f.intelligence));
  if(!typed){noTypedEvidence++;continue;}
  typedRows++;
  const key=sharedAgencyKey(a);
  if(!a.id||!key||ids.get(a.id)!==1||keys.get(key)!==1){identityExcluded++;continue;}
  // Both global uniqueness checks above passed. The existing profile gate validates metadata
  // and reconciliation against this exact row; no cross-account evidence joins.
  const p=buildProviderCompetitiveProfile(a,[a],now);
  if(!p.identityReady){identityExcluded++;continue;}
  const docs=[...p.equipment.flatMap(c=>c.documents),...p.purchasing];
  const ambiguous=ambiguousRecordKeys(docs);
  const needsReview=!p.complete||docs.some(d=>d.status==='review-required')||ambiguous.size>0;
  if(needsReview)reviewRequired++;
  if(!p.complete){noEligibleSignals++;continue;}
  const signalsByKey=new Map<string,PrioritySignal>();
  for(const d of docs){
   if(ambiguous.has(recordKey(d.item.evidence)))continue;
   const signal=fromDocument(d,now);
   if(!signal)continue;
   const previous=signalsByKey.get(signal.key);
   // Equal semantic observations from different URLs never raise urgency or count twice.
   if(!previous||signal.evidence.sourceUrl.localeCompare(previous.evidence.sourceUrl)<0)signalsByKey.set(signal.key,signal);
  }
  const all=[...signalsByKey.values()];
  if(!all.length){noEligibleSignals++;continue;}
  const signals=all.filter(s=>kind==='all'||s.kind===kind).sort(compareSignals);
  if(!signals.length){filteredOut++;continue;}
  ranked.push({agency:a,identityKey:key,band:signals[0].band,primary:signals[0],signals,missingCategories:p.equipment.filter(c=>c.status!=='document-observation').length,reviewRequired:needsReview});
 }
 ranked.sort(compareAccounts);
 const bands=Object.fromEntries(PRIORITY_BANDS.map(b=>[b,ranked.filter(r=>r.band===b).length])) as Record<PriorityBand,number>;
 return {asOf:utcDay(now),loadedRows,noTypedEvidence,typedRows,identityExcluded,reviewRequired,noEligibleSignals,filteredOut,ranked,bands,signalCount:ranked.reduce((sum,r)=>sum+r.signals.length,0)};
}
export function prioritySignalLabel(s:PrioritySignal){return OPPORTUNITY_LABELS[s.kind];}
