import React,{useEffect,useRef,useState} from 'react';
import type {Agency,FieldNote} from '../types';
import type {ReviewedSample} from '../services/reviewedAccountPriorities';


import {buildCoachingReview,coachingPrompt,coachingDraftError,makeCoachingTask,COACHING_LABELS,type CoachingTopic,type CoachingDraft} from '../services/fieldCoaching';
import type {CommandView} from '../services/territoryCommand';
import {displayedProviderLocation,mappedProviderLocation,useLocationRevision} from '../services/providerLocation';
import {useSharedPipeline} from '../services/sharedPipeline';
import {localDay} from '../utils/followUps';
import {OPPORTUNITY_LABELS} from '../services/opportunityRadar';
const resolve=(a:Agency,directory:Agency[])=>({location:displayedProviderLocation(a,directory),match:mappedProviderLocation(a,directory)});
const control='block w-full min-w-0 rounded border p-2 bg-transparent text-base';
export function FieldCoachingPanel({uid,agencies,selected,samples,started,onOpenAgency,onView,onCreateTask}:{uid:string;agencies:Agency[];selected:string[];samples:ReviewedSample[];started:number;onOpenAgency:(a:Agency)=>void;onView:(v:CommandView)=>void;onCreateTask?:(id:string,task:FieldNote)=>Promise<void>}){
 useLocationRevision();
 const [draft,setDraft]=useState<CoachingDraft>(),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[checklist,setChecklist]=useState<string[]>([]);
 const lock=useRef(false),mounted=useRef(true);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
 const {reads:device,reload,loading}=useSharedPipeline(uid,agencies,selected,started);
 useEffect(()=>{setDraft(undefined);setConfirmed(false);setChecklist([]);},[uid,started]);

 const today=localDay(),r=buildCoachingReview(agencies,selected,samples,device,resolve,today,started);
 const account=r.rows.find(a=>a.agency.id===draft?.agencyId&&a.identityKey===draft?.identityKey);
 const prompt=account&&draft?coachingPrompt(account,draft.topic):undefined;
 function choose(id:string,topic?:CoachingTopic){
  const a=r.rows.find(x=>x.agency.id===id);
  const t=topic??a?.topics[0];
  const p=a&&t?coachingPrompt(a,t):undefined;
  setDraft(a&&t&&p?{agencyId:id,identityKey:a.identityKey,topic:t,action:p.objective,measure:p.measure,owner:'',dueDate:''}:undefined);
  setConfirmed(false);setChecklist([]);setNotice('');
 }
 function change<K extends keyof CoachingDraft>(key:K,value:CoachingDraft[K]){setDraft(d=>d?{...d,[key]:value}:d);setConfirmed(false);}
 const checks=['Original evidence checked or missing evidence identified','Account and authorized contact scope confirmed or flagged','Next action and success measure reviewed'];
 const error=draft?coachingDraftError(draft,today):undefined;
 async function save(){
  if(lock.current||loading||!onCreateTask||!draft||!confirmed||checklist.length!==checks.length||!navigator.onLine||!uid)return;
  lock.current=true;setBusy(true);setNotice('');
  try{
   const now=Date.now(),current=buildCoachingReview(agencies,selected,samples,device,resolve,localDay(),started,now).rows.find(a=>a.agency.id===draft.agencyId&&a.identityKey===draft.identityKey);
   const task=makeCoachingTask(current,draft,confirmed,crypto.randomUUID(),localDay(),started,now);
   await onCreateTask(draft.agencyId,task);
   if(mounted.current){setDraft(undefined);setConfirmed(false);setChecklist([]);setNotice('Coaching follow-up saved on this device. Check the workspace sync indicator for cloud acknowledgment; no customer contact was logged.');}
  }catch(e){if(mounted.current)setNotice(e instanceof Error?e.message:'Follow-up could not be confirmed.');}
  finally{lock.current=false;if(mounted.current)setBusy(false);}
 }
 if(!r.active)return <p role="status">Selected account sample expired or invalid. Refresh before preparing coaching.</p>;
 return <section className="space-y-3 min-w-0" aria-label="Field coaching workspace">
  {loading&&<p role="status">Loading shared pipeline records…</p>}
  <header><h4 className="font-semibold">Field coaching workspace</h4><p className="text-xs">Account-specific preparation based on current reviewed documents and recorded workspace gaps. These are coaching prompts, not employee ratings, verified customer needs or AI predictions.</p></header>
  <p className="text-xs">{r.eligible} eligible selected accounts · {r.checked} complete reviewed samples · {r.attention} with review prompts. Activity lookback: 30 days. Working pipeline context uses authorized shared records.</p>
  <label>Account<select className={control} disabled={busy} value={draft?.agencyId??''} onChange={e=>choose(e.target.value)}><option value="">Choose an account</option>{r.rows.map(a=><option key={a.identityKey} value={a.agency.id}>{a.agency.name}</option>)}</select></label>
  {account&&draft&&prompt&&<>
   <label>Coaching focus<select className={control} disabled={busy} value={draft.topic} onChange={e=>choose(account.agency.id,e.target.value as CoachingTopic)}>{account.topics.map(t=><option key={t} value={t}>{COACHING_LABELS[t]}</option>)}</select></label>
   <div className="rounded border p-3 space-y-2 min-w-0 break-words"><h5 className="font-semibold">Coaching conversation</h5><p>{prompt.objective}</p><ol className="list-decimal pl-5 space-y-1">{prompt.questions.map((q,i)=><li key={i}>{q}</li>)}</ol><p className="text-xs">Suggested success measure: {prompt.measure}</p>
    {account.priority?<p className="text-xs">Separate reviewed account context: {OPPORTUNITY_LABELS[account.priority.signal.kind]} · document dated {account.priority.signal.evidence.documentDate} · <a className="underline" href={account.priority.signal.evidence.sourceUrl} target="_blank" rel="noopener noreferrer">Reviewed source</a></p>:<p className="text-xs">No eligible reviewed priority signal. Use discovery or evidence verification; do not assume purchase intent.</p>}
    <p className="text-xs">Recorded contact: {account.lastContact??'Not recorded'} · {account.dueTasks} due or overdue task(s). Missing records do not establish a skill deficit.</p>
   </div>
   <fieldset className="rounded border p-3 space-y-2"><legend className="font-semibold">Self-review before commitment</legend>{checks.map(c=><label key={c} className="flex gap-2 items-start min-h-11"><input type="checkbox" disabled={busy} checked={checklist.includes(c)} onChange={e=>{setChecklist(prev=>e.target.checked?[...prev,c]:prev.filter(v=>v!==c));setConfirmed(false);}}/><span>{c}</span></label>)}<p className="text-xs">Checklist is a user self-review, not an assessed skill score.</p></fieldset>
   <section className="rounded border p-3 space-y-2 min-w-0"><h5 className="font-semibold">Measurable coaching commitment</h5>
    <label>Internal action<textarea className={control} rows={2} maxLength={240} disabled={busy} value={draft.action} onChange={e=>change('action',e.target.value)}/></label>
    <label>Success measure<textarea className={control} rows={2} maxLength={240} disabled={busy} value={draft.measure} onChange={e=>change('measure',e.target.value)}/></label>
    <label>Responsible owner<input className={control} maxLength={100} disabled={busy} value={draft.owner} onChange={e=>change('owner',e.target.value)}/></label>
    <label>Review due date<input className={control} type="date" min={today} disabled={busy} value={draft.dueDate} onChange={e=>change('dueDate',e.target.value)}/></label>
    <label className="flex gap-2 items-start min-h-11"><input type="checkbox" disabled={busy} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>I validate this internal coaching commitment and authorize saving it as a standalone follow-up. Do not enter confidential or personal information.</span></label>
    {error&&<p className="text-xs">{error}</p>}
    {onCreateTask?<button type="button" className="workspace-button min-h-11" disabled={busy||!confirmed||checklist.length!==checks.length||!!error} onClick={()=>void save()}>{busy?'Saving…':'Save confirmed coaching follow-up'}</button>:<p>Task creation unavailable in this view. Use the provider's Activity tab.</p>}
   </section>
   <button type="button" className="workspace-button min-h-11" disabled={busy} onClick={()=>onOpenAgency(account.agency)}>Open account profile / pre-call planner</button>
  </>}
  {notice&&<p role="status">{notice}</p>}
  <div className="flex flex-wrap gap-2"><button type="button" className="workspace-button min-h-11" disabled={busy} onClick={()=>onView('followups')}>Manage follow-ups</button><button type="button" className="workspace-button min-h-11" disabled={busy} onClick={()=>onView('plan')}>Field execution plan</button><button type="button" className="workspace-button min-h-11" disabled={busy} onClick={()=>onView('leadership')}>Leadership review</button></div>
  <p className="text-xs">No automatic task creation, outreach, stage change, rep attribution or score. Unsaved preparation is cleared on account change, closing, or evidence refresh. Saved tasks use the existing workspace journal and sync pathway.</p>
 </section>;
}
