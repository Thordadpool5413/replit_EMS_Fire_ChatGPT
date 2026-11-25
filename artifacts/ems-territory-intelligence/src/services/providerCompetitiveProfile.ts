import type {Agency} from '../types';
import {canCreateRegistryAccount,registryClaimIndex} from './registryAccountLink';
import {sharedAgencyKey} from './sharedEvidence';
import {reconcileSharedEvidence,type EvidenceReviewItem} from './sharedEvidenceReconciliation';
import {INTELLIGENCE_DEFINITIONS,definitionFor,normalizedValue,utcDay,type IntelligenceKind} from './documentedIntelligence';
import {productMentions,assessNationalCandidates,type ResearchScope,type StateResearch} from './nationalCompetitiveResearch';

export const PROVIDER_EQUIPMENT_KINDS=['installed-monitor','installed-cpr','installed-ventilator','installed-epcr','installed-cad','installed-billing'] as const;
export type ProviderEquipmentKind=typeof PROVIDER_EQUIPMENT_KINDS[number];
const questions:Record<ProviderEquipmentKind,string>={
 'installed-monitor':'Which monitor models are currently in service, how many, and when is replacement planned?',
 'installed-cpr':'Which mechanical CPR devices are deployed, and what is the replacement or evaluation process?',
 'installed-ventilator':'Which transport ventilators are in service, and what are the clinical and service requirements?',
 'installed-epcr':'Which ePCR system is deployed, and when are the licensing and integration decisions reviewed?',
 'installed-cad':'Which dispatch CAD system is used, and which organization owns the purchasing decision?',
 'installed-billing':'Which billing platform is used, and who owns the billing contract?',
};
export function providerIdentityReady(agency:Agency,directory:Agency[]):boolean{
 const identity=agency.registryIdentity,key=sharedAgencyKey(agency);
 if(!agency.id||!key||!identity||!canCreateRegistryAccount(identity)||identity.headquartersState&&identity.headquartersState!==agency.stateCode)return false;
 const claims=registryClaimIndex(directory),own=claims.byAccount.get(directory.find(a=>a.id===agency.id)!);
 if(claims.counts.get(key)!==1||own?.conflicts.length||own?.invalid.length)return false;
 const byId=directory.filter(a=>a.id===agency.id),byKey=directory.filter(a=>sharedAgencyKey(a)===key);
 return byId.length===1&&byKey.length===1&&byId[0]===byKey[0]&&byId[0].stateCode===agency.stateCode&&normalizedValue(byId[0].name)===normalizedValue(agency.name)&&normalizedValue(byId[0].registryIdentity?.name??'')===normalizedValue(identity.name);
}
export type ProfileDocument={item:EvidenceReviewItem;label:string;mentions:string[];nextAction:string;status:'document-observation'|'review-required'|'history'};
function describe(item:EvidenceReviewItem,now:number):ProfileDocument{
 const e=item.evidence,def=definitionFor(e.kind)!;
 const mentions=def.family?productMentions(e.value).filter(m=>m.family==='unspecified'||m.family===def.family).map(m=>m.brand+' ('+m.term+')'):[];
 let status:ProfileDocument['status']=item.status==='review-candidate'?'document-observation':['historical','stale','superseded','deadline-passed','closed'].includes(item.status)?'history':'review-required';
 let nextAction='Inspect the original document, scope and date before relying on this observation.';
 if(def.family){
  nextAction=questions[e.kind as ProviderEquipmentKind];
 }else if(e.kind==='procurement-open'){
  nextAction='Confirm current solicitation status, amendments, eligibility and submission instructions in the issuing portal.';
 }else if(e.kind==='procurement-awarded'){
  nextAction='Review award scope and delivery or service terms; an award is not an open bid.';
 }else if(e.kind==='procurement-closed'){
  nextAction='Verify closure or any official reopening; do not treat this record as an open bid.';
 }else if(e.kind==='contract-expiration'){
  nextAction=e.value<utcDay(now)?'Check whether the agreement expired, was extended or renewed.':'Verify the signed agreement, renewal options and purchasing decision timeline.';
 }else if(e.kind==='grant-awarded'){
  nextAction='Confirm award conditions, eligible equipment and remaining funds; the award is not available cash.';
 }else if(e.kind==='capital-approved'){
  nextAction='Confirm the appropriation, eligible equipment and actual purchasing schedule.';
 }
 if(status==='review-required')nextAction='Resolve the source disagreement or local correction before using this record.';
 return {item,label:INTELLIGENCE_DEFINITIONS[e.kind].label,mentions,nextAction,status};
}
/** A read-only local account view. No synthetic data, cloud approvals, imported grant assignment or opportunity score. */
export function buildProviderCompetitiveProfile(agency:Agency,directory:Agency[],now=Date.now()){
 const identityReady=providerIdentityReady(agency,directory);
 const typedCount=(agency.sourceFacts??[]).filter(f=>Boolean(f.intelligence)).length;
 const reconciliation=identityReady?reconcileSharedEvidence(agency,[],{singleCompletePage:true,withheld:0},now):undefined;
 const complete=reconciliation?.complete===true;
 // Only validated, agency-scoped documents may render. Invalid or incomplete collections cannot produce positive observations.
 const docs=(reconciliation?.items??[]).map(i=>describe(i,now));
 // A repeated procurement number from different issuers cannot become an actionable candidate on this account.
 const issuers=new Map<string,Set<string>>();
 for(const d of docs)if(d.item.evidence.kind.startsWith('procurement-')){
  const e=d.item.evidence,k=normalizedValue(e.sourceRecordId),set=issuers.get(k)??new Set<string>();
  set.add(normalizedValue(e.sourceName));issuers.set(k,set);
 }
 for(const d of docs){
  const e=d.item.evidence;
  if(!complete||e.kind.startsWith('procurement-')&&(issuers.get(normalizedValue(e.sourceRecordId))?.size??0)>1){
   d.status='review-required';d.nextAction='Resolve incomplete evidence or conflicting issuer identity before interpreting the document.';
  }
 }
 const equipment=PROVIDER_EQUIPMENT_KINDS.map(kind=>{
  const documents=docs.filter(d=>d.item.evidence.kind===kind);
  const observations=documents.filter(d=>d.status==='document-observation');
  const status=!identityReady||!complete?'review-required':observations.length?'document-observation':documents.some(d=>d.status==='review-required')?'review-required':documents.length?'history':'not-documented';
  return {kind,label:INTELLIGENCE_DEFINITIONS[kind].label,status,documents,observations,question:questions[kind]} as const;
 });
 const purchasing=docs.filter(d=>!definitionFor(d.item.evidence.kind)?.family);
 return {identityReady,complete,typedCount,invalid:reconciliation?.invalid??0,duplicates:reconciliation?.duplicates??0,reason:identityReady?reconciliation?.reason:'A unique, validated source-native identity in the loaded directory is required.',equipment,purchasing,documentedCategories:equipment.filter(e=>e.status==='document-observation').length};
}
/** A bounded grant search may suggest a match only for the selected, eligible account. */
export function providerGrantCandidates(agency:Agency,directory:Agency[],scopes:ResearchScope[],checkedAt:string,now=Date.now()){
 if(!providerIdentityReady(agency,directory))return [];
 const research:StateResearch={state:agency.stateCode,topic:'defibrillator',fromYear:new Date(now).getUTCFullYear()-2,checkedAt,scopes:scopes.filter(s=>s.source==='fema'||s.source==='federal-grants')};
 const key=sharedAgencyKey(agency);
 return assessNationalCandidates(directory,research,now).rows.filter(r=>r.candidate.role==='grant-recipient'&&r.account?.id===agency.id&&sharedAgencyKey(r.account)===key);
}
