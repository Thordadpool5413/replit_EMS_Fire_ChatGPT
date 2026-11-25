import catalog from './addressReviewCatalog.json';
export const GIS_REVIEW_FIELD='identity.address.gis-candidate';
type RecordValue=Record<string,unknown>;
const object=(x:unknown):RecordValue=>x&&typeof x==='object'&&!Array.isArray(x)?x as RecordValue:{};
const text=(x:unknown,max:number):x is string=>typeof x==='string'&&x.trim().length>0&&x.length<=max;
const normalize=(x:unknown)=>typeof x==='string'?x.normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim():'';
const allowed=['id','agencyId','fieldId','action','originalValue','previousValue','reviewer','method','note','supportingUrl','sourceName','sourceUrl','sourceKind','sourcePeriod','sourceRecordId','reviewedAt'];
const stamp=['acknowledgedBy','acknowledgedAt'];
const bySource=new Map(catalog.map(c=>[c.sourceRecordId,c]));
function identityKey(p:RecordValue){
 const id=object(p.registryIdentity),state=p.stateCode;
 if(typeof state!=='string'||id.stateCode!==state||id.deactivatedAt||id.headquartersState&&id.headquartersState!==state||typeof id.identifier!=='string')return;
 const n=id.identifier.trim().toUpperCase();
 try{
  const u=new URL(String(id.sourceUrl));
  if(u.protocol!=='https:'||u.username||u.password||u.port)return;
  if(id.sourceName==='USFA NFDR'&&u.hostname==='apps.usfa.fema.gov'&&/^[-A-Z0-9.]{1,80}$/.test(n))return 'FDID:'+state+':'+n;
  if(id.sourceName==='NPPES'&&u.hostname==='npiregistry.cms.hhs.gov'&&/^\d{10}$/.test(n))return 'NPI:'+n;
 }catch{return;}
}
function comparable(r:RecordValue){return JSON.stringify(allowed.map(k=>r[k]??null));}
function validNew(r:RecordValue,agency:RecordValue,actor:string,now:string){
 if(!text(r.id,300)||r.agencyId!==agency.id||!['review','confirm','flag','note'].includes(String(r.action))||!text(r.reviewer,120)||!text(r.method,240)||typeof r.note!=='string'||r.note.length>4000||(['confirm','flag','note'].includes(String(r.action))&&!r.note.trim())||!text(r.reviewedAt,80)||!Number.isFinite(Date.parse(r.reviewedAt))||Date.parse(r.reviewedAt)>Date.parse(now)+300000||!text(actor,300))return false;
 if(Object.keys(r).some(k=>!allowed.includes(k)&&!stamp.includes(k)))return false;
 if(r.supportingUrl!==undefined){if(!text(r.supportingUrl,2000))return false;try{const u=new URL(r.supportingUrl);if(!['https:','http:'].includes(u.protocol)||u.username||u.password)return false;}catch{return false;}}
 const c=typeof r.sourceRecordId==='string'&&bySource.get(r.sourceRecordId);
 if(!c||identityKey(agency)!==c.identityKey||agency.stateCode!==c.state||normalize(agency.name)!==normalize(c.name)||normalize(object(agency.registryIdentity).name)!==normalize(c.name))return false;
 const county=agency.countyFips;
 if(county&&county!==(c.county??c.registryCounty))return false;
 return r.sourceName===c.sourceName&&r.sourceUrl===c.sourceUrl&&r.sourcePeriod===c.sourcePeriod&&r.sourceKind==='dataset'&&r.originalValue===c.originalValue&&r.previousValue===c.originalValue;
}
export class AddressReviewError extends Error{}
/** Preserve canonical GIS history. Actor and timestamp come from the authenticated server, not the client.
 * No accepted coordinates, operational station claims, or registry changes are derived here. */
export function reconcileAddressReviews(current:RecordValue|undefined,incoming:RecordValue,actor:string,now:string):RecordValue{
 const before=Array.isArray(current?._factReviews)?current._factReviews.map(object):[];
 const incomingRaw=incoming._factReviews;
 const next=Array.isArray(incomingRaw)?incomingRaw.map(object):[];
 const protectedRows=before.filter(r=>r.fieldId===GIS_REVIEW_FIELD);
 const newRows=next.filter(r=>r.fieldId===GIS_REVIEW_FIELD);
 if(!protectedRows.length&&!newRows.length)return incoming;
 if(incomingRaw!==undefined&&!Array.isArray(incomingRaw))throw new AddressReviewError('Invalid review history.');
 const prior=new Map<unknown,RecordValue>();
 for(const r of protectedRows){if(!text(r.id,300)||prior.has(r.id))throw new AddressReviewError('Existing GIS review history needs reconciliation.');prior.set(r.id,r);}
 const seen=new Set<unknown>(),accepted:RecordValue[]=[];
 for(const r of next){
  if(r.fieldId!==GIS_REVIEW_FIELD){
   if(prior.has(r.id)||newRows.some(n=>n.id===r.id))throw new AddressReviewError('Review ID conflicts with GIS evidence history.');
   accepted.push(r);continue;
  }
  if(!text(r.id,300)||seen.has(r.id))throw new AddressReviewError('Duplicate or invalid GIS review ID.');
  seen.add(r.id);
  const old=prior.get(r.id);
  if(old){if(comparable(old)!==comparable(r)||Object.keys(r).some(k=>!allowed.includes(k)&&!stamp.includes(k)))throw new AddressReviewError('Previously recorded GIS review is immutable.');accepted.push(old);continue;}
  if(before.some(b=>b.id===r.id)||!validNew(r,incoming,actor,now))throw new AddressReviewError('GIS review does not match current source evidence.');
  const clean=Object.fromEntries(allowed.filter(k=>Object.hasOwn(r,k)).map(k=>[k,r[k]]));
  accepted.push({...clean,acknowledgedBy:actor,acknowledgedAt:now});
 }
 for(const old of protectedRows)if(!seen.has(old.id))accepted.push(old);
 return {...incoming,_factReviews:accepted};
}
