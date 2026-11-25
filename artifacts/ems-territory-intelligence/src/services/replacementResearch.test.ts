import test from 'node:test';
import assert from 'node:assert/strict';
import type {Agency} from '../types';
import type {LifecycleSample,LifecycleObservation} from './lifecycleTimeline';
import {acceptedLifecycleSample,buildReplacementResearch} from './replacementResearch';
const now=Date.parse('2026-11-25T12:00:00Z');
const agency={id:'a',name:'Fixture Fire',stateCode:'FL',registryIdentity:{sourceName:'NERIS',identifier:'FD12345',stateCode:'FL',name:'Fixture Fire',sourceUrl:'https://www.usfa.fema.gov/neris/',retrievedAt:'2026-11-20'}} as Agency;
const o:LifecycleObservation={stationId:'S1',submissionId:'one',family:'monitors',maker:'zoll',model:'Fixture',apparatus:'Unit 1',observedOn:'2026-11-01',basis:'direct-observation',sourceUrl:'',acquiredOn:'2024-01-01',serviceEnd:'2026-12-01'};
const sample=(observations:LifecycleObservation[]=[o]):LifecycleSample=>({agencyId:'a',parentId:'FD12345',stations:[{id:'S1',name:'Fixture station',stateCode:'FL'}],observations,acceptedRowsChecked:observations.length,checkedAt:new Date(now).toISOString()});
const run=(observations:LifecycleObservation[],window:30|90|180|365=90)=>buildReplacementResearch(agency,[agency],sample(observations),now,window,now);
test('reported dates prioritize verification, not replacement; all makers and date gaps kept separate',()=>{
 const r=run([o,{...o,submissionId:'two',maker:'stryker',model:'Fixture 2',serviceEnd:'2026-10-01'},{...o,submissionId:'three',model:'Fixture 3',serviceEnd:undefined}]);
 assert.equal(r.available,true);assert.equal(r.upcoming,1);assert.equal(r.past,1);assert.equal(r.gaps,1);assert.equal(r.rows[0].nextDate,'2026-12-01');assert.equal(r.rows[0].preparation.questions.length,3);
 assert.equal(run([{...o,serviceEnd:'2027-02-01'}],30).rows[0].status,'later');
 assert.equal(run([{...o,model:''}]).rows[0].status,'date-gap');
});
test('same model differing dates require reconciliation; stale observations are not actionable',()=>{
 const r=run([o,{...o,submissionId:'two',serviceEnd:'2027-01-01'}]);assert.equal(r.ambiguous,1);assert.equal(r.upcoming,0);assert.equal(r.rows[0].nextDate,undefined);
 assert.equal(run([{...o,observedOn:'2024-01-01'}]).stale,1);
 assert.equal(run([{...o,serviceEnd:undefined,acquiredOn:'2024-01-01'}]).rows[0].status,'date-gap');
});
test('incomplete, stale, foreign, duplicate and malformed station samples fail closed',()=>{
 assert.equal(acceptedLifecycleSample(agency,[agency],{...sample(),acceptedRowsChecked:2},now,now),undefined);
 assert.equal(acceptedLifecycleSample(agency,[agency],{...sample(),parentId:'OTHER'},now,now),undefined);
 assert.equal(acceptedLifecycleSample(agency,[agency],{...sample(),stations:[{id:'S1',name:null,stateCode:'GA'}]},now,now),undefined);
 assert.equal(acceptedLifecycleSample(agency,[agency],sample([o,o]),now,now),undefined);
 assert.equal(acceptedLifecycleSample(agency,[agency],sample([{...o,serviceEnd:'2026-02-30'}]),now,now),undefined);
 assert.equal(acceptedLifecycleSample(agency,[agency],sample([{...o,basis:'public-document',sourceUrl:'javascript:alert(1)'}]),now,now),undefined);
 assert.equal(acceptedLifecycleSample(agency,[agency,{...agency,id:'duplicate'}],sample(),now,now),undefined);
 assert.equal(buildReplacementResearch(agency,[agency],sample(),now,90,now+300000).available,false);
});
