import type {Agency,AgencyFactEvidenceKey} from '../types';
import {isGeographicProspect,requiresAgencyFieldEvidence} from '../utils/providerRecordTrust';

export const RESEARCH_FIELDS=[
 {id:'monitor.model',label:'Cardiac monitor / defibrillator',key:'defibrillatorBiomedicalFleet',read:(a:Agency)=>a.installedFleet?.defibBrand||a.fleet?.currentDefibVendor,question:'Confirm manufacturer and exact model from an agency asset list, awarded bid or inventory.'},
 {id:'cpr.model',label:'Mechanical CPR',key:'equipmentSuppliers',read:(a:Agency)=>a.installedFleet?.mechanicalCPR||a.fleet?.currentCprDevice,question:'Find the recorded mechanical CPR device and distinguish installed devices from proposed purchases.'},
 {id:'ventilator.model',label:'Transport ventilator',key:'equipmentSuppliers',read:(a:Agency)=>a.installedFleet?.transportVentilator||a.fleet?.currentVentilator,question:'Find an agency-specific inventory or awarded purchase for transport ventilators.'},
 {id:'software.epcr',label:'ePCR software',key:'epcrSystem',read:(a:Agency)=>a.installedFleet?.epcrCadSoftware||a.fleet?.currentEpcrVendor,question:'Check the agency or municipal ePCR award. Do not infer billing or CAD software.'},
 {id:'software.billing',label:'Billing software',key:'billingSoftware',read:(a:Agency)=>a.installedFleet?.billingSoftware,question:'Confirm the actual billing platform from a procurement or service record.'},
 {id:'contract.vendor',label:'Contracted vendor',key:'maintenanceContracts',read:(a:Agency)=>a.competitorContract?.vendor,question:'Find the actual supplier or maintenance contractor. A product brand is not a contracted vendor.'},
 {id:'contract.end',label:'Contract expiration',key:'maintenanceContracts',read:(a:Agency)=>a.competitorContract?.contractEndDate,question:'Find a signed award, agreement or renewal notice with the actual end date.'},
] as const;
type ResearchField=typeof RESEARCH_FIELDS[number];
export type ResearchStatus='unknown'|'recorded-unsubstantiated'|'value-matched-source'|'user-confirmed'|'user-corrected'|'flagged'|'invalid';
const norm=(v:string)=>v.normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
const substantive=(v:unknown)=>typeof v==='string'&&!!v.trim()&&!/^(?:unknown|not reported|not recorded|not specified|not confirmed|not available|none reported|n\/?a|no data)$/i.test(v.trim());
const date=(v:string)=>/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const validSourceUrl=(v?:string)=>{try{const url=new URL(v??'');return url.protocol==='https:'&&!url.username&&!url.password&&url.pathname.length>1;}catch{return false;}};
export function assessResearchField(agency:Agency,field:ResearchField,now=Date.now()){
 const raw=field.read(agency), value=substantive(raw)?String(raw).trim():'';
 const reviews=(agency._factReviews??[]).filter(r=>r.agencyId===agency.id&&r.fieldId===field.id&&['confirm','correct','flag'].includes(r.action)&&Number.isFinite(Date.parse(r.reviewedAt))&&Date.parse(r.reviewedAt)<=now);
 const original=agency._reviewOriginalValues?.[field.id]??(value||'Not reported');
 const latest=reviews.filter(r=>norm(r.originalValue)===norm(original)).at(-1);
 if(latest?.action==='flag')return {status:'flagged' as ResearchStatus,value,sourceCount:0};
 if(!value)return {status:'unknown' as ResearchStatus,value:'',sourceCount:0};
 if(field.id==='contract.end'&&!date(value))return {status:'invalid' as ResearchStatus,value,sourceCount:0};
 const matches=(agency.sourceFacts??[]).filter(f=>f.fieldKey===field.key&&f.basis==='source-reported'&&f.geographicLevel==='agency'&&f.geographicId===agency.id&&substantive(f.value)&&norm(f.value)===norm(value)&&substantive(f.sourceName)&&substantive(f.sourceRecordId)&&validSourceUrl(f.sourceUrl)&&Number.isFinite(Date.parse(f.enteredAt))&&Date.parse(f.enteredAt)<=now);
 // A source is value-matched, not independently verified, and historical records need rechecking.
 const sourceCount=new Set(matches.map(f=>f.sourceName+':'+f.sourceRecordId)).size;
 if(latest?.action==='correct'&&latest.correctedValue&&norm(latest.correctedValue)===norm(value))return {status:'user-corrected' as ResearchStatus,value,sourceCount};
 if(latest?.action==='confirm'&&norm(latest.previousValue)===norm(value))return {status:'user-confirmed' as ResearchStatus,value,sourceCount};
 return {status:(sourceCount?'value-matched-source':'recorded-unsubstantiated') as ResearchStatus,value,sourceCount};
}
export function hasSavedWork(agency:Agency){
 return Boolean(agency.registryIdentity||agency.isBookmarked||agency.inDayRoute||agency.fieldNotes?.length||agency.followUpTasks?.length||agency.sourceFacts?.length||agency._factReviews?.length||Object.keys(agency._reviewOriginalValues??{}).length);
}
export function buildIntelligenceResearchQueue(agencies:Agency[],state='all',scope:'saved'|'loaded'='saved',now=Date.now()){
 const unique=new Map<string,Agency>();for(const agency of agencies){if(agency.id&&!unique.has(agency.id))unique.set(agency.id,agency);}
 const accounts=[...unique.values()].filter(a=>(state==='all'||a.stateCode===state)&&(scope==='loaded'||hasSavedWork(a)));
 const rows=accounts.map(agency=>{
  const fields=RESEARCH_FIELDS.map(field=>({id:field.id,label:field.label,question:field.question,...assessResearchField(agency,field,now)}));
  const needs=fields.filter(f=>['unknown','recorded-unsubstantiated','flagged','invalid'].includes(f.status));
  const flagged=needs.filter(f=>f.status==='flagged'||f.status==='invalid').length;
  const identityNeedsReview=isGeographicProspect(agency);
  return {agency,fields,needs,flagged,identityNeedsReview,requiresEvidence:requiresAgencyFieldEvidence(agency)};
 }).filter(r=>r.needs.length||r.identityNeedsReview).sort((a,b)=>b.flagged-a.flagged||Number(b.agency.inDayRoute)-Number(a.agency.inDayRoute)||Number(b.agency.isBookmarked)-Number(a.agency.isBookmarked)||b.needs.length-a.needs.length||a.agency.name.localeCompare(b.agency.name));
 return {accounts:accounts.length,accountsNeedingResearch:rows.length,fieldsNeedingResearch:rows.reduce((n,r)=>n+r.needs.length,0),identityReviewCandidates:rows.filter(r=>r.identityNeedsReview).length,rows};
}
