import React, { useState } from 'react';
import type { Agency, FieldNote } from '../types';
import { collectFollowUps, followUpBucket, type FollowUpUpdater } from '../utils/followUps';
const buckets = ['All open','Overdue','Today','Upcoming','No date','Completed'] as const;
function FollowUpRow({agency,note,onUpdate,onOpen}: {agency:Agency;note:FieldNote;onUpdate:FollowUpUpdater;onOpen?:(agency:Agency)=>void}) {
  const [date,setDate]=useState(note.dueDate);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const completed=note.followUpStatus==='completed';
  const save=async(status:'open'|'completed',dueDate:string)=>{
    setBusy(true);setError('');setMessage('');
    try {await onUpdate(agency.id,note,{dueDate,followUpStatus:status});setMessage('Saved on this device. Check the sync indicator for cloud status.');}
    catch(e){setError(e instanceof Error?e.message:'Could not save. Your changes remain here.');}
    finally{setBusy(false);}
  };
  return <li className="followup-row">
    <div><span className="followup-status">{followUpBucket(note)}</span><h3>{note.nextAction}</h3>
      {onOpen?<button className="workspace-text-button" onClick={()=>onOpen(agency)}>{agency.name}</button>:<p>{agency.name}</p>}
      <p className="followup-context">{note.meetingType} · {note.date} · {note.repName}</p>
      <details><summary>Interaction notes</summary><p>{note.notes}</p></details>
    </div>
    <div className="followup-actions"><label>Follow-up date<input type="date" value={date} disabled={busy} onChange={e=>setDate(e.target.value)}/></label>
      <button className="workspace-button" disabled={busy||date===note.dueDate} onClick={()=>save(completed?'completed':'open',date)}>Save date</button>
      <button className="workspace-button" disabled={busy} onClick={()=>save(completed?'open':'completed',note.dueDate)}>{busy?'Saving…':completed?'Reopen':'Complete'}</button>
    </div>
    {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
  </li>;
}
export function FollowUpWorkspace({agencies,onUpdate,onOpen,compact=false}:{agencies:Agency[];onUpdate:FollowUpUpdater;onOpen?:(agency:Agency)=>void;compact?:boolean}) {
  const [filter,setFilter]=useState<string>('All open');
  const [query,setQuery]=useState('');
  const rows=collectFollowUps(agencies);
  const filtered=rows.filter(({agency,note})=>(filter==='All open'?note.followUpStatus!=='completed':followUpBucket(note)===filter)&&`${agency.name} ${note.nextAction}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="followup-workspace" aria-label={compact?'Agency action center':'Follow-up workspace'}>
    <header><h2>{compact?'Agency action center':'Follow-ups'}</h2><p>Next actions from saved interactions. Complete or reschedule them without changing the original visit notes.</p></header>
    {compact && agencies[0] && <div className="followup-account-summary">
      <p><strong>Last interaction:</strong> {agencies[0].lastContactDate || 'Not recorded'}</p>
      <p><strong>Account stage:</strong> {agencies[0].zollOpportunity?.salesStage || 'Not recorded'}</p>
      <p><strong>Recorded contacts:</strong> {agencies[0].keyContacts?.length ? agencies[0].keyContacts.map(contact=>`${contact.name} (${contact.title || contact.role})`).join('; ') : 'No contacts recorded. Add or research contacts in People.'}</p>
      <p>Confirm current equipment, purchasing authority, and timing with the agency. Review individual facts in Evidence; a completed follow-up does not validate agency information.</p>
    </div>}
    <div className="followup-filters" role="group" aria-label="Filter follow-ups">{buckets.map(bucket=><button className="workspace-button" key={bucket} aria-pressed={filter===bucket} onClick={()=>setFilter(bucket)}>{bucket} <span>{rows.filter(({note})=>bucket==='All open'?note.followUpStatus!=='completed':followUpBucket(note)===bucket).length}</span></button>)}</div>
    {!compact&&<label className="followup-search">Find an agency or action<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search follow-ups"/></label>}
    {!filtered.length?<p className="followup-empty">{rows.length?'No follow-ups match this view. Choose another filter or clear your search.':'No follow-ups yet. Open an agency and log an interaction with a next action in Activity.'}</p>:<ul>{filtered.map(({agency,note})=><FollowUpRow key={`${agency.id}:${note.id}:${note.dueDate}:${note.followUpStatus}`} agency={agency} note={note} onUpdate={onUpdate} onOpen={onOpen}/>)}</ul>}
  </section>;
}
