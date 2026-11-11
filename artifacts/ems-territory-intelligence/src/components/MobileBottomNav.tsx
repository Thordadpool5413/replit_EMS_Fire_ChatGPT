/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  Activity,
  Box,
  Briefcase,
  Building2,
  Database,
  DollarSign,
  Globe,
  Home,
  MoreHorizontal,
  Scale,
  ShieldCheck,
  TrendingUp,
  X
} from 'lucide-react';
import {
  isFieldWorkTab,
  isOpportunitiesTab,
  isSpecialistTab,
  isSystemTab,
  isTerritoryTab,
  SPECIALIST_WORKSPACE_TABS,
  SYSTEM_WORKSPACE_TABS
} from '../navigation/workspaceNavigation';
import { PwaControls } from '../pwa/PwaControls';

interface MobileBottomNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onGoHome?: () => void;
  dayRouteCount: number;
}

const specialistIcons = {
  knowledge: Scale,
  claims: DollarSign,
  '3d_studio': Box,
  gateway: Database
} as const;

const specialistTools = SPECIALIST_WORKSPACE_TABS.map(({ id, label }) => ({
  id,
  label: id === 'gateway' ? 'Federal data sources' : label,
  icon: specialistIcons[id]
}));

const systemIcons = {
  data_health: Activity,
  resilience: ShieldCheck
} as const;

