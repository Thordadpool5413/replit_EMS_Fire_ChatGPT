import { activeProviderRecords,isLegacyProviderRecord,isLegacyProviderId,canBulkHydrateAgency } from '../utils/providerRecordTrust';
import { createAgencyDirectoryLoader, mergeDirectoryAgency, type DirectoryLoadStatus } from '../services/agencyDirectoryLoader';
import type { FollowUpChange } from '../utils/followUps';
import { withWorkspaceLock } from '../services/workspaceLock';
import { applyAgencyReviews, stripAgencyReviewOverlay } from '../services/agencyReviewOverlay';
import { FACT_REVIEW_STORAGE_KEY, type FactReviewEntry } from '../services/factReviewStore';
import { applyAgencyMutation } from '../services/agencyMutation';
import { commitAgencyMutation } from '../utils/replitAgencyApi';
import { loadStoredOutbox, saveOutbox, createOutboxItem } from '../utils/syncStore';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Agency, LeadStage, FieldNote } from '../types';
import {
  saveAgencyToReplit,
  subscribeToReplitAgencies,
  batchSyncAgenciesToReplit,
  fetchAgencyDirectoryPage,
} from '../utils/replitAgencyApi';
import { saveAgencies, loadStoredAgencies } from '../utils/syncStore';
import { territoryEngine } from '../services/territoryIntelligenceEngine';
import { dataSanitizationService } from '../services/dataSanitizationService';
import {
  applyAgencySourceRecordData,
  loadAgencySourceRecordData,
} from '../services/agencySourceRecordStore';

const nationalDirectory = createAgencyDirectoryLoader(fetchAgencyDirectoryPage);

interface UseAgencyRecordsOptions {
  globalState?: string;
  globalCounty?: string;
  onToast?: (message: string, type?: 'success' | 'info' | 'warn' | 'error') => void;
}

export interface UseAgencyRecordsResult {
  agencies: Agency[];
  quarantinedProviders: Agency[];
  directoryStatus: {
    stateCode: string;
    status: 'loading' | 'ready' | 'unavailable';
  };
  nationalDirectoryStatus: DirectoryLoadStatus;
  retryNationalDirectory: () => Promise<void>;
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
  createFollowUp: (agencyId: string, task: FieldNote) => Promise<void>;
  updateFollowUp: (agencyId: string, note: FieldNote, changes: FollowUpChange) => Promise<void>;
  addAgencyToCloud: (newAgency: Agency) => Promise<void>;
  setAgenciesState: React.Dispatch<React.SetStateAction<Agency[]>>;
}

/**
 * Data-fetching, Replit-backed agency synchronization, and local sanitization hook
 * across all 3,144 nationwide counties. Ensures zero mock/test records or synthetic notes
 * ever reach the UI.
 */
