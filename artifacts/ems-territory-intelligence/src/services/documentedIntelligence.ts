import type {Agency,AgencySourceFact,AgencyFactEvidenceKey} from '../types';
import {isGeographicProspect} from '../utils/providerRecordTrust';
import {registryIdentityKey} from './registryAccountLink';

export type IntelligenceEquipmentFamily='monitors'|'cpr'|'ventilators'|'software';
type Definition={label:string;fieldKey:AgencyFactEvidenceKey;family?:IntelligenceEquipmentFamily;reviewField?:string};
export const INTELLIGENCE_DEFINITIONS={
 'installed-monitor':{label:'Installed monitor / defibrillator',fieldKey:'defibrillatorBiomedicalFleet',family:'monitors',reviewField:'monitor.model'},
 'installed-cpr':{label:'Installed mechanical CPR',fieldKey:'equipmentSuppliers',family:'cpr',reviewField:'cpr.model'},
 'installed-ventilator':{label:'Installed transport ventilator',fieldKey:'equipmentSuppliers',family:'ventilators',reviewField:'ventilator.model'},
 'installed-epcr':{label:'Installed ePCR software',fieldKey:'epcrSystem',family:'software',reviewField:'software.epcr'},
 'installed-cad':{label:'Installed CAD software',fieldKey:'communicationsSystems',family:'software',reviewField:'software.cad'},
 'installed-billing':{label:'Installed billing software',fieldKey:'billingSoftware',family:'software',reviewField:'software.billing'},
 'contract-expiration':{label:'Documented equipment / service contract expiration',fieldKey:'maintenanceContracts',reviewField:'contract.end'},
 'procurement-open':{label:'Open procurement / solicitation',fieldKey:'operationalVolumeContracts'},
 'procurement-awarded':{label:'Awarded procurement',fieldKey:'operationalVolumeContracts'},
 'procurement-closed':{label:'Closed or cancelled procurement',fieldKey:'operationalVolumeContracts'},
 'grant-awarded':{label:'Awarded grant',fieldKey:'federalGrant'},
 'capital-approved':{label:'Approved capital purchase / budget',fieldKey:'operationalVolumeContracts'},
} as const satisfies Record<string,Definition>;
export type IntelligenceKind=keyof typeof INTELLIGENCE_DEFINITIONS;
export type IntelligenceMetadata={kind:IntelligenceKind;documentDate:string;dueDate?:string};
export type DocumentedFact=AgencySourceFact&{intelligence:IntelligenceMetadata;sourceUrl:string};
export const EQUIPMENT_LOOKBACK_DAYS=730;
export const PROCUREMENT_LOOKBACK_DAYS=365;
export const DAY_MS=86400000;
export const normalizedValue=(v:string)=>v.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
export const validIsoDay=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
export const utcDay=(now:number)=>new Date(now).toISOString().slice(0,10);
export function definitionFor(kind:unknown):Definition|undefined{
 return typeof kind==='string'&&Object.hasOwn(INTELLIGENCE_DEFINITIONS,kind)?INTELLIGENCE_DEFINITIONS[kind as IntelligenceKind]:undefined;
}
export function validDocumentUrl(value:unknown):value is string{
 if(typeof value!=='string')return false;
 try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&(u.pathname.length>1||!!u.search);}catch{return false;}
}
function text(value:unknown):value is string{return typeof value==='string'&&!!value.trim()&&!/^(?:unknown|not reported|not recorded|not applicable|none|n\/?a)$/i.test(value.trim());}
/** A generated prospect requires a registry association before document observations become intelligence. */
export function hasDocumentedAgencyIdentity(agency:Agency):boolean{
 if(!isGeographicProspect(agency))return !!agency.id;
 if(agency.registryIdentity&&agency.registryIdentity.stateCode===agency.stateCode&&registryIdentityKey(agency.registryIdentity))return true;
 return (agency.sourceRecordAssociations??[]).some(a=>a.decision==='confirmed'&&/^(?:USFA NFDR|USFA|NERIS|NPPES|State EMS)$/i.test(a.sourceName)&&text(a.sourceRecordId)&&text(a.matchBasis)&&(!a.sourceFields?.stateCode||a.sourceFields.stateCode===agency.stateCode));
}
export function isDocumentedIntelligenceFact(fact:AgencySourceFact,agencyId:string,now=Date.now()):fact is DocumentedFact{
 const meta=fact.intelligence,def=definitionFor(meta?.kind);
 if(!meta||!def||fact.fieldKey!==def.fieldKey||fact.basis!=='source-reported'||fact.geographicLevel!=='agency'||fact.geographicId!==agencyId||!text(fact.id)||!text(fact.value)||!text(fact.sourceName)||!text(fact.sourceRecordId)||!validDocumentUrl(fact.sourceUrl)||!validIsoDay(meta.documentDate)||meta.documentDate>utcDay(now)||!Number.isFinite(Date.parse(fact.enteredAt))||Date.parse(fact.enteredAt)>now||meta.documentDate>fact.enteredAt.slice(0,10))return false;
 if(def.family&&/\b(?:unknown|no|without|not|proposed|recommended|considering|planned|requested|bid solicitation|previously used|formerly|retired|removed|out of service|decommissioned|discontinued|replaced|disposed|sold|surplus|trade.in|demonstration|demo|loaner)\b/i.test(fact.value))return false;
 if(meta.kind==='contract-expiration'&&(!validIsoDay(fact.value)||fact.value<meta.documentDate))return false;
 if(meta.kind==='procurement-open'&&(!validIsoDay(meta.dueDate)||meta.dueDate<meta.documentDate))return false;
 return meta.dueDate===undefined||meta.kind==='procurement-open';
}
export function createIntelligenceFact(agency:Agency,input:{kind:IntelligenceKind;value:string;sourceName:string;sourceRecordId:string;sourceUrl:string;documentDate:string;dueDate?:string;note?:string},id:string,now=Date.now()):DocumentedFact{
 const def=definitionFor(input.kind);
 if(!def)throw Error('Choose a documented intelligence type.');
 const fact:AgencySourceFact={id,fieldKey:def.fieldKey,value:input.value.trim(),sourceName:input.sourceName.trim(),sourceRecordId:input.sourceRecordId.trim(),sourceUrl:input.sourceUrl.trim(),basis:'source-reported',geographicLevel:'agency',geographicId:agency.id,reportingPeriod:input.documentDate,note:input.note?.trim()||undefined,enteredAt:new Date(now).toISOString(),intelligence:{kind:input.kind,documentDate:input.documentDate,...(input.kind==='procurement-open'?{dueDate:input.dueDate}:{})}};
 if(!isDocumentedIntelligenceFact(fact,agency.id,now))throw Error('Enter an exact agency-specific value, public HTTPS document link, source record ID and valid document/deadline dates. Do not record planned equipment as installed.');
 return fact;
}
/** Source observations, never an assertion that equipment is still installed or procurement is still open. */
export function validIntelligenceFacts(agency:Agency,now=Date.now()):DocumentedFact[]{
 if(!hasDocumentedAgencyIdentity(agency))return [];
 return (agency.sourceFacts??[]).filter((f):f is DocumentedFact=>isDocumentedIntelligenceFact(f,agency.id,now));
}
export function mostRecentFacts(facts:DocumentedFact[]):DocumentedFact[]{
 const latest=facts.reduce((max,f)=>f.intelligence.documentDate>max?f.intelligence.documentDate:max,'');
 return facts.filter(f=>f.intelligence.documentDate===latest);
}
/** Multiple items in a single inventory can be mixed. Disagreeing same-date documents are unresolved, not mixed. */
function hasConflictingDocuments(facts:DocumentedFact[]):boolean{
 const docs=new Map<string,Set<string>>();
 for(const f of facts){const key=[f.sourceName,f.sourceRecordId,f.sourceUrl].join('|');const values=docs.get(key)??new Set<string>();values.add(normalizedValue(f.value));docs.set(key,values);}
 return new Set([...docs.values()].map(values=>JSON.stringify([...values].sort()))).size>1;
}
export function equipmentObservationFacts(agency:Agency,now=Date.now()):DocumentedFact[]{
 const facts=validIntelligenceFacts(agency,now),out:DocumentedFact[]=[];
 for(const kind of Object.keys(INTELLIGENCE_DEFINITIONS) as IntelligenceKind[]){
  const def=definitionFor(kind)!;if(!def.family)continue;
  const latest=mostRecentFacts(facts.filter(f=>f.intelligence.kind===kind));
  if(!latest.length||hasConflictingDocuments(latest)||Date.parse(utcDay(now))-Date.parse(latest[0].intelligence.documentDate)>EQUIPMENT_LOOKBACK_DAYS*DAY_MS)continue;
  const review=(agency._factReviews??[]).filter(r=>r.agencyId===agency.id&&r.fieldId===def.reviewField&&['confirm','correct','flag'].includes(r.action)&&Number.isFinite(Date.parse(r.reviewedAt))&&Date.parse(r.reviewedAt)<=now).sort((a,b)=>a.reviewedAt.localeCompare(b.reviewedAt)).at(-1);
  if(review&&(review.action==='flag'||review.action==='correct')&&review.reviewedAt.slice(0,10)>=latest[0].intelligence.documentDate)continue;
  out.push(...latest);
 }
 return out;
}
export function documentedContractExpiration(agency:Agency,now=Date.now()):DocumentedFact|undefined{
 const latest=mostRecentFacts(validIntelligenceFacts(agency,now).filter(f=>f.intelligence.kind==='contract-expiration'));
 if(!latest.length||new Set(latest.map(f=>f.value)).size!==1)return undefined;
 const review=(agency._factReviews??[]).filter(r=>r.agencyId===agency.id&&r.fieldId==='contract.end'&&['confirm','correct','flag'].includes(r.action)&&Number.isFinite(Date.parse(r.reviewedAt))&&Date.parse(r.reviewedAt)<=now).sort((a,b)=>a.reviewedAt.localeCompare(b.reviewedAt)).at(-1);
 if(review&&(review.action==='flag'||review.action==='correct')&&review.reviewedAt.slice(0,10)>=latest[0].intelligence.documentDate)return undefined;
 return latest[0];
}
