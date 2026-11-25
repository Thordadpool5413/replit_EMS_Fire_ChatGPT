import React,{useRef,useState} from 'react';
import {useAuth} from '@workspace/replit-auth-web';
type Note={submissionId:string;note:string;createdAt:string};
type Notes={notes:Note[];more:boolean;canWrite:boolean};
export function FacilityFieldNotes({agencyId,parentId,stationId}:{agencyId:string;parentId:string;stationId:string}){
 const {user}=useAuth();
 return user?<PrivateNotes key={user.id+':'+agencyId+':'+parentId+':'+stationId} agencyId={agencyId} parentId={parentId} stationId={stationId}/>:<p className="text-xs text-slate-500">Sign in to access private field notes.</p>;
}
function PrivateNotes({agencyId,parentId,stationId}:{agencyId:string;parentId:string;stationId:string}){
 const [open,setOpen]=useState(false),[data,setData]=useState<Notes>(),[draft,setDraft]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const pending=useRef<{submissionId:string;note:string}|undefined>(undefined);
 const url='/api/agencies/'+encodeURIComponent(agencyId)+'/facilities/'+encodeURIComponent(parentId)+'/'+encodeURIComponent(stationId)+'/notes';
 async function load(){
  setBusy(true);setMessage('');
  try{const r=await fetch(url,{credentials:'include',cache:'no-store'});if(!r.ok)throw Error(r.status===404?'Save and link this department first.':r.status===401||r.status===403?'Workspace authorization required.':'Notes are unavailable.');setData(await r.json());}
  catch(e){setData(undefined);setMessage(e instanceof Error?e.message:'Notes are unavailable.');}finally{setBusy(false);}
 }
 async function save(){
  if(busy||!data?.canWrite||!draft.trim())return;
  if(!pending.current||pending.current.note!==draft.trim())pending.current={submissionId:crypto.randomUUID(),note:draft.trim()};
  setBusy(true);setMessage('');
  try{const r=await fetch(url,{method:'POST',credentials:'include',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(pending.current)});if(!r.ok)throw Error('Save not confirmed. Keep the draft and retry, or review the source association.');pending.current=undefined;setDraft('');await load();setMessage('Observation saved. It does not confirm the station or its equipment.');}
  catch(e){setMessage(e instanceof Error?e.message:'Save not confirmed.');}finally{setBusy(false);}
 }
 return <div className="mt-2 text-xs">
  <button type="button" className="workspace-button min-h-11" disabled={busy} aria-expanded={open} onClick={()=>{setOpen(!open);if(!open)void load();}}>{open?'Hide field notes':'Field notes'}</button>
  {open&&<div className="mt-2 space-y-2">
   {busy&&<p role="status">Checking Replit workspace…</p>}
   {message&&<p role="status">{message}</p>}
   {data&&<>
    <p>Private team observations, not independently verified equipment or location evidence. Do not include patient information.</p>
    {data.canWrite&&<><label className="block">New field observation<textarea className="block w-full min-w-0 rounded border bg-transparent p-2 text-base" rows={3} maxLength={4000} value={draft} disabled={busy} onChange={e=>setDraft(e.target.value)}/></label><button type="button" className="workspace-button min-h-11" disabled={busy||!draft.trim()} onClick={()=>void save()}>Save observation</button></>}
    {!data.notes.length&&<p>No saved observations.</p>}
    <ul className="space-y-2">{data.notes.map(n=><li key={n.submissionId} className="border-t pt-2"><p className="whitespace-pre-wrap break-words">{n.note}</p><p className="text-slate-500">{new Date(n.createdAt).toLocaleString()} · Field observation</p></li>)}</ul>
    {data.more&&<p>Showing the latest 100 observations.</p>}
   </>}
  </div>}
 </div>;
}
