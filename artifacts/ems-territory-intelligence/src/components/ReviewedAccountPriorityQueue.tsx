import React,{useEffect,useMemo,useRef,useState} from 'react';
import {useAuth} from '@workspace/replit-auth-web';
import type {Agency} from '../types';
import {evidenceEnabled,evidenceRole,openEvidenceSession,loadReviewedRadarRows} from '../services/sharedEvidenceReplit';
import {MAX_REVIEW_ACCOUNTS,eligiblePriorityAccounts,buildReviewedAccountPriorities,type ReviewedSample,type Band} from '../services/reviewedAccountPriorities';
import {TerritoryCommandSummary,CommandFollowUps} from './TerritoryCommandCenter';
import {COMMAND_VIEWS,type CommandView} from '../services/territoryCommand';
import {AccountCoveragePanel} from './AccountCoveragePanel';
import {FieldExecutionPlanner} from './FieldExecutionPlanner';
import {GeographicOpportunityClusters} from './GeographicOpportunityClusters';
import {CommercialOpportunityQueue} from './CommercialOpportunityQueue';
import {SelectedIntelligenceCoverage} from './SelectedIntelligenceCoverage';
import {OPPORTUNITY_LABELS,type OpportunityKind} from '../services/opportunityRadar';
const bands:Record<Band,string>={'verify-now':'Verify now','verify-soon':'Verify soon','plan-research':'Plan research',explore:'Explore account'};
const gapLabels={'identity-excluded':'Identity conflict or inactive record',unavailable:'Review unavailable, incomplete or expired','no-signal':'No eligible reviewed signals',filtered:'Outside selected signal filter'};
const control='block w-full min-w-0 rounded border p-2 bg-transparent text-base';
export function ReviewedAccountPriorityQueue({agencies,onOpenAgency}:{agencies:Agency[];onOpenAgency:(a:Agency)=>void}){
 const {user}=useAuth();return user&&evidenceEnabled?<PrivateQueue key={user.id} agencies={agencies} onOpenAgency={onOpenAgency}/>:null;
}
function PrivateQueue({agencies,onOpenAgency}:{agencies:Agency[];onOpenAgency:(a:Agency)=>void}){
 const {user}=useAuth();
 const [open,setOpen]=useState(false),[state,setState]=useState(''),[search,setSearch]=useState(''),[selected,setSelected]=useState<string[]>([]),[kind,setKind]=useState<OpportunityKind|'all'>('all'),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[result,setResult]=useState<{samples:ReviewedSample[];started:number;scope:string}>();
 const [view,setView]=useState<CommandView>('overview');
 const token=useRef(0);
 const eligible=useMemo(()=>eligiblePriorityAccounts(agencies),[agencies]),states=[...new Set(eligible.map(a=>a.agency.stateCode))].sort(),inState=eligible.filter(a=>a.agency.stateCode===state);
 const chosen=inState.filter(a=>selected.includes(a.agency.id)),scope=JSON.stringify(chosen.map(a=>[a.agency.id,a.identityKey,a.agency.name]).sort());
 const sample=result?.scope===scope&&chosen.length===selected.length?result:undefined;
 function clear(){token.current++;setView('overview');setResult(undefined);setMessage('');setBusy(false);}
 useEffect(()=>{clear();},[scope]);
 useEffect(()=>{const offline=()=>{clear();setMessage('Connection lost. Refresh when online.');};window.addEventListener('offline',offline);return()=>{token.current++;window.removeEventListener('offline',offline);};},[]);
 useEffect(()=>{if(!sample)return;const timer=window.setTimeout(()=>{clear();setMessage('Sample expired. Refresh before acting.');},Math.max(0,sample.started+300000-Date.now()));return()=>window.clearTimeout(timer);},[sample]);
 function toggle(id:string){clear();setSelected(prev=>prev.includes(id)?prev.filter(v=>v!==id):prev.length<MAX_REVIEW_ACCOUNTS?[...prev,id]:prev);}
 async function check(){
  if(!user||busy||!chosen.length||chosen.length!==selected.length)return;
  clear();const request=++token.current,started=Date.now(),samples:ReviewedSample[]=[];setBusy(true);
  try{
   const session=openEvidenceSession();await evidenceRole(session,user);
   for(const {agency,identityKey} of chosen){
    if(token.current!==request)return;
    setMessage('Checking '+agency.name+'…');
    try{const batch=await loadReviewedRadarRows(session,user,identityKey);if(token.current!==request)return;samples.push({agencyId:agency.id,identityKey,rows:batch.rows,checkedAt:batch.checkedAt});}catch{/* Missing reads remain explicit unavailable rows. */}
   }
   await evidenceRole(session,user);
   if(token.current!==request)return;
   if(!navigator.onLine||Date.now()-started>=300000)throw Error('Sample expired or connection lost. Select fewer accounts and refresh.');
   setResult({samples,started,scope});setMessage('');
  }catch(e){if(token.current===request){setResult(undefined);setMessage(e instanceof Error?e.message:'Reviewed evidence unavailable.');}}
  finally{if(token.current===request)setBusy(false);}
 }
 const ranked=sample?buildReviewedAccountPriorities(agencies,selected,sample.samples,Date.now(),kind):undefined;
 return <section className="pi-surface p-3 space-y-2 min-w-0" aria-label="Reviewed account research priorities">
  <button className="workspace-button min-h-11" type="button" aria-expanded={open} onClick={()=>{if(open)clear();setOpen(!open);}}>{open?'Close territory command center':'Open territory command center'}</button>
  {open&&<div className="space-y-3 text-sm">
   <p>Compare up to {MAX_REVIEW_ACCOUNTS} selected accounts using independently reviewed public documents. This research order is separate from PulseIQ estimates, private notes and station observations; it is not win probability or revenue.</p>
   <label>State<select className={control} value={state} disabled={busy} onChange={e=>{clear();setState(e.target.value);setSelected([]);setSearch('');}}><option value="">Choose state</option>{states.map(s=><option key={s}>{s}</option>)}</select></label>
   {state&&<>
    <label>Find accounts<input className={control} value={search} disabled={busy} onChange={e=>setSearch(e.target.value)} /></label>
    <p>{selected.length}/{MAX_REVIEW_ACCOUNTS} selected · {inState.length} eligible loaded accounts, not total state coverage.</p>
    <div className="flex flex-wrap gap-2">{chosen.map(({agency})=><button className="workspace-button min-h-11 break-words" key={agency.id} type="button" disabled={busy} onClick={()=>toggle(agency.id)}>Remove {agency.name}</button>)}</div>
    <div className="max-h-48 overflow-auto border rounded p-2">{inState.filter(a=>(a.agency.name+' '+a.identityKey).toLowerCase().includes(search.toLowerCase())).slice(0,30).map(({agency,identityKey})=><label key={agency.id} className="flex min-h-11 items-center gap-2 break-words"><input type="checkbox" checked={selected.includes(agency.id)} disabled={busy||(!selected.includes(agency.id)&&selected.length>=MAX_REVIEW_ACCOUNTS)} onChange={()=>toggle(agency.id)}/><span>{agency.name} · {identityKey}</span></label>)}</div>
    <button className="workspace-button min-h-11" type="button" disabled={busy||!chosen.length||chosen.length!==selected.length} onClick={()=>void check()}>{busy?'Checking reviewed evidence…':'Compare selected accounts'}</button>
   </>}
   {message&&<p role="status">{message}</p>}
   {ranked&&sample&&<>
    <TerritoryCommandSummary agencies={agencies} selected={selected} samples={sample.samples} view={view} onView={setView} onOpenAgency={onOpenAgency}/>
    <div role="group" aria-label="Territory command views" className="grid grid-cols-2 sm:grid-cols-3 gap-2">{COMMAND_VIEWS.map(v=><button type="button" className="workspace-button min-h-11 min-w-0" key={v} aria-pressed={view===v} onClick={()=>setView(v)}>{v==='followups'?'Follow-ups':v==='plan'?'Field plan':v==='activity'?'Account activity':v[0].toUpperCase()+v.slice(1)}</button>)}</div>
    {view==='priorities'&&<>
    <p>{ranked.checked}/{selected.length} accounts with complete reviewed samples · {ranked.ranked.length} prioritized. Five-minute sample; refresh before acting.</p>
    <label>Signal type<select className={control} value={kind} onChange={e=>setKind(e.target.value as typeof kind)}><option value="all">All eligible signals</option>{Object.entries(OPPORTUNITY_LABELS).map(([id,label])=><option value={id} key={id}>{label}</option>)}</select></label>
    <details><summary>Ranking method</summary><p className="text-xs">Solicitations within 14 days first, then within 45 days or contract end within 90 days, then later dates within a year and funding, then dated competitor evidence or awards. Documents must be recent and pass independent review. Counts, funding amounts and missing information do not increase rank.</p></details>
    <ol className="divide-y">{ranked.ranked.map((r,i)=><li key={r.identityKey} className="py-3 space-y-1 break-words"><p className="text-xs">{i+1}. {bands[r.primary.band]}</p><p className="font-semibold">{r.agency.name}</p><p>{OPPORTUNITY_LABELS[r.primary.signal.kind]}{r.primary.days!==undefined?' · '+r.primary.days+' days':''}</p><p>{r.primary.signal.evidence.value}</p><p className="text-xs">{r.primary.signal.evidence.sourceName} · {r.primary.signal.evidence.documentDate}</p><a className="underline" href={r.primary.signal.evidence.sourceUrl} target="_blank" rel="noopener noreferrer">Reviewed source</a><p>{r.primary.signal.nextAction}</p><p className="text-xs">{r.signals.length} distinct eligible signal(s), not separate qualified sales opportunities.</p><button className="workspace-button min-h-11" type="button" onClick={()=>onOpenAgency(r.agency)}>Open account profile</button></li>)}</ol>
    {ranked.gaps.length>0&&<div><h3 className="font-semibold">Unranked accounts</h3><ul className="divide-y">{ranked.gaps.map(g=><li key={g.id} className="py-2 break-words">{g.name} · {gapLabels[g.status]}</li>)}</ul></div>}
    </>}
    {view==='geography'&&<GeographicOpportunityClusters key={sample.started+':'+sample.scope} agencies={agencies} selected={selected} samples={sample.samples} onOpenAgency={onOpenAgency}/>}
    {view==='coverage'&&<SelectedIntelligenceCoverage agencies={agencies} selected={selected} samples={sample.samples} onOpenAgency={onOpenAgency}/>}
    {view==='commercial'&&<CommercialOpportunityQueue key={sample.started+':'+sample.scope} agencies={agencies} selected={selected} samples={sample.samples} onOpenAgency={onOpenAgency}/>}
    <div hidden={view!=='plan'}><FieldExecutionPlanner key={sample.started+':'+sample.scope} agencies={agencies} selected={selected} samples={sample.samples} started={sample.started} onOpenAgency={onOpenAgency}/></div>
    {view==='activity'&&<AccountCoveragePanel key={sample.started+':'+sample.scope} agencies={agencies} selected={selected} samples={sample.samples} started={sample.started} onOpenAgency={onOpenAgency} onPlan={()=>setView('plan')}/>}
    {view==='followups'&&<CommandFollowUps agencies={agencies} selected={selected} samples={sample.samples} onOpenAgency={onOpenAgency}/>}
    <p className="text-xs">Missing reviewed signals do not establish absence of equipment, funding or opportunity. No automatic CRM stage change or provider data write.</p>
   </>}
  </div>}
 </section>;
}
