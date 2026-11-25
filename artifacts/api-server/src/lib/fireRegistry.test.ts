import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCached, listNerisDepartments } from './fireRegistry';
test('failed refresh retains original snapshot date and backs off retries',async()=>{
 const realNow=Date.now;let now=realNow();Date.now=()=>now;
 try {
 const first=await loadCached('test:retention',async()=>['original'],'unavailable');
 now+=13*60*60*1000;
 let attempts=0;
 const failing=async():Promise<string[]>=>{attempts++;throw new Error('upstream unavailable');};
 const stale=await loadCached('test:retention',failing,'unavailable');
 assert.deepEqual(stale,first);
 assert.deepEqual(await loadCached('test:retention',failing,'unavailable'),first);
 assert.equal(attempts,1);
 now+=31000;
 assert.deepEqual((await loadCached('test:retention',async()=>['updated'],'unavailable')).data,['updated']);
 }finally{Date.now=realNow;}
});
test('failure without a previous snapshot remains an error',async()=>{
 await assert.rejects(loadCached('test:empty',async()=>{throw new Error('offline');},'unavailable'),/offline/);
});

test('NERIS state roster retrieves all flagged pages and retains source-native IDs',async()=>{
 const realFetch=globalThis.fetch;let calls=0;
 globalThis.fetch=async (input)=>{const u=new URL(String(input));assert.equal(u.searchParams.get('where'),"state='XY'");const offset=Number(u.searchParams.get('resultOffset'));calls++;
 return new Response(JSON.stringify({features:[{attributes:{neris_id:offset===0?'FD001':'FD002',name:'Source department '+offset,state:'XY',city:'Town'}}],exceededTransferLimit:offset===0}),{status:200});};
 try{const roster=await listNerisDepartments('XY');assert.equal(calls,2);assert.equal(roster.source,'NERIS');assert.deepEqual(roster.departments.map(d=>d.nerisId),['FD001','FD002']);assert.equal(roster.warning,null);assert.equal((await listNerisDepartments('XY')).departments.length,2);assert.equal(calls,2);await assert.rejects(listNerisDepartments("X'"),/Invalid state/);}
 finally{globalThis.fetch=realFetch;}
});

test('station identity, parent relationship and coordinate provenance remain separate',async()=>{
 const {validFacilityParent,parseNerisFacility}=await import('./fireRegistry');
 const parent={source:'NERIS' as const,stateCode:'FL',identifier:'FD12345678'};
 assert.equal(validFacilityParent(parent),true);
 assert.equal(validFacilityParent({...parent,identifier:"FD' OR 1=1"}),false);
 const feature={attributes:{neris_id:'ST123456789012',department_neris_id:parent.identifier,station_name:'CI fixture',state:'GA',address_line_1:'123 Main St',city:'Example',zip_code:'30001'},geometry:{x:-84,y:33}};
 const result=parseNerisFacility(feature,parent);
 assert.equal(result?.stateCode,'GA');assert.equal(result?.sourceRecordId,'ST123456789012');assert.equal(result?.endUserValidationRequired,true);
 assert.equal(parseNerisFacility({...feature,attributes:{...feature.attributes,department_neris_id:'OTHER'}},parent),null);
 assert.equal(parseNerisFacility({...feature,geometry:{x:500,y:33}},parent)?.coordinates,null);
});

test('raw station IDs are counted before filtering invalid or foreign rows',async()=>{
 const {reconcileNerisFacilities}=await import('./fireRegistry');
 const parent={source:'NERIS' as const,stateCode:'FL',identifier:'FD12345678'};
 const row={attributes:{neris_id:'ST123456789012',department_neris_id:parent.identifier,state:'GA',station_name:'CI fixture'},geometry:{x:-84,y:33}};
 for(const duplicate of [{...row,attributes:{...row.attributes,state:'XX'}},{...row,attributes:{...row.attributes,department_neris_id:'OTHER'}},{...row,attributes:{...row.attributes,neris_id:'st123456789012'}}]){
  const result=reconcileNerisFacilities([row,duplicate],parent,true);assert.equal(result.facilities.length,0);assert.equal(result.withheld,2);
 }
 assert.equal(reconcileNerisFacilities([row],parent,true).facilities[0].stateCode,'GA');
 assert.equal(reconcileNerisFacilities([row],parent,false).facilities[0].coordinates,null);
 assert.equal(reconcileNerisFacilities([{...row,attributes:{...row.attributes,neris_id:parent.identifier}}],parent,true).withheld,1);
});
