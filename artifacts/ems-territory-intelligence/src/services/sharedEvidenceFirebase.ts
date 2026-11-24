import { getApps, initializeApp } from 'firebase/app';
import { getAuth, initializeAuth, inMemoryPersistence, browserPopupRedirectResolver, type Auth, type User } from 'firebase/auth';
import { collection, doc, documentId, getDocFromServer, getDocsFromServer, getFirestore, limit, orderBy, query, runTransaction, serverTimestamp, startAfter, type Firestore, Timestamp } from 'firebase/firestore';
import { DECISION_ACTIONS, readDecision, sameDecision, summarizeDecisions, validDecisionDraft, type DecisionDraft, type EvidenceDecision } from './sharedEvidenceGovernance';
import legacyConfig from '../../firebase-applet-config.json';
import { readSharedEvidence, sameSharedEvidence, validWorkspaceId, type SharedEvidence } from './sharedEvidence';

export type EvidenceSession = { auth: Auth; db: Firestore; workspace: string };
export type EvidenceRole = 'viewer' | 'editor' | 'reviewer';
export type PublishedEvidence = { evidence: SharedEvidence; authorUid: string; publishedAt: string };
// Node-based rendering/tests have no Vite environment. Default to disabled.
const env = import.meta.env ?? ({} as ImportMetaEnv);
const settings = {
  apiKey: env.VITE_ATLAS_EVIDENCE_API_KEY,
  authDomain: env.VITE_ATLAS_EVIDENCE_AUTH_DOMAIN,
  projectId: env.VITE_ATLAS_EVIDENCE_PROJECT_ID,
  appId: env.VITE_ATLAS_EVIDENCE_APP_ID,
};
const workspace = env.VITE_ATLAS_EVIDENCE_WORKSPACE_ID;
export const evidenceEnabled = env.VITE_ATLAS_EVIDENCE_ENABLED === 'true' &&
  Object.values(settings).every(value => typeof value === 'string' && !!value.trim()) &&
  settings.projectId !== legacyConfig.projectId && validWorkspaceId(workspace);

/** No existing agency database or auth session is reused. No persistent auth or evidence cache. */
export function openEvidenceSession(): EvidenceSession {
  if (!evidenceEnabled || !validWorkspaceId(workspace)) throw new Error('Shared evidence is not configured.');
  const name = 'atlas-shared-evidence';
  const existing = getApps().find(app => app.name === name);
  const app = existing ?? initializeApp(settings, name);
  const auth = existing ? getAuth(app) : initializeAuth(app, {
    persistence: inMemoryPersistence, popupRedirectResolver: browserPopupRedirectResolver,
  });
  return { auth, db: getFirestore(app), workspace };
}
function assertSession(session: EvidenceSession, user: User): void {
  if (session.auth.currentUser?.uid !== user.uid || !user.emailVerified || user.isAnonymous)
    throw new Error('Sign in with an authorized verified account.');
}
export async function evidenceRole(session: EvidenceSession, user: User): Promise<EvidenceRole> {
  assertSession(session, user);
  const snap = await getDocFromServer(doc(session.db, 'workspaces', session.workspace, 'members', user.uid));
  assertSession(session, user);
  const role: unknown = snap.data()?.role;
  if (role !== 'viewer' && role !== 'editor' && role !== 'reviewer') throw new Error('Workspace membership has not been granted.');
  return role;
}
function evidenceCollection(session: EvidenceSession, agencyKey: string) {
  return collection(session.db, 'workspaces', session.workspace, 'agencies', agencyKey, 'evidence');
}
export async function listSharedEvidence(session: EvidenceSession, user: User, agencyKey: string, cursor?: string) {
  assertSession(session, user);
  const ref = evidenceCollection(session, agencyKey);
  const snapshot = await getDocsFromServer(query(ref, orderBy(documentId()), ...(cursor ? [startAfter(cursor)] : []), limit(50)));
  assertSession(session, user);
  if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) throw new Error('A server-only evidence snapshot could not be confirmed.');
  const records: PublishedEvidence[] = [];
  let withheld = 0;
  for (const d of snapshot.docs) {
    const raw = d.data();
    const evidence = readSharedEvidence(raw, agencyKey, d.id);
    const stamp = raw.publishedAt instanceof Timestamp ? raw.publishedAt.toDate().toISOString() : undefined;
    if (!evidence || typeof raw.authorUid !== 'string' || typeof stamp !== 'string') { withheld++; continue; }
    records.push({ evidence, authorUid: raw.authorUid, publishedAt: stamp });
  }
  return { records, withheld, next: snapshot.size === 50 ? snapshot.docs.at(-1)?.id : undefined };
}
/** Immutable, retry-safe create. A differing record ID is a conflict, never an overwrite. */
export async function publishSharedEvidence(session: EvidenceSession, user: User, evidence: SharedEvidence): Promise<'created' | 'exists'> {
  assertSession(session, user);
  const clean = readSharedEvidence(evidence, evidence.agencyKey, evidence.factId);
  if (!clean) throw new Error('Invalid evidence.');
  if (await evidenceRole(session, user) !== 'editor') throw new Error('Editor membership is required to publish evidence.');
  const ref = doc(evidenceCollection(session, evidence.agencyKey), evidence.factId);
  const result = await runTransaction(session.db, async transaction => {
    assertSession(session, user);
    const existing = await transaction.get(ref);
    if (existing.exists()) {
      const previous = readSharedEvidence(existing.data(), evidence.agencyKey, evidence.factId);
      if (!previous || !sameSharedEvidence(previous, clean)) throw new Error('Shared record ID conflicts with existing evidence. Nothing was overwritten.');
      return 'exists' as const;
    }
    transaction.set(ref, { ...clean, authorUid: user.uid, publishedAt: serverTimestamp() });
    return 'created' as const;
  });
  assertSession(session, user);
  return result;
}

