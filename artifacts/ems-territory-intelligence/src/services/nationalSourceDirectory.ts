/** Read-only source listings. Never coerce registry organizations into Agency metrics. */
export interface SourceDirectoryCounts {usfa:number;nppes:number;assigned:number;unassigned:number;countiesWithRecords:number;countyCount:number}
export interface CountySourceListingCounts { total: number; usfa: number; nppes: number }
export interface SourceDirectoryManifest {
 schemaVersion:1;totalRecords:number;statesAndDcRecords:number;otherJurisdictionRecords:number;countiesWithRecords:number;unassignedRecords:number;scope:string;
  sources:Record<'USFA'|'NPPES',{url?:string;sourceUrl?:string;retrievedAt?:string;stagedAt?:string;reportingPeriod?:string;limitation:string;accepted:number}>;
 stateNames:Record<string,string>;countyNames:Record<string,string>;byState:Record<string,SourceDirectoryCounts>;chunks:{state:string;file:string;count:number;sha256:string}[];
}
export type SourceDirectoryRecord = [id:string,source:'USFA'|'NPPES',name:string,stateCode:string,city:string,postalCode:string,countyFips:string,sourceCounty:string,countyBasis:string,deactivatedAt:string,address:string,sourceLink:string];
const base=()=>`${import.meta.env?.BASE_URL??'/'}registry/national/`;
let manifestPromise:Promise<SourceDirectoryManifest>|undefined;
const statePromises=new Map<string,Promise<SourceDirectoryRecord[]>>();
export function loadSourceDirectoryManifest():Promise<SourceDirectoryManifest>{
 if(!manifestPromise)manifestPromise=(async()=>{
  const response=await fetch(base()+'index.json',{cache:'no-cache',signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error('National registry directory could not be loaded.');
  const data=await response.json() as SourceDirectoryManifest;
  if(data.schemaVersion!==1||!Array.isArray(data.chunks)||Object.keys(data.byState??{}).length!==51)throw Error('Invalid national registry index.');
  return data;
 })().catch(error=>{manifestPromise=undefined;throw error;});
 return manifestPromise;
}
export function loadSourceDirectoryState(state:string):Promise<SourceDirectoryRecord[]>{
 const existing=statePromises.get(state);if(existing)return existing;
 const pending=(async()=>{
  const manifest=await loadSourceDirectoryManifest();const chunk=manifest.chunks.find(c=>c.state===state);
  if(!chunk)return [];
  if(!/^(?:[A-Z]{2}|other-[a-f0-9]{8})\.json$/.test(chunk.file))throw Error('Invalid registry file.');
  const response=await fetch(base()+chunk.file,{cache:'no-cache',signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error(`Registry records for ${state} could not be loaded.`);
  const content=await response.text();
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(content));
  if([...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')!==chunk.sha256)throw Error('National registry integrity check failed.');
  const records=JSON.parse(content) as SourceDirectoryRecord[];
  const ids=new Set<string>();
  if(!Array.isArray(records)||records.length!==chunk.count||records.some(r=>!Array.isArray(r)||r.length!==12||r.some(v=>typeof v!=='string')||r[3]!==state||!['USFA','NPPES'].includes(r[1])||!r[0].startsWith(r[1].toLowerCase()+':')||!r[2]))throw Error('Invalid registry records.');
  for(const record of records)ids.add(record[0]);
  if(ids.size!==records.length)throw Error('Duplicate registry identities.');
  return records;
 })().catch(error=>{statePromises.delete(state);throw error;});
 statePromises.set(state,pending);return pending;
}
export function filterSourceDirectory(records:SourceDirectoryRecord[],scope:{source?:'all'|'USFA'|'NPPES';countyFips?:string;query?:string;unassignedOnly?:boolean;countyOf?:(row:SourceDirectoryRecord)=>string}):SourceDirectoryRecord[]{
 const words=(scope.query??'').toLocaleLowerCase().split(/\s+/).filter(Boolean);
 const countyOf=scope.countyOf??((row:SourceDirectoryRecord)=>row[6]);
 return records.filter(r=>(!scope.source||scope.source==='all'||r[1]===scope.source)&&(!scope.countyFips||countyOf(r)===scope.countyFips)&&(!scope.unassignedOnly||!countyOf(r))&&words.every(w=>[r[0],r[2],r[4],r[5],r[7],r[10]].join(' ').toLocaleLowerCase().includes(w)));
}
/** Count source rows only when their county FIPS belongs to the loaded county-equivalent directory.
 * Rows from USFA and NPPES remain separate registry listings; this is not a unique-agency count.
 */
export function countSourceListingsByCounty(
 records:SourceDirectoryRecord[],
 validCountyFips:ReadonlySet<string>,
):Map<string,CountySourceListingCounts>{
 const result=new Map<string,CountySourceListingCounts>();
 for(const row of records){
  const fips=row[6];
  if(!/^\d{5}$/.test(fips)||!validCountyFips.has(fips))continue;
  const counts=result.get(fips)??{total:0,usfa:0,nppes:0};
  counts.total+=1;
  counts[row[1]==='USFA'?'usfa':'nppes']+=1;
  result.set(fips,counts);
 }
 return result;
}
