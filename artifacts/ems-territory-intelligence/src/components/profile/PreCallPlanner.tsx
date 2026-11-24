import React,{useEffect,useMemo,useState} from 'react';
import {ClipboardList,Copy,ExternalLink} from 'lucide-react';
import type {Agency} from '../../types';
import {buildPreCallPlan,CALL_FOCUS_LABELS,formatPreCallPlan,type CallFocus,type CallPlan} from '../../services/preCallPlanning';
import {utcDay} from '../../services/documentedIntelligence';
const labels={'document-led':'Dated local source','discovery':'Discovery only','identity-review':'Identity review required','evidence-review':'Evidence review required'} as const;

function CopyPlan({plan}:{plan:CallPlan}){
 const [status,setStatus]=useState<'idle'|'copying'|'copied'|'manual'>('idle');
 const text=formatPreCallPlan(plan);
 async function copy(){
  setStatus('copying');
  try{if(!navigator.clipboard?.writeText)throw Error('Clipboard unavailable');await navigator.clipboard.writeText(text);setStatus('copied');}
  catch{setStatus('manual');}
 }
 return <div className="pcp-copy">
  <button className="pcp-button" type="button" disabled={status==='copying'} onClick={()=>void copy()}><Copy size={16} aria-hidden="true"/>{status==='copying'?'Copying…':'Copy preparation brief'}</button>
  {status==='copied'&&<p role="status">Brief copied. Review it before sharing.</p>}
  {status==='manual'&&<><p role="status">Clipboard unavailable. Select and copy this text manually.</p><textarea className="pcp-copy-text" aria-label="Copyable preparation brief" readOnly rows={5} value={text}/></>}
 </div>;
}
export function PreCallPlanner({agency,directory,onOpenSources}:{agency:Agency;directory:Agency[];onOpenSources:()=>void}){
 const [focus,setFocus]=useState<CallFocus>('recommended'),[day,setDay]=useState(()=>utcDay(Date.now()));
 useEffect(()=>{const t=window.setInterval(()=>setDay(utcDay(Date.now())),60_000);return()=>window.clearInterval(t);},[]);
 const plan=useMemo(()=>buildPreCallPlan(agency,directory,focus),[agency,directory,focus,day]);
 const p=plan.points,e=plan.source;
 return <section className="pcp-panel pcp-precall" aria-label="Evidence-based pre-call plan" data-testid="provider-precall-planner">
  <div className="pcp-heading"><ClipboardList size={20} aria-hidden="true"/><div><h3>Pre-call plan</h3><p>One objective. Three qualifying questions. One proposed next step.</p></div></div>
  <div className="pcp-body">
   <label className="pcp-focus-label">Conversation focus<select className="pcp-select" data-testid="precall-focus" value={focus} onChange={e=>setFocus(e.target.value as CallFocus)}>{Object.entries(CALL_FOCUS_LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
   <p className="pcp-status" data-testid="precall-context-status">{labels[plan.status]} · {plan.topic}{plan.priority?' · '+plan.priority:''}</p>
   <h4>Call objective</h4><p className="pcp-value" data-testid="precall-objective">{p.objective}</p>
   <h4>Three qualifying questions</h4><ol className="pcp-questions" data-testid="precall-questions">{p.questions.map((q,i)=><li key={i}>{q}</li>)}</ol>
   <h4>Proposed next commitment</h4><p>{p.commitment}</p>
   <details className="pcp-precall-details"><summary>Supporting context & conversation preparation</summary><div className="pcp-body">
    <p>{plan.context}</p><p><strong>Before contact:</strong> {plan.preparation}</p>
    {e&&<><p>{e.sourceName} · document {e.documentDate} · record {e.sourceRecordId}</p><a className="pcp-link" href={e.sourceUrl} target="_blank" rel="noreferrer">Original supporting document <ExternalLink size={14} aria-hidden="true"/></a></>}
    <h4>Suggested opening</h4><p>{p.opening}</p><h4>Roles to confirm</h4><p>{p.role}</p>
    <h4>Possible objection (hypothetical)</h4><p>{p.objection}</p><h4>Suggested response</h4><p>{p.response}</p>
    {plan.reviewNote&&<p>{plan.reviewNote}</p>}
   </div></details>
   <p>Research draft only · {plan.asOf} UTC. No buying intent, named decision maker or customer objection is assumed. Confirm sources and communication rules. No automatic save or external AI request.</p>
   <div className="pcp-actions"><CopyPlan key={formatPreCallPlan(plan)} plan={plan}/><button className="pcp-button" type="button" onClick={onOpenSources}>Review sources</button></div>
  </div>
 </section>;
}
