import test from 'node:test';
import assert from 'node:assert/strict';
import type {Agency,FieldNote} from '../types';
import {createIntelligenceFact} from './documentedIntelligence';
import {toSharedEvidence,sharedAgencyKey} from './sharedEvidence';
import type {ReviewedSample} from './reviewedAccountPriorities';
import {buildTerritoryCommand} from './territoryCommand';
const now=Date.parse('2026-11-24T12:00:00Z'),today='2026-11-24';
const a={id:'registry-FDID-FL-12345',name:'Fixture Fire',stateCode:'FL',registryIdentity:{sourceName:'USFA NFDR',identifier:'12345',stateCode:'FL',name:'Fixture Fire',sourceUrl:'https://apps.usfa.fema.gov/registry/search',retrievedAt:'2026-11-20'}} as Agency;
const b={...a,id:'b',name:'Fixture B',registryIdentity:{...a.registryIdentity!,identifier:'54321',name:'Fixture B'}} as Agency;
const resolve=()=>({location:undefined,match:undefined});
function sample(a:Agency):ReviewedSample{
 const f=createIntelligenceFact(a,{kind:'procurement-open',value:'Fixture bid',sourceName:'Fixture City',sourceRecordId:'bid',sourceUrl:'https://example.gov/bid',documentDate:'2026-11-01',dueDate:'2026-12-01'},'bid',now-86400000);
 return {agencyId:a.id,identityKey:sharedAgencyKey(a)!,checkedAt:new Date(now).toISOString(),rows:[{evidence:toSharedEvidence(a,f,now),authorUid:'editor',publishedAt:'2026-11-23T13:00:00Z',invalid:0,decisions:[{factId:'bid',action:'approved',reason:'source-checked',replacementId:'',reviewerUid:'reviewer',reviewedAt:'2026-11-23T14:00:00Z'}]}]};
}
const task:FieldNote={id:'task',date:today,repName:'',meetingType:'Standalone task',notes:'',nextAction:'Verify official record',dueDate:'2026-11-23',taskOnly:true,followUpStatus:'open'};
test('command summary counts accounts not documents and does not extrapolate',()=>{
 const r=buildTerritoryCommand([a,b],[a.id,b.id],[sample(a)],resolve,today,now);
 assert.equal(r.selected,2);assert.equal(r.checked,1);assert.equal(r.priorities.length,1);assert.equal(r.urgent,1);assert.equal(r.deadlines,1);assert.equal(r.funding,0);assert.equal(r.locationGaps,1);assert.equal(r.mapped,0);
 assert.equal(buildTerritoryCommand([a,b],[a.id],[sample(a)],resolve,today,now+300000).priorities.length,0);
});
test('tasks scoped to selected unique accounts; duplicate IDs withheld, completed tasks excluded',()=>{
 const aa={...a,followUpTasks:[task,{...task,id:'completed',followUpStatus:'completed' as const}]},bb={...b,followUpTasks:[{...task,id:'other'}]};
 const r=buildTerritoryCommand([aa,bb],[aa.id],[],resolve,today,now);assert.equal(r.tasks.length,1);assert.equal(r.overdue,1);assert.equal(r.tasks[0].agency.id,a.id);
 assert.equal(buildTerritoryCommand([{...aa,fieldNotes:[task]},bb],[aa.id],[],resolve,today,now).withheldTasks,2);
 assert.equal(buildTerritoryCommand([aa,{...aa,id:'duplicate'}],[aa.id],[],resolve,today,now).tasks.length,0);
 assert.equal(buildTerritoryCommand([aa],[aa.id,aa.id],[],resolve,today,now).tasks.length,0);
});
