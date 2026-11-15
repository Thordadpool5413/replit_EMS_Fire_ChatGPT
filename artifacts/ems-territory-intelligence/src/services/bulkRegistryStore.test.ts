import test from 'node:test';import assert from 'node:assert/strict';import{parseBulkRegistry,serializeBulkRegistry}from'./bulkRegistryStore';
const manifest={kind:'manifest',schemaVersion:1,sourceUrl:'https://download.cms.gov/nppes/NPI_Files.html',reportingPeriod:'2026-11',stagedAt:'2026-11-15T00:00:00Z',scope:'Type 2 ambulance organizations'};
const row={kind:'candidate',npi:'1234567893',legalName:'County EMS',alternateName:'',location:{city:'Town',state:'FL',postalCode:'12345'},taxonomies:['3416L0300X'],deactivationDate:'',reactivationDate:'',sourceUpdatedAt:'11/01/2026',associationStatus:'unreviewed'};
const summary={kind:'summary',received:1,accepted:1,excluded:0,rejected:0,duplicates:0};
const text=(records:unknown[]=[row],totals=summary)=>[manifest,...records,totals].map(v=>JSON.stringify(v)).join('\n');
test('prepared directory round trips without converting registry candidates to agency facts',()=>{const snapshot=parseBulkRegistry(text());assert.equal(snapshot.records[0].associationStatus,'unreviewed');assert.equal(snapshot.manifest.reportingPeriod,'2026-11');assert.deepEqual(parseBulkRegistry(serializeBulkRegistry(snapshot)).records,snapshot.records);});
test('invalid identities, conflicting totals and duplicate NPIs reject the entire file',()=>{assert.throws(()=>parseBulkRegistry(text([{...row,npi:'123'}])),/Invalid/);assert.throws(()=>parseBulkRegistry(text([row],{...summary,received:5})),/totals/);assert.throws(()=>parseBulkRegistry(text([row,row],{...summary,accepted:2,received:2})),/duplicate/);assert.throws(()=>parseBulkRegistry(text([{...row,associationStatus:'confirmed'}])),/Invalid/);});
test('no source metadata or trailing malformed data cannot be mistaken for a complete import',()=>{assert.throws(()=>parseBulkRegistry(JSON.stringify(row)));assert.throws(()=>parseBulkRegistry(text()+'\nnot json'),/Invalid JSON/);});

test('bundled loading verifies every part before accepting a snapshot',async()=>{
 const {loadBundledBulkRegistry}=await import('./bulkRegistryStore');const {gzipSync}=await import('node:zlib');const{createHash}=await import('node:crypto');
 const content=JSON.stringify(row)+'\n';const encoded=gzipSync(content).toString('base64');const hash=createHash('sha256').update(content).digest('hex');
 const index={manifest,summary,chunks:[{file:'part-000.gz.b64',state:'FL',count:1,sha256:hash}]};const original=globalThis.fetch;
 try{
  globalThis.fetch=async(url)=>new Response(String(url).endsWith('index.json')?JSON.stringify(index):encoded);
  assert.equal((await loadBundledBulkRegistry()).records.length,1);
  index.chunks[0].sha256='0'.repeat(64);
  await assert.rejects(loadBundledBulkRegistry(),/integrity/);
  index.chunks[0].file='../unexpected';await assert.rejects(loadBundledBulkRegistry(),/Invalid registry part/);
 }finally{globalThis.fetch=original;}
});
