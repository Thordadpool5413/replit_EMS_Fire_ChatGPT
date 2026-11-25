import test from 'node:test';
import assert from 'node:assert/strict';
import type {Agency,FieldNote} from '../types';
import {sharedAgencyKey,toSharedEvidence} from './sharedEvidence';
import {createIntelligenceFact} from './documentedIntelligence';
import {advanceDeal,EMPTY_DEAL} from './workingPipeline';
import type {ReviewedSample} from './reviewedAccountPriorities';
import type {ResolveLocation} from './geographicResearch';
import {buildLeadershipReview,type DeviceRead} from './leadershipReview';
const today='2026-11-25',now=Date.parse(today+'T12:00:00Z');
const agency=(id:string)=>({id,name:'Fixture '+id,stateCode:'FL',registryIdentity:{sourceName:'USFA NFDR',identifier:id,stateCode:'FL',name:'Fixture '+id,sourceUrl:'https://apps.usfa.fema.gov/registry/search',retrievedAt:'2026-11-20'}} as Agency);
const a=agency('12345'),b=agency('23456'),c=agency('34567');
const resolve:ResolveLocation=()=>({location:undefined,match:undefined});
const note:FieldNote={id:'one',date:today,repName:'',meetingType:'Phone Call',notes:'fixture',nextAction:'Verify',dueDate:today};
function sample(a:Agency):ReviewedSample{
 const f=createIntelligenceFact(a,{kind:'procurement-open',value:'Fixture solicitation',sourceName:'Fixture City',sourceRecordId:'bid-'+a.id,sourceUrl:'https://example.gov/bid',documentDate:'2026-11-01',dueDate:'2026-12-01'},'bid-'+a.id,now-86400000);
 return {agencyId:a.id,identityKey:sharedAgencyKey(a)!,checkedAt:new Date(now).toISOString(),rows:[{evidence:toSharedEvidence(a,f,now),authorUid:'editor',publishedAt:'2026-11-24T13:00:00Z',invalid:0,decisions:[{factId:f.id,action:'approved',reason:'source-checked',replacementId:'',reviewerUid:'reviewer',reviewedAt:'2026-11-24T14:00:00Z'}]}]};
}
const read=(a:Agency):DeviceRead=>({agencyId:a.id,identityKey:sharedAgencyKey(a)!,status:'read'});
test('distinct account denominators, separate reviewed and device signals, overlapping prompts',()=>{
 const aa={...a,fieldNotes:[note]},all=[aa,b,c];
 const d=advanceDeal({...EMPTY_DEAL,stage:'qualified',need:'Fixture need',authority:'Purchasing',reference:'Fixture source',nextAction:'Check',dueDate:'2026-11-24'},b.id,sharedAgencyKey(b)!,undefined,true,now);
 const r=buildLeadershipReview(all,[a.id,b.id],[sample(aa),sample(b)],[read(aa),{...read(b),record:d}],resolve,today,30,now,now);
 assert.equal(r.eligible,2);assert.equal(r.checked,2);assert.equal(r.contacted,1);assert.equal(r.qualified,1);assert.equal(r.attention,2);assert.equal(r.deviceReadable,2);
 assert.ok(r.rows.find(x=>x.agency.id===b.id)?.reasons.includes('pipeline-risk'));
 assert.ok(r.rows.find(x=>x.agency.id===b.id)?.reasons.includes('contact-gap'));
 assert.ok(r.rows.find(x=>x.agency.id===a.id)?.reasons.includes('follow-up'));
 assert.equal(r.rows.some(x=>x.agency.id===c.id),false);
 assert.ok(r.byReason.reduce((n,x)=>n+x.count,0)>r.attention);
});
test('unavailable records never count as confirmed empty; identity and sample gates fail closed',()=>{
 const r=buildLeadershipReview([a,b],[a.id,b.id],[sample(a)],[{...read(a),status:'unavailable'},read(b)],resolve,today,30,now,now);
 assert.equal(r.deviceReadable,1);assert.equal(r.recorded,0);assert.equal(r.checked,1);
 assert.equal(r.rows.find(x=>x.agency.id===a.id)?.reasons.includes('working-record-gap'),false);
 assert.ok(r.rows.find(x=>x.agency.id===b.id)?.reasons.includes('document-gap'));
 assert.equal(buildLeadershipReview([a],[a.id,a.id],[],[],resolve,today,30,now,now).active,false);
 assert.equal(buildLeadershipReview([a],[a.id],[],[],resolve,today,30,now,now+300000).rows.length,0);
 assert.equal(buildLeadershipReview([a,{...a,id:'copy'}],[a.id],[],[],resolve,today,30,now,now).eligible,0);
 assert.equal(buildLeadershipReview([a],[a.id],[],[read(a),read(a)],resolve,today,30,now,now).deviceReadable,0);
});
