import React,{useEffect,useRef,useState} from 'react';
import {MUNICIPAL_TOPICS,type MunicipalTopic} from '../services/municipalDiscoveryContract';
import {STATE_PORTALS,sampleLocalProcurement,reconcileLocalProcurement,type LocalSample,type LocalSource} from '../services/localProcurementResearch';
const control='block w-full min-w-0 rounded border p-2 bg-transparent text-base';
const labels:Record<LocalSource,string>={'nyc-city-record':'New York City notices','chicago-contracts':'Chicago contract revisions'};
export function LocalProcurementResearch(){
 const [open,setOpen]=useState(false),[state,setState]=useState(''),[topic,setTopic]=useState<MunicipalTopic>('cardiac'),[days,setDays]=useState<90|365>(90),[sources,setSources]=useState<LocalSource[]>(['nyc-city-record','chicago-contracts']),[sample,setSample]=useState<LocalSample>(),[busy,setBusy]=useState(false),[status,setStatus]=useState(''),[filter,setFilter]=useState('all'),[page,setPage]=useState(1);
 const request=useRef<AbortController|undefined>(undefined);
 function clear(){request.current?.abort();request.current=undefined;setSample(undefined);setBusy(false);setStatus('');setPage(1);}
 useEffect(()=>{const offline=()=>{clear();setStatus('Offline. Refresh after reconnecting.');};window.addEventListener('offline',offline);return()=>{request.current?.abort();window.removeEventListener('offline',offline);};},[]);
 useEffect(()=>{if(!sample)return;const t=window.setTimeout(()=>{setSample(undefined);setStatus('Sample expired. Refresh sources.');},Math.max(0,sample.started+300000-Date.now()));return()=>window.clearTimeout(t);},[sample]);
 async function run(){if(busy||!sources.length)return;clear();const controller=new AbortController();request.current=controller;setBusy(true);
  try{const data=await sampleLocalProcurement(topic,days,sources,controller.signal,m=>{if(request.current===controller)setStatus(m);});if(request.current!==controller)return;if(!navigator.onLine)throw Error('Connection lost.');setSample(data);setStatus('');}
  catch(e){if(request.current===controller&&!controller.signal.aborted)setStatus(e instanceof Error?e.message:'Source unavailable.');}
  finally{if(request.current===controller){request.current=undefined;setBusy(false);}}
 }
 const result=sample?reconcileLocalProcurement(sample):undefined,rows=result?.rows.filter(r=>filter==='all'||r.source===filter)??[],current=Math.min(page,Math.max(1,Math.ceil(rows.length/10)));
 return <section className="border rounded p-3 space-y-2 min-w-0" aria-label="State and local procurement research">
  <button type="button" className="workspace-button min-h-11" aria-expanded={open} onClick={()=>{if(open)clear();setOpen(!open);}}>{open?'Close state and local research':'Open state and local procurement research'}</button>
  {open&&<div className="space-y-3 text-sm">
   <h3 className="font-semibold">Official state procurement portals</h3><p>Navigation only. These links do not imply an automated feed, full state coverage or retrieved awards.</p>
   <label>State<select className={control} value={state} onChange={e=>setState(e.target.value)}><option value="">Choose state</option>{[...new Set(STATE_PORTALS.map(p=>p.state))].sort().map(s=><option key={s}>{s}</option>)}</select></label>
   <ul className="divide-y">{STATE_PORTALS.filter(p=>p.state===state).map(p=><li key={p.url} className="py-2"><a href={p.url} target="_blank" rel="noopener noreferrer" className="font-semibold underline">{p.name}</a><p>{p.scope}</p><p className="text-xs">{p.access}</p></li>)}</ul>
   <h3 className="font-semibold">Connected city research</h3><p>Search existing NYC and Chicago Replit endpoints together. Results have different legal meanings and are never combined into spend totals.</p>
   <div className="grid grid-cols-1 sm:grid-cols-2 gap-2"><label>Topic<select className={control} disabled={busy} value={topic} onChange={e=>{clear();setTopic(e.target.value as MunicipalTopic);}}>{Object.entries(MUNICIPAL_TOPICS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label><label>Lookback<select className={control} disabled={busy} value={days} onChange={e=>{clear();setDays(Number(e.target.value) as 90|365);}}><option value={90}>90 days</option><option value={365}>365 days</option></select></label></div>
   {Object.entries(labels).map(([k,v])=><label className="flex min-h-11 items-center gap-2" key={k}><input type="checkbox" disabled={busy} checked={sources.includes(k as LocalSource)} onChange={()=>{clear();setSources(prev=>prev.includes(k as LocalSource)?prev.filter(x=>x!==k):[...prev,k as LocalSource]);}}/>{v}</label>)}
   <button type="button" className="workspace-button min-h-11" disabled={busy||!sources.length} onClick={()=>void run()}>{busy?'Checking sources…':'Search selected cities'}</button>
   {status&&<p role="status">{status}</p>}
   {sample&&result&&<>
    <p>Up to two pages per city. Five-minute sample, not a complete procurement census.</p>
    <ul>{sample.scopes.map(s=><li key={s.source}>{labels[s.source]} · {s.status} · {s.pages} pages · {s.sourceRows} rows · {s.withheld} withheld or duplicate</li>)}</ul>
    <p>{result.rows.length} native records · {result.conflicts} conflicting identities withheld</p>
    <label>Source filter<select className={control} value={filter} onChange={e=>{setFilter(e.target.value);setPage(1);}}><option value="all">All retrieved sources</option>{Object.entries(labels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
    {!rows.length&&<p>No matching records in this sample; not proof of no procurement.</p>}
    <ul className="divide-y">{rows.slice((current-1)*10,current*10).map(r=><li key={r.source+':'+r.id} className="py-2 space-y-1 break-words"><p className="font-semibold">{r.organization??'Issuing department not reported'} · {labels[r.source]}</p><p>{r.title}</p><p>{r.kind==='contract-row'?'Contract / revision row, not open bid':r.kind==='intent-to-award'?'Intent to award, not final':r.kind} · {r.date}</p>{r.deadline&&<p>Published local deadline {r.deadline.replace('T',' ')} · verify current status</p>}<p>{r.vendor?'Reported vendor: '+r.vendor:'Vendor not reported'}</p><p>{r.amount===null?'Amount not stated':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(r.amount)} · {r.amountNote}</p><p className="text-xs">{r.recordNumber??'Record number not reported'}</p><a className="underline" href={r.url} target="_blank" rel="noopener noreferrer">Official source record</a></li>)}</ul>
    <div className="flex gap-2 items-center"><button type="button" className="workspace-button" disabled={current===1} onClick={()=>setPage(current-1)}>Previous</button><span>Page {current}</span><button type="button" className="workspace-button" disabled={current*10>=rows.length} onClick={()=>setPage(current+1)}>Next</button></div>
    <p className="text-xs">Verify the actual buying agency, equipment scope, amendments and award status. No automatic provider assignment, equipment claim or pipeline entry.</p>
   </>}
  </div>}
 </section>;
}
