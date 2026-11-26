import type {StreetAddress} from './providerLocationContract';
import type {NerisPrimarySiteContext} from './nerisPrimarySiteContract';
import {NPPES_PHONE_SITE_BINDINGS} from './nppesPhoneSitePins';

export const NPPES_PHONE_SITE_METHOD='nppes-usfa-primary-site-correlation' as const;
export type NppesPhoneSiteEvidence={
 method:typeof NPPES_PHONE_SITE_METHOD;association:'inferred';endUserValidationRequired:true;
 siteRole:'correlated-usfa-primary-site';originalAddress:StreetAddress|null;
 originalStatus:'no-match'|'not-eligible'|'unavailable'|'pending';baselineIndexSha256:string;
 nationalRegistrySha256:string;identityReportSha256:string;identityPairSha256:string;
 correlation:Record<string,unknown>;donorReleaseIndexSha256:string;donorAuditSha256:string;
 donor:{primaryKey:string;siteRole:string;entry:Record<string,unknown>};interpretation:string;
};
const obj=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
function canonical(value:unknown):unknown{
 if(Array.isArray(value))return value.map(canonical);
 if(obj(value))return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)]));
 return value;
}
const same=(a:unknown,b:unknown)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));

/** Exact source/identity/full-donor proof; the release also validates its final parent. */
export function validateNppesPhoneSiteEvidence(value:unknown,context:NerisPrimarySiteContext):NppesPhoneSiteEvidence|undefined{
 if(value===undefined)return undefined;
 const fail=():never=>{throw Error('Invalid retained native CMS/USFA phone-site correlation.');};
 if(!obj(value)||value.method!==NPPES_PHONE_SITE_METHOD||value.association!=='inferred'||
    value.endUserValidationRequired!==true||value.siteRole!=='correlated-usfa-primary-site')return fail();
 const bindings=NPPES_PHONE_SITE_BINDINGS[context.key];
 if(!Array.isArray(bindings)||!bindings.some((raw:unknown)=>{
  if(!obj(raw)||!obj(raw.identity)||!obj(raw.evidence)||!same(raw.evidence,value))return false;
  const identity=raw.identity;
  if(context.key!==identity.key||context.name!==identity.name||context.state!==identity.state||
     context.source!==identity.source||(context.sourceCounty??'')!==identity.sourceCounty)return false;
  if(!same(context.address,raw.address)||!same(context.originalAddress,raw.originalAddress)||
     !same(context.match,raw.match)||context.countyFips!==raw.countyFips)return false;
  if(context.nationalRow!==undefined&&!same(context.nationalRow,raw.nationalRow))return false;
  return true;
 }))return fail();
 return value as NppesPhoneSiteEvidence;
}
