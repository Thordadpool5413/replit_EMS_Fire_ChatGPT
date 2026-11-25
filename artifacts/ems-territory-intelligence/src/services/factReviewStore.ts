/**
 * Append-only, agency + individual-field review history.
 * Browser-local, named attribution; not authenticated identity or cloud sync.
 * Corrections remain overlays and never rewrite imported agency records.
 */
export type FactReviewAction = 'review' | 'confirm' | 'correct' | 'flag' | 'note';
export interface FactReviewEntry {
  id: string;
  agencyId: string;
  fieldId: string;
  action: FactReviewAction;
  originalValue: string;
  previousValue: string;
  correctedValue?: string;
  reviewer: string;
  method: string;
  note: string;
  supportingUrl?: string;
  sourceName?: string;
  sourceUrl?: string;
  sourceKind?: string;
  sourcePeriod?: string;
  /** Exact source identity captured when an end user reviews this field. */
  sourceRecordId?: string;
  reviewedAt: string;
}
export const FACT_REVIEW_STORAGE_KEY = 'ems_agency_fact_reviews_v1';
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
const actions: FactReviewAction[] = ['review','confirm','correct','flag','note'];
const safe = (s: unknown): s is string => typeof s === 'string' && !!s.trim() && !['__proto__','constructor','prototype'].includes(s);
export const safeSourceUrl = (value?: string): string | undefined => {
  if (!value) return undefined;
  try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) ? u.href : undefined; } catch { return undefined; }
};
function storage(): StorageLike {
  if (typeof window === 'undefined') throw new Error('Review storage is unavailable.');
  return window.localStorage;
}
function validate(entry: FactReviewEntry): boolean {
  return safe(entry?.id) && safe(entry.agencyId) && safe(entry.fieldId) &&
    actions.includes(entry.action) && safe(entry.reviewer) && safe(entry.method) &&
    typeof entry.originalValue === 'string' && typeof entry.previousValue === 'string' &&
    typeof entry.note === 'string' && Number.isFinite(Date.parse(entry.reviewedAt)) &&
    (entry.action !== 'correct' || safe(entry.correctedValue)) &&
    (!entry.supportingUrl || !!safeSourceUrl(entry.supportingUrl));
}
export function loadFactReviews(agencyId: string, store: StorageLike = storage()): FactReviewEntry[] {
  const raw = store.getItem(FACT_REVIEW_STORAGE_KEY);
  if (raw === null) return [];
  let all: unknown;
  try { all = JSON.parse(raw); } catch { throw new Error('Saved review history could not be read. It has not been overwritten.'); }
  if (!Array.isArray(all) || !all.every(e => validate(e as FactReviewEntry))) {
    throw new Error('Saved review history has an unsupported format. It has not been overwritten.');
  }
  return (all as FactReviewEntry[]).filter(e => e.agencyId === agencyId);
}
export function appendFactReview(entry: FactReviewEntry, store: StorageLike = storage()): FactReviewEntry[] {
  if (!validate(entry)) throw new Error('A specific fact, reviewer, method, and valid review date are required.');
  // Validate the complete store before writing; do not silently discard unreadable history.
  const raw = store.getItem(FACT_REVIEW_STORAGE_KEY);
  if (raw !== null) loadFactReviews(entry.agencyId, store);
  const all: FactReviewEntry[] = raw === null ? [] : JSON.parse(raw);
  if (all.some(e => e.id === entry.id)) throw new Error('This review has already been saved.');
  try { store.setItem(FACT_REVIEW_STORAGE_KEY, JSON.stringify([...all, entry])); }
  catch { throw new Error('This browser could not save the review. Your changes are still in the form.'); }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('ems-reviews-changed', {detail: entry}));
  return [...all,entry].filter(e => e.agencyId === entry.agencyId);
}
export function effectiveFactValue(original: string, entries: FactReviewEntry[]): string {
  // A correction belongs to the imported value the reviewer saw. A later source update
  // must not be silently masked by an older correction.
  const corrections = entries.filter(e => e.action === 'correct' && e.originalValue === original);
  return corrections.at(-1)?.correctedValue ?? original;
}
export function factReviewStatus(original: string, entries: FactReviewEntry[]): string {
  const relevant = entries.filter(e => e.originalValue === original && e.action !== 'note' && e.action !== 'review');
  const latest = relevant.at(-1);
  if (!latest) return entries.length ? 'History available · review current value' : 'Needs review';
  return latest.action === 'confirm' ? 'User confirmed' : latest.action === 'correct' ? 'User correction' : 'Discrepancy flagged';
}

export type FieldValidationState='Not reported'|'End-user validation required'|'User confirmed this value'|'User-reported correction'|'Discrepancy flagged'|'Source or value changed; review required';
export type FieldReviewSource={sourceName?:string;sourceUrl?:string;sourceKind?:string;reportingPeriod?:string;sourceRecordId?:string};
/** Neither an imported reviewed flag nor a group-level source certifies a field.
 * Confirmation is attributable to the exact displayed value and source revision. */
export function fieldValidationState(original:string,current:string,entries:FactReviewEntry[],source?:FieldReviewSource):FieldValidationState{
 const actions=entries.filter(e=>['confirm','correct','flag'].includes(e.action)).sort((a,b)=>a.reviewedAt.localeCompare(b.reviewedAt));
 if(!actions.length)return current==='Not reported'?'Not reported':'End-user validation required';
 const latest=actions.at(-1)!;
 if(latest.originalValue!==original||latest.sourceName!==source?.sourceName||safeSourceUrl(latest.sourceUrl)!==safeSourceUrl(source?.sourceUrl)||latest.sourceKind!==source?.sourceKind||latest.sourcePeriod!==source?.reportingPeriod||latest.sourceRecordId!==source?.sourceRecordId)return 'Source or value changed; review required';
 if(latest.action==='flag')return 'Discrepancy flagged';
 if(current==='Not reported'||!latest.reviewer.trim()||!latest.method.trim()||!latest.note.trim())return 'End-user validation required';
 if(latest.action==='confirm'&&latest.previousValue===current)return 'User confirmed this value';
 if(latest.action==='correct'&&latest.correctedValue===current)return 'User-reported correction';
 return 'Source or value changed; review required';
}
