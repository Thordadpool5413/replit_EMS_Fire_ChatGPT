/** Street-level public registry location and Census range match, never a verified station. */
export type StreetAddress={street:string;city:string;state:string;zip:string};
export type NpiAddress={npi:string;name:string;address:StreetAddress;sourceDate:string|null};
export type AddressMatch={latitude:number;longitude:number;matchedAddress:string;method:'census-address-range'};
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
 if(!obj(v)||v.method!=='census-address-range'||typeof v.latitude!=='number'||!Number.isFinite(v.latitude)||Math.abs(v.latitude)>90||typeof v.longitude!=='number'||!Number.isFinite(v.longitude)||Math.abs(v.longitude)>180||v.latitude===0&&v.longitude===0||typeof v.matchedAddress!=='string'||!matchedStreet(a,v.matchedAddress))throw Error('Unverified address match.');
 return {latitude:v.latitude,longitude:v.longitude,matchedAddress:v.matchedAddress,method:v.method};
}
