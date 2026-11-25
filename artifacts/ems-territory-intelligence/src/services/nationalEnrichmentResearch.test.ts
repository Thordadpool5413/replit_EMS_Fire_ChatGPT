import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileResearch,sampleResearch,type Candidate,type Snapshot} from './nationalEnrichmentResearch';
const c:Candidate={source:'usaspending',id:'CONT_AWD_fixture',recipient:'Fixture supplier',state:'FL',kind:'supplier',title:'Fixture',amount:10,url:'https://example.gov/fixture',period:''};
test('native duplicates collapse, conflicts are withheld, suppliers are not buyers',()=>{
 const s:Snapshot={state:'FL',started:0,scopes:[{topic:'defibrillator',status:'retrieved',pages:1,sourceRows:1,withheld:0,rows:[c]},{topic:'resuscitation',status:'retrieved',pages:1,sourceRows:1,withheld:0,rows:[c]}]};
 assert.equal(reconcileResearch(s,[]).rows.length,1);assert.equal(reconcileResearch(s,[]).rows[0].status,'supplier-not-buyer');
 s.scopes[1].rows=[{...c,amount:20}];assert.equal(reconcileResearch(s,[]).conflicts,1);assert.equal(reconcileResearch(s,[]).rows.length,0);
});
test('upstream failures are not empty successful searches',async()=>{
 const fail=async()=>{throw Error('CI outage fixture');};
 const r=await sampleResearch('FL',2024,['fema','grants'],new AbortController().signal,()=>{}, {fema:fail,federal:fail});assert.ok(r.scopes.every(s=>s.status==='unavailable'));
});
