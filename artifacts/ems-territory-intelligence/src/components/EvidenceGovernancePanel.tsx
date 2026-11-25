import React,{useState} from 'react';
import type {AuthUser} from '@workspace/replit-auth-web';
import { DECISION_ACTIONS, DECISION_REASONS, validDecisionDraft, type DecisionAction } from '../services/sharedEvidenceGovernance';
import { loadEvidenceDecisions, recordEvidenceDecision, type EvidenceSession, type EvidenceRole, type PublishedEvidence } from '../services/sharedEvidenceReplit';
const control='block w-full min-w-0 rounded border p-2 bg-transparent text-base';
const labels={approved:'Source reviewed',challenged:'Challenged',withdrawn:'Withdrawn',superseded:'Superseded',pending:'Not yet reviewed',unavailable:'Review state unavailable'} as const;
const actions={approved:'Approve source observation',challenged:'Challenge observation',withdrawn:'Withdraw observation',superseded:'Link approved correction'} as const;
export function EvidenceGovernancePanel({session,user,role,record,records,onReviewChange}:{session:EvidenceSession;user:AuthUser;role:EvidenceRole;record:PublishedEvidence;records:PublishedEvidence[];onReviewChange?:()=>void}){
  const [result,setResult]=useState<Awaited<ReturnType<typeof loadEvidenceDecisions>>>();
  const [action,setAction]=useState<DecisionAction>('approved');
  const [reason,setReason]=useState<string>(DECISION_REASONS.approved[0]);
  const [replacementId,setReplacementId]=useState('');
  const [confirmed,setConfirmed]=useState(false);
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState('');
  const e=record.evidence;
  const draft={action,reason,replacementId:action==='superseded'?replacementId:''};
   const available=DECISION_ACTIONS.filter(a=>!result?.decisions.some(d=>d.action===a)&&(a!=='approved'||(result?.status==='pending'&&record.authorIdentityMapped&&record.authorUid!==user.id)));
  const replacements=records.filter(r=>r.evidence.factId!==e.factId&&r.evidence.kind===e.kind&&r.evidence.stateCode===e.stateCode&&r.evidence.agencyKey===e.agencyKey&&(!['procurement-open','procurement-awarded','procurement-closed','contract-expiration','grant-awarded','capital-approved'].includes(e.kind)||(r.evidence.sourceName===e.sourceName&&r.evidence.sourceRecordId===e.sourceRecordId)));
  async function refresh(){
    setBusy(true);setResult(undefined);setStatus('');setConfirmed(false);
    try{setResult(await loadEvidenceDecisions(session,user,record));}
    catch(err){setStatus(err instanceof Error?err.message:'Review could not be confirmed.');}
    finally{setBusy(false);}
  }
  async function save(){
    if(!confirmed||!available.includes(action)||!result||result.status==='unavailable'||!validDecisionDraft(draft,e.factId))return;
    onReviewChange?.();
    setBusy(true);setResult(undefined);setStatus('');setConfirmed(false);
    try{
      const outcome=await recordEvidenceDecision(session,user,record,draft);
      setStatus(outcome==='created'?'Server acknowledged the permanent decision.':'Identical decision already recorded.');
      try{setResult(await loadEvidenceDecisions(session,user,record));}catch{setStatus('Decision acknowledged. Refresh to confirm the current review state.');}
    }catch(err){setStatus('Decision not confirmed. '+(err instanceof Error?err.message:'Refresh before retrying.'));}
    finally{setBusy(false);onReviewChange?.();}
  }
  return <section className="border rounded-md p-3 space-y-3 min-w-0" aria-label="Permanent document review">
    <h3 className="font-semibold">Permanent document review</h3>
    <p className="text-sm break-words">{e.value} · {e.sourceName} · {e.documentDate} · {e.sourceRecordId}</p>
    <a className="text-sm underline break-all" href={e.sourceUrl} target="_blank" rel="noreferrer">Open exact source before review</a>
    <p className="text-xs">Only designated reviewers can record decisions. Source review does not establish current installation or a qualified sales opportunity. A challenge, withdrawal or supersession permanently blocks approval of this original record. Publish a new corrected observation instead.</p>
     {!record.authorIdentityMapped&&<p role="status" className="text-sm">This migrated record’s original author has not been matched to a Replit account. Approval stays disabled until an administrator confirms that identity mapping.</p>}
    <button type="button" className="workspace-button" disabled={busy} onClick={()=>void refresh()}>Check server review history</button>
    {busy&&<p role="status" className="text-sm">Waiting for the server…</p>}
    {status&&<p role="status" className="text-sm break-words">{status}</p>}
    {result&&<><p className="text-sm"><strong>Review status:</strong> {labels[result.status]}</p>
      {result.invalid>0&&<p role="alert" className="text-sm">Invalid review data withheld. Ask an administrator to investigate.</p>}
       <ul className="divide-y divide-slate-200 dark:divide-slate-700">{result.decisions.map(d=><li key={d.action} className="py-2 text-sm break-words"><strong>{labels[d.action]}</strong> · {d.reason.replaceAll('-',' ')}<p className="text-xs">Reviewer {d.reviewerIdentityMapped===false?'identity not mapped':d.reviewerUid} · {d.reviewedAt}</p>{d.replacementId&&<p className="text-xs">Corrected evidence ID: {d.replacementId}</p>}</li>)}</ul>
      {role==='reviewer'&&result.status!=='unavailable'&&available.length>0&&<div className="space-y-2">
        <label className="block text-sm">Decision<select className={control} value={available.includes(action)?action:''} onChange={ev=>{const next=ev.target.value as DecisionAction;if(!available.includes(next))return;setAction(next);setReason(DECISION_REASONS[next][0]);setReplacementId('');setConfirmed(false);}}><option value="">Choose decision</option>{available.map(a=><option key={a} value={a}>{actions[a]}</option>)}</select></label>
        {available.includes(action)&&<>
          <label className="block text-sm">Reason<select className={control} value={reason} onChange={ev=>{setReason(ev.target.value);setConfirmed(false);}}>{DECISION_REASONS[action].map(r=><option key={r} value={r}>{r.replaceAll('-',' ')}</option>)}</select></label>
          {action==='superseded'&&<label className="block text-sm">Replacement from this evidence page<select className={control} value={replacementId} onChange={ev=>{setReplacementId(ev.target.value);setConfirmed(false);}}><option value="">Choose corrected observation</option>{replacements.map(r=><option key={r.evidence.factId} value={r.evidence.factId}>{r.evidence.value} · {r.evidence.sourceRecordId} · {r.evidence.documentDate}</option>)}</select><span className="text-xs">The replacement must already have independent approval and no blocking decision. A different issuer or record requires separate review.</span></label>}
          <label className="block text-sm"><input type="checkbox" checked={confirmed} onChange={ev=>setConfirmed(ev.target.checked)}/> I reviewed the cited document and confirm this permanent decision.</label>
          <button className="workspace-button" type="button" disabled={busy||!confirmed||!validDecisionDraft(draft,e.factId)} onClick={()=>void save()}>Record permanent decision</button>
        </>}
      </div>}
    </>}
  </section>;
}
