import React,{useRef,useState} from 'react';
import {useAuth} from '@workspace/replit-auth-web';
const families={monitors:'Monitor / defibrillator',cpr:'Mechanical CPR',ventilators:'Transport ventilator',software:'Software'} as const;
const makers={zoll:'ZOLL',stryker:'Stryker / Physio-Control',philips:'Philips',hamilton:'Hamilton Medical',weinmann:'WEINMANN',draeger:'Dräger',medtronic:'Medtronic',mindray:'Mindray',schiller:'SCHILLER','nihon-kohden':'Nihon Kohden',eso:'ESO',imagetrend:'ImageTrend',other:'Other (unclassified)',unknown:'Unknown'} as const;
type Observation={family:keyof typeof families;maker:keyof typeof makers;model:string;apparatus:string;observedOn:string;basis:'direct-observation'|'public-document';sourceUrl:string;description:string;quantity?:number;quantityScope?:'observed-units'|'documented-station-total';acquiredOn?:string;warrantyEnd?:string;serviceEnd?:string};
type Row={submissionId:string;observation:Observation;decision:'accepted'|'rejected'|null;reviewNote:string|null;canReview:boolean;reviewedAt:string|null};
type Data={rows:Row[];more:boolean;canWrite:boolean};
const initial=():Observation=>({family:'monitors',maker:'unknown',model:'',apparatus:'',observedOn:'',basis:'direct-observation',sourceUrl:'',description:''});
const control='block w-full min-w-0 rounded border bg-transparent p-2 text-base';
function vendor(r:Row){return r.observation.maker==='zoll'?'zoll':r.observation.maker==='unknown'||r.observation.maker==='other'?'unknown':'competitor';}
export function FacilityEquipment({agencyId,parentId,stationId}:{agencyId:string;parentId:string;stationId:string}){
 const {user}=useAuth();
 return user?<PrivateEquipment key={user.id+':'+agencyId+':'+parentId+':'+stationId} agencyId={agencyId} parentId={parentId} stationId={stationId}/>:null;
}
function PrivateEquipment({agencyId,parentId,stationId}:{agencyId:string;parentId:string;stationId:string}){
 const [open,setOpen]=useState(false),[data,setData]=useState<Data>(),[draft,setDraft]=useState(initial),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[family,setFamily]=useState('all'),[filter,setFilter]=useState('all'),[reviewId,setReviewId]=useState(''),[reviewNote,setReviewNote]=useState(''),[attested,setAttested]=useState(false);
 const pending=useRef<{submissionId:string;observation:Observation}|undefined>(undefined);
 const url='/api/agencies/'+encodeURIComponent(agencyId)+'/facilities/'+encodeURIComponent(parentId)+'/'+encodeURIComponent(stationId)+'/equipment';
 async function call(path:string,body?:unknown){const r=await fetch(path,{credentials:'include',cache:'no-store',...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});if(!r.ok){const error=await r.json().catch(()=>({}));throw Error(typeof error.error==='string'?error.error:'Workspace authorization or source check failed.');}return r.json();}
 async function load(){setBusy(true);setMessage('');try{setData(await call(url) as Data);return true;}catch(e){setData(undefined);setMessage(e instanceof Error?e.message:'Equipment unavailable.');return false;}finally{setBusy(false);}}
 function change<K extends keyof Observation>(key:K,value:Observation[K]){setDraft(prev=>({...prev,[key]:value}));}
 async function save(){if(busy||!data?.canWrite)return;
  if(!pending.current||JSON.stringify(pending.current.observation)!==JSON.stringify(draft))pending.current={submissionId:crypto.randomUUID(),observation:{...draft}};
  setBusy(true);setMessage('');try{await call(url,pending.current);pending.current=undefined;setDraft(initial());const refreshed=await load();setMessage(refreshed?'Observation saved for independent review.':'Observation saved, but list refresh failed. Reopen to check.');}catch(e){setMessage(e instanceof Error?e.message:'Save not confirmed. Retry the same draft.');}finally{setBusy(false);}
 }
 async function review(decision:'accepted'|'rejected'){if(busy||!attested||!reviewNote.trim()||!reviewId)return;setBusy(true);setMessage('');try{await call(url+'/'+encodeURIComponent(reviewId)+'/review',{decision,note:reviewNote,attested});setReviewId('');setReviewNote('');setAttested(false);const refreshed=await load();setMessage(refreshed?'Review recorded. This is a dated observation, not proof of current ownership.':'Review recorded, but list refresh failed. Reopen to check.');}catch(e){setMessage(e instanceof Error?e.message:'Review not confirmed.');}finally{setBusy(false);}}
 const rows=data?.rows.filter(r=>(family==='all'||r.observation.family===family)&&(filter==='all'||(filter==='pending'?!r.decision:filter==='rejected'?r.decision==='rejected':r.decision==='accepted'&&vendor(r)===filter)))??[];
 return <div className="mt-2 min-w-0 text-xs">
  <button type="button" className="workspace-button min-h-11" disabled={busy} aria-expanded={open} onClick={()=>{setOpen(!open);if(!open)void load();}}>{open?'Hide equipment intelligence':'Equipment intelligence'}</button>
  {open&&<div className="mt-2 space-y-2">
   <p>Dated station-specific observations only. Do not include patient information. Reported quantities and lifecycle dates are scoped to each dated observation. Do not add them together or assume current ownership or replacement timing.</p>
   {message&&<p role="status" className="break-words">{message}</p>}{busy&&<p role="status">Checking private workspace…</p>}
   {data&&<>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
     <label>Category<select className={control} value={family} onChange={e=>setFamily(e.target.value)}><option value="all">All categories</option>{Object.entries(families).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
     <label>Evidence filter<select className={control} value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All observations</option><option value="zoll">Reviewed ZOLL</option><option value="competitor">Reviewed other named manufacturers</option><option value="unknown">Reviewed unclassified</option><option value="pending">Awaiting review</option><option value="rejected">Rejected</option></select></label>
    </div>
    {!rows.length&&<p>No matching observations. This is not evidence of equipment absence.</p>}
    <ul className="space-y-2">{rows.map(r=><li key={r.submissionId} className="border-t pt-2 break-words">
      <p className="font-semibold">{families[r.observation.family]} · {makers[r.observation.maker]}</p>
      <p>{r.observation.model||'Model not reported'}{r.observation.apparatus?' · Apparatus: '+r.observation.apparatus:''}</p>
      <p>{r.observation.observedOn} · {r.observation.basis==='public-document'?'Public document':'Direct observation'} · {r.decision==='accepted'?'Reviewed dated observation':r.decision==='rejected'?'Rejected':'Awaiting independent review'}</p>
      {(r.observation.quantity!==undefined||r.observation.acquiredOn||r.observation.warrantyEnd||r.observation.serviceEnd)&&<dl className="grid grid-cols-2 gap-2 text-xs border rounded p-2">
       {r.observation.quantity!==undefined&&<div><dt>Reported quantity</dt><dd className="font-semibold">{r.observation.quantity} · {r.observation.quantityScope==='documented-station-total'?'Documented station total':'Observed units only'}</dd></div>}
       {r.observation.acquiredOn&&<div><dt>Reported acquisition</dt><dd>{r.observation.acquiredOn}</dd></div>}
       {r.observation.warrantyEnd&&<div><dt>Reported warranty end</dt><dd>{r.observation.warrantyEnd}</dd></div>}
       {r.observation.serviceEnd&&<div><dt>Reported service agreement end</dt><dd>{r.observation.serviceEnd}</dd></div>}
      </dl>}
      <p className="whitespace-pre-wrap">{r.observation.description}</p>
      {r.observation.sourceUrl&&<a className="underline" href={r.observation.sourceUrl} target="_blank" rel="noopener noreferrer">Submitted source</a>}
      {r.reviewNote&&<p>Review: {r.reviewNote}</p>}
      {r.canReview&&<button type="button" className="workspace-button min-h-11" disabled={busy} onClick={()=>{setReviewId(r.submissionId);setReviewNote('');setAttested(false);}}>Review observation</button>}
      {r.canReview&&reviewId===r.submissionId&&<div className="space-y-2"><label>Review rationale<textarea className={control} maxLength={1000} value={reviewNote} onChange={e=>setReviewNote(e.target.value)}/></label><label className="flex items-start gap-2"><input type="checkbox" checked={attested} onChange={e=>setAttested(e.target.checked)}/>I independently reviewed the dated evidence and its station attribution.</label><div className="flex flex-wrap gap-2"><button type="button" className="workspace-button min-h-11" disabled={busy||!attested||!reviewNote.trim()} onClick={()=>void review('accepted')}>Accept observation</button><button type="button" className="workspace-button min-h-11" disabled={busy||!attested||!reviewNote.trim()} onClick={()=>void review('rejected')}>Reject</button></div></div>}
    </li>)}</ul>
    {data.more&&<p>Only the latest 100 observations are displayed. Filters apply to these rows.</p>}
    {data.canWrite&&<form className="border-t pt-2 space-y-2" onSubmit={e=>{e.preventDefault();void save();}}>
     <p className="font-semibold">Record equipment evidence</p>
     <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <label>Category<select className={control} value={draft.family} onChange={e=>setDraft(prev=>({...prev,family:e.target.value as Observation['family'],quantity:undefined,quantityScope:undefined}))}>{Object.entries(families).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
      <label>Manufacturer<select className={control} value={draft.maker} onChange={e=>change('maker',e.target.value as Observation['maker'])}>{Object.entries(makers).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
      <label>Model (if known)<input className={control} maxLength={120} value={draft.model} onChange={e=>change('model',e.target.value)}/></label>
      <label>Apparatus ID (if known)<input className={control} maxLength={120} value={draft.apparatus} onChange={e=>change('apparatus',e.target.value)}/></label>
      <label>Observation date<input className={control} type="date" required max={new Date().toISOString().slice(0,10)} value={draft.observedOn} onChange={e=>change('observedOn',e.target.value)}/></label>
      <label>Evidence type<select className={control} value={draft.basis} onChange={e=>setDraft(prev=>({...prev,basis:e.target.value as Observation['basis'],sourceUrl:'',quantity:undefined,quantityScope:undefined}))}><option value="direct-observation">Direct observation</option><option value="public-document">Public document</option></select></label>
     </div>
     {draft.basis==='public-document'&&<label>Public source URL<input type="url" required maxLength={1500} className={control} value={draft.sourceUrl} onChange={e=>change('sourceUrl',e.target.value)}/></label>}
     <details className="border rounded p-2">
      <summary className="font-semibold cursor-pointer min-h-11">Inventory and lifecycle evidence (optional)</summary>
      <p className="mt-1 mb-2">Enter only quantities and exact dates supported by the observation. No estimates, serial numbers, patient data or predicted replacement dates.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
       {draft.family!=='software'&&<>
        <label>Reported quantity<input className={control} type="number" min={1} max={100000} step={1} value={draft.quantity??''} onChange={e=>setDraft(prev=>({...prev,quantity:e.target.value===''?undefined:Number(e.target.value),quantityScope:e.target.value===''?undefined:prev.quantityScope??'observed-units'}))}/></label>
        {draft.quantity!==undefined&&<label>Quantity scope<select className={control} value={draft.quantityScope??'observed-units'} onChange={e=>change('quantityScope',e.target.value as Observation['quantityScope'])}><option value="observed-units">Units observed only</option>{draft.basis==='public-document'&&<option value="documented-station-total">Documented station total</option>}</select></label>}
       </>}
       <label>Acquisition date<input className={control} type="date" min="1900-01-01" max={draft.observedOn||new Date().toISOString().slice(0,10)} value={draft.acquiredOn??''} onChange={e=>change('acquiredOn',e.target.value||undefined)}/></label>
       <label>Warranty end<input className={control} type="date" min={draft.acquiredOn||'1900-01-01'} max="2100-12-31" value={draft.warrantyEnd??''} onChange={e=>change('warrantyEnd',e.target.value||undefined)}/></label>
       <label>Service agreement end<input className={control} type="date" min={draft.acquiredOn||'1900-01-01'} max="2100-12-31" value={draft.serviceEnd??''} onChange={e=>change('serviceEnd',e.target.value||undefined)}/></label>
      </div>
      {draft.quantity!==undefined&&!draft.model.trim()&&<p role="status">A model is required when reporting quantity.</p>}
     </details>
     <label>What was observed and how does it relate to this station?<textarea className={control} required rows={3} maxLength={2000} value={draft.description} onChange={e=>change('description',e.target.value)}/></label>
     <button type="submit" className="workspace-button min-h-11" disabled={busy||!draft.description.trim()||!draft.observedOn||(draft.quantity!==undefined&&!draft.model.trim())}>Submit for review</button>
    </form>}
   </>}
  </div>}
 </div>;
}
