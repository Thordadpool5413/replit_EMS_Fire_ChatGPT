import React from 'react';
import { INTELLIGENCE_DEFINITIONS } from '../services/documentedIntelligence';
import type { EvidenceReviewResult, EvidenceReviewStatus } from '../services/sharedEvidenceReconciliation';
const labels:Record<EvidenceReviewStatus,string>={'review-candidate':'Review candidate','conflict':'Conflict','historical':'Historical','stale':'Stale document','superseded':'Superseded','deadline-passed':'Date passed','closed':'Closed','local-review-required':'Manual review required','incomplete':'Incomplete scope'};
export function SharedEvidenceReview({result}:{result:EvidenceReviewResult}){
 const [filter,setFilter]=React.useState<'all'|EvidenceReviewStatus>('all');
 const [page,setPage]=React.useState(1);
 const rows=result.items.filter(r=>filter==='all'||r.status===filter);
 const current=Math.min(page,Math.max(1,Math.ceil(rows.length/8)));
 return <section aria-label="Shared evidence reconciliation" className="border rounded-md p-3 space-y-3 min-w-0" data-testid="shared-evidence-review">
  <h3 className="font-semibold">Document reconciliation</h3>
  <p className="text-sm">Compare shared evidence with typed records on this device. This is a research review, not verified equipment, a shared correction decision, or a qualified opportunity.</p>
  {!result.complete&&<p role="status" className="text-sm font-medium">{result.reason} Refresh the complete first page before relying on any classification.</p>}
  <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
   {[['Shared rows',result.sharedCount],['Local typed rows',result.localCount],['Duplicate observations',result.duplicates],['Invalid / withheld',result.invalid]].map(([name,value])=><div key={name}><dt>{name}</dt><dd className="font-semibold tabular-nums text-lg">{value}</dd></div>)}
  </dl>
  <label className="block text-sm">Review status<select className="block w-full min-w-0 rounded border p-2 bg-transparent text-base" value={filter} onChange={e=>{setFilter(e.target.value as typeof filter);setPage(1);}}><option value="all">All statuses ({result.items.length})</option>{Object.entries(labels).map(([id,label])=><option value={id} key={id}>{label} ({result.items.filter(r=>r.status===id).length})</option>)}</select></label>
  {!rows.length&&<p className="text-sm">No observations in this selection.</p>}
  <ul className="divide-y divide-slate-200 dark:divide-slate-700">{rows.slice((current-1)*8,current*8).map((r,i)=><li key={r.origin+':'+r.evidence.factId+':'+i} className="py-3 space-y-1 min-w-0 break-words">
   <p className="font-semibold text-sm">{labels[r.status]} · {INTELLIGENCE_DEFINITIONS[r.evidence.kind].label}</p><p className="text-sm">{r.evidence.value}</p><p className="text-xs">{r.origin==='shared'?'Shared document':'Local document only'} · {r.evidence.sourceName} · {r.evidence.documentDate} · {r.evidence.sourceRecordId}</p>
   <p className="text-sm">{r.reason}</p>{r.duplicates>0&&<p className="text-xs">{r.duplicates} matching observation(s) collapsed for review only.</p>}<a href={r.evidence.sourceUrl} target="_blank" rel="noreferrer" className="text-sm underline break-all">Review original document</a>
  </li>)}</ul>
  <div className="flex flex-wrap items-center gap-2"><button type="button" className="workspace-button" disabled={current===1} onClick={()=>setPage(current-1)}>Previous</button><span className="text-xs">Page {current} of {Math.max(1,Math.ceil(rows.length/8))}</span><button type="button" className="workspace-button" disabled={current*8>=rows.length} onClick={()=>setPage(current+1)}>Next</button></div>
 </section>;
}
