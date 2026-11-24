import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Search,ExternalLink} from 'lucide-react';
import type { Agency } from '../types';
import {buildDiscoveryMatches,DISCOVERY_STATES,loadDiscoveryPage,type DiscoveryPage,type DiscoveryQuery} from '../services/publicIntelligenceDiscovery';
const control='block w-full min-w-0 rounded border p-2 bg-transparent text-base';
const labels={ 'name-match':'Possible name match — verify identity',ambiguous:'Ambiguous identity — investigate',unmatched:'No exact loaded name match'} as const;
const dollars=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2});
export function PublicIntelligenceDiscovery({agencies,onOpen}:{agencies:Agency[];onOpen?:(a:Agency)=>void}){
 const year=new Date().getUTCFullYear();
 const [state,setState]=useState('');
 const [fromYear,setFromYear]=useState(year-2);
 const [result,setResult]=useState<DiscoveryPage>();
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [search,setSearch]=useState('');
 const [filter,setFilter]=useState('all');
 const [page,setPage]=useState(1);
 const request=useRef<AbortController|undefined>(undefined);
 useEffect(()=>()=>request.current?.abort(),[]);
 useEffect(()=>{
  if(!result)return;
  const clear=()=>{setResult(undefined);setError('Discovery results expired or connectivity changed. Run a new check.');};
  const timeout=window.setTimeout(clear,Math.max(0,Date.parse(result.fetchedAt)+16*60_000-Date.now()));
  window.addEventListener('offline',clear);
  return()=>{window.clearTimeout(timeout);window.removeEventListener('offline',clear);};
 },[result]);
 function reset(){
  request.current?.abort();request.current=undefined;setResult(undefined);setError('');setBusy(false);setPage(1);
 }
 async function run(offset=0){
  if(!state)return;
  request.current?.abort();const controller=new AbortController();request.current=controller;
  setBusy(true);setResult(undefined);setError('');setPage(1);
  const q:DiscoveryQuery={state,fromYear,offset};
  try{
   const next=await loadDiscoveryPage(q,controller.signal);
   if(request.current!==controller)return;
   if(!navigator.onLine)throw Error('Connection lost. Run a new discovery check when online.');
   setResult(next);
  }catch(e){if(request.current===controller&&!controller.signal.aborted)setError(e instanceof Error?e.message:'Discovery failed.');}
  finally{if(request.current===controller)setBusy(false);}
 }
 const matches=useMemo(()=>buildDiscoveryMatches(agencies,result?.candidates??[]),[agencies,result]);
 const rows=matches.filter(r=>(filter==='all'||r.status===filter)&&[r.candidate.recipient,r.candidate.awardNumber,r.candidate.program].join(' ').toLowerCase().includes(search.trim().toLowerCase()));
 const current=Math.min(page,Math.max(1,Math.ceil(rows.length/8)));
 return <section className="pi-surface p-4 min-w-0 space-y-3" aria-label="Public intelligence discovery" data-testid="public-intelligence-discovery">
  <div className="flex items-start gap-2"><Search size={20} aria-hidden="true" className="shrink-0"/><div className="min-w-0"><h2 className="font-semibold">Public intelligence discovery</h2><p className="text-sm">Search official public records for research leads. First connected source: OpenFEMA Assistance to Firefighters Grants.</p></div></div>
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2"><label className="block text-sm">Recipient state<select className={control} value={state} onChange={e=>{reset();setState(e.target.value);}}><option value="">Choose state</option>{DISCOVERY_STATES.map(s=><option key={s}>{s}</option>)}</select></label><label className="block text-sm">Fiscal year from<select className={control} value={fromYear} onChange={e=>{reset();setFromYear(Number(e.target.value));}}>{Array.from({length:year-2009},(_,i)=>year-i).map(y=><option key={y} value={y}>{y}</option>)}</select></label></div>
  <button className="workspace-button" type="button" disabled={!state||busy} onClick={()=>void run()}>{busy?'Checking public source…':'Discover grant records'}</button>
  {busy&&<p role="status" className="text-sm">Retrieving one bounded page from the public source.</p>}
  {error&&<p role="alert" className="text-sm break-words">{error}</p>}
  <p className="text-xs">A grant award is not remaining funding, a purchasing deadline or proof of installed equipment. Fiscal year is not award date. No result is automatically published or assigned to an agency.</p>
  {result&&<>
   <p className="text-xs">Source retrieved {new Date(result.fetchedAt).toLocaleString()} · source may be annual and cached for up to 15 minutes. Page offset {result.query.offset}. <a className="underline" href={result.documentationUrl} target="_blank" rel="noreferrer">Dataset documentation</a></p>
   <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">{[['Source rows',result.sourceRows],['Valid candidates',result.candidates.length],['Possible name matches',matches.filter(r=>r.status==='name-match').length],['Ambiguous',matches.filter(r=>r.status==='ambiguous').length],['Withheld',result.withheld],['Exact duplicates',result.duplicates]].map(([label,n])=><div key={label}><dt>{label}</dt><dd className="font-semibold text-lg tabular-nums">{n}</dd></div>)}</dl>
   <div className="grid grid-cols-1 sm:grid-cols-2 gap-2"><label className="block text-sm">Search this page<input className={control} value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Recipient or award number"/></label><label className="block text-sm">Identity review<select className={control} value={filter} onChange={e=>{setFilter(e.target.value);setPage(1);}}><option value="all">All candidates</option><option value="name-match">Possible name match</option><option value="ambiguous">Ambiguous</option><option value="unmatched">Unmatched</option></select></label></div>
   {!rows.length&&<p role="status" className="text-sm">No candidates in this page and filter. This does not establish that the state or agency has no awards.</p>}
   <ul className="divide-y divide-slate-200 dark:divide-slate-700">{rows.slice((current-1)*8,current*8).map(({candidate:c,account,status})=><li key={c.id} className="py-3 space-y-1 min-w-0 break-words">
    <p className="font-semibold text-sm">{c.recipient} · {c.state}</p><p className="text-sm">{c.program} · FY {c.fiscalYear}</p><p className="text-sm">Reported award amount: {c.awardAmount===null?'Not stated':dollars.format(c.awardAmount)}</p>
    <p className="text-xs">Award {c.awardNumber} · source record {c.id}</p><p className="text-sm">{labels[status]}</p><p className="text-xs">Exact award date not supplied. Obtain a dated award document and verify agency identity before adding typed evidence.</p>
    <a className="inline-flex gap-1 items-center text-sm underline" href={c.sourceUrl} target="_blank" rel="noreferrer">Open source page <ExternalLink size={12} aria-hidden="true"/></a>
    {account&&onOpen&&<div><button type="button" className="workspace-button" onClick={()=>onOpen(account)}>Inspect possible account match</button></div>}
   </li>)}</ul>
   <div className="flex flex-wrap items-center gap-2"><button className="workspace-button" disabled={current===1} onClick={()=>setPage(current-1)}>Previous results</button><span className="text-xs">Page {current}</span><button className="workspace-button" disabled={current*8>=rows.length} onClick={()=>setPage(current+1)}>Next results</button></div>
   <div className="flex flex-wrap gap-2"><button className="workspace-button" disabled={busy||!result.query.offset} onClick={()=>void run(Math.max(0,result.query.offset-50))}>Previous source page</button><button className="workspace-button" disabled={busy||result.nextOffset===null} onClick={()=>void run(result.nextOffset??0)}>Next source page</button></div>
   {result.scopeCapped&&<p className="text-sm">The 1,000-row browsing limit was reached. Choose a narrower fiscal-year range; this is not complete coverage.</p>}
  </>}
  <p className="text-xs">Planned source adapters: federal spending, municipal procurement, budgets, contracts and equipment inventories. Not connected by this release.</p>
 </section>;
}
