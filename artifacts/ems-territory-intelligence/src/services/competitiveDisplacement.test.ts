import test from 'node:test';
import assert from 'node:assert/strict';
import type {Agency} from '../types';
import {createIntelligenceFact,type IntelligenceKind} from './documentedIntelligence';
import {sharedAgencyKey,toSharedEvidence} from './sharedEvidence';
import type {ReviewedSample} from './reviewedAccountPriorities';
import {buildCompetitiveDisplacement} from './competitiveDisplacement';
const now=Date.parse('2026-11-25T12:00:00Z');
const agency=(id:string)=>({id,name:'Fixture '+id,stateCode:'FL',registryIdentity:{sourceName:'USFA NFDR',identifier:id,stateCode:'FL',name:'Fixture '+id,sourceUrl:'https://apps.usfa.fema.gov/registry/search',retrievedAt:'2026-11-20'}} as Agency);
const a=agency('12345'),b=agency('23456'),c=agency('34567');
function row(a:Agency,id:string,kind:IntelligenceKind,value:string,sourceRecordId=id,documentDate='2026-11-01',dueDate?:string){
 const f=createIntelligenceFact(a,{kind,value,sourceName:'Fixture City',sourceRecordId,sourceUrl:'https://example.gov/'+id,documentDate,dueDate},id,now-86400000);
 return {evidence:toSharedEvidence(a,f,now),authorUid:'editor',publishedAt:'2026-11-24T13:00:00Z',invalid:0,decisions:[{factId:f.id,action:'approved' as const,reason:'source-checked' as const,replacementId:'',reviewerUid:'reviewer',reviewedAt:'2026-11-24T14:00:00Z'}]};
}
const sample=(a:Agency,rows:ReviewedSample['rows']):ReviewedSample=>({agencyId:a.id,identityKey:sharedAgencyKey(a)!,checkedAt:new Date(now).toISOString(),rows});
test('reviewed competitor observations use exact equipment category and independent account context',()=>{
 const s=sample(a,[row(a,'monitor','installed-monitor','Stryker LIFEPAK 15'),row(a,'epcr','installed-epcr','ImageTrend'),row(a,'cad','installed-cad','ZOLL RescueNet'),row(a,'contract','contract-expiration','2027-02-01'),row(a,'grant','grant-awarded','Fixture grant')]);
 const r=buildCompetitiveDisplacement([a,b,c],[a.id,b.id],[s,sample(b,[row(b,'other','procurement-open','Fixture solicitation','other','2026-11-01','2026-12-01')])],now,90,now);
 assert.equal(r.eligible,2);assert.equal(r.checked,2);assert.equal(r.competitorAccounts,1);assert.equal(r.rows.length,2);assert.equal(r.datedContextAccounts,1);
 const aa=r.accounts.find(x=>x.agency.id===a.id)!;assert.equal(aa.dates.length,1);assert.equal(aa.funding.length,1);assert.ok(aa.rows.every(x=>x.kind!=='installed-cad'&&x.preparation.questions.length===3));
 assert.equal(r.accounts.find(x=>x.agency.id===b.id)?.rows.length,0);assert.equal(r.accounts.some(x=>x.agency.id===c.id),false);
 assert.equal(buildCompetitiveDisplacement([a],[a.id],[s],now,90,now).accounts[0].dates[0].signal.signal.date,'2027-02-01');
});
test('unreviewed, stale, disputed and case-variant records never become competitive claims',()=>{
 const pending=row(a,'pending','installed-monitor','Stryker LIFEPAK 15');pending.decisions=[];
 const older=row(a,'old','installed-cpr','Stryker LUCAS 3','old','2024-01-01');
 const x=row(a,'x','installed-ventilator','Hamilton T1','ABC'),y=row(a,'y','installed-ventilator','Hamilton T1','abc');
 const s=sample(a,[pending,older,x,y]);
 const r=buildCompetitiveDisplacement([a],[a.id],[s],now,90,now);assert.equal(r.rows.length,0);assert.equal(r.accounts[0].status,'no-eligible-competitor');
 const conflict=sample(a,[row(a,'one','installed-monitor','Philips HeartStart'),row(a,'two','installed-monitor','Stryker LIFEPAK 15')]);
 assert.equal(buildCompetitiveDisplacement([a],[a.id],[conflict],now,90,now).rows.length,0);
});
test('identity and sample validity gate scope; no dates or observations survive expiry',()=>{
 const s=sample(a,[row(a,'m','installed-monitor','Stryker LIFEPAK 15')]);
 assert.equal(buildCompetitiveDisplacement([a],[a.id],[s],now,90,now+300000).active,false);
 assert.equal(buildCompetitiveDisplacement([a],[a.id,a.id],[s],now,90,now).active,false);
 assert.equal(buildCompetitiveDisplacement([a,{...a,id:'copy'}],[a.id],[s],now,90,now).eligible,0);
 assert.equal(buildCompetitiveDisplacement([a],[a.id],[s,s],now,90,now).accounts[0].status,'review-unavailable');
 assert.equal(buildCompetitiveDisplacement([a],[a.id],[{...s,identityKey:'other'}],now,90,now).rows.length,0);
});
