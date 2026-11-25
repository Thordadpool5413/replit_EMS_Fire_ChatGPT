import React,{useState} from 'react';
import type {Agency} from '../types';
import type {ReviewedSample} from '../services/reviewedAccountPriorities';
import {buildCommercialQueue,type CommercialRow} from '../services/commercialOpportunityQueue';
import {OPPORTUNITY_LABELS} from '../services/opportunityRadar';
const control='block w-full min-w-0 rounded border p-2 bg-transparent text-base';
type View='upcoming'|'later'|'funding'|'awards';
const labels:Record<View,string>={upcoming:'Within selected window',later:'Later dated records',funding:'Funding research',awards:'Award follow-up'};
export function CommercialOpportunityQueue({agencies,selected,samples,onOpenAgency}:{agencies:Agency[];selected:string[];samples:ReviewedSample[];onOpenAgency:(a:Agency)=>void}){
 const [days,setDays]=useState(90),[view,setView]=useState<View>('upcoming'),[page,setPage]=useState(1);
 const result=buildCommercialQueue(agencies,selected,samples,Date.now(),days),rows=result[view],current=Math.min(page,Math.max(1,Math.ceil(rows.length/6)));
 function detail(r:CommercialRow){
  const s=r.signal.signal,e=s.evidence;
  return <li key={r.identityKey+':'+e.factId} className="py-3 space-y-1 break-words">
   <p className="font-semibold">{r.agency.name} · {r.agency.stateCode}</p>
   <p>{OPPORTUNITY_LABELS[s.kind]}{s.date?' · '+s.date:''}{r.signal.days!==undefined?' · '+r.signal.days+' days':''}</p>
   <p>{e.value}</p><p className="text-xs">{e.sourceName} · document {e.documentDate} · record {e.sourceRecordId}</p>
   <a className="underline" href={e.sourceUrl} target="_blank" rel="noopener noreferrer">Reviewed original document</a>
   <p><strong>Research action:</strong> {s.nextAction}</p>
   {r.lane==='funding'&&<p className="text-xs">Reported funding is not available balance, a confirmed purchase or sales revenue.</p>}
   {r.lane==='award'&&<p className="text-xs">Award history is not a current open solicitation.</p>}
   <button type="button" className="workspace-button min-h-11" onClick={()=>onOpenAgency(r.agency)}>Open provider profile</button>
  </li>;
 }
 return <section className="border rounded p-3 space-y-2 min-w-0" aria-label="Contract and funding research queue">
  <h3 className="font-semibold">Contract and funding research queue</h3>
  <p className="text-xs">Reviewed commercial documents only. Deadlines ordered by date, funding and award records by document recency. No automatic connection between contracts, grants, equipment, or buyers.</p>
  <p>{result.checked}/{result.selected} complete account samples · {result.accountsWithRecords} accounts with commercial records · {result.ambiguous} ambiguous record signals withheld.</p>
  <div className="grid grid-cols-2 gap-2">
   {(['upcoming','later','funding','awards'] as const).map(k=><button type="button" key={k} className="workspace-button min-h-11 min-w-0 flex-col items-start text-left" aria-pressed={view===k} onClick={()=>{setView(k);setPage(1);}}><span>{labels[k]}</span><strong className="tabular-nums">{result[k].length}</strong></button>)}
  </div>
  <label>Deadline research window<select className={control} value={days} onChange={e=>{setDays(Number(e.target.value));setPage(1);}}>{[30,90,180,365].map(d=><option key={d} value={d}>{d} days</option>)}</select></label>
  {!rows.length&&<p>No qualifying reviewed records in this selection. Missing evidence is not proof of no opportunity.</p>}
  <ol className="divide-y">{rows.slice((current-1)*6,current*6).map(detail)}</ol>
  {rows.length>6&&<div className="flex gap-2 items-center"><button type="button" className="workspace-button min-h-11" disabled={current===1} onClick={()=>setPage(current-1)}>Previous</button><span>Page {current}</span><button type="button" className="workspace-button min-h-11" disabled={current*6>=rows.length} onClick={()=>setPage(current+1)}>Next</button></div>}
  <p className="text-xs">Records, not unique transactions. Date scope is limited to reviewed eligible documents within the existing 365-day research horizon. No sums of funding amounts, forecasts or pipeline changes. Refresh before acting.</p>
 </section>;
}
