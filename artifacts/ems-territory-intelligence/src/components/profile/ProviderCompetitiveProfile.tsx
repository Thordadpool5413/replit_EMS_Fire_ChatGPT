import { registryProfileHref } from '../../navigation/providerProfileUrl';
import React,{useEffect,useId,useMemo,useRef,useState} from 'react';
import {ChevronDown,ExternalLink,ShieldCheck} from 'lucide-react';
import type {Agency} from '../../types';
import {buildProviderCompetitiveProfile,providerGrantCandidates,type ProfileDocument} from '../../services/providerCompetitiveProfile';
import {loadProviderGrantResearch} from '../../services/loadProviderGrantResearch';
import {RESEARCH_SOURCES} from '../../services/nationalCompetitiveResearch';
import {sharedAgencyKey} from '../../services/sharedEvidence';

const statusLabels={'document-observation':'Dated local document','review-required':'Review required',history:'Historical / superseded','not-documented':'Needs source research'} as const;
const money=new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'});
function DocumentRow({document:d}:{document:ProfileDocument}){
 const e=d.item.evidence;
 return <li className="pcp-document">
  <p className="pcp-value">{e.value}</p>
  <p>{statusLabels[d.status]} · {e.documentDate} · {e.sourceName}</p>
  <p>Record {e.sourceRecordId}{e.dueDate?' · Published deadline '+e.dueDate:''}</p>
  {d.mentions.length>0&&<p>Brand / product text: {d.mentions.join('; ')}. Not current fleet verification.</p>}
  <p>{d.item.reason}</p>
  <a className="pcp-link" href={e.sourceUrl} target="_blank" rel="noreferrer">Original document <ExternalLink size={14} aria-hidden="true"/></a>
  <p><strong>Next check:</strong> {d.nextAction}</p>
 </li>;
}
function Documents({documents}:{documents:ProfileDocument[]}){
 const [page,setPage]=useState(1),size=4;
 const current=Math.min(page,Math.max(1,Math.ceil(documents.length/size)));
 return <><ul className="pcp-documents">{documents.slice((current-1)*size,current*size).map((d,i)=><DocumentRow key={JSON.stringify([d.item.evidence.factId,d.item.evidence.sourceUrl,d.item.evidence.value,i])} document={d}/>)}</ul>{documents.length>size&&<div className="pcp-actions"><button type="button" disabled={current===1} onClick={()=>setPage(current-1)}>Previous</button><span>Page {current} of {Math.ceil(documents.length/size)}</span><button type="button" disabled={current*size>=documents.length} onClick={()=>setPage(current+1)}>Next</button></div>}</>;
}
function GrantResearch({agency,directory}:{agency:Agency;directory:Agency[]}){
 const [result,setResult]=useState<Awaited<ReturnType<typeof loadProviderGrantResearch>>>(),[busy,setBusy]=useState(false),[error,setError]=useState(''),[page,setPage]=useState(1);
 const request=useRef<AbortController|undefined>(undefined);
 const matches=useMemo(()=>result?providerGrantCandidates(agency,directory,result.scopes,result.checkedAt):[],[agency,directory,result]);
 useEffect(()=>{
  const clear=()=>{request.current?.abort();request.current=undefined;setResult(undefined);setBusy(false);setError('Offline. Run a fresh source check when connected.');};
  window.addEventListener('offline',clear);return()=>{request.current?.abort();window.removeEventListener('offline',clear);};
 },[]);
 useEffect(()=>{
  if(!result)return;
  const earliest=Math.min(Date.parse(result.checkedAt),...result.scopes.flatMap(s=>s.fetchedAt?[Date.parse(s.fetchedAt)]:[]));
  const timer=window.setTimeout(()=>{setResult(undefined);setError('Source results expired. Run a fresh check.');},Math.max(0,earliest+16*60_000-Date.now()));
  return()=>window.clearTimeout(timer);
 },[result]);
 async function run(){
  request.current?.abort();const controller=new AbortController();request.current=controller;setResult(undefined);setBusy(true);setError('');setPage(1);
  try{const data=await loadProviderGrantResearch(agency.stateCode,controller.signal);if(request.current!==controller)return;if(!navigator.onLine)throw Error('Connection lost.');setResult(data);}
  catch(e){if(request.current===controller&&!controller.signal.aborted)setError(e instanceof Error?e.message:'Source check unavailable.');}
  finally{if(request.current===controller)setBusy(false);}
 }
 const current=Math.min(page,Math.max(1,Math.ceil(matches.length/4)));
 return <div className="pcp-research"><h4>Public grant research</h4><p>Optional state-only search of the first OpenFEMA and USAspending assistance pages. No account data is sent to the source. Exact name and state matches are research candidates, not assigned grants.</p>
  <button className="pcp-button" type="button" disabled={busy} onClick={()=>void run()}>{busy?'Checking public sources…':'Find possible grant records'}</button>
  {error&&<p role="alert">{error}</p>}
  {result&&<><p>Check started {new Date(result.checkedAt).toLocaleString()} · limited state samples, not the account’s full grant history.</p>
   <ul className="pcp-coverage">{result.scopes.map(s=><li key={s.source}>{RESEARCH_SOURCES[s.source]}: {s.status==='retrieved'?'Page retrieved':s.status==='partial'?'Partial / warning-bearing sample':'Unavailable'} · {s.candidates.length} usable records{s.hasMore?' · more pages available':''}{s.fetchedAt?' · '+new Date(s.fetchedAt).toLocaleString():''}</li>)}</ul>
   {!matches.length&&<p role="status">No eligible exact-name candidates in these samples. This is not proof of no grant awards.</p>}
   <ul className="pcp-documents">{matches.slice((current-1)*4,current*4).map(r=><li className="pcp-document" key={r.candidate.key}><p className="pcp-value">{r.candidate.title}</p><p>{r.candidate.organization} · {r.candidate.number??r.candidate.nativeId}</p><p>Reported award amount: {r.candidate.amount===null?'Not stated':money.format(r.candidate.amount)}</p>{r.candidate.fiscalYear!==null&&<p>FY {r.candidate.fiscalYear} (not award date)</p>}<p>Possible recipient match only. Verify legal identity, award document and funding scope.</p>{r.overlap&&<p>Possible cross-source overlap. Do not total these amounts.</p>}<a className="pcp-link" href={r.candidate.sourceUrl} target="_blank" rel="noreferrer">Open original record <ExternalLink size={14} aria-hidden="true"/></a></li>)}</ul>
   {matches.length>4&&<div className="pcp-actions"><button type="button" disabled={current===1} onClick={()=>setPage(current-1)}>Previous</button><span>Page {current}</span><button type="button" disabled={current*4>=matches.length} onClick={()=>setPage(current+1)}>Next</button></div>}
  </>}
 </div>;
}
export function ProviderCompetitiveProfile({agency,directory,view,onOpenSources}:{agency:Agency;directory:Agency[];view:'equipment'|'purchasing';onOpenSources:()=>void}){
 const [open,setOpen]=useState(false),id=useId();
 const data=useMemo(()=>buildProviderCompetitiveProfile(agency,directory),[agency,directory]);
 const publicProfile=agency.registryIdentity && registryProfileHref(agency.registryIdentity);
 const heading=view==='equipment'?'Competitive equipment evidence':'Purchasing & funding evidence';
 const count=view==='equipment'?data.documentedCategories+' of 6 categories with dated local observations':data.purchasing.filter(d=>d.status==='document-observation').length+' dated local purchasing / funding observations';
 return <section className="pcp-panel" aria-label={heading} data-testid={'provider-competitive-'+view}>
  <div className="pcp-heading"><ShieldCheck size={20} aria-hidden="true"/><div><h3>{heading}</h3><p>{data.identityReady&&data.complete?count:'Source identity or evidence review needed'}</p></div><button className="pcp-toggle" type="button" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(v=>!v)}>{open?'Hide details':'Review evidence'} <ChevronDown size={16} aria-hidden="true"/></button></div>
  {publicProfile&&view==='equipment'&&<a className="pcp-link" href={publicProfile+'#equipment'}>View public equipment &amp; funding records <ExternalLink size={14} aria-hidden="true"/></a>}
  {open&&<div id={id} className="pcp-body">
   <p>Local dated documents only. Not independently approved shared evidence, a verified installed fleet, or a qualified sales opportunity. Recorded inventory fields and estimates are not promoted here.</p>
   {!data.complete&&<p role="status">{data.reason??'Source records require review.'} {data.invalid>0?data.invalid+' invalid typed record(s) withheld.':''}</p>}
   {data.duplicates>0&&<p>{data.duplicates} duplicate document entries collapsed.</p>}
   {view==='equipment'?<ul className="pcp-category-list">{data.equipment.map(e=><li key={e.kind}><h4>{e.label}</h4><p className="pcp-status">{statusLabels[e.status]}</p>{e.documents.length>0?<Documents documents={e.documents}/>:<p>{e.question}</p>}</li>)}</ul>:<>
    {data.purchasing.length>0?<Documents documents={data.purchasing}/>:<p>No eligible dated purchasing documents in this account. Research the actual agreement, bid, award or appropriation before estimating timing or funding.</p>}
    {data.identityReady&&<GrantResearch key={sharedAgencyKey(agency)} agency={agency} directory={directory}/>}
   </>}
   <button className="pcp-button" type="button" onClick={onOpenSources}>Open Sources & Review</button>
  </div>}
 </section>;
}
