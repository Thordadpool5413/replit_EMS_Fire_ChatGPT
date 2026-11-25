import React,{useEffect,useRef,useState} from 'react';
import {ExternalLink,Landmark} from 'lucide-react';
import {MUNICIPAL_SOURCE,MUNICIPAL_TOPICS,MUNICIPAL_DOCS,MUNICIPAL_PORTAL,municipalDeadline,type MunicipalQuery,type MunicipalPage,type MunicipalTopic,type MunicipalNoticeKind} from '../services/municipalDiscoveryContract';
import {loadMunicipalDiscovery} from '../services/municipalSpendingDiscovery';
import {LocalProcurementResearch} from './LocalProcurementResearch';
const control='block w-full min-w-0 rounded border p-2 bg-transparent text-base';
const kinds:Record<MunicipalNoticeKind,string>={solicitation:'Published solicitation',award:'Published award', 'intent-to-award':'Intent to award (not final)',other:'Other procurement notice'};
const deadlines={'not-applicable':'Not a solicitation','not-stated':'Deadline not supplied',elapsed:'Published deadline date passed',today:'Published deadline today — verify time', 'future-unconfirmed':'Future published deadline — status unconfirmed'};
const currency=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
export function MunicipalSpendingDiscovery(){
 const [topic,setTopic]=useState<MunicipalTopic>('cardiac'),[days,setDays]=useState<MunicipalQuery['days']>(90);
 const [result,setResult]=useState<MunicipalPage>(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[filter,setFilter]=useState<'all'|MunicipalNoticeKind>('all'),[search,setSearch]=useState(''),[displayPage,setDisplayPage]=useState(1);
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
  reset();const controller=new AbortController();request.current=controller;setBusy(true);
  const q:MunicipalQuery={source:MUNICIPAL_SOURCE,topic,days,page};
  try{const data=await loadMunicipalDiscovery(q,controller.signal);if(request.current!==controller)return;if(!navigator.onLine)throw Error('Connection lost.');setResult(data);}
  catch(e){if(request.current===controller&&!controller.signal.aborted)setError(e instanceof Error?e.message:'Municipal discovery failed.');}
  finally{if(request.current===controller)setBusy(false);}
 }
 const rows=(result?.notices??[]).filter(n=>(filter==='all'||n.kind===filter)&&[n.title,n.issuingAgency,n.pin,n.vendor].join(' ').toLowerCase().includes(search.trim().toLowerCase()));
 const current=Math.min(displayPage,Math.max(1,Math.ceil(rows.length/8)));
 return <section className="pi-surface p-4 min-w-0 space-y-3" aria-label="Municipal procurement discovery" data-testid="municipal-procurement-discovery">
  <div className="flex items-start gap-2"><Landmark size={20} className="shrink-0" aria-hidden="true"/><div className="min-w-0"><h2 className="font-semibold">Municipal procurement discovery</h2><p className="text-sm">Pilot jurisdiction: New York City, NY · official City Record procurement notices.</p></div></div>
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
   <label className="block text-sm">Equipment topic<select className={control} value={topic} onChange={e=>{reset();setTopic(e.target.value as MunicipalTopic);}}>{Object.entries(MUNICIPAL_TOPICS).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
   <label className="block text-sm">Publication window<select className={control} value={days} onChange={e=>{reset();setDays(Number(e.target.value) as MunicipalQuery['days']);}}>{[30,90,365].map(d=><option key={d} value={d}>Last {d} days</option>)}</select></label>
  </div>
  <button type="button" className="workspace-button" disabled={busy} onClick={()=>void run()}>{busy?'Checking City Record…':'Discover municipal notices'}</button>
  <p className="text-xs">Title keyword matches only. An issuing agency can purchase for another department. A notice, future due date or reported vendor does not establish an active bid, signed contract or installed fleet. Verify amendments in the official portal.</p>
  {busy&&<p role="status" className="text-sm">Retrieving one bounded public notice page.</p>}
  {error&&<p role="alert" className="text-sm break-words">{error}</p>}
  {result&&<>
   <p className="text-xs">Published {result.windowStart} to {result.windowEnd} (New York local calendar) · source retrieved {new Date(result.fetchedAt).toLocaleString()} · source page {result.query.page}. <a className="underline" href={MUNICIPAL_DOCS} target="_blank" rel="noreferrer">Dataset documentation</a></p>
   <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">{[['Notices read',result.sourceRows],['Candidates',result.notices.length],['Withheld',result.withheld],['Exact duplicates',result.duplicates]].map(([label,value])=><div key={label}><dt>{label}</dt><dd className="font-semibold text-lg tabular-nums">{value}</dd></div>)}</dl>
   <div className="grid grid-cols-1 sm:grid-cols-2 gap-2"><label className="block text-sm">Notice type<select className={control} value={filter} onChange={e=>{setFilter(e.target.value as typeof filter);setDisplayPage(1);}}><option value="all">All notices on this page</option>{Object.entries(kinds).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label><label className="block text-sm">Search this page<input className={control} value={search} placeholder="Agency, title, PIN or vendor" onChange={e=>{setSearch(e.target.value);setDisplayPage(1);}}/></label></div>
   {!rows.length&&<p role="status" className="text-sm">No matches on this source page and filter. This does not establish absence of procurement activity.</p>}
   <ul className="divide-y divide-slate-200 dark:divide-slate-700">{rows.slice((current-1)*8,current*8).map(n=><li key={n.id} className="py-3 space-y-1 min-w-0 break-words">
    <p className="font-semibold text-sm">{n.title}</p><p className="text-sm">{kinds[n.kind]} · {n.noticeType}</p>
    <p className="text-sm">Issuing agency: {n.issuingAgency}</p><p className="text-xs">Published {n.publishedDate} · Notice {n.id} · PIN {n.pin??'Not stated'}</p>
    {n.kind==='solicitation'&&<p className="text-sm">{deadlines[municipalDeadline(n)]}{n.dueLocal?' · '+n.dueLocal.replace('T',' ')+' (source local time)':''}</p>}
    <p className="text-sm">Reported contract amount: {n.contractAmount===null?'Not stated':currency.format(n.contractAmount)}</p>
    {n.vendor&&<p className="text-sm">Reported vendor (role / award status unverified): {n.vendor}</p>}
    {n.selectionMethod&&<p className="text-xs">Reported selection method: {n.selectionMethod}</p>}
    <a className="inline-flex gap-1 items-center text-sm underline" href={n.sourceUrl} target="_blank" rel="noreferrer">Original source record <ExternalLink size={12} aria-hidden="true"/></a>
   </li>)}</ul>
   <div className="flex flex-wrap items-center gap-2"><button type="button" className="workspace-button" disabled={current===1} onClick={()=>setDisplayPage(current-1)}>Previous results</button><span className="text-xs">Page {current}</span><button type="button" className="workspace-button" disabled={current*8>=rows.length} onClick={()=>setDisplayPage(current+1)}>Next results</button></div>
   <div className="flex flex-wrap gap-2"><button type="button" className="workspace-button" disabled={result.query.page===1} onClick={()=>void run(result.query.page-1)}>Previous source page</button><button type="button" className="workspace-button" disabled={result.nextPage===null} onClick={()=>void run(result.nextPage??1)}>Next source page</button></div>
   {result.scopeCapped&&<p className="text-sm">500-row browsing cap reached. Narrow the publication window or topic.</p>}
  </>}
  <p className="text-xs"><a className="underline" href={MUNICIPAL_PORTAL} target="_blank" rel="noreferrer">Official City Record portal</a> · No automatic account association, opportunity approval, alerts or database writes. Other municipal jurisdictions, budgets and contracts require separate connectors.</p>
  <LocalProcurementResearch/>
 </section>;
}
