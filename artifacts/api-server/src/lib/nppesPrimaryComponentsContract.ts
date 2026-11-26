import type {StreetAddress} from './providerLocationContract';
// Structural API counterpart of the frontend NerisPrimarySiteContext.
type NerisPrimarySiteContext={
 key:string;name:string;state:string;source:string;sourceCounty?:string;countyFips:string;
 address:StreetAddress;match:unknown;originalAddress:StreetAddress|null;nationalRow?:readonly string[];
};
import {NPPES_COMPONENT_BINDINGS} from './nppesPrimaryComponentsPins';

export const NPPES_PRIMARY_COMPONENTS_METHOD='nppes-primary-address-components' as const;
export type NppesPrimaryComponentsEvidence={
 method:typeof NPPES_PRIMARY_COMPONENTS_METHOD;association:'source-native';siteRole:'registered-primary-practice';
 originalAddress:StreetAddress;originalStatus:'no-match'|'not-eligible'|'unavailable'|'pending';
 sourceUrl:string;sourceArchiveSha256:string;sourceMember:string;sourceDate:'2026-11-02';
 nativeReportSha256:string;nativeRecordSha256:string;sourceRowNumber:number;npi:string;legalName:string;
 primaryAddressAsReported:{line1:string;line2:string;city:string;state:string;postalCode:string;country:string};
 selectedField:'line1'|'line2';rule:'unambiguous-native-primary-line';
 baselineIndexSha256:string;nationalRegistrySha256:string;
};
const obj=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
function canonical(value:unknown):unknown{
 if(Array.isArray(value))return value.map(canonical);
 if(obj(value))return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)]));
 return value;
}
const same=(a:unknown,b:unknown)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));

/** A native registered practice component with its exact independently replayed location. */
export function validateNppesPrimaryAddressEvidence(value:unknown,context:NerisPrimarySiteContext):NppesPrimaryComponentsEvidence|undefined{
 if(value===undefined)return undefined;
 const fail=():never=>{throw Error('Invalid retained native CMS primary-address component.');};
 if(!obj(value)||value.method!==NPPES_PRIMARY_COMPONENTS_METHOD||value.association!=='source-native'||value.siteRole!=='registered-primary-practice')return fail();
 const bindings=NPPES_COMPONENT_BINDINGS[context.key];
 if(!Array.isArray(bindings)||!bindings.some((raw:unknown)=>{
  if(!obj(raw)||!obj(raw.identity)||!obj(raw.evidence))return false;
  const identity=raw.identity;
  if(!same(value,raw.evidence)||!same(context.address,raw.address)||!same(context.originalAddress,raw.originalAddress)||
     !same(context.match,raw.match)||context.countyFips!==raw.countyFips)return false;
  if(context.key!==identity.key||context.name!==identity.name||context.state!==identity.state||context.source!==identity.source||
     (context.sourceCounty??'')!==identity.sourceCounty)return false;
  if(context.nationalRow!==undefined&&!same(context.nationalRow,raw.nationalRow))return false;
  return true;
 }))return fail();
 return value as NppesPrimaryComponentsEvidence;
}
