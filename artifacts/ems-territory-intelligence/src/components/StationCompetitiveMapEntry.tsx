import React,{useEffect,useMemo,useRef,useState} from 'react';
import {useAuth} from '@workspace/replit-auth-web';
import type {Agency} from '../types';
import {facilityParents} from '../services/departmentFacilities';
import {classifyStationSample,STATION_STYLES,type StationSample} from '../services/stationCompetitiveMap';
import {FacilitySourceMap} from './profile/FacilitySourceMap';
import {StationOpportunityQueue} from './StationOpportunityQueue';
const control='block w-full min-w-0 rounded border bg-transparent p-2 text-base';
const LIMIT=5;
export function StationCompetitiveMapEntry({agencies,onOpenAgency}:{agencies:Agency[];onOpenAgency:(a:Agency)=>void}){
 const {user}=useAuth();
 return user?<StationCompetitiveMap key={user.id} agencies={agencies} onOpenAgency={onOpenAgency}/>:null;
}
function StationCompetitiveMap({agencies,onOpenAgency}:{agencies:Agency[];onOpenAgency:(a:Agency)=>void}){
 const [open,setOpen]=useState(false),[state,setState]=useState(''),[selected,setSelected]=useState<string[]>([]),[search,setSearch]=useState(''),[family,setFamily]=useState('all'),[days,setDays]=useState(365),[presence,setPresence]=useState('all'),[sample,setSample]=useState<{rows:StationSample[];errors:string[];scope:string;started:number}>(),[busy,setBusy]=useState(false),[status,setStatus]=useState('');
 const request=useRef<AbortController|undefined>(undefined);
 const eligible=useMemo(()=>agencies.flatMap(agency=>facilityParents(agency).filter(p=>p.source==='NERIS').map(parent=>({agency,parent}))),[agencies]);
 const states=[...new Set(eligible.map(a=>a.parent.stateCode))].sort();
 const scoped=eligible.filter(a=>a.parent.stateCode===state);
 const chosen=scoped.filter(a=>selected.includes(a.agency.id));
 const scope=JSON.stringify(chosen.map(a=>[a.agency.id,a.parent.identifier]).sort());
 const current=sample?.scope===scope?sample:undefined;
 const clear=()=>{request.current?.abort();request.current=undefined;setSample(undefined);setStatus('');setBusy(false);};
 useEffect(()=>{const offline=()=>{clear();setStatus('Connection changed. Refresh sample.');};window.addEventListener('offline',offline);return()=>{request.current?.abort();window.removeEventListener('offline',offline);};},[]);
 useEffect(()=>{if(!current)return;const timer=window.setTimeout(()=>{setSample(undefined);setStatus('Sample expired. Refresh before relying on it.');},Math.max(0,current.started+300000-Date.now()));return()=>window.clearTimeout(timer);},[current]);
 function select(id:string){clear();setSelected(prev=>prev.includes(id)?prev.filter(v=>v!==id):prev.length<LIMIT?[...prev,id]:prev);}
 async function check(){
  if(busy||!chosen.length||chosen.length!==selected.length||chosen.length>LIMIT)return;
  clear();const controller=new AbortController();request.current=controller;setBusy(true);const started=Date.now(),rows:StationSample[]=[],errors:string[]=[];
  try{
   for(const {agency,parent} of chosen){
    if(controller.signal.aborted)return;
    setStatus('Checking '+agency.name+'…');
    try{
     const r=await fetch('/api/agencies/'+encodeURIComponent(agency.id)+'/facilities/'+encodeURIComponent(parent.identifier)+'/equipment-map',{credentials:'include',cache:'no-store',signal:controller.signal});
     if(!r.ok){if(r.status===401||r.status===403)throw Error('Workspace authorization required.');errors.push(agency.name+' · source or saved identity unavailable');continue;}
     const data=await r.json() as StationSample;
     if(data.agencyId!==agency.id||data.parentId!==parent.identifier||!Array.isArray(data.facilities)||!Array.isArray(data.observations))throw Error('Unexpected sample response.');
     rows.push(data);
    }catch(e){if(controller.signal.aborted)return;if(e instanceof Error&&e.message==='Workspace authorization required.')throw e;errors.push(agency.name+' · unable to retrieve sample');}
   }
   if(controller.signal.aborted)return;
   if(!navigator.onLine||Date.now()-started>=300000)throw Error('Sample expired. Refresh with fewer departments.');
   setSample({rows,errors,scope,started});setStatus('');
  }catch(e){if(!controller.signal.aborted){setSample(undefined);setStatus(e instanceof Error?e.message:'Sample unavailable.');}}
  finally{if(request.current===controller){request.current=undefined;setBusy(false);}}
 }
 const result=current?classifyStationSample(current.rows,family,days,new Date().toISOString().slice(0,10)):undefined;
 const visible=result?.rows.filter(r=>presence==='all'||r.presence===presence)??[];
 const styles=Object.fromEntries(visible.map(r=>[r.facility.sourceRecordId!,STATION_STYLES[r.presence]]));
 const facilities=useMemo(()=>visible.map(r=>r.facility),[current,family,days,presence]);
 return <section className="pi-surface p-3 space-y-2 min-w-0" aria-label="Station competitive map">
  <button type="button" className="workspace-button min-h-11" aria-expanded={open} onClick={()=>{if(open)clear();setOpen(!open);}}>{open?'Close station competitive map':'Open station competitive map'}</button>
  {open&&<div className="space-y-3 text-sm">
   <p>Check up to {LIMIT} linked saved departments. Results show dated independently reviewed station observations, never market share or complete current inventory.</p>
   <label>Parent department state<select className={control} value={state} disabled={busy} onChange={e=>{clear();setState(e.target.value);setSelected([]);setSearch('');}}><option value="">Choose state</option>{states.map(s=><option key={s}>{s}</option>)}</select></label>
   {state&&<>
    <label>Find linked departments<input className={control} value={search} disabled={busy} onChange={e=>setSearch(e.target.value)}/></label>
    <p>{chosen.length}/{LIMIT} selected · {scoped.length} linked loaded accounts. Server confirms saved identities.</p>
    <div className="flex flex-wrap gap-2">{chosen.map(({agency})=><button className="workspace-button min-h-11 max-w-full break-words" key={agency.id} disabled={busy} onClick={()=>select(agency.id)}>Remove {agency.name}</button>)}</div>
    <div className="max-h-48 overflow-auto border rounded p-2">{scoped.filter(a=>(a.agency.name+' '+a.parent.identifier).toLowerCase().includes(search.toLowerCase())).slice(0,30).map(({agency,parent})=><label className="flex min-h-11 items-center gap-2 break-words" key={agency.id}><input type="checkbox" checked={selected.includes(agency.id)} disabled={busy||(!selected.includes(agency.id)&&selected.length>=LIMIT)} onChange={()=>select(agency.id)}/><span>{agency.name} · {parent.identifier}</span></label>)}</div>
    <button type="button" className="workspace-button min-h-11" disabled={busy||!chosen.length||chosen.length!==selected.length} onClick={()=>void check()}>{busy?'Checking sources…':'Check station evidence'}</button>
   </>}
   {status&&<p role="status">{status}</p>}
   {current&&result&&<>
    <p>{current.rows.length} of {chosen.length} departments returned a sample. {current.errors.length} unavailable. {result.ambiguous} duplicate station identities withheld; {result.withheldEvidence} evidence rows withheld. Sample expires after five minutes.</p>
    {current.errors.map((error,i)=><p key={i} className="text-xs break-words">{error}</p>)}
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
     <label>Equipment<select className={control} value={family} onChange={e=>setFamily(e.target.value)}><option value="all">All categories</option><option value="monitors">Monitor / defibrillator</option><option value="cpr">Mechanical CPR</option><option value="ventilators">Ventilator</option><option value="software">Software</option></select></label>
     <label>Observation age<select className={control} value={days} onChange={e=>setDays(Number(e.target.value))}><option value={90}>90 days</option><option value={365}>1 year</option><option value={730}>2 years</option></select></label>
     <label>Evidence<select className={control} value={presence} onChange={e=>setPresence(e.target.value)}><option value="all">All sampled stations</option>{Object.entries(STATION_STYLES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></label>
    </div>
    <div className="grid grid-cols-2 gap-2">{Object.entries(STATION_STYLES).map(([k,v])=><div key={k} className="border rounded p-2"><span style={{color:v.color}}>{v.label}</span><p className="font-semibold tabular-nums">{result.counts[k as keyof typeof result.counts]}</p></div>)}</div>
    <p>{result.mixedDepartments} sampled parent departments have both types of reviewed observations across their sampled stations. Older evidence is excluded by the age filter. Unknown does not mean absent.</p>
    <FacilitySourceMap facilities={facilities} styles={styles}/>
    <StationOpportunityQueue key={current.started+":"+current.scope} agencies={agencies} samples={current.rows} family={family} days={days} started={current.started} onOpenAgency={onOpenAgency}/>
    <p>{visible.filter(r=>!r.facility.coordinates).length} visible stations have no source coordinates. Actual station state is shown below; county is not inferred from department headquarters.</p>
    <ul className="divide-y">{visible.map(r=><li className="py-2 break-words" key={r.facility.sourceRecordId}><p className="font-semibold">{r.facility.name??'Station name not reported'} · {r.facility.stateCode}</p><p>{STATION_STYLES[r.presence].label} · {r.observations} dated observations · {r.older} older excluded{r.latest?' · latest '+r.latest:''}</p><p className="text-xs">Station {r.facility.sourceRecordId} · End-user validation required</p><button type="button" className="workspace-button min-h-11" onClick={()=>{const a=chosen.find(c=>c.agency.id===r.agencyId);if(a)onOpenAgency(a.agency);}}>Open parent profile</button></li>)}</ul>
   </>}
  </div>}
 </section>;
}
