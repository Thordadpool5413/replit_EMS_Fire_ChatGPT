/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import brandLogoAsset from '../assets/images/nicks_ems_logo_1792367124466.jpg';
import {
  Search,
  ChevronDown,
  Home,
  Building2,
  TrendingUp,
  Globe,
  Briefcase,
  Scale,
  DollarSign,
  Box,
  Database,
  Activity,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  CircleHelp,
  MapPin,
  RefreshCw,
  Download,
  WifiOff
} from 'lucide-react';
import {
  isFieldWorkTab,
  isOpportunitiesTab as isOpportunitiesWorkspaceTab,
  isSpecialistTab as isSpecialistWorkspaceTab,
  isSystemTab as isSystemWorkspaceTab,
  isTerritoryTab as isTerritoryWorkspaceTab
} from '../navigation/workspaceNavigation';
import type { ThemeMode } from '../types/theme';
import { ThemeModeSelect } from './ThemeModeSelect';

interface TopBarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onGoHome: () => void;
  globalCategory: 'all' | 'ems' | 'fire';
  setGlobalCategory: (cat: 'all' | 'ems' | 'fire') => void;
  isOnline: boolean;
  pendingSyncCount: number;
  isSyncing: boolean;
  triggerManualSync: () => void;
  openCommandPalette?: () => void;
  openDataLineageModal?: () => void;
  openChatbot?: () => void;
  showGuide?: boolean;
  onToggleGuide?: () => void;
  themeMode: ThemeMode;
  onThemeModeChange: (mode: ThemeMode) => void;
  globalState?: string;
  globalCounty?: string;
  globalCity?: string;
  onClearGeography?: () => void;
  activeAccountName?: string | null;
  dayRouteCount?: number;
  onOpenProviderFinder?: () => void;
}

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export const TopBar: React.FC<TopBarProps> = ({
  activeTab,
  setActiveTab,
  onGoHome,
  globalCategory,
  setGlobalCategory,
  isOnline,
  pendingSyncCount,
  isSyncing,
  triggerManualSync,
  openCommandPalette,
  openDataLineageModal,
  openChatbot,
  showGuide = false,
  onToggleGuide,
  themeMode,
  onThemeModeChange,
  globalState = 'all',
  globalCounty = 'all',
  globalCity = 'all',
  onClearGeography,
  activeAccountName = null,
  dayRouteCount = 0,
  onOpenProviderFinder
}) => {
  const fallbackLogo = `${import.meta.env.BASE_URL}logo.jpg`;
  const [logoSrc, setLogoSrc] = useState<string>(brandLogoAsset || fallbackLogo);
  const [logoFailed, setLogoFailed] = useState<boolean>(false);
  const [isUtilityMenuOpen, setIsUtilityMenuOpen] = useState<boolean>(false);
  const [isMobileToolsMenuOpen, setIsMobileToolsMenuOpen] = useState<boolean>(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [isAppInstalled, setIsAppInstalled] = useState(false);
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const desktopUtilityRef = useRef<HTMLDivElement>(null);
  const mobileUtilityRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const standaloneMedia = window.matchMedia('(display-mode: standalone)');
    const updateInstalledState = () => {
      const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
      setIsAppInstalled(standaloneMedia.matches || iosStandalone);
    };
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const handleAppInstalled = () => {
      setIsAppInstalled(true);
      setInstallPrompt(null);
      setShowInstallHelp(false);
    };

    updateInstalledState();
    standaloneMedia.addEventListener('change', updateInstalledState);
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      standaloneMedia.removeEventListener('change', updateInstalledState);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallApp = async () => {
    if (!installPrompt) {
      setShowInstallHelp((show) => !show);
      return;
    }
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      setInstallPrompt(null);
      if (choice.outcome === 'accepted') setIsAppInstalled(true);
    } catch (error) {
      console.error('Unable to open the app install prompt:', error);
      setShowInstallHelp(true);
    }
  };

  const isIosBrowser = typeof navigator !== 'undefined'
    && (/iPad|iPhone|iPod/.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
  const installHelpText = isIosBrowser
    ? 'In Safari, tap Share, choose “Add to Home Screen,” then tap Add.'
    : 'Open your browser menu and choose “Install app” or “Add to Home Screen.”';
  const installActionLabel = isIosBrowser ? 'Add to Home Screen' : 'Install app';

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const clickedUtility = [desktopUtilityRef, mobileUtilityRef]
        .some((ref) => ref.current?.contains(target));
      if (!clickedUtility) {
        setIsUtilityMenuOpen(false);
        setIsMobileToolsMenuOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsUtilityMenuOpen(false);
        setIsMobileToolsMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, []);

  // Workspace active detection
  const isHomeActive = activeTab === 'home' && !activeAccountName;
  const isAccountsActive = activeTab === 'queue' || Boolean(activeAccountName);
  const isOpportunities = isOpportunitiesWorkspaceTab(activeTab);
  const isOpportunitiesActive = isOpportunities && !activeAccountName;
  const isTerritory = isTerritoryWorkspaceTab(activeTab);
  const isTerritoryActive = isTerritory && !activeAccountName;
  const isMyWorkTab = isFieldWorkTab(activeTab);
  const isMyWorkActive = isMyWorkTab && !activeAccountName;
  const isSpecialist = isSpecialistWorkspaceTab(activeTab);
  const isSpecialistActive = isSpecialist && !activeAccountName;
  const isSystem = isSystemWorkspaceTab(activeTab);
  const isSystemActive = isSystem && !activeAccountName;

  const getWorkspaceTitle = () => {
    if (activeAccountName) return `Agencies / ${activeAccountName}`;
    if (activeTab === 'home') return 'Home';
    if (activeTab === 'queue') return 'Agencies';
    if (isOpportunities) return 'Opportunities';
    if (isTerritory) return 'Territory Explorer';
    if (isMyWorkTab) return 'Field Work';
    if (isSystemActive) return 'Data & system';
    if (isSpecialistActive) return 'Specialist tools';
    return 'Workspace';
  };

  const hasActiveGeography = globalState !== 'all' || globalCounty !== 'all' || globalCity !== 'all';

  return (
    <>
      {/* Primary left sidebar — desktop */}
      <aside
        aria-label="Primary Workspace Navigation"
        className="pi-primary-sidebar hidden md:flex flex-col fixed top-0 left-0 bottom-0 bg-[#0B1728] text-slate-200 border-r border-[#172D49] z-50 select-none"
      >
        {/* Compact identity keeps the workspace navigation immediately in view. */}
        <div className="px-4 py-3 flex items-center justify-center border-b border-[#172D49] shrink-0">
          <button
            type="button"
            onClick={onGoHome}
            className="flex items-center justify-center group focus:outline-none cursor-pointer"
            title="Return to Territory Intelligence Home"
            aria-label="Return to Territory Intelligence Home"
          >
            <div className="pi-sidebar-logo w-[144px] h-[144px] rounded-full overflow-hidden ring-2 ring-[#285EE8]/50 bg-[#070F1C] flex items-center justify-center shrink-0 transition-transform group-hover:scale-[1.03]">
              {!logoFailed ? (
                <img
                  src={logoSrc}
                  alt="EMS and Fire logo"
                  className="w-full h-full object-cover"
                  onError={() => {
                    if (logoSrc !== fallbackLogo) setLogoSrc(fallbackLogo);
                    else setLogoFailed(true);
                  }}
                />
              ) : (
                <span className="font-display font-bold text-2xl text-white">NF</span>
              )}
            </div>
          </button>
        </div>

        {/* Provider Discipline Filter (All / EMS / Fire) inside Sidebar */}
        <div className="px-3.5 pt-3.5 pb-2">
          <div className="text-xs font-medium text-slate-400 px-1 mb-1.5">
            Provider scope
          </div>
          <div
            className="grid grid-cols-3 bg-[#172D49]/80 p-0.5 rounded-lg border border-[#233B5E]"
            role="group"
            aria-label="Provider Discipline Filter"
          >
            {(['all', 'ems', 'fire'] as const).map((cat) => {
              const active = globalCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setGlobalCategory(cat)}
                  className={`py-1 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#285EE8] text-white shadow-2xs font-semibold'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {cat === 'all' ? 'All' : cat === 'ems' ? 'EMS' : 'Fire'}
                </button>
              );
            })}
          </div>
        </div>

        {/* Primary 5 Workspaces Navigation */}
        <nav className="pi-primary-nav flex-1 overflow-y-auto px-3 py-2 space-y-5 no-scrollbar">
          <div>
            <div className="text-xs font-medium text-slate-400 px-2.5 mb-1.5">
              Workspaces
            </div>
            <div className="space-y-0.5">
              {/* 1. Home */}
              <button
                type="button"
                onClick={() => setActiveTab('home')}
                aria-current={isHomeActive ? 'page' : undefined}
                className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors cursor-pointer ${
                  isHomeActive
                    ? 'bg-[#285EE8] text-white font-semibold shadow-2xs'
                    : 'text-slate-300 hover:bg-[#172D49] hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Home className="w-4 h-4 shrink-0" />
                  <span>Home</span>
                </span>
              </button>

              {/* 2. Agencies */}
              <button
                type="button"
                onClick={() => setActiveTab('queue')}
                aria-current={isAccountsActive ? 'page' : undefined}
                className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors cursor-pointer ${
                  isAccountsActive
                    ? 'bg-[#285EE8] text-white font-semibold shadow-2xs'
                    : 'text-slate-300 hover:bg-[#172D49] hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Building2 className="w-4 h-4 shrink-0" />
                  <span>Agencies</span>
                </span>
                {activeAccountName && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/20 text-white">
                    360
                  </span>
                )}
              </button>

              {/* 3. Opportunities */}
              <button
                type="button"
                onClick={() => setActiveTab(isOpportunities ? activeTab : 'contracts')}
                aria-current={isOpportunitiesActive ? 'page' : undefined}
                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors cursor-pointer ${
                  isOpportunitiesActive
                    ? 'bg-[#285EE8] text-white font-semibold shadow-2xs'
                    : 'text-slate-300 hover:bg-[#172D49] hover:text-white'
                }`}
              >
                <TrendingUp className="w-4 h-4 shrink-0" />
                <span className="truncate">Opportunities</span>
              </button>

              {/* 4. Territory Explorer */}
              <div
                className={`w-full flex items-center justify-between rounded-lg text-[13px] font-medium transition-colors ${
                  isTerritoryActive
                    ? 'bg-[#285EE8] text-white font-semibold shadow-2xs'
                    : 'text-slate-300 hover:bg-[#172D49] hover:text-white'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setActiveTab(isTerritory ? activeTab : 'states_directory')}
                  aria-current={isTerritoryActive ? 'page' : undefined}
                  className="flex-1 flex items-center gap-2.5 px-2.5 py-2 text-left cursor-pointer focus:outline-none min-w-0"
                >
                  <Globe className="w-4 h-4 shrink-0" />
                  <span className="truncate">Territory</span>
                </button>
                {globalState !== 'all' && (
                  <span className="font-mono text-[10px] px-1.5 py-0.5 mr-2 rounded bg-[#172D49] text-blue-300">
                    {globalState}
                  </span>
                )}
              </div>

              {/* 5. Field Work */}
              <div
                className={`w-full flex items-center justify-between rounded-lg text-[13px] font-medium transition-colors ${
                  isMyWorkActive
                    ? 'bg-[#285EE8] text-white font-semibold shadow-2xs'
                    : 'text-slate-300 hover:bg-[#172D49] hover:text-white'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setActiveTab(isMyWorkTab ? activeTab : 'field')}
                  aria-current={isMyWorkActive ? 'page' : undefined}
                  className="flex-1 flex items-center gap-2.5 px-2.5 py-2 text-left cursor-pointer focus:outline-none min-w-0"
                >
                  <Briefcase className="w-4 h-4 shrink-0" />
                  <span className="truncate">Field Work</span>
                </button>
                {dayRouteCount > 0 && (
                  <span aria-label={`${dayRouteCount} agencies in today's route`} title={`${dayRouteCount} agencies in today's route`} className="text-xs font-semibold pi-data-number px-1.5 py-0.5 mr-2 rounded bg-[#172D49] text-slate-200">
                    {dayRouteCount}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Lower-frequency specialist and system tools stay separate from daily workspaces. */}
          <div>
            <div className="text-xs font-medium text-slate-400 px-2.5 mb-1.5">
              Tools
            </div>
            <div className="space-y-0.5">
            <button
              type="button"
              onClick={() => setActiveTab(isSpecialist ? activeTab : 'knowledge')}
              aria-current={isSpecialistActive ? 'page' : undefined}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors cursor-pointer ${
                isSpecialistActive
                  ? 'bg-[#285EE8] text-white font-semibold shadow-2xs'
                  : 'text-slate-300 hover:bg-[#172D49] hover:text-white'
              }`}
            >
              <Database className="w-4 h-4 shrink-0" />
              <span className="truncate">Specialist tools</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab(isSystem ? activeTab : 'data_health')}
              aria-current={isSystemActive ? 'page' : undefined}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors cursor-pointer ${
                isSystemActive
                  ? 'bg-[#285EE8] text-white font-semibold shadow-2xs'
                  : 'text-slate-300 hover:bg-[#172D49] hover:text-white'
              }`}
            >
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span className="truncate">Data &amp; system</span>
            </button>
            </div>
          </div>
        </nav>

        {/* Desktop command actions live in the sidebar instead of a separate top row. */}
        <div className="pi-sidebar-quick-actions px-3 pb-3 space-y-2 shrink-0">
          {hasActiveGeography && (
            <div className="flex min-w-0 items-center gap-1.5 rounded-lg border border-[#233B5E] bg-[#101F34] px-2 py-1.5 text-[10px] text-slate-300">
              <MapPin className="h-3 w-3 shrink-0 text-blue-300" />
              <span className="min-w-0 flex-1 truncate" title={`${globalState !== 'all' ? globalState : 'US'}${globalCounty !== 'all' ? ` · ${globalCounty}` : ''}${globalCity !== 'all' ? ` · ${globalCity}` : ''}`}>
                {globalState !== 'all' ? globalState : 'US'}
                {globalCounty !== 'all' ? ` · ${globalCounty}` : ''}
                {globalCity !== 'all' ? ` · ${globalCity}` : ''}
              </span>
              {onClearGeography && (
                <button
                  type="button"
                  onClick={onClearGeography}
                  className="shrink-0 text-blue-300 hover:text-white"
                  title="Reset geography filter"
                >
                  Reset
                </button>
              )}
            </div>
          )}

          {pendingSyncCount > 0 && (
            <button
              type="button"
              onClick={triggerManualSync}
              disabled={!isOnline || isSyncing}
              className="flex h-8 w-full items-center gap-2 rounded-lg border border-amber-800 bg-amber-950/40 px-2.5 text-[11px] font-medium text-amber-200 hover:bg-amber-900/50 disabled:opacity-50"
              aria-label={`${pendingSyncCount} pending sync items${!isOnline ? ', offline' : ''}`}
            >
              <RefreshCw className={`h-3.5 w-3.5 shrink-0 ${isSyncing ? 'animate-spin' : ''}`} />
              <span className="truncate">{isSyncing ? 'Syncing…' : `Sync ${pendingSyncCount} pending`}</span>
            </button>
          )}

          {openCommandPalette && (
            <button
              type="button"
              onClick={openCommandPalette}
              className="flex h-8 w-full items-center gap-2 rounded-lg border border-[#233B5E] bg-[#101F34] px-2.5 text-[11px] font-medium text-slate-200 hover:bg-[#172D49]"
              title="Search agencies, cities, ZIP codes, or NPIs"
            >
              <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span className="min-w-0 flex-1 truncate text-left">Search</span>
              <kbd className="rounded border border-[#344B68] px-1 text-[9px] text-slate-400">⌘K</kbd>
            </button>
          )}

          {openChatbot && (
            <button
              type="button"
              onClick={openChatbot}
              className="flex h-8 w-full items-center gap-2 rounded-lg border border-blue-800/80 bg-blue-950/45 px-2.5 text-[11px] font-semibold text-blue-200 hover:bg-blue-900/60"
              title="Open Territory Strategy AI"
            >
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-blue-300" />
              <span className="pi-sidebar-long-label truncate">Strategy AI</span>
              <span className="pi-sidebar-short-label">AI</span>
            </button>
          )}

          <div className="grid grid-cols-1 gap-1.5">
            <ThemeModeSelect
              controlId="theme-select-desktop"
              testId="theme-select-desktop"
              themeMode={themeMode}
              onChange={onThemeModeChange}
            />
          </div>

          <div className="relative" ref={desktopUtilityRef}>
            <button
              type="button"
              onClick={() => setIsUtilityMenuOpen((prev) => !prev)}
              className="flex h-8 w-full items-center gap-2 rounded-lg border border-[#233B5E] bg-[#101F34] px-2.5 text-[11px] font-medium text-slate-300 hover:bg-[#172D49]"
              title="Help and sources"
              aria-label="Help and sources"
              aria-expanded={isUtilityMenuOpen}
            >
              <CircleHelp className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span className="pi-sidebar-long-label min-w-0 flex-1 truncate text-left">Help &amp; sources</span>
              <span className="pi-sidebar-short-label min-w-0 flex-1 truncate text-left">Help</span>
              <ChevronDown className="h-3 w-3 shrink-0 text-slate-400" />
            </button>
            {isUtilityMenuOpen && (
              <div className="absolute bottom-full right-0 z-[60] mb-2 w-56 rounded-xl border border-[#DFE6EF] bg-white py-2 text-xs shadow-xl dark:border-[#1E2D42] dark:bg-[#111C2D]">
                <div className="px-3 pb-2 text-[10px] font-mono uppercase tracking-wider text-[#53657B] dark:text-slate-400">
                  Help &amp; sources
                </div>
                <div className="space-y-0.5 px-2 pt-1">
                  {onToggleGuide && (
                    <button
                      type="button"
                      onClick={() => {
                        onToggleGuide();
                        setIsUtilityMenuOpen(false);
                      }}
                      className="w-full rounded-md px-2.5 py-1.5 text-left text-[#14283F] hover:bg-[#F5F7FA] dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      {showGuide ? 'Hide Quick Start Strip' : 'Show Quick Start Strip'}
                    </button>
                  )}
                  {!isAppInstalled && (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleInstallApp()}
                        data-testid="button-install-pwa-desktop"
                        aria-expanded={showInstallHelp}
                        aria-controls={showInstallHelp ? 'install-pwa-help-desktop' : undefined}
                        className="w-full rounded-md px-2.5 py-1.5 text-left text-[#14283F] hover:bg-[#F5F7FA] dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        <span className="inline-flex items-center gap-2">
                          <Download className="h-3.5 w-3.5" />
                          {installActionLabel}
                        </span>
                      </button>
                      {showInstallHelp && (
                        <p
                          id="install-pwa-help-desktop"
                          className="mx-2.5 rounded-md bg-[#F5F7FA] px-2.5 py-2 text-[11px] leading-relaxed text-[#53657B] dark:bg-[#16243A] dark:text-slate-300"
                          role="status"
                          aria-live="polite"
                        >
                          {installHelpText}
                        </p>
                      )}
                    </>
                  )}
                  {openDataLineageModal && (
                    <button
                      type="button"
                      onClick={() => {
                        openDataLineageModal();
                        setIsUtilityMenuOpen(false);
                      }}
                      className="w-full rounded-md px-2.5 py-1.5 text-left text-[#14283F] hover:bg-[#F5F7FA] dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      Federal data lineage &amp; sources
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {!isOnline && (
          <div className="p-3 border-t border-[#172D49] bg-[#091322] shrink-0">
            <div
              className="flex items-center gap-2 rounded-lg border border-amber-800 bg-amber-950/40 px-2.5 py-2 text-[10px] text-amber-200"
              role="status"
              aria-live="polite"
            >
              <span className="h-2 w-2 shrink-0 rounded-full bg-amber-400" />
              <span className="font-medium">
                Offline: local changes stay on this device until sync resumes.
              </span>
            </div>
          </div>
        )}
      </aside>

      {/* Mobile-only utility header; desktop actions are integrated into the sidebar. */}
      <header className="pi-command-header sticky top-0 z-40 h-16 md:hidden bg-white dark:bg-[#111C2D] border-b border-[#DFE6EF] dark:border-[#1E2D42] transition-colors">
        <div className="h-full max-w-[1640px] mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3">
          {/* Left: Mobile Brand + Current Workspace Context & Active Geography */}
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={onGoHome}
              className="md:hidden flex items-center justify-center text-left cursor-pointer shrink-0"
              title="Return to Territory Intelligence Home"
              aria-label="Return to Territory Intelligence Home"
            >
              <div className="pi-mobile-logo w-12 h-12 sm:w-14 sm:h-14 rounded-full ring-2 ring-[#285EE8]/50 overflow-hidden shrink-0 bg-[#070F1C] flex items-center justify-center">
                <img
                  src={logoSrc}
                  alt="EMS and Fire logo"
                  className="w-full h-full object-cover"
                />
              </div>
            </button>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="workspace-context-title inline max-w-[9rem] truncate text-xs font-semibold text-[#14283F] dark:text-white sm:max-w-none sm:shrink-0 sm:whitespace-nowrap sm:text-sm">
                  {getWorkspaceTitle()}
                </span>
                {hasActiveGeography && (
                  <span className="hidden lg:inline-flex items-center gap-1.5 text-xs text-[#285EE8] dark:text-blue-400 bg-[#EEF3FE] dark:bg-blue-950/60 px-2 py-0.5 rounded-md border border-blue-200 dark:border-blue-800/60 font-medium">
                    <MapPin className="w-3 h-3 shrink-0" />
                    <span>
                      {globalState !== 'all' ? globalState : 'US'}
                      {globalCounty !== 'all' ? ` · ${globalCounty}` : ''}
                      {globalCity !== 'all' ? ` · ${globalCity}` : ''}
                    </span>
                    {onClearGeography && (
                      <button
                        type="button"
                        onClick={onClearGeography}
                        className="ml-1 text-xs hover:underline cursor-pointer"
                        title="Reset geography filter to All States"
                      >
                        Reset
                      </button>
                    )}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Center/Right: Universal Search Trigger + Action Controls */}
          <div className="pi-header-actions flex items-center gap-2 sm:gap-2.5 shrink-0">
            {!isOnline && (
              <span
                className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-1.5 py-1 text-[10px] font-semibold text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200"
                role="status"
                aria-label="Offline: local changes stay on this device until sync resumes."
              >
                <WifiOff className="h-3 w-3 shrink-0" />
                Offline
              </span>
            )}
            {/* Universal Agency & Territory Search (⌘K) */}
            {openCommandPalette && (
              <button
                type="button"
                onClick={onOpenProviderFinder || openCommandPalette}
                className="h-9 w-9 sm:w-56 md:w-64 lg:w-80 px-0 sm:px-3.5 rounded-lg bg-[#F5F7FA] dark:bg-[#16243A] hover:bg-slate-200/70 dark:hover:bg-slate-800 text-[#53657B] dark:text-slate-300 border border-[#DFE6EF] dark:border-[#1E2D42] flex items-center justify-center sm:justify-between gap-2.5 text-xs transition-colors cursor-pointer shrink-0"
                aria-label="Search providers"
                data-testid="button-mobile-provider-search"
                title="Search and filter EMS or fire providers"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <Search className="w-3.5 h-3.5 text-[#53657B] dark:text-slate-400 shrink-0" />
                  <span className="hidden sm:inline truncate">Search agency, city, ZIP, NPI...</span>
                </span>
                <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-xs font-medium text-[#53657B] dark:text-slate-400 bg-white dark:bg-[#111C2D] rounded border border-[#DFE6EF] dark:border-slate-700 shrink-0">
                  ⌘K
                </kbd>
              </button>
            )}

            {/* Compact mobile utility menu: search stays prominent, lower-frequency actions stay grouped. */}
            <div className="relative" ref={mobileUtilityRef}>
              <button
                type="button"
                onClick={() => setIsMobileToolsMenuOpen((open) => !open)}
                className="relative h-10 w-10 sm:w-auto sm:px-2.5 rounded-lg border border-[#DFE6EF] dark:border-[#1E2D42] bg-white dark:bg-[#16243A] hover:bg-[#F5F7FA] dark:hover:bg-slate-800 text-[#14283F] dark:text-slate-200 flex items-center justify-center sm:justify-start gap-1.5 text-xs font-medium transition-colors cursor-pointer"
                title="Workspace tools"
                aria-label="Workspace tools"
                aria-expanded={isMobileToolsMenuOpen}
                aria-haspopup="menu"
                aria-controls="mobile-workspace-tools-menu"
              >
                <SlidersHorizontal className="w-4 h-4 text-[#53657B] dark:text-slate-400" />
                <span className="hidden sm:inline">Tools</span>
                <ChevronDown className="hidden sm:block w-3 h-3 text-[#53657B]" />
                {pendingSyncCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-[#285EE8] text-white pi-data-number text-[10px] font-bold flex items-center justify-center">
                    {pendingSyncCount}
                  </span>
                )}
              </button>

              {isMobileToolsMenuOpen && (
                <div
                  id="mobile-workspace-tools-menu"
                  aria-label="Workspace tools"
                  className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-1rem)] max-h-[70dvh] overflow-y-auto rounded-xl bg-white dark:bg-[#111C2D] border border-[#DFE6EF] dark:border-[#1E2D42] shadow-lg py-2 z-50 text-xs"
                >
                  <div className="px-3 pb-2 text-[10px] font-mono uppercase tracking-wider text-[#53657B] dark:text-slate-400">
                    Workspace tools
                  </div>
                  <div className="px-2 pt-1.5 space-y-0.5">
                    {openChatbot && (
                      <button
                        type="button"
                        onClick={() => {
                          openChatbot();
                          setIsMobileToolsMenuOpen(false);
                        }}
                        className="w-full min-h-10 text-left px-2.5 py-2 rounded-md text-[#14283F] dark:text-slate-300 hover:bg-[#F5F7FA] dark:hover:bg-slate-800 cursor-pointer flex items-center gap-2"
                      >
                        <Sparkles className="h-4 w-4 text-[#285EE8] dark:text-blue-400" />
                        Strategy AI
                      </button>
                    )}
                    <div className="px-2 py-1">
                      <div className="px-2 pb-1 text-[10px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Appearance
                      </div>
                      <ThemeModeSelect
                        controlId="theme-select-mobile"
                        testId="theme-select-mobile"
                        themeMode={themeMode}
                        onChange={(mode) => {
                          onThemeModeChange(mode);
                          setIsMobileToolsMenuOpen(false);
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={triggerManualSync}
                      disabled={!isOnline || isSyncing}
                      className="w-full min-h-10 text-left px-2.5 py-2 rounded-md text-[#14283F] dark:text-slate-300 hover:bg-[#F5F7FA] dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50 flex items-center gap-2"
                    >
                      <RefreshCw className={`h-4 w-4 text-[#53657B] dark:text-slate-400 ${isSyncing ? 'animate-spin' : ''}`} />
                      {isSyncing ? 'Syncing…' : 'Sync workspace'}
                      {pendingSyncCount > 0 && (
                        <span className="ml-auto text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                          {pendingSyncCount} pending
                        </span>
                      )}
                      {!isOnline && <span className="ml-auto text-[10px] text-slate-500">Offline</span>}
                    </button>
                    <div className="my-1.5 border-t border-[#DFE6EF] dark:border-[#1E2D42]" />
                    {onToggleGuide && (
                      <button
                        type="button"
                        onClick={() => {
                          onToggleGuide();
                          setIsMobileToolsMenuOpen(false);
                        }}
                        className="w-full min-h-10 text-left px-2.5 py-2 rounded-md text-[#14283F] dark:text-slate-300 hover:bg-[#F5F7FA] dark:hover:bg-slate-800 cursor-pointer"
                      >
                        {showGuide ? 'Hide Quick Start Strip' : 'Show Quick Start Strip'}
                      </button>
                    )}
                    {!isAppInstalled && (
                      <>
                        <button
                          type="button"
                          onClick={() => void handleInstallApp()}
                          data-testid="button-install-pwa-mobile"
                          aria-expanded={showInstallHelp}
                          aria-controls={showInstallHelp ? 'install-pwa-help-mobile' : undefined}
                          className="w-full min-h-10 text-left px-2.5 py-2 rounded-md text-[#14283F] dark:text-slate-300 hover:bg-[#F5F7FA] dark:hover:bg-slate-800 cursor-pointer"
                        >
                          <span className="inline-flex items-center gap-2">
                            <Download className="h-3.5 w-3.5" />
                            {installActionLabel}
                          </span>
                        </button>
                        {showInstallHelp && (
                          <p
                            id="install-pwa-help-mobile"
                            className="mx-2.5 rounded-md bg-[#F5F7FA] dark:bg-[#16243A] px-2.5 py-2 text-[11px] leading-relaxed text-[#53657B] dark:text-slate-300"
                            role="status"
                            aria-live="polite"
                          >
                            {installHelpText}
                          </p>
                        )}
                      </>
                    )}
                    {openDataLineageModal && (
                      <button
                        type="button"
                        onClick={() => {
                          openDataLineageModal();
                          setIsUtilityMenuOpen(false);
                        }}
                        className="w-full min-h-10 text-left px-2.5 py-2 rounded-md text-[#14283F] dark:text-slate-300 hover:bg-[#F5F7FA] dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <span className="inline-flex items-center gap-2">
                          <CircleHelp className="h-4 w-4 text-[#53657B] dark:text-slate-400" />
                          Help, data lineage &amp; sources
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

    </>
  );
};