const systemTools = SYSTEM_WORKSPACE_TABS.map(({ id, label }) => ({
  id,
  label: id === 'data_health' ? 'Data status & sync' : label,
  icon: systemIcons[id]
}));

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  setActiveTab,
  onGoHome,
  dayRouteCount
}) => {
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const isHome = activeTab === 'home';
  const isAgencies = activeTab === 'queue';
  const isOpportunities = isOpportunitiesTab(activeTab);
  const isTerritory = isTerritoryTab(activeTab);
  const isMyWork = isFieldWorkTab(activeTab);
  const isMoreActive = isSpecialistTab(activeTab) || isSystemTab(activeTab);

  useEffect(() => {
    setIsMoreOpen(false);
  }, [activeTab]);

  const navigate = (tab: string) => {
    setIsMoreOpen(false);
    setActiveTab(tab);
  };

  return (
    <>
      {isMoreOpen && (
        <>
          <button
            type="button"
            aria-label="Close more tools menu"
            onClick={() => setIsMoreOpen(false)}
            className="fixed inset-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-40 bg-slate-950/35 md:hidden"
          />
          <section
            id="mobile-more-tools"
            aria-label="More tools"
            onKeyDown={(event) => { if (event.key === 'Escape') setIsMoreOpen(false); }}
            className="pi-mobile-more-sheet fixed left-3 right-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-md max-h-[calc(var(--app-visible-height,100dvh)-6rem-env(safe-area-inset-bottom)-env(safe-area-inset-top))] overflow-y-auto overscroll-contain rounded-2xl border border-[#DFE6EF] bg-white p-4 shadow-2xl dark:border-[#1E2D42] dark:bg-[#111C2D] md:hidden"
          >
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-[#14283F] dark:text-white">More tools</h2>
                <p className="mt-0.5 text-[11px] text-[#53657B] dark:text-slate-400">Research and system tools</p>
              </div>
              <button
                type="button"
                onClick={() => setIsMoreOpen(false)}
                aria-label="Close more tools"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#53657B] hover:bg-[#F5F7FA] dark:text-slate-300 dark:hover:bg-[#16243A]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3">
              {[
                { title: 'Specialist', tools: specialistTools },
                { title: 'Data & system', tools: systemTools }
              ].map(({ title, tools }) => (
                <div key={title}>
                  <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#53657B] dark:text-slate-400">
                    {title}
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {tools.map(({ id, label, icon: Icon }) => {
                      const active = activeTab === id;
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => navigate(id)}
                          aria-current={active ? 'page' : undefined}
                          className={`flex min-h-12 items-center gap-2 rounded-xl border px-3 py-2 text-left text-[13px] font-medium leading-snug transition-colors active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 motion-reduce:transition-none motion-reduce:active:scale-100 ${
                            active
                              ? 'border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/50 dark:text-blue-200'
                              : 'border-[#DFE6EF] bg-white text-[#14283F] hover:bg-[#F5F7FA] dark:border-[#1E2D42] dark:bg-[#16243A] dark:text-slate-200 dark:hover:bg-slate-800'
                          }`}
                        >
                          <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                          <span>{label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 border-t border-[#DFE6EF] pt-3 dark:border-[#1E2D42]" data-testid="section-mobile-pwa-controls">
              <PwaControls />
            </div>
          </section>
        </>
      )}

      <nav
        aria-label="Mobile primary workspaces"
        onKeyDown={(event) => {
          if (event.key === 'Escape') setIsMoreOpen(false);
        }}
        className="pi-mobile-nav md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0B1728] text-slate-300 border-t border-[#172D49] shadow-lg"
      >
        <div className="grid grid-cols-6 items-center h-16 px-1">
          <button
            type="button"
            onClick={() => {
              setIsMoreOpen(false);
              if (onGoHome) onGoHome();
              else setActiveTab('home');
            }}
            aria-label="Home"
            aria-current={isHome ? 'page' : undefined}
            className={`min-h-[48px] min-w-[44px] flex flex-col items-center justify-center transition-colors cursor-pointer ${
              isHome ? 'pi-mobile-nav__item is-active font-semibold' : 'pi-mobile-nav__item'
            }`}
          >
            <Home className="h-5 w-5" aria-hidden="true" />
            <span className="text-[10.5px] leading-none tracking-tight mt-1">Home</span>
          </button>

          <button
            type="button"
            onClick={() => navigate('queue')}
            aria-label="Agencies"
            aria-current={isAgencies ? 'page' : undefined}
            className={`min-h-[48px] min-w-[44px] flex flex-col items-center justify-center transition-colors cursor-pointer ${
              isAgencies ? 'pi-mobile-nav__item is-active font-semibold' : 'pi-mobile-nav__item'
            }`}
          >
            <Building2 className="h-5 w-5" aria-hidden="true" />
            <span className="text-[10.5px] leading-none tracking-tight mt-1">Agencies</span>
          </button>

          <button
            type="button"
            onClick={() => navigate('contracts')}
            aria-label="Opportunities"
            aria-current={isOpportunities ? 'page' : undefined}
            className={`min-h-[48px] min-w-[44px] flex flex-col items-center justify-center transition-colors cursor-pointer ${
              isOpportunities ? 'pi-mobile-nav__item is-active font-semibold' : 'pi-mobile-nav__item'
            }`}
          >
            <TrendingUp className="h-5 w-5" aria-hidden="true" />
            <span aria-hidden="true" className="text-[10.5px] leading-none tracking-tight mt-1">Leads</span>
          </button>

          <button
            type="button"
            onClick={() => navigate('states_directory')}
            aria-label="Territory"
            aria-current={isTerritory ? 'page' : undefined}
            className={`min-h-[48px] min-w-[44px] flex flex-col items-center justify-center transition-colors cursor-pointer ${
              isTerritory ? 'pi-mobile-nav__item is-active font-semibold' : 'pi-mobile-nav__item'
            }`}
          >
            <Globe className="h-5 w-5" aria-hidden="true" />
            <span aria-hidden="true" className="pi-mobile-nav__full-label text-[10.5px] leading-none tracking-tight mt-1">Territory</span>
            <span aria-hidden="true" className="pi-mobile-nav__compact-label text-[10.5px] leading-none tracking-tight mt-1">Map</span>
          </button>

          <button
            type="button"
            onClick={() => navigate(isMyWork ? activeTab : 'field')}
            aria-label="Field work"
            aria-current={isMyWork ? 'page' : undefined}
            className={`min-h-[48px] min-w-[44px] flex flex-col items-center justify-center relative transition-colors cursor-pointer ${
              isMyWork ? 'pi-mobile-nav__item is-active font-semibold' : 'pi-mobile-nav__item'
            }`}
          >
            <Briefcase className="h-5 w-5" aria-hidden="true" />
            <span aria-hidden="true" className="text-[10.5px] leading-none tracking-tight mt-1">Field</span>
            {dayRouteCount > 0 && (
              <span className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-[#285EE8] text-white pi-data-number text-[9px] font-bold flex items-center justify-center">
                {dayRouteCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setIsMoreOpen((open) => !open)}
            aria-label="More"
            aria-expanded={isMoreOpen}
            aria-controls={isMoreOpen ? 'mobile-more-tools' : undefined}
            className={`min-h-[48px] min-w-[44px] flex flex-col items-center justify-center transition-colors cursor-pointer ${
              isMoreActive || isMoreOpen ? 'pi-mobile-nav__item is-active font-semibold' : 'pi-mobile-nav__item'
            }`}
          >
            <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
            <span className="text-[10.5px] leading-none tracking-tight mt-1">More</span>
          </button>
        </div>
      </nav>
    </>
  );
};
