import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CHICAGO_ENDPOINT,CHICAGO_FIELDS,chicagoWindow,chicagoRecordUrl,chicagoAmountNote,parseChicagoQuery,validateChicagoPage,type ChicagoQuery} from './chicagoDiscoveryContract';
import {chicagoRequest,normalizeChicagoDiscovery,fetchChicagoDiscovery,createChicagoDiscoveryService} from './chicagoDiscovery';
const now=Date.parse('2026-11-24T12:00:00Z'),q:ChicagoQuery={topic:'cardiac',days:365,page:1};
const row=(number='123',changes:Record<string,unknown>={})=>({purchase_order_contract_number:number,revision_number:'0',purchase_order_description:'Cardiac monitor purchase',specification_number:'S1',contract_type:'BLANKET',approval_date:'2026-11-20T00:00:00.000',start_date:'2026-11-20T00:00:00.000',end_date:'2027-11-20T00:00:00.000',department:'EXAMPLE DEPARTMENT',vendor_name:'EXAMPLE VENDOR',award_amount:'0',...changes});
test('fixed query, supported topics/windows and local calendar, no arbitrary filters or URLs',()=>{
 assert.deepEqual(parseChicagoQuery({topic:'cardiac',days:'365',page:'1'}),q);
 for(const x of [{...q,topic:'toString'},{...q,days:366},{...q,page:21},{...q,url:'https://evil.invalid'}])assert.equal(parseChicagoQuery(x),undefined);
 const u=chicagoRequest(q,now);assert.equal(u.origin+u.pathname,CHICAGO_ENDPOINT);assert.equal(u.searchParams.get('$limit'),'26');assert.equal(u.searchParams.get('$select'),CHICAGO_FIELDS.join(','));assert.match(u.searchParams.get('$where')!,/approval_date >=/);
 assert.equal(chicagoWindow(90,Date.parse('2026-11-24T04:00:00Z')).windowEnd,'2026-11-23');
});
test('revisions retained separately; negative, zero and absent amounts preserve meaning',()=>{
 const r=normalizeChicagoDiscovery([row(),row('123',{revision_number:'1',award_amount:'-120.25'}),row('456',{revision_number:null,award_amount:null,end_date:null})],q,now);
 assert.equal(r.records.length,3);assert.equal(r.records[0].amount,0);assert.equal(r.records[1].amount,-120.25);assert.equal(r.records[2].amount,null);assert.equal(r.records[2].endDay,null);
 assert.match(chicagoAmountNote(r.records[0]),/requirements-based/);assert.match(chicagoAmountNote(r.records[1]),/Negative modification/);
 assert.equal(r.records[1].sourceUrl,chicagoRecordUrl('123','1'));
 assert.match(new URL(r.records[2].sourceUrl).searchParams.get('$where')!,/revision_number IS NULL/);
 assert.throws(()=>chicagoRecordUrl("1' OR true",null));
});
test('conflicting native revision identity withheld, exact duplicates collapsed and unrelated rows excluded',()=>{
 const r=normalizeChicagoDiscovery([row('1'),row('1',{award_amount:25}),row('2'),row('2'),row('3',{purchase_order_description:'Prepaid office supplies'}),row('4',{approval_date:'2023-01-01'}),row('5',{approval_date:'2026-11-31'}),row('6',{end_date:'2025-01-01'}),row("bad'id")],q,now);
 assert.deepEqual(r.records.map(x=>x.contractNumber),['2']);assert.equal(r.duplicates,1);assert.equal(r.withheld,7);
});
test('page caps, source scope and invalid links fail closed; schema parity enforced',()=>{
 const rows=Array.from({length:26},(_,i)=>row(String(i+1))),r=normalizeChicagoDiscovery(rows,q,now);
 assert.equal(r.nextPage,2);assert.equal(normalizeChicagoDiscovery(rows,{...q,page:20},now).scopeCapped,true);
 assert.throws(()=>normalizeChicagoDiscovery([...rows,row('999')],q,now));
 for(const v of [{...r,sourceRows:1},{...r,fetchedAt:'2025-01-01'},{...r,records:[{...r.records[0],sourceUrl:'https://evil.invalid'}]},{...r,records:[{...r.records[0],revision:'99'}]}])assert.throws(()=>validateChicagoPage(v,q,now));
 assert.equal(readFileSync(new URL('./chicagoDiscoveryContract.ts',import.meta.url),'utf8'),readFileSync(new URL('../../../ems-territory-intelligence/src/services/chicagoDiscoveryContract.ts',import.meta.url),'utf8'));
});
test('bounded source fetch, failures and cache expiry do not fabricate empty success',async()=>{
 const ok=()=>new Response(JSON.stringify([row()]),{headers:{'content-type':'application/json'}});
 const r=await fetchChicagoDiscovery(q,async(url,init)=>{assert.equal(String(url),chicagoRequest(q,now).toString());assert.equal(init?.redirect,'error');return ok();},now);assert.equal(r.records.length,1);
 await assert.rejects(fetchChicagoDiscovery(q,async()=>new Response('down',{status:503}),now),/503/);
 await assert.rejects(fetchChicagoDiscovery(q,async()=>new Response('{}',{headers:{'content-type':'application/json'}}),now),/schema/);
 let t=now,calls=0,fail=false;const service=createChicagoDiscoveryService(async()=>{calls++;return fail?new Response('down',{status:503}):ok();},()=>t);
 const [a,b]=await Promise.all([service(q),service(q)]);assert.equal(a.fetchedAt,b.fetchedAt);assert.equal(calls,1);
 t+=16*60_000;fail=true;await assert.rejects(service(q),/503/);assert.equal(calls,2);
});
