import React,{useState} from 'react';
import {buildConversionResearch,FAMILIES,type Family,type ConversionStatus} from '../../services/conversionResearch';
import type {LifecycleSample} from '../../services/lifecycleTimeline';
import type {ReviewedEquipmentObservation,ReviewedSignal} from '../../services/sharedOpportunityRadar';
import {OPPORTUNITY_LABELS} from '../../services/opportunityRadar';
const labels:Record<Family,string>={monitors:'Monitor / defibrillator',cpr:'Mechanical CPR',ventilators:'Ventilator',software:'Software'};
const statuses:Record<ConversionStatus,string>={'verify-date':'Verify documented coverage date','confirm-equipment':'Confirm installed equipment and scope','mixed-evidence':'Mixed manufacturer observations; clarify scope'};
const control='block w-full min-w-0 rounded border p-2 bg-transparent text-base';
export function ConversionResearchPanel({station,equipment,signals,today,days}:{station?:LifecycleSample;equipment:ReviewedEquipmentObservation[];signals:ReviewedSignal[];today:string;days:number}){
 const [family,setFamily]=useState<Family|'all'>('all'),[page,setPage]=useState(1);
 const result=buildConversionResearch(station,equipment,signals,today,days,family),current=Math.min(page,Math.max(1,Math.ceil(result.rows.length/6)));
 return <section className="border rounded p-3 space-y-2 min-w-0" aria-label="Competitive conversion research">
  <h3 className="font-semibold">Competitive conversion research</h3>
  <p>Reviewed non-ZOLL observations within 730 days, grouped by exact station and product category. Coverage dates are research prompts, not predicted replacements. No win probability or qualified pipeline.</p>
  <label>Product category<select className={control} value={family} onChange={e=>{setFamily(e.target.value as Family|'all');setPage(1);}}><option value="all">All categories</option>{FAMILIES.map(f=><option value={f} key={f}>{labels[f]}</option>)}</select></label>
  <p>{result.stationAvailable?result.stationsChecked+' source stations checked':'Station sample unavailable'} · {result.rows.length} station/category research groups · {result.stale} older observations excluded · {result.withheld} invalid or ambiguous records withheld.</p>
  {!result.rows.length&&<p>No qualifying station competitor observations in this sample. Unknown is not ZOLL ownership or competitor absence.</p>}
  <ol className="divide-y">{result.rows.slice((current-1)*6,current*6).map(r=><li key={r.key} className="py-2 space-y-1 break-words">
   <p className="font-semibold">{r.stationName} · {labels[r.family]}</p><p>{statuses[r.status]}</p><p className="text-xs">Station {r.stationId} · latest observation {r.latest}</p>
   {r.observations.slice(0,5).map(o=><div key={o.submissionId} className="border-l pl-2 text-xs space-y-1"><p>{o.maker} · {o.model||'Model not stated'}{o.apparatus?' · '+o.apparatus:''} · observed {o.observedOn}</p>{o.acquiredOn&&<p>Reported acquisition {o.acquiredOn}</p>}{r.dates.filter(d=>d.submissionId===o.submissionId).map(d=><p key={d.kind}>{d.kind==='warranty'?'Warranty end':'Service agreement end'} {d.date} · verify current terms</p>)}{o.sourceUrl&&<a href={o.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">Submitted evidence</a>}</div>)}
   {r.observations.length>5&&<p className="text-xs">More observations in the station equipment profile.</p>}
   {r.ambiguousDates>0&&<p className="text-xs">{r.ambiguousDates} date observations require scope reconciliation before prioritizing.</p>}
   <p className="text-xs">Confirm model, quantity, current use, purchasing owner and replacement intent in the field.</p>
  </li>)}</ol>
  {result.rows.length>6&&<div className="flex gap-2 items-center"><button type="button" className="workspace-button min-h-11" disabled={current===1} onClick={()=>setPage(current-1)}>Previous</button><span>Page {current}</span><button type="button" className="workspace-button min-h-11" disabled={current*6>=result.rows.length} onClick={()=>setPage(current+1)}>Next</button></div>}
  <details><summary className="font-semibold">Separate department context ({result.parentEquipment.length} equipment observations · {result.parentContext.length} purchasing/funding signals)</summary><p className="text-xs">Department documents are not linked to a particular station, model, grant-funded purchase or decision-maker unless separately documented. Purchasing/funding context is not product-filtered.</p>
   {result.parentEquipment.map(e=><p key={e.evidence.factId} className="text-xs break-words">{labels[e.family]} · {e.evidence.value} · {e.evidence.documentDate} · <a className="underline" href={e.evidence.sourceUrl} target="_blank" rel="noopener noreferrer">Reviewed source</a></p>)}
   {result.parentContext.map(s=><p key={s.evidence.factId} className="text-xs break-words">{OPPORTUNITY_LABELS[s.kind]} · {s.evidence.value}{s.date?' · '+s.date:''} · <a className="underline" href={s.evidence.sourceUrl} target="_blank" rel="noopener noreferrer">Reviewed source</a></p>)}
   <p className="text-xs">Use the decision-makers profile to separately verify documented authority; no automatic buyer attribution.</p>
  </details>
 </section>;
}
