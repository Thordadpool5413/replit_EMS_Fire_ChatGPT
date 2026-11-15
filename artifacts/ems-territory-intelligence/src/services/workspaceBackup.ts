import type { Agency } from '../types';
import { FACT_REVIEW_STORAGE_KEY, loadFactReviews } from './factReviewStore';
import { validateResearch } from '../components/profile/decisionSupport';

export interface WorkspaceBackup { format: 'ems-workspace'; version: 1; createdAt: string; agencies: Agency[]; storage: Record<string,string> }
const allowed = (key: string) => [FACT_REVIEW_STORAGE_KEY, 'ems_territory_agency_source_records_v1',
  'zoll_pulseiq_custom_agencies_v8', 'zoll_pulseiq_outbox_v1', 'zoll_pulseiq_weights_v1'].includes(key) || key.startsWith('ems_equipment_research_v1:');
export function createWorkspaceBackup(agencies: Agency[], store: Storage = localStorage): WorkspaceBackup {
  const storage: Record<string,string> = {};
  for (let i = 0; i < store.length; i++) {
    const key = store.key(i)!;
    if (allowed(key)) storage[key] = store.getItem(key)!;
  }
  return { format:'ems-workspace', version:1, createdAt:new Date().toISOString(), agencies, storage };
}
export function parseWorkspaceBackup(serialized: string): WorkspaceBackup {
  const b = JSON.parse(serialized);
  if (b?.format !== 'ems-workspace' || b.version !== 1 || !Array.isArray(b.agencies) || !b.storage || typeof b.storage !== 'object' || Array.isArray(b.storage))
    throw new Error('Unsupported backup. Expected an EMS workspace version 1 export.');
  if (!b.agencies.every((a: Agency) => a && typeof a.id === 'string' && typeof a.name === 'string' && a.zollOpportunity && Array.isArray(a.fieldNotes)))
    throw new Error('Backup contains an invalid agency record. Nothing was restored.');
  for (const [key, value] of Object.entries(b.storage)) {
    if (!allowed(key) || typeof value !== 'string') throw new Error('Backup contains an unsupported storage entry.');
    const parsed = JSON.parse(value);
    if (key === FACT_REVIEW_STORAGE_KEY) loadFactReviews('', {getItem:()=>value,setItem:()=>{}});
    if (key.startsWith('ems_equipment_research_v1:')) validateResearch(parsed);
    if (key === 'zoll_pulseiq_custom_agencies_v8' && (!Array.isArray(parsed) || !parsed.every(e => Array.isArray(e) && typeof e[0] === 'string' && e[1] && typeof e[1] === 'object')))
      throw new Error('Invalid saved agency changes.');
    if (key === 'zoll_pulseiq_outbox_v1' && (!Array.isArray(parsed) || !parsed.every(e => e && typeof e.id === 'string' && typeof e.agencyId === 'string' && typeof e.actionType === 'string' && e.payload && ['PENDING','FAILED','SYNCED','LOCAL_ONLY'].includes(e.status))))
      throw new Error('Invalid change journal.');
    if (key === 'ems_territory_agency_source_records_v1' && (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))) throw new Error('Invalid source records.');
  }
  return b;
}
/** Validate everything before writing, and restore the pre-import state on quota errors. */
export function restoreWorkspaceBackup(backup: WorkspaceBackup, store: Storage = localStorage): void {
  const validated = parseWorkspaceBackup(JSON.stringify(backup));
  const previous = createWorkspaceBackup([], store).storage;
  // Do not automatically upload an old backup over live cloud work.
  const restored = {...validated.storage};
  if (restored.zoll_pulseiq_outbox_v1) {
    restored.zoll_pulseiq_outbox_v1 = JSON.stringify(JSON.parse(restored.zoll_pulseiq_outbox_v1).map((i: any) => ({...i, status: 'LOCAL_ONLY', error: undefined})));
  }
  const agencyEntries = new Map<string, any>(JSON.parse(restored.zoll_pulseiq_custom_agencies_v8 ?? '[]'));
  for (const agency of validated.agencies) {
    if (!agency.verificationSource?.includes('Geographic prospect generator') || agency.isCloudPersisted)
      agencyEntries.set(agency.id, { ...agencyEntries.get(agency.id), record: agency });
  }
  restored.zoll_pulseiq_custom_agencies_v8 = JSON.stringify([...agencyEntries]);
  try {
    for (const key of Object.keys(previous)) store.removeItem(key);
    for (const [key,value] of Object.entries(restored)) store.setItem(key,value);
  } catch (error) {
    for (const key of Object.keys(restored)) store.removeItem(key);
    for (const [key,value] of Object.entries(previous)) store.setItem(key,value);
    throw new Error('Restore failed. The previous workspace was retained. Free device storage and retry.');
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('ems-reviews-changed'));
    window.dispatchEvent(new Event('ems-outbox-changed'));
  }
}
