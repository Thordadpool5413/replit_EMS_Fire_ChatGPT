/** Street-level public registry location and Census range match, never a verified station. */
export type StreetAddress={street:string;city:string;state:string;zip:string};
export type NpiAddress={npi:string;name:string;address:StreetAddress;sourceDate:string|null};
const NAD_PLACEMENTS=['Structure - Rooftop','Structure - Entrance','Structure - Interior','Structure - Interior Unit Location','Property Access Point','Site Placement','Parcel - Centroid','Parcel - Other/Manual Placement'] as const;
export type NadPoint={objectId:number;release:'2026-09-30';authority:string;placement:typeof NAD_PLACEMENTS[number];countyFips:string};
type AddressCoordinates={latitude:number;longitude:number;matchedAddress:string};
export type AddressMatch=AddressCoordinates&({method:'census-address-range'}|{method:'nad-address-point';point:NadPoint});
export function addressMatchLabel(m:AddressMatch){return m.method==='nad-address-point'?'USDOT NAD address point · '+m.point.placement:'Census approximate street-range location';}
export const NAD_SOURCE_URL='https://services.arcgis.com/xOi1kZaI0eWDREZv/ArcGIS/rest/services/Address_Points_from_National_Address_Database_view/FeatureServer/0';
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const clean=(v:unknown,max:number)=>typeof v==='string'&&v.trim().length>0&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v)?v.trim():'';
export function parseStreetAddress(v:unknown):StreetAddress|undefined{
 if(!obj(v))return undefined;
 const street=clean(v.street,160),city=clean(v.city,100),state=clean(v.state,2).toUpperCase(),rawZip=clean(v.zip,10);
 const zip=/^\d{5}(?:-?\d{4})?$/.test(rawZip)?rawZip.slice(0,5):'';
 if(!street||!city||!(/^[A-Z]{2}$/.test(state))||rawZip&&!zip)return undefined;
 return {street,city,state,zip};
}
export const isPhysicalStreet=(s:string)=>/^\d+[A-Za-z]?(?:[- ]\d+[A-Za-z]?)?\s+\S/.test(s)&&!/\b(?:P\s*\.?\s*O\s*\.?\s*BOX|POST OFFICE BOX|PMB|PRIVATE MAILBOX)\b/i.test(s);
export const addressText=(a:StreetAddress)=>a.street+', '+a.city+', '+[a.state,a.zip].filter(Boolean).join(' ');
export const addressKey=(a:StreetAddress)=>JSON.stringify([a.street,a.city,a.state,a.zip].map(s=>s.toUpperCase().replace(/\s+/g,' ').trim()));
/** Source address equality may complete an omitted ZIP, but never replace a conflicting ZIP or unit. */
export function compatibleSourceAddress(a:StreetAddress,b:StreetAddress):boolean{
 const key=(s:string)=>s.toUpperCase().replace(/\s+/g,' ').trim();
 return key(a.street)===key(b.street)&&key(a.city)===key(b.city)&&a.state===b.state&&(!a.zip||!b.zip||a.zip===b.zip);
}
/** Official registry lookup also supplies comma-delimited full addresses, unlike the national street-only snapshot. */
export function parseRegistryStreet(street:unknown,city:unknown,state:string,postal:unknown):StreetAddress|undefined{
 if(typeof street!=='string'||typeof city!=='string')return undefined;
 const parts=street.split(',').map(s=>s.trim());
 const tail=parts[parts.length-1]??'';
 const zipOnly=/^\d{5}(?:-?\d{4})?$/.test(tail);
 const statePart=zipOnly?parts[parts.length-2]:tail;
 const suffix=/^([A-Za-z]{2})(?:\s+(\d{5}(?:-?\d{4})?))?$/.exec(statePart??'');
 if(suffix&&parts.length>=(zipOnly?4:3)){
  const cityIndex=parts.length-(zipOnly?3:2),reportedCity=parts[cityIndex];
  const suffixZip=zipOnly?tail:suffix[2]??'';
  if(suffix[1].toUpperCase()!==state||reportedCity.toUpperCase()!==city.trim().toUpperCase())return undefined;
  const a=parseStreetAddress({street:parts.slice(0,cityIndex).join(', '),city,state,zip:suffixZip||postal});
  if(!a)return undefined;
  const explicit=parseStreetAddress({street:a.street,city,state,zip:postal});
  if(explicit?.zip&&a.zip&&explicit.zip!==a.zip)return undefined;
  return a;
 }
 return parseStreetAddress({street,city,state,zip:postal});
}
export function validNpi(v:unknown):v is string{
 if(typeof v!=='string'||!/^\d{10}$/.test(v))return false;
 return [...('80840'+v)].reverse().reduce((sum,d,i)=>{const n=Number(d)*(i%2?2:1);return sum+(n>9?n-9:n);},0)%10===0;
}
export function validateNpiAddress(v:unknown,npi:string):NpiAddress|null{
 if(v===null)return null;
 if(!obj(v)||v.npi!==npi||!validNpi(npi)||!clean(v.name,300)||!(v.sourceDate===null||typeof v.sourceDate==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v.sourceDate)))throw Error('Invalid NPPES location response.');
 const address=parseStreetAddress(v.address);if(!address)throw Error('Invalid NPPES address.');
 return {npi,name:clean(v.name,300),address,sourceDate:v.sourceDate as string|null};
}
const aliases:Record<string,string>={STREET:'ST',ROAD:'RD',AVENUE:'AVE',BOULEVARD:'BLVD',DRIVE:'DR',LANE:'LN',COURT:'CT',HIGHWAY:'HWY',PARKWAY:'PKWY',PLACE:'PL',TERRACE:'TER',CIRCLE:'CIR',NORTH:'N',SOUTH:'S',EAST:'E',WEST:'W',NORTHEAST:'NE',NORTHWEST:'NW',SOUTHEAST:'SE',SOUTHWEST:'SW'};
const norm=(s:string)=>s.toUpperCase().replace(/[.,]/g,' ').replace(/\s+/g,' ').trim().split(' ').map(t=>aliases[t]??t).join(' ');
export const geocodeStreet=(s:string)=>s.replace(/(?:,?\s+(?:STE|SUITE|UNIT|APT|FLOOR|FL|#)\s*[\w-]+.*)$/i,'').trim();
/** Require matched structure number, street, city, state and ZIP; never accept city/ZIP fallback. */
export function matchedStreet(a:StreetAddress,matched:string):boolean{
 if(!a.zip)return false;
 const parts=matched.split(',').map(s=>s.trim());
 if(parts.length===4)return norm(parts[0])===norm(geocodeStreet(a.street))&&norm(parts[1])===norm(a.city)&&parts[2].toUpperCase()===a.state&&parts[3].slice(0,5)===a.zip;
 if(parts.length===3)return norm(parts[0])===norm(geocodeStreet(a.street))&&norm(parts[1])===norm(a.city)&&parts[2].toUpperCase()===a.state+' '+a.zip;
 return false;
}
export function validateAddressMatch(v:unknown,a:StreetAddress):AddressMatch|null{
 if(v===null)return null;
 if(!obj(v)||(v.method!=='census-address-range'&&v.method!=='nad-address-point')||typeof v.latitude!=='number'||!Number.isFinite(v.latitude)||Math.abs(v.latitude)>90||typeof v.longitude!=='number'||!Number.isFinite(v.longitude)||Math.abs(v.longitude)>180||v.latitude===0&&v.longitude===0||typeof v.matchedAddress!=='string'||!matchedStreet(a,v.matchedAddress))throw Error('Unverified address match.');
 const coords={latitude:v.latitude,longitude:v.longitude,matchedAddress:v.matchedAddress};
 if(v.method==='census-address-range')return {...coords,method:v.method};
 const p=v.point;
 if(!obj(p)||typeof p.objectId!=='number'||!Number.isSafeInteger(p.objectId)||p.objectId<=0||p.release!=='2026-09-30'||!clean(p.authority,150)||typeof p.placement!=='string'||!NAD_PLACEMENTS.includes(p.placement as NadPoint['placement'])||typeof p.countyFips!=='string'||!/^\d{5}$/.test(p.countyFips))throw Error('Invalid NAD address point provenance.');
 return {...coords,method:'nad-address-point',point:{objectId:p.objectId,release:p.release,authority:clean(p.authority,150),placement:p.placement as NadPoint['placement'],countyFips:p.countyFips}};
}
