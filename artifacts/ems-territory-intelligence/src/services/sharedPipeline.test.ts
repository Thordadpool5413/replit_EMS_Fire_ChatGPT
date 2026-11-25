import test from 'node:test';
import assert from 'node:assert/strict';
import {readSharedDeal,saveSharedDeal,type SharedRead} from './sharedPipeline';
import {EMPTY_DEAL,advanceDeal} from './workingPipeline';
const identityKey='FDID:FL:12345',agencyId='fixture',binding='a'.repeat(64);
const read:SharedRead={agencyId,identityKey,binding,canWrite:true,status:'read'};
const response=(body:unknown,status=200):typeof fetch=>async()=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json'}});
test('shared client fails closed for malformed, foreign, or unacknowledged server data',async()=>{
 for(const body of [null,[],{}, {identityKey:'other',binding,canWrite:true,record:null},{identityKey,binding:'bad',canWrite:true,record:null},{identityKey,binding,canWrite:true,record:{}}]){
  await assert.rejects(readSharedDeal(agencyId,identityKey,response(body)));
 }
 const valid=advanceDeal(EMPTY_DEAL,agencyId,identityKey,undefined,true);
 for(const body of [{identityKey,binding:'b'.repeat(64),canWrite:true,record:valid},{identityKey,binding,canWrite:false,record:valid},{identityKey,binding,canWrite:true,record:null}]){
  await assert.rejects(saveSharedDeal(read,EMPTY_DEAL,0,true,response(body)));
 }
 await assert.rejects(saveSharedDeal(read,EMPTY_DEAL,0,true,response({error:'conflict'},409)),/conflict/);
 assert.deepEqual(await saveSharedDeal(read,EMPTY_DEAL,0,true,response({identityKey,binding,canWrite:true,record:valid})),valid);
});
test('read uses private no-store transport and explicit write requires confirmation',async()=>{
 const fetcher:typeof fetch=async(url,init)=>{
  assert.equal(url,'/api/agencies/fixture/working-pipeline');assert.equal(init?.credentials,'include');assert.equal(init?.cache,'no-store');
  assert.equal(init?.method,undefined);return new Response(JSON.stringify({identityKey,binding,canWrite:false,record:null}));
 };
 const result=await readSharedDeal(agencyId,identityKey,fetcher);assert.equal(result.status,'read');assert.equal(result.record,undefined);
 await assert.rejects(saveSharedDeal(result,EMPTY_DEAL,0,true,fetcher));
 await assert.rejects(saveSharedDeal(read,EMPTY_DEAL,0,false,fetcher));
});
