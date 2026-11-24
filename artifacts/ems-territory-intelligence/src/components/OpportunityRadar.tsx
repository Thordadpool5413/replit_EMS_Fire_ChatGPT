import React,{useEffect,useMemo,useState} from 'react';
import {FileSearch,ArrowUpRight} from 'lucide-react';
import type {Agency} from '../types';
import {OPPORTUNITY_LABELS,type OpportunityKind} from '../services/opportunityRadar';
import {utcDay,EQUIPMENT_LOOKBACK_DAYS,PROCUREMENT_LOOKBACK_DAYS} from '../services/documentedIntelligence';
import {buildOpportunityPriorities,PRIORITY_BANDS,PRIORITY_LABELS,PRIORITY_RULES,prioritySignalLabel,type PriorityBand,type PrioritySignal} from '../services/opportunityPrioritization';
const input='block w-full min-w-0 rounded border p-2 bg-transparent text-base';
function SignalDetails({signal:s}:{signal:PrioritySignal}){
 const e=s.evidence;
 return <div className="space-y-1 min-w-0 break-words">
  <p className="text-sm font-medium">{prioritySignalLabel(s)} · {e.value}</p>
  {s.date&&<p className="text-sm">Documented date: {s.date}</p>}
  <p className="text-sm">{s.reason}</p><p className="text-xs">{e.sourceName} · document {e.documentDate} · record {e.sourceRecordId}</p>
  <a href={e.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline text-sm">Open source <ArrowUpRight size={14} aria-hidden="true"/></a>
  <p className="text-sm"><strong>Next step:</strong> {s.nextAction}</p>
 </div>;
}
export function OpportunityRadar({agencies,onOpen}:{agencies:Agency[];onOpen?:(a:Agency)=>void}){
 const [state,setState]=useState('all'),[kind,setKind]=useState<OpportunityKind|'all'>('all'),[band,setBand]=useState<PriorityBand|'all'>('all'),[search,setSearch]=useState(''),[page,setPage]=useState(1);
 const [day,setDay]=useState(()=>utcDay(Date.now()));
 useEffect(()=>{const t=window.setInterval(()=>setDay(utcDay(Date.now())),60_000);return()=>window.clearInterval(t);},[]);
 const states=useMemo(()=>[...new Set(agencies.map(a=>a.stateCode).filter(Boolean))].sort(),[agencies]);
 const result=useMemo(()=>buildOpportunityPriorities(agencies,state,kind,Date.now()),[agencies,state,kind,day]);
 const rows=result.ranked.filter(r=>(band==='all'||r.band===band)&&[r.agency.name,r.agency.stateCode,r.identityKey].join(' ').toLowerCase().includes(search.trim().toLowerCase()));
 const current=Math.min(page,Math.max(1,Math.ceil(rows.length/6)));
 return <section className="pi-surface p-4 min-w-0 space-y-3" aria-label="ATLAS Opportunity Radar" data-testid="opportunity-radar">
  <div className="flex items-start gap-2"><FileSearch size={20} aria-hidden="true" className="shrink-0"/><div className="min-w-0"><h2 className="font-semibold">ATLAS Opportunity Radar</h2><p className="text-sm">Prioritized accounts based on locally documented research signals. Confirm each source before taking action.</p></div></div>
  <dl className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">{[['Loaded account rows',result.loadedRows],['With typed documents',result.typedRows],['Prioritized accounts',result.ranked.length]].map(([label,value])=><div className="min-w-0" key={label}><dt>{label}</dt><dd className="text-xl font-semibold tabular-nums">{Number(value).toLocaleString()}</dd></div>)}</dl>
  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">{PRIORITY_BANDS.map(b=><button key={b} type="button" aria-pressed={band===b} className="workspace-button min-w-0 flex-col items-start text-left" onClick={()=>{setBand(v=>v===b?'all':b);setPage(1);}}><span>{PRIORITY_LABELS[b]}</span><span className="font-semibold tabular-nums">{result.bands[b].toLocaleString()}</span></button>)}</div>
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2"><label className="block text-sm">State<select className={input} value={state} onChange={e=>{setState(e.target.value);setPage(1);}}><option value="all">All loaded states</option>{states.map(s=><option key={s}>{s}</option>)}</select></label><label className="block text-sm">Signal type<select className={input} value={kind} onChange={e=>{setKind(e.target.value as typeof kind);setPage(1);}}><option value="all">All documented signals</option>{Object.entries(OPPORTUNITY_LABELS).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label></div>
  <label className="block text-sm">Find prioritized accounts<input className={input} value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Account name, state or registry ID"/></label>
  <details><summary className="text-sm font-medium cursor-pointer">How priorities are calculated · {result.asOf} (UTC)</summary><div className="text-xs space-y-1 mt-2"><p>Verify now: documented solicitation response date within {PRIORITY_RULES.bidNowDays} days. Verify soon: solicitation within {PRIORITY_RULES.bidSoonDays} days or contract end date within {PRIORITY_RULES.contractSoonDays} days. Plan research: later eligible solicitation, contract end within {PRIORITY_RULES.contractHorizonDays} days, recent grant or capital approval. Explore: recognized competitor product observation or recent award.</p><p>Equipment documents: up to {EQUIPMENT_LOOKBACK_DAYS} days old; purchasing and funding documents: {PROCUREMENT_LOOKBACK_DAYS} days; contract document: {PRIORITY_RULES.contractDocumentMaxAgeDays} days. The most urgent eligible signal determines the account band. Dates, then signal type, document recency and identity break ties. Signal filtering recalculates the ranking; extra documents and large award amounts never boost priority.</p><p>Rule-based research ordering, not AI prediction, win probability, revenue estimate, independently approved evidence or confirmed opportunity. No private data is sent or saved by this view.</p></div></details>
  <details><summary className="text-sm font-medium cursor-pointer">Evidence coverage and review gaps</summary><div className="text-xs space-y-1 mt-2"><p>{result.noTypedEvidence.toLocaleString()} loaded rows without typed evidence; {result.identityExcluded.toLocaleString()} typed rows excluded for ambiguous or invalid native identity; {result.noEligibleSignals.toLocaleString()} eligible typed rows without a usable priority signal; {result.filteredOut.toLocaleString()} otherwise rankable accounts outside the chosen signal filter.</p><p>{result.reviewRequired.toLocaleString()} eligible typed rows require document review (may overlap prioritized accounts with unrelated usable evidence). Missing evidence is not proof of no opportunity. Loaded directory rows are not unique real-world providers or market coverage.</p></div></details>
  {!rows.length&&<p role="status" className="text-sm">No eligible priority signals in this selection. Use Sources &amp; Review or the research queue to collect dated provider-specific evidence. Missing evidence is not evidence of no opportunity.</p>}
  <ul className="divide-y divide-slate-200 dark:divide-slate-700">{rows.slice((current-1)*6,current*6).map((r,i)=><li className="py-3 space-y-2 min-w-0 break-words" key={r.identityKey}>
   <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><p className="text-xs">{(current-1)*6+i+1}. {PRIORITY_LABELS[r.band]}</p><strong>{r.agency.name}</strong><p className="text-xs">{r.agency.stateCode} · {r.identityKey}</p></div><span className="text-xs">{r.signals.length} eligible signal{r.signals.length===1?'':'s'}</span></div>
   <SignalDetails signal={r.primary}/>
   {r.reviewRequired&&<p className="text-xs font-medium">Other local evidence requires review. Do not assume an association between independent documents.</p>}
   <p className="text-xs">{r.missingCategories} of 6 equipment categories lack an eligible dated local observation; verify current equipment and decision ownership.</p>
   {r.signals.length>1&&<details><summary className="text-sm cursor-pointer">Other research signals ({r.signals.length-1})</summary><div className="mt-2 space-y-3">{r.signals.slice(1,6).map(s=><SignalDetails key={s.key} signal={s}/>)}{r.signals.length>6&&<p className="text-xs">Additional documents are available in the agency profile. Separate signals are not assumed to describe the same purchase.</p>}</div></details>}
   {onOpen&&<button type="button" className="workspace-button" onClick={()=>onOpen(r.agency)}>Open agency profile</button>}
  </li>)}</ul>
  <div className="flex flex-wrap gap-2 items-center"><button type="button" className="workspace-button" disabled={current===1} onClick={()=>setPage(current-1)}>Previous</button><span className="text-sm">{rows.length.toLocaleString()} prioritized accounts · page {current} of {Math.max(1,Math.ceil(rows.length/6))}</span><button type="button" className="workspace-button" disabled={current*6>=rows.length} onClick={()=>setPage(current+1)}>Next</button></div>
 </section>;
}
