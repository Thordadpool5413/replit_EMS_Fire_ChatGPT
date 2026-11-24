import React,{useEffect,useMemo,useRef,useState} from 'react';
import type { User } from 'firebase/auth';
import type { Agency } from '../types';
import type { EquipmentFamily } from '../utils/equipmentPresence';
import { sharedAgencyKey } from '../services/sharedEvidence';
import { loadReviewedRadarRows,evidenceRole,type EvidenceSession } from '../services/sharedEvidenceFirebase';
import { buildReviewedRadar } from '../services/sharedOpportunityRadar';
import { buildReviewedEquipmentGeography,reviewedMapAccounts,reviewedMapIdentity,REVIEWED_MAP_SAMPLE_LIMIT,REVIEWED_MAP_COLORS,REVIEWED_MAP_LABELS,type ReviewedMapAccount,type CountyReference } from '../services/reviewedEquipmentMap';
const control='block w-full min-w-0 rounded border p-2 bg-transparent text-base';
type Boundary={countyFips:string;countyName:string;stateCode:string;svgPath:string};
type BoundaryView={state:string;paths:Boundary[];refs:CountyReference[]};
type Snapshot={rows:ReviewedMapAccount[];checkedAt:string;scope:string};
const errorText=(e:unknown)=>e instanceof Error?e.message:'Server check failed.';
export function ReviewedEquipmentMap({session,user,agencies,onOpenAgency}:{session:EvidenceSession;user:User;agencies:Agency[];onOpenAgency?:(a:Agency)=>void}){
 const eligible=useMemo(()=>reviewedMapAccounts(agencies),[agencies]);
 const states=useMemo(()=>[...new Set(eligible.map(a=>a.stateCode))].sort(),[eligible]);
 const [state,setState]=useState('');
 const [family,setFamily]=useState<EquipmentFamily>('all');
 const [search,setSearch]=useState('');
 const [selected,setSelected]=useState<string[]>([]);
 const [snapshot,setSnapshot]=useState<Snapshot>();
 const [boundaries,setBoundaries]=useState<BoundaryView>();
 const [boundaryError,setBoundaryError]=useState('');
 const [county,setCounty]=useState('');
 const [busy,setBusy]=useState(false);
 const [status,setStatus]=useState('');
 const request=useRef(0);
 const scoped=useMemo(()=>eligible.filter(a=>a.stateCode===state),[eligible,state]);
 const chosen=useMemo(()=>scoped.filter(a=>selected.includes(sharedAgencyKey(a)!)),[scoped,selected]);
 const scope=JSON.stringify(chosen.map(reviewedMapIdentity).sort());
 const currentScope=useRef(scope);currentScope.current=scope;
 const matches=useMemo(()=>scoped.filter(a=>(a.name+' '+sharedAgencyKey(a)).toLowerCase().includes(search.trim().toLowerCase())).slice(0,30),[scoped,search]);
 const live=snapshot?.scope===scope?snapshot:undefined;
 const geo=useMemo(()=>live?buildReviewedEquipmentGeography(live.rows,state,family,boundaries?.state===state?boundaries.refs:[]):undefined,[live,state,family,boundaries]);
 useEffect(()=>{
  let active=true;setBoundaries(undefined);setBoundaryError('');setCounty('');
  if(!state)return;
  void import('../services/countyBoundaryHierarchyService').then(async({countyBoundaryHierarchy:h})=>{
   const nodes=await h.fetchStateCountyBoundaries(state);
   const refs=nodes.map(n=>({countyFips:n.countyFips,countyName:n.countyName,stateCode:n.stateCode}));
   const paths=h.projectStateCountiesToSvg(state,720,400,14).projectedCounties.map(p=>({countyFips:p.countyFips,countyName:p.countyName,stateCode:p.stateCode,svgPath:p.svgPath}));
   if(active){setBoundaries({state,paths,refs});if(!paths.length)setBoundaryError('County outlines unavailable. Account results are shown separately.');}
  }).catch(()=>{if(active)setBoundaryError('County outlines unavailable. No county location will be guessed.');});
  return()=>{active=false;};
 },[state]);
 useEffect(()=>{
  const offline=()=>{request.current++;setSnapshot(undefined);setBusy(false);setStatus('Connection changed. Run a fresh server check.');};
  window.addEventListener('offline',offline);
  return()=>{request.current++;window.removeEventListener('offline',offline);};
 },[]);
 useEffect(()=>{
  if(!live)return;
  const timer=window.setTimeout(()=>{setSnapshot(undefined);setStatus('Sample expired. Refresh before relying on this map.');},Math.max(0,Date.parse(live.checkedAt)+5*60_000-Date.now()));
  return()=>window.clearTimeout(timer);
 },[live]);
 const clear=()=>{request.current++;setSnapshot(undefined);setStatus('');setCounty('');setBusy(false);};
 function choose(key:string){
  clear();setSelected(prev=>prev.includes(key)?prev.filter(k=>k!==key):prev.length<REVIEWED_MAP_SAMPLE_LIMIT?[...prev,key]:prev);
 }
 async function check(){
  if(busy||!state||!chosen.length||chosen.length!==selected.length||chosen.length>REVIEWED_MAP_SAMPLE_LIMIT)return;
  const token=++request.current,expected=scope;
  const active=()=>request.current===token&&currentScope.current===expected;
  setSnapshot(undefined);setBusy(true);setCounty('');setStatus('');
  try{
   await evidenceRole(session,user);
   const rows:ReviewedMapAccount[]=[];
   const startedAt=new Date().toISOString();
   for(const agency of chosen){
    if(!active())return;
    setStatus('Checking '+(rows.length+1)+' of '+chosen.length+' selected accounts…');
    try{
     const batch=await loadReviewedRadarRows(session,user,sharedAgencyKey(agency)!);
     const review=buildReviewedRadar(agency,batch.rows,{complete:true,withheld:0});
     rows.push({agency,review,checkedAt:batch.checkedAt,reason:review.reason});
    }catch(e){rows.push({agency,reason:errorText(e)});}
   }
   await evidenceRole(session,user);
   if(!active())return;
   if(!navigator.onLine||Date.now()-Date.parse(startedAt)>=5*60_000)throw Error('The sample expired or lost connectivity. Try a smaller selection.');
   setSnapshot({rows,checkedAt:startedAt,scope:expected});setStatus('');
  }catch(e){if(active())setStatus(errorText(e));}
  finally{if(request.current===token)setBusy(false);}
 }
 const visible=geo?.classified.filter(r=>!county||r.countyFips===county)??[];
 return <section className="border rounded-md p-3 space-y-3 min-w-0" aria-label="Reviewed competitive equipment map" data-testid="reviewed-equipment-map">
  <h3 className="font-semibold">Reviewed competitive equipment map</h3>
  <p className="text-sm">Select up to {REVIEWED_MAP_SAMPLE_LIMIT} source-native accounts in one state. This map shows reviewed dated observations for that sample only, not a complete fleet census or market share.</p>
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
   <label className="block text-sm">State<select className={control} value={state} disabled={busy} onChange={e=>{clear();setState(e.target.value);setSelected([]);setSearch('');}}><option value="">Choose state</option>{states.map(s=><option key={s}>{s}</option>)}</select></label>
   <label className="block text-sm">Product category<select className={control} value={family} onChange={e=>{setFamily(e.target.value as EquipmentFamily);setCounty('');}}><option value="all">All equipment / software</option><option value="monitors">Monitor / defibrillator</option><option value="cpr">Mechanical CPR</option><option value="ventilators">Transport ventilator</option><option value="software">ePCR / CAD / billing</option></select></label>
  </div>
  {state&&<>
   <label className="block text-sm">Find accounts<input className={control} value={search} disabled={busy} onChange={e=>setSearch(e.target.value)} placeholder="Name or source-native ID"/></label>
   <p className="text-xs">{chosen.length} / {REVIEWED_MAP_SAMPLE_LIMIT} selected · {scoped.length.toLocaleString()} eligible loaded accounts in {state}. Search shows up to 30 matches.</p>
   <div className="flex flex-wrap gap-2">{chosen.map(a=><button key={sharedAgencyKey(a)} type="button" disabled={busy} className="workspace-button max-w-full break-words" onClick={()=>choose(sharedAgencyKey(a)!)}>Remove {a.name}</button>)}</div>
   <div className="max-h-56 overflow-auto border rounded-md p-2 space-y-2">{matches.map(a=>{const key=sharedAgencyKey(a)!;return <label className="flex items-start gap-2 text-sm break-words" key={key}><input type="checkbox" checked={selected.includes(key)} disabled={busy||(!selected.includes(key)&&selected.length>=REVIEWED_MAP_SAMPLE_LIMIT)} onChange={()=>choose(key)}/><span className="min-w-0">{a.name}<span className="block text-xs">{key}</span></span></label>;})}{!matches.length&&<p className="text-sm">No matching eligible accounts.</p>}</div>
   <button className="workspace-button" type="button" disabled={busy||!chosen.length||chosen.length!==selected.length} onClick={()=>void check()}>{busy?'Checking selected accounts…':'Check selected accounts'}</button>
   {status&&<p role="status" className="text-sm break-words">{status}</p>}
   {boundaryError&&<p role="status" className="text-sm">{boundaryError}</p>}
   <div className="flex flex-wrap gap-3 text-xs">{Object.entries(REVIEWED_MAP_LABELS).map(([key,label])=><span className="inline-flex items-center gap-1" key={key}><span aria-hidden="true" className="inline-block h-3 w-3 rounded-sm border border-slate-400" style={{background:REVIEWED_MAP_COLORS[key as keyof typeof REVIEWED_MAP_LABELS]}}/>{label}</span>)}<span className="inline-flex items-center gap-1"><span aria-hidden="true" className="inline-block h-3 w-3 rounded-sm border border-slate-400" style={{background:REVIEWED_MAP_COLORS.unchecked}}/>Not checked</span></div>
   {boundaries?.state===state&&boundaries.paths.length>0&&<svg viewBox="0 0 720 400" className="block w-full h-auto rounded border bg-white" role="group" aria-label={'County map for '+state}>
    {boundaries.paths.map(p=>{const rollup=geo?.byCounty[p.countyFips];const label=p.countyName+' · '+(rollup?rollup.sampled+' sampled; '+REVIEWED_MAP_LABELS[rollup.presence]:'not checked');return <path key={p.countyFips} d={p.svgPath} fill={rollup?REVIEWED_MAP_COLORS[rollup.presence]:REVIEWED_MAP_COLORS.unchecked} stroke={county===p.countyFips?'#182A46':'#66788C'} strokeWidth={county===p.countyFips?2.5:.7} vectorEffect="non-scaling-stroke" role="button" tabIndex={0} aria-label={label} aria-pressed={county===p.countyFips} onClick={()=>setCounty(p.countyFips)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setCounty(p.countyFips);}}}><title>{label}</title></path>;})}
   </svg>}
   <p className="text-xs">Bundled Census county outlines; color uses sampled accounts with explicit, consistent registry county FIPS. Purple can mean different accounts or product categories, not necessarily a mixed fleet. Unchecked and unavailable are not competitor or ZOLL accounts.</p>
   {geo&&live&&<>
    <p className="text-xs">Server sampling began {new Date(live.checkedAt).toLocaleString()} · expires after 5 minutes. Results are non-atomic, not a live inventory. {geo.unassigned} sampled accounts have no usable county assignment{geo.duplicateOrInvalid?'; '+geo.duplicateOrInvalid+' ambiguous rows excluded':''}.</p>
    <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">{Object.entries(geo.totals).map(([key,value])=><div key={key}><dt>{REVIEWED_MAP_LABELS[key as keyof typeof REVIEWED_MAP_LABELS]}</dt><dd className="font-semibold text-lg tabular-nums">{value}</dd></div>)}</dl>
    <label className="block text-sm">Inspect county<select className={control} value={county} onChange={e=>setCounty(e.target.value)}><option value="">All sampled accounts (including unassigned)</option>{boundaries?.state===state&&boundaries.refs.map(c=><option key={c.countyFips} value={c.countyFips}>{c.countyName} · {geo.byCounty[c.countyFips]?.sampled??0} sampled</option>)}</select></label>
    {!visible.length&&<p role="status" className="text-sm">No selected account was checked in this county. No equipment conclusion is available.</p>}
    <ul className="divide-y divide-slate-200 dark:divide-slate-700">{visible.map(r=><li key={sharedAgencyKey(r.agency)} className="py-3 space-y-1 min-w-0 break-words"><p className="font-semibold text-sm">{r.agency.name} · {r.agency.stateCode}</p><p className="text-sm">{REVIEWED_MAP_LABELS[r.presence]} · {r.countyFips?'County FIPS '+r.countyFips:'County unassigned'}</p>{r.reason&&<p className="text-xs">{r.reason}</p>}
     {r.observations.map(o=><div key={o.evidence.factId} className="text-xs space-y-1"><p>{o.evidence.value} · {o.evidence.documentDate} · {o.evidence.sourceName}</p><a className="underline break-all" href={o.evidence.sourceUrl} target="_blank" rel="noreferrer">Original reviewed source</a></div>)}
     {onOpenAgency&&<button type="button" className="workspace-button" onClick={()=>onOpenAgency(r.agency)}>Open original account</button>}
    </li>)}</ul>
   </>}
  </>}
  <p className="text-xs">Reviewed observations never overwrite saved agency fields, the existing map, or local opportunity scores. Unknown equipment is not evidence of absence.</p>
 </section>;
}
