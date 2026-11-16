import {WorkspaceIcon} from './design/WorkspaceIcon';
import { useLocalDraft } from '../hooks/useLocalDraft';
import { localDay } from '../utils/followUps';
import React, { useState } from 'react';
import type { Agency, FieldNote } from '../types';
import { collectFollowUps, followUpBucket, type FollowUpUpdater } from '../utils/followUps';
const buckets = ['All open','Overdue','Today','Upcoming','No date','Completed'] as const;

const historyFieldLabels: Record<string, string> = {
  nextAction: 'Action',
  dueDate: 'Due date',
  followUpStatus: 'Status',
  owner: 'Owner',
  priority: 'Priority',
};

function formatHistoryValue(field: string, value: unknown): string {
  if (field === 'owner' && !value) return 'Unassigned';
  if (field === 'followUpStatus') return value === 'completed' ? 'Completed' : 'Open';
  if (field === 'priority' && typeof value === 'string') return `${value[0]?.toUpperCase()}${value.slice(1)}`;
  if (field === 'dueDate' && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }
  return typeof value === 'string' && value ? value : 'Not set';
}

function formatHistoryTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
}

function FollowUpRow({agency,note,onUpdate,onOpen}: {agency:Agency;note:FieldNote;onUpdate:FollowUpUpdater;onOpen?:(agency:Agency)=>void}) {
  const draft=useLocalDraft(`task-edit:${agency.id}:${note.id}`, {date:note.dueDate,action:note.nextAction,owner:note.owner ?? '',priority:note.priority ?? 'normal'});
  const {date,action,owner,priority}=draft.value;
  const setDate=(value:string)=>draft.setField('date',value);

  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const completed=note.followUpStatus==='completed';
  const save=async(status:'open'|'completed',dueDate:string)=>{
    setBusy(true);setError('');setMessage('');
    try {await onUpdate(agency.id,note,{dueDate,followUpStatus:status,nextAction:action.trim(),owner:owner.trim(),priority:priority as 'low'|'normal'|'high'});draft.clear();setMessage('Saved on this device. Check the sync indicator for cloud status.');}
    catch(e){setError(e instanceof Error?e.message:'Could not save. Your changes remain here.');}
    finally{setBusy(false);}
  };
  return <li className="followup-row">
    <div><span className="followup-status">{followUpBucket(note)}</span><h3>{note.nextAction}</h3>
      {onOpen?<button className="workspace-text-button" onClick={()=>onOpen(agency)}>{agency.name}</button>:<p>{agency.name}</p>}
      <p className="followup-context">{note.taskOnly ? 'Standalone task' : `${note.meetingType} · ${note.date} · ${note.repName}`} · {note.owner || 'Unassigned'} · {note.priority || 'normal'} priority</p>
      {!note.taskOnly&&<details><summary>Interaction notes</summary><p>{note.notes}</p></details>}
      <details className="followup-history">
        <summary>Change history ({note.history?.length ?? 0})</summary>
        {note.history?.length ? (
          <ol>
            {note.history.map((entry) => {
              const changedFields = Object.keys(entry.after).filter((field) => entry.before[field] !== entry.after[field]);
              const isCreation = Object.keys(entry.before).length === 0;
              return (
                <li key={entry.id} className="followup-history-entry">
                  <div className="followup-history-heading">
                    <strong>{isCreation ? 'Task created' : 'Updated'}</strong>
                    <time dateTime={entry.at}>{formatHistoryTimestamp(entry.at)}</time>
                  </div>
                  {changedFields.length > 0 && changedFields.map((field) => (
                    <p key={field}>
                      <strong>{historyFieldLabels[field] || field}:</strong>{' '}
                      {isCreation
                        ? formatHistoryValue(field, entry.after[field])
                        : `${formatHistoryValue(field, entry.before[field])} → ${formatHistoryValue(field, entry.after[field])}`}
                    </p>
                  ))}
                </li>
              );
            })}
          </ol>
        ) : <p>No edits recorded yet. Earlier history is unavailable.</p>}
      </details>
    </div>
    <div className="followup-actions"><label>Action<input value={action} disabled={busy} onChange={e=>draft.setField('action',e.target.value)}/></label><label>Owner<input value={owner} placeholder="Unassigned" disabled={busy} onChange={e=>draft.setField('owner',e.target.value)}/></label><label>Priority<select value={priority} disabled={busy} onChange={e=>draft.setField('priority',e.target.value)}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></select></label><label>Follow-up date<input type="date" value={date} disabled={busy} onChange={e=>setDate(e.target.value)}/></label>
      <button className="workspace-button" disabled={busy||!action.trim()} onClick={()=>save(completed?'completed':'open',date)}>Save changes</button>
      <button className="workspace-button" disabled={busy||!action.trim()} onClick={()=>save(completed?'open':'completed',date)}>{busy?'Saving…':completed?'Reopen':'Complete'}</button>
    </div>
    {(error||draft.error)&&<p role="alert">{error||draft.error}</p>}{message&&<p role="status">{message}</p>}
  </li>;
}
export function FollowUpWorkspace({agencies,onUpdate,onOpen,onCreate,compact=false}:{agencies:Agency[];onUpdate:FollowUpUpdater;onOpen?:(agency:Agency)=>void;onCreate?:(id:string,task:FieldNote)=>Promise<void>;compact?:boolean}) {
  const [filter,setFilter]=useState<string>('All open');
  const [query,setQuery]=useState('');
  const rows=collectFollowUps(agencies);
  const filtered=rows.filter(({agency,note})=>(filter==='All open'?note.followUpStatus!=='completed':followUpBucket(note)===filter)&&`${agency.name} ${note.nextAction}`.toLowerCase().includes(query.toLowerCase()));
  return <section className="followup-workspace" aria-label={compact?'Agency action center':'Follow-up workspace'}>
    <header><h2><WorkspaceIcon name="followups"/>{compact?'Agency action center':'Follow-ups'}</h2><p>Manage standalone tasks and next actions from saved interactions. Original visit notes remain intact.</p></header>
    {compact && agencies[0] && <div className="followup-account-summary">
      <p><strong>Last interaction:</strong> {agencies[0].lastContactDate || 'Not recorded'}</p>
      <p><strong>Account stage:</strong> {agencies[0].zollOpportunity?.salesStage || 'Not recorded'}</p>
      <p><strong>Recorded contacts:</strong> {agencies[0].keyContacts?.length ? agencies[0].keyContacts.map(contact=>`${contact.name} (${contact.title || contact.role})`).join('; ') : 'No contacts recorded. Add or research contacts in People.'}</p>
      <p>Confirm current equipment, purchasing authority, and timing with the agency. Review individual facts in Evidence; a completed follow-up does not validate agency information.</p>
    </div>}
    {onCreate&&<TaskCreator agencies={agencies} onCreate={onCreate}/> }
    <div className="followup-filters" role="group" aria-label="Filter follow-ups">{buckets.map(bucket=><button className="workspace-button" key={bucket} aria-pressed={filter===bucket} onClick={()=>setFilter(bucket)}>{bucket} <span>{rows.filter(({note})=>bucket==='All open'?note.followUpStatus!=='completed':followUpBucket(note)===bucket).length}</span></button>)}</div>
    {!compact&&<label className="followup-search">Find an agency or action<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search follow-ups"/></label>}
    {!filtered.length?<p className="followup-empty">{rows.length?'No follow-ups match this view. Choose another filter or clear your search.':'No follow-ups yet. Open an agency and log an interaction with a next action in Activity.'}</p>:<ul>{filtered.map(({agency,note})=><FollowUpRow key={`${agency.id}:${note.id}:${note.dueDate}:${note.followUpStatus}:${note.followUpUpdatedAt}`} agency={agency} note={note} onUpdate={onUpdate} onOpen={onOpen}/>)}</ul>}
  </section>;
}

function TaskCreator({agencies,onCreate}:{agencies:Agency[];onCreate:(id:string,task:FieldNote)=>Promise<void>}) {
  const draft=useLocalDraft(`new-task:${agencies.length===1?agencies[0].id:'workspace'}`,{agencyId:agencies.length===1?agencies[0].id:'',action:'',owner:'',priority:'normal',dueDate:''});
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const submit=async(e:React.FormEvent)=>{e.preventDefault();setBusy(true);setError('');try {
    if(!agencies.some(a=>a.id===draft.value.agencyId)) throw new Error('Choose an agency.');
    await onCreate(draft.value.agencyId,{id:crypto.randomUUID(),date:localDay(),repName:'',meetingType:'Standalone task',notes:'',nextAction:draft.value.action.trim(),dueDate:draft.value.dueDate,owner:draft.value.owner.trim(),priority:draft.value.priority as 'low'|'normal'|'high',taskOnly:true,followUpStatus:'open'});
    draft.clear();
  }catch(e){setError(e instanceof Error?e.message:'Task could not be saved.');}finally{setBusy(false);}};
  return <details className="followup-create"><summary>Create standalone task</summary><form onSubmit={submit} className="followup-actions"><label>Agency<select required value={draft.value.agencyId} onChange={e=>draft.setField('agencyId',e.target.value)}><option value="">Choose agency</option>{agencies.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label><label>Action<input required value={draft.value.action} onChange={e=>draft.setField('action',e.target.value)}/></label><label>Owner<input placeholder="Unassigned" value={draft.value.owner} onChange={e=>draft.setField('owner',e.target.value)}/></label><label>Priority<select value={draft.value.priority} onChange={e=>draft.setField('priority',e.target.value)}>{['low','normal','high'].map(p=><option key={p}>{p}</option>)}</select></label><label>Due date<input type="date" value={draft.value.dueDate} onChange={e=>draft.setField('dueDate',e.target.value)}/></label><button className="workspace-button" disabled={busy||!draft.value.action.trim()}>Save task</button>{(error||draft.error)&&<p role="alert">{error||draft.error}</p>}</form></details>;
}
