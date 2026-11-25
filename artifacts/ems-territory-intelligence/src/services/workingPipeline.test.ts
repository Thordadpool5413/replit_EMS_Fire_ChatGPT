import test from 'node:test';
import assert from 'node:assert/strict';
import type {Agency} from '../types';
import {sharedAgencyKey} from './sharedEvidence';
import {EMPTY_DEAL,advanceDeal,validateDealInput,loadDeal,saveDeal,dealStorageKey,buildWorkingPipeline,type DealInput} from './workingPipeline';
const now=Date.parse('2026-11-25T12:00:00Z'),today='2026-11-25';
const agency=(id:string)=>({id,name:'Fixture '+id,stateCode:'FL',registryIdentity:{sourceName:'USFA NFDR',identifier:id,stateCode:'FL',name:'Fixture '+id,sourceUrl:'https://apps.usfa.fema.gov/registry/search',retrievedAt:'2026-11-20'}} as Agency);
const a=agency('12345'),b=agency('23456'),key=sharedAgencyKey(a)!;
const qualified:DealInput={stage:'qualified',need:'Fixture need',authority:'Purchasing role',milestone:'',reference:'Fixture source 2026-11-20',nextAction:'Verify scope',dueDate:'2026-12-01'};
test('explicit qualification, date and terminal outcome gates',()=>{
 assert.throws(()=>advanceDeal(qualified,a.id,key,undefined,false,now));
 assert.ok(validateDealInput({...qualified,authority:''}));assert.ok(validateDealInput({...qualified,dueDate:'2026-02-30'}));
 assert.ok(validateDealInput({...qualified,stage:'won'}));assert.ok(validateDealInput({...EMPTY_DEAL,stage:'closed',milestone:'closed'}));
 assert.equal(advanceDeal(qualified,a.id,key,undefined,true,now).revision,1);
});
test('device records are account and user scoped; compare revision before write',()=>{
 const map=new Map<string,string>(),store={getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>{map.set(k,v);}};
 const first=saveDeal(store,'user1',a.id,key,qualified,0,true,now);
 assert.equal(loadDeal(store,'user2',a.id,key,now),undefined);
 assert.throws(()=>saveDeal(store,'user1',a.id,key,qualified,0,true,now));
 const second=saveDeal(store,'user1',a.id,key,{...qualified,stage:'evaluation',milestone:'Fixture evaluation'},first.revision,true,now+1000);
 assert.equal(second.revision,2);assert.equal(second.history.length,2);
 map.set(dealStorageKey('user1',a.id,key),'broken');assert.throws(()=>loadDeal(store,'user1',a.id,key,now));
});
test('only explicit records count, no inferred stage from CRM or source; excluded identities and expiry fail closed',()=>{
 const d=advanceDeal({...qualified,dueDate:'2026-11-24'},a.id,key,undefined,true,now);
 const r=buildWorkingPipeline([a,b],[a.id,b.id],[],[d],now,today,now);
 assert.equal(r.qualified,1);assert.equal(r.unrecorded,1);assert.equal(r.atRisk,1);
 assert.equal(buildWorkingPipeline([a,b],[b.id],[],[d],now,today,now).qualified,0);
 assert.equal(buildWorkingPipeline([a,b],[a.id,a.id],[],[d],now,today,now).eligible,0);
 assert.equal(buildWorkingPipeline([a,{...a,id:'copy'}],[a.id],[],[d],now,today,now).eligible,0);
 assert.equal(buildWorkingPipeline([a],[a.id],[],[d],now,today,now+300000).eligible,0);
 assert.equal(buildWorkingPipeline([a],[a.id],[],[d,d],now,today,now).qualified,0);
});
