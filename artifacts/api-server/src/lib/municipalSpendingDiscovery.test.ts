import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MUNICIPAL_SOURCE,MUNICIPAL_ENDPOINT,municipalWindow,municipalDeadline,municipalNoticeUrl,parseMunicipalQuery,validateMunicipalPage,type MunicipalQuery} from './municipalDiscoveryContract';
import {municipalRequest,normalizeMunicipalDiscovery,fetchMunicipalDiscovery,createMunicipalDiscoveryService} from './municipalSpendingDiscovery';
const now=Date.parse('2026-11-24T12:00:00Z'),q:MunicipalQuery={source:MUNICIPAL_SOURCE,topic:'cardiac',days:90,page:1};
const row=(id='123',changes:Record<string,unknown>={})=>({request_id:id,section_name:'Procurement',short_title:'Cardiac monitor purchase',agency_name:'Example municipal agency',type_of_notice_description:'Solicitation',start_date:'2026-11-20T00:00:00.000',due_date:'2026-12-01T14:00:00.000',pin:'PIN-123',contract_amount:'0',vendor_name:null,selection_method_description:'Competitive Sealed Bids',...changes});
test('allowlisted source, topics, pages and local window; no arbitrary URLs or query expressions',()=>{
 assert.deepEqual(parseMunicipalQuery({source:MUNICIPAL_SOURCE,topic:'cardiac',days:'90',page:'1'}),q);
 for(const x of [{...q,source:'https://evil.test'},{...q,topic:"x' OR true"},{...q,days:31},{...q,page:21},{...q,url:'https://evil.test'},{...q,page:['1']}])assert.equal(parseMunicipalQuery(x),undefined);
 const u=municipalRequest(q,now);assert.equal(u.origin+u.pathname,MUNICIPAL_ENDPOINT);assert.equal(u.searchParams.get('$limit'),'26');assert.match(u.searchParams.get('$where')!,/lower\(section_name\) = 'procurement'/);
 assert.equal(municipalWindow(30,Date.parse('2026-11-24T02:00:00Z')).windowEnd,'2026-11-23');
});
test('native notice identity, issuer, source link, local dates and nullable amounts remain distinct',()=>{
 const r=normalizeMunicipalDiscovery([row(),row('456',{type_of_notice_description:'Award',vendor_name:'Example Vendor',contract_amount:null}),row('789',{type_of_notice_description:'Intent to Award',contract_amount:'120.25'})],q,now);
 assert.equal(r.notices.length,3);assert.equal(r.notices[0].issuingAgency,'Example municipal agency');assert.equal(r.notices[0].dueLocal,'2026-12-01T14:00:00.000');assert.equal(r.notices[0].contractAmount,0);assert.equal(r.notices[1].contractAmount,null);assert.equal(r.notices[1].vendor,'Example Vendor');assert.equal(r.notices[2].kind,'intent-to-award');assert.equal(r.notices[0].sourceUrl,municipalNoticeUrl('123'));
});
test('elapsed or future dates never turn notices into verified open opportunities',()=>{
 const r=normalizeMunicipalDiscovery([row('1'),row('2',{due_date:'2026-11-23T12:00:00'}),row('3',{due_date:'2026-11-24T12:00:00'}),row('4',{due_date:'2026-12-01T14:00:00Z'}),row('5',{type_of_notice_description:'Award'}),row('6',{type_of_notice_description:'Cancellation'})],q,now);
 assert.deepEqual(r.notices.map(n=>municipalDeadline(n,now)),['future-unconfirmed','elapsed','today','not-stated','not-applicable','not-applicable']);assert.equal(r.notices[5].kind,'other');
});
test('wrong section, topic, date, ID, duplicates and contradictory records are withheld',()=>{
 const r=normalizeMunicipalDiscovery([row('1'),row('1',{pin:'conflict'}),row('2'),row('2'),row('3',{section_name:'Public Hearings'}),row('4',{short_title:'Office supplies'}),row('5',{start_date:'2025-01-01'}),row('6',{start_date:'2026-02-31T00:00:00'}),row('bad id')],q,now);
 assert.deepEqual(r.notices.map(n=>n.id),['2']);assert.equal(r.duplicates,1);assert.equal(r.withheld,7);
});
test('bounded pages, caps and failures never imply full coverage',()=>{
 const rows=Array.from({length:26},(_,i)=>row(String(i+1)));
 assert.equal(normalizeMunicipalDiscovery(rows,q,now).nextPage,2);
 assert.equal(normalizeMunicipalDiscovery(rows,{...q,page:20},now).scopeCapped,true);
 assert.equal(normalizeMunicipalDiscovery([],q,now).sourceRows,0);
 assert.throws(()=>normalizeMunicipalDiscovery([...rows,row('100')],q,now));
 assert.throws(()=>normalizeMunicipalDiscovery({},q,now));
});
test('client contract validates source, dates, native links and count accounting',()=>{
 const p=normalizeMunicipalDiscovery([row()],q,now);
 assert.equal(validateMunicipalPage(p,q,now).notices.length,1);
 for(const x of [{...p,fetchedAt:'2025-01-01'},{...p,sourceRows:2},{...p,nextPage:2},{...p,notices:[{...p.notices[0],sourceUrl:'https://evil.test'}]},{...p,notices:[{...p.notices[0],kind:'award'}]},{...p,notices:[{...p.notices[0],publishedDate:'2026-11-31'}]}])assert.throws(()=>validateMunicipalPage(x,q,now));
 assert.equal(readFileSync(new URL('./municipalDiscoveryContract.ts',import.meta.url),'utf8'),readFileSync(new URL('../../../ems-territory-intelligence/src/services/municipalDiscoveryContract.ts',import.meta.url),'utf8'));
});
test('fixed upstream request and network failure handling',async()=>{
 const p=await fetchMunicipalDiscovery(q,async(url,init)=>{assert.equal(String(url),municipalRequest(q,now).toString());assert.equal(init?.redirect,'error');return new Response(JSON.stringify([row()]),{headers:{'content-type':'application/json'}});},now);
 assert.equal(p.notices.length,1);
 await assert.rejects(fetchMunicipalDiscovery(q,async()=>new Response('down',{status:503}),now),/503/);
 await assert.rejects(fetchMunicipalDiscovery(q,async()=>new Response('{}',{headers:{'content-type':'application/json'}}),now),/bounded notice page/);
});
test('coalesced cache retains original timestamp and expired cache never hides source failure',async()=>{
 let t=now,calls=0,fail=false;
 const s=createMunicipalDiscoveryService(async()=>{calls++;return fail?new Response('down',{status:503}):new Response(JSON.stringify([row()]),{headers:{'content-type':'application/json'}});},()=>t);
 const [a,b]=await Promise.all([s(q),s(q)]);assert.equal(a.fetchedAt,b.fetchedAt);assert.equal(calls,1);
 t+=16*60_000;fail=true;await assert.rejects(s(q),/503/);assert.equal(calls,2);
});
