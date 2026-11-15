import type { Agency, FieldNote } from '../types';
export type FollowUpChange = { dueDate: string; followUpStatus: 'open' | 'completed'; nextAction?: string; owner?: string; priority?: 'low' | 'normal' | 'high' };
export type FollowUpUpdater = (agencyId: string, note: FieldNote, changes: FollowUpChange) => Promise<void>;
export const localDay = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
export function followUpBucket(note: FieldNote, today = localDay()) {
  if (note.followUpStatus === 'completed') return 'Completed';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(note.dueDate)) return 'No date';
  return note.dueDate < today ? 'Overdue' : note.dueDate === today ? 'Today' : 'Upcoming';
}
export function collectFollowUps(agencies: Agency[]) {
  return agencies.flatMap(agency => [...(agency.fieldNotes ?? []), ...(agency.followUpTasks ?? [])].filter(note => note.nextAction?.trim()).map(note=>({agency,note})))
    .sort((a,b)=>(a.note.dueDate || '9999').localeCompare(b.note.dueDate || '9999') || a.agency.name.localeCompare(b.agency.name));
}
