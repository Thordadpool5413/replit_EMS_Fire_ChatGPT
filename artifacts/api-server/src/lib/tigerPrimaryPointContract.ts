import {TIGER_POINT_PINS} from './tigerPrimaryPointPins';
import {normalizeStreet,sourceStreetLine} from './addressNormalization';
import type {StreetAddress} from './providerLocationContract';
export type TigerAddressRangePoint={
 nativeId:string;sourceFile:string;sourceUrl:string;sourceArchiveSha256:string;sourceInventorySha256:string;
 sourceDate:'2026';nativeReferenceSystem:'EPSG:4269';sourceRowNumber:number;nativeRecordSha256:string;
 completeCountyFilesAudited:3227;completeNativeRowsAudited:23314306;countyFips:string;sourceCountyFips:string;
 precision:'address-range';addressRole:'source-address-location';streetName:string;houseNumber:string;
 fromHouseNumber:string;toHouseNumber:string;parity:'E'|'O'|'B';side:'L'|'R';postalCode:string;
 tlid:number;linearId:string;rangeId:string;fromType:string;toType:string;offset:string;
 interpolationFraction:number;segmentLengthMeters:number;
 coordinateMethod:'fraction-along-native-polyline-length';coordinatesComputed:[number,number];
};
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
function canonical(v:unknown):unknown{
 if(Array.isArray(v))return v.map(canonical);
 if(obj(v))return Object.fromEntries(Object.entries(v).filter(([,x])=>x!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,canonical(x)]));
 return v;
}
const same=(a:unknown,b:unknown)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
export const isTigerPointMethod=(value:unknown):value is 'tiger-address-range'=>value==='tiger-address-range';
/** Exact source-native range/geometry binding; interpolation never claims a structure. */
export function validateTigerPrimaryPoint(value:unknown,address?:StreetAddress,coordinates?:readonly[number,number]):TigerAddressRangePoint{
 const fail=():never=>{throw Error('Invalid retained native TIGER address range.');};
 if(!obj(value)||typeof value.nativeId!=='string')return fail();
 const pin=TIGER_POINT_PINS[value.nativeId];
 if(!obj(pin)||!obj(pin.point)||!same(value,pin.point)||value.precision!=='address-range'||value.coordinateMethod!=='fraction-along-native-polyline-length')return fail();
 if(coordinates&&!same(coordinates,pin.coordinates))return fail();
 if(address){
  const number=/^(\d+)\s+(.+)$/.exec(sourceStreetLine(address.street));
  if(!number||String(Number(number[1]))!==value.houseNumber||normalizeStreet(number[2])!==normalizeStreet(String(value.streetName))||address.zip!==value.postalCode)return fail();
  if(!Array.isArray(pin.addresses)||!pin.addresses.some((candidate:unknown)=>obj(candidate)&&same(candidate,address)))return fail();
 }
 return value as TigerAddressRangePoint;
}
