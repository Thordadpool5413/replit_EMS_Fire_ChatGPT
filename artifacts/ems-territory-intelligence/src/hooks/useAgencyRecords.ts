import { activeProviderRecords, isLegacyProviderRecord, isLegacyProviderId, canBulkHydrateAgency } from "../utils/providerRecordTrust";
import { createAgencyDirectoryLoader, mergeDirectoryAgency, type DirectoryLoadStatus } from "../services/agencyDirectoryLoader";
import type { FollowUpChange } from "../utils/followUps";
import { withWorkspaceLock } from "../services/workspaceLock";
import { applyAgencyReviews, stripAgencyReviewOverlay } from "../services/agencyReviewOverlay";
import { FACT_REVIEW_STORAGE_KEY, type FactReviewEntry } from "../services/factReviewStore";
import { applyAgencyMutation } from "../services/agencyMutation";
import { commitAgencyMutation } from "../utils/replitAgencyApi";
import { loadStoredOutbox, saveOutbox, createOutboxItem } from "../utils/syncStore";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Agency, LeadStage, FieldNote } from "../types";
import {
  saveAgencyToReplit,
  subscribeToReplitAgencies,
  batchSyncAgenciesToReplit,
  fetchAgencyDirectoryPage,
} from "../utils/replitAgencyApi";
import { saveAgencies, loadStoredAgencies } from "../utils/syncStore";
import { dataSanitizationService } from "../services/dataSanitizationService";
import {
  applyAgencySourceRecordData,
  loadAgencySourceRecordData,
} from "../services/agencySourceRecordStore";

const nationalDirectory = createAgencyDirectoryLoader(fetchAgencyDirectoryPage);

interface UseAgencyRecordsOptions {
  globalState?: string;
  globalCounty?: string;
  onToast?: (message: string, type?: "success" | "info" | "warn" | "error") => void;
}

