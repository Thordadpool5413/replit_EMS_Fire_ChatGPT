import React,{useState} from 'react';
import type {Agency} from '../types';
import type {ReviewedSample} from '../services/reviewedAccountPriorities';
import {buildCompetitiveDisplacement,DISPLACEMENT_WINDOWS,type DisplacementWindow} from '../services/competitiveDisplacement';
import {PROVIDER_EQUIPMENT_KINDS,type ProviderEquipmentKind} from '../services/providerCompetitiveProfile';
import {INTELLIGENCE_DEFINITIONS} from '../services/documentedIntelligence';
import {OPPORTUNITY_LABELS} from '../services/opportunityRadar';
import type {CommercialRow} from '../services/commercialOpportunityQueue';
const control='block w-full min-w-0 rounded border p-2 bg-transparent text-base';
function ContextRecords({title,rows}:{title:string;rows:CommercialRow[]}){
 return <details className="rounded border p-2 min-w-0"><summary className="font-medium">{title} ({rows.length})</summary>{!rows.length&&<p className="text-xs">No eligible reviewed record in this view.</p>}<ul className="divide-y">{rows.map(r=><li key={r.signal.signal.evidence.factId} className="py-2 space-y-1 break-words"><p>{OPPORTUNITY_LABELS[r.signal.signal.kind]} · {r.signal.signal.evidence.value}</p><p className="text-xs">Document date {r.signal.signal.evidence.documentDate}{r.signal.signal.date?' · reported date '+r.signal.signal.date:''}</p><a className="underline" href={r.signal.signal.evidence.sourceUrl} target="_blank" rel="noopener noreferrer">Reviewed source</a><p className="text-xs">{r.signal.signal.nextAction}</p></li>)}</ul></details>;
}
export function CompetitiveDisplacementPanel({agencies,selected,samples,started,onOpenAgency,onPlan}:{agencies:Agency[];selected:string[];samples:ReviewedSample[];started:number;onOpenAgency:(a:Agency)=>void;onPlan:()=>void}){
 const [kind,setKind]=useState<ProviderEquipmentKind|'all'>('all'),[vendor,setVendor]=useState('all'),[windowDays,setWindowDays]=useState<DisplacementWindow>(90),[gaps,setGaps]=useState(false);
 const r=buildCompetitiveDisplacement(agencies,selected,samples,started,windowDays);
 const vendors=new Map(r.rows.flatMap(row=>row.observations.map(o=>[o.vendorId,o.vendorName] as const)));
 const rows=r.rows.filter(row=>(kind==='all'||row.kind===kind)&&(vendor==='all'||row.observations.some(o=>o.vendorId===vendor)));
 if(!r.active)return <p role="status">Selected account evidence expired or invalid. Refresh before using competitive research.</p>;
 return <section className="space-y-3 min-w-0" aria-label="Competitive displacement research">
  <header><h4 className="font-semibold">Competitive displacement research</h4><p className="text-xs">Independently reviewed department documents in this selected sample. Equipment observations are dated reports, not confirmed installed fleets, replacement intent, exclusivity or sales probability.</p></header>
  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
   <div className="rounded border p-2"><p className="text-xs">Accounts with competitor observations</p><strong className="text-xl tabular-nums">{r.competitorAccounts}</strong></div>
   <div className="rounded border p-2"><p className="text-xs">Also have separate dated purchasing context</p><strong className="text-xl tabular-nums">{r.datedContextAccounts}</strong></div>
   <div className="rounded border p-2"><p className="text-xs">Complete document samples</p><strong className="text-xl tabular-nums">{r.checked}/{r.selected}</strong></div>
  </div>
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
   <label>Equipment type<select className={control} value={kind} onChange={e=>setKind(e.target.value as typeof kind)}><option value="all">All equipment types</option>{PROVIDER_EQUIPMENT_KINDS.map(k=><option key={k} value={k}>{INTELLIGENCE_DEFINITIONS[k].label}</option>)}</select></label>
   <label>Observed manufacturer<select className={control} value={vendor} onChange={e=>setVendor(e.target.value)}><option value="all">All observed manufacturers</option>{[...vendors].sort((a,b)=>a[1].localeCompare(b[1])).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
   <label>Separate purchasing date window<select className={control} value={windowDays} onChange={e=>setWindowDays(Number(e.target.value) as DisplacementWindow)}>{DISPLACEMENT_WINDOWS.map(d=><option key={d} value={d}>{d} days</option>)}</select></label>
  </div>
  <p className="text-xs">{rows.length} account/equipment-type research group(s), not devices or qualified deals. A date, grant or award at the same department does not establish a connection to an observed product.</p>
  {!rows.length&&<p>No eligible competitor observation matches this filter. Missing or conflicting evidence is not proof of ZOLL use or lack of opportunity.</p>}
  {r.accounts.filter(a=>rows.some(row=>row.identityKey===a.identityKey)).map(a=><article key={a.identityKey} className="rounded border p-3 space-y-2 min-w-0">
   <h5 className="font-semibold break-words">{a.agency.name}</h5>
   {rows.filter(row=>row.identityKey===a.identityKey).map(row=><section key={row.key} className="space-y-1 border-t pt-2">
    <p className="font-medium">{INTELLIGENCE_DEFINITIONS[row.kind].label}</p>
    {row.observations.map(o=><div key={o.evidence.factId} className="space-y-1 break-words"><p>{o.vendorName} · {o.evidence.value}</p><p className="text-xs">Reported {o.evidence.documentDate} · {o.evidence.sourceName}</p><a className="underline" href={o.evidence.sourceUrl} target="_blank" rel="noopener noreferrer">Reviewed equipment source</a></div>)}
    <details><summary>Competitive pre-call preparation</summary><p>{row.preparation.objective}</p><ol className="list-decimal pl-5 space-y-1">{row.preparation.questions.map((q,i)=><li key={i}>{q}</li>)}</ol><p className="text-xs">Proposed next commitment: {row.preparation.commitment}</p></details>
   </section>)}
   <p className="text-xs">Separate department research: these documents are not linked to the observations above. Confirm exact scope, current status and authorized contact.</p>
   <ContextRecords title="Reported contract / solicitation dates" rows={a.dates}/><ContextRecords title="Funding context (not available cash)" rows={a.funding}/><ContextRecords title="Award context (not open bids)" rows={a.awards}/>
   <button type="button" className="workspace-button min-h-11" onClick={()=>onOpenAgency(a.agency)}>Open profile for station evidence and pre-call planning</button>
  </article>)}
  <button type="button" className="workspace-button min-h-11" aria-expanded={gaps} onClick={()=>setGaps(!gaps)}>{gaps?'Hide':'Review'} evidence gaps ({r.accounts.filter(a=>!a.rows.length).length})</button>
  {gaps&&<ul className="divide-y">{r.accounts.filter(a=>!a.rows.length).map(a=><li key={a.identityKey} className="py-2 space-y-1 break-words"><p>{a.agency.name}</p><p className="text-xs">{a.status==='review-unavailable'?'Reviewed sample unavailable, incomplete or expired':'No eligible independently reviewed competitor document'}</p><button type="button" className="workspace-button min-h-11" onClick={()=>onOpenAgency(a.agency)}>Review account sources</button></li>)}</ul>}
  <p className="text-xs">{r.selected-r.eligible} excluded identities · {r.withheld} additional recognized observations withheld for date or source ambiguity. Other conflicting evidence is withheld upstream.</p>
  <button type="button" className="workspace-button min-h-11" onClick={onPlan}>Open field execution planner</button>
  <p className="text-xs">Station-level observations and lifecycle dates are available separately in provider profiles. No automatically generated outreach, sales forecast, fleet counts or provider data changes.</p>
 </section>;
}
