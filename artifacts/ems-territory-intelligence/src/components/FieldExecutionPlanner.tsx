import React,{useState} from 'react';
import type {Agency} from '../types';
import type {ReviewedSample} from '../services/reviewedAccountPriorities';
import {buildFieldPlan,type FieldVisit} from '../services/fieldExecutionPlan';
import {displayedProviderLocation,mappedProviderLocation,useLocationRevision,loadProviderLocationState} from '../services/providerLocation';
import {localDay} from '../utils/followUps';
import {OPPORTUNITY_LABELS} from '../services/opportunityRadar';
const resolve=(a:Agency,directory:Agency[])=>({location:displayedProviderLocation(a,directory),match:mappedProviderLocation(a,directory)});
const control='block w-full min-w-0 rounded border p-2 bg-transparent text-base';
export function FieldExecutionPlanner({agencies,selected,samples,started,onOpenAgency}:{agencies:Agency[];selected:string[];samples:ReviewedSample[];started:number;onOpenAgency:(a:Agency)=>void}){
 useLocationRevision();
 const [visits,setVisits]=useState<FieldVisit[]>([]),[account,setAccount]=useState(''),[day,setDay]=useState(localDay),[objective,setObjective]=useState(''),[confirmed,setConfirmed]=useState(false),[mode,setMode]=useState<'day'|'week'>('week'),[filterDay,setFilterDay]=useState(localDay),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const today=localDay(),r=buildFieldPlan(agencies,selected,samples,resolve,today,visits,started);
 const candidate=r.candidates.find(a=>a.agency.id===account);
 const existing=r.planned.find(a=>a.agency.id===account);
 const canAdd=r.active&&!!candidate&&r.days.includes(day)&&!!objective.trim()&&objective.length<=300&&confirmed;
 function select(id:string){
  const previous=r.planned.find(p=>p.agency.id===id);
  setAccount(id);setObjective(previous?.visit.objective??'');setDay(previous?.visit.day??today);setConfirmed(false);
 }
 function add(){
  if(!canAdd||!candidate||!navigator.onLine||Date.now()-started>=300000)return;
  const v={agencyId:candidate.agency.id,identityKey:candidate.identityKey,day,objective:objective.trim()};
  setVisits(prev=>[...prev.filter(p=>p.agencyId!==v.agencyId),v]);
  setAccount('');setObjective('');setConfirmed(false);setNotice('Internal visit draft updated.');
 }
 async function load(){
  setBusy(true);setNotice('');
  try{const states=[...new Set(r.candidates.map(a=>a.agency.stateCode))],loaded=await Promise.allSettled(states.map(loadProviderLocationState));
   setNotice(loaded.every(v=>v.status==='fulfilled'&&!!v.value)?'Bundled location snapshots loaded. Unmatched locations remain excluded.':'Some location snapshots unavailable.');
  }catch{setNotice('Location snapshots unavailable.');}finally{setBusy(false);}
 }
 if(!r.active)return <p role="status">Reviewed sample expired or invalid. Refresh selected accounts before planning.</p>;
 return <section className="space-y-3 min-w-0" aria-label="Field execution planner">
  <header><h4 className="font-semibold">Field execution planner</h4><p className="text-xs">Internal seven-day working draft for selected accounts only. No customer appointment, automated outreach, saved task or CRM update. Draft is cleared when this reviewed sample is refreshed, expires or closes.</p></header>
  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
   <div className="rounded border p-2"><p className="text-xs">Planned accounts</p><strong className="text-xl tabular-nums">{r.planned.length}</strong></div>
   <div className="rounded border p-2"><p className="text-xs">Unplanned eligible</p><strong className="text-xl tabular-nums">{r.unplanned.length}</strong></div>
   <div className="rounded border p-2"><p className="text-xs">Complete samples</p><strong className="text-xl tabular-nums">{r.checked}/{r.selected}</strong></div>
  </div>
  <button type="button" className="workspace-button min-h-11" disabled={busy||!r.candidates.length} onClick={()=>void load()}>{busy?'Loading locations…':'Load source-matched locations'}</button>
  {notice&&<p role="status" className="text-xs">{notice}</p>}
  <div className="rounded border p-3 space-y-2 min-w-0">
   <h5 className="font-semibold">Choose a provider</h5>
   <label>Selected account<select className={control} value={account} onChange={e=>select(e.target.value)}><option value="">Choose account</option>{r.candidates.map(a=><option key={a.agency.id} value={a.agency.id}>{a.priority?'Priority '+a.priority.rank+' · ':''}{a.agency.name}{r.planned.some(p=>p.agency.id===a.agency.id)?' · planned':''}</option>)}</select></label>
   {!r.candidates.length&&<p>No eligible source-native accounts in this sample.</p>}
   {candidate&&<>
    {candidate.priority?<div className="space-y-1 break-words"><p className="font-medium">{OPPORTUNITY_LABELS[candidate.priority.primary.signal.kind]}</p><p>{candidate.priority.primary.signal.evidence.value}</p><p className="text-xs">Reviewed document: {candidate.priority.primary.signal.evidence.documentDate}{candidate.priority.primary.signal.date?' · reported date '+candidate.priority.primary.signal.date:''}</p><a className="underline" href={candidate.priority.primary.signal.evidence.sourceUrl} target="_blank" rel="noopener noreferrer">Reviewed source</a><p className="text-xs">Suggested preparation: {candidate.priority.primary.signal.nextAction}</p><button type="button" className="workspace-button min-h-11" onClick={()=>{setObjective(candidate.priority!.primary.signal.nextAction.slice(0,300));setConfirmed(false);}}>Use suggested preparation</button></div>:<p className="text-xs">No eligible reviewed priority signal. Discovery only; do not infer equipment, funding or purchase intent.</p>}
    {candidate.location?<p className="text-xs break-words">{candidate.location.address} · {candidate.location.matchLabel} · verify before visiting. <a href={candidate.location.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">Location source</a></p>:<p className="text-xs">No accepted location in geographic research. Verify address independently; excluded from proximity grouping.</p>}
    {candidate.tasks.length>0&&<details><summary>Existing open follow-ups ({candidate.tasks.length})</summary><ul className="divide-y">{candidate.tasks.map(t=><li key={t.id} className="py-1 break-words">{t.action} · {t.dueDate||'No due date'}</li>)}</ul><p className="text-xs">Device workspace records only. No task changes here.</p></details>}
    <label>Planned date<select className={control} value={day} onChange={e=>{setDay(e.target.value);setConfirmed(false);}}>{r.days.map(d=><option key={d}>{d}</option>)}</select></label>
    <label>Internal visit objective<textarea className={control} rows={3} maxLength={300} value={objective} onChange={e=>{setObjective(e.target.value);setConfirmed(false);}}/></label>
    <label className="flex gap-2 items-start min-h-11"><input type="checkbox" checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/><span>I confirm this is an internal draft; I will verify current evidence, address and contact permission before visiting.</span></label>
    <div className="flex flex-wrap gap-2"><button type="button" className="workspace-button min-h-11" disabled={!canAdd} onClick={add}>{existing?'Update planned visit':'Add to field plan'}</button><button type="button" className="workspace-button min-h-11" onClick={()=>onOpenAgency(candidate.agency)}>Open profile for pre-call preparation</button></div>
   </>}
  </div>
  <div role="group" aria-label="Plan period" className="grid grid-cols-2 gap-2">{(['day','week'] as const).map(m=><button key={m} type="button" className="workspace-button min-h-11" aria-pressed={mode===m} onClick={()=>setMode(m)}>{m==='day'?'Daily plan':'Seven-day plan'}</button>)}</div>
  {mode==='day'&&<label>Show date<select className={control} value={filterDay} onChange={e=>setFilterDay(e.target.value)}>{r.days.map(d=><option key={d}>{d}</option>)}</select></label>}
  {r.schedule.filter(d=>mode==='week'||d.day===filterDay).map(d=><section className="rounded border p-2 space-y-1 min-w-0" key={d.day}><h5 className="font-semibold">{d.day} · {d.rows.length} planned</h5>{!d.rows.length&&<p className="text-xs">No planned visits.</p>}
   <ul className="divide-y">{d.rows.map(a=><li key={a.identityKey} className="py-2 space-y-1 break-words"><p className="font-medium">{a.agency.name}</p><p>{a.visit.objective}</p><p className="text-xs">{a.priority?'Reviewed priority '+a.priority.rank:'Discovery only'} · {a.location?'Source-matched location':'Location to verify'}</p>{a.priority&&<a className="underline" href={a.priority.primary.signal.evidence.sourceUrl} target="_blank" rel="noopener noreferrer">Reviewed source</a>}<div className="flex flex-wrap gap-2"><button type="button" className="workspace-button min-h-11" onClick={()=>select(a.agency.id)}>Edit</button><button type="button" className="workspace-button min-h-11" onClick={()=>{setVisits(prev=>prev.filter(v=>v.agencyId!==a.agency.id));if(account===a.agency.id)select('');}}>Remove</button><button type="button" className="workspace-button min-h-11" onClick={()=>onOpenAgency(a.agency)}>Open profile</button></div></li>)}</ul>
   {d.groups.map(g=><p key={g.key} className="text-xs break-words">Nearby research group: {g.accounts.map(a=>a.agency.name).join(', ')} · max {g.diameterMiles.toFixed(1)} straight-line miles</p>)}
   {d.unmapped>0&&<p className="text-xs">{d.unmapped} planned account(s) excluded from geographic grouping.</p>}
  </section>)}
  {r.unplanned.length>0&&<details><summary>Selected accounts not yet planned ({r.unplanned.length})</summary>{r.unplanned.map(a=><p key={a.identityKey} className="py-1 break-words">{a.agency.name} · {a.priority?'Reviewed signal available':'Discovery only'}</p>)}</details>}
  {r.withheld>0&&<p role="status" className="text-xs">{r.withheld} invalid or out-of-scope visit draft(s) withheld.</p>}
  <p className="text-xs">Planning order is not a driving route, appointment or predicted revenue. No county centroid fallback. Coverage is limited to the selected accounts.</p>
 </section>;
}
