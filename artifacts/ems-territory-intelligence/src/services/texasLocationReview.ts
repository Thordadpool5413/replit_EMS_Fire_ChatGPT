import type {Agency} from '../types';
import {registryIdentityKey,registryClaimIndex,canCreateRegistryAccount} from './registryAccountLink';
import {loadRawTexasReviewRoster,type TexasReviewCatalog} from './texasEmsReviewRoster';
const rosterHash='d249639d7a6a19d1c41e895ebab11d8b6fdd2a7dc0ee263d008b1894388ee34c';
const url='https://services3.arcgis.com/vljlarU2635mITsl/arcgis/rest/services/EMS_Provider_Station_Locations_September_2025/FeatureServer/6';
const artifactHash='731e0df30443604a1434ee4f22a071ad892878f0133f7d85191092be7f0c0a2b';
const sourcePrefix='ecb5d6e9d46646aca33b55be5bbacd38:6:';
const digest=/^[a-f0-9]{64}$/;
const keyPattern=/^(?:FDID:TX:[-A-Z0-9.]+|NPI:\d{10})$/;
export interface TexasLocationCandidate {
 sourceKey:string;objectId:number;parentReviewKey:string;parentName:string;parentIdentifier:string;parentNationalReviewKeys:string[];
 reportedAddress:{street:string;city:string;state:'TX';zip:string};matchedAddress:string;
 sourceGeometry:{latitude:number;longitude:number};geocodeType:'PointAddress';score:100;sourceEdition:'2025-09';
 stationIdentityEstablished:false;endUserValidationRequired:true;publicationEligible:false;
}
export interface TexasLocationCatalog {
 schemaVersion:1;publication:'review-only';sourceUrl:string;sourceEdition:'2025-09';checkedAt:string;
 artifactId:15079638432;artifactSha256:string;rosterSha256:string;
 sourceFeatureCount:735;parentMatchCount:566;mailingMatchCount:707;withheldCount:724;verifiedStations:0;candidates:TexasLocationCandidate[];
}
function nonempty(s:unknown):s is string{return typeof s==='string'&&s.trim().length>0&&s.length<=600}
export function validateTexasLocationCatalog(v:unknown,roster:TexasReviewCatalog):TexasLocationCatalog{
 const x=v as TexasLocationCatalog;
 if(!x||x.schemaVersion!==1||x.publication!=='review-only'||x.sourceUrl!==url||x.sourceEdition!=='2025-09'||!Number.isFinite(Date.parse(x.checkedAt))||x.artifactId!==15079638432||x.artifactSha256!==artifactHash||x.rosterSha256!==rosterHash||x.sourceFeatureCount!==735||x.parentMatchCount!==566||x.mailingMatchCount!==707||x.withheldCount!==724||x.verifiedStations!==0||!Array.isArray(x.candidates)||x.candidates.length!==11)throw Error('Invalid Texas historical location catalog');
 const parentKeys=new Set<string>(),objectKeys=new Set<string>(),coords=new Set<string>();
 const parents=new Map(roster.records.filter(r=>r.rosterKind==='provider').map(r=>[r.sourceKey,r]));
 for(const c of x.candidates){
  if(!c||!Number.isSafeInteger(c.objectId)||c.objectId<=0||c.sourceKey!==sourcePrefix+c.objectId||objectKeys.has(c.sourceKey)||parentKeys.has(c.parentReviewKey)||c.parentReviewKey!=='TX-DSHS:license:'+c.parentIdentifier||!/^\d{6,7}$/.test(c.parentIdentifier)||c.sourceEdition!=='2025-09'||c.stationIdentityEstablished!==false||c.publicationEligible!==false||c.endUserValidationRequired!==true||c.score!==100||c.geocodeType!=='PointAddress'||!nonempty(c.matchedAddress))throw Error('Invalid historical candidate');
  const p=parents.get(c.parentReviewKey),a=c.reportedAddress,g=c.sourceGeometry;
  if(!p||p.identifier!==c.parentIdentifier||p.name!==c.parentName||p.licenseDateConflict||!Array.isArray(c.parentNationalReviewKeys)||c.parentNationalReviewKeys.some(k=>!keyPattern.test(k))||JSON.stringify(c.parentNationalReviewKeys)!==JSON.stringify(p.nationalReviewCandidates.map(k=>k.sourceKey)))throw Error('Texas source parent changed');
  if(!a||!nonempty(a.street)||!nonempty(a.city)||a.state!=='TX'||!/^\d{5}$/.test(a.zip)||!g||!Number.isFinite(g.latitude)||!Number.isFinite(g.longitude)||g.latitude<25.8||g.latitude>36.6||g.longitude< -106.7||g.longitude> -93.5)throw Error('Invalid historical address evidence');
  const loc=g.latitude+':'+g.longitude;if(coords.has(loc))throw Error('Shared historical point');
  objectKeys.add(c.sourceKey);parentKeys.add(c.parentReviewKey);coords.add(loc);
 }
 return x;
}
let pending:Promise<TexasLocationCatalog>|undefined;
export function loadTexasLocationCatalog():Promise<TexasLocationCatalog>{
 if(!pending)pending=(async()=>{
  const base=(import.meta.env?.BASE_URL??'/')+'registry/state-ems-review/';
  const idx=await fetch(base+'TX-location-index.json',{cache:'no-cache',signal:AbortSignal.timeout(30000)}).then(r=>{if(!r.ok)throw Error('Historical Texas location index unavailable');return r.json()});
  if(idx.schemaVersion!==1||idx.publication!=='review-only'||idx.file!=='TX-location-review.json'||idx.count!==11||idx.rosterSha256!==rosterHash||!digest.test(idx.sha256))throw Error('Invalid Texas location index');
  const raw=await fetch(base+idx.file,{cache:'no-cache',signal:AbortSignal.timeout(30000)}).then(r=>{if(!r.ok)throw Error('Historical Texas location catalog unavailable');return r.text()});
  const h=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw)))].map(b=>b.toString(16).padStart(2,'0')).join('');
  if(h!==idx.sha256)throw Error('Texas historical location integrity check failed');
  return validateTexasLocationCatalog(JSON.parse(raw),await loadRawTexasReviewRoster());
 })().catch(e=>{pending=undefined;throw e});
 return pending;
}
/** Never attach a historical point as the saved account's location. Match comparison evidence only. */
export function texasLocationProfileCandidates(a:Agency,directory:Agency[],catalog:TexasLocationCatalog):TexasLocationCandidate[]{
 const id=a.registryIdentity;
 if(a.stateCode!=='TX'||!id||id.stateCode!=='TX'||!canCreateRegistryAccount(id))return [];
 const key=registryIdentityKey(id);
 if(!key||!keyPattern.test(key))return [];
 const index=registryClaimIndex(directory),claims=index.byAccount.get(directory.find(x=>x.id===a.id)??a);
 if(directory.filter(x=>x.id===a.id).length!==1||index.counts.get(key)!==1||!claims||claims.invalid.length||claims.conflicts.length||!claims.keys.includes(key))return [];
 return catalog.candidates.filter(c=>c.parentNationalReviewKeys.includes(key));
}
