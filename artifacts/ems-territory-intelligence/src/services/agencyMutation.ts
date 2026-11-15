import type { Agency, SyncOutboxItem } from '../types';

/** Apply only the user's changed fields. Never replace a newer complete cloud record. */
export function applyAgencyMutation(current: Agency | undefined, item: SyncOutboxItem, checkConflicts = false): Agency {
  const base = current ?? item.payload.base ?? item.payload.agency;
  if (!base) throw new Error('Agency identity is unavailable. Open this agency and retry.');
  const result = structuredClone(base) as Agency;
  const changes = item.actionType === 'UPDATE_STAGE' ? { 'zollOpportunity.salesStage': item.payload.stage }
    : item.actionType === 'AGENCY_PATCH' ? item.payload.changes : {};
  if (item.actionType === 'CREATE_AGENCY' && current && checkConflicts && current.name !== item.payload.agency.name)
    throw new Error('An agency with this ID already exists. Review the existing agency before retrying.');
  for (const [path, value] of Object.entries(changes)) {
    if (!['zollOpportunity.salesStage', 'isBookmarked', 'inDayRoute'].includes(path)) throw new Error('Unsupported agency change.');
    const old = path === 'zollOpportunity.salesStage' ? result.zollOpportunity.salesStage : Boolean((result as any)[path]);
    const expected = item.payload.expected?.[path];
    if (checkConflicts && current && expected !== undefined && old !== expected && old !== value)
      throw new Error(`Another device changed ${path}. Cloud value: ${String(old)}. Your edit: ${String(value)}. Your change is retained.`);
    if (path === 'zollOpportunity.salesStage') result.zollOpportunity = { ...result.zollOpportunity, salesStage: value as Agency['zollOpportunity']['salesStage'] };
    else (result as any)[path] = value;
  }
  if (item.actionType === 'ADD_FIELD_NOTE') {
    const note = item.payload.note ?? item.payload;
    result.fieldNotes = [note, ...(result.fieldNotes ?? []).filter(n => n.id !== note.id)];
    result.lastContactDate = [result.lastContactDate ?? '', note.date].sort().at(-1);
  }
  if (item.actionType === 'FACT_REVIEW') {
    result._factReviews = [...(result._factReviews ?? []).filter(e => e.id !== item.payload.review.id), item.payload.review];
  }
  if (!['FACT_REVIEW','CREATE_AGENCY','AGENCY_PATCH','ADD_FIELD_NOTE','UPDATE_STAGE'].includes(item.actionType))
    throw new Error('This older queued change requires review. It has not been discarded.');
  return result;
}
