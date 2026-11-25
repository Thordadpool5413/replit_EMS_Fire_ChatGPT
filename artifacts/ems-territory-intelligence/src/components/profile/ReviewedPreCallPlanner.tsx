import React,{useEffect,useRef,useState} from 'react';
import {useAuth} from '@workspace/replit-auth-web';
import type {Agency,FieldNote} from '../../types';
import {NextResearchActions} from './NextResearchActions';
import {providerIdentityReady} from '../../services/providerCompetitiveProfile';
import {facilityParents} from '../../services/departmentFacilities';
import {sharedAgencyKey} from '../../services/sharedEvidence';
import {evidenceEnabled,evidenceRole,openEvidenceSession,loadReviewedRadarRows} from '../../services/sharedEvidenceReplit';
import {buildReviewedCallContext,buildReviewedCallBrief,type ReviewedCallSample,type AuthorityCoverage} from '../../services/reviewedPreCallPlanning';
import type {LifecycleSample} from '../../services/lifecycleTimeline';
export function ReviewedPreCallPlanner({agency,directory,onOpenSources,onCreateTask}:{agency:Agency;directory:Agency[];onOpenSources:()=>void;onCreateTask:(id:string,task:FieldNote)=>Promise<void>}){
 const {user}=useAuth();
 return user?<PrivatePlanner key={user.id+':'+agency.id} agency={agency} directory={directory} onOpenSources={onOpenSources} onCreateTask={onCreateTask}/>:null;
}
function PrivatePlanner({agency,directory,onOpenSources,onCreateTask}:{agency:Agency;directory:Agency[];onOpenSources:()=>void;onCreateTask:(id:string,task:FieldNote)=>Promise<void>}){
 const {user}=useAuth();
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[selected,setSelected]=useState(''),[sample,setSample]=useState<{identity:string;data:ReviewedCallSample}>(),[copy,setCopy]=useState<'idle'|'copied'|'manual'>('idle');
 const request=useRef<AbortController|undefined>(undefined);
 const ready=providerIdentityReady(agency,directory),parent=facilityParents(agency).find(p=>p.source==='NERIS'),key=sharedAgencyKey(agency);
 const identity=JSON.stringify([agency.id,agency.name,agency.stateCode,agency.registryIdentity,agency.sourceRecordAssociations,ready,parent?.identifier]);
 const current=sample?.identity===identity?sample.data:undefined;
 function clear(){request.current?.abort();request.current=undefined;setSample(undefined);setSelected('');setCopy('idle');setBusy(false);setMessage('');}
 useEffect(()=>{clear();},[identity]);
 useEffect(()=>{const offline=()=>{clear();setMessage('Offline. Refresh reviewed evidence when connected.');};window.addEventListener('offline',offline);return()=>{request.current?.abort();window.removeEventListener('offline',offline);};},[]);
 useEffect(()=>{if(!current)return;const t=window.setTimeout(()=>{clear();setMessage('Reviewed sample expired. Refresh before using a brief.');},Math.max(0,current.started+300000-Date.now()));return()=>window.clearTimeout(t);},[current]);
 async function check(){
  if(!user||!ready||busy)return;clear();const c=new AbortController();request.current=c;setBusy(true);const data:ReviewedCallSample={agencyId:agency.id,started:Date.now()};
  const active=()=>request.current===c&&!c.signal.aborted;
  async function get(path:string){const r=await fetch(path,{credentials:'include',cache:'no-store',signal:AbortSignal.any([c.signal,AbortSignal.timeout(30000)])});if(!r.ok)throw Error('Source unavailable');return r.json();}
  try{
   if(evidenceEnabled&&key){setMessage('Checking reviewed department documents…');try{const session=openEvidenceSession();await evidenceRole(session,user);data.documents=await loadReviewedRadarRows(session,user,key);await evidenceRole(session,user);}catch{data.documents=undefined;}}
   if(!active())return;
   if(parent){setMessage('Checking reviewed station equipment…');try{data.station=await get('/api/agencies/'+encodeURIComponent(agency.id)+'/facilities/'+encodeURIComponent(parent.identifier)+'/equipment-conversion') as LifecycleSample;}catch{data.station=undefined;}}
   if(!active())return;
   setMessage('Checking documented authority categories…');try{data.authority=await get('/api/agencies/'+encodeURIComponent(agency.id)+'/authority-coverage') as AuthorityCoverage;}catch{data.authority=undefined;}
   if(!active())return;
   if(!navigator.onLine||Date.now()-data.started>=300000)throw Error('Sample expired or connection lost.');
   setSample({identity,data});setMessage('');
  }catch(e){if(active())setMessage(e instanceof Error?e.message:'Reviewed evidence unavailable.');}
  finally{if(active()){request.current=undefined;setBusy(false);}}
 }
 const context=buildReviewedCallContext(agency,directory,current),candidate=context.candidates.find(c=>c.key===selected);
 const brief=buildReviewedCallBrief(agency,candidate,context.roles),p=brief.points;
 async function copyBrief(){
  if(!current||Date.now()-current.started>=300000||selected&&!candidate)return;
  try{await navigator.clipboard.writeText(brief.text);setCopy('copied');}catch{setCopy('manual');}
 }
 return <section className="pcp-panel pcp-precall min-w-0" aria-label="Independently reviewed pre-call preparation">
  <button className="pcp-button min-h-11" type="button" aria-expanded={open} onClick={()=>{if(open)clear();setOpen(!open);}}>{open?'Close reviewed preparation':'Open reviewed pre-call preparation'}</button>
  {open&&<div className="pcp-body space-y-2">
   <p>Choose one independently reviewed document or station observation for the conversation. Separate authority categories are context only, never proof of a purchase owner. No external AI request or automatic save.</p>
   <button className="pcp-button min-h-11" type="button" disabled={busy||!ready} onClick={()=>void check()}>{busy?'Checking reviewed evidence…':'Check reviewed evidence'}</button>
   {!ready&&<p>Resolve provider identity before loading reviewed evidence.</p>}{message&&<p role="status">{message}</p>}
   {current&&<>
    <p className="text-xs">Department documents: {context.documentsChecked?'checked':'not available or incomplete'} · Station equipment: {context.stationsChecked?'checked':'not available or incomplete'} · Authority: {context.authorityChecked?'checked':'not available or incomplete'}. Sample expires after five minutes.</p>
    <NextResearchActions key={current.started+':'+identity} agency={agency} directory={directory} sample={current} onSelect={id=>{setSelected(id);setCopy('idle');}} onCreateTask={onCreateTask}/>
    <label className="pcp-focus-label">Primary conversation evidence<select className="pcp-select" value={selected} onChange={e=>{setSelected(e.target.value);setCopy('idle');}}><option value="">Discovery only (no source selected)</option>{context.candidates.map(c=><option key={c.key} value={c.key}>{c.scope} · {c.label}</option>)}</select></label>
    <p className="break-words">{brief.context}</p>{candidate?.sourceUrl&&<a className="pcp-link break-all" href={candidate.sourceUrl} target="_blank" rel="noopener noreferrer">Submitted evidence source</a>}
    <h4>Call objective</h4><p>{p.objective}</p>
    <h4>Three qualifying questions</h4><ol className="pcp-questions">{p.questions.map((q,i)=><li key={i}>{q}</li>)}</ol>
    <h4>Proposed next commitment</h4><p>{p.commitment}</p>
    <details><summary>Supporting preparation and roles</summary><p>{brief.preparation}</p><p>{p.opening}</p><p>{p.role}</p><p>{brief.roleNote}</p><p>Possible objection (hypothetical): {p.objection}</p><p>Suggested response: {p.response}</p></details>
    <p className="text-xs">Internal research draft. Reviewed dates and reported equipment are not necessarily current. Copy only for authorized internal use.</p>
    <button className="pcp-button min-h-11" type="button" disabled={!!selected&&!candidate} onClick={()=>void copyBrief()}>Copy internal reviewed brief</button>
    {copy==='copied'&&<p role="status">Brief copied for internal review.</p>}{copy==='manual'&&<textarea className="pcp-copy-text" readOnly rows={5} value={brief.text} aria-label="Internal reviewed brief"/>}
   </>}
   <button className="pcp-button min-h-11" type="button" onClick={onOpenSources}>Review original sources</button>
  </div>}
 </section>;
}
