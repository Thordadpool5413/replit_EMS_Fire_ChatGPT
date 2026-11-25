import React,{useEffect,useRef,useState} from 'react';
import type {ProfileAddressReview} from '../../services/multiStateAddressReview';
import {loadAgencyWorkspaceAccess,type AgencyWorkspaceAccess} from '../../services/agencyWorkspaceAccess';
import {loadFactReviews} from '../../services/factReviewStore';
import {activeCoordinateDecision,coordinateAcceptanceReview,validCoordinateSupportUrl,type CoordinateSnapshot,type CoordinateRequest} from '../../services/coordinateDecisionClient';
import {fetchCoordinateDecisionSnapshot,saveCoordinateDecision} from '../../utils/replitAgencyApi';
export function CoordinateDecisionPanel({agencyId,candidate}:{agencyId:string;candidate?:ProfileAddressReview}){
 const [open,setOpen]=useState(false),[revision,setRevision]=useState(0),[access,setAccess]=useState<AgencyWorkspaceAccess>(),[snapshot,setSnapshot]=useState<CoordinateSnapshot>(),[basis,setBasis]=useState(''),[url,setUrl]=useState(''),[attested,setAttested]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 const live=useRef(true),submitting=useRef(false);
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 useEffect(()=>{
  if(!open)return;
  const controller=new AbortController();setSnapshot(undefined);setAccess(undefined);setError('');
  void (async()=>{
   const role=await loadAgencyWorkspaceAccess();if(controller.signal.aborted)return;setAccess(role);
   if(role!=='editor'&&role!=='viewer')return;
   try{const value=await fetchCoordinateDecisionSnapshot(agencyId,controller.signal);if(!controller.signal.aborted)setSnapshot(value);}
   catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Private coordinate history unavailable.');}
  })();
  return()=>controller.abort();
 },[open,agencyId,revision]);
 const active=snapshot&&activeCoordinateDecision(snapshot);
 let reviewId:string|undefined;try{if(snapshot)reviewId=coordinateAcceptanceReview(candidate,snapshot,loadFactReviews(agencyId));}catch{/* malformed local history blocks acceptance */}
 const canEdit=access==='editor'&&!!snapshot&&snapshot.agencyId===agencyId&&!busy;
 const acceptReady=canEdit&&!!reviewId&&!!candidate&&basis.trim().length>0&&attested&&validCoordinateSupportUrl(url);
 async function submit(action:'accept'|'rollback'){
  if(submitting.current||!canEdit||!snapshot||!basis.trim()||action==='accept'&&!acceptReady||action==='rollback'&&!active)return;
  submitting.current=true;setBusy(true);setError('');setMessage('');
  try{
   const decision:CoordinateRequest=action==='accept'?{id:crypto.randomUUID(),action,sourceKey:candidate!.sourceIdentityKey,reviewId:reviewId!,reason:basis.trim(),supportingUrl:url.trim(),placementAttestation:'independently-checked-address-point',expectedRevision:snapshot.revision}:{id:crypto.randomUUID(),action,targetDecisionId:active!.id,reason:basis.trim(),expectedRevision:snapshot.revision};
   if(await loadAgencyWorkspaceAccess()!=='editor')throw Error('Editor access required.');
   const fresh=await fetchCoordinateDecisionSnapshot(agencyId);
   if(!live.current)return;
   if(fresh.revision!==decision.expectedRevision)throw Error('Provider record changed. Refresh and review again.');
   if(decision.action==='accept'&&coordinateAcceptanceReview(candidate,fresh,loadFactReviews(agencyId))!==decision.reviewId)throw Error('Current acknowledged confirmation required.');
   await saveCoordinateDecision(agencyId,decision);
   if(live.current){setMessage(action==='accept'?'Coordinate evidence accepted by the server. No public map pin was published.':'Rollback acknowledged. Original evidence remains in history.');setBasis('');setUrl('');setAttested(false);}
  }catch(e){if(live.current)setMessage((e instanceof Error?e.message:'Decision not acknowledged.')+' Check current server history before retrying.');}
  finally{if(live.current){setSnapshot(undefined);setRevision(n=>n+1);setBusy(false);}submitting.current=false;}
 }
 return <details className="acp-address-note break-words" onToggle={e=>setOpen(e.currentTarget.open)} data-testid="coordinate-decision-panel">
  <summary>Coordinate evidence decisions</summary>
  <p>Private review only. Acceptance does not establish an operational station or publish a map pin.</p>
  {open&&<>
   {!access&&<p>Checking workspace access…</p>}
   {access&&access!=='editor'&&access!=='viewer'&&<p>Authorized workspace access is required.</p>}
   {(access==='editor'||access==='viewer')&&!snapshot&&!error&&<p>Loading current server history…</p>}
   {error&&<p role="alert">{error}</p>}
   {snapshot&&<><p>{active?'Coordinate evidence accepted; not published.':'No active accepted coordinate.'}</p>{active&&<p>{active.matchedAddress} · {new Date(active.decidedAt).toLocaleString()}</p>}
   {snapshot.history.length>0&&<details><summary>Decision history ({snapshot.history.length})</summary><ol>{snapshot.history.map(e=><li key={e.id}>{e.action==='accept'?'Accepted evidence':'Rolled back evidence'} · {new Date(e.decidedAt).toLocaleString()}</li>)}</ol></details>}
   {access==='editor'&&<form onSubmit={e=>{e.preventDefault();void submit(active?'rollback':'accept');}}>
    {!active&&!reviewId&&<p>Acceptance requires current server-confirmed evidence, independent county verification and no shared source-point conflict.</p>}
    {(active||reviewId)&&<>
     <label className="block">Verification or rollback basis<textarea className="block w-full" rows={3} maxLength={4000} required value={basis} disabled={busy} onChange={e=>setBasis(e.target.value)}/></label>
     {!active&&<><label className="block">Independent supporting HTTPS record<input className="block w-full" type="url" maxLength={2000} required value={url} disabled={busy} onChange={e=>setUrl(e.target.value)}/></label><label className="block"><input type="checkbox" checked={attested} disabled={busy} onChange={e=>setAttested(e.target.checked)}/> I independently checked this address-point placement and supporting record. This does not verify station operation.</label></>}
     <button className="workspace-button min-h-11" type="submit" disabled={active?!canEdit||!basis.trim():!acceptReady}>{busy?'Recording…':active?'Rollback acceptance':'Accept coordinate evidence'}</button>
    </>}
   </form>}</>}
   {message&&<p role="status">{message}</p>}
   <button className="workspace-button min-h-11" type="button" disabled={busy} onClick={()=>{setSnapshot(undefined);setRevision(n=>n+1);setBasis('');setUrl('');setAttested(false);}}>Refresh server history</button>
  </>}
 </details>;
}
