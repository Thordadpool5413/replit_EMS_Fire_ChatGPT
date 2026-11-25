import test from 'node:test';
import assert from 'node:assert/strict';
import type {Agency} from '../types';
import {createIntelligenceFact,type IntelligenceKind} from './documentedIntelligence';
import {toSharedEvidence} from './sharedEvidence';
import type {ReviewedEvidenceRow} from './sharedOpportunityRadar';
import {buildReviewedCallContext,buildReviewedCallBrief,type ReviewedCallSample} from './reviewedPreCallPlanning';
const now=Date.parse('2026-11-24T12:00:00Z'),checkedAt=new Date(now).toISOString();
const a={id:'registry-FDID-FL-12345',name:'Fixture Fire',stateCode:'FL',registryIdentity:{sourceName:'USFA NFDR',identifier:'12345',stateCode:'FL',name:'Fixture Fire',sourceUrl:'https://apps.usfa.fema.gov/registry/search',retrievedAt:'2026-11-20'}} as Agency;
function row(id:string,kind:IntelligenceKind,value:string,record:string,dueDate?:string,documentDate='2026-11-01'):ReviewedEvidenceRow{
 const f=createIntelligenceFact(a,{kind,value,sourceName:'Fixture City',sourceRecordId:record,sourceUrl:'https://example.gov/'+id,documentDate,dueDate},id,now-86400000);
 return {evidence:toSharedEvidence(a,f,now),authorUid:'editor',publishedAt:'2026-11-23T13:00:00Z',invalid:0,decisions:[{factId:id,action:'approved',reason:'source-checked',replacementId:'',reviewerUid:'reviewer',reviewedAt:'2026-11-23T14:00:00Z'}]};
}
const sample=(rows:ReviewedEvidenceRow[]):ReviewedCallSample=>({agencyId:a.id,started:now,documents:{rows,checkedAt}});
test('single reviewed source produces three questions and preserves communication restrictions',()=>{
 const r=buildReviewedCallContext(a,[a],sample([row('bid','procurement-open','Fixture bid','bid','2026-12-01'),row('grant','grant-awarded','Fixture grant','grant')]),now);
 const b=buildReviewedCallBrief(a,r.candidates.find(c=>c.key==='document:bid'),r.roles,now);
 assert.equal(b.points.questions.length,3);assert.match(b.preparation,/permitted communication channel/);assert.match(b.text,/2026-12-01/);assert.doesNotMatch(b.text,/Fixture grant/);
});
test('pending closures, identity duplicates and expired samples cannot seed a brief',()=>{
 const bid=row('bid','procurement-open','Fixture bid','bid','2026-12-01'),closed=row('close','procurement-closed','Cancelled','BID',undefined,'2026-11-20');closed.decisions=[];
 assert.equal(buildReviewedCallContext(a,[a],sample([bid,closed]),now).candidates.length,0);
 assert.equal(buildReviewedCallContext(a,[a,{...a,id:'other'}],sample([bid]),now).candidates.length,0);
 assert.equal(buildReviewedCallContext(a,[a],sample([bid]),now+300000).candidates.length,0);
 assert.equal(buildReviewedCallBrief(a,undefined,[],now).points.questions.length,3);
});
test('authority categories are context, not inferred purchasing relationships',()=>{
 const s=sample([]);s.authority={agencyId:a.id,name:a.name,stateCode:a.stateCode,complete:true,recentReviewed:2,roles:['procurement','budget'],checkedAt};
 const c=buildReviewedCallContext(a,[a],s,now);assert.deepEqual(c.roles,['procurement','budget']);
 assert.match(buildReviewedCallBrief(a,undefined,c.roles,now).roleNote,/no person is linked/);
 s.authority.name='Other';assert.equal(buildReviewedCallContext(a,[a],s,now).roles.length,0);
});
