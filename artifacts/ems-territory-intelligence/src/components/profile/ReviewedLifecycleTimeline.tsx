import React,{useEffect,useRef,useState} from 'react';
import {useAuth} from '@workspace/replit-auth-web';
import type {Agency} from '../../types';
import {facilityParents} from '../../services/departmentFacilities';
import {sharedAgencyKey} from '../../services/sharedEvidence';
import {evidenceEnabled,evidenceRole,openEvidenceSession,loadReviewedRadarRows} from '../../services/sharedEvidenceReplit';
import {buildReviewedRadar,type ReviewedSignal,type ReviewedEquipmentObservation} from '../../services/sharedOpportunityRadar';
import {buildLifecycleTimeline,lifecycleWindow,type LifecycleSample} from '../../services/lifecycleTimeline';
import {providerIdentityReady} from '../../services/providerCompetitiveProfile';
import {acceptedLifecycleSample} from '../../services/replacementResearch';
import {ReplacementResearchPanel} from './ReplacementResearchPanel';
import {ConversionResearchPanel} from './ConversionResearchPanel';
const labels={contract:'Agreement end',solicitation:'Published response date',acquisition:'Reported acquisition',warranty:'Reported warranty end',service:'Reported service agreement end'} as const;
const control='block w-full min-w-0 rounded border p-2 bg-transparent text-base';
export function ReviewedLifecycleTimeline({agency,directory}:{agency:Agency;directory:Agency[]}){
 const {user}=useAuth();return user?<PrivateLifecycle key={user.id+':'+agency.id} agency={agency} directory={directory}/>:null;
}
function PrivateLifecycle({agency,directory}:{agency:Agency;directory:Agency[]}){
 const {user}=useAuth();
 const [open,setOpen]=useState(false),[sample,setSample]=useState<{station?:LifecycleSample;signals:ReviewedSignal[];equipment:ReviewedEquipmentObservation[];stationStatus:string;parentStatus:string;started:number}>(),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[days,setDays]=useState(90),[filter,setFilter]=useState('all'),[page,setPage]=useState(1);
 const request=useRef<AbortController|undefined>(undefined);
 const parent=facilityParents(agency).find(p=>p.source==='NERIS'),key=sharedAgencyKey(agency);
 const ready=providerIdentityReady(agency,directory);
 const identity=JSON.stringify([agency.id,agency.name,agency.stateCode,parent?.identifier,key,ready]);
 function clear(){request.current?.abort();request.current=undefined;setSample(undefined);setBusy(false);setMessage('');setPage(1);}
 useEffect(()=>{clear();},[identity]);
 useEffect(()=>{const offline=()=>{clear();setMessage('Offline. Refresh when connected.');};window.addEventListener('offline',offline);return()=>{request.current?.abort();window.removeEventListener('offline',offline);};},[]);
 useEffect(()=>{if(!sample)return;const t=window.setTimeout(()=>{setSample(undefined);setMessage('Sample expired. Refresh evidence.');},Math.max(0,sample.started+300000-Date.now()));return()=>window.clearTimeout(t);},[sample]);
 async function check(){
  if(!user||busy||!ready)return;clear();const controller=new AbortController();request.current=controller;setBusy(true);const started=Date.now();
  let station:LifecycleSample|undefined,signals:ReviewedSignal[]=[],equipment:ReviewedEquipmentObservation[]=[],stationStatus='No exact linked NERIS department',parentStatus='Shared document workspace unavailable or identity not linked';
  try{
   if(parent){
    setMessage('Checking reviewed station dates…');
    try{const r=await fetch('/api/agencies/'+encodeURIComponent(agency.id)+'/facilities/'+encodeURIComponent(parent.identifier)+'/equipment-conversion',{credentials:'include',cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(30000)])});
     if(!r.ok)throw Error('Station source or workspace unavailable');
     const data=await r.json() as LifecycleSample;
     if(data.agencyId!==agency.id||data.parentId!==parent.identifier||!Array.isArray(data.stations)||!Array.isArray(data.observations))throw Error('Invalid station response');
     station=acceptedLifecycleSample(agency,directory,data,started);
     if(!station)throw Error('Incomplete or invalid station sample');
     stationStatus='Reviewed station sample retrieved';
    }catch{stationStatus='Station source or workspace unavailable';}
   }
   if(controller.signal.aborted)return;
   if(evidenceEnabled&&key&&directory.filter(a=>sharedAgencyKey(a)===key&&a.id!==agency.id).length===0){
    setMessage('Checking reviewed department documents…');
    try{const session=openEvidenceSession();await evidenceRole(session,user);const batch=await loadReviewedRadarRows(session,user,key);const result=buildReviewedRadar(agency,batch.rows,{complete:true,withheld:0});await evidenceRole(session,user);
     if(!result.complete)throw Error('Incomplete review');
     signals=result.signals;equipment=result.equipment;parentStatus='Reviewed department document sample retrieved';
    }catch{parentStatus='Reviewed department documents unavailable or incomplete';}
   }
   if(request.current!==controller||controller.signal.aborted)return;
   if(!navigator.onLine||Date.now()-started>=300000)throw Error('Sample expired or connection lost.');
   setSample({station,signals,equipment,stationStatus,parentStatus,started});setMessage('');
  }catch(e){if(request.current===controller)setMessage(e instanceof Error?e.message:'Lifecycle evidence unavailable.');}
  finally{if(request.current===controller){request.current=undefined;setBusy(false);}}
 }
 const today=new Date().toISOString().slice(0,10);
 const active=sample&&ready&&Date.now()-sample.started<300000?sample:undefined;
 const station=active?acceptedLifecycleSample(agency,directory,active.station,active.started):undefined;
 const events=active?buildLifecycleTimeline(station,active.signals,today):[];
 const rows=events.filter(e=>filter==='all'||lifecycleWindow(e,today,days)===filter),current=Math.min(page,Math.max(1,Math.ceil(rows.length/10)));
 return <section className="pi-surface p-3 space-y-2 min-w-0" aria-label="Reviewed contract and equipment lifecycle">
  <button type="button" className="workspace-button min-h-11" aria-expanded={open} onClick={()=>{if(open)clear();setOpen(!open);}}>{open?'Close reviewed lifecycle':'Open reviewed lifecycle timeline'}</button>
  {open&&<div className="space-y-3 text-sm">
   <p>Review documented dates by department or station. No assumed replacement cycles, auto-renewal dates, current coverage or purchase intent. Different observations may describe different equipment.</p>
   <button type="button" className="workspace-button min-h-11" disabled={busy||!ready} onClick={()=>void check()}>{busy?'Checking evidence…':'Check reviewed dates'}</button>
   {!ready&&<p>Resolve the unique provider identity before checking reviewed lifecycle evidence.</p>}{message&&<p role="status">{message}</p>}
   {active&&<>
    <p>{active.stationStatus}. {active.parentStatus}. Department review includes upcoming agreement end dates within one year and future response dates, not full contract history. Sample expires after five minutes.</p>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2"><label>Research window<select className={control} value={days} onChange={e=>{setDays(Number(e.target.value));setPage(1);}}>{[30,90,180,365].map(d=><option value={d} key={d}>{d} days</option>)}</select></label><label>Date view<select className={control} value={filter} onChange={e=>{setFilter(e.target.value);setPage(1);}}><option value="all">All reviewed date observations</option><option value="within-window">Within selected window</option><option value="later">Later dates</option><option value="history">Historical dates</option><option value="ambiguous">Different dates, scope to verify</option></select></label></div>
    <ReplacementResearchPanel key={identity+':'+active.started} agency={agency} directory={directory} station={station} started={active.started}/>
    <ConversionResearchPanel station={station} equipment={active.equipment} signals={active.signals} today={today} days={days}/>
    <p>{events.filter(e=>lifecycleWindow(e,today,days)==='within-window').length} date observations within window · {events.filter(e=>e.ambiguous).length} ambiguous date observations. Counts are observations, not unique assets or contracts.</p>
    {!rows.length&&<p>No matching reviewed dates in this sample. This does not establish that agreements or equipment are absent.</p>}
    <ol className="divide-y">{rows.slice((current-1)*10,current*10).map(e=><li className="py-2 break-words space-y-1" key={e.key}><p className="font-semibold">{e.date} · {labels[e.kind]}</p><p>{e.scope==='department'?'Department document':'Station observation'} · {e.label}</p><p className="text-xs">Evidence date {e.observedOn}{e.ambiguous?' · Multiple dates in this model/apparatus group; verify scope before prioritizing.':''}</p><p className="text-xs">{e.kind==='acquisition'?'Historical acquisition observation.':'Confirm current agreement, amendments and terms before action.'}</p>{e.sourceUrl&&<a href={e.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">Evidence source</a>}</li>)}</ol>
    <div className="flex gap-2 items-center"><button type="button" className="workspace-button min-h-11" disabled={current===1} onClick={()=>setPage(current-1)}>Previous</button><span>Page {current}</span><button type="button" className="workspace-button min-h-11" disabled={current*10>=rows.length} onClick={()=>setPage(current+1)}>Next</button></div>
   </>}
  </div>}
 </section>;
}