function parseDecisionSnapshot(raw: Record<string,unknown>, factId:string, action:string): EvidenceDecision|undefined {
  const reviewedAt = raw.reviewedAt instanceof Timestamp ? raw.reviewedAt.toDate().toISOString() : undefined;
  return readDecision({...raw,reviewedAt},factId,action);
}
export async function loadEvidenceDecisions(session:EvidenceSession,user:User,record:PublishedEvidence){
  assertSession(session,user);
  const e=record.evidence;
  if(!readSharedEvidence(e,e.agencyKey,e.factId))throw Error('Invalid evidence identity.');
  const parent=doc(evidenceCollection(session,e.agencyKey),e.factId);
  const result=await getDocsFromServer(query(collection(parent,'decisions'),limit(5)));
  assertSession(session,user);
  if(result.metadata.fromCache||result.metadata.hasPendingWrites)throw Error('A server-only review snapshot could not be confirmed.');
  const decisions:EvidenceDecision[]=[];
  let invalid=0;
  for(const d of result.docs){
    const event=parseDecisionSnapshot(d.data(),e.factId,d.id);
    if(!event)invalid++;else decisions.push(event);
  }
  if(result.size>=5)invalid++;
  return {decisions,invalid,status:summarizeDecisions(decisions,invalid)};
}
/** Decisions are fixed-ID immutable records. Corrections are new independently reviewed observations. */
export async function recordEvidenceDecision(session:EvidenceSession,user:User,record:PublishedEvidence,draft:DecisionDraft):Promise<'created'|'exists'>{
  assertSession(session,user);
  if(await evidenceRole(session,user)!=='reviewer')throw Error('Reviewer membership is required.');
  const e=record.evidence;
  if(!readSharedEvidence(e,e.agencyKey,e.factId)||!validDecisionDraft(draft,e.factId))throw Error('Invalid decision.');
  const parent=doc(evidenceCollection(session,e.agencyKey),e.factId);
  const decisionRefs=DECISION_ACTIONS.map(action=>doc(parent,'decisions',action));
  const result=await runTransaction(session.db,async tx=>{
    assertSession(session,user);
    const target=await tx.get(parent);
    const remote=target.exists()?readSharedEvidence(target.data(),e.agencyKey,e.factId):undefined;
    if(!remote||!sameSharedEvidence(remote,e)||target.data()?.authorUid!==record.authorUid)throw Error('Evidence changed or could not be confirmed. Refresh the record.');
    const existing=await Promise.all(decisionRefs.map(ref=>tx.get(ref)));
    const decisions:EvidenceDecision[]=[];
    for(const snap of existing)if(snap.exists()){
      const event=parseDecisionSnapshot(snap.data(),e.factId,snap.id);
      if(!event)throw Error('Existing decision is invalid. Administrator review is required.');
      decisions.push(event);
    }
    const prior=decisions.find(d=>d.action===draft.action);
    if(prior){
      if(!sameDecision(prior,draft,user.uid))throw Error('This permanent decision already exists. No history was changed.');
      return 'exists' as const;
    }
    if(draft.action==='approved'&&(summarizeDecisions(decisions)!=='pending'||record.authorUid===user.uid))
      throw Error('Blocked or self-authored evidence cannot be approved.');
    if(draft.action==='superseded'){
      const next=doc(evidenceCollection(session,e.agencyKey),draft.replacementId);
      const nextSnap=await tx.get(next);
      const replacement=nextSnap.exists()?readSharedEvidence(nextSnap.data(),e.agencyKey,draft.replacementId):undefined;
      if(!replacement||replacement.stateCode!==e.stateCode||replacement.kind!==e.kind)throw Error('Choose a matching corrected observation.');
      if(['procurement-open','procurement-awarded','procurement-closed','contract-expiration','grant-awarded','capital-approved'].includes(e.kind)
        &&(replacement.sourceName!==e.sourceName||replacement.sourceRecordId!==e.sourceRecordId))throw Error('Correction must match the issuer and source record ID.');
      const nextEvents=await Promise.all(DECISION_ACTIONS.map(action=>tx.get(doc(next,'decisions',action))));
      const nextDecisions:EvidenceDecision[]=[];
      for(const snap of nextEvents)if(snap.exists()){
        const event=parseDecisionSnapshot(snap.data(),replacement.factId,snap.id);
        if(!event)throw Error('Replacement decision is invalid.');
        nextDecisions.push(event);
      }
      if(summarizeDecisions(nextDecisions)!=='approved')throw Error('The corrected observation must first be independently approved and unblocked.');
    }
    tx.set(doc(parent,'decisions',draft.action),{action:draft.action,reason:draft.reason,replacementId:draft.replacementId,factId:e.factId,reviewerUid:user.uid,reviewedAt:serverTimestamp()});
    return 'created' as const;
  });
  assertSession(session,user);
  return result;
}
