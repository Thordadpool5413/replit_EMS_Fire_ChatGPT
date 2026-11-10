import { useCallback, useState } from 'react';
import { emptyResearch, loadResearch, saveResearch, type ProfileResearch } from './decisionSupport';

/** Browser-local research for one agency. Mount with key={agency.id} so state resets on agency switch. */
export function useProfileResearch(agencyId: string) {
  const [initial] = useState(() => {
    try { return loadResearch(agencyId); } catch { return { data: emptyResearch(), error: 'Saved equipment research could not be read. It has not been overwritten.' }; }
  });
  const [data, setData] = useState<ProfileResearch>(initial.data);
  const [loadError, setLoadError] = useState<string | undefined>(initial.error);
  const [saveError, setSaveError] = useState<string>();

  /** Saves first; local state only changes after storage succeeds. Returns an error message or undefined. */
  const commit = useCallback((next: ProfileResearch): string | undefined => {
    if (loadError) { const m = 'Saving is blocked until the unreadable saved record is recovered.'; setSaveError(m); return m; }
    try { saveResearch(agencyId, next); setData(next); setSaveError(undefined); return undefined; }
    catch (e) { const m = e instanceof Error ? e.message : 'Could not save research in this browser.'; setSaveError(m); return m; }
  }, [agencyId, loadError]);

  const recover = useCallback(() => {
    try { saveResearch(agencyId, emptyResearch()); setData(emptyResearch()); setLoadError(undefined); setSaveError(undefined); }
    catch (e) { setSaveError(e instanceof Error ? e.message : 'Could not reset saved research.'); }
  }, [agencyId]);

  return { data, loadError, saveError, commit, recover, blocked: Boolean(loadError) };
}
export type ProfileResearchState = ReturnType<typeof useProfileResearch>;
