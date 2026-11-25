import {useEffect,useRef,useState} from 'react';
import {useAuth} from '@workspace/replit-auth-web';
import type {Agency} from '../types';
import {sharedAgencyKey} from '../services/sharedEvidence';
import {evidenceEnabled,evidenceRole,openEvidenceSession,loadReviewedRadarRows} from '../services/sharedEvidenceReplit';
import {buildReviewedRadar} from '../services/sharedOpportunityRadar';
import {buildStationOpportunityQueue,type ParentDocumentSample,type ResearchPriority} from '../services/stationOpportunityQueue';
import type {StationSample} from '../services/stationCompetitiveMap';
import {OPPORTUNITY_LABELS} from '../services/opportunityRadar';
const labels:Record<ResearchPriority,string>={deadline:'Check documented deadline',funding:'Verify funding scope', 'equipment-check':'Confirm equipment and replacement timing','award-followup':'Review awarded procurement','research-gap':'Research gap'};
export function StationOpportunityQueue({agencies,samples,family,days,started,onOpenAgency}:{agencies:Agency[];samples:StationSample[];family:string;days:number;started:number;onOpenAgency:(a:Agency)=>void}){
 const {user}=useAuth();
 const [docs,setDocs]=useState<ParentDocumentSample[]>([]),[errors,setErrors]=useState<string[]>([]),[busy,setBusy]=useState(false),[checked,setChecked]=useState(false),[status,setStatus]=useState('');
 const request=useRef(0);
 useEffect(()=>{const invalidate=()=>{request.current++;setDocs([]);setErrors([]);setChecked(false);setBusy(false);setStatus('Connection changed. Refresh station sample.');};window.addEventListener('offline',invalidate);return()=>{request.current++;window.removeEventListener('offline',invalidate);};},[]);
 async function check(){
  if(!user||!evidenceEnabled||busy||Date.now()-started>=300000)return;
  const token=++request.current;const active=()=>request.current===token;
  setDocs([]);setErrors([]);setChecked(false);setStatus('');setBusy(true);
  try{
   const session=openEvidenceSession();await evidenceRole(session,user);
   const results:ParentDocumentSample[]=[],failures:string[]=[];
   for(const s of samples){
    if(!active())return;
    const a=agencies.find(a=>a.id===s.agencyId),key=a&&sharedAgencyKey(a);
    if(!a||!key||agencies.filter(v=>sharedAgencyKey(v)===key).length!==1){failures.push((a?.name??s.agencyId)+' · unambiguous shared identity unavailable');continue;}
    setStatus('Checking parent documents for '+a.name+'…');
    try{
     const batch=await loadReviewedRadarRows(session,user,key);
     const result=buildReviewedRadar(a,batch.rows,{complete:true,withheld:0});
     if(!result.complete){failures.push(a.name+' · review incomplete');continue;}
     results.push({agencyId:a.id,agencyKey:key,result});
    }catch{failures.push(a.name+' · reviewed documents unavailable');}
   }
   await evidenceRole(session,user);
   if(!active())return;
   if(!navigator.onLine||Date.now()-started>=300000)throw Error('Sample expired. Refresh station evidence.');
   setDocs(results);setErrors(failures);setChecked(true);setStatus('');
  }catch(e){if(active()){setDocs([]);setStatus(e instanceof Error?e.message:'Document check unavailable.');}}
  finally{if(active())setBusy(false);}
 }
 const result=buildStationOpportunityQueue(agencies,samples,docs,family,days,new Date().toISOString().slice(0,10));
 return <section className="border rounded p-3 space-y-2 min-w-0" aria-label="Territory opportunity research queue">
  <h3 className="font-semibold">Territory opportunity research queue</h3>
  <p className="text-xs">Selected parent departments only. Priority is an explicit research order, not purchase likelihood or revenue. Parent documents never establish a station-specific award, installed equipment or replacement deadline.</p>
  <button type="button" className="workspace-button min-h-11" disabled={!evidenceEnabled||!user||busy} onClick={()=>void check()}>{busy?'Checking reviewed documents…':'Check reviewed procurement and funding'}</button>
  {!evidenceEnabled&&<p className="text-xs">Shared public-document workspace not configured. Station evidence remains available separately.</p>}
  {status&&<p role="status">{status}</p>}
  {checked&&<p>{docs.length} parent document samples available; {errors.length} unavailable.</p>}
  {errors.map((e,i)=><p key={i} className="text-xs break-words">{e}</p>)}
  <p className="text-xs">{result.withheld} ambiguous parent samples withheld; {result.duplicateStations} duplicate station identities withheld. Product and age filters apply to station evidence only.</p>
  <ol className="divide-y">{result.rows.map(r=><li key={r.agency.id} className="py-2 space-y-1 break-words">
   <p className="font-semibold">{r.agency.name} · {r.agency.stateCode}</p>
   <p>{labels[r.priority]}{r.deadline?' · '+r.deadline:''}</p>
   <p className="text-xs">{r.stations} sampled station rows · {r.competitors.length} with dated other-maker observations · {r.unknown} unknown. No equipment absence inferred.</p>
   <p className="text-xs">{r.documentsAvailable?'Reviewed parent documents checked':'Parent document evidence not available or not checked'}</p>
   {r.signals.map(s=><div key={s.evidence.factId} className="border-l pl-2 text-xs"><p className="font-medium">Parent scope · {OPPORTUNITY_LABELS[s.kind]}</p><p>{s.evidence.value}</p><p>{s.evidence.sourceName} · {s.evidence.documentDate}{s.date?' · '+s.date:''}</p><a href={s.evidence.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">Original reviewed document</a><p>{s.nextAction}</p></div>)}
   {r.competitors.map(s=><p key={s.facility.sourceRecordId} className="text-xs">Station {s.facility.name??s.facility.sourceRecordId} · latest {s.latest} · confirm model, quantity and replacement cycle in the field.</p>)}
   <button type="button" className="workspace-button min-h-11" onClick={()=>onOpenAgency(r.agency)}>Open parent profile</button>
  </li>)}</ol>
 </section>;
}
