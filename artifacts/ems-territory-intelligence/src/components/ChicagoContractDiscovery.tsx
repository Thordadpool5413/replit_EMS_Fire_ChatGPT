import React,{useEffect,useRef,useState} from 'react';
import {Landmark,ExternalLink} from 'lucide-react';
import {MUNICIPAL_TOPICS,CHICAGO_DOCS,CHICAGO_PORTAL,chicagoAmountNote,type ChicagoQuery,type ChicagoPage,type MunicipalTopic} from '../services/chicagoDiscoveryContract';
import {loadChicagoDiscovery} from '../services/chicagoDiscovery';
import {productMentions} from '../services/nationalCompetitiveResearch';
const control='block w-full min-w-0 rounded border p-2 bg-transparent text-base';
const money=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
// These are official navigation links, not automated coverage or retrieved records.
export const MUNICIPAL_RESEARCH_PORTALS=[
 {name:'City of Miami, FL',kind:'Awarded contracts and supporting documents',url:'https://www.miami.gov/Business-Licenses/Doing-Business-with-the-City/Access-Current-City-Procurement-Contracts'},
 {name:'Miami-Dade County, FL',kind:'Contract search and public solicitation portal',url:'https://www.miamidadeclerk.gov/clerk/procurement-vendor-resources.page'},
 {name:'Brevard County, FL',kind:'Purchasing, active solicitations and contract search',url:'https://www.brevardfl.gov/CentralServices'},
 {name:'City of Austin, TX',kind:'Active and expiring contracts; commodity purchasing data',url:'https://www.austintexas.gov/financial-services/contracts'},
] as const;
export function ChicagoContractDiscovery(){
 const [open,setOpen]=useState(false),[topic,setTopic]=useState<MunicipalTopic>('cardiac'),[days,setDays]=useState<ChicagoQuery['days']>(365),[result,setResult]=useState<ChicagoPage>(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(1);
 const request=useRef<AbortController|undefined>(undefined);
 function reset(){request.current?.abort();request.current=undefined;setBusy(false);setResult(undefined);setError('');setPage(1);}
 useEffect(()=>{const offline=()=>{request.current?.abort();request.current=undefined;setBusy(false);setResult(undefined);setError('Offline. Run a new search when connected.');};window.addEventListener('offline',offline);return()=>{request.current?.abort();window.removeEventListener('offline',offline);};},[]);
 useEffect(()=>{if(!result)return;const t=window.setTimeout(()=>{setResult(undefined);setError('Source results expired. Run a fresh search.');},Math.max(0,Date.parse(result.fetchedAt)+16*60_000-Date.now()));return()=>window.clearTimeout(t);},[result]);
 async function run(sourcePage=1){
  reset();const controller=new AbortController();request.current=controller;setBusy(true);
  try{const data=await loadChicagoDiscovery({topic,days,page:sourcePage},controller.signal);if(request.current!==controller)return;if(!navigator.onLine)throw Error('Connection lost.');setResult(data);}
  catch(e){if(request.current===controller&&!controller.signal.aborted)setError(e instanceof Error?e.message:'Chicago discovery unavailable.');}
  finally{if(request.current===controller)setBusy(false);}
 }
 const records=(result?.records??[]).filter(r=>[r.description,r.contractNumber,r.revision,r.department,r.vendor].join(' ').toLowerCase().includes(search.trim().toLowerCase()));
 const current=Math.min(page,Math.max(1,Math.ceil(records.length/8)));
 return <section className="pi-surface p-4 min-w-0 space-y-3" aria-label="Municipal contract research" data-testid="chicago-contract-discovery">
  <div className="flex items-start gap-2"><Landmark size={20} className="shrink-0" aria-hidden="true"/><div className="min-w-0"><h2 className="font-semibold">Municipal contract research</h2><p className="text-sm">Chicago, IL · awarded contracts and modifications, not open solicitations.</p></div></div>
  <button type="button" className="workspace-button" aria-expanded={open} onClick={()=>{if(open)reset();setOpen(v=>!v);}}>{open?'Close contract research':'Open Chicago contract search'}</button>
  {open&&<>
   <div className="grid grid-cols-1 sm:grid-cols-2 gap-2"><label className="block text-sm">Equipment topic<select className={control} value={topic} onChange={e=>{reset();setTopic(e.target.value as MunicipalTopic);}}>{Object.entries(MUNICIPAL_TOPICS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label className="block text-sm">Approval date window<select className={control} value={days} onChange={e=>{reset();setDays(Number(e.target.value) as ChicagoQuery['days']);}}><option value={90}>Last 90 days</option><option value={365}>Last 365 days</option><option value={1095}>Last 1,095 days</option></select></label></div>
   <button type="button" className="workspace-button" disabled={busy} onClick={()=>void run()}>{busy?'Checking Chicago data…':'Search awarded contracts'}</button>
   <p className="text-xs">Description keywords only. Revisions may change scope or amount. Do not sum revisions, infer a renewal date, or treat department/vendor as verified end user or installed equipment.</p>
   {busy&&<p role="status" className="text-sm">Retrieving one bounded source page.</p>}{error&&<p role="alert" className="text-sm break-words">{error}</p>}
   {result&&<>
    <p className="text-xs">Approval dates {result.windowStart} to {result.windowEnd} · retrieved {new Date(result.fetchedAt).toLocaleString()} · source page {result.query.page}. <a className="underline" href={CHICAGO_DOCS} target="_blank" rel="noreferrer">Dataset documentation</a></p>
    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">{[['Rows read',result.sourceRows],['Usable revisions',result.records.length],['Withheld',result.withheld],['Duplicates',result.duplicates]].map(([label,value])=><div key={label}><dt>{label}</dt><dd className="font-semibold text-lg tabular-nums">{value}</dd></div>)}</dl>
    <label className="block text-sm">Search this page<input className={control} value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Contract, description, department or vendor"/></label>
    {!records.length&&<p role="status" className="text-sm">No matching records in this page and filter. Not proof of no purchasing activity.</p>}
    <ul className="divide-y divide-slate-200 dark:divide-slate-700">{records.slice((current-1)*8,current*8).map(r=>{const mentions=productMentions(r.description);return <li key={r.key} className="py-3 space-y-1 min-w-0 break-words"><p className="font-semibold text-sm">{r.description}</p><p className="text-sm">PO / contract {r.contractNumber} · revision {r.revision??'Not reported'}</p><p className="text-sm">Department: {r.department??'Not reported'} · vendor: {r.vendor??'Not reported'}</p><p className="text-xs">Approved {r.approvalDay} · {r.contractType??'Contract type not reported'} · specification {r.specification??'Not reported'}</p><p className="text-sm">Reported row amount: {r.amount===null?'Not reported':money.format(r.amount)}</p><p className="text-xs">{chicagoAmountNote(r)}</p><p className="text-xs">Reported dates: {r.startDay??'Not reported'} to {r.endDay??'Not reported'}. Verify amendments, cancellation and actual term; not a confirmed renewal deadline.</p>{mentions.length>0&&<p className="text-xs">Description mentions: {mentions.map(m=>m.brand+' ('+m.term+')').join('; ')}. Not installation evidence.</p>}<a className="inline-flex gap-1 items-center text-sm underline" href={r.sourceUrl} target="_blank" rel="noreferrer">Open source revision <ExternalLink size={12} aria-hidden="true"/></a></li>;})}</ul>
    <div className="flex flex-wrap gap-2 items-center"><button type="button" className="workspace-button" disabled={current===1} onClick={()=>setPage(current-1)}>Previous results</button><span className="text-xs">Page {current}</span><button type="button" className="workspace-button" disabled={current*8>=records.length} onClick={()=>setPage(current+1)}>Next results</button></div>
    <div className="flex flex-wrap gap-2"><button type="button" className="workspace-button" disabled={result.query.page===1} onClick={()=>void run(result.query.page-1)}>Previous source page</button><button type="button" className="workspace-button" disabled={result.nextPage===null} onClick={()=>void run(result.nextPage??1)}>Next source page</button></div>
    {result.scopeCapped&&<p className="text-xs">500-row limit reached; narrow the topic or approval window.</p>}
   </>}
   <a className="text-sm underline" href={CHICAGO_PORTAL} target="_blank" rel="noreferrer">Official Chicago contract and amendment search</a>
  </>}
  <details><summary className="text-sm font-medium cursor-pointer">Additional official municipal portals (manual research)</summary><p className="text-xs mt-2">These jurisdictions are not automated connectors. Use their official portals to research bids, amendments and signed contracts.</p><ul className="divide-y divide-slate-200 dark:divide-slate-700">{MUNICIPAL_RESEARCH_PORTALS.map(p=><li key={p.name} className="py-2 min-w-0 break-words"><a className="text-sm underline inline-flex gap-1 items-center" href={p.url} target="_blank" rel="noreferrer">{p.name} <ExternalLink size={12} aria-hidden="true"/></a><p className="text-xs">{p.kind}</p></li>)}</ul></details>
  <p className="text-xs">No provider assignment, evidence approval, automatic scheduled retrieval or database changes.</p>
 </section>;
}
