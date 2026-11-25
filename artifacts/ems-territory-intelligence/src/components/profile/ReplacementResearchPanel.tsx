import React,{useState} from 'react';
import type {Agency} from '../../types';
import type {LifecycleSample} from '../../services/lifecycleTimeline';
import {buildReplacementResearch,REPLACEMENT_WINDOWS,REPLACEMENT_FAMILIES,type ReplacementWindow,type ReplacementFamily,type ReplacementStatus} from '../../services/replacementResearch';
const familyLabels:Record<ReplacementFamily,string>={monitors:'Monitor / defibrillator',cpr:'Mechanical CPR',ventilators:'Transport ventilator',software:'Software'};
const statusLabels:Record<ReplacementStatus,string>={'verify-upcoming':'Verify upcoming reported coverage date','verify-past':'Verify current terms after reported past date',reconcile:'Reconcile differing dates / scope','date-gap':'Confirm model, maker or coverage dates',later:'Reported dates outside selected window'};
const control='block w-full min-w-0 rounded border p-2 bg-transparent text-base';
export function ReplacementResearchPanel({agency,directory,station,started}:{agency:Agency;directory:Agency[];station?:LifecycleSample;started:number}){
 const [windowDays,setWindowDays]=useState<ReplacementWindow>(90),[family,setFamily]=useState<ReplacementFamily|'all'>('all'),[filter,setFilter]=useState<ReplacementStatus|'all'>('all'),[page,setPage]=useState(1);
 const r=buildReplacementResearch(agency,directory,station,started,windowDays),rows=r.rows.filter(x=>(family==='all'||x.family===family)&&(filter==='all'||x.status===filter)),current=Math.min(page,Math.max(1,Math.ceil(rows.length/6)));
 return <section className="border rounded p-3 space-y-3 min-w-0" aria-label="Equipment replacement research">
  <header><h3 className="font-semibold">Equipment replacement research</h3><p className="text-xs">Review independently accepted station observations for all reported makers. Warranty and service dates are verification prompts, not replacement deadlines, current coverage or purchase intent.</p></header>
  {!r.available?<p role="status">Complete, current, identity-matched station evidence unavailable. Refresh or resolve the provider association before using lifecycle research.</p>:<>
   <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{([{status:'verify-upcoming',value:r.upcoming,label:'Upcoming dates'},{status:'verify-past',value:r.past,label:'Past dates'},{status:'reconcile',value:r.ambiguous,label:'Scope conflicts'},{status:'date-gap',value:r.gaps,label:'Date / identity gaps'}] as const).map(t=><button type="button" className="rounded border p-2 text-left min-h-20 min-w-0" key={t.status} aria-pressed={filter===t.status} onClick={()=>{setFilter(t.status);setPage(1);}}><span className="block text-xs break-words">{t.label}</span><strong className="text-xl tabular-nums">{t.value}</strong></button>)}</div>
   <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
    <label>Date window<select className={control} value={windowDays} onChange={e=>{setWindowDays(Number(e.target.value) as ReplacementWindow);setPage(1);}}>{REPLACEMENT_WINDOWS.map(d=><option key={d} value={d}>{d} days</option>)}</select></label>
    <label>Equipment category<select className={control} value={family} onChange={e=>{setFamily(e.target.value as typeof family);setPage(1);}}><option value="all">All equipment</option>{REPLACEMENT_FAMILIES.map(f=><option key={f} value={f}>{familyLabels[f]}</option>)}</select></label>
    <label>Research status<select className={control} value={filter} onChange={e=>{setFilter(e.target.value as typeof filter);setPage(1);}}><option value="all">All research groups</option>{Object.entries(statusLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
   </div>
   <p className="text-xs">{r.stations} source stations checked · {r.observations} accepted observation records · {r.stale} older than 730 days excluded · {rows.length} of {r.rows.length} research groups shown. Not device or fleet counts.</p>
   {!rows.length&&<p>No matching observations in the current sample. Missing evidence does not establish absence of equipment or opportunity.</p>}
   <ul className="divide-y">{rows.slice((current-1)*6,current*6).map(x=><li key={x.key} className="py-3 space-y-2 break-words">
    <p className="font-semibold">{x.stationName} · {familyLabels[x.family]}</p><p>{x.maker} · {x.model||'Model not stated'}{x.apparatus?' · '+x.apparatus:''}</p><p className="text-xs">{statusLabels[x.status]} · Latest observation {x.latest}</p>
    {x.nextDate&&<p className="text-xs font-medium">Next reported coverage date: {x.nextDate} (verify)</p>}
    <details><summary>Reviewed observations and dates ({x.observations.length})</summary>{x.observations.map(o=><div key={o.submissionId} className="border-l pl-2 py-1 space-y-1 text-xs"><p>Observed {o.observedOn} · {o.basis==='direct-observation'?'Reviewed field observation':'Reviewed document observation'}</p>{x.events.filter(e=>['acquisition','warranty','service'].some(k=>e.key==='station:'+o.submissionId+':'+k)).map(e=><p key={e.key}>{e.kind==='acquisition'?'Reported acquisition':e.kind==='warranty'?'Reported warranty end':'Reported service end'}: {e.date}{e.ambiguous?' · scope conflict':''}</p>)}{o.sourceUrl&&<a href={o.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">Submitted evidence source</a>}</div>)}</details>
    <details><summary>Account development questions</summary><p>{x.preparation.objective}</p><ol className="list-decimal pl-5 space-y-1">{x.preparation.questions.map((q,i)=><li key={i}>{q}</li>)}</ol><p className="text-xs">Confirm current model, quantity, agreement terms, actual replacement intent and authorized decision owner. {x.preparation.commitment}</p></details>
   </li>)}</ul>
   {rows.length>6&&<div className="flex items-center gap-2"><button type="button" className="workspace-button min-h-11" disabled={current===1} onClick={()=>setPage(current-1)}>Previous</button><span>Page {current}</span><button type="button" className="workspace-button min-h-11" disabled={current*6>=rows.length} onClick={()=>setPage(current+1)}>Next</button></div>}
   <p className="text-xs">Same model/apparatus is a research grouping, not an asset identifier. Department funding and procurement documents appear separately below; no automatic linkage, forecast or task creation.</p>
  </>}
 </section>;
}
