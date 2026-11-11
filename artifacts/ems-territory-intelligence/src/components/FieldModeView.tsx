/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Agency, SyncOutboxItem, FieldNote, LeadStage } from '../types';
import { AgencyCompareButton } from './AgencyCompareButton';
import { ZOLL_PRODUCTS } from '../data/zollProducts';
import { hasAgencyFactEvidence } from '../data/agencyFactEvidence';
import { PULSE_IQ_ESTIMATE_LABEL } from './PulseIqEstimateLabel';
import { 
  Car, 
  Phone, 
  MapPin, 
  Navigation, 
  ChevronDown,
  Wifi, 
  WifiOff, 
  Clock, 
  CheckCircle2, 
  Send, 
  ExternalLink, 
  Sparkles, 
  FileText,
  ChevronRight,
  ShieldAlert,
  Award,
  RefreshCw,
  Download,
  Printer
} from 'lucide-react';
import { DataLabel } from './DataLabel';

interface FieldModeViewProps {
  agencies: Agency[];
  onSelectAgency: (agency: Agency) => void;
  onAddFieldNote: (agencyId: string, note: Omit<FieldNote, 'id'>) => void;
  onUpdateStage: (agencyId: string, stage: LeadStage) => void;
  isOnline: boolean;
  toggleNetwork: () => void;
  outbox: SyncOutboxItem[];
  triggerManualSync: () => void;
  isSyncing: boolean;
  activeAccount?: Agency | null;
  globalState?: string;
  globalCounty?: string;
  globalCity?: string;
  globalCategory?: 'all' | 'ems' | 'fire';
  onNavigateTab?: (tab: string) => void;
  comparedAgencyIds?: string[];
  onToggleAgencyComparison?: (agency: Agency) => void;
}

