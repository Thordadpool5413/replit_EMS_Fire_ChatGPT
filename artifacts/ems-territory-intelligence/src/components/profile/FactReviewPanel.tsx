import React, { useEffect, useMemo, useState } from 'react';
import { CheckCheck, ExternalLink, FileSearch, History, MessageSquareText, PencilLine, TriangleAlert } from 'lucide-react';
import type { Agency, AgencyFactEvidenceKey } from '../../types';
import { appendFactReview, effectiveFactValue, factReviewStatus, loadFactReviews, safeSourceUrl, type FactReviewAction, type FactReviewEntry } from '../../services/factReviewStore';
import './FactReviewPanel.css';

type Fact = { id: string; label: string; value: string; sourceKey: AgencyFactEvidenceKey };
const text = (v: unknown): string => v === null || v === undefined || v === '' ? 'Not reported' : String(v);
export function reviewableAgencyFacts(a: Agency): Fact[] {
  const f = a.installedFleet;
  return [
    {id:'monitor.model',label:'Monitor / defibrillator model',value:text(f?.defibBrand),sourceKey:'defibrillatorBiomedicalFleet'},
    {id:'monitor.quantity',label:'Monitor / defibrillator quantity',value:text(f?.defibUnitsCount),sourceKey:'defibrillatorBiomedicalFleet'},
    {id:'monitor.age',label:'Monitor fleet age (years)',value:text(f?.defibAgeYears),sourceKey:'defibrillatorBiomedicalFleet'},
    {id:'monitor.warranty',label:'Monitor warranty status',value:text(f?.defibWarrantyStatus),sourceKey:'maintenanceContracts'},
    {id:'cpr.model',label:'Mechanical CPR model',value:text(f?.mechanicalCPR),sourceKey:'verifiedHardware'},
    {id:'cpr.quantity',label:'Mechanical CPR quantity',value:text(f?.cprUnitsCount),sourceKey:'verifiedHardware'},
    {id:'ventilator.model',label:'Transport ventilator model',value:text(f?.transportVentilator),sourceKey:'verifiedHardware'},
    {id:'ventilator.quantity',label:'Ventilator quantity',value:text(f?.ventUnitsCount),sourceKey:'verifiedHardware'},
    {id:'software.epcr',label:'ePCR / CAD combined record',value:text(f?.epcrCadSoftware),sourceKey:'epcrSystem'},
    {id:'software.cad',label:'Dispatch CAD system',value:text(f?.dispatchCadVendor),sourceKey:'communicationsSystems'},
    {id:'software.billing',label:'Billing software',value:text(f?.billingSoftware),sourceKey:'billingSoftware'},
    {id:'contract.vendor',label:'Recorded contract vendor',value:text(a.competitorContract?.vendor),sourceKey:'maintenanceContracts'},
    {id:'contract.end',label:'Contract end date',value:text(a.competitorContract?.contractEndDate),sourceKey:'maintenanceContracts'},
    {id:'identity.address',label:'Agency address',value:text(a.address),sourceKey:'providerAddress'},
    {id:'identity.phone',label:'Headquarters phone',value:text(a.headquartersPhone),sourceKey:'decisionMakers'},
    {id:'operations.calls',label:'Annual calls received',value:text(a.annualCallVolume),sourceKey:'annualCallsReceived'},
    {id:'operations.transports',label:'Annual 911 transports',value:text(a.annual911Transports),sourceKey:'annualEmergencyVolume'},
    {id:'operations.stations',label:'Stations',value:text(a.stationsCount),sourceKey:'stationCount'},
  ];
}
const labels: Record<FactReviewAction,string> = {review:'Review information',confirm:'Confirm this fact',correct:'Correct this value',flag:'Flag a discrepancy',note:'Add verification note'};
export const FactReviewPanel: React.FC<{agency:Agency}> = ({agency}) => {
  const facts = useMemo(()=>reviewableAgencyFacts(agency),[agency]);
  const [entries,setEntries]=useState<FactReviewEntry[]>([]);
  const [loadError,setLoadError]=useState('');
  const [fieldId,setFieldId]=useState(facts[0].id);
  const [filter,setFilter]=useState('all');
  const [action,setAction]=useState<FactReviewAction>('review');
  const [reviewer,setReviewer]=useState('');
  const [method,setMethod]=useState('');
  const [note,setNote]=useState('');
  const [correction,setCorrection]=useState('');
  const [supportingUrl,setSupportingUrl]=useState('');
  const [dirty,setDirty]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  useEffect(()=>{
    setEntries([]); setLoadError(''); setDirty(false); setFieldId(facts[0].id);
    setReviewer(''); setMethod('');setNote('');setCorrection('');setSupportingUrl('');setMessage('');setError('');
    try {setEntries(loadFactReviews(agency.id));} catch(e){setLoadError(e instanceof Error?e.message:'Review history is unavailable.');}
  },[agency.id]);
  useEffect(()=>{
    window.dispatchEvent(new CustomEvent('agency-profile-review-dirty',{detail:dirty}));
    return ()=>{window.dispatchEvent(new CustomEvent('agency-profile-review-dirty',{detail:false}));};
  },[dirty]);
  useEffect(()=>{
    if(!dirty)return;
    const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();};
    window.addEventListener('beforeunload',warn); return()=>window.removeEventListener('beforeunload',warn);
  },[dirty]);
  const fact=facts.find(f=>f.id===fieldId) ?? facts[0];
  const history=entries.filter(e=>e.fieldId===fact.id);
  const source=agency.factEvidence?.[fact.sourceKey];
  const sourceUrl=safeSourceUrl(source?.sourceUrl);
  const current=effectiveFactValue(fact.value,history);
  const changeFact=(id:string)=>{
    if(dirty&&!window.confirm('Discard the unsaved review for this fact?'))return;
    setFieldId(id);setDirty(false);setNote('');setCorrection('');setSupportingUrl('');setMessage('');setError('');
  };
  const save=(e:React.FormEvent)=>{
    e.preventDefault();setError('');setMessage('');
    if(action==='confirm'&&current==='Not reported'){setError('A missing value cannot be confirmed. Record a correction and its basis first.');return;}
    if((action==='flag'||action==='note')&&!note.trim()){setError('Add a note explaining this review.');return;}
    if(supportingUrl&&!safeSourceUrl(supportingUrl)){setError('Use a valid http or https supporting link.');return;}
    try {
      const next=appendFactReview({
        id:crypto.randomUUID(),agencyId:agency.id,fieldId:fact.id,action,
        originalValue:fact.value,previousValue:current,
        ...(action==='correct'?{correctedValue:correction.trim()}:{}),
        reviewer:reviewer.trim(),method:method.trim(),note:note.trim(),
        supportingUrl:supportingUrl.trim()||undefined,
        sourceName:source?.sourceName,sourceUrl,sourceKind:source?.sourceKind,sourcePeriod:source?.reportingPeriod,
        reviewedAt:new Date().toISOString(),
      });
      setEntries(next);setDirty(false);setNote('');setCorrection('');setSupportingUrl('');
      setMessage('Saved in this browser for this fact only. The imported record is unchanged.');
    } catch(e){setError(e instanceof Error?e.message:'Review could not be saved.');}
  };
  return <section className="fact-review" data-testid="fact-review-panel" aria-labelledby="fact-review-title">
    <header className="fr-heading"><div><span className="fr-eyebrow"><FileSearch size={16} aria-hidden="true"/>Fact-level review</span><h2 id="fact-review-title">Evidence, not assumptions</h2><p>Review one value at a time. Source type and your review status are separate.</p></div><span className="fr-local">Browser-local history</span></header>
    {loadError&&<p role="alert" className="fr-error">{loadError} Saving is blocked to protect existing history.</p>}
    <div className="fr-workspace">
      <div className="fr-list">
        <label className="fr-desktop-filter">Show facts<select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All facts</option><option value="needs">Needs review</option><option value="reviewed">Has review history</option></select></label>
        <label className="fr-mobile-picker">Fact to review<select value={fact.id} onChange={e=>changeFact(e.target.value)} data-testid="select-review-fact-mobile">{facts.map(f=><option key={f.id} value={f.id}>{f.label}</option>)}</select></label>
        <div className="fr-facts">{facts.filter(f=>filter==='all'||(filter==='reviewed'?entries.some(e=>e.fieldId===f.id):!entries.some(e=>e.fieldId===f.id))).map(f=>{
          const reviews=entries.filter(e=>e.fieldId===f.id);
          return <button key={f.id} type="button" aria-pressed={f.id===fact.id} onClick={()=>changeFact(f.id)} data-testid={`review-fact-${f.id}`}><span>{f.label}</span><strong>{effectiveFactValue(f.value,reviews)}</strong><small>{factReviewStatus(f.value,reviews)}</small></button>;
        })}</div>
      </div>
      <div className="fr-detail">
        <h3>{fact.label}</h3><dl className="fr-values"><div><dt>Imported value</dt><dd>{fact.value}</dd></div><div><dt>Current research value</dt><dd>{current}</dd></div></dl>
        <div className="fr-source"><span>Source type: <strong>{source?.sourceKind||'Not specified'}</strong></span><span>{source?.sourceName||'No source attached to this field'}</span>{source?.reportingPeriod&&<span>Period: {source.reportingPeriod}</span>}{sourceUrl&&<a href={sourceUrl} target="_blank" rel="noopener noreferrer">View source<ExternalLink size={14} aria-hidden="true"/></a>}<span className="fr-status">{factReviewStatus(fact.value,history)}</span></div>
        <form onSubmit={save} onChange={()=>{setDirty(true);setMessage('');}}>
          <label>Review action<select value={action} onChange={e=>setAction(e.target.value as FactReviewAction)} data-testid="fact-review-action">{Object.entries(labels).map(([id,label])=><option value={id} key={id}>{label}</option>)}</select></label>
          <div className="fr-form-grid"><label>Reviewer name<input required maxLength={120} value={reviewer} onChange={e=>setReviewer(e.target.value)} autoComplete="name" data-testid="fact-review-reviewer"/></label><label>Review method<input required maxLength={240} placeholder="e.g. agency phone call, document review" value={method} onChange={e=>setMethod(e.target.value)} data-testid="fact-review-method"/></label></div>
          <p className="fr-hint">Name is self-entered, not an authenticated identity. Reviews stay on this browser and device.</p>
          {action==='correct'&&<label>Corrected value<input required maxLength={2000} value={correction} onChange={e=>setCorrection(e.target.value)} data-testid="fact-review-correction"/><span className="fr-hint">Original values and previous corrections remain in history. This does not change equipment totals or financial calculations.</span></label>}
          <label>Review notes<textarea rows={3} maxLength={4000} required={action==='flag'||action==='note'} value={note} onChange={e=>setNote(e.target.value)} data-testid="fact-review-note"/></label>
          <label>Supporting link <span className="fr-hint">(optional)</span><input type="url" maxLength={2000} placeholder="https://" value={supportingUrl} onChange={e=>setSupportingUrl(e.target.value)}/></label>
          {error&&<p role="alert" className="fr-error">{error}</p>}{message&&<p role="status" className="fr-success">{message}</p>}
          <div className="fr-save"><span>{dirty?'Unsaved review':'Changes apply to this fact only'}</span><button disabled={!!loadError} type="submit" data-testid="save-fact-review">{action==='confirm'?<CheckCheck size={16}/>:action==='correct'?<PencilLine size={16}/>:action==='flag'?<TriangleAlert size={16}/>:<MessageSquareText size={16}/>}Save review</button></div>
        </form>
        <details className="fr-history" open={history.length>0}><summary><History size={16} aria-hidden="true"/>Review history ({history.length})</summary>{history.length===0?<p>No reviews recorded for this fact.</p>:<ol>{[...history].reverse().map(e=><li key={e.id}><strong>{labels[e.action]}</strong><span>{e.reviewer} · {new Date(e.reviewedAt).toLocaleString()}</span><span>Method: {e.method}</span><span>Original: {e.originalValue} · Previous: {e.previousValue}</span>{e.correctedValue&&<span>Correction: {e.correctedValue}</span>}<span>Source at review: {e.sourceName||'Not attached'} · {e.sourceKind||'Type not specified'} · {e.sourcePeriod||'Period not stated'}</span>{safeSourceUrl(e.sourceUrl)&&<a href={safeSourceUrl(e.sourceUrl)} target="_blank" rel="noopener noreferrer">Original source ↗</a>}{e.note&&<p>{e.note}</p>}{safeSourceUrl(e.supportingUrl)&&<a href={safeSourceUrl(e.supportingUrl)} target="_blank" rel="noopener noreferrer">Supporting record ↗</a>}</li>)}</ol>}</details>
      </div>
    </div>
  </section>;
};
