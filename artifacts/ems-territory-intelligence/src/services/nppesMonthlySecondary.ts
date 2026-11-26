/** Pinned monthly federal secondary practice evidence, separate from live lookup and map pins. */
import {validNpi,parseStreetAddress,isPhysicalStreet,type StreetAddress} from './providerLocationContract';
const digest=/^[a-f0-9]{64}$/;
const url='https://download.cms.gov/nppes/NPPES_Data_Dissemination_November_2026_V2.zip';
const period='2026-11-09 monthly release';
const artifact='5c9bfebd46b9252e973e53773e9e32889796774dd61cc1a7df93e212d1f11e94';
const rawHash='c5a34fba9b2e04bcb87358a1e3f9f4bbfc79b49b71fb37b71f9de43570c18713';
export type MonthlySecondaryRow={sourceKey:string;parentNpi:string;parentName:string;parentState:string;parentSourceDate:string;parentMappingStatus:string;sourceRow:number;address:StreetAddress;crossState:boolean;sharedAddressAcrossNpis:boolean;stationIdentityEstablished:false;publicationEligible:false;endUserValidationRequired:true};
type Index={schemaVersion:1;publication:'review-only';reportingPeriod:string;sourceUrl:string;referenceUrl:string;artifactId:number;artifactSha256:string;archiveSha256:string;parentNpiCount:number;newMapped:0;verifiedStations:0;counts:{acceptedSecondary:number;distinctParentNpisWithSecondary:number};chunks:{prefix:string;file:string;count:number;sha256:string}[]};
function validateIndex(v:unknown):Index{
 const x=v as Index;
 if(!x||x.schemaVersion!==1||x.publication!=='review-only'||x.reportingPeriod!==period||x.sourceUrl!==url||x.referenceUrl!=='https://download.cms.gov/nppes/NPI_Files.html'||x.artifactId!==15082394618||x.artifactSha256!==artifact||x.archiveSha256!==rawHash||x.parentNpiCount!==19567||x.newMapped!==0||x.verifiedStations!==0||x.counts?.acceptedSecondary!==844||x.counts?.distinctParentNpisWithSecondary!==434||!Array.isArray(x.chunks)||x.chunks.length!==10)throw Error('Invalid monthly NPPES source index');
 if(x.chunks.some((c,i)=>!c||c.prefix!==String(i+10)||c.file!==c.prefix+'.json'||!Number.isSafeInteger(c.count)||c.count<=0||!digest.test(c.sha256))||x.chunks.reduce((n,c)=>n+c.count,0)!==844)throw Error('Invalid monthly NPPES source shards');
 return x;
}
export function validateSecondaryShard(value:unknown,prefix:string,count:number):MonthlySecondaryRow[]{
 if(!Array.isArray(value)||value.length!==count)throw Error('Invalid monthly secondary source count');
 const seen=new Set<string>();
 for(const r of value){
  if(!r||!validNpi(r.parentNpi)||!r.parentNpi.startsWith(prefix)||typeof r.sourceKey!=='string'||!r.sourceKey.startsWith('NPI:'+r.parentNpi+':secondary:')||!digest.test(r.sourceKey.split(':').at(-1)??'')||seen.has(r.sourceKey)||typeof r.parentName!=='string'||!r.parentName.trim()||r.parentName.length>300||!(/^[A-Z]{2}$/.test(r.parentState))||r.parentSourceDate!==period||typeof r.parentMappingStatus!=='string'||!Number.isSafeInteger(r.sourceRow)||r.sourceRow<=0||r.sourceRow>1284848||r.stationIdentityEstablished!==false||r.publicationEligible!==false||r.endUserValidationRequired!==true||typeof r.sharedAddressAcrossNpis!=='boolean'||Object.hasOwn(r,'latitude')||Object.hasOwn(r,'longitude'))throw Error('Invalid secondary source identity');
  const a=parseStreetAddress(r.address);
  if(!a||!a.zip||!isPhysicalStreet(a.street)||['street','city','state','zip'].some(k=>a[k as keyof StreetAddress]!==r.address[k])||r.crossState!==(a.state!==r.parentState))throw Error('Invalid secondary address');
  seen.add(r.sourceKey);
 }
 return value as MonthlySecondaryRow[];
}
const base=()=>(import.meta.env?.BASE_URL??'/')+'registry/nppes-secondary/';
let indexPromise:Promise<Index>|undefined;
const shards=new Map<string,Promise<MonthlySecondaryRow[]>>();
async function getText(file:string){
 const r=await fetch(base()+file,{cache:'no-cache',signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw Error('Monthly NPPES evidence unavailable');
 return r.text();
}
function loadIndex(){
 if(!indexPromise)indexPromise=getText('index.json').then(s=>validateIndex(JSON.parse(s))).catch(e=>{indexPromise=undefined;throw e});
 return indexPromise;
}
async function loadSecondaryChunk(chunk:Index['chunks'][number]):Promise<MonthlySecondaryRow[]>{
 let promise=shards.get(chunk.prefix);
 if(!promise){
  promise=(async()=>{
   const raw=await getText(chunk.file);
   const h=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw)))].map(b=>b.toString(16).padStart(2,'0')).join('');
   if(h!==chunk.sha256)throw Error('Monthly secondary evidence checksum mismatch');
   return validateSecondaryShard(JSON.parse(raw),chunk.prefix,chunk.count);
  })().catch(e=>{shards.delete(chunk.prefix);throw e});
  shards.set(chunk.prefix,promise);
 }
 return promise;
}
export async function loadAllMonthlySecondaryRows(){
 const idx=await loadIndex();
 return (await Promise.all(idx.chunks.map(loadSecondaryChunk))).flat();
}
export async function loadMonthlySecondary(npi:string){
 if(!validNpi(npi))throw Error('Invalid NPI');
 const idx=await loadIndex(),chunk=idx.chunks.find(c=>c.prefix===npi.slice(0,2));
 return {reportingPeriod:period,sourceUrl:idx.sourceUrl,referenceUrl:idx.referenceUrl,rows:chunk?(await loadSecondaryChunk(chunk)).filter(r=>r.parentNpi===npi):[] as MonthlySecondaryRow[]};
}
