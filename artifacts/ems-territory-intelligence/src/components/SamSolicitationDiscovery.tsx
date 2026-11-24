import React,{useEffect,useRef,useState} from 'react';
import {ExternalLink,Search} from 'lucide-react';
import {SAM_STATES,SAM_TOPICS,SAM_TYPES,SAM_DOCS,SAM_PORTAL,samDeadlineStatus,type SamQuery,type SamPage,type SamTopic,type SamType} from '../services/samDiscoveryContract';
import {loadSamDiscovery} from '../services/samSolicitationDiscovery';
const control='block w-full min-w-0 rounded border p-2 bg-transparent text-base';
export function SamSolicitationDiscovery(){
 const [state,setState]=useState('all'),[topic,setTopic]=useState<SamTopic>('defibrillator'),[noticeType,setNoticeType]=useState<SamType>('o'),[days,setDays]=useState<SamQuery['days']>(90);
 const [result,setResult]=useState<SamPage>(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[search,setSearch]=useState(''),[displayPage,setDisplayPage]=useState(1);
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
 async function run(offset=0){
  reset();const controller=new AbortController();request.current=controller;setBusy(true);
  const q:SamQuery={state,topic,noticeType,days,offset};
  try{const data=await loadSamDiscovery(q,controller.signal);if(request.current!==controller)return;if(!navigator.onLine)throw Error('Connection lost.');setResult(data);}
  catch(e){if(request.current===controller&&!controller.signal.aborted)setError(e instanceof Error?e.message:'SAM.gov discovery failed.');}
  finally{if(request.current===controller)setBusy(false);}
 }
 const rows=(result?.notices??[]).filter(n=>[n.title,n.organization,n.solicitationNumber,n.performanceState,n.setAside].join(' ').toLowerCase().includes(search.trim().toLowerCase()));
 const page=Math.min(displayPage,Math.max(1,Math.ceil(rows.length/8)));
 return <section className="pi-surface p-4 min-w-0 space-y-3" aria-label="Federal solicitation discovery" data-testid="sam-solicitation-discovery">
  <div className="flex items-start gap-2"><Search size={20} className="shrink-0" aria-hidden="true"/><div className="min-w-0"><h2 className="font-semibold">Federal solicitation discovery</h2><p className="text-sm">Find purchasing notices from SAM.gov. Administrator setup and an authorized gateway are required for live search.</p></div></div>
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
   <label className="block text-sm">Place of performance<select className={control} value={state} onChange={e=>{reset();setState(e.target.value);}}><option value="all">Any reported location</option>{SAM_STATES.map(s=><option key={s}>{s}</option>)}</select></label>
   <label className="block text-sm">Title search<select className={control} value={topic} onChange={e=>{reset();setTopic(e.target.value as SamTopic);}}>{Object.entries(SAM_TOPICS).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
   <label className="block text-sm">Notice type<select className={control} value={noticeType} onChange={e=>{reset();setNoticeType(e.target.value as SamType);}}>{Object.entries(SAM_TYPES).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
   <label className="block text-sm">Posted within<select className={control} value={days} onChange={e=>{reset();setDays(Number(e.target.value) as SamQuery['days']);}}>{[30,90,365].map(d=><option key={d} value={d}>{d} days</option>)}</select></label>
  </div>
  <button type="button" className="workspace-button" disabled={busy} onClick={()=>void run()}>{busy?'Checking SAM.gov…':'Discover federal notices'}</button>
  <p className="text-xs">Title matches only. Presolicitation and sources sought are market research or early planning, not open solicitations. Place of performance is not a verified provider location. Verify current status, amendments, eligibility and specifications on SAM.gov.</p>
  {busy&&<p role="status" className="text-sm">Retrieving one bounded notice page.</p>}
  {error&&<p role="alert" className="text-sm break-words">{error}</p>}
  {result&&<>
   <p className="text-xs">Posted {result.windowStart}–{result.windowEnd} · retrieved {new Date(result.fetchedAt).toLocaleString()} · source page {result.query.offset+1}. <a className="underline" href={SAM_DOCS} target="_blank" rel="noreferrer">API documentation</a></p>
   <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">{[['Reported query total',result.totalReported],['Page candidates',result.notices.length],['Withheld',result.withheld],['Exact duplicates',result.duplicates]].map(([label,value])=><div key={label}><dt>{label}</dt><dd className="font-semibold text-lg tabular-nums">{value}</dd></div>)}</dl>
   <label className="block text-sm">Search this page<input className={control} value={search} onChange={e=>{setSearch(e.target.value);setDisplayPage(1);}} placeholder="Title, organization or solicitation number"/></label>
   {!rows.length&&<p role="status" className="text-sm">No candidates on this page and filter. This is not proof of no purchasing activity.</p>}
   <ul className="divide-y divide-slate-200 dark:divide-slate-700">{rows.slice((page-1)*8,page*8).map(n=><li key={n.id} className="py-3 space-y-1 min-w-0 break-words">
    <p className="font-semibold text-sm">{n.title}</p><p className="text-sm">{SAM_TYPES[n.noticeType]} · {n.solicitationNumber}</p>
    <p className="text-sm">Publishing organization: {n.organization??'Not stated'}</p>
    <p className="text-xs">Posted {n.postedDate} · Performance location {n.performanceState??n.performanceCountry??'Not stated'} · Active reported {n.active??'Not stated'}</p>
    <p className="text-sm">{samDeadlineStatus(n)}{n.deadline?' · '+n.deadline:''}</p>
    <p className="text-xs">Set-aside: {n.setAside??'Not stated'} · NAICS {n.naics??'Not stated'} · Classification {n.classification??'Not stated'}</p>
    <a className="inline-flex gap-1 items-center text-sm underline" href={n.sourceUrl} target="_blank" rel="noreferrer">Open notice on SAM.gov <ExternalLink size={12} aria-hidden="true"/></a>
    <p className="text-xs">If the notice link is unavailable, search the official portal by solicitation number. Confirm amendments and source status before action.</p>
   </li>)}</ul>
   <div className="flex flex-wrap gap-2 items-center"><button type="button" className="workspace-button" disabled={page===1} onClick={()=>setDisplayPage(page-1)}>Previous results</button><span className="text-xs">Page {page}</span><button type="button" className="workspace-button" disabled={page*8>=rows.length} onClick={()=>setDisplayPage(page+1)}>Next results</button></div>
   <div className="flex flex-wrap gap-2"><button type="button" className="workspace-button" disabled={result.query.offset===0} onClick={()=>void run(result.query.offset-1)}>Previous source page</button><button type="button" className="workspace-button" disabled={result.nextOffset===null} onClick={()=>void run(result.nextOffset??0)}>Next source page</button></div>
   {result.scopeCapped&&<p className="text-sm">200-row browsing cap reached. Narrow the publication window or search.</p>}
  </>}
  <p className="text-xs"><a className="underline" href={SAM_PORTAL} target="_blank" rel="noreferrer">Official SAM.gov opportunities portal</a> · No credentials, contact details, descriptions, attachments, inferred equipment, account assignments or pipeline writes.</p>
 </section>;
}
