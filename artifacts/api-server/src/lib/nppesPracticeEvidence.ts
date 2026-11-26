import {boundedJson} from './publicIntelligenceDiscovery';
import {validNpi,parseStreetAddress,isPhysicalStreet,addressKey} from './providerLocationContract';
import {practiceRowKey,sourceLink,sourceDay,cleanSourceText,validateNppesPracticeEvidence,type NppesPracticeRow,type NppesPracticeEvidence} from './nppesPracticeContract';
const obj=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
export function parseNppesPracticeEvidence(payload:unknown,npi:string,now=Date.now()):NppesPracticeEvidence{
 if(!validNpi(npi)||!obj(payload)||payload.Errors||payload.errors||!Array.isArray(payload.results)||payload.result_count!==payload.results.length||payload.results.length>1)throw Error('Invalid NPPES response');
 const base={schemaVersion:1 as const,npi,sourceUrl:sourceLink(npi),retrievedAt:new Date(now).toISOString(),operatingRelationshipEstablished:false as const,publicationEligible:false as const,endUserValidationRequired:true as const};
 const empty=(status:'no-record'|'not-eligible')=>({...base,status,organizationName:null,sourceDate:null,secondaryCollection:'not-returned' as const,withheldAddressCount:0,rows:[]});
 if(!payload.results.length)return empty('no-record');
 const r=payload.results[0];
 if(!obj(r)||String(r.number)!==npi)throw Error('NPPES response identity mismatch');
 if(r.enumeration_type!=='NPI-2'||!obj(r.basic)||r.basic.status!=='A'||!Array.isArray(r.taxonomies)||!r.taxonomies.some(t=>obj(t)&&typeof t.code==='string'&&/^3416[A-Z0-9]{6}$/.test(t.code)))return empty('not-eligible');
 const name=cleanSourceText(r.basic.organization_name,300);
 if(!name||!Array.isArray(r.addresses)||r.addresses.length>50||r.practiceLocations!==undefined&&!Array.isArray(r.practiceLocations)||Array.isArray(r.practiceLocations)&&r.practiceLocations.length>900)throw Error('Unexpected organization location schema');
 const rows:NppesPracticeRow[]=[],seen=new Set<string>();let withheld=0;
 function add(v:unknown,kind:NppesPracticeRow['kind']){
  if(!obj(v)||v.country_code!=='US'||v.address_1===undefined||v.address_2!==undefined&&v.address_2!==null&&typeof v.address_2!=='string'){withheld++;return;}
  const line1=cleanSourceText(v.address_1,160),line2=v.address_2?cleanSourceText(v.address_2,160):null;
  if(!line1||v.address_2&&!line2){withheld++;return;}
  const a=parseStreetAddress({street:[line1,line2].filter(Boolean).join(', '),city:v.city,state:v.state,zip:v.postal_code});
  if(!a){withheld++;return;}
  const key=practiceRowKey(kind,a);
  if(seen.has(key)){withheld++;return;}seen.add(key);
  rows.push({key,kind,address:a,physicalStreet:kind!=='mailing'&&isPhysicalStreet(a.street),stationIdentityEstablished:false,endUserValidationRequired:true});
 }
 const primaries=r.addresses.filter(v=>obj(v)&&v.address_purpose==='LOCATION');
 if(primaries.length===1)add(primaries[0],'primary-practice');else withheld+=primaries.length;
 for(const v of r.addresses){
  if(obj(v)&&v.address_purpose==='MAILING')add(v,'mailing');
  else if(!obj(v)||v.address_purpose!=='LOCATION')withheld++;
 }
 for(const v of Array.isArray(r.practiceLocations)?r.practiceLocations:[]){
  // The secondary collection itself identifies practice addresses. Do not reinterpret a mailing-purpose row.
  if(!obj(v)||v.address_purpose!==undefined&&v.address_purpose!==null&&!['LOCATION','SECONDARY'].includes(String(v.address_purpose))){withheld++;continue;}
  add(v,'secondary-practice');
 }
 // The same street address may appear in both collections. Preserve the primary,
 // not a second apparent site; do not collapse differing suite addresses.
 const primary=rows.find(x=>x.kind==='primary-practice');
 const filtered=rows.filter(x=>{if(primary&&x.kind==='secondary-practice'&&addressKey(x.address)===addressKey(primary.address)){withheld++;return false;}return true;});
 return validateNppesPracticeEvidence({...base,status:'source-reported',organizationName:name,sourceDate:sourceDay(r.basic.last_updated),secondaryCollection:Array.isArray(r.practiceLocations)?'reported':'not-returned',withheldAddressCount:withheld,rows:filtered},npi);
}
export async function fetchNppesPracticeEvidence(npi:string,fetcher:typeof fetch=fetch){
 if(!validNpi(npi))throw Error('Invalid NPI');
 const u=new URL('https://npiregistry.cms.hhs.gov/api/');u.searchParams.set('version','2.1');u.searchParams.set('number',npi);
 const response=await fetcher(u,{headers:{Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(15_000)});
 return parseNppesPracticeEvidence(await boundedJson(response,'NPPES organization locations'),npi);
}
