import catalog from './coordinateDecisionCatalog.json';
import {GIS_REVIEW_FIELD} from './addressReviewReconciliation';
export const COORDINATE_DECISION_FIELD='_coordinateEvidenceDecisions';
type Row=Record<string,unknown>;
const obj=(x:unknown):Row=>x&&typeof x==='object'&&!Array.isArray(x)?x as Row:{};
const nonblank=(x:unknown,n:number):x is string=>typeof x==='string'&&x.trim().length>0&&x.length<=n;
const norm=(x:unknown)=>typeof x==='string'?x.normalize('NFKC').trim().toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim():'';
const records=new Map(catalog.candidates.map(c=>[c.sourceKey,c]));
export class CoordinateDecisionError extends Error{}
function history(p:Row):Row[]{
 const raw=p[COORDINATE_DECISION_FIELD];
 if(raw===undefined)return [];
 if(!Array.isArray(raw)||raw.some(r=>!r||typeof r!=='object'||Array.isArray(r)))throw new CoordinateDecisionError('Coordinate history needs reconciliation.');
 const h=raw.map(obj);if(new Set(h.map(r=>r.id)).size!==h.length||h.some(r=>!nonblank(r.id,100)||!['accept','rollback'].includes(String(r.action))))throw new CoordinateDecisionError('Coordinate history needs reconciliation.');
 return h;
}
/** Normal agency writes can neither inject nor delete server-owned decision history. */
export function preserveCoordinateDecisions(current:Row|undefined,incoming:Row):Row{
 const next={...incoming};delete next[COORDINATE_DECISION_FIELD];
 if(current&&Object.hasOwn(current,COORDINATE_DECISION_FIELD))next[COORDINATE_DECISION_FIELD]=history(current);
 return next;
}
function currentIdentity(p:Row):string|undefined{
 const r=obj(p.registryIdentity);if(r.stateCode!==p.stateCode||r.deactivatedAt||typeof r.identifier!=='string'||typeof p.stateCode!=='string')return;
 try{
  const u=new URL(String(r.sourceUrl));if(u.protocol!=='https:'||u.username||u.password||u.port)return;
  const id=r.identifier.trim().toUpperCase();
  if(r.sourceName==='USFA NFDR'&&u.hostname==='apps.usfa.fema.gov'&&/^[-A-Z0-9.]{1,80}$/.test(id))return 'FDID:'+p.stateCode+':'+id;
  if(r.sourceName==='NPPES'&&u.hostname==='npiregistry.cms.hhs.gov'&&/^\d{10}$/.test(id))return 'NPI:'+id;
 }catch{return undefined;}
 return undefined;
}
export function coordinateDecision(p:Row,request:unknown,actor:string,now:string):{payload:Row;entry:Row;replay:boolean}{
 const b=obj(request),h=history(p),last=h.at(-1);
 if(!nonblank(b.id,100)||!nonblank(actor,300)||!Number.isFinite(Date.parse(now))||!['accept','rollback'].includes(String(b.action))||!nonblank(b.reason,4000))throw new CoordinateDecisionError('Explicit decision ID, action and verification basis required.');
 const allowed=b.action==='accept'?['id','action','sourceKey','reviewId','reason','supportingUrl','placementAttestation']:['id','action','targetDecisionId','reason'];
 if(Object.keys(b).some(k=>!allowed.includes(k)))throw new CoordinateDecisionError('Unsupported coordinate decision fields.');
 const prior=h.find(r=>r.id===b.id);
 if(prior){if(prior.actor!==actor||prior.requestSignature!==JSON.stringify(allowed.map(k=>b[k]??null)))throw new CoordinateDecisionError('Decision ID is already in use.');return {payload:p,entry:prior,replay:true};}
 const common={id:b.id,action:b.action,actor,decidedAt:now,reason:b.reason,requestSignature:JSON.stringify(allowed.map(k=>b[k]??null)),publicationEligible:false};
 let entry:Row;
 if(b.action==='rollback'){
  if(last?.action!=='accept'||b.targetDecisionId!==last.id)throw new CoordinateDecisionError('Only the current acceptance can be rolled back.');
  entry={...common,targetDecisionId:last.id,sourceKey:last.sourceKey};
 }else{
  if(last?.action==='accept')throw new CoordinateDecisionError('Roll back the current acceptance before accepting another point.');
  if(!nonblank(b.sourceKey,300)||!nonblank(b.reviewId,300)||!nonblank(b.supportingUrl,2000)||b.placementAttestation!=='independently-checked-address-point')throw new CoordinateDecisionError('Independent address-point placement evidence and acknowledged review required.');
  try{const u=new URL(b.supportingUrl);if(u.protocol!=='https:'||u.username||u.password||u.port)throw Error();}catch{throw new CoordinateDecisionError('Use a valid HTTPS supporting evidence link.');}
  const c=records.get(b.sourceKey),id=obj(p.registryIdentity);
  if(!c||currentIdentity(p)!==c.sourceKey||p.stateCode!==c.state||norm(p.name)!==norm(c.registryName)||norm(id.name)!==norm(c.registryName)||id.sourceDate!==c.registrySourceDate||norm(id.address)!==norm(c.registryAddress.street)||norm(id.city)!==norm(c.registryAddress.city)||id.postalCode!==c.registryAddress.zip)throw new CoordinateDecisionError('Current native identity or registry address differs from retained evidence.');
  if(!c.countyVerified||!c.countyFips||c.sharedSourcePoint||p.countyFips&&p.countyFips!==c.countyFips||id.countyFips&&id.countyFips!==c.countyFips)throw new CoordinateDecisionError('County or shared source-point conflict must be resolved first.');
  if(Array.isArray(p.sourceRecordAssociations)&&p.sourceRecordAssociations.some(a=>obj(a).decision==='confirmed'))throw new CoordinateDecisionError('Additional confirmed registry associations require identity reconciliation before acceptance.');
  const reviews=Array.isArray(p._factReviews)?p._factReviews.map(obj).filter(r=>r.fieldId===GIS_REVIEW_FIELD&&['confirm','flag','correct'].includes(String(r.action))):[];
  if(reviews.some(r=>!nonblank(r.reviewedAt,80)||!Number.isFinite(Date.parse(r.reviewedAt)))||new Set(reviews.map(r=>r.id)).size!==reviews.length)throw new CoordinateDecisionError('Review history is inconsistent.');
  const sorted=reviews.sort((a,b)=>Date.parse(String(b.reviewedAt))-Date.parse(String(a.reviewedAt))),v=sorted[0];
  if(!v||sorted.slice(1).some(r=>Date.parse(String(r.reviewedAt))===Date.parse(String(v.reviewedAt)))||v.id!==b.reviewId||v.agencyId!==p.id||v.action!=='confirm'||v.sourceRecordId!==c.reviewSourceRecordId||v.sourceUrl!==c.reviewSourceUrl||v.sourceName!==c.reviewSourceName||v.sourcePeriod!==c.reviewSourcePeriod||v.sourceKind!=='dataset'||v.originalValue!==c.matchedAddress||v.previousValue!==c.matchedAddress||!nonblank(v.acknowledgedBy,300)||!nonblank(v.acknowledgedAt,80)||!Number.isFinite(Date.parse(v.acknowledgedAt))||Date.parse(v.acknowledgedAt)<Date.parse(String(v.reviewedAt))-300000||Date.parse(v.acknowledgedAt)>Date.parse(now)||!nonblank(v.note,4000))throw new CoordinateDecisionError('Current authenticated confirmation is required.');
  entry={...common,sourceKey:c.sourceKey,reviewId:v.id,objectId:c.objectId,matchedAddress:c.matchedAddress,latitude:c.latitude,longitude:c.longitude,countyFips:c.countyFips,sourceUrl:c.sourceUrl,artifactSha256:c.artifactSha256,snapshotGeneratedAt:catalog.snapshotGeneratedAt,placementAsReported:c.placementAsReported,placementAttestation:b.placementAttestation,supportingUrl:b.supportingUrl};
 }
 return {payload:{...p,[COORDINATE_DECISION_FIELD]:[...h,entry]},entry,replay:false};
}
