import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FEDERAL_ENDPOINT,FEDERAL_STATES,parseFederalQuery,validateFederalPage} from './federalDiscoveryContract';
import {federalRequest,normalizeFederalDiscovery,fetchFederalDiscovery,createFederalDiscoveryService} from './federalSpendingDiscovery';
const now=Date.parse('2026-11-24T12:00:00Z'),q={state:'FL',fromYear:2023,topic:'grants',page:1} as const;
const grant=(id='ASST_NON_123',changes:Record<string,unknown>={})=>({generated_internal_id:id,'Award ID':'EMW-2025-FG-001','Recipient Name':'EXAMPLE FIRE DEPARTMENT','Recipient Location':{location_country_code:'USA',state_code:'FL',city_name:'Example'},'Awarding Agency':'DHS',Description:'Fire assistance','Start Date':'2025-01-01','End Date':'2027-01-01','Award Amount':0,primary_assistance_listing:{cfda_number:'97.044'},...changes});
const payload=(results:unknown[],page=1,hasNext=false)=>({limit:25,results,page_metadata:{page,hasNext},messages:[]});
test('fixed filters distinguish grant listing from contract keywords, enforce all 51 state/DC choices and reject arbitrary input',()=>{
 assert.equal(new Set(FEDERAL_STATES).size,51);
 for(const state of ['AK','NE','NV','MS','DC'])assert.ok(FEDERAL_STATES.includes(state));
 const g=federalRequest(q,now),c=federalRequest({...q,topic:'defibrillator'},now);
 assert.deepEqual(g.filters.award_type_codes,['02','03','04','05']);assert.deepEqual(g.filters.recipient_locations,[{country:'USA',state:'FL'}]);assert.ok('program_numbers' in g.filters);assert.deepEqual(g.filters.program_numbers,['97.044']);assert.deepEqual(c.filters.award_type_codes,['A','B','C','D']);assert.ok('keywords' in c.filters);assert.deepEqual(c.filters.keywords,['defibrillator']);
 for(const x of [{...q,topic:'toString'},{...q,state:'XX'},{...q,fromYear:2027},{...q,page:21},{...q,url:'https://bad.example'}])assert.equal(parseFederalQuery(x,now),undefined);
});
test('native award IDs, reported dates, nullable amounts and independent recipient scope are preserved',()=>{
 const r=normalizeFederalDiscovery(payload([grant(),grant('ASST_NON_456',{'Award Amount':null,'Start Date':null})]),q,now);
 assert.equal(r.candidates[0].sourceUrl,'https://www.usaspending.gov/award/ASST_NON_123');
 assert.equal(r.candidates[0].awardAmount,0);assert.equal(r.candidates[1].awardAmount,null);assert.equal(r.candidates[1].startDate,null);
 const c=normalizeFederalDiscovery(payload([grant('CONT_AWD_123')]),{...q,topic:'ambulance'},now);
 assert.equal(c.candidates[0].kind,'contract');
});
test('invalid state/country, wrong assistance listing, wrong source type and conflicts withheld',()=>{
 const r=normalizeFederalDiscovery(payload([grant('ASST_NON_a'),grant('ASST_NON_a',{'Award Amount':5}),grant('ASST_NON_b'),grant('ASST_NON_b'),grant('ASST_NON_c',{'Recipient Location':{location_country_code:'USA',state_code:'GA'}}),grant('ASST_NON_d',{primary_assistance_listing:{cfda_number:'97.999'}}),grant('CONT_AWD_e'),grant('ASST_NON_f',{'Recipient Location':{location_country_code:'CAN',state_code:'FL'}})]),q,now);
 assert.deepEqual(r.candidates.map(x=>x.id),['ASST_NON_b']);assert.equal(r.withheld,6);assert.equal(r.duplicates,1);
});
test('page metadata, warnings, and explicit browsing cap are validated',()=>{
 const rows=Array.from({length:25},(_,i)=>grant('ASST_NON_'+i));
 assert.equal(normalizeFederalDiscovery(payload(rows,1,true),q,now).nextPage,2);
 const capped=normalizeFederalDiscovery(payload(rows,20,true),{...q,page:20},now);assert.equal(capped.scopeCapped,true);assert.equal(capped.nextPage,null);
 assert.equal(normalizeFederalDiscovery({...payload([]),messages:['Notice']},q,now).warnings,1);
 for(const p of [{},payload([],2),payload([],1,true),{...payload([]),limit:50}])assert.throws(()=>normalizeFederalDiscovery(p,q,now));
});
test('requests use fixed POST host, reject malformed/oversized/unavailable sources, never fabricate empty success',async()=>{
 let seen=false;
 const r=await fetchFederalDiscovery(q,async(url,init)=>{assert.equal(String(url),FEDERAL_ENDPOINT);assert.equal(init?.method,'POST');assert.equal(init?.redirect,'error');seen=true;return new Response(JSON.stringify(payload([grant()])),{headers:{'content-type':'application/json'}});},now);
 assert.equal(seen,true);assert.equal(r.candidates.length,1);
 await assert.rejects(fetchFederalDiscovery(q,async()=>new Response('bad',{status:503}),now),/503/);
 await assert.rejects(fetchFederalDiscovery(q,async()=>new Response('{}',{headers:{'content-type':'application/json'}}),now),/expected award page/);
 await assert.rejects(fetchFederalDiscovery(q,async()=>new Response('x'.repeat(2_000_001),{headers:{'content-type':'application/json'}}),now),/size limit/);
});
test('cache coalesces and preserves original retrieval; stale data never masks failure',async()=>{
 let time=now,calls=0,fail=false;
 const service=createFederalDiscoveryService(async()=>{calls++;return fail?new Response('bad',{status:503}):new Response(JSON.stringify(payload([grant()])),{headers:{'content-type':'application/json'}});},()=>time);
 const [a,b]=await Promise.all([service(q),service(q)]);assert.equal(a.fetchedAt,b.fetchedAt);assert.equal(calls,1);
 time+=16*60_000;fail=true;await assert.rejects(service(q),/503/);assert.equal(calls,2);
});
test('client and server contract sources remain identical',()=>{
 const a=readFileSync(new URL('./federalDiscoveryContract.ts',import.meta.url),'utf8');
 const b=readFileSync(new URL('../../../ems-territory-intelligence/src/services/federalDiscoveryContract.ts',import.meta.url),'utf8');
 assert.equal(a,b);
});
test('client validator rejects fabricated dates, links, duplicate IDs and changed scope',()=>{
 const p=normalizeFederalDiscovery(payload([grant()]),q,now);
 for(const x of [{...p,fetchedAt:'2025-01-01'},{...p,sourceRows:2},{...p,query:{...q,state:'GA'}},{...p,candidates:[{...p.candidates[0],sourceUrl:'https://evil.example'}]},{...p,candidates:[{...p.candidates[0],endDate:'2024-01-01'}]}])assert.throws(()=>validateFederalPage(x,q,now));
});
