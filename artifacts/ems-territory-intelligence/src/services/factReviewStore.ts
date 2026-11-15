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
