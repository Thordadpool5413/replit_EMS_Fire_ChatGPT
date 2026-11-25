import test from 'node:test';
import assert from 'node:assert/strict';
import type {Agency} from '../types';
import {createIntelligenceFact} from './documentedIntelligence';
import {toSharedEvidence} from './sharedEvidence';
import type {ReviewedCallSample} from './reviewedPreCallPlanning';
import {buildNextResearchActions,makeResearchTask,duplicateOpenResearchTask} from './nextResearchActions';
const now=Date.parse('2026-11-24T12:00:00Z'),checkedAt=new Date(now).toISOString();
const a={id:'registry-FDID-FL-12345',name:'Fixture Fire',stateCode:'FL',registryIdentity:{sourceName:'USFA NFDR',identifier:'12345',stateCode:'FL',name:'Fixture Fire',sourceUrl:'https://apps.usfa.fema.gov/registry/search',retrievedAt:'2026-11-20'}} as Agency;
const f=createIntelligenceFact(a,{kind:'procurement-open',value:'Fixture bid detail',sourceName:'Fixture City',sourceRecordId:'bid',sourceUrl:'https://example.gov/bid',documentDate:'2026-11-01',dueDate:'2026-12-01'},'bid',now-86400000);
const sample:ReviewedCallSample={agencyId:a.id,started:now,documents:{checkedAt,rows:[{evidence:toSharedEvidence(a,f,now),authorUid:'editor',publishedAt:'2026-11-23T13:00:00Z',invalid:0,decisions:[{factId:'bid',action:'approved',reason:'source-checked',replacementId:'',reviewerUid:'reviewer',reviewedAt:'2026-11-23T14:00:00Z'}]}]}};
test('reviewed deadline first; unavailable sources produce explicit research gaps',()=>{
 const r=buildNextResearchActions(a,[a],sample,now);assert.equal(r.actions[0].priority,'urgent');assert.equal(r.actions[0].publishedDate,'2026-12-01');assert.ok(r.actions.some(x=>x.key==='gap:authority'));
 assert.equal(buildNextResearchActions(a,[a],sample,now+300000).actions.length,0);
 assert.equal(buildNextResearchActions(a,[a,{...a,id:'duplicate'}],sample,now).ready,false);
});
test('user date is separate from published deadline, private context not written, duplicate open tasks blocked',()=>{
 const action=buildNextResearchActions(a,[a],sample,now).actions[0];
 assert.equal(makeResearchTask(a,action,'','', 'id','2026-11-24'),undefined);
 const task=makeResearchTask(a,action,'Rep','2026-11-26','id','2026-11-24')!;
 assert.equal(task.dueDate,'2026-11-26');assert.equal(task.notes,'');assert.equal(task.taskOnly,true);assert.doesNotMatch(JSON.stringify(task),/Fixture bid detail|example.gov|2026-12-01/);
 assert.equal(duplicateOpenResearchTask({...a,followUpTasks:[task]},action.taskText),true);
 assert.equal(makeResearchTask({...a,followUpTasks:[task]},action,'','2026-11-26','other','2026-11-24'),undefined);
});
