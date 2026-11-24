/** Stage a reviewable Ohio agency snapshot. Never replace the bundled source automatically. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
export const SOURCE='https://ems.ohio.gov/ems-trauma-data/data-center-resources/ohio-ems-agency-list';
const serviceLevels=new Set([null,'None','EMR','EMT','AEMT','Paramedic']);
export function parseOhioRoster(html,retrievedAt=new Date().toISOString().slice(0,10),minRows=500){
 const match=html.match(/<div\b[^>]*\bid=["']js-placeholder-json-data["'][^>]*>([\s\S]*?)<\/div>/i);
 if(!match)throw Error('Expected Ohio structured roster is missing; retain the published snapshot.');
 const parsed=JSON.parse(match[1].trim());
 if(!parsed||!Array.isArray(parsed.data)||!Array.isArray(parsed.errors)||parsed.errors.length||parsed.meta?.aborted||parsed.meta?.truncated)throw Error('Unexpected or incomplete source roster format.');
 const data=parsed.data.slice(1);
 if(!Array.isArray(parsed.data[0])||parsed.data[0].length!==5||!parsed.data[0].every(v=>v==='s')||data.length<2||!data.every(Array.isArray))throw Error('Unexpected source roster format.');
 // The official array has five columns. Resolve them from the source header instead of assuming column order.
 const headers=data[0].map(v=>String(v).trim().toLowerCase().replace(/[^a-z0-9]+/g,' '));
 const index=(patterns)=>headers.findIndex(h=>patterns.some(p=>p.test(h)));
 const code=index([/agency.*(code|id|number)/,/^code$/]),name=index([/^agency.*name$/,/^agency$/]),city=index([/city/]),level=index([/service.*level/,/ems.*level/,/^level$/]);
 if(data[0].length!==5||[code,name,city,level].some(i=>i<0)||new Set([code,name,city,level]).size!==4)throw Error('Ohio roster schema changed; manual mapping required.');
 const decode=v=>String(v??'').replace(/&(?:amp|quot|apos|lt|gt|nbsp|#\d+|#x[0-9a-f]+);/gi,entity=>{const k=entity.slice(1,-1);if(k.startsWith('#')){const n=k[1].toLowerCase()==='x'?parseInt(k.slice(2),16):parseInt(k.slice(1),10);return Number.isInteger(n)&&n>=0&&n<=0x10ffff?String.fromCodePoint(n):entity;}return ({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '})[k.toLowerCase()]??entity;}).trim();
 const records=[];const seen=new Set();
 for(const r of data.slice(1)){
  if(r.length!==5)throw Error('Malformed source row.');
  const identifier=decode(r[code]),n=decode(r[name]),c=decode(r[city]),serviceLevel=decode(r[level])||null;
  if(!/^[-A-Z0-9]+$/i.test(identifier)||seen.has(identifier.toUpperCase())||!n||!serviceLevels.has(serviceLevel))throw Error('Missing, duplicate or invalid source agency code or service level.');
  seen.add(identifier.toUpperCase());records.push({identifier,name:n,city:c,serviceLevel});
 }
 if(records.length<minRows)throw Error('Roster is unexpectedly small; manual review required.');
 return {schemaVersion:1,stateCode:'OH',sourceName:'Ohio Department of Public Safety Division of EMS',sourceUrl:SOURCE,sourceDate:null,retrievedAt,identifierKind:'agency-code',scope:'Public agency listings; not a license or operating-status registry. Headquarters city is not a service area.',records};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const local=process.argv.indexOf('--html');
 const html=local>=0?await readFile(process.argv[local+1],'utf8'):await fetch(SOURCE,{signal:AbortSignal.timeout(60000),headers:{'User-Agent':'ATLAS source snapshot review'}}).then(r=>{if(!r.ok)throw Error('Ohio source returned HTTP '+r.status);return r.text()});
 const snapshot=parseOhioRoster(html);
 const previous=JSON.parse(await readFile(new URL('../artifacts/ems-territory-intelligence/public/registry/state-ems/OH.json',import.meta.url),'utf8'));
 assert.ok(Math.abs(snapshot.records.length-previous.records.length)/previous.records.length<=.2,'Record count changed by more than 20%; retain current snapshot pending manual review.');
 const out=path.resolve('generated-artifacts/ohio-state-ems-refresh');await mkdir(out,{recursive:true});await writeFile(path.join(out,'OH.json'),JSON.stringify(snapshot,null,2)+'\n');
 console.log('Staged '+snapshot.records.length+' Ohio source records. Review source update date, differences and source schema before replacing the bundled file. No published files changed.');
}
