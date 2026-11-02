/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Agency, 
  LeadStage, 
  FieldNote, 
  SyncOutboxItem, 
  PushAlert, 
  PredictiveWeights,
  AgencySourceRecordAssociation
} from './types';
import type { AgencySourceRecordData } from './services/agencySourceRecordStore';
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
  replaceAgencySourceRecordAssociation,
  saveAgencySourceRecordData,
} from './services/agencySourceRecordStore';
import { 
  loadStoredNotifications, 
  saveStoredNotifications, 
  triggerSystemNotification, 
  ALERT_TEMPLATES 
} from './utils/notificationService';
import { TopBar } from './components/TopBar';
import { MobileBottomNav } from './components/MobileBottomNav';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useFirestoreAgencies } from './hooks/useFirestoreAgencies';
import {
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
import { CheckCircle2, AlertCircle, Globe, ListOrdered, Scale, Car, X, Siren, Flame, LayoutDashboard, Sliders, ShieldCheck } from 'lucide-react';

const PredictiveLeadQueue = React.lazy(() => import('./components/PredictiveLeadQueue').then((module) => ({ default: module.PredictiveLeadQueue })));
const GisTerritoryHeatmap = React.lazy(() => import('./components/GisTerritoryHeatmap').then((module) => ({ default: module.GisTerritoryHeatmap })));
const PredictiveWeightsModal = React.lazy(() => import('./components/PredictiveWeightsModal').then((module) => ({ default: module.PredictiveWeightsModal })));
const PublicHealthcareExplorer = React.lazy(() => import('./components/PublicHealthcareExplorer').then((module) => ({ default: module.PublicHealthcareExplorer })));
const AfgGrantsTracker = React.lazy(() => import('./components/AfgGrantsTracker').then((module) => ({ default: module.AfgGrantsTracker })));
const FieldModeView = React.lazy(() => import('./components/FieldModeView').then((module) => ({ default: module.FieldModeView })));
const NotificationDrawer = React.lazy(() => import('./components/NotificationDrawer').then((module) => ({ default: module.NotificationDrawer })));
const QuickVisitModal = React.lazy(() => import('./components/QuickVisitModal').then((module) => ({ default: module.QuickVisitModal })));
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

export default function App() {
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'warn' | 'error' } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'info' | 'warn' | 'error' = 'success'): void => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // Global Cascading Geographic & Account Selectors State
  const [globalState, setGlobalState] = useState<string>('all');
  const [globalCounty, setGlobalCounty] = useState<string>('all');
  const [globalCity, setGlobalCity] = useState<string>('all');
  const [globalCategory, setGlobalCategory] = useState<'all' | 'ems' | 'fire'>('all');
  const [activeAccount, setActiveAccount] = useState<Agency | null>(null);

  // Real-time synchronization hook connected to Firebase Firestore cloud backend
  const {
    agencies,
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
    addAgencyToCloud,
    updateAgencyInCloud,
    setAgenciesState
  } = useFirestoreAgencies({
    globalState,
    globalCounty,
    onToast: showToast
  });

  const [outbox, setOutbox] = useState<SyncOutboxItem[]>(loadStoredOutbox);
  const [alerts, setAlerts] = useState<PushAlert[]>(loadStoredNotifications);
  const [weights, setWeights] = useState<PredictiveWeights>(loadStoredWeights);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const isSyncing = false;
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

  // Dark Mode State with LocalStorage Persistence
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('app_dark_mode');
      if (saved !== null) return saved === 'true';
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      document.documentElement.style.colorScheme = 'dark';
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.style.colorScheme = 'light';
    }
    try {
      localStorage.setItem('app_dark_mode', String(isDarkMode));
    } catch {
      // Ignore storage errors
    }
  }, [isDarkMode]);

  const toggleDarkMode = useCallback(() => {
    setIsDarkMode(prev => !prev);
  }, []);
  
  // Navigation & Modals - Open with Central Home & Guided Onboarding Hub by default
  const [activeTab, setActiveTab] = useState<string>('home');
  const [selectedAgency, setSelectedAgency] = useState<Agency | null>(null);
  const [comparisonAgencyIds, setComparisonAgencyIds] = useState<string[]>([]);
  const [isAgencyComparisonOpen, setIsAgencyComparisonOpen] = useState(false);
  const [previewAgency, setPreviewAgency] = useState<Agency | null>(null);
  const [rfpAgency, setRfpAgency] = useState<Agency | null>(null);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState<boolean>(false);
  const [isQuickVisitOpen, setIsQuickVisitOpen] = useState<boolean>(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState<boolean>(false);
  const [isDataLineageOpen, setIsDataLineageOpen] = useState<boolean>(false);
  const [isChatbotOpen, setIsChatbotOpen] = useState<boolean>(false);
  const [isWeightsModalOpen, setIsWeightsModalOpen] = useState<boolean>(false);
  const [isMobileProviderFinderOpen, setIsMobileProviderFinderOpen] = useState<boolean>(false);
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState<boolean>(false);

  // Listen to Google Maps Platform quota defense events
  useEffect(() => {
    const handleQuota = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handleQuota);
    return () => window.removeEventListener('gmp-quota-exceeded', handleQuota);
  }, []);

  // Listen to browser online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      showToast('Connection restored. Local field changes remain queued until you choose a cloud write.', 'info');
    };
    const handleOffline = () => {
      setIsOnline(false);
      showToast('Network disconnected. Field offline mode active.', 'warn');
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
    setAgenciesState(newAgencies);
    saveAgencies(newAgencies);
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
    showToast('Saved to this browser only; it was not shared with other users.', 'success');
    return true;
  }, [agencies, updateAgenciesState, previewAgency, showToast]);

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

  const handleAddAgency = useCallback((newAgency: Agency) => {
    addAgencyToCloud(newAgency);
  }, [addAgencyToCloud]);

  const handleToggleRoute = useCallback((agencyId: string) => {
    toggleRouteInCloud(agencyId);
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

  const handleToggleBookmark = useCallback((agencyId: string) => {
    toggleBookmarkInCloud(agencyId);
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

  const handleUpdateStage = useCallback((agencyId: string, newStage: LeadStage) => {
    updateStageInCloud(agencyId, newStage);
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

    if (!isOnline) {
      const targetAgency = agencies.find(a => a.id === agencyId);
      const outboxItem = createOutboxItem(agencyId, targetAgency?.name || 'Unknown Agency', 'UPDATE_STAGE', { stage: newStage });
      setOutbox(prev => {
        const next = [outboxItem, ...prev];
        saveOutbox(next);
        return next;
      });
      showToast(`Offline: Stage change queued for auto-sync.`, 'warn');
    }
  }, [updateStageInCloud, selectedAgency, activeAccount, previewAgency, isOnline, agencies, showToast]);

  const handleAddFieldNote = useCallback((agencyId: string, noteData: Omit<FieldNote, 'id'>) => {
    const newNote: FieldNote = {
      ...noteData,
      id: `fn-${Date.now()}`
    };
    addFieldNoteInCloud(agencyId, newNote);

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

    if (!isOnline) {
      const targetAgency = agencies.find(a => a.id === agencyId);
      const outboxItem = createOutboxItem(agencyId, targetAgency?.name || 'Unknown Agency', 'ADD_FIELD_NOTE', newNote);
      setOutbox(prev => {
        const next = [outboxItem, ...prev];
        saveOutbox(next);
        return next;
      });
      showToast(`Offline: Field log entry saved locally. Will sync when online.`, 'warn');
    }
  }, [addFieldNoteInCloud, selectedAgency, activeAccount, previewAgency, isOnline, agencies, showToast]);


  const handleOpenAgencyProfile = useCallback((agency: Agency) => {
    const profileAgency = agencies.find((candidate) => candidate.id === agency.id) ?? agency;

    setPreviewAgency(null);
    setIsAgencyComparisonOpen(false);
    setSelectedAgency(profileAgency);
    setActiveAccount(profileAgency);
    setIsCommandPaletteOpen(false);
    setIsMobileProviderFinderOpen(false);
    setIsNotificationsOpen(false);
  }, [agencies]);

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

  const handleSelectAlertAgency = useCallback((agencyId: string) => {
    const target = agencies.find((agency) => agency.id === agencyId);
    if (target) handleOpenAgencyProfile(target);
  }, [agencies, handleOpenAgencyProfile]);

  const handleCheckConnectivity = useCallback(() => {
    const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
    setIsOnline(online);
    showToast(online ? 'Network verified: Online with cloud synchronization.' : 'Network offline: Local field cache active.', online ? 'info' : 'warn');
  }, [showToast]);

  const handleManualSync = useCallback(() => {
    if (!isOnline) {
      showToast('The local queue is retained while offline.', 'warn');
      return;
    }
    setOutbox([]);
    saveOutbox([]);
    showToast('Local change queue cleared. No cloud write was performed; use Data Health to opt in to Firestore writes.', 'info');
  }, [isOnline, showToast]);

  const unreadAlertCount = alerts.filter(a => !a.isRead).length;
  const dayRouteCount = agencies.filter(a => a.inDayRoute).length;
  const bookmarkedCount = agencies.filter(a => a.isBookmarked).length;
  const currentActive = activeAccount || selectedAgency;
  const profileBackLabel = activeTab === 'home'
    ? 'Back to Map'
    : ['states_directory', 'geo', 'gis', 'map', 'google_maps'].includes(activeTab)
      ? 'Back to Territory'
      : isFieldWorkTab(activeTab)
        ? 'Back to Field Work'
        : activeTab === 'queue'
          ? 'Back to Accounts'
          : 'Back to Workspace';
  const comparisonAgencies = comparisonAgencyIds
    .map((id) => agencies.find((agency) => agency.id === id))
    .filter((agency): agency is Agency => Boolean(agency));

  const handleGoHome = useCallback(() => {
    setSelectedAgency(null);
    setActiveAccount(null);
    setIsAgencyComparisonOpen(false);
    setRfpAgency(null);
    setIsQuickVisitOpen(false);
    setIsCommandPaletteOpen(false);
    setIsDataLineageOpen(false);
    setIsChatbotOpen(false);
    setIsNotificationsOpen(false);
    setActiveTab('home');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleClearGeography = useCallback(() => {
    setGlobalState('all');
    setGlobalCounty('all');
    setGlobalCity('all');
  }, []);

  const handleNavigateTab = useCallback((tab: string) => {
    setSelectedAgency(null);
    setActiveAccount(null);
    setIsAgencyComparisonOpen(false);
    setPreviewAgency(null);
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  return (
    <div className={`pi-app-shell min-h-screen w-full max-w-full overflow-x-hidden ${isDarkMode ? 'dark bg-[#0B1320] text-slate-100' : 'bg-[#F5F7FA] text-[#14283F]'} flex flex-col font-sans pb-16 md:pb-0 transition-colors duration-150`}>

      
      {/* Google Maps Quota Defense Sticky Banner */}
      {gmpQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {/* Primary Navigation Shell (256px Sidebar + 64px Top Toolbar) */}
      <TopBar
        activeTab={activeTab}
        setActiveTab={handleNavigateTab}
        onGoHome={handleGoHome}
        globalCategory={globalCategory}
        setGlobalCategory={setGlobalCategory}
        isOnline={isOnline}
        toggleNetwork={handleCheckConnectivity}
        pendingSyncCount={outbox.length}
        isSyncing={isSyncing}
        triggerManualSync={handleManualSync}
        unreadAlertCount={unreadAlertCount}
        openNotifications={() => setIsNotificationsOpen(true)}
        openQuickVisitModal={() => setIsQuickVisitOpen(true)}
        openCommandPalette={() => setIsCommandPaletteOpen(true)}
        openDataLineageModal={() => setIsDataLineageOpen(true)}
        openChatbot={() => setIsChatbotOpen(true)}
        isCloudConnected={isCloudConnected}
        cloudSyncCount={cloudSyncCount}
        showGuide={showWorkflowGuide}
        onToggleGuide={() => handleToggleWorkflowGuide()}
        isDarkMode={isDarkMode}
        onToggleDarkMode={toggleDarkMode}
        globalState={globalState}
        globalCounty={globalCounty}
        globalCity={globalCity}
        onClearGeography={handleClearGeography}
        activeAccountName={currentActive?.name || null}
        dayRouteCount={dayRouteCount}
        agencies={agencies}
        onOpenProviderFinder={() => setIsMobileProviderFinderOpen(true)}
      />

      {/* Main Workspace Body with a synchronized desktop sidebar offset */}
      <div className="md:pl-64 flex-1 flex flex-col min-w-0">
      <main className="workspace-grid-shell flex-1 w-full max-w-[1640px] mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6 pb-24 md:pb-8 min-w-0">
        
        {/* Secondary workspace tabs are consistent across desktop and mobile. */}
        {!currentActive && isOpportunitiesTab(activeTab) && (
          <nav
            aria-label="Opportunities views"
            className="mb-4 bg-white dark:bg-[#111C2D] border border-[#DFE6EF] dark:border-[#1E2D42] rounded-xl p-1.5 flex items-center gap-1 overflow-x-auto no-scrollbar shadow-2xs"
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
                {item.label}
              </button>
            ))}
          </nav>
        )}

        {!currentActive && isTerritoryTab(activeTab) && (
          <nav
            aria-label="Territory views"
            className="mb-4 bg-white dark:bg-[#111C2D] border border-[#DFE6EF] dark:border-[#1E2D42] rounded-xl p-1.5 flex items-center gap-1 overflow-x-auto no-scrollbar shadow-2xs"
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
                {item.label}
              </button>
            ))}
          </nav>
        )}

        {!currentActive && isFieldWorkTab(activeTab) && (
          <nav
            aria-label="Field Work views"
            className="mb-4 bg-white dark:bg-[#111C2D] border border-[#DFE6EF] dark:border-[#1E2D42] rounded-xl p-1.5 flex items-center gap-1 overflow-x-auto no-scrollbar shadow-2xs"
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
                {item.label}
                {detail && <span className="text-[10px] font-medium opacity-80">{detail}</span>}
              </button>
              );
            })}
          </nav>
        )}

        {!currentActive && isSpecialistTab(activeTab) && (
          <nav
            aria-label="Specialist tool views"
            className="mb-4 bg-white dark:bg-[#111C2D] border border-[#DFE6EF] dark:border-[#1E2D42] rounded-xl p-1.5 flex items-center gap-1 overflow-x-auto no-scrollbar shadow-2xs"
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
                {item.label}
              </button>
            ))}
          </nav>
        )}

        {!currentActive && isSystemTab(activeTab) && (
          <nav
            aria-label="Data and system views"
            className="mb-4 bg-white dark:bg-[#111C2D] border border-[#DFE6EF] dark:border-[#1E2D42] rounded-xl p-1.5 flex items-center gap-1 overflow-x-auto no-scrollbar shadow-2xs"
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
                {item.label}
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
                  showToast('Choose an agency before generating a quote.', 'info');
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

        <React.Suspense fallback={<div className="workspace-view-container min-h-40 flex items-center justify-center text-sm text-slate-500" role="status">Loading workspace…</div>}>
        <ErrorBoundary onReset={() => setActiveTab('home')}>
        {/* Executive Home & Guided Onboarding Hub */}
        {activeTab === 'home' && (
          <div className="workspace-view-container min-w-0 w-full">
            <HomeHubView
              agencies={agencies}
              onNavigateTab={handleNavigateTab}
              globalCategory={globalCategory}
              globalState={globalState}
              globalCounty={globalCounty}
              globalCity={globalCity}
              onSelectState={(st) => {
                setGlobalState(st);
                setGlobalCounty('all');
                setGlobalCity('all');
                setActiveTab('states_directory');
              }}
            />
          </div>
        )}

        {/* TM Mobile Dashboard (Field Cockpit) */}
        {activeTab === 'tm_dashboard' && (
          <div className="workspace-view-container min-w-0 w-full">
            <ZollMobileDashboard
              agencies={agencies}
              onSelectAgency={handleOpenAgencyProfile}
              onUpdateStage={handleUpdateStage}
              onNavigateTab={(tab) => setActiveTab(tab)}
              isOnline={isOnline}
              toggleNetwork={handleCheckConnectivity}
              outbox={outbox}
              isDarkMode={isDarkMode}
              onToggleDarkMode={toggleDarkMode}
              alerts={alerts}
            />
          </div>
        )}

        {/* Predictive Lead Queue (Accounts Workspace) */}
        {activeTab === 'queue' && (
          <div className="workspace-view-container min-w-0 w-full">
            <PredictiveLeadQueue
              agencies={agencies}
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
                setGlobalState(st);
                setGlobalCounty('all');
                setGlobalCity('all');
              }}
              onSelectCounty={(c) => {
                setGlobalCounty(c);
                setGlobalCity('all');
              }}
              onSelectCity={(city) => {
                setGlobalCity(city);
              }}
              onSelectCategory={(cat) => {
                setGlobalCategory(cat);
              }}
              onSwitchToGoogleMaps={() => setActiveTab('google_maps')}
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
                setGlobalState(st);
                setGlobalCounty('all');
                setGlobalCity('all');
              }}
              onSelectCounty={(c) => {
                setGlobalCounty(c);
                setGlobalCity('all');
              }}
              onSelectCity={(city) => {
                setGlobalCity(city);
              }}
              onSelectCategory={(cat) => {
                setGlobalCategory(cat);
              }}
              onSwitchToTacticalGis={() => setActiveTab('gis')}
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
                  onClick={() => setActiveTab('states_directory')}
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
              onSelectCounty={(c) => {
                setGlobalCounty(c);
                setGlobalCity('all');
              }}
              onSelectState={(st) => {
                setGlobalState(st);
                setGlobalCounty('all');
                setGlobalCity('all');
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
                setSelectedAgency(null);
                setActiveAccount(null);
                setQueueFilterState({ state: stateCode, county, city, zip });
                handleNavigateTab('queue');
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
              activeAccount={currentActive}
              onSyncGlobalGeography={(s, c, city, cat) => {
                if (s !== undefined) setGlobalState(s);
                if (c !== undefined) setGlobalCounty(c);
                if (city !== undefined) setGlobalCity(city);
                if (cat !== undefined) setGlobalCategory(cat);
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
          <div className="workspace-view-container min-w-0 w-full">
            <ClinicalCompetitiveKnowledgeHub
              agencies={agencies}
              onSelectAgency={handleOpenAgencyProfile}
              onOpenRfpGenerator={(a) => setRfpAgency(a)}
            />
          </div>
        )}

        {/* Medicare Claims & Public Healthcare Explorer (Advanced Workspace) */}
        {activeTab === 'claims' && (
          <div className="workspace-view-container min-w-0 w-full">
            <PublicHealthcareExplorer
              agencies={agencies}
              onSelectStateFilter={(stateCode) => {
                setGlobalState(stateCode);
                setActiveTab('queue');
              }}
              onNavigateToQueue={() => setActiveTab('queue')}
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
          <div className="workspace-view-container min-w-0 w-full">
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
          <div className="workspace-view-container min-w-0 w-full">
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
          <div className="workspace-view-container min-w-0 w-full">
            <CloudBackupResilienceView
              agencies={agencies}
              onRestoreAgencies={updateAgenciesState}
              showToast={showToast}
            />
          </div>
        )}

        {/* Federal Nationwide Data Gateway View (Advanced Workspace) */}
        {activeTab === 'gateway' && (
          <div className="workspace-view-container min-w-0 w-full">
            <NationwideDataGatewayView
              agencies={agencies}
              onSelectAgency={handleOpenAgencyProfile}
              showToast={showToast}
            />
          </div>
        )}

        {/* Field Mode & Day Route Planner (My Work Workspace) */}
        {activeTab === 'field' && (
          <div className="workspace-view-container min-w-0 w-full">
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
              onNavigateTab={(tab) => setActiveTab(tab)}
              comparedAgencyIds={comparisonAgencyIds}
              onToggleAgencyComparison={handleToggleAgencyComparison}
            />
          </div>
        )}

        {/* 3D Apparatus & Cardiac Monitor Studio (Advanced Workspace) */}
        {activeTab === '3d_studio' && (
          <div className="workspace-view-container min-w-0 w-full">
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
                  onClick={() => setActiveTab('field')}
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

      {/* Quiet Institutional Provenance Footer */}
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
      </div>

      {/* Slide-Over Quick Preview Drawer (2-second inspection before opening full dossier) */}
      <React.Suspense fallback={null}>
      {previewAgency && <AgencyQuickPreviewDrawer
        agency={previewAgency}
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
          agency={currentActive}
          backLabel={profileBackLabel}
          comparedAgencyIds={comparisonAgencyIds}
          onToggleAgencyComparison={handleToggleAgencyComparison}
          onOpenAgencyComparison={() => setIsAgencyComparisonOpen(true)}
          onBack={() => {
            setSelectedAgency(null);
            setActiveAccount(null);
          }}
          onGoHome={handleGoHome}
          onNavigateGeography={(state, county, city) => {
            setSelectedAgency(null);
            setActiveAccount(null);
            if (state) setGlobalState(state);
            if (county) setGlobalCounty(county);
            if (city) setGlobalCity(city);
            setActiveTab('states_directory');
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

      {/* Push Notifications Drawer */}
      {isNotificationsOpen && <NotificationDrawer
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        alerts={alerts}
        onMarkAllRead={() => {
          const updated = alerts.map(a => ({ ...a, isRead: true }));
          setAlerts(updated);
          saveStoredNotifications(updated);
        }}
        onClearAlerts={() => {
          setAlerts([]);
          saveStoredNotifications([]);
        }}
        onSelectAlertAgency={handleSelectAlertAgency}
      />}

      {/* Quick Field Visit Entry Modal */}
      {isQuickVisitOpen && <QuickVisitModal
        isOpen={isQuickVisitOpen}
        onClose={() => setIsQuickVisitOpen(false)}
        agencies={agencies}
        onAddFieldNote={handleAddFieldNote}
        isOnline={isOnline}
      />}

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
        onClose={() => setIsMobileProviderFinderOpen(false)}
        agencies={agencies}
        onSelectAgency={handleOpenAgencyProfile}
        onToggleBookmark={handleToggleBookmark}
        onToggleRoute={handleToggleRoute}
        activeCategory={globalCategory}
        onCategoryChange={setGlobalCategory}
        selectedState={globalState}
        onSelectState={(st) => setGlobalState(st)}
        selectedCounty={globalCounty}
        onSelectCounty={(co) => setGlobalCounty(co)}
      />}
      {isAgencyComparisonOpen && (
        <AgencyComparisonPanel
          agencies={comparisonAgencies}
          onClose={handleCloseAgencyComparison}
          onRemoveAgency={handleRemoveComparedAgency}
          onOpenProfile={handleOpenAgencyProfile}
        />
      )}
      </React.Suspense>

      {/* Toast Notification Pill */}
      {toast && (
        <div className="fixed bottom-20 md:bottom-12 right-4 sm:right-6 z-50">
          <div className={`px-4 py-3 rounded-xl border shadow-sm flex items-center gap-2.5 text-xs font-semibold ${
            toast.type === 'success' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-slate-200 dark:border-slate-800' :
            toast.type === 'warn' ? 'bg-white dark:bg-slate-900 text-amber-950 dark:text-amber-300 border-amber-200 dark:border-amber-800' :
            toast.type === 'error' ? 'bg-white dark:bg-slate-900 text-rose-950 dark:text-rose-300 border-rose-200 dark:border-rose-800' :
            'bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-slate-200 dark:border-slate-800'
          }`}>
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : toast.type === 'warn' ? (
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {comparisonAgencies.length > 0 && activeTab !== 'home' && !currentActive && !isAgencyComparisonOpen && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[4.25rem] z-40 px-3 md:bottom-4 md:left-64">
          <div className="pointer-events-auto mx-auto flex max-w-4xl items-center gap-2 rounded-xl border border-teal-200 bg-white/95 p-2.5 shadow-lg shadow-slate-900/10 backdrop-blur dark:border-teal-900 dark:bg-[#101D2C]/95 sm:gap-3 sm:px-4">
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
