import React,{useRef,useState} from 'react';
import type {Agency,FieldNote} from '../../types';
import type {ReviewedCallSample} from '../../services/reviewedPreCallPlanning';
import {buildNextResearchActions,duplicateOpenResearchTask,makeResearchTask,type ActionPriority} from '../../services/nextResearchActions';
import {localDay} from '../../utils/followUps';
const labels:Record<ActionPriority,string>={urgent:'Verify promptly','near-term':'Near-term research',research:'Research next',gap:'Resolve intelligence gap'};
export function NextResearchActions({agency,directory,sample,onSelect,onCreateTask}:{agency:Agency;directory:Agency[];sample:ReviewedCallSample;onSelect:(id:string)=>void;onCreateTask:(id:string,task:FieldNote)=>Promise<void>}){
 const [expanded,setExpanded]=useState(false),[selected,setSelected]=useState(''),[owner,setOwner]=useState(''),[date,setDate]=useState(''),[confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[saved,setSaved]=useState<string[]>([]),[page,setPage]=useState(1);
 const pending=useRef<{key:string;id:string}|undefined>(undefined),inFlight=useRef(false);
 const result=buildNextResearchActions(agency,directory,sample),rows=result.actions,current=Math.min(page,Math.max(1,Math.ceil(rows.length/5))),action=rows.find(a=>a.key===selected);
 const duplicate=action&&duplicateOpenResearchTask(agency,action.taskText);
 function choose(key:string){setSelected(key);setOwner('');setDate('');setConfirm(false);setNotice('');pending.current=undefined;}
 async function save(){
  if(inFlight.current||!confirm||!navigator.onLine)return;
  const live=buildNextResearchActions(agency,directory,sample),a=live.actions.find(x=>x.key===selected);
  if(!live.ready||!a||saved.includes(a.key)){setNotice('Refresh the reviewed sample before creating a task.');return;}
  const signature=JSON.stringify([a.key,owner,date,a.taskText]);
  if(!pending.current||pending.current.key!==signature)pending.current={key:signature,id:crypto.randomUUID()};
  const task=makeResearchTask(agency,a,owner,date,pending.current.id,localDay());
  if(!task){setNotice('Choose a valid task date and check for an existing open task.');return;}
  inFlight.current=true;setBusy(true);setNotice('');
  try{await onCreateTask(agency.id,task);setSaved(p=>[...p,a.key]);setConfirm(false);pending.current=undefined;setNotice('Task saved on this device. Check workspace sync status for server confirmation.');}
  catch(e){setNotice(e instanceof Error?e.message:'Save not confirmed. Retry the same task.');}
  finally{inFlight.current=false;setBusy(false);}
 }
 return <section className="border rounded p-3 space-y-2 min-w-0" aria-label="Recommended research actions">
  <button className="pcp-button min-h-11" type="button" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{expanded?'Hide recommended actions':'Show recommended next actions'}</button>
  {expanded&&<div className="space-y-2 text-sm">
   <p>Prioritize published deadlines, reviewed observations and missing intelligence. These are internal research suggestions, not customer commitments or sales probabilities.</p>
   {!result.ready&&<p>Refresh the reviewed sample or resolve account identity.</p>}
   {result.ready&&<><p>{rows.length} suggested research actions, not qualified opportunities.</p>
    <ol className="divide-y">{rows.slice((current-1)*5,current*5).map(r=><li key={r.key} className="py-2 space-y-1 break-words"><p className="font-semibold">{labels[r.priority]} · {r.title}</p><p>{r.reason}</p>{r.publishedDate&&<p className="text-xs">Published date {r.publishedDate}; verify current status. Not your task due date.</p>}<p>{r.taskText}</p>{r.sourceUrl&&<a className="pcp-link" href={r.sourceUrl} target="_blank" rel="noopener noreferrer">Submitted source</a>}<div className="flex flex-wrap gap-2">{r.candidateKey&&<button type="button" className="pcp-button min-h-11" onClick={()=>onSelect(r.candidateKey!)}>Use in pre-call brief</button>}<button type="button" className="pcp-button min-h-11" disabled={busy||saved.includes(r.key)||duplicateOpenResearchTask(agency,r.taskText)} onClick={()=>choose(r.key)}>{saved.includes(r.key)||duplicateOpenResearchTask(agency,r.taskText)?'Open task exists':'Prepare internal task'}</button></div></li>)}</ol>
    {rows.length>5&&<div className="flex gap-2 items-center"><button type="button" className="pcp-button" disabled={current===1} onClick={()=>setPage(current-1)}>Previous</button><span>Page {current}</span><button type="button" className="pcp-button" disabled={current*5>=rows.length} onClick={()=>setPage(current+1)}>Next</button></div>}
    {action&&<div className="border rounded p-2 space-y-2"><h4>Confirm internal task</h4><p>{action.taskText}</p><p className="text-xs">Only this generic research action is saved. Private source details and customer commitments are not copied.</p><label>Owner<input className="pcp-select w-full" maxLength={120} value={owner} disabled={busy} onChange={e=>{setOwner(e.target.value);setConfirm(false);}}/></label><label>Your research due date<input type="date" className="pcp-select w-full" min={localDay()} value={date} disabled={busy} onChange={e=>{setDate(e.target.value);setConfirm(false);}}/></label><label className="flex gap-2 items-start"><input type="checkbox" checked={confirm} disabled={busy} onChange={e=>setConfirm(e.target.checked)}/>I want to save this internal research task. It is not an agreed customer commitment.</label><button type="button" className="pcp-button min-h-11" disabled={busy||!date||!confirm||!!duplicate||saved.includes(action.key)} onClick={()=>void save()}>{busy?'Saving…':'Save internal research task'}</button></div>}
    {notice&&<p role="status">{notice}</p>}
   </>}
  </div>}
 </section>;
}
