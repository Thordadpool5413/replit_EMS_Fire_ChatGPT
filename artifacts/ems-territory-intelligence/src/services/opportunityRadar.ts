import type {Agency} from '../types';
import {EQUIPMENT_VENDORS} from '../utils/equipmentPresence';
import {DAY_MS,PROCUREMENT_LOOKBACK_DAYS,utcDay,validIntelligenceFacts,equipmentObservationFacts,documentedContractExpiration,mostRecentFacts,type DocumentedFact} from './documentedIntelligence';
export type OpportunityKind='competitor-equipment'|'contract-renewal'|'open-procurement'|'awarded-procurement'|'grant-award'|'capital-approved';
export const OPPORTUNITY_LABELS:Record<OpportunityKind,string>={'competitor-equipment':'Competitor equipment observed','contract-renewal':'Documented contract expiration','open-procurement':'Open procurement candidate','awarded-procurement':'Recent procurement award','grant-award':'Documented grant award','capital-approved':'Approved capital funding'};
export interface OpportunitySignal{key:string;kind:OpportunityKind;agency:Agency;fact:DocumentedFact;date?:string;nextAction:string}
export function agencyOpportunitySignals(agency:Agency,now=Date.now()):OpportunitySignal[]{
 const today=utcDay(now),day=Date.parse(today),signals:OpportunitySignal[]=[];
 const add=(kind:OpportunityKind,fact:DocumentedFact,nextAction:string,date?:string)=>signals.push({key:[agency.id,kind,fact.sourceRecordId,fact.intelligence.kind,fact.value].join('|'),kind,agency,fact,nextAction,date});
 for(const fact of equipmentObservationFacts(agency,now)){
  const vendors=EQUIPMENT_VENDORS.filter(v=>v.pattern.test(fact.value));
  if(vendors.some(v=>v.id!=='zoll'))add('competitor-equipment',fact,'Confirm current installed model, quantity, replacement cycle and decision process. This is not a confirmed displacement opportunity.');
 }
 const contract=documentedContractExpiration(agency,now);
 if(contract&&contract.value>=today&&Date.parse(contract.value)-day<=365*DAY_MS)add('contract-renewal',contract,'Verify whether the contract has been amended or renewed; discuss the purchasing and decision timeline.',contract.value);
 const facts=validIntelligenceFacts(agency,now);
 const procurements=new Map<string,DocumentedFact[]>();
 for(const fact of facts){if(!fact.intelligence.kind.startsWith('procurement-'))continue;const key=fact.sourceRecordId.trim().toLowerCase();procurements.set(key,[...(procurements.get(key)??[]),fact]);}
 const recent=(f:DocumentedFact)=>day-Date.parse(f.intelligence.documentDate)<=PROCUREMENT_LOOKBACK_DAYS*DAY_MS;
 for(const group of procurements.values()){
  const latest=mostRecentFacts(group);
  if(latest.some(f=>f.intelligence.kind==='procurement-closed'))continue;
  const awarded=latest.find(f=>f.intelligence.kind==='procurement-awarded');
  if(awarded){if(recent(awarded))add('awarded-procurement',awarded,'Review the award scope, delivery and service provisions. Do not treat a completed award as an open bid.');continue;}
  const open=latest.filter(f=>f.intelligence.kind==='procurement-open');
  if(open.length&&new Set(open.map(f=>f.intelligence.dueDate)).size===1&&open[0].intelligence.dueDate!>=today&&recent(open[0]))add('open-procurement',open[0],'Open the official solicitation; confirm amendments, submission deadlines and eligibility.',open[0].intelligence.dueDate);
 }
 for(const kind of ['grant-awarded','capital-approved'] as const){
  const groups=new Map<string,DocumentedFact[]>();
  for(const f of facts.filter(f=>f.intelligence.kind===kind))groups.set(f.sourceRecordId,[...(groups.get(f.sourceRecordId)??[]),f]);
  for(const group of groups.values()){const latest=mostRecentFacts(group);if(latest.length&&new Set(latest.map(f=>f.value)).size===1&&recent(latest[0]))add(kind==='grant-awarded'?'grant-award':'capital-approved',latest[0],kind==='grant-awarded'?'Confirm eligible expenses, remaining funds and award conditions.':'Confirm the appropriation, approved equipment scope and purchasing schedule.');}
 }
 return [...new Map(signals.map(s=>[s.key,s])).values()];
}
export function buildOpportunityRadar(agencies:Agency[],state='all',kind:OpportunityKind|'all'='all',now=Date.now()){
 const groups=new Map<string,Agency[]>();
 for(const a of agencies)if(a.id)groups.set(a.id,[...(groups.get(a.id)??[]),a]);
 const rows:OpportunitySignal[]=[];let evidenceAccounts=0,accounts=0,conflictingAccounts=0;
 for(const group of groups.values()){
  if(state!=='all'&&!group.some(a=>a.stateCode===state))continue;
  accounts++;
  // Check all rows before state filtering so conflicts cannot be hidden.
  if(new Set(group.map(a=>a.stateCode)).size!==1){conflictingAccounts++;continue;}
  const agency={...group[0],sourceFacts:group.flatMap(a=>a.sourceFacts??[]),_factReviews:group.flatMap(a=>a._factReviews??[])};
  if(validIntelligenceFacts(agency,now).length)evidenceAccounts++;
  rows.push(...agencyOpportunitySignals(agency,now));
 }
 const signals=rows.filter(s=>kind==='all'||s.kind===kind).sort((a,b)=>(a.date??'9999-12-31').localeCompare(b.date??'9999-12-31')||b.fact.intelligence.documentDate.localeCompare(a.fact.intelligence.documentDate)||a.agency.name.localeCompare(b.agency.name));
 return {accounts,conflictingAccounts,evidenceAccounts,signalAccounts:new Set(signals.map(s=>s.agency.id)).size,signals};
}
