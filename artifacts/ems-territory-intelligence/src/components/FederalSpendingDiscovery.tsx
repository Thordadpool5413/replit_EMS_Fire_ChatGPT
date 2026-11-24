import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Search,ExternalLink} from 'lucide-react';
import type {Agency} from '../types';
import {FEDERAL_STATES,FEDERAL_TOPICS,FEDERAL_DOCS,type FederalTopic,type FederalPage,type FederalQuery} from '../services/federalDiscoveryContract';
import {federalAccountCandidates,loadFederalDiscovery} from '../services/federalSpendingDiscovery';
const control='block w-full min-w-0 rounded border p-2 bg-transparent text-base';
const money=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
const labels={'name-match':'Possible grant recipient match; verify identity',ambiguous:'Ambiguous grant recipient identity',unmatched:'No exact loaded account match','supplier-not-buyer':'Contract recipient / supplier, not purchasing agency'} as const;
export function FederalSpendingDiscovery({agencies,onOpen}:{agencies:Agency[];onOpen?:(a:Agency)=>void}){
 const year=new Date().getUTCFullYear();
 const [state,setState]=useState(''),[fromYear,setFromYear]=useState(year-2),[topic,setTopic]=useState<FederalTopic>('grants');
 const [result,setResult]=useState<FederalPage>(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[search,setSearch]=useState('');
 const [displayPage,setDisplayPage]=useState(1);
 const request=useRef<AbortController|undefined>(undefined);
 function reset(){request.current?.abort();request.current=undefined;setResult(undefined);setError('');setBusy(false);setDisplayPage(1);}
 useEffect(()=>{
  const offline=()=>{request.current?.abort();request.current=undefined;setBusy(false);setResult(undefined);setError('Connection lost. Run a new check when online.');};
  window.addEventListener('offline',offline);return()=>{request.current?.abort();window.removeEventListener('offline',offline);};
 },[]);
 useEffect(()=>{
  if(!result)return;
  const timer=window.setTimeout(()=>{setResult(undefined);setError('Source retrieval expired. Run a fresh check.');},Math.max(0,Date.parse(result.fetchedAt)+16*60_000-Date.now()));
  return()=>window.clearTimeout(timer);
 },[result]);
 async function run(page=1){
  if(!state)return;
  reset();const controller=new AbortController();request.current=controller;setBusy(true);
  const q:FederalQuery={state,fromYear,topic,page};
  try{const data=await loadFederalDiscovery(q,controller.signal);if(request.current!==controller)return;if(!navigator.onLine)throw Error('Connection lost.');setResult(data);}
  catch(e){if(request.current===controller&&!controller.signal.aborted)setError(e instanceof Error?e.message:'Federal discovery failed.');}
  finally{if(request.current===controller)setBusy(false);}
 }
 const matches=useMemo(()=>federalAccountCandidates(agencies,result?.candidates??[]),[agencies,result]);
 const rows=matches.filter(({candidate:c})=>[c.recipient,c.awardNumber,c.awardingAgency,c.description].join(' ').toLowerCase().includes(search.trim().toLowerCase()));
 const current=Math.min(displayPage,Math.max(1,Math.ceil(rows.length/8)));
 return <section className="pi-surface p-4 min-w-0 space-y-3" aria-label="Federal spending discovery" data-testid="federal-spending-discovery">
  <div className="flex items-start gap-2"><Search size={20} aria-hidden="true" className="shrink-0"/><div className="min-w-0"><h2 className="font-semibold">Federal spending discovery</h2><p className="text-sm">Search USAspending federal grant and contract awards. These are already-awarded records, not open bids.</p></div></div>
  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
   <label className="block text-sm">Recipient state<select className={control} value={state} onChange={e=>{reset();setState(e.target.value);}}><option value="">Choose state</option>{FEDERAL_STATES.map(s=><option key={s}>{s}</option>)}</select></label>
   <label className="block text-sm">Activity since January 1<select className={control} value={fromYear} onChange={e=>{reset();setFromYear(Number(e.target.value));}}>{Array.from({length:year-2009},(_,i)=>year-i).map(y=><option key={y} value={y}>{y}</option>)}</select></label>
   <label className="block text-sm">Award search<select className={control} value={topic} onChange={e=>{reset();setTopic(e.target.value as FederalTopic);}}>{Object.entries(FEDERAL_TOPICS).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
  </div>
  <button type="button" className="workspace-button" disabled={busy||!state} onClick={()=>void run()}>{busy?'Checking USAspending…':'Discover federal awards'}</button>
  <p className="text-xs">{topic==='grants'?'Assistance listing 97.044 may include fire prevention or other eligible award activity, not necessarily equipment.':'The state refers to the award recipient/vendor, not the buyer or equipment location. Keyword results may be unrelated to EMS.'} Award amount is not available funds or predicted revenue. Performance dates are not verified local contract renewals.</p>
  {busy&&<p role="status" className="text-sm">Retrieving one bounded award page.</p>}
  {error&&<p role="alert" className="text-sm break-words">{error}</p>}
  {result&&<>
   <p className="text-xs">Source retrieved {new Date(result.fetchedAt).toLocaleString()} · activity through {result.throughDate} · source page {result.query.page}. <a href={FEDERAL_DOCS} target="_blank" rel="noreferrer" className="underline">API documentation</a></p>
   {result.warnings>0&&<p role="status" className="text-sm">USAspending returned {result.warnings} query message(s). Inspect the original awards before drawing conclusions; coverage may be limited.</p>}
   <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">{[['Source rows',result.sourceRows],['Valid candidates',result.candidates.length],['Withheld',result.withheld],['Duplicates',result.duplicates],['Possible grant matches',matches.filter(r=>r.status==='name-match').length]].map(([label,value])=><div key={label}><dt>{label}</dt><dd className="font-semibold text-lg tabular-nums">{value}</dd></div>)}</dl>
   <label className="block text-sm">Search this page<input className={control} value={search} onChange={e=>{setSearch(e.target.value);setDisplayPage(1);}} placeholder="Recipient, description or award ID"/></label>
   {!rows.length&&<p role="status" className="text-sm">No candidates in this page and filter. This is not a finding of no federal spending.</p>}
   <ul className="divide-y divide-slate-200 dark:divide-slate-700">{rows.slice((current-1)*8,current*8).map(({candidate:c,status,account})=><li key={c.id} className="py-3 space-y-1 min-w-0 break-words">
    <p className="font-semibold text-sm">{c.recipient} · {c.city?c.city+', ':''}{c.state}</p><p className="text-xs">{c.kind==='grant'?'Federal assistance award':'Federal contract award'} · {c.awardNumber}</p>
    <p className="text-sm">Reported award amount: {c.awardAmount===null?'Not stated':money.format(c.awardAmount)}</p><p className="text-sm">Awarding agency: {c.awardingAgency??'Not stated'}</p>
    <p className="text-xs">Reported performance period: {c.startDate??'Not stated'} to {c.endDate??'Not stated'}</p>
    {c.description&&<details><summary className="text-sm cursor-pointer">Source description</summary><p className="text-sm break-words">{c.description}</p></details>}
    <p className="text-sm">{labels[status]}</p><a className="inline-flex items-center gap-1 underline text-sm" href={c.sourceUrl} target="_blank" rel="noreferrer">Open original USAspending award <ExternalLink size={12} aria-hidden="true"/></a>
    {account&&onOpen&&result.warnings===0&&<div><button type="button" className="workspace-button" onClick={()=>onOpen(account)}>Inspect possible grant recipient</button></div>}
   </li>)}</ul>
   <div className="flex flex-wrap gap-2 items-center"><button className="workspace-button" disabled={current===1} onClick={()=>setDisplayPage(current-1)}>Previous results</button><span className="text-xs">Page {current}</span><button className="workspace-button" disabled={current*8>=rows.length} onClick={()=>setDisplayPage(current+1)}>Next results</button></div>
   <div className="flex flex-wrap gap-2"><button className="workspace-button" disabled={result.query.page===1} onClick={()=>void run(result.query.page-1)}>Previous source page</button><button className="workspace-button" disabled={result.nextPage===null} onClick={()=>void run(result.nextPage??1)}>Next source page</button></div>
   {result.scopeCapped&&<p className="text-sm">500-row browsing limit reached; narrow the year or topic. This is not complete coverage.</p>}
  </>}
  <p className="text-xs">No automatic account assignment, shared evidence publication, device classification, open solicitation inference, or cross-source award total.</p>
 </section>;
}
