import type {Agency} from '../types';
import {registryClaims,registryClaimIndex} from './registryAccountLink';
export type LegacyAddress=[string|null,string|null,string|null,string,string|null];
type DepartmentCandidate={id:string;oid:number;name:string;state:string};
type StationCandidate={id:string;oid:number;name:string|null;parentId:string;parentName:string;parentState:string;parentNameCityZipCorroborated:boolean};
export type LegacyStation={sourceKey:string;sourceRow:number;name:string|null;address:LegacyAddress;physicalAddressCandidate:{street:string;city:string;state:string;zip:string}|null;duplicateSourceFields:boolean;nerisAddressCandidates:StationCandidate[]};
export type LegacyParent={key:string;fdid:string;state:string;name:string;city:string;zip:string;nerisParentCandidates:DepartmentCandidate[];stations:LegacyStation[]};
type Chunk={state:string;file:string;parents:number;stations:number;sha256:string};
type Index={schemaVersion:1;source:string;publication:'review-only';sourceUrl:string;referenceUrl:string;retrievedAt:string;sourceEditionDate:null;artifactId:number;artifactSha256:string;sourceSha256:string;nationalRegistrySha256:string;nerisIndexSha256:string;counts:Record<string,number>;comparisonCounts:Record<string,number>;chunks:Chunk[];endUserValidationRequired:true;newMapped:0;verifiedStations:0};
const states=new Set('AK AL AR AZ CA CO CT DC DE FL GA HI IA ID IL IN KS KY LA MA MD ME MI MN MO MS MT NC ND NE NH NJ NM NV NY OH OK OR PA RI SC SD TN TX UT VA VT WA WI WV WY'.split(' '));
const hex=/^[a-f0-9]{64}$/,native=/^[-A-Z0-9]{1,14}$/,fdid=/^[-A-Z0-9.]{1,80}$/;
const safe=(v:unknown):v is string|null=>v===null||typeof v==='string'&&v.length<=500&&!/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(v);
const positive=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
export function validateLegacyStationShard(v:unknown,c:Chunk):LegacyParent[]{
 if(!Array.isArray(v)||v.length!==c.parents)throw Error('Invalid USFA parent shard');
 const keys=new Set<string>(),rowKeys=new Set<string>();
 for(const p of v){
  if(!p||p.state!==c.state||typeof p.fdid!=='string'||!fdid.test(p.fdid)||p.key!=='FDID:'+p.state+':'+p.fdid||keys.has(p.key)||typeof p.name!=='string'||!p.name||!safe(p.name)||typeof p.city!=='string'||!safe(p.city)||typeof p.zip!=='string'||!safe(p.zip)||!Array.isArray(p.nerisParentCandidates)||!Array.isArray(p.stations)||!p.stations.length)throw Error('Invalid USFA parent evidence');
  keys.add(p.key);
  const parentIds=new Set<string>();
  for(const d of p.nerisParentCandidates){
   if(!d||typeof d.id!=='string'||!native.test(d.id)||parentIds.has(d.id)||!positive(d.oid)||typeof d.name!=='string'||!safe(d.name)||d.state!==p.state)throw Error('Invalid NERIS parent comparison');
   parentIds.add(d.id);
  }
  for(const s of p.stations){
   if(!s||!positive(s.sourceRow)||typeof s.sourceKey!=='string'||!new RegExp('^USFA-STATION-ROW:'+s.sourceRow+':[a-f0-9]{16}$').test(s.sourceKey)||rowKeys.has(s.sourceKey)||!safe(s.name)||!Array.isArray(s.address)||s.address.length!==5||!s.address.every(safe)||!states.has(s.address[3])||typeof s.duplicateSourceFields!=='boolean'||!Array.isArray(s.nerisAddressCandidates))throw Error('Invalid historical station evidence');
   const a=s.physicalAddressCandidate;if(a!==null&&(!a||typeof a.street!=='string'||!safe(a.street)||typeof a.city!=='string'||!safe(a.city)||a.state!==s.address[3]||!/^\d{5}$/.test(a.zip)))throw Error('Invalid reported physical address');
   const seen=new Set<string>();
   for(const n of s.nerisAddressCandidates){
    if(!n||typeof n.id!=='string'||!native.test(n.id)||seen.has(n.id)||!positive(n.oid)||!safe(n.name)||typeof n.parentId!=='string'||!native.test(n.parentId)||typeof n.parentName!=='string'||!safe(n.parentName)||!states.has(n.parentState)||n.parentNameCityZipCorroborated!==parentIds.has(n.parentId))throw Error('Invalid NERIS station comparison');
    seen.add(n.id);
   }
   rowKeys.add(s.sourceKey);
  }
 }
 if(rowKeys.size!==c.stations)throw Error('USFA station count mismatch');
 return v as LegacyParent[];
}
function validateIndex(v:unknown):Index{
 const i=v as Index;
 if(!i||i.schemaVersion!==1||i.source!=='USFA legacy station address export'||i.publication!=='review-only'||i.sourceUrl!=='https://apps.usfa.fema.gov/registry/api/download/station'||i.referenceUrl!=='https://apps.usfa.fema.gov/registry/download'||i.sourceEditionDate!==null||i.retrievedAt!=='2026-11-26T04:18:15.309630+00:00'||i.artifactId!==15086119349||i.artifactSha256!=='a57656fcee56732c802fa09a350a96f022fde7b073872f8435aec54c9e6b1242'||i.sourceSha256!=='4314234fda43d59ee3315b1ba3dc43e0ef9c6af866e972e035b8d23ed134f75f'||i.nationalRegistrySha256!=='6d828632d3933a2815e497bfa189ae4af75e9b847911903b94bc4f0966b748ca'||!hex.test(i.nerisIndexSha256)||i.counts?.retainedRows!==8071||i.counts?.distinctMatchedParents!==3212||i.endUserValidationRequired!==true||i.verifiedStations!==0||i.newMapped!==0||!Array.isArray(i.chunks)||i.chunks.length>51||new Set(i.chunks.map(c=>c.state)).size!==i.chunks.length||i.chunks.some(c=>!states.has(c.state)||c.file!==c.state+'.json'||!positive(c.parents)||!positive(c.stations)||!hex.test(c.sha256))||i.chunks.reduce((n,c)=>n+c.parents,0)!==3212||i.chunks.reduce((n,c)=>n+c.stations,0)!==8071)throw Error('Invalid USFA evidence index');
 return i;
}
const root=()=>(import.meta.env?.BASE_URL??'/')+'registry/';
async function get(p:string){const r=await fetch(root()+p,{cache:'no-cache',signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Historical station evidence unavailable');return r.text();}
const hash=async(raw:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw)))].map(b=>b.toString(16).padStart(2,'0')).join('');
let index:Promise<Index>|undefined;
function loadIndex(){
 if(!index)index=Promise.all([get('usfa-stations/index.json'),get('national/index.json'),get('neris-stations/index.json')]).then(async([raw,nat,neris])=>{const i=validateIndex(JSON.parse(raw));if(await hash(nat)!==i.nationalRegistrySha256||await hash(neris)!==i.nerisIndexSha256)throw Error('Comparison source edition changed');return i;}).catch(e=>{index=undefined;throw e;});
 return index;
}
const cache=new Map<string,Promise<LegacyParent[]>>();
export function loadLegacyStationState(state:string){
 if(!states.has(state))return Promise.reject(Error('Invalid legacy parent state'));
 let pending=cache.get(state);
 if(!pending){
  pending=loadIndex().then(async i=>{const c=i.chunks.find(c=>c.state===state);if(!c)return [];const raw=await get('usfa-stations/'+c.file);if(await hash(raw)!==c.sha256)throw Error('USFA shard checksum mismatch');return validateLegacyStationShard(JSON.parse(raw),c);}).catch(e=>{cache.delete(state);throw e;});
  cache.set(state,pending);
 }
 return pending;
}
export async function loadLegacyStationParent(key:string){
 const m=/^FDID:([A-Z]{2}):([-A-Z0-9.]{1,80})$/.exec(key);if(!m||!states.has(m[1]))throw Error('Invalid state-scoped FDID');
 return (await loadLegacyStationState(m[1])).find(p=>p.key===key)??null;
}
export function legacyProfileKey(a:Agency,directory:Agency[]){
 const claims=registryClaims(a),keys=claims.keys.filter(k=>k.startsWith('FDID:'));
 if(keys.length!==1||(a.sourceRecordAssociations??[]).some(s=>s.sourceName==='USFA NFDR'&&claims.invalid.includes(s.id)))return null;
 const accounts=directory.some(d=>d.id===a.id)?directory:[...directory,a];
 if(accounts.filter(d=>d.id===a.id).length!==1||registryClaimIndex(accounts).counts.get(keys[0])!==1)return null;
 return keys[0];
}
