import test from 'node:test';
import assert from 'node:assert/strict';
import type {Agency} from '../types';
import {createIntelligenceFact,type IntelligenceKind} from './documentedIntelligence';
import {toSharedEvidence,sharedAgencyKey} from './sharedEvidence';
import type {ReviewedEvidenceRow} from './sharedOpportunityRadar';
import type {ReviewedSample} from './reviewedAccountPriorities';
import {buildCommercialQueue} from './commercialOpportunityQueue';
const now=Date.parse('2026-11-24T12:00:00Z');
const a={id:'a',name:'Fixture A',stateCode:'FL',registryIdentity:{sourceName:'USFA NFDR',identifier:'12345',stateCode:'FL'}} as Agency;
function row(id:string,kind:IntelligenceKind,value:string,record:string,dueDate?:string,documentDate='2026-11-01'):ReviewedEvidenceRow{
 const f=createIntelligenceFact(a,{kind,value,sourceName:'Fixture City',sourceRecordId:record,sourceUrl:'https://example.gov/'+id,documentDate,dueDate},id,now-86400000);
 return {evidence:toSharedEvidence(a,f,now),authorUid:'editor',publishedAt:'2026-11-23T13:00:00Z',invalid:0,decisions:[{factId:id,action:'approved',reason:'source-checked',replacementId:'',reviewerUid:'reviewer',reviewedAt:'2026-11-23T14:00:00Z'}]};
}
const sample=(rows:ReviewedEvidenceRow[]):ReviewedSample=>({agencyId:a.id,identityKey:sharedAgencyKey(a)!,rows,checkedAt:new Date(now).toISOString()});
test('commercial queue separates dated contracts, funding, historical awards and equipment',()=>{
 const rows=[row('bid','procurement-open','Fixture bid','bid','2026-12-01'),row('contract','contract-expiration','2027-05-01','contract'),row('grant','grant-awarded','Fixture funding','grant'),row('award','procurement-awarded','Fixture award','award'),row('equip','installed-monitor','LIFEPAK 15','equip')];
 const r=buildCommercialQueue([a],['a'],[sample(rows)],now,90);
 assert.equal(r.upcoming.length,1);assert.equal(r.later.length,1);assert.equal(r.funding.length,1);assert.equal(r.awards.length,1);assert.equal(r.accountsWithRecords,1);
 assert.equal(buildCommercialQueue([a],['a'],[sample(rows)],now,365).upcoming.length,2);
});
test('pending later closure with case-variant identity withholds old bid; unknown is not no opportunity',()=>{
 const bid=row('bid','procurement-open','Fixture bid','Bid-A','2026-12-01');
 const closed=row('closed','procurement-closed','Cancelled','BID-A',undefined,'2026-11-20');closed.decisions=[];
 const r=buildCommercialQueue([a],['a'],[sample([bid,closed])],now,90);
 assert.equal(r.upcoming.length,0);assert.equal(r.ambiguous,1);
 assert.equal(buildCommercialQueue([a],['a'],[],now,90).gaps[0].status,'unavailable');
});
