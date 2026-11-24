import {validateNpiCheckDigit} from './npiVerificationService';
export interface BulkCandidate {kind:'candidate';npi:string;legalName:string;alternateName:string;location:{city:string;state:string;postalCode:string;street?:string};taxonomies:string[];deactivationDate:string;reactivationDate:string;sourceUpdatedAt:string;associationStatus:'unreviewed'}
export interface BulkRegistry {manifest:{kind:'manifest';schemaVersion:1;sourceUrl:string;reportingPeriod:string;stagedAt:string;scope:string};records:BulkCandidate[];summary:{received:number;accepted:number;excluded:number;rejected:number;duplicates:number};importedAt:string}
/** Parse the staging format only, never arbitrary raw provider or patient files. */
export function parseBulkRegistry(text:string):BulkRegistry {
 if(text.length>60_000_000)throw Error('Use a staging file smaller than 60 MB.');
 const lines=text.split(/\r?\n/).filter(line=>line.trim());if(lines.length<2)throw Error('Manifest and summary are required.');
 const values=lines.map((line,i)=>{try{return JSON.parse(line);}catch{throw Error(`Invalid JSON on line ${i+1}.`);}});
 const manifest=values.shift(),summary=values.pop();
 if(manifest?.kind!=='manifest'||manifest.schemaVersion!==1||typeof manifest.sourceUrl!=='string'||!manifest.sourceUrl.startsWith('https://')||typeof manifest.reportingPeriod!=='string'||!manifest.reportingPeriod.trim()||typeof manifest.scope!=='string'||!Number.isFinite(Date.parse(manifest.stagedAt)))throw Error('Invalid staging source manifest.');
 if(summary?.kind!=='summary'||!['received','accepted','excluded','rejected','duplicates'].every(k=>Number.isSafeInteger(summary[k])&&summary[k]>=0)||summary.accepted!==values.length||summary.received!==summary.accepted+summary.excluded+summary.rejected+summary.duplicates)throw Error('Staging totals do not reconcile.');
 const seen=new Set<string>();const records:BulkCandidate[]=[];
 for(const row of values){
  if(row?.kind!=='candidate'||typeof row.npi!=='string'||!validateNpiCheckDigit(row.npi).isValid||seen.has(row.npi)||typeof row.legalName!=='string'||!row.legalName.trim()||row.associationStatus!=='unreviewed'||!row.location||!['city','state','postalCode'].every(k=>typeof row.location[k]==='string')||(row.location.street!==undefined&&(typeof row.location.street!=='string'||row.location.street.length>300))||!['alternateName','deactivationDate','reactivationDate','sourceUpdatedAt'].every(k=>typeof row[k]==='string')||!Array.isArray(row.taxonomies)||!row.taxonomies.every((t:unknown)=>typeof t==='string')||!row.taxonomies.some((t:string)=>t.startsWith('3416')))throw Error(`Invalid or duplicate candidate at record ${records.length+1}. Nothing was imported.`);
  seen.add(row.npi);records.push(row);
 }
 return {manifest,records,summary,importedAt:new Date().toISOString()};
}
function openDatabase():Promise<IDBDatabase>{return new Promise((resolve,reject)=>{const request=indexedDB.open('ems-bulk-registry',1);request.onupgradeneeded=()=>request.result.createObjectStore('snapshots');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(Error('Bulk registry storage is unavailable.'));request.onblocked=()=>reject(Error('Close other app tabs and retry.'));});}
export async function loadBulkRegistry():Promise<BulkRegistry|null>{const db=await openDatabase();try{return await new Promise((resolve,reject)=>{const request=db.transaction('snapshots').objectStore('snapshots').get('nppes');request.onsuccess=()=>resolve(request.result??null);request.onerror=()=>reject(Error('Could not load the saved bulk registry.'));});}finally{db.close();}}
/** One transaction replaces a snapshot. Abort/quota failure leaves the prior snapshot intact. */
export async function saveBulkRegistry(snapshot:BulkRegistry):Promise<void>{const db=await openDatabase();try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('snapshots','readwrite');tx.objectStore('snapshots').put(snapshot,'nppes');tx.oncomplete=()=>resolve();tx.onabort=()=>reject(Error('Could not save bulk records. Previous snapshot remains intact. Check device storage.'));tx.onerror=()=>reject(Error('Could not save bulk records. Previous snapshot remains intact.'));});}finally{db.close();}}
export function serializeBulkRegistry(snapshot:BulkRegistry):string{return [snapshot.manifest,...snapshot.records,{...snapshot.summary,kind:'summary'}].map(row=>JSON.stringify(row)).join('\n')+'\n';}

export async function loadBundledBulkRegistry(onProgress:(message:string)=>void=()=>{}):Promise<BulkRegistry>{
 if(typeof DecompressionStream==='undefined'||!crypto.subtle)throw Error('This browser cannot load compressed registry files. Import the prepared NDJSON file instead.');
 const base=`${import.meta.env?.BASE_URL??'/'}registry/nppes/`;
 const response=await fetch(base+'index.json',{signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('Bundled registry snapshot is unavailable in this release.');
 const index=await response.json();if(!Array.isArray(index.chunks)||index.chunks.length>100)throw Error('Invalid registry index.');
 const lines:string[]=[JSON.stringify(index.manifest)];
 for(const [position,chunk] of index.chunks.entries()){
  if(!/^part-\d{3}\.gz\.b64$/.test(chunk.file)||!/^[0-9a-f]{64}$/.test(chunk.sha256))throw Error('Invalid registry part.');
  onProgress(`Loading registry part ${position+1} of ${index.chunks.length} (${chunk.state})…`);
  const part=await fetch(base+chunk.file,{signal:AbortSignal.timeout(30000)});if(!part.ok)throw Error('A registry part could not be loaded. Your previous snapshot is unchanged.');
  const bytes=Uint8Array.from(atob(await part.text()),c=>c.charCodeAt(0));
  const content=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(content));
  const hex=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
  if(hex!==chunk.sha256)throw Error('Registry integrity check failed. Your previous snapshot is unchanged.');
  lines.push(content.trim());
 }
 lines.push(JSON.stringify(index.summary));return parseBulkRegistry(lines.join('\n'));
}
