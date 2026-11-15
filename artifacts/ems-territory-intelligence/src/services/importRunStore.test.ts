import test from 'node:test';import assert from 'node:assert/strict';import {recordImportRun,loadImportRuns,IMPORT_RUN_KEY}from'./importRunStore';
test('import receipts preserve unknown counts and bound history without clearing corrupt records',()=>{
 const data=new Map<string,string>();const store={getItem:(k:string)=>data.get(k)??null,setItem:(k:string,v:string)=>{data.set(k,v);}};
 const run={source:'Source backup',status:'completed' as const,accepted:2,duplicates:0,conflicts:1,unmatchedAgencies:null,message:'Preserved conflict'};
 for(let i=0;i<105;i++)assert.equal(recordImportRun(run,store),true);
 assert.equal(loadImportRuns(store).length,100);assert.equal(loadImportRuns(store)[0].unmatchedAgencies,null);
 data.set(IMPORT_RUN_KEY,'broken');assert.equal(recordImportRun(run,store),false);assert.equal(data.get(IMPORT_RUN_KEY),'broken');
});
test('receipt storage failures do not throw after a successful import',()=>{
 assert.equal(recordImportRun({source:'source',status:'completed',accepted:1,duplicates:null,conflicts:null,unmatchedAgencies:null,message:'saved'},{getItem:()=>null,setItem:()=>{throw Error('quota');}}),false);
});