export const FieldModeView: React.FC<FieldModeViewProps> = ({
  agencies,
  onSelectAgency,
  onAddFieldNote,
  onUpdateStage,
  isOnline,
  toggleNetwork,
  outbox,
  triggerManualSync,
  isSyncing,
  activeAccount,
  onNavigateTab,
  comparedAgencyIds = [],
  onToggleAgencyComparison
}) => {
  const [quickNoteAgencyId, setQuickNoteAgencyId] = useState<string | null>(null);
  const [quickNoteText, setQuickNoteText] = useState('');
  const [quickAction, setQuickAction] = useState('Follow up with Chief next week');
  const [activeBattlecard, setActiveBattlecard] = useState<string>('x-series-advanced');

  const dayRouteAgencies = agencies.filter(a => a.inDayRoute);

  const googleMapsMultiStopUrl = dayRouteAgencies.length > 0
    ? `https://www.google.com/maps/dir/${dayRouteAgencies.map(a => encodeURIComponent(`${a.name}, ${a.address}`)).join('/')}`
    : '';

  const handleExportRouteCsv = () => {
    const targetList = dayRouteAgencies.length > 0 ? dayRouteAgencies : agencies.slice(0, 50);
    const headers = [
      'Stop #',
      'Department Name',
      'Category',
      'Verified Street Address',
      'City',
      'County',
      'State',
      'ZIP Code',
      'Verified Command Official',
      'Title',
      'Official Website',
      'Google Maps Link',
      'Verified Defib Brand',
      'Verified Defib Units',
      `${PULSE_IQ_ESTIMATE_LABEL} (0–100)`
    ];
    const rows = targetList.map((a, idx) => {
      const chief = hasAgencyFactEvidence(a, 'agencyLeadership')
        ? a.keyContacts.find(c => c.role.includes('Chief')) || a.keyContacts[0]
        : undefined;
      const verifiedAddress = hasAgencyFactEvidence(a, 'providerAddress') ? a.address : '';
      const mapsLink = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(verifiedAddress || `${a.name}, ${a.city}, ${a.stateCode}`)}`;
      const hasVerifiedDefibFleet = hasAgencyFactEvidence(a, 'defibrillatorBiomedicalFleet');
      return [
        idx + 1,
        `"${(a.name || '').replace(/"/g, '""')}"`,
        a.providerCategory || (a.agencyType.toLowerCase().includes('fire') ? 'FIRE' : 'EMS'),
         `"${verifiedAddress.replace(/"/g, '""')}"`,
        `"${(a.city || '').replace(/"/g, '""')}"`,
        `"${(a.county || '').replace(/"/g, '""')}"`,
        a.stateCode,
        a.zipCode,
        `"${(chief?.name || '').replace(/"/g, '""')}"`,
        `"${(chief?.title || '').replace(/"/g, '""')}"`,
        `"${(a.officialWebsite || '').replace(/"/g, '""')}"`,
        `"${mapsLink.replace(/"/g, '""')}"`,
         `"${(hasVerifiedDefibFleet ? a.installedFleet.defibBrand : '').replace(/"/g, '""')}"`,
         hasVerifiedDefibFleet ? a.installedFleet.defibUnitsCount : '',
          a.zollOpportunity.pulseIqScore
      ].join(',');
    });
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `territory-route-call-sheet-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleQuickLog = (agencyId: string) => {
    if (!quickNoteText.trim()) return;

    onAddFieldNote(agencyId, {
      date: new Date().toISOString().split('T')[0],
      repName: 'Territory Account Manager',
      meetingType: 'On-Site Station Visit',
      notes: quickNoteText.trim(),
      nextAction: quickAction,
      dueDate: '2026-10-28'
    });

    setQuickNoteText('');
    setQuickNoteAgencyId(null);
  };

  return (
    <div className="workspace-section-grid field-work-workspace field-routes-workspace" data-testid="workspace-field-routes">
      
      {/* Tactical Status & Network State Banner */}
      <div className={`p-4 sm:p-5 rounded-2xl border grid grid-cols-1 sm:grid-cols-[1fr_auto] items-start sm:items-center justify-between gap-4 shadow-[0_1px_3px_rgba(15,23,42,0.03)] min-w-0 ${
        isOnline 
          ? 'bg-white dark:bg-slate-900 border-slate-200/90 dark:border-slate-800' 
          : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            isOnline ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800' : 'bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700'
          }`}>
            {isOnline ? <Wifi className="w-5 h-5 text-emerald-600 dark:text-emerald-400" /> : <WifiOff className="w-5 h-5 text-amber-600 dark:text-amber-400" />}
          </div>

          <div>
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Field connectivity status
            </div>
            <div className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <span>{isOnline ? 'Cloud synchronized' : 'Offline field cache active'}</span>
              <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${
                isOnline ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800' : 'bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700'
              }`}>
                {isOnline ? 'Live sync' : 'Offline'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {isOnline 
                ? 'All field changes (visit notes, stage updates, day routes) sync directly to central records.' 
                : 'Full account data and playbooks remain available. Outbox transactions will auto-sync upon reconnection.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          {outbox.length > 0 && (
            <button
              onClick={triggerManualSync}
              disabled={isSyncing || !isOnline}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-medium bg-sky-600 text-white hover:bg-sky-700 transition-colors flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>Sync {outbox.length} pending records</span>
            </button>
          )}
        </div>
      </div>

      {/* Today's Route Stops */}
      <div
        id="field-route-sheet"
        className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 sm:p-6 shadow-[0_1px_3px_rgba(15,23,42,0.03)] min-w-0"
      >
        <div className="grid grid-cols-1 xl:grid-cols-[1fr_auto] items-start xl:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4 min-w-0">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Car className="w-4 h-4 text-[#1E3A8A] dark:text-blue-400" />
              <span>Today's field route itinerary</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Optimized station sequence with verified addresses, navigation links, and rapid post-visit logging.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {dayRouteAgencies.length > 0 && (
              <a
                href={googleMapsMultiStopUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="field-route-launch-link min-h-[36px] px-3.5 py-1.5 rounded-lg text-xs font-medium bg-[var(--pi-action)] text-white hover:bg-[var(--pi-action-hover)] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                title="Open turn-by-turn multi-stop route in Google Maps"
              >
                <Navigation className="w-3.5 h-3.5" />
                <span>Launch Google Maps route</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}

            <details className="relative shrink-0">
              <summary
                aria-label="More route actions"
                className="list-none min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-medium bg-[var(--pi-surface-bg)] hover:bg-[var(--pi-surface-subtle)] text-[var(--pi-text-secondary)] border border-[var(--pi-border)] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pi-action)]"
              >
                <span>More actions</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </summary>
              <div className="absolute right-0 top-full z-40 mt-2 w-56 rounded-xl border border-[var(--pi-border)] bg-[var(--pi-surface-elevated)] p-1.5 shadow-lg">
                <button
                  type="button"
                  onClick={(event) => {
                    event.currentTarget.closest('details')?.removeAttribute('open');
                    handleExportRouteCsv();
                  }}
                  className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs font-medium text-[var(--pi-text-secondary)] hover:bg-[var(--pi-surface-subtle)] cursor-pointer"
                  title="Download CSV Territory Call Sheet"
                >
                  <Download className="w-3.5 h-3.5 text-[var(--pi-action-ink)]" />
                  <span>Export call sheet (CSV)</span>
                </button>
                <button
                  type="button"
                  onClick={(event) => {
                    event.currentTarget.closest('details')?.removeAttribute('open');
                    window.print();
                  }}
                  className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs font-medium text-[var(--pi-text-secondary)] hover:bg-[var(--pi-surface-subtle)] cursor-pointer"
                  title="Print Territory Route Call Sheet"
                >
                  <Printer className="w-3.5 h-3.5 text-[var(--pi-action-ink)]" />
                  <span>Print sheet</span>
                </button>
                {onNavigateTab && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.currentTarget.closest('details')?.removeAttribute('open');
                      onNavigateTab('3d_studio');
                    }}
                    className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 text-left text-xs font-medium text-[var(--pi-text-secondary)] hover:bg-[var(--pi-surface-subtle)] cursor-pointer"
                    title="Launch Interactive 3D Apparatus & Monitor Studio"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <span>3D equipment demo</span>
                  </button>
                )}
              </div>
            </details>

            <div className="text-xs font-medium text-[var(--pi-text-secondary)] bg-[var(--pi-surface-subtle)] border border-[var(--pi-border)] px-3 py-1.5 rounded-lg whitespace-nowrap shrink-0 pi-data-inline">
              <DataLabel kind="visit"><strong className="pi-data-number font-semibold">{dayRouteAgencies.length}</strong> stops planned</DataLabel>
            </div>
          </div>
        </div>

        {dayRouteAgencies.length > 0 ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 mt-2">
            {dayRouteAgencies.map((agency, index) => {
              const isLogging = quickNoteAgencyId === agency.id;
              const chief = agency.keyContacts.find(c => c.role.includes('Chief')) || agency.keyContacts[0];

              return (
                <div key={agency.id} className="field-route-stop py-4 first:pt-3 last:pb-1">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-xl bg-slate-900 dark:bg-blue-600 text-white font-medium text-xs flex items-center justify-center shrink-0 shadow-sm tabular-nums">
                        #{index + 1}
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-slate-900 dark:text-white text-sm">
                            {agency.name}
                          </h3>
                          <span className="field-route-score text-xs font-medium text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 px-2 py-0.5 rounded-md tabular-nums">
                            <DataLabel kind="score">Score</DataLabel> {agency.zollOpportunity.pulseIqScore}/100
                          </span>
                        </div>

                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-2">
                          <span><DataLabel kind="location">{agency.address}</DataLabel></span>
                          <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">&middot;</span>
                          <span><DataLabel kind="equipment">Target:</DataLabel> <strong className="text-slate-800 dark:text-slate-200 font-medium">{agency.zollOpportunity.primaryTargetProduct}</strong></span>
                        </div>

                        {chief && (
                          <div className="text-xs text-slate-600 dark:text-slate-300 mt-1 flex flex-wrap items-center gap-3">
                            <span className="font-semibold text-slate-800 dark:text-slate-100"><DataLabel kind="contact">{chief.name} ({chief.title})</DataLabel></span>
                            <a
                              href={agency.googleMapsUri || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${agency.name}, ${agency.address}`)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[var(--pi-action-ink)] hover:text-[var(--pi-action)] font-semibold inline-flex items-center gap-1"
                            >
                              <MapPin className="w-3 h-3 text-sky-600 dark:text-sky-400" />
                              <span>Google Maps Lookup</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      {onToggleAgencyComparison && (
                        <AgencyCompareButton
                          agency={agency}
                          selected={comparedAgencyIds.includes(agency.id)}
                          limitReached={comparedAgencyIds.length >= 3}
                          onToggle={onToggleAgencyComparison}
                        />
                      )}
                      <button
                        onClick={() => setQuickNoteAgencyId(isLogging ? null : agency.id)}
                        className={`min-h-[36px] px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-all cursor-pointer ${
                          isLogging 
                            ? 'bg-sky-600 text-white border-sky-600 shadow-sm' 
                            : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-sm'
                        }`}
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>{isLogging ? 'Close Log' : 'Quick Log'}</span>
                      </button>

                      <button
                        onClick={() => onSelectAgency(agency)}
                        title={`Open agency profile for ${agency.name}`}
                        className="min-h-[36px] px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-[var(--pi-action)] text-white hover:bg-[var(--pi-action-hover)] transition-colors shadow-sm cursor-pointer"
                      >
                        Open agency profile
                      </button>
                    </div>
                  </div>

                  {/* Inline Quick Visit Form */}
                  {isLogging && (
                    <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl space-y-3">
                      <div className="text-xs font-semibold text-slate-900 dark:text-white">
                        Rapid post-visit log for {agency.name}
                      </div>

                      <textarea
                        rows={2}
                        value={quickNoteText}
                        onChange={(e) => setQuickNoteText(e.target.value)}
                        placeholder="Chief confirmed interest in Real BVM Help evaluation. Left product specification sheets..."
                        className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:border-sky-500 shadow-sm"
                      />

                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                        <input
                          type="text"
                          value={quickAction}
                          onChange={(e) => setQuickAction(e.target.value)}
                          placeholder="Next action..."
                          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-2 text-xs text-slate-800 dark:text-slate-100 flex-1 focus:outline-none focus:border-sky-500 shadow-sm"
                        />

                        <button
                          onClick={() => handleQuickLog(agency.id)}
                          className="min-h-[38px] px-5 py-2 bg-sky-600 hover:bg-sky-700 text-white font-medium text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors shrink-0 shadow-sm cursor-pointer"
                        >
                          <Send className="w-3.5 h-3.5" />
                          <span>Save &amp; queue sync</span>
                        </button>
                      </div>
                    </div>
                  )}

                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-10 text-slate-400 text-xs">
            <Car className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
            <h3 className="text-slate-800 dark:text-slate-200 font-semibold text-sm">No agencies scheduled for today's route</h3>
            <p className="text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
              Select agencies from the accounts list to add them to your itinerary.
            </p>
          </div>
        )}
      </div>

      {/* Field Battlecards Cheat Sheet */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-6 shadow-[0_1px_3px_rgba(15,23,42,0.03)]">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white mb-1">
          Field clinical &amp; financial battlecards
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Key clinical talking points, competitor displacement differentiators, and CMS billing considerations.
        </p>

        {/* Product Selector */}
        <div className="flex flex-wrap gap-2 mb-4">
          {Object.values(ZOLL_PRODUCTS).map((p) => (
            <button
              key={p.id}
              onClick={() => setActiveBattlecard(p.id)}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-xl text-xs font-medium transition-all border cursor-pointer ${
                activeBattlecard === p.id 
                  ? 'bg-sky-600 text-white border-sky-600 shadow-sm shadow-sky-600/20' 
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
              }`}
            >
              {p.name.split(' ')[0]} {p.name.split(' ')[1]}
            </button>
          ))}
        </div>

        {/* Battlecard Card */}
        {ZOLL_PRODUCTS[activeBattlecard] && (
          <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-5 space-y-4">
            <div>
              <div className="text-xs text-sky-700 dark:text-sky-400 font-medium">
                {ZOLL_PRODUCTS[activeBattlecard].category}
              </div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white mt-0.5">
                {ZOLL_PRODUCTS[activeBattlecard].name}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 italic">
                "{ZOLL_PRODUCTS[activeBattlecard].tagline}"
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                <div className="font-semibold text-sky-900 dark:text-sky-300 mb-2 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                  <span>Clinical &amp; technical differentiators</span>
                </div>
                <ul className="space-y-1.5 text-slate-600 dark:text-slate-300">
                  {ZOLL_PRODUCTS[activeBattlecard].keyDifferentiators.map((diff, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="text-sky-600 dark:text-sky-400 font-semibold">&bull;</span>
                      <span>{diff}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
                <div className="font-semibold text-slate-900 dark:text-white mb-2 flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>Competitor displacement &amp; CMS reimbursement</span>
                </div>
                <div className="space-y-2 text-slate-600 dark:text-slate-300">
                  <div>
                    <span className="text-slate-400 text-xs block font-medium"><DataLabel kind="contract">Displaces competitors:</DataLabel></span>
                    <span className="text-rose-700 dark:text-rose-400 font-medium">
                      {ZOLL_PRODUCTS[activeBattlecard].displacementTargets.join(', ')}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-xs block font-medium"><DataLabel kind="claims">CMS reimbursement impact:</DataLabel></span>
                    <span className="text-slate-700 dark:text-slate-200 font-normal">
                      {ZOLL_PRODUCTS[activeBattlecard].cmsBenefit}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Field Route Sheet Print Styling */}
      <style>{`
        @media print {
          @page {
            size: auto;
            margin: 12mm;
          }

          .pi-app-shell > :not(.pi-workspace-body),
          .pi-workspace-body > :not(.workspace-grid-shell),
          .workspace-grid-shell > :not(.workspace-view-container),
          .workspace-view-container > :not(.workspace-section-grid),
          .workspace-section-grid > :not(#field-route-sheet) {
            display: none !important;
          }

          body {
            background: #ffffff !important;
            color: #111827 !important;
            color-scheme: light !important;
            width: auto !important;
            min-height: 0 !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
          }

          .pi-app-shell,
          .pi-workspace-body,
          .workspace-grid-shell,
          .workspace-view-container,
          .workspace-section-grid {
            display: block !important;
            width: 100% !important;
            max-width: none !important;
            min-height: 0 !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
            background: #ffffff !important;
          }

          #field-route-sheet {
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            border: 0 !important;
            border-radius: 0 !important;
            background: #ffffff !important;
            color: #111827 !important;
            box-shadow: none !important;
            font-size: 9pt !important;
            line-height: 1.35 !important;
          }

          #field-route-sheet * {
            color: #334155 !important;
            border-color: #cbd5e1 !important;
            box-shadow: none !important;
          }

          #field-route-sheet h2,
          #field-route-sheet h3,
          #field-route-sheet strong {
            color: #111827 !important;
          }

          #field-route-sheet :not(.field-route-score) {
            background-color: transparent !important;
          }

          #field-route-sheet .field-route-score {
            color: #1e40af !important;
            background: #dbeafe !important;
            border: 1px solid #93c5fd !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }

          #field-route-sheet a {
            color: #1d4ed8 !important;
            background-color: transparent !important;
            border-color: transparent !important;
            text-decoration: underline !important;
            overflow-wrap: anywhere !important;
          }

          #field-route-sheet h2 {
            break-after: avoid;
            page-break-after: avoid;
          }

          #field-route-sheet .field-route-stop {
            break-inside: avoid;
            page-break-inside: avoid;
          }

          #field-route-sheet .divide-y > :not([hidden]) ~ :not([hidden]) {
            border-top: 1px solid #cbd5e1 !important;
          }

          #field-route-sheet .no-print,
          #field-route-sheet details,
          #field-route-sheet button,
          #field-route-sheet .field-route-launch-link {
            display: none !important;
          }
        }
      `}</style>
    </div>
  );
};
