import React,{useEffect,useMemo,useRef,useState} from 'react';
import {Globe,ExternalLink} from 'lucide-react';
import type {Agency} from '../types';
import {NATIONAL_STATES,NATIONAL_TOPICS,RESEARCH_SOURCES,COMMERCIAL_RESEARCH_LABELS,commercialResearchStatus,loadedResearchCoverage,assessNationalCandidates,type StateResearch,type NationalTopic} from '../services/nationalCompetitiveResearch';
import {NationalInventoryCoverage} from './NationalInventoryCoverage';
import {loadNationalResearch} from '../services/loadNationalResearch';
const control='block w-full min-w-0 rounded border p-2 bg-transparent text-base';
const money=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
const roleLabels={'grant-recipient':'Grant recipient','supplier':'Contract recipient / supplier','notice-issuer':'Notice issuer (end user unconfirmed)','contracting-department':'Contracting department (end user unconfirmed)'} as const;
export function NationalCompetitiveResearch({agencies,onOpen}:{agencies:Agency[];onOpen?:(a:Agency)=>void}){
 const year=new Date().getUTCFullYear();
 const [open,setOpen]=useState(false),[state,setState]=useState(''),[topic,setTopic]=useState<NationalTopic>('defibrillator'),[fromYear,setFromYear]=useState(year-2),[result,setResult]=useState<StateResearch>(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[filter,setFilter]=useState('all'),[search,setSearch]=useState(''),[page,setPage]=useState(1);
 const request=useRef<AbortController|undefined>(undefined);
 const coverage=useMemo(()=>open?loadedResearchCoverage(agencies):undefined,[agencies,open]);
 const counts=coverage?.states.get(state);
 const assessment=useMemo(()=>result?assessNationalCandidates(agencies,result):undefined,[agencies,result]);
 function clear(){request.current?.abort();request.current=undefined;setBusy(false);setResult(undefined);setError('');setPage(1);}
 useEffect(()=>{
  const offline=()=>{request.current?.abort();request.current=undefined;setBusy(false);setResult(undefined);setError('Offline. Run a new source check when connected.');};
  window.addEventListener('offline',offline);return()=>{request.current?.abort();window.removeEventListener('offline',offline);};
 },[]);
 useEffect(()=>{
  if(!result)return;
  const earliest=Math.min(Date.parse(result.checkedAt),...result.scopes.flatMap(s=>s.fetchedAt?[Date.parse(s.fetchedAt)]:[]));
  const timer=window.setTimeout(()=>{setResult(undefined);setError('Source checks expired. Run research again.');},Math.max(0,earliest+16*60_000-Date.now()));
  return()=>window.clearTimeout(timer);
 },[result]);
 async function run(){
  if(!state)return;
  clear();const controller=new AbortController();request.current=controller;setBusy(true);
  try{const data=await loadNationalResearch(state,topic,fromYear,controller.signal);if(request.current!==controller)return;if(!navigator.onLine)throw Error('Connection lost.');setResult(data);}
  catch(e){if(request.current===controller&&!controller.signal.aborted)setError(e instanceof Error?e.message:'State research unavailable.');}
  finally{if(request.current===controller)setBusy(false);}
 }
 const rows=(assessment?.rows??[]).filter(r=>(filter==='all'||filter==='brand'&&r.document.length>0||filter==='match'&&r.account||filter==='supplier'&&r.candidate.role==='supplier'||filter==='issuer'&&r.candidate.role==='notice-issuer'||filter==='contracts'&&r.candidate.source==='chicago'||filter==='solicitations'&&['solicitation','deadline-today'].includes(commercialResearchStatus(r.candidate))||filter==='awards'&&['award','intent','supplier'].includes(commercialResearchStatus(r.candidate)))&&[r.candidate.organization,r.candidate.title,r.candidate.description,r.candidate.number,r.candidate.vendor].join(' ').toLowerCase().includes(search.trim().toLowerCase()));
 const current=Math.min(page,Math.max(1,Math.ceil(rows.length/8)));
 return <section className="pi-surface p-4 min-w-0 space-y-3" aria-label="National competitive research" data-testid="national-competitive-research">
  <div className="flex items-start gap-2"><Globe size={20} className="shrink-0" aria-hidden="true"/><div className="min-w-0"><h2 className="font-semibold">National competitive research</h2><p className="text-sm">One state, one research topic, multiple public sources. Brand mentions are not installed equipment.</p></div></div>
  <button type="button" className="workspace-button" aria-expanded={open} onClick={()=>{if(open)clear();setOpen(!open);}}>{open?'Close state research':'Open state research'}</button>
  {open&&<>
   <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
    <label className="block text-sm">State<select className={control} value={state} onChange={e=>{clear();setState(e.target.value);}}><option value="">Select state</option>{NATIONAL_STATES.map(s=><option key={s}>{s}</option>)}</select></label>
    <label className="block text-sm">Research topic<select className={control} value={topic} onChange={e=>{clear();setTopic(e.target.value as NationalTopic);}}>{Object.entries(NATIONAL_TOPICS).map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>
    <label className="block text-sm">Federal activity since year<select className={control} value={fromYear} onChange={e=>{clear();setFromYear(Number(e.target.value));}}>{Array.from({length:year-2009},(_,i)=>year-i).map(y=><option key={y} value={y}>{y}</option>)}</select></label>
   </div>
   {counts&&<details><summary className="text-sm font-medium cursor-pointer">Loaded account evidence coverage</summary><p className="text-xs">{counts.loaded.toLocaleString()} loaded rows · {counts.eligible.toLocaleString()} unique eligible registry identities · {counts.excluded.toLocaleString()} excluded or ambiguous rows. Multiple registry identities may represent the same provider. Not a provider census.</p><dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">{Object.entries(counts.documented).map(([family,n])=><div key={family}><dt>{family}</dt><dd className="font-semibold tabular-nums">{n}</dd></div>)}</dl><p className="text-xs">Counts have at least one non-stale, structurally valid local document observation in the product category. Independent shared review is not established here; categories overlap and absence is not proof of no equipment.</p></details>}
   {state&&<details><summary className="text-sm font-medium min-h-11">Review equipment research gaps by category</summary><NationalInventoryCoverage key={state} agencies={agencies} state={state} onOpen={onOpen}/></details>}
   <button type="button" className="workspace-button" disabled={!state||busy} onClick={()=>void run()}>{busy?'Checking public sources…':'Research selected state'}</button>
   <p className="text-xs">First page from OpenFEMA (50), two USAspending searches (25 each), NYC City Record (25, NY only, 90-day window), and Chicago purchase orders (25, IL only, 365-day window). Grant searches are not equipment-specific. Federal contract geography is supplier location; NYC and Chicago geography is the publishing jurisdiction, not provider coverage. SAM.gov requires its separate authorized search. No private account data is sent.</p>
   {busy&&<p role="status" className="text-sm">Checking source availability and candidates.</p>}
   {error&&<p role="alert" className="text-sm break-words">{error}</p>}
   {result&&assessment&&<>
    <p className="text-xs">Check started {new Date(result.checkedAt).toLocaleString()} · limited samples, not complete purchasing activity.</p>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{result.scopes.map(s=><div className="border rounded-md p-2 min-w-0" key={s.source}><p className="text-sm font-medium">{RESEARCH_SOURCES[s.source]}</p><p className="text-xs">{s.status==='not-covered'?'No connector for selected jurisdiction':s.status==='unavailable'?'Source unavailable':s.status==='partial'?'Partial or warning-bearing sample':'Page retrieved'} · {s.candidates.length} usable candidates{s.hasMore?' · more pages available':''}</p>{s.fetchedAt&&<p className="text-xs">{s.sourceRows} source rows · {s.withheld} withheld · {s.duplicates} duplicates · {new Date(s.fetchedAt).toLocaleString()}</p>}</div>)}</div>
    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">{[['Research records',assessment.rows.length],['Possible grant matches',assessment.rows.filter(r=>r.account).length],['Product / brand mentions',assessment.rows.filter(r=>r.document.length).length],['Possible grant overlaps',assessment.rows.filter(r=>r.overlap).length]].map(([label,value])=><div key={label}><dt>{label}</dt><dd className="text-lg font-semibold tabular-nums">{value}</dd></div>)}</dl>
    {assessment.conflicts>0&&<p className="text-sm">{assessment.conflicts} conflicting native identities withheld.</p>}
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2"><label className="block text-sm">Filter<select className={control} value={filter} onChange={e=>{setFilter(e.target.value);setPage(1);}}><option value="all">All research records</option><option value="brand">Product / brand mentioned</option><option value="match">Possible grant recipient match</option><option value="supplier">Federal supplier awards</option><option value="issuer">Municipal notices</option><option value="contracts">Chicago purchase orders / revisions</option><option value="solicitations">Solicitations to verify</option><option value="awards">Award and intent notices / supplier records</option></select></label><label className="block text-sm">Search records<input className={control} value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Organization, title, award number or vendor"/></label></div>
    {!rows.length&&<p role="status" className="text-sm">No matching records in the returned samples. This does not establish that the state has no activity.</p>}
    <ul className="divide-y divide-slate-200 dark:divide-slate-700">{rows.slice((current-1)*8,current*8).map(r=>{const c=r.candidate;return <li key={c.key} className="py-3 space-y-1 min-w-0 break-words">
     <p className="font-semibold text-sm">{c.organization} · {c.state}</p><p className="text-sm">{c.title}</p><p className="text-xs">{roleLabels[c.role]} · {c.sourceType} · {c.number??c.nativeId}{c.source==='chicago'?' · revision '+(c.contractRevision??'Not stated'):''}</p><p className="text-xs font-medium">{COMMERCIAL_RESEARCH_LABELS[commercialResearchStatus(c)]}</p>
     {c.fiscalYear!==null&&<p className="text-xs">Fiscal year {c.fiscalYear} (not award date)</p>}{c.publishedDay&&<p className="text-xs">Published {c.publishedDay}</p>}{(c.periodStart||c.periodEnd)&&<p className="text-xs">Reported performance dates {c.periodStart??'Not stated'} to {c.periodEnd??'Not stated'}</p>}{c.deadlineLocal&&<p className="text-xs">Source local deadline {c.deadlineLocal.replace('T',' ')} · verify status</p>}
     <p className="text-sm">Reported amount: {c.amount===null?'Not stated':money.format(c.amount)}</p>{c.amountNote&&<p className="text-xs">{c.amountNote}</p>}
     {r.document.length>0&&<p className="text-sm">Mentioned in source text: {r.document.map(m=>m.brand+' ('+m.term+')').join('; ')}. Not verified installation or award winner.</p>}
     {c.vendor&&<p className="text-xs">Reported vendor: {c.vendor}{r.vendor.length?' · brand text: '+r.vendor.map(m=>m.term).join(', '):''}</p>}
     {c.description&&<details><summary className="text-xs cursor-pointer">Original source description</summary><p className="text-sm break-words">{c.description}</p></details>}
     {r.overlap&&<p className="text-xs font-medium">Possible same grant reported by multiple sources; retain both, do not sum amounts.</p>}
     {c.role==='grant-recipient'&&<p className="text-xs">{r.account?'Possible exact name / state match; verify against source identity':r.identityStatus==='ambiguous'?'Ambiguous identity; research required':'No exact eligible loaded match'}</p>}
     {r.account&&onOpen&&<button type="button" className="workspace-button" onClick={()=>onOpen(r.account!)}>Inspect possible provider match</button>}
     <div><a className="inline-flex gap-1 items-center text-sm underline" href={c.sourceUrl} target="_blank" rel="noreferrer">Open original record <ExternalLink size={12} aria-hidden="true"/></a></div>
    </li>;})}</ul>
    <div className="flex flex-wrap items-center gap-2"><button type="button" className="workspace-button" disabled={current===1} onClick={()=>setPage(current-1)}>Previous</button><span className="text-xs">Page {current}</span><button type="button" className="workspace-button" disabled={current*8>=rows.length} onClick={()=>setPage(current+1)}>Next</button></div>
   </>}
   <p className="text-xs">Read-only research. No automated provider assignments, evidence approvals, market-share calculation, contract renewal predictions or equipment-map changes.</p>
  </>}
 </section>;
}
