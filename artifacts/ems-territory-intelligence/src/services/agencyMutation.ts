import { registryIdentityKey } from './registryAccountLink';
import type { Agency, SyncOutboxItem } from '../types';

const validDate = (value: unknown) => typeof value === 'string' && (value === '' || (/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value));
const normalizeFollowUpText = (value: string) => value
  .normalize('NFKC')
  .toLocaleLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, ' ')
  .trim()
  .replace(/\s+/g, ' ');

/** Apply only the user's changed fields. Never replace a newer complete cloud record. */
export function applyAgencyMutation(current: Agency | undefined, item: SyncOutboxItem, checkConflicts = false): Agency {
  const base = current ?? item.payload.base ?? item.payload.agency;
  if (!base) throw new Error('Agency identity is unavailable. Open this agency and retry.');
  const result = structuredClone(base) as Agency;
  const changes = item.actionType === 'UPDATE_STAGE' ? { 'zollOpportunity.salesStage': item.payload.stage }
    : item.actionType === 'AGENCY_PATCH' ? item.payload.changes : {};
  if (item.actionType === 'CREATE_AGENCY' && current) {
    const incoming=item.payload.agency as Agency;
    const currentKey=current.registryIdentity&&registryIdentityKey(current.registryIdentity);
    const incomingKey=incoming.registryIdentity&&registryIdentityKey(incoming.registryIdentity);
    if((currentKey||incomingKey)?(!currentKey||currentKey!==incomingKey):current.name!==incoming.name)
      throw new Error('An agency with this ID already exists. Review the existing agency before retrying.');
    return result; // deterministic replay preserves all newer fields, notes and activities
  }
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
  if (item.actionType === 'CREATE_FOLLOW_UP') {
    const task = item.payload.task;
    if (!task?.id || typeof task.nextAction !== 'string' || !task.nextAction.trim() || !task.taskOnly || !validDate(task.dueDate) || !['low','normal','high'].includes(task.priority) || typeof task.owner !== 'string') throw new Error('A task needs an agency and action.');
    if ((result.followUpTasks ?? []).some(existing => existing.id === task.id)) return result;
    const normalizedAction = normalizeFollowUpText(task.nextAction);
    const duplicate = [...(result.fieldNotes ?? []), ...(result.followUpTasks ?? [])].find((existing) => {
      const existingAction = existing.nextAction ? normalizeFollowUpText(existing.nextAction) : '';
      return existingAction === normalizedAction &&
        (existing.followUpStatus ?? 'open') === 'open' &&
        (!task.dueDate || !existing.dueDate || task.dueDate === existing.dueDate);
    });
    if (duplicate) {
      throw new Error('An open next action already exists for this agency. Edit the existing action instead of creating a duplicate.');
    }
    result.followUpTasks = [...(result.followUpTasks ?? []), { ...task, history: [{ id: item.id, at: item.timestamp, before: {}, after: { nextAction: task.nextAction, dueDate: task.dueDate, owner: task.owner, priority: task.priority, followUpStatus: 'open' } }] }];
  }
  if (item.actionType === 'UPDATE_FOLLOW_UP') {
    const { noteId, changes, expected } = item.payload;
    const listKey = item.payload.taskOnly ? 'followUpTasks' : 'fieldNotes';
    const list = result[listKey] ?? [];
    const note = list.find(n => n.id === noteId);
    if (!note) throw new Error('This interaction is no longer available. Refresh the agency before retrying.');
    if (note.history?.some(h => h.id === item.id)) return result;
    if (!changes || !['open', 'completed'].includes(changes.followUpStatus) || !validDate(changes.dueDate)) throw new Error('Invalid follow-up update.');
    const allowed = ['nextAction', 'dueDate', 'followUpStatus', 'owner', 'priority'];
    if (Object.keys(changes).some(k=>!allowed.includes(k)) || (changes.nextAction !== undefined && (typeof changes.nextAction !== 'string' || !changes.nextAction.trim())) || (changes.owner !== undefined && typeof changes.owner !== 'string') || (changes.priority !== undefined && !['low','normal','high'].includes(changes.priority))) throw new Error('Invalid task details.');
    const values = { nextAction: note.nextAction, dueDate: note.dueDate, followUpStatus: note.followUpStatus ?? 'open', owner: note.owner ?? '', priority: note.priority ?? 'normal' };
    for (const key of Object.keys(changes) as Array<keyof typeof values>) {
      if (checkConflicts && expected?.[key] !== undefined && values[key] !== expected[key] && values[key] !== changes[key]) throw new Error('Another device changed this follow-up. Your change is retained for review.');
    }
    result[listKey] = list.map(n => n.id === noteId ? { ...n, ...changes, followUpUpdatedAt: item.timestamp, history: [...(n.history ?? []), { id: item.id, at: item.timestamp, before: values, after: { ...values, ...changes } }] } : n);
  }
  if (item.actionType === 'FACT_REVIEW') {
    result._factReviews = [...(result._factReviews ?? []).filter(e => e.id !== item.payload.review.id), item.payload.review];
  }
  if (!['CREATE_FOLLOW_UP','UPDATE_FOLLOW_UP','FACT_REVIEW','CREATE_AGENCY','AGENCY_PATCH','ADD_FIELD_NOTE','UPDATE_STAGE'].includes(item.actionType))
    throw new Error('This older queued change requires review. It has not been discarded.');
  return result;
}
