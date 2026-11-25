import React,{useEffect,useRef,useState} from 'react';
import type {ProfileAddressReview} from '../../services/multiStateAddressReview';
import {loadAgencyWorkspaceAccess} from '../../services/agencyWorkspaceAccess';
import {validatePrivateCoordinatePreview,privateCoordinateMapLink,type PrivateCoordinatePreview} from '../../services/privateCoordinateMap';
export function PrivateCoordinateMap({agencyId,candidate}:{agencyId:string;candidate:ProfileAddressReview}){
 const [point,setPoint]=useState<PrivateCoordinatePreview>(),[status,setStatus]=useState(''),[busy,setBusy]=useState(false);
 const request=useRef<AbortController|undefined>(undefined);
 const key=candidate.sourceIdentityKey,version=candidate.snapshotGeneratedAt;
 useEffect(()=>{
  const invalidate=()=>{request.current?.abort();setPoint(undefined);setBusy(false);setStatus('');};
  window.addEventListener('focus',invalidate);window.addEventListener('ems-reviews-changed',invalidate);window.addEventListener('ems-coordinate-decision-changed',invalidate);
  return()=>{request.current?.abort();window.removeEventListener('focus',invalidate);window.removeEventListener('ems-reviews-changed',invalidate);window.removeEventListener('ems-coordinate-decision-changed',invalidate);};
 },[agencyId,key,version]);
 async function check(){
  request.current?.abort();const controller=new AbortController();request.current=controller;setBusy(true);setPoint(undefined);setStatus('');
  try{
   const role=await loadAgencyWorkspaceAccess();if(controller.signal.aborted)return;
   if(role!=='editor'&&role!=='viewer')throw Error('Authorized workspace access required.');
   const response=await fetch('/api/agencies/'+encodeURIComponent(agencyId)+'/coordinate-map',{credentials:'include',cache:'no-store',signal:controller.signal});
   if(!response.ok)throw Error(response.status===422?'No current accepted coordinate. Complete the evidence review or refresh after rollback.':'Private map preview unavailable.');
   const p=validatePrivateCoordinatePreview(await response.json(),agencyId,candidate);
   if(!controller.signal.aborted){setPoint(p);setStatus('Current accepted address point available. Not a verified station.');}
  }catch(e){if(!controller.signal.aborted)setStatus(e instanceof Error?e.message:'Private map preview unavailable.');}
  finally{if(!controller.signal.aborted)setBusy(false);}
 }
 return <div className="acp-address-note" data-testid="private-coordinate-map">
  <p>Accepted address-point map preview · private workspace only</p>
  <button className="workspace-button min-h-11" type="button" disabled={busy} onClick={()=>void check()}>{busy?'Checking current evidence…':'Check accepted map point'}</button>
  {status&&<p role="status">{status}</p>}
  {point&&<a className="workspace-button min-h-11" href={privateCoordinateMapLink(point)} target="_blank" rel="noopener noreferrer">Open accepted address point in Google Maps</a>}
  <p>Map opening rechecks the current decision. Rollback or changed evidence blocks the link. National map coverage is unchanged.</p>
 </div>;
}
