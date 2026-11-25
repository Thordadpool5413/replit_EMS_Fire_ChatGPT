import React,{useState} from 'react';
import type {Agency} from '../types';
import type {ReviewedSample} from '../services/reviewedAccountPriorities';
import {ACTIVITY_WINDOWS,buildAccountCoverage,type ActivityWindow,type ActivityStatus} from '../services/accountCoverage';
import {displayedProviderLocation,mappedProviderLocation,useLocationRevision,loadProviderLocationState} from '../services/providerLocation';
import {OPPORTUNITY_LABELS} from '../services/opportunityRadar';
import {localDay} from '../utils/followUps';
const resolve=(a:Agency,directory:Agency[])=>({location:displayedProviderLocation(a,directory),match:mappedProviderLocation(a,directory)});
const LABELS:Record<ActivityStatus,string>={recent:'Recent recorded activity',older:'Older recorded activity','not-recorded':'No recorded contact'};
type Filter='all'|ActivityStatus|'priority-gap'|'follow-up'|'location-gap';
const FILTERS:{value:Filter;label:string}[]=[{value:'all',label:'All eligible selected accounts'},{value:'not-recorded',label:'No recorded contact'},{value:'older',label:'Older recorded contact'},{value:'recent',label:'Recent recorded contact'},{value:'priority-gap',label:'Reviewed priority without recent contact'},{value:'follow-up',label:'Due or overdue follow-up'},{value:'location-gap',label:'Location needs verification'}];
const control='block w-full min-w-0 rounded border p-2 bg-transparent text-base';
export function AccountCoveragePanel({agencies,selected,samples,started,onOpenAgency,onPlan}:{agencies:Agency[];selected:string[];samples:ReviewedSample[];started:number;onOpenAgency:(a:Agency)=>void;onPlan:()=>void}){
 useLocationRevision();
 const [windowDays,setWindowDays]=useState<ActivityWindow>(30),[filter,setFilter]=useState<Filter>('all'),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const r=buildAccountCoverage(agencies,selected,samples,resolve,localDay(),windowDays,started);
 const rows=r.rows.filter(a=>filter==='all'||filter===a.status||filter==='priority-gap'&&a.status!=='recent'&&!!a.priority||filter==='follow-up'&&a.overdue>0||filter==='location-gap'&&!a.mapped);
 async function load(){
  setBusy(true);setNotice('');
  try{const states=[...new Set(r.rows.map(a=>a.agency.stateCode))],results=await Promise.allSettled(states.map(loadProviderLocationState));
   setNotice(results.every(x=>x.status==='fulfilled'&&!!x.value)?'Bundled source snapshots loaded. Unmatched locations remain unverified.':'Some source snapshots could not be loaded.');
  }catch{setNotice('Location snapshots unavailable.');}finally{setBusy(false);}
 }
 if(!r.active)return <p role="status">Selected account sample expired or invalid. Refresh before reviewing coverage.</p>;
 const tiles:{label:string;value:number;filter:Filter}[]=[{label:'Recent contact',value:r.recent,filter:'recent'},{label:'Older contact',value:r.older,filter:'older'},{label:'No recorded contact',value:r.notRecorded,filter:'not-recorded'},{label:'Reviewed priority gap',value:r.priorityGaps,filter:'priority-gap'},{label:'Due / overdue accounts',value:r.overdueAccounts,filter:'follow-up'},{label:'Location gaps',value:r.eligible-r.mapped,filter:'location-gap'}];
 return <section className="space-y-3 min-w-0" aria-label="Selected account activity coverage">
  <header><h4 className="font-semibold">Account activity coverage</h4><p className="text-xs">Recorded workspace contacts among selected eligible accounts, not statewide penetration, market share or verified customer relationships. Missing records may mean activity was logged elsewhere.</p></header>
  <label>Activity lookback<select className={control} value={windowDays} onChange={e=>setWindowDays(Number(e.target.value) as ActivityWindow)}>{ACTIVITY_WINDOWS.map(d=><option key={d} value={d}>{d} days including today</option>)}</select></label>
  <div className="rounded border p-3 space-y-1"><p className="font-semibold">{r.recent}/{r.eligible} eligible selected accounts with recent recorded contact</p>{r.eligible>0&&<progress className="w-full" value={r.recent} max={r.eligible} aria-label="Eligible selected accounts with recent recorded contact"/>}<p className="text-xs">{r.visitAccounts} accounts with recorded site visits or ride-alongs · {r.checked}/{r.selected} complete reviewed document samples · {r.excluded} excluded identities.</p></div>
  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">{tiles.map(t=><button type="button" key={t.filter} aria-pressed={filter===t.filter} className="rounded-lg border p-2 text-left min-w-0 min-h-20 flex flex-col gap-1" onClick={()=>setFilter(t.filter)}><span className="text-xs break-words">{t.label}</span><strong className="text-xl tabular-nums">{t.value}</strong></button>)}</div>
  <label>Account filter<select className={control} value={filter} onChange={e=>setFilter(e.target.value as Filter)}>{FILTERS.map(f=><option key={f.value} value={f.value}>{f.label}</option>)}</select></label>
  <button type="button" className="workspace-button min-h-11" disabled={busy||!r.eligible} onClick={()=>void load()}>{busy?'Loading locations…':'Load source location snapshots'}</button>
  {notice&&<p role="status" className="text-xs">{notice}</p>}
  <p className="text-xs">{rows.length} of {r.eligible} eligible accounts shown. Contact records are not independent proof of engagement; internal RFP reviews and standalone tasks do not count as contact.</p>
  {!rows.length&&<p>No eligible records match this filter.</p>}
  <ul className="divide-y">{rows.map(a=><li key={a.identityKey} className="py-3 space-y-1 break-words">
   <p className="font-semibold">{a.agency.name}</p><p className="text-xs">{LABELS[a.status]} · {a.contacts} contact record(s) · {a.visits} site visit / ride-along record(s) in window</p>
   <p className="text-xs">Last recorded contact: {a.lastContact??'Not recorded'} · Last recorded field visit: {a.lastVisit??'Not recorded'}</p>
   {a.priority?<div className="text-xs space-y-1"><p>{OPPORTUNITY_LABELS[a.priority.signal.kind]} · reviewed {a.priority.signal.evidence.documentDate}{a.priority.signal.date?' · reported date '+a.priority.signal.date:''}</p><a className="underline" href={a.priority.signal.evidence.sourceUrl} target="_blank" rel="noopener noreferrer">Reviewed source</a></div>:<p className="text-xs">No eligible reviewed priority in this sample; not evidence of no opportunity.</p>}
   <p className="text-xs">{a.openTasks} recorded open follow-up(s) · {a.overdue} due or overdue · {a.mapped?'Source-matched location; validate before visiting':'No accepted source-matched location loaded'}</p>
   <button type="button" className="workspace-button min-h-11" onClick={()=>onOpenAgency(a.agency)}>Open account profile</button>
  </li>)}</ul>
  {r.withheld>0&&<p role="status" className="text-xs">{r.withheld} malformed, future-dated or ambiguous contact record(s) withheld.</p>}
  <button type="button" className="workspace-button min-h-11" onClick={onPlan}>Open field execution plan</button>
  <p className="text-xs">Read-only local workspace observations. No task or sales-stage changes, external messaging, owner assignment or automatic visit creation.</p>
 </section>;
}
