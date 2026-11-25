import test from 'node:test';
import assert from 'node:assert/strict';
import type {Agency,FieldNote} from '../types';
import {sharedAgencyKey} from './sharedEvidence';
import {advanceDeal,EMPTY_DEAL} from './workingPipeline';
import {recordedTaskCohort,buildTerritoryAnalytics} from './territoryAnalytics';
import type {ResolveLocation} from './geographicResearch';
const today='2026-11-25',now=Date.parse(today+'T12:00:00Z');
const agency=(id:string)=>({id,name:'Fixture '+id,stateCode:'FL',registryIdentity:{sourceName:'USFA NFDR',identifier:id,stateCode:'FL',name:'Fixture '+id,sourceUrl:'https://apps.usfa.fema.gov/registry/search',retrievedAt:'2026-11-20'}} as Agency);
const a=agency('12345'),b=agency('23456');
const note=(id:string,date:string,meetingType:FieldNote['meetingType']='Phone Call'):FieldNote=>({id,date,meetingType,repName:'',notes:'fixture',nextAction:'',dueDate:''});
const resolve:ResolveLocation=()=>({location:undefined,match:undefined});
test('equal inclusive periods exclude tasks, future contacts and duplicate identities',()=>{
 const aa={...a,fieldNotes:[note('current','2026-10-27'),note('prior','2026-10-26','Ride-Along'),note('outside','2026-09-26'),note('future','2026-11-26'),{...note('task',today),taskOnly:true}]};
 const r=buildTerritoryAnalytics([aa,b],[a.id,b.id],[],[],resolve,today,30,now,now);
 assert.equal(r.start,'2026-10-27');assert.equal(r.previousStart,'2026-09-27');assert.equal(r.previousEnd,'2026-10-26');assert.equal(r.current.contacts,1);assert.equal(r.previous.contacts,1);assert.equal(r.previous.visits,1);assert.equal(r.eligible,2);assert.equal(r.competitiveChecked,0);assert.equal(r.withheldActivity,1);
 assert.equal(buildTerritoryAnalytics([aa,b],[a.id,a.id],[],[],resolve,today,30,now,now).active,false);
 assert.equal(buildTerritoryAnalytics([aa,b],[a.id],[],[],resolve,today,30,now,now+300000).rows.length,0);
});
test('task cohort counts current status, excludes malformed and duplicated records, coaching is a subset',()=>{
 const task=(id:string,date:string,done=false):FieldNote=>({...note(id,date,'Standalone task'),taskOnly:true,nextAction:'Coaching: Check | Success measure: Record',dueDate:'2026-11-24',followUpStatus:done?'completed':'open'});
 const aa={...a,followUpTasks:[task('one',today,true),task('two','2026-11-01'),task('old','2026-10-01'),task('dup',today),task('dup',today),task('bad','2026-02-30')]};
 const r=recordedTaskCohort(aa,'2026-10-27',today,today);
 assert.equal(r.total,2);assert.equal(r.complete,1);assert.equal(r.overdue,1);assert.equal(r.coaching,2);assert.equal(r.coachingComplete,1);assert.equal(r.withheld,3);
});
test('actual stage changes, not repeated saves or unavailable records',()=>{
 const k=sharedAgencyKey(a)!,first=advanceDeal(EMPTY_DEAL,a.id,k,undefined,true,now-2000);
 const second=advanceDeal(EMPTY_DEAL,a.id,k,first,true,now-1000);
 const third=advanceDeal({...EMPTY_DEAL,stage:'qualified',need:'Fixture need',authority:'Purchasing role',reference:'Fixture ref',nextAction:'Review',dueDate:today},a.id,k,second,true,now);
 const r=buildTerritoryAnalytics([a,b],[a.id,b.id],[],[{agencyId:a.id,identityKey:k,status:'read',record:third},{agencyId:b.id,identityKey:sharedAgencyKey(b)!,status:'unavailable'}],resolve,today,30,now,now);
 assert.equal(r.deviceReadable,1);assert.equal(r.workingRecords,1);assert.equal(r.stageChanges,1);assert.equal(r.changedAccounts,1);
 assert.equal(r.byStage.find(s=>s.stage==='qualified')?.count,1);
});
