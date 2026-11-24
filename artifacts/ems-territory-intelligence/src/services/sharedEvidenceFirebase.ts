import { getApps, initializeApp } from 'firebase/app';
import { getAuth, initializeAuth, inMemoryPersistence, browserPopupRedirectResolver, type Auth, type User } from 'firebase/auth';
import { collection, doc, documentId, getDocFromServer, getDocsFromServer, getFirestore, limit, orderBy, query, runTransaction, serverTimestamp, startAfter, type Firestore, Timestamp } from 'firebase/firestore';
import legacyConfig from '../../firebase-applet-config.json';
import { readSharedEvidence, sameSharedEvidence, validWorkspaceId, type SharedEvidence } from './sharedEvidence';

export type EvidenceSession = { auth: Auth; db: Firestore; workspace: string };
export type EvidenceRole = 'viewer' | 'editor';
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
  if (role !== 'viewer' && role !== 'editor') throw new Error('Workspace membership has not been granted.');
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
