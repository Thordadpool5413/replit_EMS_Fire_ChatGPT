import test from 'node:test';
import assert from 'node:assert/strict';
import type {Agency} from '../types';
import {sharedAgencyKey,toSharedEvidence} from './sharedEvidence';
import {createIntelligenceFact} from './documentedIntelligence';
import type {ReviewedSample} from './reviewedAccountPriorities';
import type {ResolveLocation} from './geographicResearch';
import {buildFieldPlan,fieldPlanDays,fieldPlanText,type FieldVisit} from './fieldExecutionPlan';
const now=Date.parse('2026-11-25T12:00:00Z'),today='2026-11-25';
const agency=(id:string)=>({id,name:'Fixture '+id,stateCode:'FL',registryIdentity:{sourceName:'USFA NFDR',identifier:id,stateCode:'FL',name:'Fixture '+id,sourceUrl:'https://apps.usfa.fema.gov/registry/search',retrievedAt:'2026-11-20'}} as Agency);
const a=agency('12345'),b=agency('23456'),c=agency('34567');
function sample(a:Agency):ReviewedSample{
 const f=createIntelligenceFact(a,{kind:'procurement-open',value:'Fixture bid',sourceName:'Fixture City',sourceRecordId:'bid-'+a.id,sourceUrl:'https://example.gov/bid',documentDate:'2026-11-01',dueDate:'2026-12-01'},'bid-'+a.id,now-86400000);
 return {agencyId:a.id,identityKey:sharedAgencyKey(a)!,checkedAt:new Date(now).toISOString(),rows:[{evidence:toSharedEvidence(a,f,now),authorUid:'editor',publishedAt:'2026-11-24T13:00:00Z',invalid:0,decisions:[{factId:f.id,action:'approved',reason:'source-checked',replacementId:'',reviewerUid:'reviewer',reviewedAt:'2026-11-24T14:00:00Z'}]}]};
}
const resolve:ResolveLocation=(a)=>({location:{identityKey:sharedAgencyKey(a)!,address:{street:'100 Fixture Street',city:'Fixture',state:'FL',zip:'12345'},kind:'registry headquarters',sourceName:'Fixture',sourceUrl:'https://apps.usfa.fema.gov/registry/search'},match:a.id===c.id?undefined:{method:'census-address-range',latitude:28,longitude:a.id==='12345'?-80:-80.1,matchedAddress:'100 Fixture Street, Fixture, FL, 12345'}});
const visit=(a:Agency,day=today):FieldVisit=>({agencyId:a.id,identityKey:sharedAgencyKey(a)!,day,objective:'Verify official record'});
test('seven day window crosses month/year without local time drift',()=>{
 assert.deepEqual(fieldPlanDays('2026-12-29'),['2026-12-29','2026-12-30','2026-12-31','2027-01-01','2027-01-02','2027-01-03','2027-01-04']);
 assert.deepEqual(fieldPlanDays('2026-02-30'),[]);
});
test('user-selected drafts only, ranked context and same-day accepted geographic grouping',()=>{
 const all=[a,b,c],sel=all.map(x=>x.id),samples=[sample(a),sample(b)];
 const r=buildFieldPlan(all,sel,samples,resolve,today,[visit(a),visit(b),visit(c,'2026-11-26')],now,now);
 assert.equal(r.planned.length,3);assert.equal(r.checked,2);assert.equal(r.schedule[0].groups.length,1);
 assert.equal(r.schedule[1].unmapped,1);assert.equal(r.planned.find(x=>x.agency.id===c.id)?.priority,undefined);
 assert.equal(buildFieldPlan(all,sel,samples,resolve,today,[],now,now).planned.length,0);
 assert.equal(buildFieldPlan(all,sel,samples,resolve,today,[visit(a)],now,now).unplanned.length,2);
});
test('expired, duplicate, foreign and invalid drafts fail closed',()=>{
 const all=[a,b,c],sel=[a.id,b.id],samples=[sample(a),sample(b)];
 const r=buildFieldPlan(all,sel,samples,resolve,today,[visit(a),visit(a),visit(c),{...visit(b),identityKey:'foreign'}],now,now);
 assert.equal(r.planned.length,0);assert.equal(r.withheld,4);
 assert.equal(buildFieldPlan(all,sel,samples,resolve,today,[visit(a,'2026-12-02')],now,now).planned.length,0);
 assert.equal(buildFieldPlan(all,sel,samples,resolve,today,[{...visit(a),objective:' '}],now,now).planned.length,0);
 assert.equal(buildFieldPlan(all,sel,samples,resolve,today,[visit(a)],now,now+300000).active,false);
 assert.equal(buildFieldPlan(all,[a.id,a.id],samples,resolve,today,[visit(a)],now,now).active,false);
 assert.equal(buildFieldPlan([...all,{...a,id:'duplicate'}],sel,samples,resolve,today,[visit(a)],now,now).planned.length,0);
});

test('internal copy is limited to chosen date and current scope, never includes local task notes',()=>{
 const aa={...a,followUpTasks:[{id:'private',date:today,repName:'',meetingType:'Standalone task',notes:'private detail',nextAction:'private action',dueDate:today,taskOnly:true,followUpStatus:'open' as const}]};
 const all=[aa,b],sel=all.map(x=>x.id),samples=all.map(sample);
 const r=buildFieldPlan(all,sel,samples,resolve,today,[visit(aa),visit(b,'2026-11-26')],now,now);
 const text=fieldPlanText(r,today);
 assert.match(text,/Fixture 12345/);assert.match(text,/https:\/\/example.gov\/bid/);assert.doesNotMatch(text,/Fixture 23456|private detail|private action/);
 assert.equal(fieldPlanText(buildFieldPlan(all,sel,samples,resolve,today,[visit(a)],now,now+300000)), '');
 assert.equal(fieldPlanText(r,'2026-12-03'),'');
});
