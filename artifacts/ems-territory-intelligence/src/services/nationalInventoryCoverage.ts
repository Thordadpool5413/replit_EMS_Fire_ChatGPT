import type {Agency} from '../types';
import {reconcileSharedEvidence,type EvidenceReviewItem} from './sharedEvidenceReconciliation';
import {INTELLIGENCE_DEFINITIONS,normalizedValue} from './documentedIntelligence';
import {sharedAgencyKey} from './sharedEvidence';
import {registryClaimIndex,canCreateRegistryAccount} from './registryAccountLink';
import {productMentions} from './nationalCompetitiveResearch';

export const INVENTORY_KINDS=['installed-monitor','installed-cpr','installed-ventilator','installed-epcr','installed-cad','installed-billing'] as const;
export type InventoryKind=typeof INVENTORY_KINDS[number];
export type InventoryStatus='documented'|'manufacturer-review'|'review-required'|'historical'|'not-documented';
export const INVENTORY_STATUS:Record<InventoryStatus,string>={documented:'Dated manufacturer observation','manufacturer-review':'Manufacturer needs review','review-required':'Evidence needs reconciliation',historical:'Historical evidence only','not-documented':'No local document'};
export function inventoryEligible(agencies:Agency[]){
 const ids=new Map<string,number>(),claims=registryClaimIndex(agencies);
 for(const a of agencies)ids.set(a.id,(ids.get(a.id)??0)+1);
 return agencies.filter(a=>{
  const key=sharedAgencyKey(a),identity=a.registryIdentity,own=claims.byAccount.get(a);
  return !!a.id&&!!identity&&!!key&&ids.get(a.id)===1&&claims.counts.get(key)===1&&!!own&&!own.invalid.length&&!own.conflicts.length&&canCreateRegistryAccount(identity)&&(!identity.headquartersState||identity.headquartersState===a.stateCode);
 });
}
export type InventoryRow={agency:Agency;identityKey:string;kind:InventoryKind;status:InventoryStatus;documents:EvidenceReviewItem[];makers:string[]};
export function buildInventoryCoverage(agencies:Agency[],state:string,now=Date.now()){
 const eligible=inventoryEligible(agencies).filter(a=>a.stateCode===state),rows:InventoryRow[]=[];
 const counts=Object.fromEntries(INVENTORY_KINDS.map(k=>[k,{documented:0,'manufacturer-review':0,'review-required':0,historical:0,'not-documented':0}])) as Record<InventoryKind,Record<InventoryStatus,number>>;
 for(const agency of eligible){
  const result=reconcileSharedEvidence(agency,[],{singleCompletePage:true,withheld:0},now);
  for(const kind of INVENTORY_KINDS){
   const documents=result.items.filter(i=>i.evidence.kind===kind);
   const candidates=documents.filter(i=>i.status==='review-candidate');
   const current=documents.filter(i=>!['historical','superseded'].includes(i.status));
   const family=INTELLIGENCE_DEFINITIONS[kind].family;
   // Product text is a review hint, never model/quantity or active fleet confirmation.
   const mentions=candidates.map(i=>productMentions(i.evidence.value).filter(m=>m.family===family||m.family==='unspecified'));
   const makers=[...new Set(mentions.flatMap(ms=>ms.map(m=>m.brand)))];
   const status:InventoryStatus=!result.complete||current.some(i=>['conflict','local-review-required','incomplete'].includes(i.status))?'review-required':candidates.length?makers.length===1&&mentions.every(m=>m.length>0)?'documented':'manufacturer-review':documents.length?'historical':'not-documented';
   counts[kind][status]++;
   rows.push({agency,identityKey:sharedAgencyKey(agency)!,kind,status,documents,makers:status==='documented'?makers:[]});
  }
 }
 return {state,loaded:agencies.filter(a=>a.stateCode===state).length,eligible:eligible.length,excluded:agencies.filter(a=>a.stateCode===state).length-eligible.length,counts,rows:rows.sort((a,b)=>a.agency.name.localeCompare(b.agency.name)||a.identityKey.localeCompare(b.identityKey))};
}
