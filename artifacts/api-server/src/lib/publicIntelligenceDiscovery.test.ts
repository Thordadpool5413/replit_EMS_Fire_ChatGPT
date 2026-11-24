import assert from 'node:assert/strict';
import test from 'node:test';
import {createFemaDiscoveryService,fetchFemaDiscovery,femaDiscoveryUrl,normalizeFemaDiscovery,parseDiscoveryQuery} from './publicIntelligenceDiscovery';
const now=Date.parse('2026-11-24T00:00:00Z'),q={state:'FL',fromYear:2023,offset:0};
const row=(id='uuid-1',changes:Record<string,unknown>={})=>({id,awardNumber:'EMW-2025-FG-001',vendorName:'EXAMPLE FIRE DEPARTMENT',vendorState:'FL',programName:'Assistance to Firefighters Grant',fiscalYear:2025,awardAmount:'120000.50',...changes});
const payload=(...rows:unknown[])=>({NonDisasterAssistanceFirefighterGrants:rows});
test('query accepts only bounded state, fiscal year and page; no caller URL or filters',()=>{
 assert.deepEqual(parseDiscoveryQuery({state:'FL',fromYear:'2023',offset:'50'},now),{...q,offset:50});
 for(const x of [{...q,state:"FL' or true"},{...q,state:'XX'},{...q,fromYear:2009},{...q,offset:1},{...q,offset:1000},{...q,url:'https://example.org'},{...q,fromYear:['2023']}])assert.equal(parseDiscoveryQuery(x,now),undefined);
 const url=femaDiscoveryUrl(q);assert.equal(url.hostname,'www.fema.gov');assert.match(url.searchParams.get('$filter')!,/vendorState eq 'FL'/);assert.equal(url.searchParams.get('$top'),'51');
});
test('source-native identifiers, state, program, fiscal year and amount are preserved, no invented award date',()=>{
 const result=normalizeFemaDiscovery(payload(row()),q,now);
 assert.equal(result.candidates.length,1);assert.equal(result.candidates[0].awardAmount,120000.50);
 assert.equal(result.candidates[0].documentDate,null);assert.equal(result.candidates[0].fiscalYear,2025);assert.equal(result.candidates[0].id,'uuid-1');
 assert.equal(normalizeFemaDiscovery(payload(row('x',{awardAmount:null})),q,now).candidates[0].awardAmount,null);
 assert.equal(normalizeFemaDiscovery(payload(row('x',{awardAmount:0})),q,now).candidates[0].awardAmount,0);
});
test('invalid, out-of-state, unrelated and conflicting source records are withheld',()=>{
 const r=normalizeFemaDiscovery(payload(row('a'),row('a',{awardAmount:2}),row('b'),row('b'),row('c',{vendorState:'GA'}),row('d',{programName:'Other Program'}),row('e',{id:null}),row('f',{fiscalYear:2020})),q,now);
 assert.deepEqual(r.candidates.map(x=>x.id),['b']);assert.equal(r.duplicates,1);assert.equal(r.withheld,6);
 assert.throws(()=>normalizeFemaDiscovery({},q,now),/schema/);
});
test('page cap and empty page are explicit and do not imply full source coverage',()=>{
 const rows=Array.from({length:51},(_,i)=>row('uuid-'+i));
 const result=normalizeFemaDiscovery(payload(...rows),q,now);
 assert.equal(result.candidates.length,50);assert.equal(result.nextOffset,50);
 const capped=normalizeFemaDiscovery(payload(...rows),{...q,offset:950},now);
 assert.equal(capped.scopeCapped,true);assert.equal(capped.nextOffset,null);
 assert.equal(normalizeFemaDiscovery(payload(),q,now).sourceRows,0);
 assert.throws(()=>normalizeFemaDiscovery(payload(...rows,row('extra')),q,now),/page size/);
});
test('network and schema failures never return a fabricated empty success',async()=>{
 const fake=async()=>new Response(JSON.stringify(payload(row())),{headers:{'content-type':'application/json'}});
 const result=await fetchFemaDiscovery(q,fake,now);assert.equal(result.candidates.length,1);
 await assert.rejects(fetchFemaDiscovery(q,async()=>new Response('Forbidden',{status:403}),now),/403/);
 await assert.rejects(fetchFemaDiscovery(q,async()=>new Response('<html>bad</html>',{headers:{'content-type':'text/html'}}),now),/JSON/);
 await assert.rejects(fetchFemaDiscovery(q,async()=>new Response('{}',{headers:{'content-type':'application/json'}}),now),/schema/);
 await assert.rejects(fetchFemaDiscovery(q,async()=>new Response('x'.repeat(2_000_001),{headers:{'content-type':'application/json'}}),now),/size limit/);
});
test('cache coalesces queries, preserves fetch timestamp and never falls back to stale data after failure',async()=>{
 let calls=0,t=now,fail=false;
 const service=createFemaDiscoveryService(async()=>{calls++;return fail?new Response('down',{status:503}):new Response(JSON.stringify(payload(row())),{headers:{'content-type':'application/json'}});},()=>t);
 const [a,b]=await Promise.all([service(q),service(q)]);
 assert.equal(calls,1);assert.equal(a.fetchedAt,b.fetchedAt);
 t+=60_000;assert.equal((await service(q)).fetchedAt,a.fetchedAt);
 t+=16*60_000;fail=true;await assert.rejects(service(q),/503/);assert.equal(calls,2);
});
