import test from 'node:test';
import assert from 'node:assert/strict';
import type {Agency} from '../types';
import {createIntelligenceFact,type IntelligenceKind} from './documentedIntelligence';
import {toSharedEvidence,sharedAgencyKey} from './sharedEvidence';
import {buildReviewedAccountPriorities,eligiblePriorityAccounts,type ReviewedSample} from './reviewedAccountPriorities';
import type {ReviewedEvidenceRow} from './sharedOpportunityRadar';
const now=Date.parse('2026-11-24T12:00:00Z');
const a={id:'a',name:'Fixture A',stateCode:'FL',registryIdentity:{sourceName:'USFA NFDR',identifier:'12345',stateCode:'FL'}} as Agency;
const b={...a,id:'b',name:'Fixture B',registryIdentity:{...a.registryIdentity!,identifier:'54321'}} as Agency;
function row(agency:Agency,id:string,kind:IntelligenceKind,value:string,dueDate?:string):ReviewedEvidenceRow{
 const f=createIntelligenceFact(agency,{kind,value,sourceName:'Fixture City',sourceRecordId:id,sourceUrl:'https://example.gov/'+id,documentDate:'2026-11-01',dueDate},id,now-86400000);
 return {evidence:toSharedEvidence(agency,f,now),authorUid:'editor',publishedAt:'2026-11-23T13:00:00Z',invalid:0,decisions:[{factId:id,action:'approved',reason:'source-checked',replacementId:'',reviewerUid:'reviewer',reviewedAt:'2026-11-23T14:00:00Z'}]};
}
const sample=(agency:Agency,rows:ReviewedEvidenceRow[]):ReviewedSample=>({agencyId:agency.id,identityKey:sharedAgencyKey(agency)!,rows,checkedAt:new Date(now).toISOString()});
test('reviewed dates outrank funding regardless of award size; unknown accounts stay unranked',()=>{
 const samples=[sample(a,[row(a,'grant','grant-awarded','$9000000')]),sample(b,[row(b,'bid','procurement-open','Fixture bid','2026-12-01')])];
 const r=buildReviewedAccountPriorities([a,b],['a','b'],samples,now);
 assert.deepEqual(r.ranked.map(x=>[x.agency.id,x.primary.band]),[['b','verify-now'],['a','plan-research']]);
 assert.equal(r.checked,2);
 assert.equal(buildReviewedAccountPriorities([a,b],['a','b'],samples,now,'grant-award').gaps[0].status,'filtered');
 const partial=buildReviewedAccountPriorities([a,b],['a','b'],[samples[0]],now);assert.equal(partial.gaps[0].status,'unavailable');
});
test('pending, expired samples and duplicate identities cannot rank',()=>{
 const pending=row(a,'grant','grant-awarded','Fixture grant');pending.decisions=[];
 assert.equal(buildReviewedAccountPriorities([a],['a'],[sample(a,[pending])],now).gaps[0].status,'no-signal');
 assert.equal(buildReviewedAccountPriorities([a],['a'],[sample(a,[pending])],now+300000).gaps[0].status,'unavailable');
 assert.equal(eligiblePriorityAccounts([a,{...a,id:'duplicate'}]).length,0);
 assert.equal(eligiblePriorityAccounts([a,{...b,id:a.id}]).length,0);
 assert.equal(buildReviewedAccountPriorities([a],['a','a'],[],now).invalidScope,true);
});
