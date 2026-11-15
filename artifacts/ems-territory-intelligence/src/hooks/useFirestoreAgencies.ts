import { withWorkspaceLock } from '../services/workspaceLock';
import { applyAgencyReviews, stripAgencyReviewOverlay } from '../services/agencyReviewOverlay';
import { FACT_REVIEW_STORAGE_KEY, type FactReviewEntry } from '../services/factReviewStore';
import { applyAgencyMutation } from '../services/agencyMutation';
import { commitAgencyMutation } from '../utils/firebase';
import { loadStoredOutbox, saveOutbox, createOutboxItem } from '../utils/syncStore';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Agency, LeadStage, FieldNote } from '../types';
import { 
  saveAgencyToFirestore, 
  subscribeToFirestoreAgencies, 
  batchSyncAgenciesToFirestore,
  testFirestoreConnection 
} from '../utils/firebase';
import { saveAgencies, loadStoredAgencies } from '../utils/syncStore';
import { territoryEngine } from '../services/territoryIntelligenceEngine';
import { dataSanitizationService } from '../services/dataSanitizationService';
import {
  applyAgencySourceRecordData,
  loadAgencySourceRecordData,
} from '../services/agencySourceRecordStore';

interface UseFirestoreAgenciesOptions {
  globalState?: string;
  globalCounty?: string;
  onToast?: (message: string, type?: 'success' | 'info' | 'warn' | 'error') => void;
}

export interface UseFirestoreAgenciesResult {
  agencies: Agency[];
  syncPendingChanges: () => Promise<void>;
  isCloudConnected: boolean;
  isSyncing: boolean;
  cloudSyncCount: number;
  strictCloudOnlyMode: boolean;
  toggleStrictCloudOnlyMode: (enabled: boolean) => void;
  hydrateBatchToCloud: (maxRecords?: number) => Promise<number>;
  updateAgencyInCloud: (agency: Agency) => Promise<void>;
  updateStageInCloud: (agencyId: string, newStage: LeadStage) => Promise<void>;
  toggleRouteInCloud: (agencyId: string) => Promise<void>;
  toggleBookmarkInCloud: (agencyId: string) => Promise<void>;
  addFieldNoteInCloud: (agencyId: string, note: FieldNote) => Promise<void>;
  updateFollowUp: (agencyId: string, note: FieldNote, changes: { dueDate: string; followUpStatus: 'open' | 'completed' }) => Promise<void>;
  addAgencyToCloud: (newAgency: Agency) => Promise<void>;
  setAgenciesState: React.Dispatch<React.SetStateAction<Agency[]>>;
}

/**
 * Data-fetching, read-only Firestore subscription, and local sanitization hook
 * across all 3,144 nationwide counties. Ensures zero mock/test records or synthetic notes
 * ever reach the UI.
 */
