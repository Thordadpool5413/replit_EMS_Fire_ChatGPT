import type {StreetAddress} from './providerLocationContract';
import {nerisProofDigest} from './nerisProofHash';
import pins from './nerisGridPointPins.json';

export const NERIS_GRID_PROFILE='wi-mi-directional-grid-house-number' as const;
export type NerisGridAddressMatch={latitude:number;longitude:number;matchedAddress:string;method:'neris-reported-address';
 matchBasis:'normalized-street-city-state-zip';sourceAddressProfile:typeof NERIS_GRID_PROFILE;
 sourceAddress:StreetAddress;point:Record<string,unknown>};
const bindings=new Set<string>(pins.bindings);
export function isNerisGridAddress(value:unknown):value is StreetAddress {
 if(value===null||typeof value!=='object'||Array.isArray(value))return false;
 const a=value as Record<string,unknown>;
 return (a.state==='WI'||a.state==='MI')&&typeof a.street==='string'&&/^[NSEW][0-9]+(?:[NSEW][0-9]+)?\s+\S/i.test(a.street.trim())&&
  typeof a.city==='string'&&!!a.city.trim()&&typeof a.zip==='string'&&/^\d{5}$/.test(a.zip);
}
export function validateNerisGridAddressMatch(value:unknown,address:StreetAddress):NerisGridAddressMatch {
 if(!isNerisGridAddress(address)||value===null||typeof value!=='object'||Array.isArray(value)||
    (value as Record<string,unknown>).sourceAddressProfile!==NERIS_GRID_PROFILE||
    pins.schemaVersion!==1||pins.profile!==NERIS_GRID_PROFILE||!/^[a-f0-9]{64}$/.test(pins.sourceArchiveSha256)||
    !bindings.has(nerisProofDigest({match:value,address})))throw Error('Native grid address point differs from retained complete-source evidence.');
 return value as NerisGridAddressMatch;
}
