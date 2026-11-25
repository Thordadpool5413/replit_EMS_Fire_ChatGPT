import test from 'node:test';
import assert from 'node:assert/strict';
import type {Agency,FieldNote} from '../types';
import {accountActivity,buildAccountCoverage} from './accountCoverage';
import {sharedAgencyKey,toSharedEvidence} from './sharedEvidence';
import {createIntelligenceFact} from './documentedIntelligence';
import type {ReviewedSample} from './reviewedAccountPriorities';
import type {ResolveLocation} from './geographicResearch';
const today='2026-11-25',now=Date.parse(today+'T12:00:00Z');
const agency=(id:string)=>({id,name:'Fixture '+id,stateCode:'FL',registryIdentity:{sourceName:'USFA NFDR',identifier:id,stateCode:'FL',name:'Fixture '+id,sourceUrl:'https://apps.usfa.fema.gov/registry/search',retrievedAt:'2026-11-20'}} as Agency);
const note=(id:string,date:string,meetingType:FieldNote['meetingType']='Phone Call'):FieldNote=>({id,date,meetingType,repName:'',notes:'fixture',nextAction:'',dueDate:''});
const a=agency('12345'),b=agency('23456'),c=agency('34567');
const resolve:ResolveLocation=(a)=>({location:{identityKey:sharedAgencyKey(a)!,address:{street:'100 Fixture Street',city:'Fixture',state:'FL',zip:'12345'},kind:'registry headquarters',sourceName:'Fixture',sourceUrl:'https://apps.usfa.fema.gov/registry/search'},match:a.id===c.id?undefined:{method:'census-address-range',latitude:28,longitude:-80,matchedAddress:'100 Fixture Street, Fixture, FL, 12345'}});
function sample(a:Agency):ReviewedSample{
 const f=createIntelligenceFact(a,{kind:'procurement-open',value:'Fixture bid',sourceName:'Fixture City',sourceRecordId:'bid-'+a.id,sourceUrl:'https://example.gov/bid',documentDate:'2026-11-01',dueDate:'2026-12-01'},'bid-'+a.id,now-86400000);
 return {agencyId:a.id,identityKey:sharedAgencyKey(a)!,checkedAt:new Date(now).toISOString(),rows:[{evidence:toSharedEvidence(a,f,now),authorUid:'editor',publishedAt:'2026-11-24T13:00:00Z',invalid:0,decisions:[{factId:f.id,action:'approved',reason:'source-checked',replacementId:'',reviewerUid:'reviewer',reviewedAt:'2026-11-24T14:00:00Z'}]}]};
}
test('activity window is inclusive; excludes task-only, RFP review, future and duplicate records',()=>{
 const notes=[note('a','2026-10-27'),note('b','2026-10-26','On-Site Station Visit'),note('c',today,'Ride-Along'),note('d',today,'RFP Review'),note('future','2026-11-26'),note('bad','2026-02-30'),note('dup',today),{...note('task',today),taskOnly:true}];
 const r=accountActivity({...a,fieldNotes:notes,followUpTasks:[note('dup',today)]},today,30);
 assert.equal(r.since,'2026-10-27');assert.equal(r.contacts,2);assert.equal(r.visits,1);assert.equal(r.lastVisit,today);assert.equal(r.withheld,3);
 assert.equal(accountActivity({...a,fieldNotes:[note('old','2026-10-01')]},today,30).status,'older');
 assert.equal(accountActivity({...a,followUpTasks:[note('task',today)]},today,30).status,'not-recorded');
});
test('coverage counts distinct selected eligible accounts, retains independent source context and location gaps',()=>{
 const aa={...a,fieldNotes:[note('visit',today,'On-Site Station Visit')]},bb={...b,fieldNotes:[note('old','2026-10-01')],followUpTasks:[{...note('due',today,'Standalone task'),taskOnly:true,nextAction:'Verify',dueDate:today}]};
 const all=[aa,bb,c],sel=all.map(a=>a.id),r=buildAccountCoverage(all,sel,[sample(bb)],resolve,today,30,now,now);
 assert.equal(r.eligible,3);assert.equal(r.recent,1);assert.equal(r.older,1);assert.equal(r.notRecorded,1);assert.equal(r.visitAccounts,1);assert.equal(r.overdueAccounts,1);assert.equal(r.priorityGaps,1);assert.equal(r.mapped,2);
 assert.equal(buildAccountCoverage(all,sel,[sample(bb)],resolve,today,60,now,now).recent,2);
 assert.equal(buildAccountCoverage(all,[aa.id],[],resolve,today,30,now,now).eligible,1);
});
test('invalid selection, expired sample and conflicting identities withhold unsafe rows',()=>{
 assert.equal(buildAccountCoverage([a,b],[a.id,a.id],[],resolve,today,30,now,now).active,false);
 assert.equal(buildAccountCoverage([a,b],[a.id],[],resolve,today,30,now,now+300000).rows.length,0);
 const r=buildAccountCoverage([a,{...a,id:'duplicate'},b],[a.id,b.id],[],resolve,today,30,now,now);
 assert.equal(r.eligible,1);assert.equal(r.excluded,1);
 assert.equal(buildAccountCoverage([a],[a.id],[],()=>({location:undefined,match:undefined}),today,30,now,now).mapped,0);
});
