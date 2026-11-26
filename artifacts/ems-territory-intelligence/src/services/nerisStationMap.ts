import type {Agency} from '../types';
import {registryClaims} from './registryAccountLink';
import {normalizeCountyName} from '../utils/countyIdentity';
import {loadSourceDirectoryManifest} from './nationalSourceDirectory';
type Address=[string|null,string|null,string|null,string,string|null];
type Point=[number,number]|null;
type Basis='generalized-boundary'|'ambiguous-boundary'|'outside-reported-state-boundaries'|'no-source-coordinate';
export type NerisMapRow={id:string;oid:number;name:string|null;parentId:string;parentName:string;parentState:string;address:Address;coordinates:Point;countyFips:string|null;countyBasis:Basis;exportDate:number|null;sharedPoint:boolean;physicalStreetFormat:boolean;parentNameConflict:boolean};
export type NerisMapChunk={state:string;file:string;count:number;coordinates:number;countyLocated:number;sha256:string};
type Index={schemaVersion:1;source:'NERIS';sourceUrl:string;retrievedAt:string;publication:'source-reported-discovery';endUserValidationRequired:true;parentIndexSha256:string;boundarySha256:string;rowCount:number;coordinateCount:number;distinctPoints:number;countyOutcomes:Record<string,number>;chunks:NerisMapChunk[]};
export type NerisMapData={state:string;rows:NerisMapRow[];countyNames:Record<string,string>;retrievedAt:string};
export type NerisMapGroup={key:string;lat:number;lng:number;rows:NerisMapRow[]};
const states=new Set('AK AL AR AZ CA CO CT DC DE FL GA HI IA ID IL IN KS KY LA MA MD ME MI MN MO MS MT NC ND NE NH NJ NM NV NY OH OK OR PA RI SC SD TN TX UT VA VT WA WI WV WY'.split(' '));
const id=/^[-A-Z0-9]{1,14}$/;
const digest=/^[a-f0-9]{64}$/;
const safe=(v:unknown):v is string|null=>v===null||typeof v==='string'&&v.length<=255&&!/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(v);
const count=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const point=(v:unknown):v is Point=>v===null||Array.isArray(v)&&v.length===2&&v.every(n=>typeof n==='number'&&Number.isFinite(n))&&Math.abs(v[0])<=90&&Math.abs(v[1])<=180&&(v[0]!==0||v[1]!==0);
const bases=new Set<Basis>(['generalized-boundary','ambiguous-boundary','outside-reported-state-boundaries','no-source-coordinate']);
export function validateNerisMapShard(v:unknown,c:NerisMapChunk,names:Record<string,string>):NerisMapRow[]{
 if(!Array.isArray(v)||v.length!==c.count)throw Error('Invalid station map shard');
 const seen=new Set<string>(),oids=new Set<number>();
 let located=0,coords=0;
 for(const s of v){
  if(!s||typeof s.id!=='string'||!id.test(s.id)||seen.has(s.id)||!count(s.oid)||s.oid===0||oids.has(s.oid)||typeof s.parentId!=='string'||!id.test(s.parentId)||s.id===s.parentId||typeof s.parentName!=='string'||!s.parentName||!safe(s.parentName)||!states.has(s.parentState)||!safe(s.name)||!Array.isArray(s.address)||s.address.length!==5||!s.address.every(safe)||s.address[3]!==c.state||!point(s.coordinates)||!bases.has(s.countyBasis)||typeof s.sharedPoint!=='boolean'||s.sharedPoint&&!s.coordinates||typeof s.physicalStreetFormat!=='boolean'||typeof s.parentNameConflict!=='boolean'||!(s.exportDate===null||count(s.exportDate)&&Number.isFinite(new Date(s.exportDate).getTime())))throw Error('Invalid station map row');
  if(s.countyBasis==='generalized-boundary'){
   if(!s.coordinates||typeof s.countyFips!=='string'||!/^\d{5}$/.test(s.countyFips)||!Object.hasOwn(names,s.countyFips))throw Error('Invalid county point evidence');located++;
  }else if(s.countyFips!==null||(s.countyBasis==='no-source-coordinate')!==(s.coordinates===null))throw Error('Conflicting station geography');
  if(s.coordinates)coords++;
  seen.add(s.id);oids.add(s.oid);
 }
 if(coords!==c.coordinates||located!==c.countyLocated)throw Error('Station map shard counts differ');
 return v as NerisMapRow[];
}
function parseIndex(v:unknown):Index{
 const x=v as Index;
 if(!x||x.schemaVersion!==1||x.source!=='NERIS'||x.publication!=='source-reported-discovery'||x.endUserValidationRequired!==true||x.sourceUrl!=='https://services5.arcgis.com/lPbcyJOcoLyZmvo6/arcgis/rest/services/NERIS%20Public%20Fire%20Departments/FeatureServer'||!Number.isFinite(Date.parse(x.retrievedAt))||!digest.test(x.parentIndexSha256)||!digest.test(x.boundarySha256)||x.rowCount!==65970||x.coordinateCount!==65967||x.distinctPoints!==61743||!x.countyOutcomes||Object.keys(x.countyOutcomes).some(k=>!bases.has(k as Basis))||Object.values(x.countyOutcomes).some(v=>!count(v))||Object.values(x.countyOutcomes).reduce((a,b)=>a+b,0)!==x.rowCount||x.countyOutcomes['no-source-coordinate']!==3||!Array.isArray(x.chunks)||x.chunks.length!==51||new Set(x.chunks.map(c=>c.state)).size!==51||x.chunks.some(c=>!states.has(c.state)||c.file!==c.state+'.json'||!count(c.count)||!count(c.coordinates)||!count(c.countyLocated)||c.countyLocated>c.coordinates||c.coordinates>c.count||!digest.test(c.sha256))||x.chunks.reduce((n,c)=>n+c.count,0)!==x.rowCount||x.chunks.reduce((n,c)=>n+c.coordinates,0)!==x.coordinateCount||x.chunks.reduce((n,c)=>n+c.countyLocated,0)!==(x.countyOutcomes['generalized-boundary']??0))throw Error('Invalid national NERIS map index');
 return x;
}
const root=()=>(import.meta.env?.BASE_URL??'/')+'registry/';
async function get(path:string){
 const r=await fetch(root()+path,{cache:'no-cache',signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw Error('Federal station map evidence unavailable');
 return r.text();
}
const hash=async(raw:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw)))].map(b=>b.toString(16).padStart(2,'0')).join('');
let index:Promise<Index>|undefined;
function loadIndex(){
 if(!index)index=Promise.all([get('neris-station-map/index.json'),get('neris-stations/index.json')]).then(async([raw,parent])=>{
  const i=parseIndex(JSON.parse(raw));if(await hash(parent)!==i.parentIndexSha256)throw Error('Station source edition changed');return i;
 }).catch(e=>{index=undefined;throw e});
 return index;
}
const cache=new Map<string,Promise<NerisMapData>>();
export function loadNerisMapState(state:string){
 if(!states.has(state))return Promise.reject(Error('Choose a station state'));
 let pending=cache.get(state);
 if(!pending){
  pending=Promise.all([loadIndex(),loadSourceDirectoryManifest()]).then(async([idx,m])=>{
   const c=idx.chunks.find(c=>c.state===state);if(!c)throw Error('Missing station state shard');
   const raw=await get('neris-station-map/'+c.file);if(await hash(raw)!==c.sha256)throw Error('Station map shard checksum mismatch');
   return {state,rows:validateNerisMapShard(JSON.parse(raw),c,m.countyNames),countyNames:m.countyNames,retrievedAt:idx.retrievedAt};
  }).catch(e=>{cache.delete(state);throw e});
  cache.set(state,pending);
 }
 return pending;
}
const norm=(s:string)=>s.trim().toLowerCase().replace(/\s+/g,' ');
export function filterNerisMap(data:NerisMapData,scope:{state:string;county:string;city:string;query:string;category:'all'|'fire'|'ems'}){
 if(scope.category==='ems'||data.state!==scope.state)return [];
 const q=norm(scope.query).split(' ').filter(Boolean);
 return data.rows.filter(s=>(scope.county==='all'||!!s.countyFips&&(scope.county===s.countyFips||normalizeCountyName(data.countyNames[s.countyFips]??'')===normalizeCountyName(scope.county)))&&(scope.city==='all'||norm(s.address[2]??'')===norm(scope.city))&&q.every(w=>norm([s.id,s.parentId,s.name,s.parentName,...s.address].join(' ')).includes(w)));
}
export function groupNerisMap(rows:NerisMapRow[]):NerisMapGroup[]{
 const groups=new Map<string,NerisMapGroup>();
 for(const r of rows){
  if(!r.coordinates)continue;
  const [lat,lng]=r.coordinates,key=lat+','+lng;
  const g=groups.get(key)??{key,lat,lng,rows:[]};g.rows.push(r);groups.set(key,g);
 }
 return [...groups.values()];
}
/** A source ID opens a saved profile only when one valid native claim owns it. */
export function linkedNerisAccount(parentId:string,agencies:Agency[]):Agency|undefined{
 const key='NERIS:'+parentId;
 const hits=agencies.filter(a=>registryClaims(a).keys.includes(key));
 if(hits.length!==1)return;
 const a=hits[0],claims=registryClaims(a);
 if(claims.keys.filter(k=>k.startsWith('NERIS:')).length!==1||(a.sourceRecordAssociations??[]).some(s=>s.sourceName==='NERIS'&&claims.invalid.includes(s.id)))return;
 return a;
}
