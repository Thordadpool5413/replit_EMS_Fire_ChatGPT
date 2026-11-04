import React, { useState } from 'react';
import { MobileBottomNav } from './MobileBottomNav';
import { TopBar } from './TopBar';
import './_group.css';

const noop = () => {};

const workspaceTitle = (tab: string) => {
  if (tab === 'home') return 'Home';
  if (tab === 'queue') return 'Agencies';
  if (['contracts', 'grants', 'pulseiq'].includes(tab)) return 'Opportunities';
  if (['states_directory', 'google_maps', 'map', 'geo', 'gis'].includes(tab)) return 'Territory Explorer';
  if (['field', 'tm_dashboard'].includes(tab)) return 'Field Work';
  if (['knowledge', 'claims', '3d_studio', 'gateway'].includes(tab)) return 'Specialist tools';
  if (['data_health', 'resilience'].includes(tab)) return 'Data & system';
  return 'Workspace';
};

export function Current() {
  const [activeTab, setActiveTab] = useState('home');
  const [globalCategory, setGlobalCategory] = useState<'all' | 'ems' | 'fire'>('all');
  const [isDarkMode, setIsDarkMode] = useState(false);

  return (
    <div className={`pi-app-shell min-h-[100dvh] w-full max-w-full overflow-x-hidden ${isDarkMode ? 'dark bg-[#0B1320] text-slate-100' : 'bg-[#F5F7FA] text-[#14283F]'} flex flex-col font-sans pb-16 md:pb-0 transition-colors duration-150`}>
      <TopBar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onGoHome={() => setActiveTab('home')}
        globalCategory={globalCategory}
        setGlobalCategory={setGlobalCategory}
        isOnline
        toggleNetwork={noop}
        pendingSyncCount={0}
        isSyncing={false}
        triggerManualSync={noop}
        unreadAlertCount={0}
        openNotifications={noop}
        openCommandPalette={noop}
        openDataLineageModal={noop}
        openChatbot={noop}
        isCloudConnected={false}
        cloudSyncCount={0}
        showGuide={false}
        onToggleGuide={noop}
        isDarkMode={isDarkMode}
        onToggleDarkMode={() => setIsDarkMode((dark) => !dark)}
        globalState="all"
        globalCounty="all"
        globalCity="all"
        onClearGeography={noop}
        activeAccountName={null}
        dayRouteCount={0}
        agencies={[]}
        onOpenProviderFinder={noop}
      />

      <div className="pi-workspace-body md:pl-64 flex-1 flex flex-col min-w-0">
        <main className="workspace-grid-shell flex-1 w-full max-w-[1640px] mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6 pb-24 md:pb-8 min-w-0">
          <section className="pi-surface p-5 sm:p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-[#53657B] dark:text-slate-400">Workspace</p>
            <h1 className="pi-page-title mt-1">{workspaceTitle(activeTab)}</h1>
            <p className="pi-supporting mt-2">
              Territory intelligence workspace
            </p>
          </section>
        </main>
      </div>

      <MobileBottomNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onGoHome={() => setActiveTab('home')}
        dayRouteCount={0}
      />
    </div>
  );
}
