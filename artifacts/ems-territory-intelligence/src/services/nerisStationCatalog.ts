import type {Agency} from '../types';
import {registryClaims,registryClaimIndex} from './registryAccountLink';
const SOURCE='https://services5.arcgis.com/lPbcyJOcoLyZmvo6/arcgis/rest/services/NERIS%20Public%20Fire%20Departments/FeatureServer';
const DATE='2026-11-26T04:09:46.464391+00:00';
const digest=/^[a-f0-9]{64}$/;
const native=/^[-A-Z0-9]{1,14}$/;
const state=/^[A-Z]{2}$/;
type Address=[string|null,string|null,string|null,string,string|null];
type Point=[number,number]|null;
export interface NerisCatalogStation {id:string;parentId:string;oid:number;name:string|null;address:Address;coordinates:Point;exportDate:number|null;sharedPoint:boolean;physicalStreetFormat:boolean;parentNameConflict:boolean}
export interface NerisCatalogDepartment {id:string;name:string;state:string;oid:number;address:Address;coordinates:Point;exportDate:number|null;reportedStationCount:number|null;departmentType:string|null;entityType:string|null;stations:NerisCatalogStation[]}
type Chunk={state:string;file:string;departmentCount:number;stationCount:number;sha256:string};
type Index={schemaVersion:1;source:'NERIS';publication:'review-only';sourceUrl:string;referenceUrl:string;retrievedAt:string;artifactId:number;artifactSha256:string;sourceSha256:string;summary:Record<string,number>;chunks:Chunk[];prefixStates:Record<string,string[]>;verifiedStations:0;newMapped:0;endUserValidationRequired:true};
const text=(v:unknown):v is string|null=>v===null||typeof v==='string'&&v.length<=255&&!/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(v);
const date=(v:unknown)=>v===null||typeof v==='number'&&Number.isSafeInteger(v)&&Number.isFinite(new Date(v).getTime());
const oid=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>0;
const addr=(v:unknown):v is Address=>Array.isArray(v)&&v.length===5&&v.every(text)&&typeof v[3]==='string'&&state.test(v[3]);
const point=(v:unknown):v is Point=>v===null||Array.isArray(v)&&v.length===2&&v.every(n=>typeof n==='number'&&Number.isFinite(n))&&Math.abs(v[0])<=90&&Math.abs(v[1])<=180&&(v[0]!==0||v[1]!==0);
export function validateNerisShard(v:unknown,chunk:Chunk):NerisCatalogDepartment[]{
 if(!Array.isArray(v)||v.length!==chunk.departmentCount)throw Error('Invalid NERIS department shard');
 const parents=new Set<string>(),children=new Set<string>(),doids=new Set<number>(),soids=new Set<number>();
 for(const d of v){
  if(!d||typeof d.id!=='string'||!native.test(d.id)||parents.has(d.id)||!oid(d.oid)||doids.has(d.oid)||typeof d.name!=='string'||!d.name||!text(d.name)||d.state!==chunk.state||!addr(d.address)||d.address[3]!==d.state||!point(d.coordinates)||!date(d.exportDate)||!(d.reportedStationCount===null||Number.isSafeInteger(d.reportedStationCount)&&d.reportedStationCount>=0)||!text(d.departmentType)||!text(d.entityType)||!Array.isArray(d.stations))throw Error('Invalid NERIS parent evidence');
  parents.add(d.id);doids.add(d.oid);
  for(const s of d.stations){
   if(!s||typeof s.id!=='string'||!native.test(s.id)||children.has(s.id)||s.parentId!==d.id||!oid(s.oid)||soids.has(s.oid)||!text(s.name)||!addr(s.address)||!point(s.coordinates)||!date(s.exportDate)||typeof s.sharedPoint!=='boolean'||s.sharedPoint&&!s.coordinates||typeof s.physicalStreetFormat!=='boolean'||typeof s.parentNameConflict!=='boolean')throw Error('Invalid NERIS child station evidence');
   children.add(s.id);soids.add(s.oid);
  }
 }
 if(children.size!==chunk.stationCount||[...children].some(id=>parents.has(id)))throw Error('NERIS station count or identity mismatch');
 return v as NerisCatalogDepartment[];
}
function validateIndex(v:unknown):Index{
 const x=v as Index;
 if(!x||x.schemaVersion!==1||x.source!=='NERIS'||x.publication!=='review-only'||x.sourceUrl!==SOURCE||x.referenceUrl!=='https://www.usfa.fema.gov/neris/public/'||x.retrievedAt!==DATE||x.artifactId!==15086965702||x.artifactSha256!=='33cd802653cd7f76c6c43bd063ee22fa927b841a504eea1293dcb681c8b2874b'||x.sourceSha256!=='1ec2a427cbc5ea1949ff731527de3c701ed9592bc4fa83fe796a54defa18880b'||x.verifiedStations!==0||x.newMapped!==0||x.endUserValidationRequired!==true||x.summary?.eligibleDepartments!==30672||x.summary?.eligibleStations!==65970||x.summary?.sourceCoordinates!==65967||!Array.isArray(x.chunks)||x.chunks.length!==51||new Set(x.chunks.map(c=>c.state)).size!==51||x.chunks.some(c=>!state.test(c.state)||c.file!==c.state+'.json'||!oid(c.departmentCount)||!Number.isSafeInteger(c.stationCount)||c.stationCount<0||!digest.test(c.sha256))||x.chunks.reduce((n,c)=>n+c.departmentCount,0)!==30672||x.chunks.reduce((n,c)=>n+c.stationCount,0)!==65970||!x.prefixStates||Object.keys(x.prefixStates).length!==51||Object.entries(x.prefixStates).some(([p,s])=>!/^[-A-Z0-9]{1,4}$/.test(p)||!Array.isArray(s)||!s.length||new Set(s).size!==s.length||s.some(t=>!x.chunks.some(c=>c.state===t))))throw Error('Invalid NERIS catalog index');
 return x;
}
const base=()=>(import.meta.env?.BASE_URL??'/')+'registry/neris-stations/';
async function getText(file:string){
 const r=await fetch(base()+file,{cache:'no-cache',signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw Error('Retained NERIS source unavailable');
 return r.text();
}
let index:Promise<Index>|undefined;
function loadIndex(){
 if(!index)index=getText('index.json').then(r=>validateIndex(JSON.parse(r))).catch(e=>{index=undefined;throw e});
 return index;
}
const cache=new Map<string,Promise<NerisCatalogDepartment[]>>();
async function loadShard(c:Chunk){
 let p=cache.get(c.state);
 if(!p){
  p=(async()=>{const raw=await getText(c.file);const h=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw)))].map(b=>b.toString(16).padStart(2,'0')).join('');if(h!==c.sha256)throw Error('NERIS shard integrity failure');return validateNerisShard(JSON.parse(raw),c)})().catch(e=>{cache.delete(c.state);throw e});
  cache.set(c.state,p);
 }
 return p;
}
export const nerisAddressText=(a:Address)=>a.filter(Boolean).join(', ');
export const nerisCatalogDate=DATE;
export function nerisObjectUrl(layer:0|1,oid:number){return SOURCE+'/'+layer+'/query?'+new URLSearchParams({where:'OBJECTID='+oid,outFields:'OBJECTID,neris_id,export_date',returnGeometry:'true',outSR:'4326',f:'pjson'});}
export async function loadNerisStateCatalog(s:string){
 const i=await loadIndex(),c=i.chunks.find(c=>c.state===s);return {retrievedAt:i.retrievedAt,departments:c?await loadShard(c):[]};
}
export async function loadNerisDepartment(id:string){
 if(!native.test(id))throw Error('Invalid NERIS identifier');
 const i=await loadIndex(),states=i.prefixStates[id.slice(0,4)]??[];
 const matches=(await Promise.all(i.chunks.filter(c=>states.includes(c.state)).map(loadShard))).flat().filter(d=>d.id===id);
 if(matches.length>1)throw Error('Conflicting NERIS parent identity');
 return matches[0]??null;
}
export function profileNerisId(a:Agency,directory:Agency[]):string|null{
 const claims=registryClaims(a),keys=claims.keys.filter(k=>k.startsWith('NERIS:'));
 if(keys.length!==1||!native.test(keys[0].slice(6))||(a.sourceRecordAssociations??[]).some(s=>s.sourceName==='NERIS'&&claims.invalid.includes(s.id)))return null;
 const accounts=directory.some(d=>d.id===a.id)?directory:[...directory,a];
 if(accounts.filter(d=>d.id===a.id).length!==1||registryClaimIndex(accounts).counts.get(keys[0])!==1)return null;
 return keys[0].slice(6);
}
