import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCached } from './fireRegistry';
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
