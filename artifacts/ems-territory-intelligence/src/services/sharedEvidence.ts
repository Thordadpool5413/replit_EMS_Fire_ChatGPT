import type { Agency, AgencySourceFact } from '../types';
import { definitionFor, isDocumentedIntelligenceFact, validDocumentUrl, type IntelligenceKind } from './documentedIntelligence';
import { registryIdentityKey } from './registryAccountLink';

export type SharedEvidence = {
  agencyKey: string; agencyName: string; stateCode: string; factId: string;
  kind: IntelligenceKind; value: string; sourceName: string; sourceRecordId: string;
  sourceUrl: string; documentDate: string; dueDate: string; enteredAt: string;
};
const factIdPattern = /^[A-Za-z0-9_-]{1,100}$/;
const keyPattern = /^(?:NPI:\d{10}|NERIS:[A-Z0-9.-]{1,80}|FDID:[A-Z]{2}:[A-Z0-9.-]{1,80}|STATE-EMS:[A-Z]{2}:(?:agency-code|license):[A-Z0-9.-]{1,80})$/;
const bounded = (s: unknown, n: number): s is string => typeof s === 'string' && !!s.trim() && s.length <= n;
const fields = ['agencyKey','agencyName','stateCode','factId','kind','value','sourceName','sourceRecordId','sourceUrl','documentDate','dueDate','enteredAt'] as const;

/** Deliberately restrict v1 sharing to source-native identities, not inferred legacy matches. */
export function sharedAgencyKey(agency: Agency): string | undefined {
  const identity = agency.registryIdentity;
  if (!identity || identity.stateCode !== agency.stateCode || !/^[A-Z]{2}$/.test(agency.stateCode)) return;
  const key = registryIdentityKey(identity);
  return key && keyPattern.test(key) ? key : undefined;
}
export function shareableAgencies(agencies: Agency[]): Agency[] {
  const groups = new Map<string, Agency[]>();
  for (const a of agencies) {
    const key = sharedAgencyKey(a);
    if (key) groups.set(key, [...(groups.get(key) ?? []), a]);
  }
  return [...groups.values()].filter(group => group.length === 1).map(group => group[0]);
}

/** Whitelist public document fields only: notes, contacts, pipeline, identity reviews and local drafts never leave the device. */
export function toSharedEvidence(agency: Agency, fact: AgencySourceFact, now = Date.now()): SharedEvidence {
  const key = sharedAgencyKey(agency);
  if (!key || !isDocumentedIntelligenceFact(fact, agency.id, now)) throw new Error('A source-native account and valid dated document are required.');
  const result: SharedEvidence = {
    agencyKey: key, agencyName: agency.name, stateCode: agency.stateCode, factId: fact.id,
    kind: fact.intelligence.kind, value: fact.value, sourceName: fact.sourceName,
    sourceRecordId: fact.sourceRecordId, sourceUrl: fact.sourceUrl,
    documentDate: fact.intelligence.documentDate, dueDate: fact.intelligence.dueDate ?? '', enteredAt: fact.enteredAt,
  };
  if (!readSharedEvidence(result, key, fact.id, now)) throw new Error('Evidence exceeds the shared workspace validation limits.');
  return result;
}
/** Validate remote payload again before rendering, including URL and source semantics. */
export function readSharedEvidence(input: unknown, key: string, id: string, now = Date.now()): SharedEvidence | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return;
  const r = input as Record<string, unknown>;
  if (!keyPattern.test(key) || !factIdPattern.test(id) || r.agencyKey !== key || r.factId !== id ||
      !bounded(r.agencyName, 240) || !bounded(r.stateCode, 2) || !/^[A-Z]{2}$/.test(r.stateCode) ||
      !bounded(r.value, 500) || !bounded(r.sourceName, 160) || !bounded(r.sourceRecordId, 160) ||
      !bounded(r.sourceUrl, 2048) || !validDocumentUrl(r.sourceUrl) ||
      !bounded(r.documentDate, 10) || typeof r.dueDate !== 'string' || r.dueDate.length > 10 ||
      !bounded(r.enteredAt, 40)) return;
  if ((key.startsWith('FDID:') || key.startsWith('STATE-EMS:')) && key.split(':')[1] !== r.stateCode) return;
  const definition = definitionFor(r.kind);
  if (!definition) return;
  const fact: AgencySourceFact = {
    id, fieldKey: definition.fieldKey, value: r.value, sourceName: r.sourceName, sourceRecordId: r.sourceRecordId,
    sourceUrl: r.sourceUrl, geographicLevel: 'agency', geographicId: key, basis: 'source-reported',
    enteredAt: r.enteredAt, intelligence: { kind: r.kind as IntelligenceKind, documentDate: r.documentDate, ...(r.dueDate ? { dueDate: r.dueDate } : {}) },
  };
  if (!isDocumentedIntelligenceFact(fact, key, now)) return;
  return Object.fromEntries(fields.map(field => [field, r[field]])) as SharedEvidence;
}
export function sameSharedEvidence(a: SharedEvidence, b: SharedEvidence): boolean {
  return fields.every(field => a[field] === b[field]);
}
export function validWorkspaceId(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id);
}