export function useAgencyRecords({
  globalState = 'all',
  globalCounty = 'all',
  onToast
}: UseAgencyRecordsOptions = {}): UseAgencyRecordsResult {
  const [allSanitizedAgencies, setAllSanitizedAgencies] = useState<Agency[]>(() =>
    dataSanitizationService.sanitizeAgenciesList(loadStoredAgencies(), undefined, false)
  );
  const [strictCloudOnlyMode, setStrictCloudOnlyMode] = useState<boolean>(() =>
    dataSanitizationService.getStrictCloudOnlyMode()
  );
  const [isCloudConnected, setIsCloudConnected] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [cloudSyncCount, setCloudSyncCount] = useState<number>(0);
  const [nationalDirectoryStatus, setNationalDirectoryStatus] = useState<DirectoryLoadStatus>({ status: 'loading', loaded: 0 });
  const [stateDirectoryStatus, setDirectoryStatus] = useState<UseAgencyRecordsResult['directoryStatus']>({
    stateCode: 'all',
    status: 'ready',
  });

  const toastRef = useRef(onToast);
  toastRef.current = onToast;
  const mergeCloudAgencies = useCallback((rawCloudAgencies: Agency[]) => {
    if (rawCloudAgencies.length > 0) {
      const localSourceData = loadAgencySourceRecordData();
      // Keep only actual, sanitized agency records returned by the Replit API.
      const validCloudAgencies = dataSanitizationService.sanitizeAgenciesList(
        rawCloudAgencies.map(ca => ({
          ...ca,
          isCloudPersisted: true,
          dataProvenanceTier: 'replit_backend_synced' as const
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
          const mergedRecord = dataSanitizationService.sanitizeAgency(mergeDirectoryAgency(existing, ca));
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
        try { saveAgencies(merged); } catch (e) { toastRef.current?.(e instanceof Error ? e.message : 'Cloud cache could not be saved.', 'error'); }
        return merged;
      });
    }
  }, []);

  // Read all backend records once, independently of the selected territory.
  useEffect(() => {
    const unsubscribe = nationalDirectory.subscribe((page, progress) => {
      mergeCloudAgencies(page);
      setNationalDirectoryStatus(progress);
      if (page.length || progress.status === 'ready') setIsCloudConnected(true);
      else if (progress.status === 'unavailable') setIsCloudConnected(false);
    });
    const retry = () => { void nationalDirectory.retry(); };
    window.addEventListener('online', retry);
    return () => { unsubscribe(); window.removeEventListener('online', retry); };
  }, [mergeCloudAgencies]);

  const directoryStatus = globalState.toLowerCase() === 'all'
    ? { stateCode: 'all', status: nationalDirectoryStatus.status }
    : stateDirectoryStatus;

  // Refresh only the selected state periodically; national pages remain session-cached.
  useEffect(() => {
    const stateCode = globalState.trim().toUpperCase() || 'ALL';
    if (stateCode === 'ALL') {
      return;
    }

    setDirectoryStatus({ stateCode, status: 'loading' });
    let unsubscribe: (() => void) | undefined;

    try {
      unsubscribe = subscribeToReplitAgencies((rawCloudAgencies) => {
        setDirectoryStatus({ stateCode, status: 'ready' });
        setIsCloudConnected(true);
        mergeCloudAgencies(rawCloudAgencies);
      }, stateCode, () => {
        setIsCloudConnected(false);
        setDirectoryStatus({ stateCode, status: 'unavailable' });
      });
    } catch (err) {
      console.warn('Replit agency refresh could not start:', err);
      setDirectoryStatus({ stateCode, status: 'unavailable' });
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [globalState, mergeCloudAgencies]);

  // Geographic navigation is read-only. It must not manufacture or cache provider accounts.

  // Toggle strict cloud-only mode
  const toggleStrictCloudOnlyMode = useCallback((enabled: boolean) => {
    dataSanitizationService.setStrictCloudOnlyMode(enabled);
    setStrictCloudOnlyMode(enabled);
    if (onToast) {
      onToast(
        enabled
          ? 'Replit-only Mode Enabled: Showing exclusively backend-persisted records.'
          : 'Verified Hybrid Mode Enabled: Showing all sanitized cloud and verified public registry records.',
        'info'
      );
    }
  }, [onToast]);

  // Batch create eligible records that do not yet exist in the Replit backend.
  const hydrateBatchToCloud = useCallback(async (maxRecords: number = 25): Promise<number> => {
    const unsynced = allSanitizedAgencies.filter(
      a => canBulkHydrateAgency(a) && !a.isCloudPersisted && !dataSanitizationService.isAgencyCloudSynced(a.id)
    );
    const targetBatch = unsynced.slice(0, Math.min(25,Math.max(0,maxRecords)));
    if (targetBatch.length === 0) { onToast?.('No eligible unsynced source-native accounts in this workspace.', 'info'); return 0; }

    setIsSyncing(true);
    try {
      const nowIso = new Date().toISOString();
      const stampedBatch = targetBatch.map(a => ({
        ...a,
        _syncedAt: nowIso,
        isCloudPersisted: true,
        dataProvenanceTier: 'replit_backend_synced' as const
      }));

      const ids = await batchSyncAgenciesToReplit(stampedBatch, maxRecords);
      const count = ids.length;
      dataSanitizationService.registerCloudSyncedIds(ids);
      setCloudSyncCount(dataSanitizationService.getCloudSyncedIdsCount());

      dataSanitizationService.recordAuditEvent(
        'CLOUD_HYDRATE',
        `Saved ${count} source-native registry accounts to the Replit backend (${dataSanitizationService.getCloudSyncedIdsCount()} total).`,
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
                dataProvenanceTier: 'replit_backend_synced' as const
              }
            : a
        );
        saveAgencies(updated);
        return updated;
      });

      if (onToast) {
        onToast(`Saved ${count} agency records to the Replit backend.`, 'success');
      }
      return count;
    } catch (err) {
      console.error('Batch cloud hydration error:', err);
      if (onToast) {
        onToast('Cloud batch synchronization could not be confirmed. Saved local accounts remain available; retry after checking connectivity.', 'warn');
      }
      return 0;
    } finally {
      setIsSyncing(false);
    }
  }, [allSanitizedAgencies, onToast]);

  // Save a complete agency record with revision protection.
  const updateAgencyInCloud = useCallback(async (agency: Agency) => {
    if(isLegacyProviderRecord(agency))throw Error('Legacy modeled provider is quarantined; reconcile against a public registry before editing.');
    const cleanAgency = dataSanitizationService.sanitizeAgency({
      ...agency,
      _updatedAt: new Date().toISOString(),
      isCloudPersisted: true,
      dataProvenanceTier: 'replit_backend_synced'
    });
    if (!cleanAgency) return;

    try {
      setIsSyncing(true);
      const saved = await saveAgencyToReplit(cleanAgency);
      dataSanitizationService.registerCloudSyncedIds([cleanAgency.id]);
      setCloudSyncCount(dataSanitizationService.getCloudSyncedIdsCount());
      setAllSanitizedAgencies(prev => {
        const next = prev.map(a => a.id === cleanAgency.id ? saved : a);
        saveAgencies(next);
        return next;
      });
    } catch (err) {
      console.warn('Cloud write buffered offline:', err);
      if (onToast) onToast('Replit backend save failed. The local record remains available for recovery.', 'error');
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
        if(isLegacyProviderId(item.agencyId)||recordsRef.current.some(a=>a.id===item.agencyId&&isLegacyProviderRecord(a))||item.payload?.base&&isLegacyProviderRecord(item.payload.base)||item.payload?.agency&&isLegacyProviderRecord(item.payload.agency)){
          const error='Legacy modeled account quarantined. Export and reconcile the saved work against an actual provider.';
          if(item.status!=='FAILED'||item.error!==error)await withWorkspaceLock(()=>saveOutbox(loadStoredOutbox().map(i=>i.id===item.id?{...i,status:'FAILED',error}:i)));
          blocked.add(item.agencyId);continue;
        }
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
    if(isLegacyProviderId(agencyId)||current&&isLegacyProviderRecord(current)||payload.agency&&isLegacyProviderRecord(payload.agency))throw Error('This legacy account requires identity reconciliation; no provider change was saved.');
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
  const createFollowUp = useCallback(async (id: string, task: FieldNote) => { await recordChange(id, 'CREATE_FOLLOW_UP', {task}); }, [recordChange]);
  const updateFollowUp = useCallback(async (id: string, note: FieldNote, changes: FollowUpChange) => {
    await recordChange(id, 'UPDATE_FOLLOW_UP', { noteId: note.id, taskOnly: Boolean(note.taskOnly), changes, expected: { nextAction: note.nextAction, owner: note.owner ?? '', priority: note.priority ?? 'normal', dueDate: note.dueDate, followUpStatus: note.followUpStatus ?? 'open' } });
  }, [recordChange]);
  const addAgencyToCloud = useCallback(async (agency: Agency) => {
    if(isLegacyProviderRecord(agency))throw Error('Synthetic or illustrative accounts cannot be created. Select an actual public registry listing.');
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
      return activeProviderRecords(allSanitizedAgencies).map(a => {
        const reviews = [...new Map([...(a._factReviews ?? []), ...(byAgency.get(a.id) ?? [])].map(e => [e.id, e])).values()].sort((a,b) => a.reviewedAt.localeCompare(b.reviewedAt));
        return reviews.length ? applyAgencyReviews(a, reviews) : a;
      });
    } catch { return activeProviderRecords(allSanitizedAgencies); }
  }, [allSanitizedAgencies, reviewVersion]);

  const setRawAgenciesState = useCallback<React.Dispatch<React.SetStateAction<Agency[]>>>((next) => {
    setAllSanitizedAgencies(previous => {
      const updated=(typeof next==='function'?next(activeProviderRecords(previous)):next).map(stripAgencyReviewOverlay);
      const byId=new Map(updated.map(a=>[a.id,a]));
      for(const a of previous.filter(isLegacyProviderRecord))if(!byId.has(a.id))byId.set(a.id,a);
      return [...byId.values()];
    });
  }, []);

  // Filter displayed agencies if strictCloudOnlyMode is active
  const visibleAgencies = strictCloudOnlyMode
    ? effectiveAgencies.filter(
        a => a.isCloudPersisted || dataSanitizationService.isAgencyCloudSynced(a.id)
      )
    : effectiveAgencies;

  return {
    agencies: visibleAgencies,
    quarantinedProviders: allSanitizedAgencies.filter(isLegacyProviderRecord),
    directoryStatus,
    nationalDirectoryStatus,
    retryNationalDirectory: nationalDirectory.retry,
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
    createFollowUp,
    addAgencyToCloud,
    setAgenciesState: setRawAgenciesState
  };
}

/**
 * Read-only accessor to inspect the locally cached and sanitized agency records.
 */
export function getInitialAgencyRecordsDataset(): Agency[] {
  return activeProviderRecords(dataSanitizationService.sanitizeAgenciesList(loadStoredAgencies(), undefined, false));
}
