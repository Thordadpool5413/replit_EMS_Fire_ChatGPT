import {WorkspaceIcon} from './components/design/WorkspaceIcon';
import {PwaControls, PwaStatusBanner} from './pwa/PwaControls';
import { recordImportRun } from './services/importRunStore';
import { FollowUpWorkspace } from './components/FollowUpWorkspace';
import { WorkspaceHub } from './components/WorkspaceHub';
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Agency, 
  LeadStage, 
  FieldNote, 
  SyncOutboxItem, 
  PredictiveWeights,
  AgencySourceRecordAssociation
} from './types';
import type {
  AgencySourceRecordData,
  AgencySourceRecordRestoreResult,
} from './services/agencySourceRecordStore';
import { 
  saveAgencies, 
  loadStoredOutbox, 
  saveOutbox, 
  loadStoredWeights, 
  saveStoredWeights, 
  createOutboxItem, 
  calculateScore 
} from './utils/syncStore';
import { calculatePulseIqContributions } from './utils/pulseIqScoring';
import {
  applyAgencySourceRecordDataMap,
  loadAgencySourceRecordData,
  mergeAgencySourceRecordDataMaps,
  parseAgencySourceRecordBackup,
  replaceAgencySourceRecordAssociation,
  saveAgencySourceRecordData,
  saveAgencySourceRecordDataMap,
} from './services/agencySourceRecordStore';
import { TopBar } from './components/TopBar';
import { MobileBottomNav } from './components/MobileBottomNav';
import { WorkspaceLoadingState } from './components/WorkspaceLoadingState';
import { ErrorBoundary } from './components/ErrorBoundary';
import { HomeMapFailureFallback } from './components/HomeMapFallbacks';
import { useFirestoreAgencies } from './hooks/useFirestoreAgencies';
import { ALL_50_STATES_SUMMARIES } from './data/nationalGeographicData';
import { TerritoryContextBreadcrumb } from './components/TerritoryContextBreadcrumb';
import {
  parseTerritoryUrl,
  withTerritoryUrl,
  type ProviderScope,
  type TerritoryUrlValidators,
} from './navigation/territoryUrl';
import { territoryEngine } from './services/territoryIntelligenceEngine';
import { type ThemeMode } from './types/theme';
import {
  shouldShowTransientNotice,
  type TransientNoticeType,
} from './utils/transientNoticePolicy';
import {
  primaryWorkspaceFor,
  FIELD_WORKSPACE_TABS,
  isFieldWorkTab,
  isOpportunitiesTab,
  isSpecialistTab,
  isSystemTab,
  isTerritoryTab,
  isTerritoryViewSelected,
  OPPORTUNITIES_WORKSPACE_TABS,
  SPECIALIST_WORKSPACE_TABS,
  SYSTEM_WORKSPACE_TABS,
  TERRITORY_WORKSPACE_TABS
} from './navigation/workspaceNavigation';
import { AlertCircle, Globe, ListOrdered, Scale, Car, X, Siren, Flame, LayoutDashboard, Sliders, ShieldCheck } from 'lucide-react';

const PredictiveLeadQueue = React.lazy(() => import('./components/PredictiveLeadQueue').then((module) => ({ default: module.PredictiveLeadQueue })));
const GisTerritoryHeatmap = React.lazy(() => import('./components/GisTerritoryHeatmap').then((module) => ({ default: module.GisTerritoryHeatmap })));
const PredictiveWeightsModal = React.lazy(() => import('./components/PredictiveWeightsModal').then((module) => ({ default: module.PredictiveWeightsModal })));
const PublicHealthcareExplorer = React.lazy(() => import('./components/PublicHealthcareExplorer').then((module) => ({ default: module.PublicHealthcareExplorer })));
const AfgGrantsTracker = React.lazy(() => import('./components/AfgGrantsTracker').then((module) => ({ default: module.AfgGrantsTracker })));
const FieldModeView = React.lazy(() => import('./components/FieldModeView').then((module) => ({ default: module.FieldModeView })));
const ContractExpirationCalendar = React.lazy(() => import('./components/ContractExpirationCalendar').then((module) => ({ default: module.ContractExpirationCalendar })));
const RfpSpecGeneratorModal = React.lazy(() => import('./components/RfpSpecGeneratorModal').then((module) => ({ default: module.RfpSpecGeneratorModal })));
const CloudBackupResilienceView = React.lazy(() => import('./components/CloudBackupResilienceView').then((module) => ({ default: module.CloudBackupResilienceView })));
const NationwideDataGatewayView = React.lazy(() => import('./components/NationwideDataGatewayView').then((module) => ({ default: module.NationwideDataGatewayView })));
const DataLineageTrustModal = React.lazy(() => import('./components/DataLineageTrustModal').then((module) => ({ default: module.DataLineageTrustModal })));
const CommandPaletteModal = React.lazy(() => import('./components/CommandPaletteModal').then((module) => ({ default: module.CommandPaletteModal })));
const NationalGeographicExplorer = React.lazy(() => import('./components/NationalGeographicExplorer').then((module) => ({ default: module.NationalGeographicExplorer })));
const ThreeApparatusStudio = React.lazy(() => import('./components/ThreeApparatusStudio').then((module) => ({ default: module.ThreeApparatusStudio })));
const GeminiChatbotDrawer = React.lazy(() => import('./components/GeminiChatbotDrawer').then((module) => ({ default: module.GeminiChatbotDrawer })));
const PulseIqRegionalBreakdownChart = React.lazy(() => import('./components/PulseIqRegionalBreakdownChart').then((module) => ({ default: module.PulseIqRegionalBreakdownChart })));
const FocusedProviderProfile = React.lazy(() => import('./components/FocusedProviderProfile').then((module) => ({ default: module.FocusedProviderProfile })));
const AgencyQuickPreviewDrawer = React.lazy(() => import('./components/AgencyQuickPreviewDrawer').then((module) => ({ default: module.AgencyQuickPreviewDrawer })));
const ClinicalCompetitiveKnowledgeHub = React.lazy(() => import('./components/ClinicalCompetitiveKnowledgeHub').then((module) => ({ default: module.ClinicalCompetitiveKnowledgeHub })));
const ZollMobileDashboard = React.lazy(() => import('./components/ZollMobileDashboard').then((module) => ({ default: module.ZollMobileDashboard })));
const HomeHubView = React.lazy(() => import('./components/HomeHubView').then((module) => ({ default: module.HomeHubView })));
const GoogleMapsTerritoryExplorer = React.lazy(() => import('./components/GoogleMapsTerritoryExplorer').then((module) => ({ default: module.GoogleMapsTerritoryExplorer })));
const DataHealthDashboard = React.lazy(() => import('./components/DataHealthDashboard').then((module) => ({ default: module.DataHealthDashboard })));
const MobileProviderSelectorDrawer = React.lazy(() => import('./components/MobileProviderSelectorDrawer').then((module) => ({ default: module.MobileProviderSelectorDrawer })));
const AgencyComparisonPanel = React.lazy(() => import('./components/AgencyComparisonPanel').then((module) => ({ default: module.AgencyComparisonPanel })));

function loadInitialThemeMode(): ThemeMode {
  // Every fresh app session starts in Daylight, regardless of saved or OS preferences.
  return 'daylight';
}

type TerritoryNavigationEntry = {
  workspace: string;
  state: string;
  county: string;
  city: string;
  category: 'all' | 'ems' | 'fire';
  agencyId?: string;
  comparisonOpen: boolean;
  returnToComparison: boolean;
  scrollY?: number;
  index: number;
};

const territoryUrlValidators: TerritoryUrlValidators = {
  isValidStateCode: (stateCode) =>
    Object.prototype.hasOwnProperty.call(ALL_50_STATES_SUMMARIES, stateCode),
  resolveCountyName: (stateCode, countyName) =>
    territoryEngine.getCountyRecord(stateCode, countyName)?.countyName,
};

