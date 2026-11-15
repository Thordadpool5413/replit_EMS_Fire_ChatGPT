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
const mutation=(changes:object,expected={dueDate:note.dueDate,followUpStatus:'open'}):SyncOutboxItem=>({id:'change-a',agencyId:'a',agencyName:'County EMS',timestamp:'2026-11-15T01:00:00Z',actionType:'UPDATE_FOLLOW_UP',status:'PENDING',payload:{noteId:note.id,changes,expected}});
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
  assert.match(html,/Schedule evaluation/);assert.match(html,/Complete/);assert.match(html,/Save date/);assert.match(html,/County EMS/);
  const empty=renderToStaticMarkup(<FollowUpWorkspace agencies={[]} onUpdate={async()=>{}}/>);
  assert.match(empty,/No follow-ups yet/);
});
