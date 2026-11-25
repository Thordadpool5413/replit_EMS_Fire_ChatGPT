import React, { useEffect, useMemo, useState } from 'react';
import { useAuth, type AuthUser } from '@workspace/replit-auth-web';
import type { Agency } from '../types';
import { reconcileSharedEvidence } from '../services/sharedEvidenceReconciliation';
import { ReviewedEquipmentMap } from './ReviewedEquipmentMap';
import { SharedOpportunityRadar } from './SharedOpportunityRadar';
import { EvidenceGovernancePanel } from './EvidenceGovernancePanel';
import { SharedEvidenceReview } from './SharedEvidenceReview';
import { INTELLIGENCE_DEFINITIONS } from '../services/documentedIntelligence';
import { shareableAgencies, sharedAgencyKey, toSharedEvidence, type SharedEvidence } from '../services/sharedEvidence';
import { evidenceEnabled, evidenceRole, listSharedEvidence, openEvidenceSession, publishSharedEvidence, type EvidenceSession, type EvidenceRole, type PublishedEvidence } from '../services/sharedEvidenceReplit';
const control = 'block w-full min-w-0 rounded border p-2 bg-transparent text-base';
const message = (e: unknown) => e instanceof Error ? e.message : 'The request could not be confirmed.';

export function SharedEvidenceWorkspace({ agencies, view='research', onOpenAgency }: { agencies: Agency[]; view?:'research'|'map'; onOpenAgency?:(a:Agency)=>void }) {
  const [session, setSession] = useState<EvidenceSession>();
  const { user, isLoading, isAuthenticated, login, logout } = useAuth();
  const [error, setError] = useState('');
  return <section className="pi-surface p-4 min-w-0 space-y-3" aria-label="ATLAS shared evidence">
    <h2 className="font-semibold">{view==='map'?'ATLAS reviewed intelligence map':'ATLAS shared evidence'}</h2>
    <p className="text-sm">A controlled team library for public, dated agency documents. Local evidence remains local until explicitly published. Shared entries are user-reported observations, not independently verified facts.</p>
    {!evidenceEnabled ? <p role="status" className="text-sm">Not enabled. An administrator must configure verified sign-in and grant workspace membership in Replit. No shared data is read or written.</p> :
      !session ? <button type="button" className="workspace-button" onClick={() => { try { setSession(openEvidenceSession()); } catch (e) { setError(message(e)); } }}>Open shared workspace</button> :
      isLoading ? <p role="status">Checking sign-in…</p> :
      !isAuthenticated || !user ? <button type="button" className="workspace-button" onClick={login}>Sign in</button> :
      <><div className="flex flex-wrap items-center gap-2"><span className="text-sm break-all">{user.email ?? 'Signed-in member'}</span><button type="button" className="workspace-button" onClick={logout}>Sign out</button></div>
      <MemberWorkspace key={user.id} session={session} user={user} agencies={agencies} view={view} onOpenAgency={onOpenAgency}/></>}
    {error && <p role="alert" className="text-sm break-words">{error}</p>}
  </section>;
}

function MemberWorkspace({ session, user, agencies, view, onOpenAgency }: { session: EvidenceSession; user: AuthUser; agencies: Agency[]; view:'research'|'map'; onOpenAgency?:(a:Agency)=>void }) {
  const [role, setRole] = useState<EvidenceRole>();
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; setRole(undefined); setError('');
    void evidenceRole(session, user).then(r => { if (active) setRole(r); }, e => { if (active) setError(message(e)); });
    return () => { active = false; };
  }, [session, user, retry]);
  const eligible = useMemo(() => shareableAgencies(agencies), [agencies]);
  const matching = useMemo(() => {
    const term = search.trim().toLowerCase();
    return eligible.filter(a => (a.name+' '+a.stateCode+' '+sharedAgencyKey(a)).toLowerCase().includes(term)).slice(0, 30);
  }, [eligible, search]);
  const agency = eligible.find(a => a.id === selected);
  if (!role) return <div className="space-y-2"><p role="status" className="text-sm">{error || 'Checking workspace membership…'}</p>{error && <button className="workspace-button" type="button" onClick={() => setRetry(n => n+1)}>Retry membership check</button>}</div>;
  if(view==='map')return <ReviewedEquipmentMap session={session} user={user} agencies={agencies} onOpenAgency={onOpenAgency}/>;
  return <div className="space-y-3">
    <p className="text-sm">Workspace access: <strong>{role}</strong>. Only uniquely identified source-native accounts are eligible. Add a registry account first if it is missing.</p>
    <label className="block text-sm">Find an account<input className={control} value={search} onChange={e => { setSearch(e.target.value); setSelected(''); }} placeholder="Name, state, or registry ID"/></label>
    <label className="block text-sm">Account<select className={control} value={selected} onChange={e => setSelected(e.target.value)}><option value="">Choose an account (first 30 matches)</option>{matching.map(a => <option key={a.id} value={a.id}>{a.name} · {a.stateCode} · {sharedAgencyKey(a)}</option>)}</select></label>
    {agency && <AgencyEvidence key={sharedAgencyKey(agency)} session={session} user={user} role={role} agency={agency}/>}
  </div>;
}

