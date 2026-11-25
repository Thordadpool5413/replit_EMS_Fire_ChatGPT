import type {ProfileAddressReview} from './multiStateAddressReview';
import {ADDRESS_CANDIDATE_FIELD,candidateReviewSource,candidateValidationState} from './addressCandidateValidation';
import type {FactReviewEntry} from './factReviewStore';
export type AddressAcknowledgment='not-checked'|'unavailable'|'awaiting-acknowledgment'|'server-confirmed'|'server-flagged'|'stale-or-conflicting';
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const nonblank=(v:unknown):v is string=>typeof v==='string'&&!!v.trim();
const decision=(r:Record<string,unknown>)=>r.fieldId===ADDRESS_CANDIDATE_FIELD&&['confirm','flag','correct'].includes(String(r.action));
const keys=['id','agencyId','fieldId','action','originalValue','previousValue','reviewer','method','note','supportingUrl','sourceName','sourceUrl','sourceKind','sourcePeriod','sourceRecordId','reviewedAt'];
const equivalent=(a:Record<string,unknown>,b:Record<string,unknown>)=>keys.every(k=>(a[k]??null)===(b[k]??null));
function latest(rows:Record<string,unknown>[]){
 return [...rows].sort((a,b)=>Date.parse(String(b.reviewedAt))-Date.parse(String(a.reviewedAt)))[0];
}
function validDecision(r:Record<string,unknown>,agencyId:string){
 return r.agencyId===agencyId&&nonblank(r.id)&&nonblank(r.reviewedAt)&&Number.isFinite(Date.parse(r.reviewedAt))&&nonblank(r.reviewer)&&nonblank(r.method)&&nonblank(r.note);
}
/** Only fresh private API response is allowed as server evidence. Cached/local stamps are never used. */
export function addressReviewAcknowledgment(candidate:ProfileAddressReview,agencyId:string,local:FactReviewEntry[],server:unknown[]|null|undefined):AddressAcknowledgment{
 if(server===undefined)return 'not-checked';
 if(server===null)return 'unavailable';
 const localRows=local.filter(r=>r.agencyId===agencyId&&r.fieldId===ADDRESS_CANDIDATE_FIELD&&['confirm','flag','correct'].includes(r.action)) as unknown as Record<string,unknown>[];
 const serverRows=server.filter(object).filter(decision);
 if(serverRows.some(r=>!validDecision(r,agencyId))||localRows.some(r=>!validDecision(r,agencyId))||new Set(serverRows.map(r=>r.id)).size!==serverRows.length)return 'stale-or-conflicting';
 const l=latest(localRows),s=latest(serverRows);
 if(!s)return l?'awaiting-acknowledgment':'not-checked';
 if(l&&l.id===s.id&&!equivalent(l,s))return 'stale-or-conflicting';
 if(l&&l.id!==s.id&&Date.parse(String(l.reviewedAt))>=Date.parse(String(s.reviewedAt)))return 'awaiting-acknowledgment';
 if(serverRows.some(r=>r.id!==s.id&&Date.parse(String(r.reviewedAt))===Date.parse(String(s.reviewedAt))))return 'stale-or-conflicting';
 if(!nonblank(s.acknowledgedBy)||!nonblank(s.acknowledgedAt)||!Number.isFinite(Date.parse(s.acknowledgedAt))||Date.parse(s.acknowledgedAt)<Date.parse(String(s.reviewedAt))-300000)return 'awaiting-acknowledgment';
 const source=candidateReviewSource(candidate);
 if(s.sourceRecordId!==source.sourceRecordId||s.sourceName!==source.sourceName||s.sourceUrl!==source.sourceUrl||s.sourceKind!==source.sourceKind||s.sourcePeriod!==source.reportingPeriod||s.originalValue!==candidate.matchedAddress||s.previousValue!==candidate.matchedAddress)return 'stale-or-conflicting';
 const state=candidateValidationState(candidate,[s as unknown as FactReviewEntry]);
 return state==='User confirmed this value'?'server-confirmed':state==='Discrepancy flagged'?'server-flagged':'stale-or-conflicting';
}
export const ADDRESS_ACK_LABEL:Record<AddressAcknowledgment,string>={
 'not-checked':'No server-acknowledged decision established',
 'unavailable':'Server review status unavailable; no publication',
 'awaiting-acknowledgment':'Review awaiting server acknowledgment',
 'server-confirmed':'Server-acknowledged address evidence; not a published pin',
 'server-flagged':'Server-acknowledged discrepancy; no publication',
 'stale-or-conflicting':'Evidence changed or conflicts; review again before publication'
};
/** No reviewed candidate is eligible for map publication in this release.
 * Acknowledgment is necessary, not sufficient: coordinate provenance, placement,
 * independent county and explicit publication/rollback authorization are separate gates. */
export function coordinatePublicationGate(candidate:ProfileAddressReview,ack:AddressAcknowledgment){
 const reasons:string[]=[];
 if(ack!=='server-confirmed')reasons.push('current authenticated confirmation required');
 if(!candidate.countyVerified)reasons.push('independent county verification required');
 if(!candidate.placementAsReported||candidate.placementAsReported.toUpperCase()==='UNKNOWN')reasons.push('point placement not established');
 if(candidate.sharedSourcePoint)reasons.push('shared source point requires identity review');
 reasons.push('coordinate provenance and publication authorization not implemented');
 return {eligible:false as const,reasons};
}
