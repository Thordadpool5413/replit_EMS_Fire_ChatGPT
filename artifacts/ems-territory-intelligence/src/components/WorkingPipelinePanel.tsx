import React,{useEffect,useState} from 'react';
import type {Agency} from '../types';
import type {ReviewedSample} from '../services/reviewedAccountPriorities';
import {buildWorkingPipeline,dealScope,loadDeal,DEAL_STAGES,DEAL_LABELS,EMPTY_DEAL,validateDealInput,type DealInput,type DealStage} from '../services/workingPipeline';
import {useSharedPipeline,saveSharedDeal} from '../services/sharedPipeline';
import {localDay} from '../utils/followUps';
import {OPPORTUNITY_LABELS} from '../services/opportunityRadar';
const control='block w-full min-w-0 rounded border p-2 bg-transparent text-base';
const fields:[keyof Pick<DealInput,'need'|'authority'|'milestone'|'reference'|'nextAction'>,string,number][]=[['need','Validated need / problem',300],['authority','Confirmed decision role (no names)',160],['milestone','Actual milestone or closure reason',300],['reference','Evidence reference / date (no confidential content)',300],['nextAction','Internal next action',300]];
export function WorkingPipelinePanel({uid,agencies,selected,samples,started,onOpenAgency,onPlan}:{uid:string;agencies:Agency[];selected:string[];samples:ReviewedSample[];started:number;onOpenAgency:(a:Agency)=>void;onPlan:()=>void}){
 const [account,setAccount]=useState(''),[draft,setDraft]=useState<DealInput>(EMPTY_DEAL),[revision,setRevision]=useState(0),[confirmed,setConfirmed]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[filter,setFilter]=useState<DealStage|'all'|'unrecorded'>('all');
 const scope=dealScope(agencies,selected,started),scopeKey=JSON.stringify(scope.map(a=>[a.agency.id,a.identityKey]).sort());
 const {reads,loading,reload}=useSharedPipeline(uid,agencies,selected,started);
 const records=reads.flatMap(v=>v.record?[v.record]:[]),errors=scope.filter(a=>!reads.some(v=>v.agencyId===a.agency.id&&v.identityKey===a.identityKey&&v.status==='read')).map(a=>a.agency.id);
 const r=buildWorkingPipeline(agencies,selected,samples,records,started,localDay());
 const candidate=r.rows.find(a=>a.agency.id===account),read=reads.find(a=>a.agencyId===account&&a.identityKey===candidate?.identityKey);
 useEffect(()=>{setAccount('');setDraft(EMPTY_DEAL);setRevision(0);setConfirmed(false);},[uid,scopeKey,started]);
 function importLocal(){
  if(!candidate||!read?.canWrite||read.record||busy)return;
  try{
   const old=loadDeal(localStorage,uid,candidate.agency.id,candidate.identityKey);
   if(!old){setNotice('No previous local record found.');return;}
   setDraft({stage:old.stage,need:old.need,authority:old.authority,milestone:old.milestone,reference:old.reference,nextAction:old.nextAction,dueDate:old.dueDate});setConfirmed(false);
   setNotice('Local fields copied into this unsaved draft. Review before saving; local history stays on this device.');
  }catch{setNotice('Local record unavailable; no shared data changed.');}
 }
 function select(id:string){
  const a=r.rows.find(a=>a.agency.id===id),v=a?.deal;
  setAccount(id);setDraft(v?{stage:v.stage,need:v.need,authority:v.authority,milestone:v.milestone,reference:v.reference,nextAction:v.nextAction,dueDate:v.dueDate}:EMPTY_DEAL);setRevision(v?.revision??0);setConfirmed(false);setNotice('');
 }
 function change<K extends keyof DealInput>(key:K,value:DealInput[K]){setDraft(d=>({...d,[key]:value}));setConfirmed(false);}
 async function save(){
  if(!candidate||!read?.canWrite||!confirmed||busy||loading||errors.includes(account)||validateDealInput(draft)||!navigator.onLine||!uid)return;
  setBusy(true);setNotice('');
  try{
   const current=dealScope(agencies,selected,started).find(a=>a.agency.id===candidate.agency.id&&a.identityKey===candidate.identityKey);
   if(!current||!navigator.onLine)throw Error('Current account sample expired. Refresh before saving.');
   await saveSharedDeal(read,draft,revision,confirmed);
   setAccount('');setConfirmed(false);reload();setNotice('Shared opportunity saved in PostgreSQL. CRM stage unchanged.');
  }catch(e){setNotice(e instanceof Error?e.message:'Shared save not confirmed. Reload before retrying.');setConfirmed(false);reload();}finally{setBusy(false);}

 }
 if(!scope.length)return <p role="status">No current eligible selected account sample. Refresh before planning.</p>;
 const rows=r.rows.filter(a=>filter==='all'||filter==='unrecorded'&&!a.deal&&!errors.includes(a.agency.id)||a.deal?.stage===filter);
 const error=validateDealInput(draft);
 return <section className="space-y-3 min-w-0" aria-label="Working sales pipeline">
  <header><h4 className="font-semibold">Working sales pipeline</h4><p className="text-xs">One internal working opportunity per selected provider. Only explicit user-confirmed records count; reviewed public evidence and existing CRM stages do not establish qualification or outcomes. Shared PostgreSQL records for authorized agency workspace members. One record per unique saved provider. Do not enter confidential or personal information.</p></header>
  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{[{label:'Qualified / active',value:r.qualified},{label:'Next-action / recency gaps',value:r.atRisk},{label:'No working record',value:reads.filter(v=>v.status==='read'&&!v.record).length}].map(t=><div className="rounded border p-2 min-w-0" key={t.label}><p className="text-xs break-words">{t.label}</p><strong className="text-xl tabular-nums">{t.value}</strong></div>)}</div>
  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{r.byStage.map(t=><button type="button" key={t.stage} aria-pressed={filter===t.stage} className="rounded border p-2 text-left min-w-0 min-h-20" onClick={()=>setFilter(t.stage)}><span className="block text-xs break-words">{DEAL_LABELS[t.stage]}</span><strong className="text-xl tabular-nums">{t.count}</strong></button>)}</div>
  <p className="text-xs">{r.eligible} eligible selected accounts · {r.checked}/{r.selected} complete reviewed document samples. Not territory-wide coverage, revenue, forecast or company CRM reporting.</p>
  {loading?<p role="status">Loading shared opportunities…</p>:errors.length>0&&<p role="alert">{errors.length} shared account record(s) unavailable. Edits to those accounts are blocked.</p>}
  <button type="button" className="workspace-button min-h-11" disabled={busy} onClick={()=>{reload();setAccount('');setNotice('');}}>Reload shared records</button>
  <label>Working stage filter<select className={control} value={filter} onChange={e=>setFilter(e.target.value as typeof filter)}><option value="all">All eligible selected accounts</option><option value="unrecorded">No working record</option>{DEAL_STAGES.map(s=><option key={s} value={s}>{DEAL_LABELS[s]}</option>)}</select></label>
  <ul className="divide-y">{rows.map(a=><li key={a.identityKey} className="py-2 space-y-1 break-words"><p className="font-semibold">{a.agency.name}</p><p>{errors.includes(a.agency.id)?'Shared record unavailable':a.deal?DEAL_LABELS[a.deal.stage]:'No user-confirmed working record'}</p><p className="text-xs">Existing CRM stage (separate): {a.agency.zollOpportunity?.salesStage||'Not recorded'} · {a.openTasks} open workspace follow-up(s), {a.overdueTasks} overdue</p>{a.deal&&<p className="text-xs">Updated {a.deal.updatedAt.slice(0,10)}{a.deal.dueDate?' · next action '+a.deal.dueDate:''}{a.risks.length?' · '+a.risks.join('; '):''}</p>}{a.priority&&<p className="text-xs">Separate reviewed research: {OPPORTUNITY_LABELS[a.priority.signal.kind]} · <a className="underline" href={a.priority.signal.evidence.sourceUrl} target="_blank" rel="noopener noreferrer">Source</a></p>}<div className="flex flex-wrap gap-2"><button type="button" className="workspace-button min-h-11" disabled={busy||loading||!reads.some(v=>v.agencyId===a.agency.id&&v.canWrite)} onClick={()=>select(a.agency.id)}>Edit working opportunity</button><button type="button" className="workspace-button min-h-11" onClick={()=>onOpenAgency(a.agency)}>Open profile / manage CRM</button></div></li>)}</ul>
  {!rows.length&&<p>No matching selected account records.</p>}
  {candidate&&read?.canWrite&&<section className="rounded border p-3 space-y-2 min-w-0" aria-label="Edit working opportunity"><h5 className="font-semibold break-words">{candidate.agency.name} · working opportunity</h5>{!read.record&&<button type="button" className="workspace-button min-h-11" disabled={busy} onClick={importLocal}>Copy previous local record into draft</button>}<label>Stage<select className={control} disabled={busy} value={draft.stage} onChange={e=>change('stage',e.target.value as DealStage)}>{DEAL_STAGES.map(s=><option key={s} value={s}>{DEAL_LABELS[s]}</option>)}</select></label>{fields.map(([k,label,max])=><label key={k}>{label}<textarea className={control} rows={2} maxLength={max} disabled={busy} value={draft[k]} onChange={e=>change(k,e.target.value)}/></label>)}<label>Next-action date<input className={control} type="date" disabled={busy} value={draft.dueDate} onChange={e=>change('dueDate',e.target.value)}/></label>
   <label className="flex gap-2 items-start min-h-11"><input type="checkbox" checked={confirmed} disabled={busy} onChange={e=>setConfirmed(e.target.checked)}/><span>I have checked the account-specific evidence and confirm this internal record reflects the actual current status. It does not change the CRM stage.</span></label>
   {error&&<p className="text-xs">{error}</p>}<button type="button" className="workspace-button min-h-11" disabled={busy||loading||!confirmed||!!error||errors.includes(account)} onClick={()=>void save()}>{busy?'Saving…':'Save confirmed working record'}</button>
   {candidate.deal&&<details><summary>Recorded progression (last {candidate.deal.history.length} saves)</summary><ol className="divide-y">{[...candidate.deal.history].reverse().map((h,i)=><li key={i} className="py-1 text-xs">{h.at.slice(0,10)} · {DEAL_LABELS[h.stage]}</li>)}</ol></details>}
  </section>}
  {notice&&<p role="status">{notice}</p>}
  <button type="button" className="workspace-button min-h-11" onClick={onPlan}>Open field execution plan</button>
  <p className="text-xs">No automatic tasks, outreach, stage advancement, purchase forecasts or revenue estimates. Use the profile to manage the existing shared CRM and follow-ups. Previous local records are not automatically uploaded. Shared records require server acknowledgment; reload to see changes made on another device.</p>
 </section>;
}