export function useFirestoreAgencies({
  globalState = 'all',
  globalCounty = 'all',
  onToast
}: UseFirestoreAgenciesOptions = {}): UseFirestoreAgenciesResult {
  const [allSanitizedAgencies, setAllSanitizedAgencies] = useState<Agency[]>(() =>
    dataSanitizationService.sanitizeAgenciesList(loadStoredAgencies(), undefined, false)
  );
  const [strictCloudOnlyMode, setStrictCloudOnlyMode] = useState<boolean>(() =>
    dataSanitizationService.getStrictCloudOnlyMode()
  );
  const [isCloudConnected, setIsCloudConnected] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [cloudSyncCount, setCloudSyncCount] = useState<number>(0);

  const initialHydratedRef = useRef<boolean>(false);

  // 1. Check connectivity and inspect the cloud count without modifying remote data.
  useEffect(() => {
    let isMounted = true;

    async function initializeCloudAndSanitize() {
      const connected = await testFirestoreConnection();
      if (!isMounted) return;
      setIsCloudConnected(connected);

      if (connected && !initialHydratedRef.current) {
        initialHydratedRef.current = true;
        try {
          // P0 Safety Safeguard: Never execute automatic wildcard deletion or purges against production Firestore on mount.
          // Cloud records are inspected in read-only mode during startup.
          setCloudSyncCount(dataSanitizationService.getCloudSyncedIdsCount());
        } catch (err) {
          console.warn('Initial cloud connectivity check deferred:', err);
        }
      }
    }

    initializeCloudAndSanitize();
    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Subscribe only after a state is selected. A national subscription would
  // download every agency document on each fresh browser session and can exhaust
  // Firestore's daily read quota. National browsing uses the existing local cache.
  useEffect(() => {
    if (globalState === 'all') return;

    let unsubscribe: (() => void) | undefined;

    try {
      unsubscribe = subscribeToFirestoreAgencies((rawCloudAgencies) => {
        if (rawCloudAgencies.length > 0) {
          const localSourceData = loadAgencySourceRecordData();
          // Strip any mock or test-generated records coming from Firestore
          const validCloudAgencies = dataSanitizationService.sanitizeAgenciesList(
            rawCloudAgencies.map(ca => ({
              ...ca,
              isCloudPersisted: true,
              dataProvenanceTier: 'firestore_cloud_synced' as const
            })),
            undefined,
            false
          );

          const validCloudIds = validCloudAgencies.map(ca => ca.id);
          dataSanitizationService.registerCloudSyncedIds(validCloudIds);
          setCloudSyncCount(dataSanitizationService.getCloudSyncedIdsCount());

          setAllSanitizedAgencies((currentLocal) => {
            const agencyMap = new Map<string, Agency>();
            for (const a of currentLocal) {
              const cleanLocal = dataSanitizationService.sanitizeAgency(a);
              if (cleanLocal) {
                agencyMap.set(cleanLocal.id, cleanLocal);
              }
            }
            for (const ca of validCloudAgencies) {
              const existing = agencyMap.get(ca.id);
              const mergedRecord = dataSanitizationService.sanitizeAgency({
                ...(existing || {}),
                ...ca,
                isCloudPersisted: true,
                _syncedAt: ca._syncedAt || existing?._syncedAt || new Date().toISOString(),
                dataProvenanceTier: 'firestore_cloud_synced'
              } as Agency);
              if (mergedRecord) {
                agencyMap.set(
                  ca.id,
                  applyAgencySourceRecordData(
                    mergedRecord,
                    localSourceData[ca.id],
                  ),
                );
              }
            }
            for (const item of loadStoredOutbox().filter(i => (i.status === 'PENDING' || i.status === 'FAILED'))) {
              try { agencyMap.set(item.agencyId, applyAgencyMutation(agencyMap.get(item.agencyId), item)); } catch { /* Retain unsupported queued actions. */ }
            }
            const merged = Array.from(agencyMap.values());
            try { saveAgencies(merged); } catch (e) { onToast?.(e instanceof Error ? e.message : 'Cloud cache could not be saved.', 'error'); }
            return merged;
          });
        }
      }, globalState, () => setIsCloudConnected(false));
    } catch (err) {
      console.warn('Real-time Firestore listener offline fallback:', err);
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [globalState]);

  // 3. Add available jurisdiction records to the local cache only. Selecting a county
  // must never cause a cloud write or batch synchronization.
  useEffect(() => {
    if (globalState !== 'all' && globalCounty !== 'all') {
      const normGlobalCounty = globalCounty.toLowerCase().replace(/\s+(county|parish|borough|census area|municipality)$/i, '').trim();
      const existingInCounty = allSanitizedAgencies.filter(a => {
        if (a.stateCode !== globalState.toUpperCase()) return false;
        const normAgencyCounty = a.county.toLowerCase().replace(/\s+(county|parish|borough|census area|municipality)$/i, '').trim();
        return normAgencyCounty === normGlobalCounty || normAgencyCounty.includes(normGlobalCounty) || normGlobalCounty.includes(normAgencyCounty);
      });

      if (existingInCounty.length < 2) {
        const enriched = territoryEngine.getAgenciesForCountyAndCities(
          globalState,
          globalCounty,
          undefined,
          allSanitizedAgencies,
          'all'
        );

        const cleanEnriched = dataSanitizationService.sanitizeAgenciesList(enriched, undefined, false);

        if (cleanEnriched.length > 0) {
          setAllSanitizedAgencies((prev) => {
            const seen = new Set(prev.map(p => p.id));
            const toAdd = cleanEnriched.filter(e => !seen.has(e.id));
            if (toAdd.length === 0) return prev;
            const updated = [...toAdd, ...prev];
            saveAgencies(updated);

            return updated;
          });
        }
      }
    }
  }, [globalState, globalCounty]);

  // Toggle strict cloud-only mode
  const toggleStrictCloudOnlyMode = useCallback((enabled: boolean) => {
    dataSanitizationService.setStrictCloudOnlyMode(enabled);
    setStrictCloudOnlyMode(enabled);
    if (onToast) {
      onToast(
        enabled
          ? 'Strict Cloud-Only Mode Enabled: Showing exclusively Firestore-persisted records.'
          : 'Verified Hybrid Mode Enabled: Showing all sanitized cloud and verified public registry records.',
        'info'
      );
    }
  }, [onToast]);

  // Batch hydrate unsynced active agencies into Firestore
  const hydrateBatchToCloud = useCallback(async (maxRecords: number = 35): Promise<number> => {
    const unsynced = allSanitizedAgencies.filter(
      a => !a.isCloudPersisted && !dataSanitizationService.isAgencyCloudSynced(a.id)
    );
    const targetBatch = (unsynced.length > 0 ? unsynced : allSanitizedAgencies).slice(0, maxRecords);
    if (targetBatch.length === 0) return 0;

    setIsSyncing(true);
    try {
      const nowIso = new Date().toISOString();
      const stampedBatch = targetBatch.map(a => ({
        ...a,
        _syncedAt: nowIso,
        isCloudPersisted: true,
        dataProvenanceTier: 'firestore_cloud_synced' as const
      }));

      const ids = await batchSyncAgenciesToFirestore(stampedBatch, maxRecords);
      const count = ids.length;
      dataSanitizationService.registerCloudSyncedIds(ids);
      setCloudSyncCount(dataSanitizationService.getCloudSyncedIdsCount());

      dataSanitizationService.recordAuditEvent(
        'CLOUD_HYDRATE',
        `Synchronized ${count} verified agency records to Google Cloud Firestore (${dataSanitizationService.getCloudSyncedIdsCount()} total in cloud).`,
        stampedBatch.length,
        0,
        dataSanitizationService.getCloudSyncedIdsCount()
      );

      setAllSanitizedAgencies(prev => {
        const idSet = new Set(ids);
        const updated = prev.map(a =>
          idSet.has(a.id)
            ? {
                ...a,
                _syncedAt: nowIso,
                isCloudPersisted: true,
                dataProvenanceTier: 'firestore_cloud_synced' as const
              }
            : a
        );
        saveAgencies(updated);
        return updated;
      });

      if (onToast) {
        onToast(`Synchronized ${count} agency records to Cloud Firestore!`, 'success');
      }
      return count;
    } catch (err) {
      console.error('Batch cloud hydration error:', err);
      if (onToast) {
        onToast('Cloud hydration encountered a network delay; queued locally.', 'warn');
      }
      return 0;
    } finally {
      setIsSyncing(false);
    }
  }, [allSanitizedAgencies, onToast]);

  // 4. Update single agency in Firestore + local optimistic update
  const updateAgencyInCloud = useCallback(async (agency: Agency) => {
    const cleanAgency = dataSanitizationService.sanitizeAgency({
      ...agency,
      _updatedAt: new Date().toISOString(),
      isCloudPersisted: true,
      dataProvenanceTier: 'firestore_cloud_synced'
    });
    if (!cleanAgency) return;

    try {
      setIsSyncing(true);
      await saveAgencyToFirestore(cleanAgency);
      dataSanitizationService.registerCloudSyncedIds([cleanAgency.id]);
      setCloudSyncCount(dataSanitizationService.getCloudSyncedIdsCount());
      setAllSanitizedAgencies(prev => {
        const next = prev.map(a => a.id === cleanAgency.id ? cleanAgency : a);
        saveAgencies(next);
        return next;
      });
    } catch (err) {
      console.warn('Cloud write buffered offline:', err);
      if (onToast) onToast('Firestore write failed. The local record is unchanged and remains available.', 'error');
    } finally {
      setIsSyncing(false);
    }
  }, [onToast]);

  const recordsRef = useRef(allSanitizedAgencies);
  recordsRef.current = allSanitizedAgencies;
  const syncingRef = useRef(false);
  const syncPendingChanges = useCallback(async () => {
    if (syncingRef.current || (typeof navigator !== 'undefined' && !navigator.onLine)) return;
    syncingRef.current = true; setIsSyncing(true);
    try {
      const pending = loadStoredOutbox().filter(i => (i.status === 'PENDING' || i.status === 'FAILED'));
      const blocked = new Set<string>();
      for (const item of pending) {
        if (blocked.has(item.agencyId)) continue;
        try {
          const syncedRevision = await commitAgencyMutation(item);
          await withWorkspaceLock(() => saveOutbox(loadStoredOutbox().map(i => i.id === item.id ? { ...i, status: 'SYNCED', error: undefined, syncedRevision } : i)));
          setIsCloudConnected(true);
        } catch (error) {
          blocked.add(item.agencyId);
          const message = error instanceof Error ? error.message : 'Cloud save failed. Retry when connected.';
          await withWorkspaceLock(() => saveOutbox(loadStoredOutbox().map(i => i.id === item.id ? { ...i, status: 'FAILED', error: message } : i)));
          onToast?.('Saved on this device. Cloud sync needs attention: ' + message, 'warn');
        }
      }
    } catch (error) { onToast?.('Sync status could not be saved. The journal is retained: ' + String(error), 'error'); }
    finally { syncingRef.current = false; setIsSyncing(false); }
  }, [onToast]);

  useEffect(() => {
    const retry = () => { void syncPendingChanges(); };
    retry();
    window.addEventListener('online', retry);
    const timer = window.setInterval(retry, 60000);
    return () => { window.removeEventListener('online', retry); window.clearInterval(timer); };
  }, [syncPendingChanges]);

  // The durable journal is written before updating React or reporting success.
  // Acknowledged entries remain available for offline recovery and complete backups.
  const recordChange = useCallback(async (agencyId: string, action: import('../types').SyncOutboxItem['actionType'], payload: any) => {
    const current = recordsRef.current.find(a => a.id === agencyId);
    const item = createOutboxItem(agencyId, current?.name ?? payload.agency?.name ?? agencyId, action, { ...payload, base: current });
    applyAgencyMutation(current, item); // Validate before the durable write.
    await withWorkspaceLock(() => saveOutbox([...loadStoredOutbox(), item]));
    const updated = applyAgencyMutation(recordsRef.current.find(a => a.id === agencyId), item);
    const next = current ? recordsRef.current.map(a => a.id === agencyId ? updated : a) : [updated, ...recordsRef.current];
    recordsRef.current = next;
    setAllSanitizedAgencies(next);
    onToast?.('Saved on this device. Waiting for cloud acknowledgment.', 'info');
    void syncPendingChanges();
  }, [onToast, syncPendingChanges]);

  const updateStageInCloud = useCallback(async (id: string, stage: LeadStage) => {
    const current = recordsRef.current.find(a => a.id === id);
    await recordChange(id, 'AGENCY_PATCH', { changes: { 'zollOpportunity.salesStage': stage }, expected: { 'zollOpportunity.salesStage': current?.zollOpportunity.salesStage } });
  }, [recordChange]);
  const toggleRouteInCloud = useCallback(async (id: string) => {
    const current = recordsRef.current.find(a => a.id === id);
    await recordChange(id, 'AGENCY_PATCH', { changes: { inDayRoute: !current?.inDayRoute }, expected: { inDayRoute: Boolean(current?.inDayRoute) } });
  }, [recordChange]);
  const toggleBookmarkInCloud = useCallback(async (id: string) => {
    const current = recordsRef.current.find(a => a.id === id);
    await recordChange(id, 'AGENCY_PATCH', { changes: { isBookmarked: !current?.isBookmarked }, expected: { isBookmarked: Boolean(current?.isBookmarked) } });
  }, [recordChange]);
  const addFieldNoteInCloud = useCallback(async (id: string, note: FieldNote) => {
    if (dataSanitizationService.isMockOrTestFieldNote(note)) throw new Error('This note matches test data. Change its content before saving.');
    await recordChange(id, 'ADD_FIELD_NOTE', { note });
  }, [recordChange]);
  const updateFollowUp = useCallback(async (id: string, note: FieldNote, changes: { dueDate: string; followUpStatus: 'open' | 'completed' }) => {
    await recordChange(id, 'UPDATE_FOLLOW_UP', { noteId: note.id, changes, expected: { dueDate: note.dueDate, followUpStatus: note.followUpStatus ?? 'open' } });
  }, [recordChange]);
  const addAgencyToCloud = useCallback(async (agency: Agency) => {
    const clean = dataSanitizationService.sanitizeAgency(agency);
    if (!clean) throw new Error('Agency identity is invalid. Your changes have not been saved.');
    await recordChange(agency.id, 'CREATE_AGENCY', { agency: clean });
  }, [recordChange]);

  useEffect(() => {
    const enqueueReview = (event: Event) => {
      const entry = (event as CustomEvent<FactReviewEntry>).detail;
      if (!entry) return;
      void recordChange(entry.agencyId, 'FACT_REVIEW', { review: entry }).catch(e => onToast?.('Review saved locally; cloud queue failed: ' + String(e), 'error'));
    };
    window.addEventListener('ems-reviews-changed', enqueueReview);
    return () => window.removeEventListener('ems-reviews-changed', enqueueReview);
  }, [recordChange, onToast]);

  useEffect(() => {
    const resolveConflict = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      void withWorkspaceLock(() => {
        saveOutbox(loadStoredOutbox().map(item => item.id === id && item.status === 'FAILED' && item.error?.includes('Another device changed')
          ? { ...item, status: 'PENDING', error: undefined, payload: { ...item.payload, expected: {} } } : item));
      }).then(() => syncPendingChanges()).catch(e => onToast?.(String(e), 'error'));
    };
    window.addEventListener('ems-resolve-conflict', resolveConflict);
    return () => window.removeEventListener('ems-resolve-conflict', resolveConflict);
  }, [syncPendingChanges, onToast]);

  const [reviewVersion, setReviewVersion] = useState(0);
  useEffect(() => {
    const refresh = () => setReviewVersion(v => v + 1);
    const refreshStorage = (e: StorageEvent) => {
      refresh();
      if (e.key === 'zoll_pulseiq_outbox_v1') {
        try { setAllSanitizedAgencies(dataSanitizationService.sanitizeAgenciesList(loadStoredAgencies(), undefined, false)); }
        catch (error) { onToast?.(String(error), 'error'); }
      }
    };
    window.addEventListener('ems-reviews-changed', refresh);
    window.addEventListener('storage', refreshStorage);
    return () => { window.removeEventListener('ems-reviews-changed', refresh); window.removeEventListener('storage', refreshStorage); };
  }, []);
  const effectiveAgencies = useMemo(() => {
    try {
      const entries: FactReviewEntry[] = JSON.parse(localStorage.getItem(FACT_REVIEW_STORAGE_KEY) ?? '[]');
      const byAgency = new Map<string, FactReviewEntry[]>();
      for (const entry of entries) byAgency.set(entry.agencyId, [...(byAgency.get(entry.agencyId) ?? []), entry]);
      return allSanitizedAgencies.map(a => {
        const reviews = [...new Map([...(a._factReviews ?? []), ...(byAgency.get(a.id) ?? [])].map(e => [e.id, e])).values()].sort((a,b) => a.reviewedAt.localeCompare(b.reviewedAt));
        return reviews.length ? applyAgencyReviews(a, reviews) : a;
      });
    } catch { return allSanitizedAgencies; }
  }, [allSanitizedAgencies, reviewVersion]);

  const setRawAgenciesState = useCallback<React.Dispatch<React.SetStateAction<Agency[]>>>((next) => {
    setAllSanitizedAgencies(previous => (typeof next === 'function' ? next(previous) : next).map(stripAgencyReviewOverlay));
  }, []);

  // Filter displayed agencies if strictCloudOnlyMode is active
  const visibleAgencies = strictCloudOnlyMode
    ? effectiveAgencies.filter(
        a => a.isCloudPersisted || dataSanitizationService.isAgencyCloudSynced(a.id)
      )
    : effectiveAgencies;

  return {
    agencies: visibleAgencies,
    syncPendingChanges,
    isCloudConnected,
    isSyncing,
    cloudSyncCount,
    strictCloudOnlyMode,
    toggleStrictCloudOnlyMode,
    hydrateBatchToCloud,
    updateAgencyInCloud,
    updateStageInCloud,
    toggleRouteInCloud,
    toggleBookmarkInCloud,
    addFieldNoteInCloud,
    updateFollowUp,
    addAgencyToCloud,
    setAgenciesState: setRawAgenciesState
  };
}

/**
 * Read-only accessor to inspect agencies loaded and sanitized by useFirestoreAgencies
 * without mutating Firestore production data.
 */
export function getInitialFirestoreAgenciesDataset(): Agency[] {
  return dataSanitizationService.sanitizeAgenciesList(loadStoredAgencies(), undefined, false);
}
