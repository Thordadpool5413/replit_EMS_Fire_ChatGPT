import test from 'node:test';import assert from 'node:assert/strict';
import {collectNppesPages} from './nppesPagination';
const page=(start:number,count=200)=>Array.from({length:count},(_,i)=>({number:String(1000000000+start+i),enumeration_type:'NPI-2'}));
test('paginates, deduplicates and stops on a short page',async()=>{
 const offsets:number[]=[];const result=await collectNppesPages(async(skip)=>{offsets.push(skip);return {results:skip===0?page(0):page(199,2)};});
 assert.deepEqual(offsets,[0,200]);assert.equal(result.records.length,201);assert.equal(result.resultsTruncated,false);
});
test('later-page failures retain results with a warning, initial failures reject',async()=>{
 const result=await collectNppesPages(async(skip)=>{if(skip)throw Error('offline');return {results:page(0)};});
 assert.equal(result.records.length,200);assert.equal(result.resultsTruncated,true);assert.match(result.warning!,/failed/);
 await assert.rejects(collectNppesPages(async()=>({Errors:['invalid']})));
});
test('repeated pages and maximum bounds never look complete',async()=>{
 const repeated=await collectNppesPages(async()=>({results:page(0)}));assert.equal(repeated.records.length,200);assert.equal(repeated.resultsTruncated,true);
 let calls=0;const capped=await collectNppesPages(async(skip)=>{calls++;return{results:page(skip)};});assert.equal(calls,6);assert.equal(capped.records.length,1200);assert.equal(capped.resultsTruncated,true);
});