export interface UseAgencyRecordsResult {
  agencies: Agency[];
  quarantinedProviders: Agency[];
  directoryStatus: {
    stateCode: string;
    status: "loading" | "ready" | "unavailable";
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

/** Replit-backed record synchronization with browser-local recovery and validation overlays. */
export function useAgencyRecords({
  globalState = "all",
  globalCounty = "all",
  onToast,
}: UseAgencyRecordsOptions = {}): UseAgencyRecordsResult {
  const [allSanitizedAgencies, setAllSanitizedAgencies] = useState<Agency[]>(() =>
    dataSanitizationService.sanitizeAgenciesList(loadStoredAgencies(), undefined, false),
  );
  const [strictCloudOnlyMode, setStrictCloudOnlyMode] = useState<boolean>(() =>
    dataSanitizationService.getStrictCloudOnlyMode(),
  );
  const [isCloudConnected, setIsCloudConnected] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [cloudSyncCount, setCloudSyncCount] = useState(0);
  const [nationalDirectoryStatus, setNationalDirectoryStatus] = useState<DirectoryLoadStatus>({
    status: "loading",
    loaded: 0,
  });
  const [stateDirectoryStatus, setDirectoryStatus] = useState<UseAgencyRecordsResult["directoryStatus"]>({
    stateCode: "all",
    status: "ready",
  });

  const toastRef = useRef(onToast);
  toastRef.current = onToast;
  const mergeCloudAgencies = useCallback((rawCloudAgencies: Agency[]) => {
    if (!rawCloudAgencies.length) return;
    const localSourceData = loadAgencySourceRecordData();
    const validCloudAgencies = dataSanitizationService.sanitizeAgenciesList(
      rawCloudAgencies.map((agency) => ({
        ...agency,
        isCloudPersisted: true,
        dataProvenanceTier: "replit_backend_synced" as const,
      })),
      undefined,
      false,
    );
    dataSanitizationService.registerCloudSyncedIds(validCloudAgencies.map((agency) => agency.id));
    setCloudSyncCount(dataSanitizationService.getCloudSyncedIdsCount());
    setAllSanitizedAgencies((currentLocal) => {
      const agencyMap = new Map<string, Agency>();
      for (const agency of currentLocal) {
        const cleanLocal = dataSanitizationService.sanitizeAgency(agency);
        if (cleanLocal) agencyMap.set(cleanLocal.id, cleanLocal);
      }
      for (const agency of validCloudAgencies) {
        const existing = agencyMap.get(agency.id);
        const mergedRecord = dataSanitizationService.sanitizeAgency(mergeDirectoryAgency(existing, agency));
        if (mergedRecord) {
          agencyMap.set(agency.id, applyAgencySourceRecordData(mergedRecord, localSourceData[agency.id]));
        }
      }
      for (const item of loadStoredOutbox().filter((entry) => entry.status === "PENDING" || entry.status === "FAILED")) {
        try {
          agencyMap.set(item.agencyId, applyAgencyMutation(agencyMap.get(item.agencyId), item));
        } catch {
          // Keep unsupported queued actions available for recovery.
        }
      }
      const merged = [...agencyMap.values()];
      try {
        saveAgencies(merged);
      } catch (error) {
        toastRef.current?.(error instanceof Error ? error.message : "The local cache could not be saved.", "error");
      }
      return merged;
    });
  }, []);

  useEffect(() => {
    const unsubscribe = nationalDirectory.subscribe((page, progress) => {
      mergeCloudAgencies(page);
      setNationalDirectoryStatus(progress);
      if (page.length || progress.status === "ready") setIsCloudConnected(true);
      else if (progress.status === "unavailable") setIsCloudConnected(false);
    });
    const retry = () => void nationalDirectory.retry();
    window.addEventListener("online", retry);
    return () => {
      unsubscribe();
      window.removeEventListener("online", retry);
    };
  }, [mergeCloudAgencies]);

  const directoryStatus = globalState.toLowerCase() === "all"
    ? { stateCode: "all", status: nationalDirectoryStatus.status }
    : stateDirectoryStatus;

  useEffect(() => {
    const stateCode = globalState.trim().toUpperCase() || "ALL";
    if (stateCode === "ALL") return;
    setDirectoryStatus({ stateCode, status: "loading" });
    let unsubscribe: (() => void) | undefined;
    try {
      unsubscribe = subscribeToReplitAgencies(
        (agencies) => {
          setDirectoryStatus({ stateCode, status: "ready" });
          setIsCloudConnected(true);
          mergeCloudAgencies(agencies);
        },
        stateCode,
        () => {
          setIsCloudConnected(false);
          setDirectoryStatus({ stateCode, status: "unavailable" });
        },
      );
    } catch (error) {
      console.warn("Replit agency refresh could not start:", error);
      setDirectoryStatus({ stateCode, status: "unavailable" });
    }
    return () => unsubscribe?.();
  }, [globalState, mergeCloudAgencies]);

  const toggleStrictCloudOnlyMode = useCallback((enabled: boolean) => {
    dataSanitizationService.setStrictCloudOnlyMode(enabled);
    setStrictCloudOnlyMode(enabled);
    onToast?.(
      enabled
        ? "Replit-only mode enabled: showing backend-persisted records."
        : "Hybrid mode enabled: showing sanitized backend and verified public registry records.",
      "info",
    );
  }, [onToast]);

  const hydrateBatchToCloud = useCallback(async (maxRecords = 25): Promise<number> => {
    const unsynced = allSanitizedAgencies.filter(
      (agency) => canBulkHydrateAgency(agency) && !agency.isCloudPersisted &&
        !dataSanitizationService.isAgencyCloudSynced(agency.id),
    );
    const targetBatch = unsynced.slice(0, Math.min(25, Math.max(0, maxRecords)));
    if (!targetBatch.length) {
      onToast?.("No eligible unsynced source-native accounts in this workspace.", "info");
      return 0;
    }
    setIsSyncing(true);
    try {
      const nowIso = new Date().toISOString();
      const stampedBatch = targetBatch.map((agency) => ({
        ...agency,
        _syncedAt: nowIso,
        isCloudPersisted: true,
        dataProvenanceTier: "replit_backend_synced" as const,
      }));
      const ids = await batchSyncAgenciesToReplit(stampedBatch, maxRecords);
      dataSanitizationService.registerCloudSyncedIds(ids);
      setCloudSyncCount(dataSanitizationService.getCloudSyncedIdsCount());
      dataSanitizationService.recordAuditEvent(
        "CLOUD_HYDRATE",
        `Saved ${ids.length} source-native registry accounts to Replit storage (${dataSanitizationService.getCloudSyncedIdsCount()} total).`,
        stampedBatch.length,
        0,
        dataSanitizationService.getCloudSyncedIdsCount(),
      );
      setAllSanitizedAgencies((previous) => {
        const idSet = new Set(ids);
        const updated = previous.map((agency) => idSet.has(agency.id)
          ? { ...agency, _syncedAt: nowIso, isCloudPersisted: true, dataProvenanceTier: "replit_backend_synced" as const }
          : agency);
        saveAgencies(updated);
        return updated;
      });
      onToast?.(`Saved ${ids.length} agency records to Replit storage.`, "success");
      return ids.length;
    } catch (error) {
      console.error("Replit batch hydration failed:", error);
      onToast?.("Replit synchronization could not be confirmed. Local records remain available for recovery.", "warn");
      return 0;
    } finally {
      setIsSyncing(false);
    }
  }, [allSanitizedAgencies, onToast]);

  const updateAgencyInCloud = useCallback(async (agency: Agency) => {
    if (isLegacyProviderRecord(agency)) {
      throw new Error("This modeled account is quarantined; reconcile it against a public registry before editing.");
    }
    const cleanAgency = dataSanitizationService.sanitizeAgency({
      ...agency,
      _updatedAt: new Date().toISOString(),
      isCloudPersisted: true,
      dataProvenanceTier: "replit_backend_synced",
    });
    if (!cleanAgency) return;
    setIsSyncing(true);
    try {
      const saved = await saveAgencyToReplit(cleanAgency);
      dataSanitizationService.registerCloudSyncedIds([cleanAgency.id]);
      setCloudSyncCount(dataSanitizationService.getCloudSyncedIdsCount());
      setAllSanitizedAgencies((previous) => {
        const next = previous.map((entry) => entry.id === cleanAgency.id ? saved : entry);
        saveAgencies(next);
        return next;
      });
    } catch {
      onToast?.("Replit save failed. The local record remains available for recovery.", "error");
    } finally {
      setIsSyncing(false);
    }
  }, [onToast]);

  const recordsRef = useRef(allSanitizedAgencies);
  recordsRef.current = allSanitizedAgencies;
  const syncingRef = useRef(false);
  const syncPendingChanges = useCallback(async () => {
    if (syncingRef.current || (typeof navigator !== "undefined" && !navigator.onLine)) return;
    syncingRef.current = true;
    setIsSyncing(true);
    try {
      const pending = loadStoredOutbox().filter((item) => item.status === "PENDING" || item.status === "FAILED");
      const blocked = new Set<string>();
      for (const item of pending) {
        if (blocked.has(item.agencyId)) continue;
        if (isLegacyProviderId(item.agencyId) ||
            recordsRef.current.some((agency) => agency.id === item.agencyId && isLegacyProviderRecord(agency)) ||
            (item.payload?.base && isLegacyProviderRecord(item.payload.base)) ||
            (item.payload?.agency && isLegacyProviderRecord(item.payload.agency))) {
          const error = "Legacy modeled account quarantined. Export and reconcile the work against an actual provider.";
          if (item.status !== "FAILED" || item.error !== error) {
            await withWorkspaceLock(() => saveOutbox(loadStoredOutbox().map((entry) =>
              entry.id === item.id ? { ...entry, status: "FAILED", error } : entry)));
          }
          blocked.add(item.agencyId);
          continue;
        }
        try {
          const syncedRevision = await commitAgencyMutation(item);
          await withWorkspaceLock(() => saveOutbox(loadStoredOutbox().map((entry) =>
            entry.id === item.id ? { ...entry, status: "SYNCED", error: undefined, syncedRevision } : entry)));
          setIsCloudConnected(true);
        } catch (error) {
          blocked.add(item.agencyId);
          const message = error instanceof Error ? error.message : "Replit save failed. Retry when connected.";
          await withWorkspaceLock(() => saveOutbox(loadStoredOutbox().map((entry) =>
            entry.id === item.id ? { ...entry, status: "FAILED", error: message } : entry)));
          onToast?.(`Saved on this device. Replit sync needs attention: ${message}`, "warn");
        }
      }
    } catch (error) {
      onToast?.(`Sync status could not be saved. The journal is retained: ${String(error)}`, "error");
    } finally {
      syncingRef.current = false;
      setIsSyncing(false);
    }
  }, [onToast]);

  useEffect(() => {
    const retry = () => void syncPendingChanges();
    retry();
    window.addEventListener("online", retry);
    const timer = window.setInterval(retry, 60_000);
    return () => {
      window.removeEventListener("online", retry);
      window.clearInterval(timer);
    };
  }, [syncPendingChanges]);

  const recordChange = useCallback(async (
    agencyId: string,
    action: import("../types").SyncOutboxItem["actionType"],
    payload: any,
  ) => {
    const current = recordsRef.current.find((agency) => agency.id === agencyId);
    if (isLegacyProviderId(agencyId) || (current && isLegacyProviderRecord(current)) ||
        (payload.agency && isLegacyProviderRecord(payload.agency))) {
      throw new Error("This legacy account requires identity reconciliation; no provider change was saved.");
    }
    const item = createOutboxItem(agencyId, current?.name ?? payload.agency?.name ?? agencyId, action, {
      ...payload,
      base: current,
    });
    applyAgencyMutation(current, item);
    await withWorkspaceLock(() => saveOutbox([...loadStoredOutbox(), item]));
    const updated = applyAgencyMutation(recordsRef.current.find((agency) => agency.id === agencyId), item);
    const next = current
      ? recordsRef.current.map((agency) => agency.id === agencyId ? updated : agency)
      : [updated, ...recordsRef.current];
    recordsRef.current = next;
    setAllSanitizedAgencies(next);
    onToast?.("Saved on this device. Waiting for Replit acknowledgment.", "info");
    void syncPendingChanges();
  }, [onToast, syncPendingChanges]);

  const updateStageInCloud = useCallback(async (id: string, stage: LeadStage) => {
    const current = recordsRef.current.find((agency) => agency.id === id);
    await recordChange(id, "AGENCY_PATCH", {
      changes: { "zollOpportunity.salesStage": stage },
      expected: { "zollOpportunity.salesStage": current?.zollOpportunity.salesStage },
    });
  }, [recordChange]);
  const toggleRouteInCloud = useCallback(async (id: string) => {
    const current = recordsRef.current.find((agency) => agency.id === id);
    await recordChange(id, "AGENCY_PATCH", {
      changes: { inDayRoute: !current?.inDayRoute },
      expected: { inDayRoute: Boolean(current?.inDayRoute) },
    });
  }, [recordChange]);
  const toggleBookmarkInCloud = useCallback(async (id: string) => {
    const current = recordsRef.current.find((agency) => agency.id === id);
    await recordChange(id, "AGENCY_PATCH", {
      changes: { isBookmarked: !current?.isBookmarked },
      expected: { isBookmarked: Boolean(current?.isBookmarked) },
    });
  }, [recordChange]);
  const addFieldNoteInCloud = useCallback(async (id: string, note: FieldNote) => {
    if (dataSanitizationService.isMockOrTestFieldNote(note)) {
      throw new Error("This note matches test data. Change its content before saving.");
    }
    await recordChange(id, "ADD_FIELD_NOTE", { note });
  }, [recordChange]);
  const createFollowUp = useCallback(async (id: string, task: FieldNote) => {
    await recordChange(id, "CREATE_FOLLOW_UP", { task });
  }, [recordChange]);
  const updateFollowUp = useCallback(async (id: string, note: FieldNote, changes: FollowUpChange) => {
    await recordChange(id, "UPDATE_FOLLOW_UP", {
      noteId: note.id,
      taskOnly: Boolean(note.taskOnly),
      changes,
      expected: {
        nextAction: note.nextAction,
        owner: note.owner ?? "",
        priority: note.priority ?? "normal",
        dueDate: note.dueDate,
        followUpStatus: note.followUpStatus ?? "open",
      },
    });
  }, [recordChange]);
  const addAgencyToCloud = useCallback(async (agency: Agency) => {
    if (isLegacyProviderRecord(agency)) {
      throw new Error("Synthetic or illustrative accounts cannot be created. Select an actual public registry listing.");
    }
    const clean = dataSanitizationService.sanitizeAgency(agency);
    if (!clean) throw new Error("Agency identity is invalid. Your changes have not been saved.");
    await recordChange(agency.id, "CREATE_AGENCY", { agency: clean });
  }, [recordChange]);

  useEffect(() => {
    const enqueueReview = (event: Event) => {
      const entry = (event as CustomEvent<FactReviewEntry>).detail;
      if (!entry) return;
      void recordChange(entry.agencyId, "FACT_REVIEW", { review: entry })
        .catch((error) => onToast?.(`Review saved locally; Replit queue failed: ${String(error)}`, "error"));
    };
    window.addEventListener("ems-reviews-changed", enqueueReview);
    return () => window.removeEventListener("ems-reviews-changed", enqueueReview);
  }, [recordChange, onToast]);

  useEffect(() => {
    const resolveConflict = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      void withWorkspaceLock(() => {
        saveOutbox(loadStoredOutbox().map((item) =>
          item.id === id && item.status === "FAILED" && item.error?.includes("Another device changed")
            ? { ...item, status: "PENDING", error: undefined, payload: { ...item.payload, expected: {} } }
            : item));
      }).then(() => syncPendingChanges()).catch((error) => onToast?.(String(error), "error"));
    };
    window.addEventListener("ems-resolve-conflict", resolveConflict);
    return () => window.removeEventListener("ems-resolve-conflict", resolveConflict);
  }, [syncPendingChanges, onToast]);

  const [reviewVersion, setReviewVersion] = useState(0);
  useEffect(() => {
    const refresh = () => setReviewVersion((version) => version + 1);
    const refreshStorage = (event: StorageEvent) => {
      refresh();
      if (event.key === "zoll_pulseiq_outbox_v1") {
        try {
          setAllSanitizedAgencies(dataSanitizationService.sanitizeAgenciesList(loadStoredAgencies(), undefined, false));
        } catch (error) {
          onToast?.(String(error), "error");
        }
      }
    };
    window.addEventListener("ems-reviews-changed", refresh);
    window.addEventListener("storage", refreshStorage);
    return () => {
      window.removeEventListener("ems-reviews-changed", refresh);
      window.removeEventListener("storage", refreshStorage);
    };
  }, [onToast]);

  const effectiveAgencies = useMemo(() => {
    try {
      const entries: FactReviewEntry[] = JSON.parse(localStorage.getItem(FACT_REVIEW_STORAGE_KEY) ?? "[]");
      const byAgency = new Map<string, FactReviewEntry[]>();
      for (const entry of entries) byAgency.set(entry.agencyId, [...(byAgency.get(entry.agencyId) ?? []), entry]);
      return activeProviderRecords(allSanitizedAgencies).map((agency) => {
        const reviews = [...new Map(
          [...(agency._factReviews ?? []), ...(byAgency.get(agency.id) ?? [])].map((entry) => [entry.id, entry]),
        ).values()].sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt));
        return reviews.length ? applyAgencyReviews(agency, reviews) : agency;
      });
    } catch {
      return activeProviderRecords(allSanitizedAgencies);
    }
  }, [allSanitizedAgencies, reviewVersion]);

  const setRawAgenciesState = useCallback<React.Dispatch<React.SetStateAction<Agency[]>>>((next) => {
    setAllSanitizedAgencies((previous) => {
      const updated = (typeof next === "function" ? next(activeProviderRecords(previous)) : next)
        .map(stripAgencyReviewOverlay);
      const byId = new Map(updated.map((agency) => [agency.id, agency]));
      for (const agency of previous.filter(isLegacyProviderRecord)) {
        if (!byId.has(agency.id)) byId.set(agency.id, agency);
      }
      return [...byId.values()];
    });
  }, []);

  const visibleAgencies = strictCloudOnlyMode
    ? effectiveAgencies.filter((agency) =>
      agency.isCloudPersisted || dataSanitizationService.isAgencyCloudSynced(agency.id))
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
    setAgenciesState: setRawAgenciesState,
  };
}

export function getInitialAgencyRecordsDataset(): Agency[] {
  return activeProviderRecords(dataSanitizationService.sanitizeAgenciesList(loadStoredAgencies(), undefined, false));
}
