import {boundedJson} from './publicIntelligenceDiscovery';
import {validNpi,parseStreetAddress,validateNpiAddress,validateAddressMatch,matchedStreet,isPhysicalStreet,geocodeStreet,type StreetAddress,type NpiAddress,type AddressMatch} from './providerLocationContract';
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export function parseNppesLocation(payload:unknown,npi:string):NpiAddress|null{
 if(!validNpi(npi)||!obj(payload)||payload.Errors||payload.errors||!Array.isArray(payload.results)||payload.result_count!==payload.results.length)throw Error('Invalid NPPES response.');
 if(payload.results.length===0)return null;
 if(payload.results.length!==1)throw Error('Ambiguous NPI response.');
 const r=payload.results[0];
 if(!obj(r)||String(r.number)!==npi||r.enumeration_type!=='NPI-2'||!obj(r.basic)||r.basic.status!=='A'||!Array.isArray(r.taxonomies)||!r.taxonomies.some(t=>obj(t)&&typeof t.code==='string'&&t.code.startsWith('3416'))||!Array.isArray(r.addresses))return null;
 const locations=r.addresses.filter(a=>obj(a)&&a.address_purpose==='LOCATION'&&a.country_code==='US');
 if(locations.length!==1)return null;
 const loc=locations[0] as Record<string,unknown>;
 const address=parseStreetAddress({street:[loc.address_1,loc.address_2].filter(s=>typeof s==='string'&&s.trim()).join(', '),city:loc.city,state:loc.state,zip:loc.postal_code});
 if(!address)return null;
 return validateNpiAddress({npi,name:r.basic.organization_name,address,sourceDate:typeof r.basic.last_updated==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(r.basic.last_updated)?r.basic.last_updated:null},npi);
}
export function parseCensusLocation(payload:unknown,address:StreetAddress):AddressMatch|null{
 if(!obj(payload)||!obj(payload.result)||!Array.isArray(payload.result.addressMatches))throw Error('Invalid Census response.');
 const matches=payload.result.addressMatches;
 if(matches.length!==1)return null;
 const m=matches[0];
 if(!obj(m)||!obj(m.coordinates)||typeof m.matchedAddress!=='string'||!matchedStreet(address,m.matchedAddress))return null;
 return validateAddressMatch({latitude:m.coordinates.y,longitude:m.coordinates.x,matchedAddress:m.matchedAddress,method:'census-address-range'},address);
}
export async function fetchNppesLocation(npi:string,fetcher:typeof fetch=fetch){
 if(!validNpi(npi))throw Error('Invalid NPI.');
 const u=new URL('https://npiregistry.cms.hhs.gov/api/');u.searchParams.set('version','2.1');u.searchParams.set('number',npi);
 return parseNppesLocation(await boundedJson(await fetcher(u,{headers:{Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15_000)}),'NPPES address'),npi);
}
export async function fetchCensusLocation(a:StreetAddress,fetcher:typeof fetch=fetch){
 if(!parseStreetAddress(a)||!a.zip||!isPhysicalStreet(a.street))throw Error('Street address required.');
 const u=new URL('https://geocoding.geo.census.gov/geocoder/locations/address');
 for(const [key,value] of Object.entries({street:geocodeStreet(a.street),city:a.city,state:a.state,zip:a.zip,benchmark:'Public_AR_Current',format:'json'}))u.searchParams.set(key,value);
 return parseCensusLocation(await boundedJson(await fetcher(u,{headers:{Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15_000)}),'Census address'),a);
}
export function boundedLocationService<K,V>(load:(key:K)=>Promise<V>,keyOf:(key:K)=>string){
 const cache=new Map<string,{value:V;expires:number}>(),pending=new Map<string,Promise<V>>();
 return async(key:K):Promise<V>=>{
  const id=keyOf(key),prior=cache.get(id);
  if(prior&&prior.expires>Date.now())return prior.value;
  cache.delete(id);
  const running=pending.get(id);if(running)return running;
  if(pending.size>=4)throw Error('Location service busy.');
  const task=load(key).then(value=>{if(cache.size>=256){const first=cache.keys().next().value;if(first!==undefined)cache.delete(first);}cache.set(id,{value,expires:Date.now()+15*60_000});return value;}).finally(()=>pending.delete(id));
  pending.set(id,task);return task;
 };
}
