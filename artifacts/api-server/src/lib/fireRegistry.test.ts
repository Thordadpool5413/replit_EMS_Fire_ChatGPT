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
