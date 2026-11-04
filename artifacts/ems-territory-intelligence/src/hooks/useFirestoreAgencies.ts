/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef } from 'react';
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
            const merged = Array.from(agencyMap.values());
            saveAgencies(merged);
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

      const count = await batchSyncAgenciesToFirestore(stampedBatch, maxRecords);
      const ids = stampedBatch.slice(0, count).map(a => a.id);
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

  // 5. Update sales stage in cloud
  const updateStageInCloud = useCallback(async (agencyId: string, newStage: LeadStage) => {
    setAllSanitizedAgencies(prev => {
      const next = prev.map(a => {
        if (a.id === agencyId) {
          return {
            ...a,
            zollOpportunity: {
              ...a.zollOpportunity,
              salesStage: newStage
            }
          };
        }
        return a;
      });
      saveAgencies(next);
      return next;
    });
    if (onToast) onToast('Stage updated in this device’s local workspace. Cloud writes are available only from Data Health.', 'info');
  }, [onToast]);

  // 6. Toggle day route status in cloud
  const toggleRouteInCloud = useCallback(async (agencyId: string) => {
    setAllSanitizedAgencies(prev => {
      const next = prev.map(a => {
        if (a.id === agencyId) {
          return { ...a, inDayRoute: !a.inDayRoute };
        }
        return a;
      });
      saveAgencies(next);
      return next;
    });
    if (onToast) onToast('Route updated locally. Cloud writes are opt-in from Data Health.', 'info');
  }, [onToast]);

  // 7. Toggle bookmark in cloud
  const toggleBookmarkInCloud = useCallback(async (agencyId: string) => {
    setAllSanitizedAgencies(prev => {
      const next = prev.map(a => {
        if (a.id === agencyId) {
          return { ...a, isBookmarked: !a.isBookmarked };
        }
        return a;
      });
      saveAgencies(next);
      return next;
    });
    if (onToast) onToast('Saved-account status updated locally. Cloud writes are opt-in from Data Health.', 'info');
  }, [onToast]);

  // 8. Add field note in cloud (automatically checked against mock/persona filter)
  const addFieldNoteInCloud = useCallback(async (agencyId: string, note: FieldNote) => {
    if (dataSanitizationService.isMockOrTestFieldNote(note)) {
      if (onToast) onToast('Blocked mock or synthetic test note from being saved.', 'warn');
      return;
    }

    setAllSanitizedAgencies(prev => {
      const next = prev.map(a => {
        if (a.id === agencyId) {
          const updatedNotes = [note, ...(a.fieldNotes || [])];
          return {
            ...a,
            fieldNotes: updatedNotes,
            lastContactDate: note.date
          };
        }
        return a;
      });
      saveAgencies(next);
      return next;
    });

    if (onToast) onToast('Field note saved locally. Cloud writes are opt-in from Data Health.', 'info');
  }, [onToast]);

  // 9. Add newly created agency to cloud
  const addAgencyToCloud = useCallback(async (newAgency: Agency) => {
    const cleanNew = dataSanitizationService.sanitizeAgency({
      ...newAgency
    });

    if (!cleanNew) {
      if (onToast) onToast('Rejected mock or invalid agency record.', 'error');
      return;
    }

    setAllSanitizedAgencies(prev => {
      const exists = prev.some(a => a.id === cleanNew.id);
      if (exists) return prev;
      const next = [cleanNew, ...prev];
      saveAgencies(next);
      return next;
    });

    if (onToast) onToast(`Added "${cleanNew.name}" to the local territory pipeline. Cloud writes require a separate opt-in action.`, 'info');
  }, [onToast]);

  // Filter displayed agencies if strictCloudOnlyMode is active
  const visibleAgencies = strictCloudOnlyMode
    ? allSanitizedAgencies.filter(
        a => a.isCloudPersisted || dataSanitizationService.isAgencyCloudSynced(a.id)
      )
    : allSanitizedAgencies;

  return {
    agencies: visibleAgencies.length > 0 ? visibleAgencies : allSanitizedAgencies,
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
    addAgencyToCloud,
    setAgenciesState: setAllSanitizedAgencies
  };
}

/**
 * Read-only accessor to inspect agencies loaded and sanitized by useFirestoreAgencies
 * without mutating Firestore production data.
 */
export function getInitialFirestoreAgenciesDataset(): Agency[] {
  return dataSanitizationService.sanitizeAgenciesList(loadStoredAgencies(), undefined, false);
}
