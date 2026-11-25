import {useEffect,useRef,useState} from 'react';
import type {Agency} from '../types';
import {DISCOVERY_STATES} from '../services/publicIntelligenceDiscovery';
import {TOPICS,topicLabel,sampleResearch,reconcileResearch,type Topic,type Snapshot} from '../services/nationalEnrichmentResearch';
export function NationalEnrichmentResearch({agencies,onOpen}:{agencies:Agency[];onOpen?:(a:Agency)=>void}){
 const [open,setOpen]=useState(false),[state,setState]=useState(''),[year,setYear]=useState(new Date().getUTCFullYear()-2),[topics,setTopics]=useState<Topic[]>(['fema','grants','defibrillator']),[sample,setSample]=useState<Snapshot>(),[busy,setBusy]=useState(false),[status,setStatus]=useState(''),[filter,setFilter]=useState('all'),[page,setPage]=useState(1);
 const request=useRef<AbortController|undefined>(undefined);
 const clear=()=>{request.current?.abort();request.current=undefined;setSample(undefined);setBusy(false);setStatus('');setPage(1);};
 useEffect(()=>{const offline=()=>{clear();setStatus('Offline. Refresh when connected.');};window.addEventListener('offline',offline);return()=>{request.current?.abort();window.removeEventListener('offline',offline);};},[]);
 useEffect(()=>{if(!sample)return;const timer=window.setTimeout(()=>{setSample(undefined);setStatus('Sample expired. Refresh sources.');},Math.max(0,sample.started+300000-Date.now()));return()=>window.clearTimeout(timer);},[sample]);
 async function run(){
  if(busy||!state||!topics.length)return;clear();const controller=new AbortController();request.current=controller;setBusy(true);
  try{const data=await sampleResearch(state,year,topics,controller.signal,m=>{if(request.current===controller)setStatus(m);});if(request.current!==controller)return;if(!navigator.onLine)throw Error('Connection lost.');setSample(data);setStatus('');}
  catch(e){if(request.current===controller&&!controller.signal.aborted)setStatus(e instanceof Error?e.message:'Source unavailable.');}
  finally{if(request.current===controller){request.current=undefined;setBusy(false);}}
 }
 const result=sample?reconcileResearch(sample,agencies):undefined,rows=result?.rows.filter(r=>filter==='all'||r.status===filter)??[],current=Math.min(page,Math.max(1,Math.ceil(rows.length/10)));
 const control='block w-full min-w-0 rounded border p-2 bg-transparent text-base';
 return <section className="border rounded p-3 space-y-2 min-w-0" aria-label="National provider enrichment research">
  <button type="button" className="workspace-button min-h-11" aria-expanded={open} onClick={()=>{if(open)clear();setOpen(!open);}}>{open?'Close national research':'Open national enrichment research'}</button>
  {open&&<div className="space-y-3 text-sm">
   <p>Search official grants and federal supplier awards in any state or D.C. One state, up to three searches and two pages per search. No automatic account assignments.</p>
   <div className="grid grid-cols-1 sm:grid-cols-2 gap-2"><label>Recipient state<select className={control} disabled={busy} value={state} onChange={e=>{clear();setState(e.target.value);}}><option value="">Choose state</option>{DISCOVERY_STATES.map(s=><option key={s}>{s}</option>)}</select></label><label>From year<select className={control} disabled={busy} value={year} onChange={e=>{clear();setYear(Number(e.target.value));}}>{Array.from({length:new Date().getUTCFullYear()-2009},(_,i)=>new Date().getUTCFullYear()-i).map(y=><option key={y}>{y}</option>)}</select></label></div>
   <fieldset><legend>Select up to three searches</legend>{TOPICS.map(t=><label key={t} className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={topics.includes(t)} disabled={busy||(!topics.includes(t)&&topics.length>=3)} onChange={()=>{clear();setTopics(prev=>prev.includes(t)?prev.filter(x=>x!==t):[...prev,t]);}}/>{topicLabel(t)}</label>)}</fieldset>
   <button type="button" className="workspace-button min-h-11" disabled={busy||!state||!topics.length} onClick={()=>void run()}>{busy?'Checking sources…':'Check selected sources'}</button>
   {status&&<p role="status">{status}</p>}
   {sample&&result&&<>
    <p>Bounded sample, expires after five minutes. Not a complete census.</p>
    <ul className="divide-y">{sample.scopes.map(s=><li key={s.topic} className="py-2"><strong>{topicLabel(s.topic)}</strong><p>{s.status} · {s.pages} pages · {s.sourceRows} source rows · {s.withheld} withheld or duplicate</p></li>)}</ul>
    <p>{result.rows.length} native candidates · {result.conflicts} conflicting identities withheld.</p>
    <label>Identity status<select className={control} value={filter} onChange={e=>{setFilter(e.target.value);setPage(1);}}>{['all','name-match','ambiguous','unmatched','supplier-not-buyer'].map(v=><option key={v}>{v}</option>)}</select></label>
    {!rows.length&&<p>No matching candidates. This does not establish absence of awards.</p>}
    <ul className="divide-y">{rows.slice((current-1)*10,current*10).map(r=>{const c=r.candidate;return <li key={c.source+':'+c.id} className="py-2 space-y-1 break-words"><p className="font-semibold">{c.recipient} · {c.state}</p><p>{c.title}</p><p>{c.source} · {r.status==='name-match'?'Possible name match, verify identity':r.status==='supplier-not-buyer'?'Supplier award, not agency buyer':r.status}</p><p>{c.amount===null?'Amount not stated':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(c.amount)} · {c.period||'Period not stated'}</p><a href={c.url} target="_blank" rel="noopener noreferrer" className="underline">Official source</a>{r.account&&onOpen&&<button type="button" className="workspace-button min-h-11" onClick={()=>onOpen(r.account!)}>Inspect possible account</button>}</li>;})}</ul>
    <div className="flex gap-2 items-center"><button type="button" className="workspace-button" disabled={current===1} onClick={()=>setPage(current-1)}>Previous</button><span>Page {current}</span><button type="button" className="workspace-button" disabled={current*10>=rows.length} onClick={()=>setPage(current+1)}>Next</button></div>
    <p className="text-xs">Cross-source awards may overlap and are not summed. No automatic equipment claims or buyer attribution. End-user review required.</p>
   </>}
  </div>}
 </section>;
}
