import type {Agency} from '../types';
import {buildProviderCompetitiveProfile} from './providerCompetitiveProfile';
import {validIsoDay,DAY_MS,utcDay} from './documentedIntelligence';
import type {ReviewedRadarResult} from './sharedOpportunityRadar';
import type {LifecycleSample} from './lifecycleTimeline';
import {buildLifecycleTimeline} from './lifecycleTimeline';
export const DOMAINS=['geography','equipment','manufacturer','funding','procurement','authority','lifecycle','evidence'] as const;
export type Domain=typeof DOMAINS[number];
export const LABELS:Record<Domain,string>={geography:'Street and map location',equipment:'Equipment documentation',manufacturer:'Named manufacturer evidence',funding:'Grant or capital funding',procurement:'Procurement documentation',authority:'Decision authority',lifecycle:'Lifecycle dates',evidence:'Dated source evidence'};
export type Status='reviewed'|'documented'|'partial'|'not-documented'|'not-checked'|'review-required';
export type SourceStatus='checked'|'unavailable'|'not-checked';
export type CoverageInput={location:{address:boolean;mapped:boolean;detail:string};documents?:ReviewedRadarResult;documentStatus:SourceStatus;station?:LifecycleSample;stationStatus:SourceStatus;authority?:{complete:boolean;recentReviewed:number};authorityStatus:SourceStatus};
const named=new Set(['zoll','stryker','philips','hamilton','weinmann','draeger','medtronic','mindray','schiller','nihon-kohden','eso','imagetrend']);
function recent(date:unknown,today:string,days:number){return validIsoDay(date)&&date<=today&&Date.parse(today)-Date.parse(date)<=days*DAY_MS;}
export function buildIntelligenceCoverage(agency:Agency,directory:Agency[],input:CoverageInput,now=Date.now()){
 const local=buildProviderCompetitiveProfile(agency,directory,now),today=utcDay(now);
 const checkedDocs=input.documentStatus==='checked'&&input.documents?.complete===true;
 const docSignals=checkedDocs?input.documents!.signals:[],docEquipment=checkedDocs?input.documents!.equipment:[];
 const station=input.station,checkedStation=input.stationStatus==='checked'&&!!station&&station.agencyId===agency.id&&station.acceptedRowsChecked===station.observations.length;
 const stationRows=checkedStation?station!.observations.filter(o=>recent(o.observedOn,today,730)):[];
 const stationNamed=stationRows.some(o=>named.has(o.maker));
 const localEquipment=local.equipment.flatMap(e=>e.observations);
 const localPurchasing=local.purchasing.filter(d=>d.status==='document-observation');
 const localFunding=localPurchasing.some(d=>['grant-awarded','capital-approved'].includes(d.item.evidence.kind));
 const localProcurement=localPurchasing.some(d=>d.item.evidence.kind.startsWith('procurement-'));
 const localLifecycle=localPurchasing.some(d=>d.item.evidence.kind==='contract-expiration'&&recent(d.item.evidence.documentDate,today,365));
 const sharedLifecycle=docSignals.some(s=>s.kind==='contract-renewal'&&recent(s.evidence.documentDate,today,365));
 const stationLifecycle=checkedStation&&buildLifecycleTimeline(station,[],today).some(e=>!e.ambiguous&&recent(e.observedOn,today,730));
 const checkedAuthority=input.authorityStatus==='checked'&&input.authority?.complete===true;
 const reviewNeeded=!local.identityReady||!local.complete||local.equipment.some(e=>e.status==='review-required')||local.purchasing.some(d=>d.status==='review-required');
 const items:{domain:Domain;status:Status;detail:string}[]=[];
 const add=(domain:Domain,reviewed:boolean,documented:boolean,checked:boolean,detail:string)=>items.push({domain,status:reviewed?'reviewed':documented?'documented':reviewNeeded?'review-required':checked?'not-documented':'not-checked',detail});
 items.push({domain:'geography',status:input.location.address&&input.location.mapped?'documented':input.location.address?'partial':local.identityReady?'not-documented':'review-required',detail:input.location.detail});
 add('equipment',docEquipment.length>0||stationNamed,localEquipment.length>0,checkedDocs&&checkedStation,'Dated equipment observations, not a complete inventory.');
 add('manufacturer',docEquipment.length>0||stationNamed,localEquipment.some(d=>d.mentions.length>0),checkedDocs&&checkedStation,'Named manufacturer or recognized product; not current ownership or market share.');
 add('funding',docSignals.some(s=>s.kind==='grant-award'||s.kind==='capital-approved'),localFunding,checkedDocs,'Recent reported grant or capital approval, not spendable balance.');
 add('procurement',docSignals.some(s=>s.kind==='open-procurement'||s.kind==='awarded-procurement'),localProcurement,checkedDocs,'Eligible reviewed procurement records, not all historical contracts.');
 add('authority',checkedAuthority&&input.authority!.recentReviewed>0,false,checkedAuthority,'Independently reviewed professional responsibility within 365 days.');
 add('lifecycle',sharedLifecycle||stationLifecycle,localLifecycle,checkedDocs&&checkedStation,'Reported dates only; conflicting station dates do not count.');
 add('evidence',docSignals.length>0||docEquipment.length>0||stationNamed||checkedAuthority&&input.authority!.recentReviewed>0,localEquipment.length>0||localPurchasing.length>0,checkedDocs&&checkedStation&&checkedAuthority,'Eligible dated evidence exists, not a statement that all facts are validated.');
 // Missing or partial results never inflate the numerator. Eight equal categories, no inferred confidence.
 const documented=items.filter(i=>i.status==='documented'||i.status==='reviewed').length,reviewed=items.filter(i=>i.status==='reviewed').length;
 return {items,documented,reviewed,total:DOMAINS.length,unchecked:items.filter(i=>i.status==='not-checked'||i.status==='review-required').length,percent:Math.round(documented/DOMAINS.length*100)};
}
