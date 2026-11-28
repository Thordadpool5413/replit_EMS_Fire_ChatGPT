import test from 'node:test';
import assert from 'node:assert/strict';
import {isTransportBillingOperator,countSourceListingsByCounty,filterSourceDirectory,loadSourceDirectoryManifest,loadSourceDirectoryState,type SourceDirectoryRecord} from './nationalSourceDirectory';
const fire:SourceDirectoryRecord=['usfa:FL:123','USFA','Example Fire','FL','Miami','33101','12086','Miami-Dade','source-county','','123 Main',''];
const npi:SourceDirectoryRecord=['nppes:1234567890','NPPES','Example Ambulance','FL','Miami','33101','','','unassigned','01/01/2025','','https://npiregistry.cms.hhs.gov/provider-view/1234567890'];
const countyNpi:SourceDirectoryRecord=['nppes:1234567891','NPPES','County Ambulance','FL','Miami','33101','12086','','census-address-range','','200 Main','https://npiregistry.cms.hhs.gov/provider-view/1234567891'];
test('county drilldown includes only established locations and exposes unassigned state listings separately',()=>{
 assert.deepEqual(filterSourceDirectory([fire,npi],{countyFips:'12086'}),[fire]);
 assert.deepEqual(filterSourceDirectory([fire,npi],{unassignedOnly:true}),[npi]);
 assert.deepEqual(filterSourceDirectory([fire,npi],{source:'NPPES',query:'miami ambulance'}),[npi]);
 assert.deepEqual(filterSourceDirectory([fire,npi],{source:'USFA',countyFips:'12086'}),[fire]);
 assert.deepEqual(filterSourceDirectory([fire,npi],{source:'NPPES',countyFips:'12086'}),[]);
 assert.deepEqual(filterSourceDirectory([fire,countyNpi],{source:'NPPES',countyFips:'12086'}),[countyNpi]);
 assert.deepEqual(filterSourceDirectory([fire,npi],{query:'nonexistent'}),[]);
});
test('county listing rollups count source rows only for known county FIPS and preserve source breakdowns',()=>{
 const secondFire:SourceDirectoryRecord=['usfa:FL:124','USFA','Second Fire','FL','Miami','33101','12086','Miami-Dade','source-county','','200 Main',''];
 const secondNpi:SourceDirectoryRecord=['nppes:1234567891','NPPES','Second Ambulance','FL','Miami','33101','12086','','census-address-range','','300 Main','https://npiregistry.cms.hhs.gov/provider-view/1234567891'];
 const unknownCounty:SourceDirectoryRecord=['usfa:FL:125','USFA','Unmatched Fire','FL','Miami','33101','99999','','source-county','','400 Main',''];
 const counts=countSourceListingsByCounty([fire,npi,secondFire,secondNpi,unknownCounty],new Set(['12086']));
 assert.deepEqual(counts.get('12086'),{total:3,usfa:2,nppes:1});
 assert.equal(counts.has('99999'),false);
 assert.equal(counts.size,1);
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
test('county screenshots distinguish operating services from billing parents', async()=>{
 const {hasProviderServiceName}=await import('./providerServiceName');
 for(const name of ['Shands Teaching Hospital and Clinics Inc','Rocky Mountain Holdings LLC','Coastal Health Systems of Brevard','Holmes Regional Medical Center','City of Titusville']) assert.equal(hasProviderServiceName(name),false,name);
 for(const name of ['Titusville Fire and Emergency Services','East Coast Ambulance LLC','Gainesville Fire Rescue','Brevard County Fire Rescue']) assert.equal(hasProviderServiceName(name),true,name);
});

test('exact same-state billing evidence restores active ambulance organizations while withholding parent entities', () => {
 const npi = '1003006180';
 const matchedNpis = new Set([npi]);
 assert.equal(isTransportBillingOperator('PHI Health LLC', npi, true, true, matchedNpis), true);
 assert.equal(isTransportBillingOperator('Community Hospital', npi, true, true, matchedNpis), false);
 assert.equal(isTransportBillingOperator('County of Orange', npi, true, true, matchedNpis), false);
 assert.equal(isTransportBillingOperator('Example City Clerk', npi, true, true, matchedNpis), false);
 assert.equal(isTransportBillingOperator('Example Healthcare System', npi, true, true, matchedNpis), false);
 assert.equal(isTransportBillingOperator('Example Volunteer Fire', npi, true, true, matchedNpis), false);
 assert.equal(isTransportBillingOperator('PHI Health LLC', npi, false, true, matchedNpis), false);
 assert.equal(isTransportBillingOperator('PHI Health LLC', npi, true, false, matchedNpis), false);
 assert.equal(isTransportBillingOperator('PHI Health LLC', '1616000000', true, true, matchedNpis), false);
});
