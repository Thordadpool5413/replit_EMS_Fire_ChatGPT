import type {ProfileAddressReview} from './multiStateAddressReview';
import type {FactReviewEntry} from './factReviewStore';
import {addressReviewAcknowledgment} from './addressReviewAcknowledgment';
import {ADDRESS_CANDIDATE_FIELD} from './addressCandidateValidation';
export type CoordinateEntry={id:string;action:'accept'|'rollback';sourceKey:string;actor:string;decidedAt:string;publicationEligible:false;targetDecisionId?:string;reviewId?:string;matchedAddress?:string;latitude?:number;longitude?:number};
export type CoordinateSnapshot={agencyId:string;revision:number;reviews:unknown[];history:CoordinateEntry[]};
export type CoordinateRequest={id:string;action:'accept';sourceKey:string;reviewId:string;reason:string;supportingUrl:string;placementAttestation:'independently-checked-address-point';expectedRevision:number}|{id:string;action:'rollback';targetDecisionId:string;reason:string;expectedRevision:number};
const obj=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const str=(x:unknown):x is string=>typeof x==='string'&&!!x.trim();
export function parseCoordinateEntry(x:unknown):CoordinateEntry{
 if(!obj(x)||!str(x.id)||!str(x.actor)||!str(x.sourceKey)||!str(x.decidedAt)||!Number.isFinite(Date.parse(x.decidedAt))||x.publicationEligible!==false)throw Error('Invalid coordinate decision receipt.');
 if(x.action==='accept'){
  if(!str(x.reviewId)||!str(x.matchedAddress)||typeof x.latitude!=='number'||typeof x.longitude!=='number'||!Number.isFinite(x.latitude)||!Number.isFinite(x.longitude)||Math.abs(x.latitude)>90||Math.abs(x.longitude)>180)throw Error('Invalid coordinate evidence.');
 }else if(x.action==='rollback'){if(!str(x.targetDecisionId))throw Error('Invalid rollback receipt.');}
 else throw Error('Unknown coordinate decision.');
 return x as CoordinateEntry;
}
export function parseCoordinateSnapshot(x:unknown,agencyId:string):CoordinateSnapshot{
 if(!obj(x)||x.id!==agencyId||typeof x.revision!=='number'||!Number.isSafeInteger(x.revision)||x.revision<1||!obj(x.agency)||x.agency.id!==agencyId)throw Error('Current provider record unavailable.');
 const a=x.agency;
 if(a._factReviews!==undefined&&!Array.isArray(a._factReviews)||a._coordinateEvidenceDecisions!==undefined&&!Array.isArray(a._coordinateEvidenceDecisions))throw Error('Invalid private review history.');
 const history=(Array.isArray(a._coordinateEvidenceDecisions)?a._coordinateEvidenceDecisions:[]).map(parseCoordinateEntry);
 let active:CoordinateEntry|undefined;const seen=new Set<string>();
 for(const e of history){
  if(seen.has(e.id))throw Error('Duplicate decision ID.');seen.add(e.id);
  if(e.action==='accept'){if(active)throw Error('Conflicting coordinate decisions.');active=e;}
  else{if(!active||e.targetDecisionId!==active.id||e.sourceKey!==active.sourceKey)throw Error('Invalid rollback history.');active=undefined;}
 }
 return {agencyId,revision:x.revision,reviews:Array.isArray(a._factReviews)?a._factReviews:[],history};
}
export function activeCoordinateDecision(s:CoordinateSnapshot){const last=s.history.at(-1);return last?.action==='accept'?last:undefined;}
export function coordinateAcceptanceReview(c:ProfileAddressReview|undefined,s:CoordinateSnapshot,local:FactReviewEntry[]):string|undefined{
 if(!c||!c.countyVerified||c.sharedSourcePoint||activeCoordinateDecision(s)||addressReviewAcknowledgment(c,s.agencyId,local,s.reviews)!=='server-confirmed')return undefined;
 const v=s.reviews.filter(obj).filter(r=>r.fieldId===ADDRESS_CANDIDATE_FIELD&&['confirm','flag','correct'].includes(String(r.action))).sort((a,b)=>Date.parse(String(b.reviewedAt))-Date.parse(String(a.reviewedAt)))[0];
 return v?.action==='confirm'&&str(v.id)?v.id:undefined;
}
export function coordinateReceipt(x:unknown,r:CoordinateRequest):CoordinateEntry{
 if(!obj(x)||typeof x.revision!=='number'||!Number.isSafeInteger(x.revision)||x.revision<=r.expectedRevision)throw Error('Decision acknowledgment not established; refresh before retrying.');
 const e=parseCoordinateEntry(x.entry);
 if(e.id!==r.id||e.action!==r.action||(r.action==='accept'?(e.sourceKey!==r.sourceKey||e.reviewId!==r.reviewId):e.targetDecisionId!==r.targetDecisionId))throw Error('Unexpected decision acknowledgment; refresh before retrying.');
 return e;
}
export function validCoordinateSupportUrl(v:string){try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&v.length<=2000;}catch{return false;}}
