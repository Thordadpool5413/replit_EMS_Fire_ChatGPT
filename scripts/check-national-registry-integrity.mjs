import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base=new URL('../artifacts/ems-territory-intelligence/public/registry/national/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('index.json',base),'utf8'));
assert.equal(manifest.schemaVersion,1);
const seen=new Set(),states=new Set(),counties=new Set();
let total=0,usfa=0,nppes=0,missingFdid=0,unassigned=0,statesAndDc=0;
for(const chunk of manifest.chunks){
 assert.match(chunk.file,/^(?:[A-Z]{2}|other-[a-f0-9]{8})\.json$/);
 assert.ok(!states.has(chunk.state),'Duplicate state chunk: '+chunk.state);states.add(chunk.state);
 const bytes=await readFile(new URL(chunk.file,base));
 assert.equal(createHash('sha256').update(bytes).digest('hex'),chunk.sha256,chunk.file+' hash mismatch');
 const records=JSON.parse(bytes);
 assert.equal(records.length,chunk.count,chunk.file+' count mismatch');
 let sf=0,sn=0,sa=0;const sc=new Set();
 for(const row of records){
  assert.ok(Array.isArray(row)&&row.length===12&&row.every(v=>typeof v==='string'));
  const [id,source,name,state,,,county]=row;
  assert.equal(state,chunk.state);assert.ok(name.trim());assert.ok(!seen.has(id),'Duplicate source identity '+id);seen.add(id);
  if(source==='USFA'){
   const prefix='usfa:'+state+':';assert.ok(id.startsWith(prefix));const fdid=id.slice(prefix.length);assert.ok(fdid);
   if(fdid.startsWith('location-')){assert.match(fdid,/^location-[a-f0-9]{20}$/);missingFdid++;}
   assert.ok(!/^[A-Z]{2}-(FD|EMS)-\d{5}(-[A-Z0-9]+)?$/i.test(fdid),'Generated FDID in snapshot '+id);
   usfa++;sf++;
  }else {assert.equal(source,'NPPES');assert.match(id,/^nppes:\d{10}$/);nppes++;sn++;}
  if(county){assert.match(county,/^\d{5}$/);assert.ok(manifest.countyNames[county],'Unknown county '+county);counties.add(county);sc.add(county);sa++;}else unassigned++;
  if(Object.hasOwn(manifest.byState,state))statesAndDc++;
  total++;
 }
 const summary=manifest.byState[chunk.state];
 if(summary){assert.equal(sf,summary.usfa);assert.equal(sn,summary.nppes);assert.equal(sa,summary.assigned);assert.equal(records.length-sa,summary.unassigned);assert.equal(sc.size,summary.countiesWithRecords);}
}
assert.equal(total,manifest.totalRecords);assert.equal(usfa,manifest.sources.USFA.accepted);assert.equal(nppes,manifest.sources.NPPES.accepted);assert.equal(unassigned,manifest.unassignedRecords);assert.equal(counties.size,manifest.countiesWithRecords);assert.equal(statesAndDc,manifest.statesAndDcRecords);assert.equal(total-statesAndDc,manifest.otherJurisdictionRecords);
assert.equal(Object.keys(manifest.byState).length,51);
for(const state of Object.keys(manifest.byState))assert.ok(states.has(state),'Missing state '+state);
console.log(JSON.stringify({total,usfa,nppes,missingFdid,unassigned,counties:counties.size,statesAndDc,sourceChunks:states.size},null,2));

execFileSync('python3',['scripts/build-provider-aliases.py','--check'],{stdio:'inherit'});
