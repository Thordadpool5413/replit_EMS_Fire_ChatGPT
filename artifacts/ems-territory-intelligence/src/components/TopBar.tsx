/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useSyncExternalStore } from 'react';
import {getPwaState, installPwa, subscribePwa} from '../pwa/lifecycle';
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
  Palette,
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
  const pwaState = useSyncExternalStore(subscribePwa,getPwaState,getPwaState);
  const installPrompt = pwaState.installAvailable;
  const isAppInstalled = pwaState.installed;
  const [showInstallHelp, setShowInstallHelp] = useState(false);
  const desktopUtilityRef = useRef<HTMLDivElement>(null);
  const mobileUtilityRef = useRef<HTMLDivElement>(null);

  const handleInstallApp = async () => {
    if (!installPrompt) {
      setShowInstallHelp((show) => !show);
      return;
    }
    await installPwa();
    if(getPwaState().error)setShowInstallHelp(true);
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
        className="pi-primary-sidebar hidden md:flex flex-col fixed top-0 left-0 bottom-0 z-50 select-none border-r"
      >
        <div className="pi-sb-brand">
          <button
            type="button"
            onClick={onGoHome}
            className="pi-sb-brand-button flex items-center justify-center group cursor-pointer"
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

        <div className="pi-sb-section">
          <p className="pi-sb-heading" id="sidebar-provider-scope">Provider scope</p>
          <div className="pi-sb-segment" role="group" aria-labelledby="sidebar-provider-scope">
            {(['all', 'ems', 'fire'] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                aria-pressed={globalCategory === cat}
                onClick={() => setGlobalCategory(cat)}
                data-testid={`button-scope-${cat}`}
              >
                {cat === 'all' ? 'All' : cat === 'ems' ? 'EMS' : 'Fire'}
              </button>
            ))}
          </div>
        </div>

        <nav className="pi-primary-nav" aria-label="Workspaces and tools">
          <div className="pi-sb-group">
            <p className="pi-sb-heading">Workspaces</p>
            <div className="pi-sb-list">
              <button type="button" className="pi-sb-item" onClick={() => setActiveTab('home')} aria-current={isHomeActive ? 'page' : undefined}>
                <Home aria-hidden="true" /><span className="pi-sb-label">Home</span>
              </button>
              <button type="button" className="pi-sb-item" onClick={() => setActiveTab('queue')} aria-current={isAccountsActive ? 'page' : undefined}>
                <Building2 aria-hidden="true" /><span className="pi-sb-label">Agencies</span>
              </button>
              <button type="button" className="pi-sb-item" onClick={() => setActiveTab(isOpportunities ? activeTab : 'contracts')} aria-current={isOpportunitiesActive ? 'page' : undefined}>
                <TrendingUp aria-hidden="true" /><span className="pi-sb-label">Opportunities</span>
              </button>
              <button type="button" className="pi-sb-item" onClick={() => setActiveTab(isTerritory ? activeTab : 'states_directory')} aria-current={isTerritoryActive ? 'page' : undefined}>
                <Globe aria-hidden="true" /><span className="pi-sb-label">Territory</span>
                {globalState !== 'all' && <span className="pi-sb-badge" aria-label={`State ${globalState}`}>{globalState}</span>}
              </button>
              <button type="button" className="pi-sb-item" onClick={() => setActiveTab(isMyWorkTab ? activeTab : 'field')} aria-current={isMyWorkActive ? 'page' : undefined}>
                <Briefcase aria-hidden="true" /><span className="pi-sb-label">Field Work</span>
                {dayRouteCount > 0 && (
                  <span className="pi-sb-badge" aria-label={`${dayRouteCount} agencies in today's route`} title={`${dayRouteCount} agencies in today's route`}>{dayRouteCount}</span>
                )}
              </button>
            </div>
          </div>

          <div className="pi-sb-group">
            <p className="pi-sb-heading">Tools</p>
            <div className="pi-sb-list">
              <button type="button" className="pi-sb-item" onClick={() => setActiveTab(isSpecialist ? activeTab : 'knowledge')} aria-current={isSpecialistActive ? 'page' : undefined}>
                <Database aria-hidden="true" /><span className="pi-sb-label">Specialist tools</span>
              </button>
              <button type="button" className="pi-sb-item" onClick={() => setActiveTab(isSystem ? activeTab : 'data_health')} aria-current={isSystemActive ? 'page' : undefined}>
                <ShieldCheck aria-hidden="true" /><span className="pi-sb-label">Data &amp; system</span>
              </button>
            </div>
          </div>
        </nav>

        <div className="pi-sidebar-quick-actions">
          {hasActiveGeography && (
            <div className="pi-sb-geo pi-sb-wide">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 truncate" title={`${globalState !== 'all' ? globalState : 'US'}${globalCounty !== 'all' ? ` · ${globalCounty}` : ''}${globalCity !== 'all' ? ` · ${globalCity}` : ''}`}>
                {globalState !== 'all' ? globalState : 'US'}
                {globalCounty !== 'all' ? ` · ${globalCounty}` : ''}
                {globalCity !== 'all' ? ` · ${globalCity}` : ''}
              </span>
              {onClearGeography && (
                <button type="button" onClick={onClearGeography} title="Reset geography filter">Reset</button>
              )}
            </div>
          )}

          {pendingSyncCount > 0 && (
            <button
              type="button"
              onClick={triggerManualSync}
              disabled={!isOnline || isSyncing}
              className="pi-sb-tool pi-sb-tool--warn pi-sb-wide disabled:opacity-50"
              aria-label={`${pendingSyncCount} pending sync items${!isOnline ? ', offline' : ''}`}
            >
              <RefreshCw className={isSyncing ? 'animate-spin' : ''} aria-hidden="true" />
              <span className="truncate">{isSyncing ? 'Syncing…' : `Sync ${pendingSyncCount} pending`}</span>
            </button>
          )}

          {openCommandPalette && (
            <button
              type="button"
              onClick={openCommandPalette}
              className="pi-sb-tool"
              title="Search agencies, cities, ZIP codes, or NPIs (Cmd/Ctrl+K)"
            >
              <Search aria-hidden="true" />
              <span>Search</span>
              <kbd className="pi-sb-kbd">⌘K</kbd>
            </button>
          )}

          {openChatbot && (
            <button
              type="button"
              onClick={openChatbot}
              className="pi-sb-tool pi-sb-tool--accent"
              title="Open Territory Strategy AI"
              aria-label="Open Strategy AI"
            >
              <Sparkles aria-hidden="true" />
              <span>Strategy AI</span>
            </button>
          )}

          <div className="pi-sb-tool pi-sb-appearance">
            <Palette aria-hidden="true" />
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
              className="pi-sb-tool"
              title="Help and sources"
              aria-label="Help and sources"
              aria-expanded={isUtilityMenuOpen}
            >
              <CircleHelp aria-hidden="true" />
              <span className="min-w-0 flex-1 text-left">Help &amp; sources</span>
              <ChevronDown className="h-3 w-3" aria-hidden="true" />
            </button>
            {isUtilityMenuOpen && (
              <div className="pi-sb-utility-menu absolute bottom-full right-0 z-[60] mb-2 w-[12.5rem] max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-xl border border-[#DFE6EF] bg-white py-2 text-sm shadow-xl dark:border-[#1E2D42] dark:bg-[#111C2D]">
                <div className="px-3 pb-1.5 text-xs font-semibold text-[#53657B] dark:text-slate-400">
                  Help &amp; sources
                </div>
                <div className="space-y-0.5 px-2">
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
                          className="mx-2.5 rounded-md bg-[#F5F7FA] px-2.5 py-2 text-xs leading-relaxed text-[#53657B] dark:bg-[#16243A] dark:text-slate-300"
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
          <div className="pi-sb-offline" role="status" aria-live="polite">
            Offline: local changes stay on this device until sync resumes.
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
