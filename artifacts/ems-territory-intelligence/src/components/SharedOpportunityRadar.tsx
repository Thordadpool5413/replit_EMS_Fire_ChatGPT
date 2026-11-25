import React,{useEffect,useState} from 'react';
import type { AuthUser } from '@workspace/replit-auth-web';
import type { Agency } from '../types';
import { buildReviewedRadar,type ReviewedRadarResult } from '../services/sharedOpportunityRadar';
import { loadReviewedRadarRows,type EvidenceSession } from '../services/sharedEvidenceReplit';
import { OPPORTUNITY_LABELS } from '../services/opportunityRadar';
import { sharedAgencyKey } from '../services/sharedEvidence';
export function SharedOpportunityRadar({session,user,agency}:{session:EvidenceSession;user:AuthUser;agency:Agency}){
 const [result,setResult]=useState<{review:ReviewedRadarResult;checkedAt:string}>();
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [page,setPage]=useState(1);
 const key=sharedAgencyKey(agency);
 useEffect(()=>{
   if(!result)return;
   const invalidate=()=>{setResult(undefined);setError('Reviewed results expired or connectivity changed. Run a fresh server check.');};
   const timeout=window.setTimeout(invalidate,Math.max(0,Date.parse(result.checkedAt)+5*60_000-Date.now()));
   window.addEventListener('offline',invalidate);
   return()=>{window.clearTimeout(timeout);window.removeEventListener('offline',invalidate);};
 },[result]);
 async function check(){
  if(!key||busy)return;
  setResult(undefined);setBusy(true);setError('');setPage(1);
  try{
   const batch=await loadReviewedRadarRows(session,user,key);
   if(typeof navigator!=='undefined'&&!navigator.onLine)throw Error('Connection lost; refresh when online.');
   setResult({review:buildReviewedRadar(agency,batch.rows,{complete:true,withheld:0}),checkedAt:batch.checkedAt});
  }catch(e){setError(e instanceof Error?e.message:'Server review could not be confirmed.');}
  finally{setBusy(false);}
 }
 const review=result?.review;
 const current=Math.min(page,Math.max(1,Math.ceil((review?.signals.length??0)/8)));
 return <section className="border rounded-md p-3 space-y-3 min-w-0" aria-label="Shared Opportunity Radar" data-testid="shared-opportunity-radar">
   <h3 className="font-semibold">Shared Opportunity Radar</h3>
   <p className="text-sm">Reviewed public-document signals for this selected account only. Pending and blocked observations cannot become positive signals. Private local evidence, forecasts and estimated revenue are excluded.</p>
   <button className="workspace-button" type="button" disabled={busy||!key} onClick={()=>void check()}>{busy?'Checking server evidence…':'Evaluate reviewed opportunities'}</button>
   {busy&&<p role="status" className="text-sm">Checking published documents and permanent review decisions.</p>}
   {error&&<p role="alert" className="text-sm break-words">{error}</p>}
   {result&&review&&<>
    <p className="text-xs">Checked {new Date(result.checkedAt).toLocaleString()} · non-atomic server reads, valid as a sampled review only. Refresh before acting; this view expires in five minutes.</p>
    {!review.complete?<p role="status" className="text-sm font-medium">{review.reason}</p>:<>
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">{[['Documents checked',review.checked],['Approved records',review.approved],['Research signals',review.signals.length],['No separate signal',review.withheld]].map(([label,value])=><div key={label}><dt>{label}</dt><dd className="font-semibold text-lg tabular-nums">{value}</dd></div>)}</dl>
      {!review.signals.length&&<p role="status" className="text-sm">No eligible reviewed signals in the available account records. This does not establish absence of equipment or sales opportunities.</p>}
      <ul className="divide-y divide-slate-200 dark:divide-slate-700">{review.signals.slice((current-1)*8,current*8).map(s=><li key={s.evidence.factId} className="py-3 space-y-1 min-w-0 break-words">
       <p className="font-semibold text-sm">{OPPORTUNITY_LABELS[s.kind]}</p><p className="text-sm">{s.evidence.value}</p>{s.date&&<p className="text-sm">Documented date: {s.date}</p>}
       <p className="text-xs">{s.evidence.sourceName} · {s.evidence.documentDate} · {s.evidence.sourceRecordId}</p>
       <p className="text-xs break-all">Source reviewed by {s.approval.reviewerUid} · {s.approval.reviewedAt}</p>
       <a className="text-sm underline break-all" href={s.evidence.sourceUrl} target="_blank" rel="noreferrer">Review original source</a>
       <p className="text-sm"><strong>Next action:</strong> {s.nextAction}</p>
      </li>)}</ul>
      {review.signals.length>8&&<div className="flex flex-wrap gap-2 items-center"><button className="workspace-button" disabled={current===1} onClick={()=>setPage(current-1)}>Previous</button><span className="text-xs">Page {current}</span><button className="workspace-button" disabled={current*8>=review.signals.length} onClick={()=>setPage(current+1)}>Next</button></div>}
    </>}
   </>}
   <p className="text-xs">No territory-wide coverage, current equipment confirmation, qualified pipeline or predicted revenue is inferred. Results are not written to the agency database or the existing local Radar.</p>
 </section>;
}
