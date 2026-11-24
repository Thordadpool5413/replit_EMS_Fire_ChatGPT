import type {Agency} from '../types';
import {canCreateRegistryAccount,registryIdentityKey,type RegistryIdentity} from './registryAccountLink';
import {loadSourceDirectoryState} from './nationalSourceDirectory';
import {snapshotRegistryIdentity} from './registryAccountLink';
import {loadFloridaRoster,floridaRegistryIdentity} from './floridaEmsRoster';
import {isGeographicProspect} from '../utils/providerRecordTrust';
import {parseStreetAddress,validateNpiAddress,validateAddressMatch,addressKey,addressText,isPhysicalStreet,type StreetAddress,type AddressMatch} from './providerLocationContract';
import {useSyncExternalStore} from 'react';

export type ProviderLocation={address:StreetAddress;sourceName:string;sourceUrl:string;sourceDate?:string|null;identityKey:string;kind:'registry headquarters'|'registered practice location'|'recorded license address'|'source-reported address'};
const norm=(s:unknown)=>typeof s==='string'?s.normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim():'';
const https=(v:unknown):v is string=>{try{const u=new URL(String(v));return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}};
const flagged=(a:Agency)=>a._factReviews?.some(r=>r.fieldId==='identity.address'&&(r.action==='flag'||r.action==='correct'));
function identities(a:Agency):RegistryIdentity[]{
 const list:RegistryIdentity[]=[];
 const direct=a.registryIdentity;
 if(direct&&canCreateRegistryAccount(direct)&&direct.stateCode===a.stateCode&&(!direct.headquartersState||direct.headquartersState===a.stateCode))list.push(direct);
 for(const s of a.sourceRecordAssociations??[]){
  if(s.decision!=='confirmed'||!https(s.sourceUrl))continue;
  const f=s.sourceFields;
  if(!f||typeof f!=='object')continue;
  const state=String(f.stateCode??a.stateCode),name=String(f.agencyName??f.organizationName??f.officialName??'');
  if(state!==a.stateCode||!name||!norm(name))continue;
  const common={stateCode:state,name,city:typeof f.city==='string'?f.city:undefined,postalCode:typeof f.postalCode==='string'?f.postalCode:typeof f.zipCode==='string'?f.zipCode:undefined,sourceUrl:s.sourceUrl,sourceDate:s.sourceDate,retrievedAt:s.retrievedAt};
  let id:RegistryIdentity|undefined;
  if(/USFA|NFDR/i.test(s.sourceName)&&typeof f.fdid==='string')id={...common,sourceName:'USFA NFDR',identifier:f.fdid,address:typeof f.headquartersAddress==='string'?f.headquartersAddress:undefined};
  else if(/NPPES|NPI/i.test(s.sourceName)&&typeof (f.npi??f.npiNumber)==='string')id={...common,sourceName:'NPPES',identifier:String(f.npi??f.npiNumber)};
  // Do not promote a merely associated NPI address to an operating station. Use its explicit practice location label.
  if(id&&canCreateRegistryAccount(id))list.push(id);
 }
 return list;
}
function fromIdentity(id:RegistryIdentity):ProviderLocation|undefined{
 const address=parseStreetAddress({street:id.address,city:id.city,state:id.stateCode,zip:id.postalCode});
 const key=registryIdentityKey(id);if(!address||!key)return undefined;
 return {address,identityKey:key,sourceName:id.sourceAuthority||id.sourceName,sourceUrl:id.sourceUrl,sourceDate:id.sourceDate,kind:id.sourceName==='NPPES'?'registered practice location':id.sourceName==='State EMS'?'recorded license address':'registry headquarters'};
}
// Index loaded identity keys once per immutable directory array instead of scanning the full directory per pin.
const directoryIndexes=new WeakMap<Agency[],{ids:Map<string,number>;keys:Map<string,string[]>}>();
function directoryIndex(directory:Agency[]){
 const previous=directoryIndexes.get(directory);if(previous)return previous;
 const ids=new Map<string,number>(),keys=new Map<string,string[]>();
 for(const a of directory){
  ids.set(a.id,(ids.get(a.id)??0)+1);
  for(const key of new Set(identities(a).map(registryIdentityKey))){
   if(!key)continue;const owners=keys.get(key)??[];owners.push(a.id);keys.set(key,owners);
  }
 }
 const index={ids,keys};directoryIndexes.set(directory,index);return index;
}
function nativeIdentity(a:Agency,directory:Agency[]):RegistryIdentity|undefined{
 if(flagged(a)||!a.id)return undefined;
 const all=identities(a),direct=a.registryIdentity&&canCreateRegistryAccount(a.registryIdentity)?registryIdentityKey(a.registryIdentity):undefined;
 const ids=direct?all.filter(i=>registryIdentityKey(i)===direct):all;
 const keys=[...new Set(ids.map(registryIdentityKey))];
 if(keys.length!==1)return undefined;
 const key=keys[0];if(!key)return undefined;
 const index=directoryIndex(directory),owners=index.keys.get(key)??[];
 if(index.ids.get(a.id)!==1||owners.length!==1||owners[0]!==a.id)return undefined;
 // Direct registry identity wins over a confirmed duplicate association; never merge differing addresses.
 const locations=ids.flatMap(i=>{const l=fromIdentity(i);return l?[l]:[];});
 if(new Set(locations.map(l=>addressKey(l.address))).size>1)return undefined;
 return ids.find(i=>fromIdentity(i))??ids[0];
}
export function recordedProviderLocation(a:Agency,directory:Agency[]):ProviderLocation|undefined{
 const id=nativeIdentity(a,directory);
 if(id){const location=fromIdentity(id);if(location)return location;}
 // A legacy agency address needs an explicit reviewed agency-level source, not a county model.
 const e=a.factEvidence?.providerAddress;
 if(!flagged(a)&&!isGeographicProspect(a)&&!a.registryIdentity&&e?.reviewed&&e.geographicLevel==='agency'&&e.sourceKind!=='logic'&&https(e.sourceUrl)&&directoryIndex(directory).ids.get(a.id)===1){
  const address=parseStreetAddress({street:a.address,city:a.city,state:a.stateCode,zip:a.zipCode});
  if(address)return {address,identityKey:'reviewed:'+a.id,sourceName:e.sourceName,sourceUrl:e.sourceUrl,sourceDate:e.reportingPeriod,kind:'source-reported address'};
 }
 return undefined;
}
type Cached={identityKey:string;location:ProviderLocation;match?:AddressMatch;checkedAt:number;binding:string};
const cache=new Map<string,Cached>(),listeners=new Set<()=>void>();
let revision=0;
const notify=()=>{revision++;for(const l of listeners)l();};
let expiryTimer:ReturnType<typeof setInterval>|undefined;
const subscribe=(l:()=>void)=>{
 listeners.add(l);
 if(!expiryTimer)expiryTimer=setInterval(()=>{
  let changed=false;
  for(const [id,c] of cache)if(c.checkedAt+60*60_000<=Date.now()){cache.delete(id);changed=true;}
  if(changed)notify();
 },60_000);
 return()=>{listeners.delete(l);if(!listeners.size&&expiryTimer){clearInterval(expiryTimer);expiryTimer=undefined;}};
};
export function useLocationRevision(){return useSyncExternalStore(subscribe,()=>revision,()=>0);}
function binding(a:Agency,id:RegistryIdentity|undefined,location:ProviderLocation|undefined){
 return JSON.stringify([a.id,a.stateCode,a.name,id,location,flagged(a)??false]);
}
function lookup(a:Agency,directory:Agency[]):Cached|undefined{
 const c=cache.get(a.id);
 if(!c||c.checkedAt+60*60_000<Date.now())return undefined;
 const id=nativeIdentity(a,directory),loc=recordedProviderLocation(a,directory);
 if(c.binding!==binding(a,id,loc))return undefined;
 return c;
}
export function displayedProviderLocation(a:Agency,directory:Agency[]){return lookup(a,directory)?.location??recordedProviderLocation(a,directory);}
export function mappedProviderLocation(a:Agency,directory:Agency[]){return lookup(a,directory)?.match;}
export function canResearchProviderLocation(a:Agency,directory:Agency[]){return !!nativeIdentity(a,directory)||!!recordedProviderLocation(a,directory);}
async function fetchJson(url:string,signal:AbortSignal){
 const r=await fetch(url,{cache:'no-store',credentials:'omit',signal:AbortSignal.any([signal,AbortSignal.timeout(22_000)]),headers:{Accept:'application/json'}});
 if(!r.ok)throw Error('Public location source unavailable (HTTP '+r.status+').');
 return r.json();
}
function put(a:Agency,c:Cached){if(cache.size>=500&&!cache.has(a.id)){const first=cache.keys().next().value;if(first!==undefined)cache.delete(first);}cache.set(a.id,c);notify();}
export async function researchProviderLocation(a:Agency,directory:Agency[],signal:AbortSignal,geocode=false):Promise<ProviderLocation|undefined>{
 const id=nativeIdentity(a,directory),recorded=recordedProviderLocation(a,directory),bind=binding(a,id,recorded);
 let loc=lookup(a,directory)?.location??recorded;
 if(!loc&&id){
  if(id.sourceName==='NPPES'){
   const found=validateNpiAddress(await fetchJson('/api/discovery/provider-address?npi='+encodeURIComponent(id.identifier),signal),id.identifier);
   if(found&&found.address.state===id.stateCode&&norm(found.name)===norm(id.name))loc={address:found.address,identityKey:registryIdentityKey(id)!,sourceName:'CMS NPPES',sourceUrl:'https://npiregistry.cms.hhs.gov/provider-view/'+id.identifier,sourceDate:found.sourceDate,kind:'registered practice location'};
  }else if(id.sourceName==='USFA NFDR'){
   const rows=await loadSourceDirectoryState(id.stateCode);
   const exact=rows.filter(r=>r[1]==='USFA'&&r[0]==='usfa:'+id.stateCode+':'+id.identifier);
   if(exact.length===1&&norm(exact[0][2])===norm(id.name)){const fresh=snapshotRegistryIdentity(exact[0]);if(fresh)loc=fromIdentity(fresh);}
  }else if(id.sourceName==='State EMS'&&id.stateCode==='FL'){
   const roster=await loadFloridaRoster(),rows=roster.records.filter(r=>r.identifier===id.identifier&&r.headquartersState==='FL'&&norm(r.name)===norm(id.name));
   if(rows.length===1){const fresh=floridaRegistryIdentity(roster,rows[0],new Map());if(fresh)loc=fromIdentity(fresh);}
  }
 }
 if(signal.aborted)throw Error('Location research canceled.');
 if(!loc)return undefined;
 let match=lookup(a,directory)?.match;
 if(geocode&&loc.address.zip&&isPhysicalStreet(loc.address.street)&&!match&&loc.kind!=='source-reported address'){
  const params=new URLSearchParams(loc.address);
  match=validateAddressMatch(await fetchJson('/api/discovery/address-location?'+params,signal),loc.address)??undefined;
 }
 if(signal.aborted)throw Error('Location research canceled.');
 put(a,{identityKey:loc.identityKey,location:loc,match,checkedAt:Date.now(),binding:bind});
 return loc;
}
export function locationDirections(loc:ProviderLocation){return 'https://www.google.com/maps/dir/?api=1&destination='+encodeURIComponent(addressText(loc.address));}
export function locationOverlay(a:Agency,directory:Agency[]):Agency{
 const c=lookup(a,directory);
 if(!c?.match)return a;
 return {...a,address:c.location.address.street,city:c.location.address.city,zipCode:c.location.address.zip,latitude:c.match.latitude,longitude:c.match.longitude,googleMapsUri:locationDirections(c.location)};
}
