import type {Agency} from '../types';
import {canCreateRegistryAccount,registryIdentityKey,type RegistryIdentity} from './registryAccountLink';
import {loadSourceDirectoryState} from './nationalSourceDirectory';
import {snapshotRegistryIdentity} from './registryAccountLink';
import {loadFloridaRoster,floridaRegistryIdentity} from './floridaEmsRoster';
import {isGeographicProspect} from '../utils/providerRecordTrust';
import {parseStreetAddress,validateNpiAddress,validateAddressMatch,addressKey,addressText,isPhysicalStreet,compatibleSourceAddress,parseRegistryStreet,type StreetAddress,type AddressMatch} from './providerLocationContract';
import {useSyncExternalStore} from 'react';
import {loadNationalLocationState,loadedLocationState,matchingSnapshotLocation,snapshotSourceUrl} from './nationalLocationSnapshot';

export type ProviderLocation={address:StreetAddress;sourceName:string;sourceUrl:string;sourceDate?:string|null;identityKey:string;kind:'registry headquarters'|'registered practice location'|'recorded license address'|'source-reported address'|'official department location'};
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
  if(/USFA|NFDR/i.test(s.sourceName)&&typeof f.fdid==='string'&&[f.fdid,state+':'+f.fdid,'usfa:'+state+':'+f.fdid,state+'-'+f.fdid].includes(s.sourceRecordId))id={...common,sourceName:'USFA NFDR',identifier:f.fdid,address:typeof f.headquartersAddress==='string'?f.headquartersAddress:undefined};
  else if(/NPPES|NPI/i.test(s.sourceName)&&typeof (f.npi??f.npiNumber)==='string'&&s.sourceRecordId===String(f.npi??f.npiNumber))id={...common,sourceName:'NPPES',identifier:String(f.npi??f.npiNumber)};
  else if(s.sourceName==='NERIS'&&typeof f.nerisId==='string'&&s.sourceRecordId===f.nerisId)id={...common,sourceName:'NERIS',identifier:f.nerisId,address:typeof f.headquartersAddress==='string'?f.headquartersAddress:undefined};
  else if(s.sourceName==='State EMS'&&state==='FL'&&f.identifierKind==='license'&&typeof f.stateAgencyId==='string'&&/^\d{1,12}$/.test(f.stateAgencyId)&&s.sourceRecordId==='FL:'+f.stateAgencyId&&s.sourceUrl==='https://www.floridahealth.gov/wp-content/uploads/2025/08/ems-providers.pdf'&&(!f.headquartersState||f.headquartersState==='FL')){
   // Older reviewed links lack the complete license metadata. They may retrieve an exact
   // active source record from the bundled roster, never use the incomplete link as address evidence.
   id={...common,sourceName:'State EMS',identifierKind:'license',identifier:f.stateAgencyId,headquartersState:'FL'};
   list.push(id);continue;
  }
  // Do not promote a merely associated NPI address to an operating station. Use its explicit practice location label.
  if(id&&canCreateRegistryAccount(id))list.push(id);
 }
 return list;
}
function fromIdentity(id:RegistryIdentity):ProviderLocation|undefined{
 const address=parseRegistryStreet(id.address,id.city,id.stateCode,id.postalCode);
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
 if(locations.some((l,i)=>locations.slice(i+1).some(other=>!compatibleSourceAddress(l.address,other.address))))return undefined;
 return ids.find(i=>fromIdentity(i)?.address.zip)??ids.find(i=>fromIdentity(i))??ids[0];
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
export async function loadProviderLocationState(state:string){
 const before=loadedLocationState(state),data=await loadNationalLocationState(state);
 if(data&&!before)notify();
 return data;
}
function snapshotFor(a:Agency,directory:Agency[]){
 const id=nativeIdentity(a,directory);
 if(!id)return undefined;
 return matchingSnapshotLocation(id,recordedProviderLocation(a,directory)?.address);
}
function snapshotLocation(a:Agency,directory:Agency[]):ProviderLocation|undefined{
 const e=snapshotFor(a,directory);if(!e?.address)return undefined;
 return {address:e.address,identityKey:e.key,sourceName:e.officialAddressEvidence?.authority??(e.source==='NPPES'?'CMS NPPES':e.source==='USFA'?'USFA NFDR':'Florida Department of Health'),sourceUrl:snapshotSourceUrl(e),sourceDate:e.officialAddressEvidence?.checkedAt??e.sourceDate,kind:e.officialAddressEvidence?'official department location':e.source==='USFA'?'registry headquarters':e.source==='NPPES'?'registered practice location':'recorded license address'};
}
export function displayedProviderLocation(a:Agency,directory:Agency[]){return snapshotLocation(a,directory)??recordedProviderLocation(a,directory)??lookup(a,directory)?.location;}
export function mappedProviderLocation(a:Agency,directory:Agency[]){
 const e=snapshotFor(a,directory);
 if(e?.match){if((e.sourceCounty&&e.sourceCounty!==e.countyFips)||(a.countyFips&&a.countyFips!==e.countyFips))return undefined;return e.match;}
 const c=lookup(a,directory),loc=displayedProviderLocation(a,directory);
 return c?.match&&loc&&addressKey(loc.address)===addressKey(c.location.address)?c.match:undefined;
}
export function locationStatus(a:Agency,directory:Agency[]):string{
 const pin=mappedProviderLocation(a,directory);
 if(pin)return pin.method==='nad-address-point'?'Mapped · USDOT public address point':pin.method==='ohio-lbrs-address-point'?'Mapped · Ohio LBRS address point':pin.method==='ny-sam-address-point'?'Mapped · New York SAM address point':pin.method==='regional-address-point'?(pin.point.source==='tx-stratmap'?'Mapped · official address point (placement not reported)':'Mapped · official regional address point'):'Mapped · approximate street location';
 const loc=displayedProviderLocation(a,directory),id=nativeIdentity(a,directory);
 if(!loc)return id?'Source address not found; review required':'Provider identity or location source needs review';
 if(!isPhysicalStreet(loc.address.street))return 'Recorded mailing or nonstandard address; physical site not established';
 if(!loc.address.zip)return 'Street address recorded; ZIP not supplied';
 const raw=id&&loadedLocationState(id.stateCode)?.entries.get(registryIdentityKey(id)??'');
 if(raw?.status==='no-match')return 'Street address recorded; no accepted public coordinate match';
 if(raw?.status==='unavailable')return 'Street address recorded; geocoder unavailable';
 if(raw?.match)return 'Address or county disagreement; map location withheld';
 if(raw?.status==='historical')return 'Historical source record; active site not established';
 return 'Street address recorded; map location not established';
}
export function canResearchProviderLocation(a:Agency,directory:Agency[]){return !!nativeIdentity(a,directory)||!!recordedProviderLocation(a,directory);}
async function fetchJson(url:string,signal:AbortSignal){
 const r=await fetch(url,{cache:'no-store',credentials:'omit',signal:AbortSignal.any([signal,AbortSignal.timeout(22_000)]),headers:{Accept:'application/json'}});
 if(!r.ok)throw Error('Public location source unavailable (HTTP '+r.status+').');
 return r.json();
}
function put(a:Agency,c:Cached){if(cache.size>=500&&!cache.has(a.id)){const first=cache.keys().next().value;if(first!==undefined)cache.delete(first);}cache.set(a.id,c);notify();}
export async function researchProviderLocation(a:Agency,directory:Agency[],signal:AbortSignal,geocode=false):Promise<ProviderLocation|undefined>{
 await loadProviderLocationState(a.stateCode);
 if(signal.aborted)throw Error('Location research canceled.');
 const id=nativeIdentity(a,directory),recorded=recordedProviderLocation(a,directory),bind=binding(a,id,recorded);
 let loc=displayedProviderLocation(a,directory);
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
 let match=mappedProviderLocation(a,directory);
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
 if(!loadedLocationState(a.stateCode)&&!cache.has(a.id))return a;
 const match=mappedProviderLocation(a,directory),loc=displayedProviderLocation(a,directory);
 if(!match||!loc)return a;
 const e=snapshotFor(a,directory),county=e?.match&&(!a.countyFips||a.countyFips===e.countyFips)&&(!e.sourceCounty||e.sourceCounty===e.countyFips)?e:undefined;
 return {...a,address:loc.address.street,city:loc.address.city,zipCode:loc.address.zip,latitude:match.latitude,longitude:match.longitude,googleMapsUri:locationDirections(loc),...(county&&!a.countyFips?{countyFips:county.countyFips,county:county.countyName??a.county}:{})};
}
