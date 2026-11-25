import test from 'node:test';
import assert from 'node:assert/strict';
import {mentions,reconcileEquipmentCandidates,collectEquipmentScope,type Candidate,type Scope} from './equipmentAcquisition';
const c:Candidate={source:'chicago-contracts',nativeId:'["123","0"]',organization:'CI fixture',title:'LIFEPAK 15',vendor:'ZOLL',date:'2026-11-01',kind:'purchase-order-revision',sourceUrl:'https://example.gov/fixture',recordNumber:'123',revision:'0'};
const scope=(candidates:Candidate[],topic:Scope['topic']='cardiac'):Scope=>({source:'chicago-contracts',topic,pages:1,sourceRows:candidates.length,withheld:0,duplicates:0,status:'complete-window',candidates});
test('cross-topic identity dedup preserves revisions, contradictory rows withheld, vendor and text separate',()=>{
 const other={...c,nativeId:'["123","1"]',revision:'1'};
 const r=reconcileEquipmentCandidates([scope([c,other]),scope([c],'brands')]);
 assert.equal(r.candidates.length,2);assert.equal(r.summary.repeatSourceRows,1);
 assert.equal(r.candidates[0].documentMentions[0].manufacturer,'Stryker / Physio-Control');
 assert.equal(r.candidates[0].vendorMentions[0].manufacturer,'ZOLL');
 assert.equal(r.candidates[0].endUserValidationRequired,true);
 assert.equal(reconcileEquipmentCandidates([scope([c]),scope([{...c,title:'Different'}],'brands')]).summary.conflictingIdentitiesWithheld,1);
 assert.deepEqual(mentions('ambulance'),[]);assert.deepEqual(mentions('ESO'),[]);
});
test('source failure remains unavailable, not zero equipment',async()=>{
 const r=await collectEquipmentScope('nyc-city-record','cardiac',Date.now(),async()=>{throw Error('source outage');});
 assert.equal(r.status,'unavailable');assert.equal(r.pages,0);
});
