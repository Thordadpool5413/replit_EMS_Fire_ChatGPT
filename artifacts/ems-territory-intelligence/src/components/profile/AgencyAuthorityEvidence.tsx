import React,{useRef,useState} from 'react';
import {useAuth} from '@workspace/replit-auth-web';
const roles={leadership:'Leadership',clinical:'Clinical / medical direction',operations:'Operations / fleet',biomedical:'Biomedical / technical evaluation',procurement:'Procurement process',budget:'Budget responsibility','final-approval':'Documented final approval',other:'Other / unclassified'} as const;
type Observation={name:string;title:string;organization:string;role:keyof typeof roles;scope:string;observedOn:string;basis:'official-document'|'agency-confirmation';sourceUrl:string;description:string};
type Row={submissionId:string;observation:Observation;decision:'accepted'|'rejected'|null;reviewNote:string|null;canReview:boolean};
type Data={identity:string;rows:Row[];withheld:number;more:boolean;canWrite:boolean};
const blank=():Observation=>({name:'',title:'',organization:'',role:'other',scope:'',observedOn:'',basis:'official-document',sourceUrl:'',description:''});
const control='block w-full min-w-0 rounded border p-2 text-base bg-transparent';
export function AgencyAuthorityEvidence({agencyId}:{agencyId:string}){
 const {user}=useAuth();return user?<PrivateAuthority key={user.id+':'+agencyId} agencyId={agencyId}/>:null;
}
function PrivateAuthority({agencyId}:{agencyId:string}){
 const [open,setOpen]=useState(false),[data,setData]=useState<Data>(),[draft,setDraft]=useState(blank),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[filter,setFilter]=useState('all'),[reviewId,setReviewId]=useState(''),[rationale,setRationale]=useState(''),[attest,setAttest]=useState(false);
 const pending=useRef<{identity:string;submissionId:string;observation:Observation}|undefined>(undefined);
 const url='/api/agencies/'+encodeURIComponent(agencyId)+'/authority';
 async function call(path:string,body?:unknown){const r=await fetch(path,{credentials:'include',cache:'no-store',...(body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});if(!r.ok){const e=await r.json().catch(()=>({}));throw Error(typeof e.error==='string'?e.error:'Private workspace access or validation failed.');}return r.json();}
 async function load(){setBusy(true);setNotice('');try{setData(await call(url) as Data);return true;}catch(e){setData(undefined);setNotice(e instanceof Error?e.message:'Evidence unavailable.');return false;}finally{setBusy(false);}}
 function change<K extends keyof Observation>(k:K,v:Observation[K]){setDraft(p=>({...p,[k]:v}));}
 async function save(){if(!data?.canWrite||busy)return;setBusy(true);setNotice('');
  if(!pending.current||pending.current.identity!==data.identity||JSON.stringify(pending.current.observation)!==JSON.stringify(draft))pending.current={identity:data.identity,submissionId:crypto.randomUUID(),observation:{...draft}};
  try{await call(url,pending.current);pending.current=undefined;setDraft(blank());const refreshed=await load();setNotice(refreshed?'Submitted for independent review.':'Saved; refresh the list to verify.');}catch(e){setNotice(e instanceof Error?e.message:'Save not confirmed.');}finally{setBusy(false);}
 }
 async function review(decision:'accepted'|'rejected'){if(!data?.canWrite||!reviewId||!rationale.trim()||!attest||busy)return;setBusy(true);setNotice('');
  try{await call(url+'/'+encodeURIComponent(reviewId)+'/review',{identity:data.identity,decision,note:rationale,attested:attest});setReviewId('');setRationale('');setAttest(false);const refreshed=await load();setNotice(refreshed?'Review recorded.':'Review recorded; refresh the list.');}catch(e){setNotice(e instanceof Error?e.message:'Review not confirmed.');}finally{setBusy(false);}
 }
 const rows=data?.rows.filter(r=>filter==='all'||(filter==='pending'?!r.decision:r.decision===filter))??[];
 return <section className="pi-surface p-3 space-y-2 min-w-0" aria-label="Documented decision authority">
  <button type="button" className="workspace-button min-h-11" disabled={busy} aria-expanded={open} onClick={()=>{if(open){setData(undefined);setNotice('');}else void load();setOpen(!open);}}>{open?'Close authority evidence':'Open documented decision authority'}</button>
  {open&&<div className="space-y-3 text-sm">
   <p>Professional role and purchasing scope only. A job title is not purchasing authority. No personal contact details or patient information. Dated reviewed claims are not proof of current authority.</p>
   {notice&&<p role="status" className="break-words">{notice}</p>}
   {busy&&<p role="status">Checking private workspace…</p>}
   {data&&<>
    <label>Review status<select className={control} value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All observations</option><option value="accepted">Independently reviewed</option><option value="pending">Awaiting review</option><option value="rejected">Rejected</option></select></label>
    {data.withheld>0&&<p>{data.withheld} older identity observations withheld. No automatic transfer to changed accounts.</p>}
    {data.more&&<p>Latest 100 observations only; not a complete directory.</p>}
    {!rows.length&&<p>No matching observations. Authority remains unknown.</p>}
    <ul className="divide-y">{rows.map(r=><li key={r.submissionId} className="py-2 space-y-1 break-words"><p className="font-semibold">{r.observation.name} · {r.observation.title}</p><p>{r.observation.organization} · {roles[r.observation.role]}</p><p>Scope: {r.observation.scope}</p><p className="text-xs">{r.observation.observedOn} · {r.decision==='accepted'?'Reviewed dated claim':r.decision==='rejected'?'Rejected':'Awaiting independent review'} · {r.observation.basis==='official-document'?'Official document submitted':'Agency confirmation reported'}</p><p>{r.observation.description}</p>{r.observation.sourceUrl&&<a className="underline" href={r.observation.sourceUrl} target="_blank" rel="noopener noreferrer">Submitted source</a>}{r.reviewNote&&<p>Review: {r.reviewNote}</p>}
     {r.canReview&&<button type="button" className="workspace-button min-h-11" disabled={busy} onClick={()=>{setReviewId(r.submissionId);setRationale('');setAttest(false);}}>Review claim</button>}
     {r.canReview&&reviewId===r.submissionId&&<div className="space-y-2"><label>Review rationale<textarea className={control} maxLength={1000} value={rationale} onChange={e=>setRationale(e.target.value)}/></label><label className="flex gap-2 items-start"><input type="checkbox" checked={attest} onChange={e=>setAttest(e.target.checked)}/>I independently checked the person, organization, stated responsibility and evidence scope.</label><div className="flex flex-wrap gap-2">{(['accepted','rejected'] as const).map(d=><button key={d} type="button" className="workspace-button min-h-11" disabled={busy||!attest||!rationale.trim()} onClick={()=>void review(d)}>{d==='accepted'?'Accept dated claim':'Reject claim'}</button>)}</div></div>}
    </li>)}</ul>
    {data.canWrite&&<form className="border-t pt-2 space-y-2" onSubmit={e=>{e.preventDefault();void save();}}>
     <h3 className="font-semibold">Record authority evidence</h3>
     <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {([['name','Professional name',160],['title','Reported title',200],['organization','Employing / purchasing organization',240],['scope','Documented decision scope',240]] as const).map(([k,label,max])=><label key={k}>{label}<input className={control} required maxLength={max} value={draft[k]} onChange={e=>change(k,e.target.value)}/></label>)}
      <label>Responsibility<select className={control} value={draft.role} onChange={e=>change('role',e.target.value as Observation['role'])}>{Object.entries(roles).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
      <label>Evidence date<input type="date" className={control} required min="1900-01-01" max={new Date().toISOString().slice(0,10)} value={draft.observedOn} onChange={e=>change('observedOn',e.target.value)}/></label>
      <label>Evidence basis<select className={control} value={draft.basis} onChange={e=>setDraft(p=>({...p,basis:e.target.value as Observation['basis'],sourceUrl:''}))}><option value="official-document">Official document</option><option value="agency-confirmation">Direct agency confirmation</option></select></label>
     </div>
     {draft.basis==='official-document'&&<label>Official source URL<input type="url" required maxLength={1500} className={control} value={draft.sourceUrl} onChange={e=>change('sourceUrl',e.target.value)}/></label>}
     <label>Evidence for the stated responsibility (not inferred from title)<textarea className={control} required maxLength={2000} rows={3} value={draft.description} onChange={e=>change('description',e.target.value)}/></label>
     <button type="submit" className="workspace-button min-h-11" disabled={busy}>Submit for independent review</button>
    </form>}
   </>}
  </div>}
 </section>;
}