function AgencyEvidence({ session, user, role, agency }: { session: EvidenceSession; user: AuthUser; role: EvidenceRole; agency: Agency }) {
  const key = sharedAgencyKey(agency)!;
  const local = useMemo(() => (agency.sourceFacts ?? []).flatMap(f => { try { return [toSharedEvidence(agency, f)]; } catch { return []; } }), [agency]);
  const [factId, setFactId] = useState('');
  const [consentFor, setConsentFor] = useState('');
  const [records, setRecords] = useState<PublishedEvidence[]>([]);
  const [reviewId,setReviewId]=useState('');
  const [radarRevision,setRadarRevision]=useState(0);
  const [cursor, setCursor] = useState<string>();
  const [loaded, setLoaded] = useState(false);
  const [firstPage, setFirstPage] = useState(false);
  const [withheld, setWithheld] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const selected = local.find(f => f.factId === factId);
  const reviewRecord=records.find(r=>r.evidence.factId===reviewId);
  const consent = Boolean(selected && consentFor === JSON.stringify(selected));
  async function refresh(after?: string) {
    setBusy(true); setStatus(''); setRecords([]); setReviewId(''); setLoaded(false); setCursor(undefined); setWithheld(0); setFirstPage(!after);
    try {
      const result = await listSharedEvidence(session, user, key, after);
      setRecords(result.records); setCursor(result.next); setWithheld(result.withheld); setLoaded(true);
    } catch (e) { setStatus(message(e)); } finally { setBusy(false); }
  }
  async function publish(evidence: SharedEvidence) {
    if (!consent || role !== 'editor') return;
    setBusy(true); setStatus(''); setRecords([]); setReviewId(''); setLoaded(false); setCursor(undefined); setFirstPage(false); setWithheld(0);
    try {
      const outcome = await publishSharedEvidence(session, user, evidence);
      setConsentFor('');
      setStatus(outcome === 'created' ? 'Server acknowledged publication. Refresh shared records to see it.' : 'Identical evidence already exists. No duplicate was written.');
    } catch (e) { setStatus('Publication not confirmed. Your local record is unchanged. '+message(e)); } finally { setBusy(false); }
  }
  return <div className="space-y-3 min-w-0">
    <p className="text-sm break-words"><strong>{agency.name}</strong> · {key}</p>
    {role === 'editor' && <div className="space-y-2 border rounded-md p-3">
      <h3 className="font-semibold text-sm">Publish one saved document</h3>
      <p className="text-sm">Only typed document evidence is eligible. Notes, contacts, generic facts and account changes are excluded. Published records cannot be edited or removed by members.</p>
      <label className="block text-sm">Local document<select className={control} disabled={busy} value={factId} onChange={e => { setFactId(e.target.value); setConsentFor(''); }}><option value="">Choose evidence ({local.length})</option>{local.map(f => <option key={f.factId} value={f.factId}>{INTELLIGENCE_DEFINITIONS[f.kind].label}: {f.value} · {f.documentDate}</option>)}</select></label>
      {selected && <><EvidenceDetails evidence={selected}/><label className="block text-sm"><input type="checkbox" checked={consent} disabled={busy} onChange={e => setConsentFor(e.target.checked ? JSON.stringify(selected) : '')}/> I reviewed these exact fields and authorize sharing this public document with workspace members.</label>
      <button type="button" className="workspace-button" disabled={busy || !consent} onClick={() => void publish(selected)}>Publish selected evidence</button></>}
    </div>}
    <div className="flex flex-wrap gap-2"><button type="button" className="workspace-button" disabled={busy} onClick={() => void refresh()}>Refresh shared records</button>{cursor && <button type="button" className="workspace-button" disabled={busy} onClick={() => void refresh(cursor)}>Next 50 records</button>}</div>
    {busy && <p role="status" className="text-sm">Waiting for server acknowledgment…</p>}
    {status && <p role="status" className="text-sm break-words">{status}</p>}
    {loaded && <p className="text-sm">{records.length} displayed on this page. {withheld} invalid entries withheld. This is a paginated research library, not a complete opportunity assessment.</p>}
    <ul className="divide-y divide-slate-200 dark:divide-slate-700">{records.map(r => <li key={r.evidence.factId} className="py-3 space-y-1 min-w-0"><EvidenceDetails evidence={r.evidence}/><p className="text-xs break-all">Published {r.publishedAt} · member {r.authorUid}</p></li>)}</ul>
    {loaded && !busy && records.length>0 && <div className="space-y-2"><label className="block text-sm">Review published document<select className={control} value={reviewId} onChange={ev=>setReviewId(ev.target.value)}><option value="">Choose a document</option>{records.map(r=><option key={r.evidence.factId} value={r.evidence.factId}>{r.evidence.value} · {r.evidence.sourceRecordId} · {r.evidence.documentDate}</option>)}</select></label>{reviewRecord&&<EvidenceGovernancePanel key={reviewRecord.evidence.factId} session={session} user={user} role={role} record={reviewRecord} records={records} onReviewChange={()=>setRadarRevision(n=>n+1)}/>}</div>}
    {!busy && <SharedOpportunityRadar key={radarRevision} session={session} user={user} agency={agency}/>}
    {loaded && !busy && <SharedEvidenceReview result={reconcileSharedEvidence(agency, records.map(r=>r.evidence), {singleCompletePage:firstPage && !cursor,withheld})}/>}
    <p className="text-xs">Shared records are fetched from the server and kept in memory only. They do not overwrite browser-local evidence, provider data, the equipment map or the existing local Opportunity Radar.</p>
  </div>;
}
function EvidenceDetails({ evidence: e }: { evidence: SharedEvidence }) {
  return <div className="space-y-1 text-sm break-words"><strong>{INTELLIGENCE_DEFINITIONS[e.kind].label}</strong><p>{e.agencyName} · {e.stateCode}</p><p>{e.value}</p><p>{e.sourceName} · {e.sourceRecordId} · {e.documentDate}{e.dueDate && ' · deadline '+e.dueDate}</p><p>Original entry: {e.enteredAt}</p><a className="underline break-all" href={e.sourceUrl} target="_blank" rel="noreferrer">{e.sourceUrl}</a></div>;
}