export default function App() {
  const [initialTerritoryUrl] = useState(() =>
    parseTerritoryUrl(window.location.search, territoryUrlValidators),
  );
  const [toast, setToast] = useState<{ message: string; type: TransientNoticeType } | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, type: TransientNoticeType = 'success'): void => {
    if (!shouldShowTransientNotice(type)) return;
    if (toastTimeoutRef.current !== null) clearTimeout(toastTimeoutRef.current);
    setToast({ message, type });
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
      toastTimeoutRef.current = null;
    }, 3500);
  }, []);

  useEffect(() => () => {
    if (toastTimeoutRef.current !== null) clearTimeout(toastTimeoutRef.current);
  }, []);

  // Global Cascading Geographic & Account Selectors State
  const [globalState, setGlobalState] = useState<string>(initialTerritoryUrl.state);
  const [globalCounty, setGlobalCounty] = useState<string>(initialTerritoryUrl.county);
  const [globalCity, setGlobalCity] = useState<string>('all');
  const [globalCategory, setGlobalCategory] = useState<ProviderScope>(initialTerritoryUrl.category);
  const [activeAccount, setActiveAccount] = useState<Agency | null>(null);

  // Real-time synchronization hook connected to Firebase Firestore cloud backend
  const {
    agencies,
    directoryStatus,
    nationalDirectoryStatus,
    retryNationalDirectory,
    isCloudConnected,
    cloudSyncCount,
    isSyncing: isCloudSyncing,
    strictCloudOnlyMode,
    toggleStrictCloudOnlyMode,
    hydrateBatchToCloud,
    updateStageInCloud,
    toggleRouteInCloud,
    toggleBookmarkInCloud,
    addFieldNoteInCloud,
    updateFollowUp,
    createFollowUp,
    addAgencyToCloud,
    updateAgencyInCloud,
    setAgenciesState,
    syncPendingChanges
  } = useFirestoreAgencies({
    globalState,
    globalCounty,
    onToast: showToast
  });

  const [outbox, setOutbox] = useState<SyncOutboxItem[]>(() => loadStoredOutbox().filter(i => (i.status === 'PENDING' || i.status === 'FAILED')));
  const [weights, setWeights] = useState<PredictiveWeights>(loadStoredWeights);
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  const isSyncing = isCloudSyncing;
  useEffect(() => {
    const refresh = () => setOutbox(loadStoredOutbox().filter(i => (i.status === 'PENDING' || i.status === 'FAILED')));
    window.addEventListener('ems-outbox-changed', refresh);
    window.addEventListener('storage', refresh);
    return () => { window.removeEventListener('ems-outbox-changed', refresh); window.removeEventListener('storage', refresh); };
  }, []);
  const [showWorkflowGuide, setShowWorkflowGuide] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('nicks_quick_start_visible');
      return stored === 'true';
    } catch {
      return false;
    }
  });

  const handleToggleWorkflowGuide = (nextVal?: boolean) => {
    setShowWorkflowGuide((prev) => {
      const target = typeof nextVal === 'boolean' ? nextVal : !prev;
      try {
        localStorage.setItem('nicks_quick_start_visible', String(target));
      } catch {
        // Ignore storage errors
      }
      return target;
    });
  };

  const [themeMode, setThemeMode] = useState<ThemeMode>(loadInitialThemeMode);
  // Miami Vice uses dark appearance variants while keeping its own token scope.
  const usesDarkColorScheme = themeMode !== 'daylight';

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = themeMode;
    root.classList.toggle('dark', usesDarkColorScheme);
    root.style.colorScheme = usesDarkColorScheme ? 'dark' : 'light';
    const themeColor = getComputedStyle(root).getPropertyValue('--pi-nav-bg').trim();
    const themeColorMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (themeColorMeta && themeColor) themeColorMeta.content = themeColor;
    try {
      localStorage.setItem('app_theme_mode', themeMode);
      localStorage.setItem('app_dark_mode', String(usesDarkColorScheme));
    } catch {
      // Ignore storage errors
    }
  }, [themeMode, usesDarkColorScheme]);
  
  // Navigation & Modals - Open with Central Home & Guided Onboarding Hub by default
  const [activeTab, setActiveTab] = useState<string>(
    initialTerritoryUrl.hasTerritorySelection ? 'states_directory' : 'home',
  );
  const [selectedAgency, setSelectedAgency] = useState<Agency | null>(null);
  const [comparisonAgencyIds, setComparisonAgencyIds] = useState<string[]>([]);
  const [isAgencyComparisonOpen, setIsAgencyComparisonOpen] = useState(false);
  const [returnToComparisonAfterProfile, setReturnToComparisonAfterProfile] = useState(false);
  const navigationIndexRef = useRef(0);
  const navigationEntriesRef = useRef(new Map<number, TerritoryNavigationEntry>());
  const agenciesRef = useRef(agencies);
  const pendingProfileAgencyIdRef = useRef<string | null>(null);
  const navigationSnapshotRef = useRef<TerritoryNavigationEntry | null>(null);
  agenciesRef.current = agencies;
  navigationSnapshotRef.current = {
    workspace: activeTab,
    state: globalState,
    county: globalCounty,
    city: globalCity,
    category: globalCategory,
    agencyId: (selectedAgency || activeAccount)?.id,
    comparisonOpen: isAgencyComparisonOpen,
    returnToComparison: returnToComparisonAfterProfile,
    scrollY: window.scrollY,
    index: navigationIndexRef.current,
  };

  const pushNavigationEntry = useCallback((next: Omit<TerritoryNavigationEntry, 'index'>) => {
    let current = navigationSnapshotRef.current;
    if (current &&
      current.workspace === next.workspace &&
      current.state === next.state &&
      current.county === next.county &&
      current.city === next.city &&
      current.category === next.category &&
      current.agencyId === next.agencyId &&
      current.comparisonOpen === next.comparisonOpen &&
      current.returnToComparison === next.returnToComparison) {
      return current;
    }

    if (current) {
      current = { ...current, scrollY: Math.max(0, window.scrollY) };
      try {
        window.history.replaceState(
          { ...(window.history.state || {}), territoryNavigation: current },
          '',
          withTerritoryUrl(window.location.href, current, territoryUrlValidators),
        );
        navigationEntriesRef.current.set(current.index, current);
        navigationSnapshotRef.current = current;
      } catch {
        // The next history entry still works if scroll preservation is unavailable.
      }
    }

    const entry: TerritoryNavigationEntry = {
      ...next,
      scrollY: next.scrollY ?? Math.max(0, window.scrollY),
      index: navigationIndexRef.current + 1,
    };
    try {
      window.history.pushState(
        { ...(window.history.state || {}), territoryNavigation: entry },
        '',
        withTerritoryUrl(window.location.href, entry, territoryUrlValidators),
      );
      navigationIndexRef.current = entry.index;
      navigationEntriesRef.current.set(entry.index, entry);
      navigationSnapshotRef.current = entry;
      return entry;
    } catch {
      // Keep in-app navigation working if the browser blocks history updates.
      return null;
    }
  }, []);

  const replaceCurrentNavigationEntry = useCallback((
    patch: Partial<Omit<TerritoryNavigationEntry, 'index'>>,
  ) => {
    const current = navigationSnapshotRef.current;
    if (!current) return;
    const entry: TerritoryNavigationEntry = { ...current, ...patch, index: current.index };
    try {
      window.history.replaceState(
        { ...(window.history.state || {}), territoryNavigation: entry },
        '',
        withTerritoryUrl(window.location.href, entry, territoryUrlValidators),
      );
      navigationEntriesRef.current.set(entry.index, entry);
      navigationSnapshotRef.current = entry;
    } catch {
      // Filter changes still apply if the browser blocks history updates.
    }
  }, []);

  const restoreNavigationEntry = useCallback((entry: TerritoryNavigationEntry) => {
    const candidateState = entry.state?.trim().toUpperCase() || 'all';
    const stateIsValid = candidateState === 'all' ||
      Object.prototype.hasOwnProperty.call(ALL_50_STATES_SUMMARIES, candidateState);
    const candidateCounty = entry.county?.trim() || 'all';
    const countyRecord = candidateState !== 'all' && candidateCounty.toLowerCase() !== 'all'
      ? territoryEngine.getCountyRecord(candidateState, candidateCounty)
      : null;
    const validCategory = (value: string): value is ProviderScope =>
      value === 'all' || value === 'ems' || value === 'fire';
    const restoredCategory = validCategory(navigationSnapshotRef.current?.category || '')
      ? navigationSnapshotRef.current!.category
      : validCategory(entry.category) ? entry.category : 'all';
    const restoredEntry = {
      ...entry,
      state: stateIsValid && (candidateCounty.toLowerCase() === 'all' || countyRecord)
        ? candidateState
        : 'all',
      county: stateIsValid && (candidateCounty.toLowerCase() === 'all' || countyRecord)
        ? countyRecord?.countyName || 'all'
        : 'all',
      category: restoredCategory,
      scrollY: Math.max(0, Number.isFinite(entry.scrollY) ? entry.scrollY! : 0),
    };
    const agency = restoredEntry.agencyId
      ? agenciesRef.current.find((candidate) => candidate.id === restoredEntry.agencyId) ?? null
      : null;
    pendingProfileAgencyIdRef.current = restoredEntry.agencyId && !agency ? restoredEntry.agencyId : null;
    navigationIndexRef.current = restoredEntry.index;
    navigationEntriesRef.current.set(restoredEntry.index, restoredEntry);
    navigationSnapshotRef.current = restoredEntry;
    try {
      window.history.replaceState(
        { ...(window.history.state || {}), territoryNavigation: restoredEntry },
        '',
        withTerritoryUrl(window.location.href, restoredEntry, territoryUrlValidators),
      );
    } catch {
      // The in-memory navigation still restores when history updates are unavailable.
    }
    setActiveTab(restoredEntry.workspace);
    setGlobalState(restoredEntry.state);
    setGlobalCounty(restoredEntry.county);
    setGlobalCity(restoredEntry.city);
    setGlobalCategory(restoredEntry.category);
    setSelectedAgency(agency);
    setActiveAccount(agency);
    setReturnToComparisonAfterProfile(restoredEntry.returnToComparison);
    setIsAgencyComparisonOpen(restoredEntry.comparisonOpen);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => window.scrollTo({ top: restoredEntry.scrollY, behavior: 'auto' }));
    });
  }, []);

  useEffect(() => {
    const rememberScroll = () => {
      const current = navigationSnapshotRef.current;
      if (current) navigationSnapshotRef.current = { ...current, scrollY: Math.max(0, window.scrollY) };
    };
    window.addEventListener('scroll', rememberScroll, { passive: true });
    return () => window.removeEventListener('scroll', rememberScroll);
  }, []);

  useEffect(() => {
    const pendingId = pendingProfileAgencyIdRef.current;
    if (!pendingId) return;
    const agency = agencies.find((candidate) => candidate.id === pendingId);
    if (!agency) return;
    pendingProfileAgencyIdRef.current = null;
    setSelectedAgency(agency);
    setActiveAccount(agency);
  }, [agencies]);

  useEffect(() => {
    const initialEntry: TerritoryNavigationEntry = {
      ...(navigationSnapshotRef.current as TerritoryNavigationEntry),
      index: 0,
    };
    navigationIndexRef.current = 0;
    navigationEntriesRef.current.set(0, initialEntry);
    try {
      window.history.replaceState(
        { ...(window.history.state || {}), territoryNavigation: initialEntry },
        '',
        withTerritoryUrl(window.location.href, initialEntry, territoryUrlValidators),
      );
    } catch {
      // History may be unavailable in an embedded browser; the app remains usable.
    }

    const handlePopState = (event: PopStateEvent) => {
      const entry = event.state?.territoryNavigation as TerritoryNavigationEntry | undefined;
      if (!entry || typeof entry.workspace !== 'string' || !Number.isInteger(entry.index)) return;
      restoreNavigationEntry(entry);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [restoreNavigationEntry]);

  const [previewAgency, setPreviewAgency] = useState<Agency | null>(null);
  const [rfpAgency, setRfpAgency] = useState<Agency | null>(null);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);
  const [isDataLineageOpen, setIsDataLineageOpen] = useState<boolean>(false);
  const [isChatbotOpen, setIsChatbotOpen] = useState<boolean>(false);
  const [isWeightsModalOpen, setIsWeightsModalOpen] = useState<boolean>(false);
  const [isMobileProviderFinderOpen, setIsMobileProviderFinderOpen] = useState<boolean>(false);
  const [mobileFinderNearbyMode, setMobileFinderNearbyMode] = useState(false);
  const [mobileFinderLocation, setMobileFinderLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [mobileFinderLocationStatus, setMobileFinderLocationStatus] = useState<'idle' | 'locating' | 'ready' | 'error'>('idle');
  const [mobileFinderLocationError, setMobileFinderLocationError] = useState<string | null>(null);
  const mobileFinderLocationRequestIdRef = useRef(0);
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState<boolean>(false);

  const openProviderFinder = useCallback(() => {
    mobileFinderLocationRequestIdRef.current += 1;
    setMobileFinderLocation(null);
    setMobileFinderNearbyMode(false);
    setMobileFinderLocationStatus('idle');
    setMobileFinderLocationError(null);
    setIsMobileProviderFinderOpen(true);
  }, []);

  const openNearbyProviderFinder = useCallback(() => {
    const requestId = ++mobileFinderLocationRequestIdRef.current;
    setMobileFinderNearbyMode(true);
    setMobileFinderLocation(null);
    setMobileFinderLocationError(null);
    setMobileFinderLocationStatus('locating');
    setIsMobileProviderFinderOpen(true);

    if (!navigator.geolocation) {
      setMobileFinderLocationStatus('error');
      setMobileFinderLocationError('Location is not available in this browser. You can still browse by state, county, or ZIP.');
      return;
    }

    // Request location only in response to the user's explicit “near me” action.
    // Coordinates stay in app memory and are used only for local distance sorting.
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (mobileFinderLocationRequestIdRef.current !== requestId) return;
        setMobileFinderLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setMobileFinderLocationStatus('ready');
      },
      (error) => {
        if (mobileFinderLocationRequestIdRef.current !== requestId) return;
        setMobileFinderLocationStatus('error');
        if (error.code === error.PERMISSION_DENIED) {
          setMobileFinderLocationError('Location permission was denied. Allow location in your browser settings, or browse by state, county, or ZIP.');
        } else if (error.code === error.TIMEOUT) {
          setMobileFinderLocationError('The location request timed out. Try again, or browse by state, county, or ZIP.');
        } else {
          setMobileFinderLocationError('Your location could not be determined. Try again, or browse by state, county, or ZIP.');
        }
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 120000 },
    );
  }, []);

  // Listen to Google Maps Platform quota defense events
  useEffect(() => {
    const handleQuota = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handleQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', handleQuota);
  }, []);

  // Listen to browser online/offline events
  useEffect(() => {
    setIsOnline(navigator.onLine);
    const handleOnline = () => {
      setIsOnline(true);
    };
    const handleOffline = () => {
      setIsOnline(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [showToast]);

  // Global keyboard shortcut for Command Palette (⌘K / Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Filter passed from National Geographic Explorer to Lead Queue
  const [queueFilterState, setQueueFilterState] = useState<{
    state?: string;
    county?: string;
    city?: string;
    zip?: string;
  } | null>(null);

  // Sync state modifications to storage
  const updateAgenciesState = useCallback((newAgencies: Agency[]) => {
    saveAgencies(newAgencies);
    setAgenciesState(newAgencies);
    if (selectedAgency) {
      const refreshed = newAgencies.find(a => a.id === selectedAgency.id);
      if (refreshed) setSelectedAgency(refreshed);
    }
    if (activeAccount) {
      const refreshedActive = newAgencies.find(a => a.id === activeAccount.id);
      if (refreshedActive) setActiveAccount(refreshedActive);
    }
  }, [selectedAgency, activeAccount, setAgenciesState]);

  const handleSaveAgencySourceData = useCallback((
    agencyId: string,
    sourceData: AgencySourceRecordData
  ): boolean => {
    const currentAgency = agencies.find((agency) => agency.id === agencyId);
    if (!currentAgency) {
      showToast('Could not find this agency in the current territory records.', 'error');
      return false;
    }

    const saved = saveAgencySourceRecordData(agencyId, sourceData);
    if (!saved.ok) {
      showToast(saved.reason, 'error');
      return false;
    }

    const updatedAgency: Agency = {
      ...currentAgency,
      sourceRecordAssociations: sourceData.sourceRecordAssociations,
      sourceFacts: sourceData.sourceFacts,
    };
    updateAgenciesState(
      agencies.map((agency) =>
        agency.id === agencyId ? updatedAgency : agency,
      ),
    );
    if (previewAgency?.id === agencyId) setPreviewAgency(updatedAgency);
    showToast('Saved to this browser only; it was not shared with other users.', 'boundary');
    return true;
  }, [agencies, updateAgenciesState, previewAgency, showToast]);

  const handleImportAgencySourceRecords = useCallback((
    serializedBackup: string
  ): AgencySourceRecordRestoreResult => {
    const parsed = parseAgencySourceRecordBackup(serializedBackup);
    if (!parsed.ok) {recordImportRun({source:'Source-record backup',status:'failed',accepted:0,duplicates:null,conflicts:null,unmatchedAgencies:null,message:parsed.reason});return parsed;}

    const existing = loadAgencySourceRecordData();
    const merged = mergeAgencySourceRecordDataMaps(existing, parsed.data);
    const saved = saveAgencySourceRecordDataMap(merged.data);
    if (!saved.ok) {recordImportRun({source:'Source-record backup',status:'failed',accepted:0,duplicates:null,conflicts:null,unmatchedAgencies:null,message:saved.reason});return saved;}

    const knownAgencyIds = new Set(agencies.map((agency) => agency.id));
    const unmatchedAgencyCount = Object.keys(parsed.data).filter(
      (agencyId) => !knownAgencyIds.has(agencyId),
    ).length;
    updateAgenciesState(
      applyAgencySourceRecordDataMap(agencies, merged.data),
    );

    if(!recordImportRun({source:'Source-record backup',status:'completed',accepted:merged.associationsAdded+merged.factsAdded,duplicates:merged.duplicatesSkipped,conflicts:merged.conflictsSkipped,unmatchedAgencies:unmatchedAgencyCount,message:'Existing agency fields and conflicting source records were preserved.'})) showToast('Import saved, but its history receipt could not be stored.','warn');
    return {
      ok: true,
      associationsAdded: merged.associationsAdded,
      factsAdded: merged.factsAdded,
      duplicatesSkipped: merged.duplicatesSkipped,
      conflictsSkipped: merged.conflictsSkipped,
      unmatchedAgencyCount,
    };
  }, [agencies, updateAgenciesState]);

  const handleDecideAgencySourceRecord = useCallback((
    agencyId: string,
    association: AgencySourceRecordAssociation
  ) => {
    const currentAgency = agencies.find((agency) => agency.id === agencyId);
    if (!currentAgency) {
      showToast('Could not find this agency in the current territory records.', 'error');
      return;
    }
    const nextAssociations = replaceAgencySourceRecordAssociation(
      currentAgency.sourceRecordAssociations ?? [],
      association,
    );
    handleSaveAgencySourceData(agencyId, {
      sourceRecordAssociations: nextAssociations,
      sourceFacts: currentAgency.sourceFacts ?? [],
    });
  }, [agencies, handleSaveAgencySourceData, showToast]);

  const handleSaveWeights = useCallback((newWeights: PredictiveWeights) => {
    setWeights(newWeights);
    saveStoredWeights(newWeights);
    const recalculated = agencies.map(agency => {
      const score = calculateScore(agency, newWeights);
      const factors = calculatePulseIqContributions(agency, newWeights);
      const priorityTier =
        score >= 88 ? 'Critical Opportunity'
          : score >= 78 ? 'High Opportunity'
            : score >= 65 ? 'Moderate Opportunity'
              : 'Standard Watchlist';

      return {
        ...agency,
        zollOpportunity: {
          ...agency.zollOpportunity,
          pulseIqScore: score,
          priorityTier: priorityTier as Agency['zollOpportunity']['priorityTier'],
          scoreBreakdown: {
            ...agency.zollOpportunity.scoreBreakdown,
            clinicalAcuityPts: factors.clinicalAcuityPts,
            fleetObsolescencePts: factors.fleetObsolescencePts,
            cmsFinancialPts: 0,
            demographicVulnerabilityPts: 0,
            budgetGrantReadinessPts: factors.budgetGrantReadinessPts,
            softwareWhitespacePts: factors.softwareWhitespacePts
          }
        }
      };
    });
    updateAgenciesState(recalculated);
    showToast('PulseIQ scoring weights calibrated. All territory accounts re-ranked.', 'success');
  }, [agencies, updateAgenciesState, showToast]);

  const handleAddAgency = useCallback(async (newAgency: Agency) => {
    try { await addAgencyToCloud(newAgency); } catch (e) { showToast(e instanceof Error ? e.message : 'Agency could not be saved.', 'error'); throw e; }
  }, [addAgencyToCloud]);

  const handleToggleRoute = useCallback(async (agencyId: string) => {
    try { await toggleRouteInCloud(agencyId); } catch (e) { showToast(e instanceof Error ? e.message : 'Save failed. Please retry.', 'error'); return; }
    if (selectedAgency?.id === agencyId) {
      setSelectedAgency(prev => prev ? { ...prev, inDayRoute: !prev.inDayRoute } : null);
    }
    if (activeAccount?.id === agencyId) {
      setActiveAccount(prev => prev ? { ...prev, inDayRoute: !prev.inDayRoute } : null);
    }
    if (previewAgency?.id === agencyId) {
      setPreviewAgency(prev => prev ? { ...prev, inDayRoute: !prev.inDayRoute } : null);
    }
  }, [toggleRouteInCloud, selectedAgency, activeAccount, previewAgency]);

  const handleToggleBookmark = useCallback(async (agencyId: string) => {
    try { await toggleBookmarkInCloud(agencyId); } catch (e) { showToast(e instanceof Error ? e.message : 'Save failed. Please retry.', 'error'); return; }
    if (selectedAgency?.id === agencyId) {
      setSelectedAgency(prev => prev ? { ...prev, isBookmarked: !prev.isBookmarked } : null);
    }
    if (activeAccount?.id === agencyId) {
      setActiveAccount(prev => prev ? { ...prev, isBookmarked: !prev.isBookmarked } : null);
    }
    if (previewAgency?.id === agencyId) {
      setPreviewAgency(prev => prev ? { ...prev, isBookmarked: !prev.isBookmarked } : null);
    }
  }, [toggleBookmarkInCloud, selectedAgency, activeAccount, previewAgency]);

  const handleUpdateStage = useCallback(async (agencyId: string, newStage: LeadStage) => {
    try { await updateStageInCloud(agencyId, newStage); } catch (e) { showToast(e instanceof Error ? e.message : 'Save failed. Please retry.', 'error'); return; }
    if (selectedAgency?.id === agencyId) {
      setSelectedAgency(prev => prev ? {
        ...prev,
        zollOpportunity: {
          ...prev.zollOpportunity,
          salesStage: newStage
        }
      } : null);
    }
    if (activeAccount?.id === agencyId) {
      setActiveAccount(prev => prev ? {
        ...prev,
        zollOpportunity: {
          ...prev.zollOpportunity,
          salesStage: newStage
        }
      } : null);
    }
    if (previewAgency?.id === agencyId) {
      setPreviewAgency(prev => prev ? {
        ...prev,
        zollOpportunity: {
          ...prev.zollOpportunity,
          salesStage: newStage
        }
      } : null);
    }


  }, [updateStageInCloud, selectedAgency, activeAccount, previewAgency, isOnline, agencies, showToast]);

  const handleAddFieldNote = useCallback(async (agencyId: string, noteData: Omit<FieldNote, 'id'>) => {
    const newNote: FieldNote = {
      ...noteData,
      id: `visit-${crypto.randomUUID()}`
    };
    await addFieldNoteInCloud(agencyId, newNote);

    if (selectedAgency?.id === agencyId) {
      setSelectedAgency(prev => prev ? {
        ...prev,
        fieldNotes: [newNote, ...prev.fieldNotes],
        lastContactDate: newNote.date
      } : null);
    }
    if (activeAccount?.id === agencyId) {
      setActiveAccount(prev => prev ? {
        ...prev,
        fieldNotes: [newNote, ...prev.fieldNotes],
        lastContactDate: newNote.date
      } : null);
    }
    if (previewAgency?.id === agencyId) {
      setPreviewAgency(prev => prev ? {
        ...prev,
        fieldNotes: [newNote, ...prev.fieldNotes],
        lastContactDate: newNote.date
      } : null);
    }


  }, [addFieldNoteInCloud, selectedAgency, activeAccount, previewAgency, isOnline, agencies, showToast]);


  const handleOpenAgencyProfile = useCallback((agency: Agency, returnToComparison = false) => {
    const profileAgency = agencies.find((candidate) => candidate.id === agency.id) ?? agency;
    if (navigationSnapshotRef.current?.agencyId !== profileAgency.id) {
      const current = navigationSnapshotRef.current;
      if (current) {
        replaceCurrentNavigationEntry({
          workspace: current.workspace,
          state: current.state,
          county: current.county,
          city: current.city,
          category: current.category,
          agencyId: current.agencyId,
          comparisonOpen: current.comparisonOpen,
          returnToComparison: current.returnToComparison,
          scrollY: window.scrollY,
        });
        pushNavigationEntry({
          workspace: current.workspace,
          state: current.state,
          county: current.county,
          city: current.city,
          category: current.category,
          agencyId: profileAgency.id,
          comparisonOpen: false,
          returnToComparison,
          scrollY: 0,
        });
      }
    }

    setPreviewAgency(null);
    setIsAgencyComparisonOpen(false);
    setReturnToComparisonAfterProfile(returnToComparison);
    setSelectedAgency(profileAgency);
    setActiveAccount(profileAgency);
    setIsCommandPaletteOpen(false);
    setIsMobileProviderFinderOpen(false);
  }, [agencies, pushNavigationEntry, replaceCurrentNavigationEntry]);

  const handleToggleAgencyComparison = useCallback((agency: Agency) => {
    setComparisonAgencyIds((current) => {
      if (current.includes(agency.id)) return current.filter((id) => id !== agency.id);
      if (current.length >= 3) return current;
      return [...current, agency.id];
    });
  }, []);

  const handleRemoveComparedAgency = useCallback((agencyId: string) => {
    if (comparisonAgencyIds.length <= 2) setIsAgencyComparisonOpen(false);
    setComparisonAgencyIds((current) => current.filter((id) => id !== agencyId));
  }, [comparisonAgencyIds.length]);

  const handleCloseAgencyComparison = useCallback(() => {
    setIsAgencyComparisonOpen(false);
  }, []);

  const handleClearAgencyComparison = useCallback(() => {
    setComparisonAgencyIds([]);
    setIsAgencyComparisonOpen(false);
  }, []);

  const handleCheckConnectivity = useCallback(() => {
    const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
    setIsOnline(online);
  }, []);

  const handleManualSync = useCallback(async () => {
    if (!isOnline) { showToast('Saved on this device. Waiting for a connection.', 'warn'); return; }
    await syncPendingChanges();
    const remaining = loadStoredOutbox().filter(i => (i.status === 'PENDING' || i.status === 'FAILED'));
    showToast(remaining.length ? `${remaining.length} changes need attention. They remain saved on this device.` : 'All queued changes acknowledged by the cloud.', remaining.length ? 'warn' : 'success');
  }, [isOnline, showToast, syncPendingChanges]);

  const dayRouteCount = agencies.filter(a => a.inDayRoute).length;
  const bookmarkedCount = agencies.filter(a => a.isBookmarked).length;
  const storedActive = activeAccount || selectedAgency;
  const currentActive = storedActive ? agencies.find(a => a.id === storedActive.id) ?? storedActive : null;
  const selectedProfileCity = globalCity.trim().toLowerCase() === 'all' ? '' : globalCity.trim();
  const selectedProfileCounty = globalCounty.trim().toLowerCase() === 'all' ? '' : globalCounty.trim();
  const profileBackLabel = activeTab === 'home'
    ? 'Back to Map'
    : ['states_directory', 'geo', 'gis', 'map', 'google_maps'].includes(activeTab)
      ? selectedProfileCity
        ? `Back to ${selectedProfileCity}`
        : selectedProfileCounty
          ? `Back to ${selectedProfileCounty}`
          : globalState !== 'all'
            ? `Back to ${ALL_50_STATES_SUMMARIES[globalState]?.state || globalState} counties`
            : 'Back to Territory'
      : isFieldWorkTab(activeTab)
        ? 'Back to Field Work'
        : activeTab === 'queue'
          ? 'Back to Agencies'
          : 'Back to Workspace';
  const comparisonAgencies = comparisonAgencyIds
    .map((id) => agencies.find((agency) => agency.id === id))
    .filter((agency): agency is Agency => Boolean(agency));

  const handleGoHome = useCallback(() => {
    const current = navigationSnapshotRef.current;
    if (current) {
      pushNavigationEntry({
        ...current,
        workspace: 'home',
        agencyId: undefined,
        comparisonOpen: false,
        returnToComparison: false,
        scrollY: 0,
      });
    }
    setSelectedAgency(null);
    setActiveAccount(null);
    setIsAgencyComparisonOpen(false);
    setReturnToComparisonAfterProfile(false);
    setRfpAgency(null);
    setIsCommandPaletteOpen(false);
    setIsDataLineageOpen(false);
    setIsChatbotOpen(false);
    setActiveTab('home');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [pushNavigationEntry]);

  const handleShareTerritory = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      showToast('Territory link copied to clipboard.', 'success');
    } catch {
      showToast('Could not copy the territory link. Copy the address from your browser.', 'error');
    }
  }, [showToast]);

  const handleNavigateTab = useCallback((tab: string) => {
    const current = navigationSnapshotRef.current;
    if (current) {
      pushNavigationEntry({
        ...current,
        workspace: tab,
        agencyId: undefined,
        comparisonOpen: false,
        returnToComparison: false,
        scrollY: 0,
      });
    }
    setSelectedAgency(null);
    setActiveAccount(null);
    setIsAgencyComparisonOpen(false);
    setReturnToComparisonAfterProfile(false);
    setPreviewAgency(null);
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [pushNavigationEntry]);

  const handleSyncGlobalGeography = useCallback((
    state: string,
    county: string,
    city: string,
    category?: 'all' | 'ems' | 'fire',
  ) => {
    const current = navigationSnapshotRef.current;
    if (!current) return;

    const nextState = state || 'all';
    const nextCounty = county || 'all';
    const nextCity = city || 'all';
    const nextCategory = category ?? current.category;
    const geographyChanged =
      current.state !== nextState ||
      current.county !== nextCounty ||
      current.city !== nextCity;

    if (geographyChanged) {
      const previousEntry = navigationEntriesRef.current.get(current.index - 1);
      const isAncestorStep = (
        current.state === nextState &&
        ((current.city !== 'all' && nextCity === 'all' && current.county === nextCounty) ||
          (current.county !== 'all' && nextCounty === 'all' && nextCity === 'all'))
      ) || (
        current.state !== 'all' &&
        nextState === 'all' &&
        nextCounty === 'all' &&
        nextCity === 'all'
      );
      const previousMatchesTarget = previousEntry &&
        previousEntry.workspace === current.workspace &&
        previousEntry.state === nextState &&
        previousEntry.county === nextCounty &&
        previousEntry.city === nextCity &&
        !previousEntry.agencyId;

      if (isAncestorStep && previousMatchesTarget) {
        window.history.back();
        return;
      }

      pushNavigationEntry({
        workspace: current.workspace,
        state: nextState,
        county: nextCounty,
        city: nextCity,
        category: nextCategory,
        agencyId: undefined,
        comparisonOpen: false,
        returnToComparison: false,
      });
    } else if (nextCategory !== current.category) {
      replaceCurrentNavigationEntry({ category: nextCategory });
    }

    setGlobalState(nextState);
    setGlobalCounty(nextCounty);
    setGlobalCity(nextCity);
    setGlobalCategory(nextCategory);
  }, [pushNavigationEntry, replaceCurrentNavigationEntry]);

  const handleSelectGlobalGeography = useCallback((
    state: string,
    county: string,
    city: string,
  ) => {
    const current = navigationSnapshotRef.current;
    if (!current) return;
    handleSyncGlobalGeography(state, county, city, current.category);
  }, [handleSyncGlobalGeography]);

  const handleClearGeography = useCallback(() => {
    handleSyncGlobalGeography('all', 'all', 'all');
  }, [handleSyncGlobalGeography]);

  const handleSetGlobalCategory = useCallback((category: 'all' | 'ems' | 'fire') => {
    replaceCurrentNavigationEntry({ category });
    setGlobalCategory(category);
  }, [replaceCurrentNavigationEntry]);

  const handleNavigateGeography = useCallback((state: string, county = 'all', city = 'all') => {
    const current = navigationSnapshotRef.current;
    if (current) {
      pushNavigationEntry({
        workspace: 'states_directory',
        state: state || 'all',
        county: county || 'all',
        city: city || 'all',
        category: current.category,
        agencyId: undefined,
        comparisonOpen: false,
        returnToComparison: false,
        scrollY: 0,
      });
    }
    setGlobalState(state || 'all');
    setGlobalCounty(county || 'all');
    setGlobalCity(city || 'all');
    setQueueFilterState(null);
    setSelectedAgency(null);
    setActiveAccount(null);
    setPreviewAgency(null);
    setIsAgencyComparisonOpen(false);
    setReturnToComparisonAfterProfile(false);
    setActiveTab('states_directory');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [pushNavigationEntry]);

  const handleProfileBack = useCallback(() => {
    const current = navigationSnapshotRef.current;
    if (current?.agencyId && current.index > 0) {
      window.history.back();
      return;
    }
    setSelectedAgency(null);
    setActiveAccount(null);
    setReturnToComparisonAfterProfile(false);
    setIsAgencyComparisonOpen(current?.returnToComparison ?? false);
  }, []);

  return (
    <div data-workspace={activeTab} className={`pi-app-shell min-h-[100dvh] w-full max-w-full overflow-x-hidden ${themeMode === 'dark' ? 'dark' : ''} flex flex-col font-sans pb-16 md:pb-0 transition-colors duration-150`}>

      
      {/* Google Maps Quota Defense Sticky Banner */}
      {gmpQuotaExceeded && (
        <div
          className="pi-alert-banner pi-status-warning border-x-0 border-t-0 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50"
          role="alert"
          aria-live="assertive"
        >
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {/* Primary navigation sidebar; desktop utilities are integrated into the sidebar. */}
      <TopBar
        activeTab={activeTab}
        setActiveTab={handleNavigateTab}
        onGoHome={handleGoHome}
        globalCategory={globalCategory}
        setGlobalCategory={handleSetGlobalCategory}
        isOnline={isOnline}
        pendingSyncCount={outbox.length}
        isSyncing={isSyncing}
        triggerManualSync={handleManualSync}
        openCommandPalette={() => setIsCommandPaletteOpen(true)}
        openDataLineageModal={() => setIsDataLineageOpen(true)}
        openChatbot={() => setIsChatbotOpen(true)}
        showGuide={showWorkflowGuide}
        onToggleGuide={() => handleToggleWorkflowGuide()}
        themeMode={themeMode}
        onThemeModeChange={setThemeMode}
        globalState={globalState}
        globalCounty={globalCounty}
        globalCity={globalCity}
        onClearGeography={handleClearGeography}
        activeAccountName={currentActive?.name || null}
        dayRouteCount={dayRouteCount}
        onOpenProviderFinder={openProviderFinder}
        onOpenNearbyProviderFinder={openNearbyProviderFinder}
      />

      {/* Main Workspace Body with a synchronized desktop sidebar offset */}
      <div className="pi-workspace-body md:pl-[216px] flex-1 flex flex-col min-w-0">
      <PwaStatusBanner />
      <main data-laptop-density={activeTab === 'home' ? undefined : 'compact'} className="workspace-grid-shell flex-1 w-full max-w-[1640px] mx-auto px-3 sm:px-5 lg:px-6 py-3 sm:py-4 pb-24 md:pb-6 min-w-0">

        {!currentActive && activeTab === 'settings' && <div className="pwa-settings-panel"><PwaControls /></div>}
        {!currentActive && !['home','reports','settings'].includes(activeTab) && ['reports','settings'].includes(primaryWorkspaceFor(activeTab)) && <button className="workspace-text-button" onClick={()=>handleNavigateTab(primaryWorkspaceFor(activeTab))}>← Back to {primaryWorkspaceFor(activeTab)==='settings'?'Settings':'Reports'}</button>}
        {!currentActive && activeTab !== 'home' && (
          <TerritoryContextBreadcrumb
            state={globalState === 'all' ? null : globalState}
            stateLabel={globalState === 'all' ? null : ALL_50_STATES_SUMMARIES[globalState]?.state || globalState}
            county={globalCounty}
            city={globalCity}
            providerScope={globalCategory}
            className="mb-3"
            onSelectUnitedStates={() => handleNavigateGeography('all')}
            onSelectState={(stateCode) => handleNavigateGeography(stateCode)}
            onSelectCounty={(county) => handleNavigateGeography(globalState, county)}
            onSelectCity={(city) => handleNavigateGeography(globalState, globalCounty, city)}
          />
        )}
        
        {/* Secondary workspace tabs are consistent across desktop and mobile. */}
        {!currentActive && isOpportunitiesTab(activeTab) && (
          <nav
            aria-label="Opportunities views"
            className="pi-workspace-tabs mb-4 bg-white dark:bg-[#111C2D] border border-[#DFE6EF] dark:border-[#1E2D42] rounded-xl p-1.5 flex items-center gap-1 overflow-x-auto no-scrollbar shadow-2xs"
          >
            {OPPORTUNITIES_WORKSPACE_TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-current={activeTab === item.id ? 'page' : undefined}
                onClick={() => handleNavigateTab(item.id)}
                className={`min-h-10 whitespace-nowrap shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  activeTab === item.id
                    ? 'bg-[#285EE8] text-white'
                    : 'text-[#53657B] dark:text-slate-300 hover:text-[#14283F] dark:hover:text-white hover:bg-[#F5F7FA] dark:hover:bg-slate-800'
                }`}
              >
                <WorkspaceIcon name={item.id}/>{item.label}
              </button>
            ))}
          </nav>
        )}

        {!currentActive && isTerritoryTab(activeTab) && (
          <nav
            aria-label="Territory views"
            className="pi-workspace-tabs territory-workspace-nav mb-4 bg-white dark:bg-[#111C2D] border border-[#DFE6EF] dark:border-[#1E2D42] rounded-xl p-1.5 flex items-center gap-1 overflow-x-auto no-scrollbar shadow-2xs"
          >
            {TERRITORY_WORKSPACE_TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-current={isTerritoryViewSelected(item.id, activeTab) ? 'page' : undefined}
                onClick={() => handleNavigateTab(item.id)}
                className={`min-h-10 whitespace-nowrap shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  isTerritoryViewSelected(item.id, activeTab)
                    ? 'bg-[#285EE8] text-white'
                    : 'text-[#53657B] dark:text-slate-300 hover:text-[#14283F] dark:hover:text-white hover:bg-[#F5F7FA] dark:hover:bg-slate-800'
                }`}
              >
                <WorkspaceIcon name={item.id}/>{item.label}
              </button>
            ))}
          </nav>
        )}

        {!currentActive && isFieldWorkTab(activeTab) && (
          <nav
            aria-label="Field Work views"
            className="pi-workspace-tabs mb-4 bg-white dark:bg-[#111C2D] border border-[#DFE6EF] dark:border-[#1E2D42] rounded-xl p-1.5 flex items-center gap-1 overflow-x-auto no-scrollbar shadow-2xs"
          >
            {FIELD_WORKSPACE_TABS.map((item) => {
              const detail = item.id === 'field'
                ? [dayRouteCount > 0 ? `${dayRouteCount} in route` : '', bookmarkedCount > 0 ? `${bookmarkedCount} saved` : ''].filter(Boolean).join(' · ')
                : '';
              const active = activeTab === item.id;
              return (
              <button
                key={item.id}
                type="button"
                aria-label={detail ? `${item.label}; ${detail}` : item.label}
                aria-current={active ? 'page' : undefined}
                onClick={() => handleNavigateTab(item.id)}
                className={`min-h-10 whitespace-nowrap shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer inline-flex items-center gap-2 ${
                  active
                    ? 'bg-[#285EE8] text-white'
                    : 'text-[#53657B] dark:text-slate-300 hover:text-[#14283F] dark:hover:text-white hover:bg-[#F5F7FA] dark:hover:bg-slate-800'
                }`}
              >
                <WorkspaceIcon name={item.id}/>{item.label}
                {detail && <span className="text-[10px] font-medium opacity-80">{detail}</span>}
              </button>
              );
            })}
          </nav>
        )}

        {!currentActive && isSpecialistTab(activeTab) && (
          <nav
            aria-label="Specialist tool views"
            className="pi-workspace-tabs mb-4 bg-white dark:bg-[#111C2D] border border-[#DFE6EF] dark:border-[#1E2D42] rounded-xl p-1.5 flex items-center gap-1 overflow-x-auto no-scrollbar shadow-2xs"
          >
            {SPECIALIST_WORKSPACE_TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-current={activeTab === item.id ? 'page' : undefined}
                onClick={() => handleNavigateTab(item.id)}
                className={`min-h-10 whitespace-nowrap shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  activeTab === item.id
                    ? 'bg-[#285EE8] text-white'
                    : 'text-[#53657B] dark:text-slate-300 hover:text-[#14283F] dark:hover:text-white hover:bg-[#F5F7FA] dark:hover:bg-slate-800'
                }`}
              >
                <WorkspaceIcon name={item.id}/>{item.label}
              </button>
            ))}
          </nav>
        )}

        {!currentActive && isSystemTab(activeTab) && (
          <nav
            aria-label="Data and system views"
            className="pi-workspace-tabs mb-4 bg-white dark:bg-[#111C2D] border border-[#DFE6EF] dark:border-[#1E2D42] rounded-xl p-1.5 flex items-center gap-1 overflow-x-auto no-scrollbar shadow-2xs"
          >
            {SYSTEM_WORKSPACE_TABS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-current={activeTab === item.id ? 'page' : undefined}
                onClick={() => handleNavigateTab(item.id)}
                className={`min-h-10 whitespace-nowrap shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  activeTab === item.id
                    ? 'bg-[#285EE8] text-white'
                    : 'text-[#53657B] dark:text-slate-300 hover:text-[#14283F] dark:hover:text-white hover:bg-[#F5F7FA] dark:hover:bg-slate-800'
                }`}
              >
                <WorkspaceIcon name={item.id}/>{item.label}
              </button>
            ))}
          </nav>
        )}

        {/* Compact Interactive 3-Step Quick Start Strip (Shown on demand) */}
        {showWorkflowGuide && (
          <section
            aria-label="Interactive 3-Step Quick Start Guide"
            className="bg-white dark:bg-[#111C2D] border border-[#DFE6EF] dark:border-[#1E2D42] rounded-xl px-4 py-2.5 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs"
          >
            <div className="flex flex-wrap items-center gap-3 sm:gap-5">
              <span className="font-semibold text-[#285EE8] dark:text-blue-400 text-xs shrink-0">
                Quick start:
              </span>

              <button
                type="button"
                onClick={() => setIsCommandPaletteOpen(true)}
                className="inline-flex items-center gap-2 text-[#14283F] dark:text-slate-200 hover:text-[#285EE8] dark:hover:text-blue-400 font-medium transition-colors cursor-pointer"
              >
                <span className="w-5 h-5 rounded-full bg-[#EEF3FE] dark:bg-blue-950/60 text-[#285EE8] dark:text-blue-400 font-semibold text-xs tabular-nums flex items-center justify-center shrink-0">1</span>
                <span>Search for an agency or NPI (⌘K)</span>
              </button>

              <span className="text-slate-300 dark:text-slate-700 hidden sm:inline" aria-hidden="true">&rarr;</span>

              <button
                type="button"
                onClick={() => handleNavigateTab('queue')}
                className="inline-flex items-center gap-2 text-[#14283F] dark:text-slate-200 hover:text-[#285EE8] dark:hover:text-blue-400 font-medium transition-colors cursor-pointer"
              >
                <span className="w-5 h-5 rounded-full bg-[#EEF3FE] dark:bg-blue-950/60 text-[#285EE8] dark:text-blue-400 font-semibold text-xs tabular-nums flex items-center justify-center shrink-0">2</span>
                <span>Choose an agency to inspect</span>
              </button>

              <span className="text-slate-300 dark:text-slate-700 hidden sm:inline" aria-hidden="true">&rarr;</span>

              <button
                type="button"
                onClick={() => {
                  if (currentActive) {
                    setRfpAgency(currentActive);
                    return;
                  }
                  handleNavigateTab('queue');
                }}
                className="inline-flex items-center gap-2 text-[#14283F] dark:text-slate-200 hover:text-[#285EE8] dark:hover:text-blue-400 font-medium transition-colors cursor-pointer"
              >
                <span className="w-5 h-5 rounded-full bg-[#EEF3FE] dark:bg-blue-950/60 text-[#285EE8] dark:text-blue-400 font-semibold text-xs tabular-nums flex items-center justify-center shrink-0">3</span>
                <span>{currentActive ? 'Generate quote for selected agency' : 'Choose an agency for a quote'}</span>
              </button>
            </div>

            <button
              onClick={() => handleToggleWorkflowGuide(false)}
              className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 p-1 rounded-md transition-colors shrink-0 cursor-pointer"
              title="Dismiss Quick Start Strip"
              aria-label="Dismiss Quick Start Strip"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </section>
        )}

        <React.Suspense fallback={<WorkspaceLoadingState />}>
        <ErrorBoundary key={activeTab} onReset={handleGoHome}>
        {/* Executive Home & Guided Onboarding Hub */}
        {(activeTab === 'reports' || activeTab === 'settings') && <WorkspaceHub kind={activeTab} agencies={agencies} navigate={handleNavigateTab} pending={outbox.length} online={isOnline} />}
        {activeTab === 'home' && (
          <div className="workspace-view-container min-w-0 w-full">
            <ErrorBoundary fallback={<HomeMapFailureFallback onBrowseDirectory={() => handleNavigateTab('states_directory')} />}>
              <HomeHubView
                agencies={agencies}
                directoryLoad={nationalDirectoryStatus}
                onRetryDirectory={retryNationalDirectory}
                onNavigateTab={handleNavigateTab}
                onClearGeography={handleClearGeography}
                globalCategory={globalCategory}
                globalState={globalState}
                globalCounty={globalCounty}
                globalCity={globalCity}
                onSelectState={(st) => {
                  handleNavigateGeography(st, 'all', 'all');
                }}
              />
            </ErrorBoundary>
          </div>
        )}

        {/* TM Mobile Dashboard (Field Cockpit) */}
        {activeTab === 'tm_dashboard' && (
          <div className="workspace-view-container min-w-0 w-full">
            <ZollMobileDashboard
              agencies={agencies}
              weights={weights}
              onSelectAgency={handleOpenAgencyProfile}
              onUpdateStage={handleUpdateStage}
              onNavigateTab={handleNavigateTab}
              isOnline={isOnline}
              toggleNetwork={handleCheckConnectivity}
              outbox={outbox}
            />
          </div>
        )}

        {/* Predictive Lead Queue (Accounts Workspace) */}
        {activeTab === 'queue' && (
          <div className="workspace-view-container min-w-0 w-full">
            <PredictiveLeadQueue
              agencies={agencies}
              directoryStatus={directoryStatus}
              onSelectAgency={handleOpenAgencyProfile}
              onPreviewAgency={(a) => setPreviewAgency(a)}
              onToggleRoute={handleToggleRoute}
              onToggleBookmark={handleToggleBookmark}
              onUpdateStage={handleUpdateStage}
              onOpenRfpGenerator={(a) => setRfpAgency(a)}
              onOpenDataLineage={(a) => {
                handleOpenAgencyProfile(a);
                setIsDataLineageOpen(true);
              }}
              onAddAgency={handleAddAgency}
              initialFilter={queueFilterState}
              onClearInitialFilter={() => setQueueFilterState(null)}
              globalState={globalState}
              globalCounty={globalCounty}
              globalCity={globalCity}
              globalCategory={globalCategory}
              activeAccount={currentActive}
              weights={weights}
              onOpenWeightsModal={() => setIsWeightsModalOpen(true)}
              comparedAgencyIds={comparisonAgencyIds}
              onToggleAgencyComparison={handleToggleAgencyComparison}
            />
          </div>
        )}

        {/* GIS Heatmap & Acuity Telemetry (Territory Workspace) */}
        {(activeTab === 'gis' || activeTab === 'map') && (
          <div className="workspace-view-container min-w-0 w-full">
            <GisTerritoryHeatmap
              agencies={agencies}
              weights={weights}
              onSelectAgency={handleOpenAgencyProfile}
              onToggleRoute={handleToggleRoute}
              onOpenRfpGenerator={(a) => setRfpAgency(a)}
              onOpenDataLineage={(a) => {
                handleOpenAgencyProfile(a);
                setIsDataLineageOpen(true);
              }}
              onFilterByCluster={() => {}}
              globalState={globalState}
              globalCounty={globalCounty}
              globalCity={globalCity}
              globalCategory={globalCategory}
              activeAccount={currentActive}
              onSelectState={(st) => {
                handleSelectGlobalGeography(st, 'all', 'all');
              }}
              onSelectCounty={(c) => {
                handleSelectGlobalGeography(globalState, c, 'all');
              }}
              onSelectCity={(city) => {
                handleSelectGlobalGeography(globalState, globalCounty, city);
              }}
              onSelectCategory={(cat) => {
                handleSetGlobalCategory(cat);
              }}
              onSwitchToGoogleMaps={() => handleNavigateTab('google_maps')}
            />
          </div>
        )}

        {/* Google Maps Live Explorer (Territory Workspace) */}
        {activeTab === 'google_maps' && (
          <div className="workspace-view-container min-w-0 w-full">
            <GoogleMapsTerritoryExplorer
              agencies={agencies}
              onSelectAgency={handleOpenAgencyProfile}
              onToggleRoute={handleToggleRoute}
              onOpenRfpGenerator={(a) => setRfpAgency(a)}
              onOpenDataLineage={(a) => {
                handleOpenAgencyProfile(a);
                setIsDataLineageOpen(true);
              }}
              globalState={globalState}
              globalCounty={globalCounty}
              globalCity={globalCity}
              globalCategory={globalCategory}
              activeAccount={currentActive}
              onSelectState={(st) => {
                handleSelectGlobalGeography(st, 'all', 'all');
              }}
              onSelectCounty={(c) => {
                handleSelectGlobalGeography(globalState, c, 'all');
              }}
              onSelectCity={(city) => {
                handleSelectGlobalGeography(globalState, globalCounty, city);
              }}
              onSelectCategory={(cat) => {
                handleSetGlobalCategory(cat);
              }}
              onSwitchToTacticalGis={() => handleNavigateTab('gis')}
              comparedAgencyIds={comparisonAgencyIds}
              onToggleAgencyComparison={handleToggleAgencyComparison}
            />
          </div>
        )}

        {/* PulseIQ Regional Breakdown (Opportunities Workspace) */}
        {activeTab === 'pulseiq' && (
          <div className="workspace-view-container min-w-0 w-full">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] items-start sm:items-center justify-between gap-4 bg-white dark:bg-[#111C2D] border border-[#DFE6EF] dark:border-[#1E2D42] rounded-xl p-5 sm:p-6 shadow-2xs min-w-0">
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-bold text-[#14283F] dark:text-white tracking-tight">
                  Regional Priority Score Breakdown
                </h1>
                <p className="text-xs text-[#53657B] dark:text-slate-300 mt-1 max-w-2xl leading-relaxed">
                  Compare average department priority scores, fleet age, and Medicare claim recovery potential across {globalCounty !== 'all' ? globalCounty : globalState !== 'all' ? globalState : 'all 50 states'}.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsWeightsModalOpen(true)}
                  className="px-3.5 py-2 rounded-lg text-xs font-semibold text-white bg-[#285EE8] hover:bg-[#194BC8] transition-colors cursor-pointer shadow-2xs whitespace-nowrap shrink-0"
                >
                  Calibrate Scoring Weights
                </button>
                <button
                  type="button"
                  onClick={() => handleNavigateTab('states_directory')}
                  className="px-3.5 py-2 rounded-lg text-xs font-semibold text-[#53657B] dark:text-slate-200 bg-[#F5F7FA] dark:bg-[#16243A] hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors border border-[#DFE6EF] dark:border-[#1E2D42] cursor-pointer whitespace-nowrap shrink-0"
                >
                  &larr; Territory Explorer
                </button>
              </div>
            </div>

            <PulseIqRegionalBreakdownChart
              selectedState={globalState}
              selectedCounty={globalCounty}
              agencies={agencies}
              weights={weights}
              onSelectCounty={(c) => {
                handleSelectGlobalGeography(globalState, c, 'all');
              }}
              onSelectState={(st) => {
                handleSelectGlobalGeography(st, 'all', 'all');
              }}
              onSelectAgency={handleOpenAgencyProfile}
              globalCategory={globalCategory}
              onOpenWeightsModal={() => setIsWeightsModalOpen(true)}
            />
          </div>
        )}

        {/* National Geographic Directory (Territory Workspace) */}
        {(activeTab === 'geo' || activeTab === 'states_directory') && (
          <div className="workspace-view-container min-w-0 w-full">
            <NationalGeographicExplorer
              agencies={agencies}
              directoryStatus={directoryStatus}
              weights={weights}
              initialMode={
                globalCounty !== 'all' || globalCity !== 'all'
                  ? 'cities'
                  : globalState !== 'all'
                    ? 'counties'
                    : 'states'
              }
              onModeChange={(mode) => {
                if (mode === 'states' && activeTab !== 'states_directory') {
                  setActiveTab('states_directory');
                } else if (mode !== 'states' && activeTab === 'states_directory') {
                  setActiveTab('geo');
                }
              }}
              onSelectAgency={handleOpenAgencyProfile}
              onPreviewAgency={(a) => setPreviewAgency(a)}
              onNavigateToQueueWithFilter={(stateCode, county, city, zip) => {
                const nextState = stateCode ?? globalState;
                const nextCounty = county ?? globalCounty;
                const nextCity = city ?? globalCity;
                const current = navigationSnapshotRef.current;
                if (current) {
                  pushNavigationEntry({
                    ...current,
                    workspace: 'queue',
                    state: nextState,
                    county: nextCounty,
                    city: nextCity,
                    agencyId: undefined,
                    comparisonOpen: false,
                    returnToComparison: false,
                    scrollY: 0,
                  });
                }
                setSelectedAgency(null);
                setActiveAccount(null);
                setGlobalState(nextState);
                setGlobalCounty(nextCounty);
                setGlobalCity(nextCity);
                setQueueFilterState({ state: stateCode, county, city, zip });
                setIsAgencyComparisonOpen(false);
                setReturnToComparisonAfterProfile(false);
                setPreviewAgency(null);
                setActiveTab('queue');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              onOpenRfpGenerator={(a) => setRfpAgency(a)}
              onOpenDataLineage={(a) => {
                if (a) handleOpenAgencyProfile(a);
                setIsDataLineageOpen(true);
              }}
              onAddAgency={handleAddAgency}
              globalState={globalState}
              globalCounty={globalCounty}
              globalCity={globalCity}
              globalCategory={globalCategory}
              onShareTerritory={handleShareTerritory}
              activeAccount={currentActive}
              onSyncGlobalGeography={(s, c, city, cat) => {
                handleSyncGlobalGeography(s, c, city, cat);
              }}
              comparedAgencyIds={comparisonAgencyIds}
              onToggleAgencyComparison={handleToggleAgencyComparison}
            />
          </div>
        )}

        {/* Procurement & Contract Expirations (Opportunities Workspace) */}
        {activeTab === 'contracts' && (
          <div className="workspace-view-container min-w-0 w-full">
            <ContractExpirationCalendar
              agencies={agencies}
              onSelectAgency={handleOpenAgencyProfile}
              onOpenRfpGenerator={(a) => setRfpAgency(a)}
              globalState={globalState}
              globalCounty={globalCounty}
              globalCity={globalCity}
              globalCategory={globalCategory}
              activeAccount={currentActive}
            />
          </div>
        )}

        {/* Clinical & Competitive Intelligence Hub (Advanced Workspace) */}
        {activeTab === 'knowledge' && (
          <div className="workspace-view-container operations-workspace min-w-0 w-full">
            <ClinicalCompetitiveKnowledgeHub
              agencies={agencies}
              onSelectAgency={handleOpenAgencyProfile}
              onOpenRfpGenerator={(a) => setRfpAgency(a)}
            />
          </div>
        )}

        {/* Medicare Claims & Public Healthcare Explorer (Advanced Workspace) */}
        {activeTab === 'claims' && (
          <div className="workspace-view-container operations-workspace min-w-0 w-full">
            <PublicHealthcareExplorer
              agencies={agencies}
              onSelectStateFilter={(stateCode) => {
                const current = navigationSnapshotRef.current;
                if (current) {
                  pushNavigationEntry({
                    ...current,
                    workspace: 'queue',
                    state: stateCode,
                    agencyId: undefined,
                    comparisonOpen: false,
                    returnToComparison: false,
                    scrollY: 0,
                  });
                }
                setGlobalState(stateCode);
                setSelectedAgency(null);
                setActiveAccount(null);
                setActiveTab('queue');
              }}
              onNavigateToQueue={() => handleNavigateTab('queue')}
              globalState={globalState}
              globalCounty={globalCounty}
              globalCity={globalCity}
              globalCategory={globalCategory}
              activeAccount={currentActive}
            />
          </div>
        )}

        {/* FEMA AFG & SAFER Grants Tracker (Opportunities Workspace) */}
        {activeTab === 'grants' && (
          <div className="workspace-view-container operations-workspace min-w-0 w-full">
            <AfgGrantsTracker
              agencies={agencies}
              onSelectAgency={handleOpenAgencyProfile}
              globalState={globalState}
              globalCounty={globalCounty}
              globalCity={globalCity}
              globalCategory={globalCategory}
              activeAccount={currentActive}
            />
          </div>
        )}

        {/* Data Health & Synchronization Dashboard (Advanced Workspace) */}
        {activeTab === 'data_health' && (
          <div className="workspace-view-container operations-workspace min-w-0 w-full">
            <DataHealthDashboard
              agencies={agencies}
              isCloudConnected={isCloudConnected}
              cloudSyncCount={cloudSyncCount}
              isSyncing={isCloudSyncing}
              strictCloudOnlyMode={strictCloudOnlyMode}
              onToggleStrictCloudOnlyMode={toggleStrictCloudOnlyMode}
              onHydrateBatchToCloud={hydrateBatchToCloud}
              onSyncSingleAgencyToCloud={(agency: Agency) => updateAgencyInCloud(agency)}
              onSelectAgency={handleOpenAgencyProfile}
            />
          </div>
        )}

        {/* Cloud Backup & Resilience View (Advanced Workspace) */}
        {activeTab === 'resilience' && (
          <div className="workspace-view-container operations-workspace min-w-0 w-full">
            <CloudBackupResilienceView
              agencies={agencies}
              onRestoreAgencies={updateAgenciesState}
              onImportAgencySourceRecords={handleImportAgencySourceRecords}
              showToast={showToast}
            />
          </div>
        )}

        {/* Federal Nationwide Data Gateway View (Advanced Workspace) */}
        {activeTab === 'gateway' && (
          <div className="workspace-view-container operations-workspace min-w-0 w-full">
            <NationwideDataGatewayView
              agencies={agencies}
              onSelectAgency={handleOpenAgencyProfile}
            />
          </div>
        )}

        {/* Field Mode & Day Route Planner (My Work Workspace) */}
        {activeTab === 'field' && (
          <div className="workspace-view-container min-w-0 w-full">
            <FollowUpWorkspace agencies={agencies} onUpdate={updateFollowUp} onCreate={createFollowUp} onOpen={handleOpenAgencyProfile} />
            <FieldModeView
              agencies={agencies}
              onSelectAgency={handleOpenAgencyProfile}
              onAddFieldNote={handleAddFieldNote}
              onUpdateStage={handleUpdateStage}
              isOnline={isOnline}
              toggleNetwork={handleCheckConnectivity}
              outbox={outbox}
              triggerManualSync={handleManualSync}
              isSyncing={isSyncing}
              activeAccount={currentActive}
              globalState={globalState}
              globalCounty={globalCounty}
              globalCity={globalCity}
              globalCategory={globalCategory}
              onNavigateTab={handleNavigateTab}
              comparedAgencyIds={comparisonAgencyIds}
              onToggleAgencyComparison={handleToggleAgencyComparison}
            />
          </div>
        )}

        {/* 3D Apparatus & Cardiac Monitor Studio (Advanced Workspace) */}
        {activeTab === '3d_studio' && (
          <div className="workspace-view-container operations-workspace min-w-0 w-full">
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] items-start sm:items-center justify-between gap-4 bg-white dark:bg-[#111C2D] border border-[#DFE6EF] dark:border-[#1E2D42] rounded-xl p-5 sm:p-6 shadow-2xs min-w-0">
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-bold text-[#14283F] dark:text-white tracking-tight">
                  3D Ambulance, Fire Apparatus &amp; ZOLL Monitor Studio
                </h1>
                <p className="text-xs text-[#53657B] dark:text-slate-300 mt-1 max-w-2xl leading-relaxed">
                  Rotate, zoom, and inspect 3D models of ALS ambulances, fire rescue engines, and the ZOLL X Series Advanced cardiac monitor with interactive clinical subsystem hotspots.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleNavigateTab('field')}
                  className="px-3.5 py-2 rounded-lg text-xs font-semibold text-[#53657B] dark:text-slate-200 bg-[#F5F7FA] dark:bg-[#16243A] hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors border border-[#DFE6EF] dark:border-[#1E2D42] cursor-pointer whitespace-nowrap shrink-0"
                >
                  &larr; Route Planner
                </button>
              </div>
            </div>

            <ThreeApparatusStudio activeAccount={currentActive} />
          </div>
        )}
        </ErrorBoundary>
        </React.Suspense>

      </main>

      {/* Keep Home map-only; sources remain available from Help & Sources. */}
      {activeTab !== 'home' && (
      <footer className="w-full border-t border-[#DFE6EF] dark:border-[#1E2D42] bg-white dark:bg-[#111C2D] text-[#53657B] dark:text-slate-400 text-xs py-3.5 px-4 sm:px-6 lg:px-8 mt-auto transition-colors">
        <div className="max-w-[1640px] mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
            <span className="font-semibold text-[#14283F] dark:text-slate-200">
              Federal Public-Record Sources
            </span>
            <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
            <span>USFA Registry</span>
            <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
            <span>CMS NPPES &amp; Part B PUF</span>
            <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
            <span>OpenFEMA AFG v2</span>
            <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">·</span>
            <span>NEMSIS v3.5.0</span>
          </div>

          <button
            type="button"
            onClick={() => setIsDataLineageOpen(true)}
            className="text-xs font-medium text-[#285EE8] dark:text-blue-400 hover:underline transition-colors cursor-pointer shrink-0"
            title="Inspect Federal Data Lineage & Mathematical Methodology"
          >
            Data Lineage &amp; Methodology &rarr;
          </button>
        </div>
      </footer>
      )}
      </div>

      {/* Slide-Over Quick Preview Drawer (2-second inspection before opening full dossier) */}
      <React.Suspense fallback={null}>
      {previewAgency && <AgencyQuickPreviewDrawer
        agency={previewAgency}
        weights={weights}
        onClose={() => setPreviewAgency(null)}
        onOpenFullDossier={handleOpenAgencyProfile}
        onUpdateStage={handleUpdateStage}
        onToggleRoute={handleToggleRoute}
        onToggleBookmark={handleToggleBookmark}
        onAddFieldNote={handleAddFieldNote}
        onOpenRfpGenerator={(a) => setRfpAgency(a)}
        onSaveAgencySourceData={handleSaveAgencySourceData}
        onDecideAgencySourceRecord={handleDecideAgencySourceRecord}
      />}

      {/* Full Actuarial Department Dossier */}
      {currentActive && (
        <FocusedProviderProfile
          key={currentActive.id}
          onCreateFollowUp={createFollowUp}
          onUpdateFollowUp={updateFollowUp}
          agency={currentActive}
          weights={weights}
          backLabel={profileBackLabel}
          comparedAgencyIds={comparisonAgencyIds}
          onToggleAgencyComparison={handleToggleAgencyComparison}
          onOpenAgencyComparison={() => setIsAgencyComparisonOpen(true)}
          onBack={handleProfileBack}
          onGoHome={handleGoHome}
          onNavigateGeography={(state, county, city) => {
            handleNavigateGeography(state || globalState, county || 'all', city || 'all');
          }}
          onUpdateStage={handleUpdateStage}
          onToggleRoute={handleToggleRoute}
          onToggleBookmark={handleToggleBookmark}
          onAddFieldNote={handleAddFieldNote}
          onOpenRfpGenerator={(a) => setRfpAgency(a)}
          onOpenDataLineage={() => setIsDataLineageOpen(true)}
          onSaveAgencySourceData={handleSaveAgencySourceData}
          onDecideAgencySourceRecord={handleDecideAgencySourceRecord}
        />
      )}

      {/* Pre-Emptive RFP Specification Generator Modal */}
      {rfpAgency && (
        <RfpSpecGeneratorModal
          isOpen={!!rfpAgency}
          onClose={() => setRfpAgency(null)}
          agency={rfpAgency}
        />
      )}

      {/* Mobile Bottom Navigation Bar */}
      <MobileBottomNav
        activeTab={activeTab}
        setActiveTab={handleNavigateTab}
        onGoHome={handleGoHome}
        dayRouteCount={dayRouteCount}
      />

      {/* Data Lineage & Trust Disclosures Center Modal */}
      {isDataLineageOpen && <DataLineageTrustModal
        isOpen={isDataLineageOpen}
        onClose={() => setIsDataLineageOpen(false)}
        agencies={agencies}
        weights={weights}
        selectedAgency={selectedAgency || activeAccount}
        onSelectAgency={handleOpenAgencyProfile}
      />}

      {/* Universal Command Palette Search Modal (⌘K) */}
      {isCommandPaletteOpen && <CommandPaletteModal
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        agencies={agencies}
        onSelectAgency={handleOpenAgencyProfile}
        onNavigateTab={handleNavigateTab}
      />}

      {/* Interactive PulseIQ weight calibration modal */}
      {isWeightsModalOpen && <PredictiveWeightsModal
        isOpen={isWeightsModalOpen}
        onClose={() => setIsWeightsModalOpen(false)}
        weights={weights}
        onSaveWeights={handleSaveWeights}
      />}

      {/* Territory Strategy & RFP Desk */}
      {isChatbotOpen && <GeminiChatbotDrawer
        isOpen={isChatbotOpen}
        onOpen={() => setIsChatbotOpen(true)}
        onClose={() => setIsChatbotOpen(false)}
        activeAgency={currentActive}
        onSelectAgency={handleOpenAgencyProfile}
      />}

      {/* Mobile Provider Quick Finder & Selector Drawer */}
      {isMobileProviderFinderOpen && <MobileProviderSelectorDrawer
        isOpen={isMobileProviderFinderOpen}
        onClose={() => {
          mobileFinderLocationRequestIdRef.current += 1;
          setIsMobileProviderFinderOpen(false);
          setMobileFinderNearbyMode(false);
          setMobileFinderLocation(null);
          setMobileFinderLocationStatus('idle');
          setMobileFinderLocationError(null);
        }}
        agencies={agencies}
        onSelectAgency={handleOpenAgencyProfile}
        onToggleBookmark={handleToggleBookmark}
        onToggleRoute={handleToggleRoute}
        activeCategory={globalCategory}
        onCategoryChange={handleSetGlobalCategory}
        selectedState={globalState}
        onSelectState={(st) => handleSelectGlobalGeography(st, 'all', 'all')}
        selectedCounty={globalCounty}
        onSelectCounty={(co) => handleSelectGlobalGeography(globalState, co, 'all')}
        nearbyMode={mobileFinderNearbyMode}
        nearbyLocation={mobileFinderLocation}
        nearbyStatus={mobileFinderLocationStatus}
        nearbyError={mobileFinderLocationError}
        onRetryNearby={openNearbyProviderFinder}
        onBrowseAll={openProviderFinder}
      />}
      {isAgencyComparisonOpen && (
        <AgencyComparisonPanel
          agencies={comparisonAgencies}
          weights={weights}
          onClose={handleCloseAgencyComparison}
          onRemoveAgency={handleRemoveComparedAgency}
          onOpenProfile={(agency) => handleOpenAgencyProfile(agency, true)}
        />
      )}
      </React.Suspense>

      {/* Toast Notification Pill */}
      {toast && (
        <div className="fixed bottom-20 md:bottom-12 right-4 sm:right-6 z-50">
          <div
            role={toast.type === 'boundary' ? 'status' : 'alert'}
            aria-live={toast.type === 'boundary' ? 'polite' : 'assertive'}
            className={`pi-toast rounded-xl px-4 py-3 shadow-sm flex items-center gap-2.5 text-xs font-semibold ${
              toast.type === 'warn' ? 'pi-status-warning' :
              toast.type === 'error' ? 'pi-status-critical' :
              'pi-status-info'
            }`}
          >
            {toast.type === 'warn' ? (
              <AlertCircle className="pi-status-icon pi-status-icon--warning w-4 h-4 shrink-0" />
            ) : toast.type === 'error' ? (
              <AlertCircle className="pi-status-icon pi-status-icon--critical w-4 h-4 shrink-0" />
            ) : (
              <ShieldCheck className="pi-status-icon pi-status-icon--info w-4 h-4 shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {comparisonAgencies.length > 0 && activeTab !== 'home' && !currentActive && !isAgencyComparisonOpen && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[4.25rem] z-40 px-3 md:bottom-4 md:left-64">
          <div className="pi-compare-dock pointer-events-auto mx-auto flex max-w-4xl items-center gap-2 rounded-xl border p-2.5 backdrop-blur sm:gap-3 sm:px-4">
            <div className="min-w-0 flex-1" aria-live="polite">
              <p className="text-xs font-bold text-slate-900 dark:text-slate-100">Compare agencies <span className="ml-1 font-semibold text-teal-700 dark:text-teal-300">{comparisonAgencies.length}/3</span></p>
              <p className="truncate text-[11px] text-slate-600 dark:text-slate-300" title={comparisonAgencies.map((agency) => agency.name).join(' · ')}>
                {comparisonAgencies.length < 2
                  ? 'Select one more agency to compare'
                  : comparisonAgencies.map((agency) => agency.name).join(' · ')}
              </p>
            </div>
            <button
              type="button"
              disabled={comparisonAgencies.length < 2}
              onClick={() => setIsAgencyComparisonOpen(true)}
              aria-label={`Compare ${comparisonAgencies.length} selected agencies`}
              className="min-h-9 shrink-0 rounded-lg bg-teal-700 px-3 text-xs font-bold text-white transition-colors hover:bg-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
              data-testid="button-open-agency-comparison"
            >
              Compare
            </button>
            <button
              type="button"
              onClick={handleClearAgencyComparison}
              className="min-h-9 shrink-0 rounded-lg border border-slate-200 px-2.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-500 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              data-testid="button-clear-agency-comparison"
            >
              Clear
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
