import React,{useEffect,useRef,useState} from 'react';
import {useAuth} from '@workspace/replit-auth-web';
import type {Agency} from '../../types';
import {displayedProviderLocation,mappedProviderLocation,locationStatus,useLocationRevision} from '../../services/providerLocation';
import {isPhysicalStreet} from '../../services/providerLocationContract';
import {facilityParents} from '../../services/departmentFacilities';
import {providerIdentityReady} from '../../services/providerCompetitiveProfile';
import {sharedAgencyKey} from '../../services/sharedEvidence';
import {evidenceEnabled,evidenceRole,openEvidenceSession,loadReviewedRadarRows} from '../../services/sharedEvidenceReplit';
import {buildReviewedRadar} from '../../services/sharedOpportunityRadar';
import type {LifecycleSample} from '../../services/lifecycleTimeline';
import {buildIntelligenceCoverage,LABELS,type CoverageInput,type Status} from '../../services/intelligenceCoverage';
const labels:Record<Status,string>={reviewed:'Reviewed evidence',documented:'Source documented',partial:'Partial evidence','not-documented':'Not found in checked evidence','not-checked':'Not fully checked','review-required':'Review required'};
const blank=():Omit<CoverageInput,'location'>=>({documentStatus:'not-checked',stationStatus:'not-checked',authorityStatus:'not-checked'});
export function coverageLocation(agency:Agency,directory:Agency[]):CoverageInput['location']{
 const loc=displayedProviderLocation(agency,directory),pin=mappedProviderLocation(agency,directory);
 return {address:!!loc&&isPhysicalStreet(loc.address.street),mapped:!!pin,detail:locationStatus(agency,directory)};
}
export function ProviderIntelligenceCoverage({agency,directory,onReview}:{agency:Agency;directory:Agency[];onReview:()=>void}){
 const {user}=useAuth();
 return <Coverage key={(user?.id??'public')+':'+agency.id} agency={agency} directory={directory} onReview={onReview}/>;
}
function Coverage({agency,directory,onReview}:{agency:Agency;directory:Agency[];onReview:()=>void}){
 const {user}=useAuth();useLocationRevision();
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[snapshot,setSnapshot]=useState<{data:Omit<CoverageInput,'location'>;started:number;identity:string}>();
 const request=useRef<AbortController|undefined>(undefined);
 const ready=providerIdentityReady(agency,directory),parent=facilityParents(agency).find(p=>p.source==='NERIS'),key=sharedAgencyKey(agency);
 const identity=JSON.stringify([agency.id,agency.name,agency.stateCode,agency.registryIdentity,agency.sourceRecordAssociations,ready,parent?.identifier]);
 const current=snapshot?.identity===identity?snapshot:undefined;
 function clear(){request.current?.abort();request.current=undefined;setSnapshot(undefined);setBusy(false);setMessage('');}
 useEffect(()=>{clear();},[identity]);
 useEffect(()=>{const offline=()=>{clear();setMessage('Offline. Refresh when connected.');};window.addEventListener('offline',offline);return()=>{request.current?.abort();window.removeEventListener('offline',offline);};},[]);
 useEffect(()=>{if(!current)return;const t=window.setTimeout(()=>{clear();setMessage('Reviewed sample expired. Refresh evidence.');},Math.max(0,current.started+300000-Date.now()));return()=>window.clearTimeout(t);},[current]);
 async function check(){
  if(!user||busy||!ready)return;clear();const c=new AbortController(),started=Date.now();request.current=c;setBusy(true);
  const data=blank();
  const get=async(path:string)=>{const r=await fetch(path,{credentials:'include',cache:'no-store',signal:AbortSignal.any([c.signal,AbortSignal.timeout(30000)])});if(!r.ok)throw Error('Unavailable');return r.json();};
  try{
   if(evidenceEnabled&&key){setMessage('Checking reviewed public documents…');try{const session=openEvidenceSession();await evidenceRole(session,user);const batch=await loadReviewedRadarRows(session,user,key);const result=buildReviewedRadar(agency,batch.rows,{complete:true,withheld:0});await evidenceRole(session,user);data.documents=result;data.documentStatus=result.complete?'checked':'unavailable';}catch{data.documentStatus='unavailable';}}
   if(c.signal.aborted)return;
   if(parent){setMessage('Checking station equipment evidence…');try{const s=await get('/api/agencies/'+encodeURIComponent(agency.id)+'/facilities/'+encodeURIComponent(parent.identifier)+'/equipment-conversion') as LifecycleSample;
    if(s.agencyId!==agency.id||s.parentId!==parent.identifier||!Array.isArray(s.stations)||!Array.isArray(s.observations)||s.acceptedRowsChecked!==s.observations.length)throw Error('Incomplete station review');data.station=s;data.stationStatus='checked';}catch{data.stationStatus='unavailable';}}
   if(c.signal.aborted)return;
   setMessage('Checking reviewed decision authority…');try{const a=await get('/api/agencies/'+encodeURIComponent(agency.id)+'/authority-coverage');if(a.agencyId!==agency.id||a.name!==agency.name||a.stateCode!==agency.stateCode||a.complete!==true||!Number.isSafeInteger(a.recentReviewed)||a.recentReviewed<0)throw Error('Incomplete authority review');data.authority=a;data.authorityStatus='checked';}catch{data.authorityStatus='unavailable';}
   if(request.current!==c||c.signal.aborted)return;
   if(!navigator.onLine||Date.now()-started>=300000)throw Error('Sample expired or connection lost.');
   setSnapshot({data,started,identity});setMessage('');
  }catch(e){if(request.current===c)setMessage(e instanceof Error?e.message:'Review unavailable.');}
  finally{if(request.current===c){request.current=undefined;setBusy(false);}}
 }
 const data=current?.data??blank(),result=buildIntelligenceCoverage(agency,directory,{...data,location:coverageLocation(agency,directory)});
 return <section className="pi-surface p-3 space-y-2 min-w-0" aria-label="Provider intelligence coverage">
  <button type="button" className="workspace-button min-h-11" aria-expanded={open} onClick={()=>{if(open)clear();setOpen(!open);}}>{open?'Close intelligence coverage':'Open intelligence coverage'}</button>
  {open&&<div className="space-y-2 text-sm">
   <p className="font-semibold">{result.documented}/{result.total} categories with eligible evidence · {result.reviewed} independently reviewed</p>
   <progress className="w-full" max={result.total} value={result.documented} aria-label="Categories with eligible evidence"/>
   <p className="text-xs">Observed lower bound: {result.percent}% of eight equally weighted categories have at least one eligible observation. Not full inventory, current accuracy, validation or sales probability. Unchecked sources can change this result.</p>
   <ul className="divide-y">{result.items.map(i=><li className="py-2 break-words" key={i.domain}><p className="font-semibold">{LABELS[i.domain]} · {labels[i.status]}</p><p className="text-xs">{i.detail}</p></li>)}</ul>
   <p className="text-xs">Shared documents: {data.documentStatus} · Station evidence: {data.stationStatus} · Authority evidence: {data.authorityStatus}. Private checks expire after five minutes; location is source-reported, not end-user validation.</p>
   {user&&<button type="button" className="workspace-button min-h-11" disabled={busy||!ready} onClick={()=>void check()}>{busy?'Checking reviewed evidence…':'Check reviewed sources'}</button>}
   {!ready&&<p>Resolve native identity before checking private evidence.</p>}{message&&<p role="status">{message}</p>}
   <button type="button" className="workspace-button min-h-11" onClick={onReview}>Open sources and review</button>
  </div>}
 </section>;
}
