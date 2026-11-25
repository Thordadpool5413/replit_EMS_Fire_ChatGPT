import React,{useEffect,useState} from 'react';
import type {Agency} from '../types';
import type {ReviewedSample} from '../services/reviewedAccountPriorities';
import {buildLeadershipReview,REASON_LABELS,REASON_VIEWS,type ReviewReason} from '../services/leadershipReview';
import {ACTIVITY_WINDOWS,type ActivityWindow} from '../services/accountCoverage';
import {DEAL_LABELS} from '../services/workingPipeline';
import type {CommandView} from '../services/territoryCommand';
import {displayedProviderLocation,mappedProviderLocation,useLocationRevision,loadProviderLocationState} from '../services/providerLocation';
import {OPPORTUNITY_LABELS} from '../services/opportunityRadar';
import {useSharedPipeline} from '../services/sharedPipeline';
import {localDay} from '../utils/followUps';
const resolve=(a:Agency,directory:Agency[])=>({location:displayedProviderLocation(a,directory),match:mappedProviderLocation(a,directory)});
const control='block w-full min-w-0 rounded border p-2 bg-transparent text-base';
export function LeadershipReviewPanel({uid,agencies,selected,samples,started,onOpenAgency,onView}:{uid:string;agencies:Agency[];selected:string[];samples:ReviewedSample[];started:number;onOpenAgency:(a:Agency)=>void;onView:(v:CommandView)=>void}){
 useLocationRevision();
 const [windowDays,setWindowDays]=useState<ActivityWindow>(30),[filter,setFilter]=useState<ReviewReason|'all'|'attention'>('attention'),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const {reads:device,reload,loading}=useSharedPipeline(uid,agencies,selected,started);

 const r=buildLeadershipReview(agencies,selected,samples,device,resolve,localDay(),windowDays,started);
 const rows=r.rows.filter(a=>filter==='all'||filter==='attention'&&a.reasons.length>0||filter!=='attention'&&a.reasons.includes(filter as ReviewReason));
 async function locations(){
  setBusy(true);setNotice('');
  try{const states=[...new Set(r.rows.map(a=>a.agency.stateCode))],v=await Promise.allSettled(states.map(loadProviderLocationState));setNotice(v.every(x=>x.status==='fulfilled'&&!!x.value)?'Bundled location snapshots loaded.':'Some location snapshots unavailable.');}
  catch{setNotice('Location snapshots unavailable.');}finally{setBusy(false);}
 }
 if(!r.active)return <p role="status">Selected account sample expired or invalid. Refresh before leadership review.</p>;
 const metrics=[{label:'Recent recorded contact',value:r.contacted,total:r.eligible,view:'activity'},{label:'Complete document samples',value:r.checked,total:r.eligible,view:'coverage'},{label:'Accepted map locations loaded',value:r.mapped,total:r.eligible,view:'geography'},{label:'Working opportunities recorded',value:r.recorded,total:r.deviceReadable,view:'pipeline'}] as const;
 return <section className="space-y-3 min-w-0" aria-label="Leadership account review">
  {loading&&<p role="status">Loading shared pipeline records…</p>}
  <header><h4 className="font-semibold">Leadership account review</h4><p className="text-xs">Read-only review of selected accounts in your workspace. Not an organization-wide dashboard, assigned rep scorecard, revenue forecast or manager-only access role.</p></header>
  <p className="text-xs">{r.eligible} eligible of {r.selected} selected · {r.excluded} excluded identities · {r.deviceReadable}/{r.eligible} shared account records readable. Missing records do not establish poor performance.</p>
  <label>Recorded-contact lookback<select className={control} value={windowDays} onChange={e=>setWindowDays(Number(e.target.value) as ActivityWindow)}>{ACTIVITY_WINDOWS.map(w=><option key={w} value={w}>{w} days including today</option>)}</select></label>
  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{metrics.map(t=><button type="button" className="rounded border p-2 text-left min-w-0 min-h-24" key={t.label} onClick={()=>onView(t.view)}><span className="block text-xs break-words">{t.label}</span><strong className="block text-xl tabular-nums">{t.total?t.value+'/'+t.total:'Unavailable'}</strong>{t.total>0&&<progress className="w-full" max={t.total} value={t.value} aria-label={t.label}/>}</button>)}</div>
  <div className="rounded border p-3 space-y-2"><h5 className="font-semibold">Working pipeline snapshot</h5><p className="text-xs">{r.qualified} user-recorded qualified / evaluation / purchasing records. Shared records in the authorized agency workspace. {r.eligible-r.deviceReadable} account record(s) unreadable or not yet loaded.</p>{r.byStage.map(s=><div key={s.stage} className="flex items-center justify-between gap-2 text-sm"><span>{DEAL_LABELS[s.stage]}</span><strong className="tabular-nums">{s.count}</strong></div>)}<button type="button" className="workspace-button min-h-11" onClick={()=>onView('pipeline')}>Open working pipeline</button></div>
  <h5 className="font-semibold">Review priorities ({r.attention} distinct accounts)</h5><p className="text-xs">Categories overlap. Ordering is a fixed review sequence, not a predictive risk score. Discuss the evidence before deciding action.</p>
  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{r.byReason.map(t=><button type="button" key={t.reason} aria-pressed={filter===t.reason} className="rounded border p-2 min-h-20 min-w-0 text-left" onClick={()=>setFilter(t.reason)}><span className="block text-xs break-words">{REASON_LABELS[t.reason]}</span><strong className="text-xl tabular-nums">{t.count}</strong></button>)}</div>
  <label>Review filter<select className={control} value={filter} onChange={e=>setFilter(e.target.value as typeof filter)}><option value="attention">Accounts with review prompts</option><option value="all">All eligible selected accounts</option>{r.byReason.map(t=><option key={t.reason} value={t.reason}>{REASON_LABELS[t.reason]}</option>)}</select></label>
  <div className="flex flex-wrap gap-2"><button type="button" className="workspace-button min-h-11" onClick={()=>{reload();setNotice('');}}>Reload shared records</button><button type="button" className="workspace-button min-h-11" disabled={busy||!r.eligible} onClick={()=>void locations()}>{busy?'Loading…':'Load source locations'}</button></div>{notice&&<p role="status" className="text-xs">{notice}</p>}
  {!rows.length&&<p>No eligible accounts match this filter. This is not proof of complete coverage or execution.</p>}
  <ul className="divide-y">{rows.map(a=><li key={a.identityKey} className="py-3 space-y-2 break-words"><p className="font-semibold">{a.agency.name}</p><p className="text-xs">Last recorded contact: {a.lastContact??'Not recorded'} · {a.contacts} contact records · {a.visits} recorded visits / ride-alongs in window</p><p className="text-xs">{a.openTasks} open follow-ups · {a.dueTasks} due or overdue · Working stage: {!a.dealAvailable?'Unavailable':a.stage?DEAL_LABELS[a.stage]:'Not recorded'}</p>{a.priority&&<p className="text-xs">Separate reviewed signal: {OPPORTUNITY_LABELS[a.priority.signal.kind]}{a.priority.signal.date?' · '+a.priority.signal.date:''} · <a href={a.priority.signal.evidence.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">Reviewed source</a></p>}
   <div className="flex flex-wrap gap-2">{a.reasons.map(reason=><button type="button" className="workspace-button min-h-11 text-left" key={reason} onClick={()=>onView(REASON_VIEWS[reason])}>{REASON_LABELS[reason]}</button>)}</div><button type="button" className="workspace-button min-h-11" onClick={()=>onOpenAgency(a.agency)}>Open account for review</button></li>)}</ul>
  <button type="button" className="workspace-button min-h-11" onClick={()=>onView('plan')}>Open field execution planner</button>
  <p className="text-xs">{r.withheldActivity} invalid or ambiguous contact records withheld. No private notes copied, automatic tasks, sales-stage changes or outreach. No manager access to another user's working records.</p>
 </section>;
}
