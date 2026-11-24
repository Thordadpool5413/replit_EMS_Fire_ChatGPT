import test from 'node:test';
import assert from 'node:assert/strict';
import type {Agency} from '../types';
import {createIntelligenceFact,type IntelligenceKind} from './documentedIntelligence';
import {buildOpportunityPriorities} from './opportunityPrioritization';
const now=Date.parse('2026-11-24T12:00:00Z'),day=86400000;
const agency=(id:string,name='Example '+id,state='FL'):Agency=>({id:'registry-FDID-'+state+'-'+id,name,stateCode:state,registryIdentity:{sourceName:'USFA NFDR',identifier:id,stateCode:state,name,sourceUrl:'https://apps.usfa.fema.gov/registry/search',retrievedAt:'2026-11-20'}} as Agency);
const a=agency('12345'),b=agency('23456'),c=agency('34567');
const fact=(a:Agency,id:string,kind:IntelligenceKind,value:string,documentDate='2026-11-01',record='record-'+id,source='Example City',dueDate?:string)=>createIntelligenceFact(a,{kind,value,documentDate,sourceName:source,sourceRecordId:record,sourceUrl:'https://example.gov/'+record,dueDate},id,now);
const withDocs=(a:Agency,...sourceFacts:ReturnType<typeof fact>[]):Agency=>({...a,sourceFacts});
const bid=(a:Agency,id:string,dueDate:string,record='bid-'+id,source='City',documentDate='2026-11-01')=>fact(a,id,'procurement-open','Monitor solicitation',documentDate,record,source,dueDate);
test('account priorities favor actual published timing; independent funding or equipment does not inflate band',()=>{
 const one=withDocs(a,bid(a,'bid','2026-12-02'));
 const two=withDocs(b,fact(b,'contract','contract-expiration','2027-01-01'),fact(b,'grant','grant-awarded','$99999999'),fact(b,'fleet','installed-monitor','LIFEPAK 15'));
 const three=withDocs(c,fact(c,'fleet','installed-monitor','LIFEPAK 15'));
 const r=buildOpportunityPriorities([three,two,one],'all','all',now);
 assert.deepEqual(r.ranked.map(x=>x.agency.id),[a.id,b.id,c.id]);
 assert.deepEqual(r.ranked.map(x=>x.band),['verify-now','verify-soon','explore']);
 assert.equal(r.ranked[1].signals.length,3);assert.equal(r.ranked[0].primary.days,8);
 assert.equal(r.signalCount,5);
});
test('deadline boundaries, elapsed deadlines and old or distant contract documents are conservative',()=>{
 const one=withDocs(a,bid(a,'today','2026-11-24'),bid(a,'two-weeks','2026-12-08'),bid(a,'later','2026-12-09'),bid(a,'elapsed','2026-11-23'),fact(a,'old','contract-expiration','2027-01-01','2024-11-01'),fact(a,'distant','contract-expiration','2028-01-01'));
 const r=buildOpportunityPriorities([one],'all','all',now);
 assert.equal(r.ranked[0].primary.days,0);assert.equal(r.signalCount,3);
 assert.deepEqual(r.ranked[0].signals.map(s=>s.band),['verify-now','verify-now','verify-soon']);
 const future=buildOpportunityPriorities([one],'all','all',now+day);
 assert.equal(future.signalCount,2);
});
test('closure, award, unverified reopening and ambiguous record casing cannot generate open signals',()=>{
 const open=bid(a,'open','2026-12-02','PIN-1'),closed=fact(a,'closed','procurement-closed','Cancelled','2026-11-02','PIN-1','City');
 assert.equal(buildOpportunityPriorities([withDocs(a,open,closed)],'all','all',now).ranked.length,0);
 const re=bid(a,'again','2026-12-15','PIN-1','City','2026-11-03');
 assert.equal(buildOpportunityPriorities([withDocs(a,open,closed,re)],'all','all',now).ranked.length,0);
 const casing=fact(a,'different','procurement-closed','Cancelled','2026-11-02','pin-1','City');
 const r=buildOpportunityPriorities([withDocs(a,open,casing)],'all','all',now);
 assert.equal(r.ranked.length,0);assert.equal(r.reviewRequired,1);
 const award=fact(a,'award','procurement-awarded','Awarded','2026-11-02','PIN-1','City');
 assert.equal(buildOpportunityPriorities([withDocs(a,open,award)],'all','all',now).ranked[0].primary.kind,'awarded-procurement');
});
test('mixed maker, generic brand, stale observation, local correction and contradictory documents do not rank as conversion',()=>{
 const check=(...f:ReturnType<typeof fact>[])=>buildOpportunityPriorities([withDocs(a,...f)],'all','all',now);
 for(const value of ['ZOLL X Series','ZOLL X Series and LIFEPAK 15','Stryker','Unidentified model'])assert.equal(check(fact(a,'fleet','installed-monitor',value)).ranked.length,0);
 assert.equal(check(fact(a,'fleet','installed-monitor','LIFEPAK 15','2023-01-01')).ranked.length,0);
 const conflict=check(fact(a,'one','installed-monitor','LIFEPAK 15'),fact(a,'two','installed-monitor','ZOLL X Series'));
 assert.equal(conflict.ranked.length,0);assert.equal(conflict.reviewRequired,1);
 const flagged={...withDocs(a,fact(a,'fleet','installed-monitor','LIFEPAK 15')),_factReviews:[{agencyId:a.id,fieldId:'monitor.model',action:'flag',reviewedAt:'2026-11-20T00:00:00Z'}]} as Agency;
 assert.equal(buildOpportunityPriorities([flagged],'all','all',now).ranked.length,0);
});
test('global duplicate identity, cross-state duplicate account ID and malformed documents fail closed',()=>{
 const one=withDocs(a,bid(a,'bid','2026-12-02'));
 assert.equal(buildOpportunityPriorities([one,{...a,id:'other'}],'FL','all',now).identityExcluded,1);
 assert.equal(buildOpportunityPriorities([one,{...agency('56789','Other','GA'),id:a.id}],'FL','all',now).identityExcluded,1);
 const malformed={...fact(a,'invalid','installed-monitor','LIFEPAK 15'),geographicId:'different'};
 const result=buildOpportunityPriorities([withDocs(a,bid(a,'bid','2026-12-02'),malformed)],'all','all',now);
 assert.equal(result.ranked.length,0);assert.equal(result.reviewRequired,1);
});
test('duplicate observations never inflate priority, filters rerank only matching evidence, deterministic ties',()=>{
 const f=bid(a,'bid','2026-12-02'),dupe={...f,id:'duplicate',sourceUrl:'https://example.gov/alternate'};
 const one=withDocs(a,f,dupe,fact(a,'fleet','installed-monitor','LIFEPAK 15'));
 const two=withDocs(b,fact(b,'fleet','installed-monitor','LIFEPAK 15'));
 const r=buildOpportunityPriorities([two,one],'all','all',now);
 assert.equal(r.ranked[0].signals.length,2);
 const filtered=buildOpportunityPriorities([two,one],'FL','competitor-equipment',now);
 assert.deepEqual(filtered.ranked.map(x=>x.band),['explore','explore']);
 assert.deepEqual(filtered.ranked.map(x=>x.agency.id),[a.id,b.id]);
 assert.equal(buildOpportunityPriorities([one,two],'all','open-procurement',now).filteredOut,1);
});
test('coverage counts unknowns explicitly; one unresolved category does not inflate unrelated valid signal',()=>{
 const one=withDocs(a,bid(a,'bid','2026-12-02'),fact(a,'one','installed-monitor','LIFEPAK 15'),fact(a,'two','installed-monitor','ZOLL X Series'));
 const r=buildOpportunityPriorities([one,b,withDocs(c,fact(c,'fleet','installed-monitor','ZOLL X Series'))],'all','all',now);
 assert.equal(r.loadedRows,3);assert.equal(r.noTypedEvidence,1);assert.equal(r.typedRows,2);assert.equal(r.noEligibleSignals,1);assert.equal(r.reviewRequired,1);
 assert.equal(r.ranked.length,1);assert.equal(r.ranked[0].signals.length,1);assert.equal(r.ranked[0].reviewRequired,true);
});
