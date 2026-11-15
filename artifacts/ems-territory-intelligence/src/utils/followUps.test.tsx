import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FollowUpWorkspace } from '../components/FollowUpWorkspace';
import { collectFollowUps, followUpBucket, localDay } from './followUps';
import { applyAgencyMutation } from '../services/agencyMutation';
import type { Agency, FieldNote, SyncOutboxItem } from '../types';
const note:FieldNote={id:'visit-a',date:'2026-11-12',repName:'Nick',meetingType:'Phone Call',notes:'Discussed evaluation',nextAction:'Schedule evaluation',dueDate:'2026-11-15'};
const agency={id:'a',name:'County EMS',fieldNotes:[note],lastContactDate:'2026-11-12'} as Agency;
let mutationSequence=0;
const mutation=(changes:object,expected={dueDate:note.dueDate,followUpStatus:'open'}):SyncOutboxItem=>({id:`change-${++mutationSequence}`,agencyId:'a',agencyName:'County EMS',timestamp:'2026-11-15T01:00:00Z',actionType:'UPDATE_FOLLOW_UP',status:'PENDING',payload:{noteId:note.id,changes,expected}});
test('follow-ups classify dates, unscheduled work and completed actions',()=>{
  assert.equal(followUpBucket(note,'2026-11-15'),'Today');
  assert.equal(followUpBucket(note,'2026-11-16'),'Overdue');
  assert.equal(followUpBucket(note,'2026-11-14'),'Upcoming');
  assert.equal(followUpBucket({...note,dueDate:''}),'No date');
  assert.equal(followUpBucket({...note,followUpStatus:'completed'}),'Completed');
  assert.equal(localDay(new Date(2026,0,2,23,59)),'2026-01-02');
});
test('existing notes become follow-ups; blank actions do not',()=>{
  const rows=collectFollowUps([{...agency,fieldNotes:[{...note,id:'blank',nextAction:' '},{...note,id:'unscheduled',dueDate:''},note]}]);
  assert.deepEqual(rows.map(r=>r.note.id),['visit-a','unscheduled']);
});
test('completion preserves visit history and concurrent notes; retries are idempotent',()=>{
  const item=mutation({dueDate:note.dueDate,followUpStatus:'completed'});
  const updated=applyAgencyMutation({...agency,fieldNotes:[note,{...note,id:'other'}]},item,true);
  assert.equal(updated.fieldNotes[0].followUpStatus,'completed');
  assert.equal(updated.fieldNotes[0].notes,note.notes);
  assert.equal(updated.lastContactDate,agency.lastContactDate);
  assert.equal(updated.fieldNotes[1].followUpStatus,undefined);
  assert.deepEqual(applyAgencyMutation(updated,item,true),updated);
  assert.equal(note.followUpStatus,undefined);
});
test('rescheduling conflicts are retained; reopen and missing note are handled',()=>{
  const changed=applyAgencyMutation(agency,mutation({dueDate:'2026-11-20',followUpStatus:'completed'}),true);
  assert.throws(()=>applyAgencyMutation(changed,mutation({dueDate:'2026-11-25',followUpStatus:'open'}),true),/Another device/);
  const reopened=applyAgencyMutation(changed,mutation({dueDate:'2026-11-22',followUpStatus:'open'},{dueDate:'2026-11-20',followUpStatus:'completed'}),true);
  assert.equal(reopened.fieldNotes[0].followUpStatus,'open');
  assert.throws(()=>applyAgencyMutation({...agency,fieldNotes:[]},mutation({dueDate:'',followUpStatus:'open'})),/no longer available/);
  assert.throws(()=>applyAgencyMutation(agency,mutation({dueDate:'invalid',followUpStatus:'open'})),/Invalid/);
});
test('workspace renders account action, date controls and useful empty state',()=>{
  const html=renderToStaticMarkup(<FollowUpWorkspace agencies={[agency]} onUpdate={async()=>{}}/>);
  assert.match(html,/Schedule evaluation/);assert.match(html,/Complete/);assert.match(html,/Save changes/);assert.match(html,/County EMS/);
  const empty=renderToStaticMarkup(<FollowUpWorkspace agencies={[]} onUpdate={async()=>{}}/>);
  assert.match(empty,/No follow-ups yet/);
});
test('standalone tasks preserve contact dates and visit history; edits retain before and after values',()=>{
 const task={...note,id:'task-a',nextAction:'Review equipment inventory',taskOnly:true,owner:'',priority:'normal' as const};
  const create={...mutation({}),actionType:'CREATE_FOLLOW_UP' as const,payload:{task}};
  const created=applyAgencyMutation(agency,create);
 assert.equal(created.fieldNotes.length,1);assert.equal(created.lastContactDate,agency.lastContactDate);
 assert.equal(created.followUpTasks?.length,1);assert.equal(collectFollowUps([created]).length,2);
  assert.deepEqual(applyAgencyMutation(created,create,true),created);
 const edit={...mutation({}),id:'task-edit',payload:{taskOnly:true,noteId:task.id,expected:{nextAction:task.nextAction},changes:{nextAction:'Send equipment summary',owner:'Nick',priority:'high',dueDate:'2026-11-20',followUpStatus:'open'}}};
 const updated=applyAgencyMutation(created,edit,true);
 assert.equal(updated.followUpTasks?.[0].owner,'Nick');
 assert.equal(updated.followUpTasks?.[0].history?.[1].before.nextAction,task.nextAction);
 assert.equal(updated.followUpTasks?.[0].history?.[1].after.nextAction,'Send equipment summary');
 assert.deepEqual(applyAgencyMutation(updated,edit,true),updated);
 assert.throws(()=>applyAgencyMutation(updated,{...edit,id:'other',payload:{...edit.payload,changes:{...edit.payload.changes,nextAction:'Conflicting action'}}},true),/Another device/);
});
test('standalone task creation refuses to duplicate an open visit next action',()=>{
  const task={...note,id:'duplicate-task',nextAction:'Schedule evaluation!',taskOnly:true,owner:'',priority:'normal' as const};
 assert.throws(
  ()=>applyAgencyMutation(agency,{...mutation({}),actionType:'CREATE_FOLLOW_UP',payload:{task}}),
  /open next action already exists/,
 );
 assert.equal(agency.fieldNotes[0].nextAction,'Schedule evaluation');
 assert.equal(agency.followUpTasks,undefined);
});
