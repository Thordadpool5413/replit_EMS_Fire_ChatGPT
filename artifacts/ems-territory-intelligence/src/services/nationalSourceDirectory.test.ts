import test from 'node:test';
import assert from 'node:assert/strict';
import {filterSourceDirectory,loadSourceDirectoryManifest,loadSourceDirectoryState,type SourceDirectoryRecord} from './nationalSourceDirectory';
const fire:SourceDirectoryRecord=['usfa:FL:123','USFA','Example Fire','FL','Miami','33101','12086','Miami-Dade','source-county','','123 Main',''];
const npi:SourceDirectoryRecord=['nppes:1234567890','NPPES','Example Ambulance','FL','Miami','33101','','','unassigned','01/01/2025','','https://npiregistry.cms.hhs.gov/provider-view/1234567890'];
test('county drilldown includes only established locations and exposes unassigned state listings separately',()=>{
 assert.deepEqual(filterSourceDirectory([fire,npi],{countyFips:'12086'}),[fire]);
 assert.deepEqual(filterSourceDirectory([fire,npi],{unassignedOnly:true}),[npi]);
 assert.deepEqual(filterSourceDirectory([fire,npi],{source:'NPPES',query:'miami ambulance'}),[npi]);
 assert.deepEqual(filterSourceDirectory([fire,npi],{query:'nonexistent'}),[]);
});
test('directory loader retries failed reads, verifies bytes and shares successful state requests',async()=>{
 const original=globalThis.fetch;let calls=0;let bad=true;
 const content=JSON.stringify([fire,npi]);const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(content));const sha=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
 const states=Object.fromEntries(Array.from({length:51},(_,i)=>[String(i),{}]));
 globalThis.fetch=async input=>{calls++;const url=String(input);if(url.endsWith('index.json'))return new Response(JSON.stringify({schemaVersion:1,byState:states,chunks:[{state:'FL',file:'FL.json',count:2,sha256:sha}]}));return new Response(bad?'[]':content);};
 try{await loadSourceDirectoryManifest();await assert.rejects(loadSourceDirectoryState('FL'),/integrity/);bad=false;
  const [a,b]=await Promise.all([loadSourceDirectoryState('FL'),loadSourceDirectoryState('FL')]);assert.deepEqual(a,[fire,npi]);assert.equal(a,b);assert.equal(calls,3);
 }finally{globalThis.fetch=original;}
});
