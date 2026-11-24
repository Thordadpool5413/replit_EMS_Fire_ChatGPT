import {compatibleSourceAddress,parseStreetAddress,isPhysicalStreet,validateAddressMatch,type StreetAddress,type AddressMatch} from './providerLocationContract';
import {loadSourceDirectoryManifest,type SourceDirectoryRecord} from './nationalSourceDirectory';
import {registryIdentityKey,snapshotRegistryIdentity,type RegistryIdentity} from './registryAccountLink';

export type LocationStatus='mapped'|'no-match'|'not-eligible'|'source-missing'|'unavailable'|'review'|'historical'|'pending';
export type SnapshotLocation={key:string;name:string;state:string;source:'USFA'|'NPPES'|'State EMS';sourceDate:string|null;address:StreetAddress|null;status:LocationStatus;match:AddressMatch|null;sourceCounty:string;countyFips:string;countyName?:string};
type Chunk={state:string;file:string;count:number;sha256:string;registrySha256:string};
type LocationManifest={schemaVersion:1;generatedAt:string;benchmark:'Public_AR_Current';vintage:'Current_Current';chunks:Chunk[];nppesArchive:{status:'processed'|'unavailable'}};
export type LocationState={generatedAt:string;entries:ReadonlyMap<string,SnapshotLocation>;nppesProcessed:boolean};
const statuses=new Set<LocationStatus>(['mapped','no-match','not-eligible','source-missing','unavailable','review','historical','pending']);
const statePattern=/^[A-Z]{2}$/;
const hashPattern=/^[a-f0-9]{64}$/;
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const nameKey=(s:string)=>s.normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim();
export function parseSnapshotEntry(value:unknown,state:string,counties:Readonly<Record<string,string>>):SnapshotLocation{
 if(!record(value))throw Error('Invalid location record.');
 const e=value as unknown as SnapshotLocation;
 const key=e.key;
 if(typeof key!=='string'||e.state!==state||typeof e.name!=='string'||!e.name.trim()||e.name.length>400||!statuses.has(e.status)||!['USFA','NPPES','State EMS'].includes(e.source)||typeof e.sourceCounty!=='string'||typeof e.countyFips!=='string'||!(e.sourceDate===null||typeof e.sourceDate==='string'&&e.sourceDate.length<=100))throw Error('Invalid location identity.');
 if(e.source==='USFA'&&(!key.startsWith('FDID:'+state+':')||!/^[-A-Z0-9.]{1,80}$/.test(key.split(':')[2]??'')||key.split(':').length!==3||key.includes(':LOCATION-'))||e.source==='NPPES'&&!/^NPI:\d{10}$/.test(key)||e.source==='State EMS'&&(state!=='FL'||!/^STATE-EMS:FL:license:\d{1,12}$/.test(key)))throw Error('Wrong source location identity.');
 const address=e.address===null?null:parseStreetAddress(e.address);
 if(e.address!==null&&(!address||address.state!==state))throw Error('Invalid street address.');
 if(e.status==='mapped'){
  if(!address||!e.match||!/^\d{5}$/.test(e.countyFips)||!Object.hasOwn(counties,e.countyFips))throw Error('Invalid mapped location.');
  const match=validateAddressMatch(e.match,address);
  if(!match||match.method==='nad-address-point'&&match.point.countyFips!==e.countyFips)throw Error('Missing or conflicting map match.');
  return {...e,address,match,countyName:counties[e.countyFips]};
 }
 if(e.match!==null||e.countyFips)throw Error('Unmapped record contains coordinates.');
 return {...e,address:address??null,match:null};
}
const loaded=new Map<string,LocationState>(),pending=new Map<string,Promise<LocationState|undefined>>();
let manifestPromise:Promise<LocationManifest|undefined>|undefined;
const base=()=> (import.meta.env?.BASE_URL??'/')+'registry/locations/';
async function manifest(){
 if(!manifestPromise)manifestPromise=(async()=>{
  const response=await fetch(base()+'index.json',{cache:'no-cache',signal:AbortSignal.timeout(15000)});
  if(!response.ok)return undefined;
  const data=await response.json() as LocationManifest;
  if(data.schemaVersion!==1||data.benchmark!=='Public_AR_Current'||data.vintage!=='Current_Current'||!Number.isFinite(Date.parse(data.generatedAt))||!Array.isArray(data.chunks)||data.chunks.length!==51||new Set(data.chunks.map(c=>c.state)).size!==51||data.chunks.some(c=>!statePattern.test(c.state)||c.file!==c.state+'.json'||!Number.isSafeInteger(c.count)||c.count<0||c.count>15000||!hashPattern.test(c.sha256)||!hashPattern.test(c.registrySha256))||!['processed','unavailable'].includes(data.nppesArchive?.status))throw Error('Location index invalid.');
  return data;
 })().catch(()=>undefined);
 return manifestPromise;
}
export function loadedLocationState(state:string){return loaded.get(state);}
export async function loadNationalLocationState(state:string):Promise<LocationState|undefined>{
 if(!statePattern.test(state))return undefined;
 const existing=loaded.get(state);if(existing)return existing;
 const current=pending.get(state);if(current)return current;
 const task=(async()=>{
  const [index,registry]=await Promise.all([manifest(),loadSourceDirectoryManifest()]);
  if(!index)return undefined;
  const chunk=index.chunks.find(c=>c.state===state);
  if(!chunk||chunk.registrySha256!==registry.chunks.find(c=>c.state===state)?.sha256)throw Error('Location data does not match this registry release.');
  const response=await fetch(base()+chunk.file,{cache:'no-cache',signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw Error('State locations unavailable.');
  const content=await response.text();if(content.length>8_000_000)throw Error('Location shard too large.');
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(content));
  if([...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')!==chunk.sha256)throw Error('Location integrity check failed.');
  const rows:unknown=JSON.parse(content);
  if(!Array.isArray(rows)||rows.length!==chunk.count)throw Error('Location count mismatch.');
  const entries=new Map<string,SnapshotLocation>();
  for(const value of rows){const entry=parseSnapshotEntry(value,state,registry.countyNames);if(entries.has(entry.key))throw Error('Duplicate location identity.');entries.set(entry.key,entry);}
  const result={generatedAt:index.generatedAt,entries,nppesProcessed:index.nppesArchive.status==='processed'};
  loaded.set(state,result);return result;
 })().catch(()=>undefined).finally(()=>pending.delete(state));
 pending.set(state,task);return task;
}
export function matchingSnapshotLocation(id:RegistryIdentity,known?:StreetAddress):SnapshotLocation|undefined{
 const key=registryIdentityKey(id);if(!key)return undefined;
 const e=loaded.get(id.stateCode)?.entries.get(key);
 if(!e||!e.address||e.status==='historical'||e.status==='review'||nameKey(e.name)!==nameKey(id.name)||known&&!compatibleSourceAddress(known,e.address))return undefined;
 return e;
}
/** Enrich only the source directory view; preserve original source-county relationships and raw records. */
export function enrichRegistryRow(row:SourceDirectoryRecord,locations:LocationState|undefined):SourceDirectoryRecord{
 const id=snapshotRegistryIdentity(row);
 const key=id&&registryIdentityKey(id);
 const e=key&&locations?.entries.get(key);
 if(!id||!e||!e.address||e.status==='review'||e.status==='historical'||nameKey(e.name)!==nameKey(row[2])||e.state!==row[3])return row;
 const a=parseStreetAddress({street:row[10],city:row[4],state:row[3],zip:row[5]});
 if(a&&!compatibleSourceAddress(a,e.address))return row;
 const out=[...row] as SourceDirectoryRecord;
 out[10]=e.address.street;out[4]=e.address.city;out[5]=row[5]||e.address.zip;
 if(!out[6]&&e.match&&e.countyFips){out[6]=e.countyFips;out[8]=e.match.method;}
 return out;
}
export type ListingLocation={address:StreetAddress|null;status:'mapped'|'missing-identity'|'source-missing'|'not-eligible'|'historical'|'review'|'pending'|'unavailable'|'no-match'|'not-checked';match:AddressMatch|null};
export function listingLocation(row:SourceDirectoryRecord,locations:LocationState|undefined):ListingLocation{
 const id=snapshotRegistryIdentity(row),key=id&&registryIdentityKey(id);
 const address=parseStreetAddress({street:row[10],city:row[4],state:row[3],zip:row[5]})??null;
 if(row[9])return {address,status:'historical',match:null};
 if(!key)return {address,status:'missing-identity',match:null};
 const e=locations?.entries.get(key);
 if(!e)return {address,status:address?'not-checked':'source-missing',match:null};
 if(e.state!==row[3]||nameKey(e.name)!==nameKey(row[2])||address&&e.address&&!compatibleSourceAddress(address,e.address))return {address,status:'review',match:null};
 if(e.status==='historical'||e.status==='review')return {address:address??e.address,status:e.status,match:null};
 const loc=e.address??address;
 if(!loc)return {address:null,status:'source-missing',match:null};
 if(!isPhysicalStreet(loc.street)||!loc.zip)return {address:loc,status:'not-eligible',match:null};
 if(e.match&&(e.sourceCounty&&e.sourceCounty!==e.countyFips||row[6]&&row[6]!==e.countyFips))return {address:loc,status:'review',match:null};
 return {address:loc,status:e.status,match:e.match};
}
export const LISTING_LOCATION_LABELS:Record<ListingLocation['status'],string>={
 mapped:'Mapped street address', 'missing-identity':'Registry ID not reported; location association needs review', 'source-missing':'Street address not reported', 'not-eligible':'Mailing/nonstandard address or ZIP missing; no street pin', historical:'Historical source record', review:'Source or county disagreement; review required', pending:'Address recovered; coordinate match pending', unavailable:'Geocoder unavailable; retry required', 'no-match':'No exact street match; research required', 'not-checked':'Address recorded; coordinates not checked',
};
export function snapshotSourceUrl(e:SnapshotLocation){
 return e.source==='NPPES'?'https://npiregistry.cms.hhs.gov/provider-view/'+e.key.slice(4):e.source==='USFA'?'https://apps.usfa.fema.gov/registry/search':'https://www.floridahealth.gov/wp-content/uploads/2025/08/ems-providers.pdf';
}
export function snapshotMapRows(state:LocationState|undefined,scope:{county:string;city:string;category:string}){
 const normalize=(s:string)=>s.trim().toLowerCase().replace(/\s+(county|parish|borough|planning region|census area|municipality)$/,'');
 return [...(state?.entries.values()??[])].filter(e=>e.status==='mapped'&&e.match&&e.address&&(!e.sourceCounty||e.sourceCounty===e.countyFips)&&(scope.category==='all'||(scope.category==='fire'?e.source==='USFA':e.source!=='USFA'))&&(scope.county==='all'||e.countyFips===scope.county||normalize(e.countyName??'')===normalize(scope.county))&&(scope.city==='all'||normalize(e.address.city)===normalize(scope.city)));
}
