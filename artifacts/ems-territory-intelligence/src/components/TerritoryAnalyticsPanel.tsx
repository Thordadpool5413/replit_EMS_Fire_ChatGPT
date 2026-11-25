import React,{useEffect,useState} from 'react';
import type {Agency} from '../types';
import type {ReviewedSample} from '../services/reviewedAccountPriorities';
import type {DeviceRead} from '../services/leadershipReview';
import {ACTIVITY_WINDOWS,type ActivityWindow} from '../services/accountCoverage';
import {buildTerritoryAnalytics} from '../services/territoryAnalytics';
import {dealScope,loadDeal,DEAL_LABELS} from '../services/workingPipeline';
import {displayedProviderLocation,mappedProviderLocation,useLocationRevision,loadProviderLocationState} from '../services/providerLocation';
import type {CommandView} from '../services/territoryCommand';
import {localDay} from '../utils/followUps';
const resolve=(a:Agency,directory:Agency[])=>({location:displayedProviderLocation(a,directory),match:mappedProviderLocation(a,directory)});
const control='block w-full min-w-0 rounded border p-2 bg-transparent text-base';
const ratio=(n:number,d:number)=>d? n+'/'+d+' ('+Math.round(n/d*100)+'%)':'Unavailable (no denominator)';
export function TerritoryAnalyticsPanel({uid,agencies,selected,samples,started,onOpenAgency,onView}:{uid:string;agencies:Agency[];selected:string[];samples:ReviewedSample[];started:number;onOpenAgency:(a:Agency)=>void;onView:(v:CommandView)=>void}){
 useLocationRevision();
 const [device,setDevice]=useState<DeviceRead[]>([]),[windowDays,setWindowDays]=useState<ActivityWindow>(30),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const scope=dealScope(agencies,selected,started),scopeKey=JSON.stringify(scope.map(a=>[a.agency.id,a.identityKey]).sort());
 function reload(){
  setDevice(dealScope(agencies,selected,started).map(a=>{
   const base={agencyId:a.agency.id,identityKey:a.identityKey};
   try{return {...base,status:'read',record:loadDeal(localStorage,uid,a.agency.id,a.identityKey)};}catch{return {...base,status:'unavailable'};}
  }));
 }
 useEffect(()=>{reload();},[uid,scopeKey,started]);
 const r=buildTerritoryAnalytics(agencies,selected,samples,device,resolve,localDay(),windowDays,started);
 async function locations(){
  setBusy(true);setNotice('');
  try{const v=await Promise.allSettled([...new Set(r.rows.map(a=>a.agency.stateCode))].map(loadProviderLocationState));setNotice(v.every(x=>x.status==='fulfilled'&&!!x.value)?'Bundled location snapshots loaded.':'Some location snapshots unavailable.');}catch{setNotice('Location snapshots unavailable.');}finally{setBusy(false);}
 }
 if(!r.active)return <p role="status">Selected account sample expired or invalid. Refresh before using analytics.</p>;
 const comparisons=[{label:'Accounts with recorded contact',current:r.current.accounts,previous:r.previous.accounts},{label:'Recorded contact events',current:r.current.contacts,previous:r.previous.contacts},{label:'Recorded site visits / ride-alongs',current:r.current.visits,previous:r.previous.visits}];
 const metrics=[{label:'Reviewed document coverage',value:ratio(r.documents,r.eligible),view:'coverage'},{label:'Accepted map locations loaded',value:ratio(r.mapped,r.eligible),view:'geography'},{label:'Competitor observations in reviewed sample',value:ratio(r.competitorAccounts,r.competitiveChecked),view:'competitive'},{label:'Working records among readable accounts',value:ratio(r.workingRecords,r.deviceReadable),view:'pipeline'}] as const;
 return <section className="space-y-3 min-w-0" aria-label="Selected territory performance analytics">
  <header><h4 className="font-semibold">Territory performance analytics</h4><p className="text-xs">Read-only recorded activity and current research/workflow coverage for the same selected eligible accounts. No team or rep attribution, activity effectiveness or revenue causation inferred.</p></header>
  <p className="text-xs">{r.eligible} eligible of {r.selected} selected · {r.excluded} excluded identities. Missing or unreadable records are not evidence of no activity.</p>
  <label>Comparison period<select className={control} value={windowDays} onChange={e=>setWindowDays(Number(e.target.value) as ActivityWindow)}>{ACTIVITY_WINDOWS.map(w=><option key={w} value={w}>{w} days vs preceding {w} days</option>)}</select></label>
  <section className="rounded border p-3 space-y-3 min-w-0"><h5 className="font-semibold">Recorded activity comparison</h5><p className="text-xs">Current {r.start} – {r.today} · Previous {r.previousStart} – {r.previousEnd}. Equal-length inclusive local calendar date windows.</p>
   {comparisons.map(t=><div key={t.label} className="space-y-1"><p className="font-medium">{t.label}</p><div className="grid grid-cols-2 gap-2"><p className="text-xs">Current <strong className="block text-lg tabular-nums">{t.current}</strong></p><p className="text-xs">Previous <strong className="block text-lg tabular-nums">{t.previous}</strong></p></div><p className="text-xs">Recorded count difference: {t.current-t.previous>0?'+':''}{t.current-t.previous}</p></div>)}
   <button type="button" className="workspace-button min-h-11" onClick={()=>onView('activity')}>Review account activity</button>
  </section>
  <section className="rounded border p-3 space-y-2"><h5 className="font-semibold">Follow-up cohort</h5><p className="text-xs">Current status of records with a next action and record date in the current window. Not completion events during the window, on-time completion, or all tasks due during the window.</p><p>Recorded completed: <strong>{ratio(r.tasks.complete,r.tasks.total)}</strong></p><p className="text-xs">{r.tasks.open} open · {r.tasks.overdue} currently overdue · {r.tasks.unknownDate} open without valid due date</p><p>Coaching-tagged tasks completed: <strong>{ratio(r.tasks.coachingComplete,r.tasks.coaching)}</strong></p><p className="text-xs">Coaching subset uses the existing standalone task action marker, not an employee assessment or proof of coaching delivery.</p><div className="flex flex-wrap gap-2"><button type="button" className="workspace-button min-h-11" onClick={()=>onView('followups')}>Follow-ups</button><button type="button" className="workspace-button min-h-11" onClick={()=>onView('coaching')}>Coaching</button></div></section>
  <section className="rounded border p-3 space-y-2"><h5 className="font-semibold">Working opportunity progression</h5><p className="text-xs">{r.deviceReadable}/{r.eligible} device records readable · {r.truncatedHistories} truncated histories. Only the signed-in user's browser-local records, not shared CRM.</p><p>{r.stageChanges} recorded stage changes across {r.changedAccounts} accounts in the selected date window (UTC history timestamps).</p><p className="text-xs">First retained stage and repeated saves are not transitions. Changes can move in either direction; no conversion rate or sales outcome inferred.</p>{r.byStage.map(s=><div className="flex justify-between gap-2 text-sm" key={s.stage}><span>{DEAL_LABELS[s.stage]}</span><strong>{s.count}</strong></div>)}<button type="button" className="workspace-button min-h-11" onClick={()=>onView('pipeline')}>Working pipeline</button></section>
  <h5 className="font-semibold">Current data coverage</h5><div className="grid grid-cols-2 gap-2">{metrics.map(m=><button type="button" className="rounded border p-2 text-left min-w-0 min-h-20" key={m.label} onClick={()=>onView(m.view)}><span className="block text-xs break-words">{m.label}</span><strong className="block text-base break-words">{m.value}</strong></button>)}</div>
  <div className="flex flex-wrap gap-2"><button type="button" className="workspace-button min-h-11" onClick={()=>{reload();setNotice('Device records reloaded.');}}>Reload working records</button><button type="button" className="workspace-button min-h-11" disabled={busy||!r.eligible} onClick={()=>void locations()}>{busy?'Loading…':'Load source locations'}</button></div>{notice&&<p role="status">{notice}</p>}
  <details><summary className="font-semibold">Account-level breakdown ({r.rows.length})</summary><ul className="divide-y">{r.rows.map(a=><li key={a.identityKey} className="py-2 space-y-1 break-words"><p className="font-medium">{a.agency.name}</p><p className="text-xs">Contacts {a.contacts} vs {a.previousContacts} · Visits {a.visits} vs {a.previousVisits} · Cohort tasks {a.tasks.complete}/{a.tasks.total} complete</p><p className="text-xs">Documents {a.documentsAvailable?'available':'unavailable'} · Location {a.mapped?'loaded':'not accepted / loaded'} · Working stage {!a.dealAvailable?'unavailable':a.stage?DEAL_LABELS[a.stage]:'not recorded'}</p><button type="button" className="workspace-button min-h-11" onClick={()=>onOpenAgency(a.agency)}>Open profile</button></li>)}</ul></details>
  <p className="text-xs">{r.withheldActivity} invalid or ambiguous contact records and {r.tasks.withheld} task records withheld (may overlap). Research coverage reflects current samples, not statewide provider coverage. No automatic tasks, scoring, outreach or data changes.</p>
 </section>;
}
