/** Precomputed Census evidence for monthly NPPES secondary locations. Never modifies an Agency. */
import {validNpi,parseStreetAddress,addressKey,validateAddressMatch,type AddressMatch,type StreetAddress} from './providerLocationContract';
import type {MonthlySecondaryRow} from './nppesMonthlySecondary';
export type MonthlyGeocodeRow={sourceKey:string;parentNpi:string;address:StreetAddress;geocodeStatus:'approximate-street-range'|'no-unique-match';sourceGeometry:AddressMatch|null;censusCountyAsReported:string|null;sharedApproximatePoint:boolean;parentMappingStatus:string;stationIdentityEstablished:false;publicationEligible:false;endUserValidationRequired:true};
type Index={schemaVersion:1;publication:'review-only';sourceUrl:string;artifactId:number;artifactSha256:string;acquisitionArtifactId:number;acquisitionArtifactSha256:string;secondaryIndexSha256:string;checkedAt:string;rowCount:number;verifiedStations:0;newMapped:0;counts:Record<string,number>;distinctApproximatePoints:number;unmappedParentNpisWithApproximateSecondary:number;chunks:{prefix:string;file:string;count:number;sha256:string}[]};
const digest=/^[a-f0-9]{64}$/;
const url='https://geocoding.geo.census.gov/geocoder/geographies/addressbatch';
const checked='2026-11-26T02:58:29.015369+00:00';
const artifactHash='40271fafdd6b0b452d5ed8573baafc17aa39a939555de362b4c0d0454fd9ea3a';
const sourceHash='5c9bfebd46b9252e973e53773e9e32889796774dd61cc1a7df93e212d1f11e94';
function validateIndex(v:unknown):Index{
 const x=v as Index;
 if(!x||x.schemaVersion!==1||x.publication!=='review-only'||x.sourceUrl!==url||x.artifactId!==15082474553||x.artifactSha256!==artifactHash||x.acquisitionArtifactId!==15082394618||x.acquisitionArtifactSha256!==sourceHash||!digest.test(x.secondaryIndexSha256)||x.checkedAt!==checked||x.rowCount!==844||x.verifiedStations!==0||x.newMapped!==0||x.counts?.['approximate-street-range']!==580||x.counts?.['no-unique-match']!==264||x.distinctApproximatePoints!==559||x.unmappedParentNpisWithApproximateSecondary!==64||!Array.isArray(x.chunks)||x.chunks.length!==10)throw Error('Invalid secondary geocode index');
 if(x.chunks.some((c,i)=>!c||c.prefix!==String(i+10)||c.file!==c.prefix+'.json'||!Number.isSafeInteger(c.count)||c.count<=0||!digest.test(c.sha256))||x.chunks.reduce((n,c)=>n+c.count,0)!==844)throw Error('Invalid geographic shards');
 return x;
}
export function validateMonthlyGeocodeShard(v:unknown,prefix:string,count:number):MonthlyGeocodeRow[]{
 if(!Array.isArray(v)||v.length!==count)throw Error('Invalid geographic shard count');
 const seen=new Set<string>();
 return v.map((r):MonthlyGeocodeRow=>{
  const a=parseStreetAddress(r?.address);
  if(!r||!a||!a.zip||!validNpi(r.parentNpi)||!r.parentNpi.startsWith(prefix)||typeof r.sourceKey!=='string'||!r.sourceKey.startsWith('NPI:'+r.parentNpi+':secondary:')||!digest.test(r.sourceKey.split(':').at(-1)??'')||seen.has(r.sourceKey)||typeof r.parentMappingStatus!=='string'||r.stationIdentityEstablished!==false||r.publicationEligible!==false||r.endUserValidationRequired!==true||typeof r.sharedApproximatePoint!=='boolean'||['street','city','state','zip'].some(k=>a[k as keyof StreetAddress]!==r.address[k]))throw Error('Invalid secondary geocode identity');
  seen.add(r.sourceKey);
  if(r.geocodeStatus==='no-unique-match'){
   if(r.sourceGeometry!==null||r.censusCountyAsReported!==null||r.sharedApproximatePoint)throw Error('Unmatched address has coordinates');
   return {...r,address:a,sourceGeometry:null};
  }
  if(r.geocodeStatus!=='approximate-street-range'||typeof r.censusCountyAsReported!=='string'||!/^\d{5}$/.test(r.censusCountyAsReported))throw Error('Invalid secondary geographic status');
  const m=validateAddressMatch(r.sourceGeometry,a);
  if(!m||m.method!=='census-address-range')throw Error('Invalid approximate address match');
  return {...r,address:a,sourceGeometry:m};
 });
}
export function joinMonthlyGeocodes(npi:string,sourceRows:MonthlySecondaryRow[],geocodes:MonthlyGeocodeRow[]):MonthlyGeocodeRow[]{
 const selected=geocodes.filter(r=>r.parentNpi===npi),by=new Map(sourceRows.map(r=>[r.sourceKey,r]));
 if(sourceRows.some(r=>r.parentNpi!==npi)||by.size!==sourceRows.length||selected.length!==by.size||new Set(selected.map(r=>r.sourceKey)).size!==by.size)throw Error('Secondary geocoding source membership differs');
 for(const r of selected){
  const s=by.get(r.sourceKey);
  if(!s||addressKey(s.address)!==addressKey(r.address)||s.parentMappingStatus!==r.parentMappingStatus)throw Error('Secondary geocoding source address differs');
 }
 return selected;
}
const base=()=>(import.meta.env?.BASE_URL??'/')+'registry/';
const hash=async(raw:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw)))].map(b=>b.toString(16).padStart(2,'0')).join('');
async function getText(path:string){
 const r=await fetch(base()+path,{cache:'no-cache',signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw Error('Secondary geocode evidence unavailable');
 return r.text();
}
let pending:Promise<Index>|undefined;
const shards=new Map<string,Promise<MonthlyGeocodeRow[]>>();
function loadIndex(){
 if(!pending)pending=(async()=>{
  const [raw,source]=await Promise.all([getText('nppes-secondary-geocode/index.json'),getText('nppes-secondary/index.json')]);
  const idx=validateIndex(JSON.parse(raw));
  if(await hash(source)!==idx.secondaryIndexSha256)throw Error('Secondary address snapshot changed');
  return idx;
 })().catch(e=>{pending=undefined;throw e});
 return pending;
}
async function loadGeocodeChunk(c:Index['chunks'][number]):Promise<MonthlyGeocodeRow[]>{
 let p=shards.get(c.prefix);
 if(!p){
  p=(async()=>{const raw=await getText('nppes-secondary-geocode/'+c.file);if(await hash(raw)!==c.sha256)throw Error('Secondary geocode shard checksum mismatch');return validateMonthlyGeocodeShard(JSON.parse(raw),c.prefix,c.count)})().catch(e=>{shards.delete(c.prefix);throw e});
  shards.set(c.prefix,p);
 }
 return p;
}
export async function loadAllMonthlyGeocodeRows(){
 const idx=await loadIndex();
 return (await Promise.all(idx.chunks.map(loadGeocodeChunk))).flat();
}
export async function loadMonthlySecondaryGeocodes(npi:string,sourceRows:MonthlySecondaryRow[]){
 if(!validNpi(npi))throw Error('Invalid NPI');
 const idx=await loadIndex(),c=idx.chunks.find(x=>x.prefix===npi.slice(0,2));
 return joinMonthlyGeocodes(npi,sourceRows,c?await loadGeocodeChunk(c):[]);
}
