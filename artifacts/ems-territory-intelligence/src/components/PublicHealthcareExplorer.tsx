/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from 'react';
import { NATIONAL_BENCHMARKS, STATE_SUMMARIES } from '../data/healthcareData';
import { Agency } from '../types';
import { hasAgencyFactEvidence } from '../data/agencyFactEvidence';
import { getStateZipDenialProfileSummary } from '../services/countyDenialProfileService';
import { MedicareDenialImportPanel } from './MedicareDenialImportPanel';
import {
  getImportedProviderDenialMetric,
  MEDICARE_DENIAL_IMPORT_EVENT,
} from '../services/medicareDenialImportService';
import { getAgencyMedicareDenialMetric } from '../services/agencyMedicareDenialService';
import { 
  Building2, 
  TrendingDown, 
  Award, 
  FileCheck2, 
  Activity, 
  ShieldCheck, 
  BookOpen, 
  ChevronRight,
  Database,
  ArrowRight,
  Search,
  Scale,
  DollarSign,
  AlertTriangle,
  Flame,
  Siren
} from 'lucide-react';
interface PublicHealthcareExplorerProps {
  agencies?: Agency[];
  onSelectStateFilter: (stateCode: string) => void;
  onNavigateToQueue: () => void;
  globalState?: string;
  globalCounty?: string;
  globalCity?: string;
  globalCategory?: 'all' | 'ems' | 'fire';
  activeAccount?: Agency | null;
}

export const PublicHealthcareExplorer: React.FC<PublicHealthcareExplorerProps> = ({
  agencies = [],
  onSelectStateFilter,
  onNavigateToQueue,
  activeAccount
}) => {
  const [selectedPlaybook, setSelectedPlaybook] = useState<'cms' | 'rosc' | 'fleet' | 'afg' | 'nemsqa' | 'et3'>('cms');
  const [denialImportRevision, setDenialImportRevision] = useState(0);
  useEffect(() => {
    const refreshImportedDenials = () => setDenialImportRevision((revision) => revision + 1);
    window.addEventListener(MEDICARE_DENIAL_IMPORT_EVENT, refreshImportedDenials);
    return () => window.removeEventListener(MEDICARE_DENIAL_IMPORT_EVENT, refreshImportedDenials);
  }, []);
  const localDenialMetric = useMemo(
    () => getImportedProviderDenialMetric(activeAccount?.npiNumber),
    [activeAccount?.npiNumber, denialImportRevision],
  );
  const sourceDenialMetric = useMemo(
    () => activeAccount ? getAgencyMedicareDenialMetric(activeAccount) : null,
    [activeAccount],
  );
  const hasDecisionGradeInputs = activeAccount &&
    hasAgencyFactEvidence(activeAccount, 'frontlineApparatusStations') &&
    hasAgencyFactEvidence(activeAccount, 'annualEmergencyVolume') &&
    hasAgencyFactEvidence(activeAccount, 'clinicalOutcomes') &&
    hasAgencyFactEvidence(activeAccount, 'defibrillatorBiomedicalFleet') &&
    hasAgencyFactEvidence(activeAccount, 'maintenanceContracts') &&
    hasAgencyFactEvidence(activeAccount, 'cmsClaims') &&
    hasAgencyFactEvidence(activeAccount, 'federalGrant');

  return (
    <div className="space-y-6">

      {/* Active Account Clinical Telemetry Banner when an account is selected */}
      {activeAccount && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-slate-900 dark:text-white shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-colors">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm shrink-0 border ${
              activeAccount.providerCategory === 'FIRE' || activeAccount.agencyType.toLowerCase().includes('fire')
                ? 'bg-rose-50 dark:bg-rose-950/80 border-rose-200 dark:border-rose-700 text-rose-700 dark:text-rose-300'
                : 'bg-sky-50 dark:bg-sky-950/80 border-sky-200 dark:border-sky-700 text-sky-700 dark:text-sky-300'
            }`}>
              {activeAccount.providerCategory === 'FIRE' || activeAccount.agencyType.toLowerCase().includes('fire') ? <Flame className="w-5 h-5" /> : <Siren className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/80">
                  Selected agency record · source status shown
                </span>
                <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">NPI: {activeAccount.npiNumber || 'Unassigned'}</span>
              </div>
              <h2 className="text-sm sm:text-base font-semibold text-slate-900 dark:text-white tracking-tight mt-0.5">
                {activeAccount.name} — {activeAccount.city}, {activeAccount.stateCode}
              </h2>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs">
              <div className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 px-3 py-1.5 rounded-lg">
                <span className="text-slate-500 dark:text-slate-400 block text-[11px] font-medium">Agency Medicare denial rate</span>
                <span className="text-amber-700 dark:text-amber-400 font-semibold tabular-nums text-sm">
                  {localDenialMetric
                    ? `${localDenialMetric.ratePct?.toFixed(1) ?? '—'}% · local import`
                    : sourceDenialMetric
                      ? `${sourceDenialMetric.ratePct.toFixed(1)}% · source-backed`
                      : 'Not published'}
                </span>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 px-3 py-1.5 rounded-lg">
                <span className="text-slate-500 dark:text-slate-400 block text-[11px] font-medium">
                  {hasAgencyFactEvidence(activeAccount, 'annualEmergencyVolume') ? 'Annual EMS transports' : 'Reported Fire Rescue calls'}
                </span>
                <span className="text-slate-900 dark:text-white font-semibold tabular-nums text-sm">
                  {hasAgencyFactEvidence(activeAccount, 'annualEmergencyVolume')
                    ? activeAccount.annual911Transports.toLocaleString()
                    : hasAgencyFactEvidence(activeAccount, 'annualCallsReceived')
                      ? `${activeAccount.annualCallVolume.toLocaleString()} · ${activeAccount.factEvidence?.annualCallsReceived?.reportingPeriod || 'reported period'}`
                      : 'Not source-verified'}
                </span>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 px-3 py-1.5 rounded-lg">
              <span className="text-slate-500 dark:text-slate-400 block text-[11px] font-medium">Primary Insurer</span>
                <span className="text-sky-700 dark:text-sky-300 font-semibold text-sm">
                  {hasAgencyFactEvidence(activeAccount, 'cmsClaims')
                    ? activeAccount.cmsData.primaryPayerMix || (activeAccount.cmsData.medicareBilledAnnual > activeAccount.cmsData.medicaidBilledAnnual ? 'Medicare FFS' : 'Commercial')
                    : 'Not source-verified'}
                </span>
            </div>
            <div className="bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-800/80 px-3 py-1.5 rounded-lg">
                <span className="text-emerald-700 dark:text-emerald-300 block text-[11px] font-medium">Opportunity model</span>
                <span className="text-emerald-800 dark:text-emerald-400 font-semibold tabular-nums text-sm">
                  {hasDecisionGradeInputs
                    ? `$${(activeAccount.zollOpportunity.estimatedDealValue ?? activeAccount.zollOpportunity.projectedPipelineValue).toLocaleString()}`
                    : 'Not calculated'}
                </span>
            </div>
          </div>
        </div>
      )}

      <MedicareDenialImportPanel agencies={agencies} />

      {/* Strategic Consultant Executive Briefing */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 shadow-[0_1px_3px_rgba(15,23,42,0.03)]">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div>
            <div className="text-xs text-sky-700 dark:text-sky-400 font-semibold flex items-center gap-2">
              <Database className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              <span>Strategic consultant &amp; business analyst intelligence</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-[650] text-slate-900 dark:text-white mt-1 tracking-tight">
              Public healthcare, CMS claims &amp; EMS outcomes engine
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 max-w-3xl leading-relaxed">
              Reference playbooks for reviewing public datasets. Agency-specific claims, outcomes, fleet, and grant figures require a current primary source before they are used in outreach.
            </p>
          </div>

          <div className="bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800 p-4 rounded-xl shrink-0 text-right">
            <div className="text-[11px] text-sky-800 dark:text-sky-300 font-medium">National market estimate</div>
            <div className="text-sm font-semibold text-sky-950 dark:text-white mt-0.5">Reference value not source-verified</div>
            <div className="text-[11px] text-sky-700 dark:text-sky-400 mt-0.5">Do not use as an audited market total</div>
          </div>
        </div>

        {/* National Macro Benchmarks */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-slate-200 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden mt-6">
          <div className="bg-slate-50/70 dark:bg-slate-900 p-4">
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">National ambulance improper-payment rate</div>
            <div className="text-xl font-[650] text-rose-700 dark:text-rose-400 tabular-nums mt-1">
              {NATIONAL_BENCHMARKS.nationalAmbulanceImproperPaymentRate}%
            </div>
            <a
              className="text-[11px] text-blue-700 dark:text-blue-400 underline underline-offset-2 mt-0.5 inline-block"
              href="https://www.cms.gov/training-education/medicare-learning-networkr-mln/compliance/medicare-provider-compliance-tips/ambulance-services"
              target="_blank"
              rel="noreferrer"
            >
              CMS 2024 national measure; not a county denial rate
            </a>
          </div>

          <div className="bg-slate-50/70 dark:bg-slate-900 p-4">
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">CARES cardiac survival (Utstein)</div>
            <div className="text-xl font-[650] text-emerald-700 dark:text-emerald-400 tabular-nums mt-1">
              {NATIONAL_BENCHMARKS.averageUtsteinSurvivalRate}%
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Agencies &lt;25% need AutoPulse + Real BVM</div>
          </div>

          <div className="bg-slate-50/70 dark:bg-slate-900 p-4">
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Annual 911 ambulance runs</div>
            <div className="text-xl font-[650] text-slate-900 dark:text-white tabular-nums mt-1">
              {(NATIONAL_BENCHMARKS.totalAmbulanceTransports / 1000000).toFixed(1)}M
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Across 21,450 registered agencies</div>
          </div>

          <div className="bg-slate-50/70 dark:bg-slate-900 p-4">
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Annual federal AFG allocations</div>
            <div className="text-xl font-[650] text-sky-700 dark:text-sky-400 tabular-nums mt-1">
              ${(NATIONAL_BENCHMARKS.totalAfgFundingAllocated / 1000000).toFixed(0)}M
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Direct capital grants for EMS &amp; Fire</div>
          </div>
        </div>
      </div>

      {/* State-by-State Public Data Intelligence */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 shadow-[0_1px_3px_rgba(15,23,42,0.03)]">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">State-by-state healthcare &amp; reimbursement comparison</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Select any state to instantly filter and populate territory pipeline opportunities.
            </p>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            8 Benchmark states
          </span>
        </div>

        <div className="overflow-x-auto mt-4">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 dark:bg-slate-800/70 text-slate-600 dark:text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700">
                <th className="py-2.5 px-3">State / Jurisdiction</th>
                <th className="py-2.5 px-3 text-right">Registered Agencies</th>
                <th className="py-2.5 px-3 text-right">State ZIP-profile average</th>
                <th className="py-2.5 px-3 text-right">Cardiac Survival (Utstein)</th>
                <th className="py-2.5 px-3 text-right">YTD AFG Grant Awards</th>
                <th className="py-2.5 px-3 text-center">Medicaid Expansion</th>
                <th className="py-2.5 px-3 text-right">High-Value Leads</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {Object.values(STATE_SUMMARIES).map((summary) => (
                <tr key={summary.code} className="hover:bg-sky-50/30 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="py-3 px-3 font-semibold text-slate-900 dark:text-white">
                    {summary.state} ({summary.code})
                  </td>
                  <td className="py-3 px-3 text-right text-slate-700 dark:text-slate-300 tabular-nums">
                    {summary.totalAgencies.toLocaleString()}
                  </td>
                  <td className="py-3 px-3 text-right text-slate-500 dark:text-slate-400">
                    {(() => {
                      const denialProfile = getStateZipDenialProfileSummary(summary.code);
                      if (!denialProfile) return 'Not published';
                      return (
                        <div className="space-y-1">
                          <div className="font-semibold tabular-nums">{denialProfile.ratePct.toFixed(1)}%</div>
                          <div className="text-[10px]" title={denialProfile.claimScope}>
                            {denialProfile.reportingPeriod} · {denialProfile.claimScope}
                          </div>
                          <div className="flex flex-wrap justify-end gap-x-2">
                            {denialProfile.sources.map((source) => (
                              <a
                                key={source.zipCode}
                                href={source.sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[10px] text-blue-700 dark:text-blue-300 underline underline-offset-2"
                              >
                                ZIP {source.zipCode}
                              </a>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </td>
                  <td className={`py-3 px-3 text-right tabular-nums ${
                    summary.avgUtsteinSurvival < 28 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'
                  }`}>
                    {summary.avgUtsteinSurvival}%
                  </td>
                  <td className="py-3 px-3 text-right text-sky-800 dark:text-sky-400 font-semibold tabular-nums">
                    ${(summary.totalAfgAwardsYtd / 1000000).toFixed(1)}M
                  </td>
                  <td className="py-3 px-3 text-center text-xs">
                    {summary.medicaidExpansion ? (
                      <span className="text-emerald-700 dark:text-emerald-400 font-medium">Expanded</span>
                    ) : (
                      <span className="text-slate-500 dark:text-slate-400">Non-Expanded</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-right font-semibold text-amber-800 dark:text-amber-400 tabular-nums">
                    {summary.highPriorityLeadsCount} accounts
                  </td>
                  <td className="py-3 px-3 text-right">
                    <button
                      onClick={() => {
                        onSelectStateFilter(summary.code);
                        onNavigateToQueue();
                      }}
                      className="text-sky-700 dark:text-sky-400 hover:text-sky-900 dark:hover:text-sky-300 font-medium text-xs flex items-center gap-1 justify-end ml-auto cursor-pointer"
                    >
                      <span>Filter Queue</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Strategic Territory Consultant Playbooks */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-6 shadow-[0_1px_3px_rgba(15,23,42,0.03)]">
        <h2 className="text-base font-bold text-slate-900 dark:text-white mb-1">
          Territory Manager Public Data Strategic Selling Playbooks
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Select a clinical or financial playbook to review the consultative positioning and sales soundbites.
        </p>

        {/* Playbook Tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-4">
          <button
            onClick={() => setSelectedPlaybook('cms')}
            className={`p-3 rounded-xl text-left border transition-all text-xs cursor-pointer ${
              selectedPlaybook === 'cms'
                ? 'bg-sky-50 dark:bg-sky-950/60 border-sky-300 dark:border-sky-700 text-sky-900 dark:text-sky-200 font-semibold shadow-sm'
                : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <div className="font-bold flex items-center gap-1.5">
              <TrendingDown className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
              <span>1. CMS Denials</span>
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">ZOLL Billing & AR Boost</div>
          </button>

          <button
            onClick={() => setSelectedPlaybook('rosc')}
            className={`p-3 rounded-xl text-left border transition-all text-xs cursor-pointer ${
              selectedPlaybook === 'rosc'
                ? 'bg-sky-50 dark:bg-sky-950/60 border-sky-300 dark:border-sky-700 text-sky-900 dark:text-sky-200 font-semibold shadow-sm'
                : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <div className="font-bold flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
              <span>2. Cardiac ROSC</span>
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">AutoPulse + Real BVM</div>
          </button>

          <button
            onClick={() => setSelectedPlaybook('fleet')}
            className={`p-3 rounded-xl text-left border transition-all text-xs cursor-pointer ${
              selectedPlaybook === 'fleet'
                ? 'bg-sky-50 dark:bg-sky-950/60 border-sky-300 dark:border-sky-700 text-sky-900 dark:text-sky-200 font-semibold shadow-sm'
                : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <div className="font-bold flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>3. Aging Rivals</span>
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">LP15 & Philips MRx EOL</div>
          </button>

          <button
            onClick={() => setSelectedPlaybook('afg')}
            className={`p-3 rounded-xl text-left border transition-all text-xs cursor-pointer ${
              selectedPlaybook === 'afg'
                ? 'bg-sky-50 dark:bg-sky-950/60 border-sky-300 dark:border-sky-700 text-sky-900 dark:text-sky-200 font-semibold shadow-sm'
                : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <div className="font-bold flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>4. Federal AFG</span>
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Direct Grant Spend</div>
          </button>

          <button
            onClick={() => setSelectedPlaybook('nemsqa')}
            className={`p-3 rounded-xl text-left border transition-all text-xs cursor-pointer ${
              selectedPlaybook === 'nemsqa'
                ? 'bg-sky-50 dark:bg-sky-950/60 border-sky-300 dark:border-sky-700 text-sky-900 dark:text-sky-200 font-semibold shadow-sm'
                : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <div className="font-bold flex items-center gap-1.5">
              <FileCheck2 className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
              <span>5. NEMSQA Quality</span>
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">AHA Gold Plus Criteria</div>
          </button>

          <button
            onClick={() => setSelectedPlaybook('et3')}
            className={`p-3 rounded-xl text-left border transition-all text-xs cursor-pointer ${
              selectedPlaybook === 'et3'
                ? 'bg-sky-50 dark:bg-sky-950/60 border-sky-300 dark:border-sky-700 text-sky-900 dark:text-sky-200 font-semibold shadow-sm'
                : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <div className="font-bold flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>6. ET3 & MIH</span>
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Wall Time Reduction</div>
          </button>
        </div>

        {/* Selected Playbook Content */}
        <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200/90 dark:border-slate-700 rounded-xl p-5 text-xs text-slate-700 dark:text-slate-300 leading-relaxed space-y-3">
          {selectedPlaybook === 'cms' && (
            <>
              <div className="font-semibold text-slate-900 dark:text-white text-sm">
                Playbook 1: The CMS Medicare Ground Ambulance Reimbursement Play
              </div>
              <p>
                <strong>Source check:</strong> Use agency-specific CMS claims only when the reporting period, provider identity, and claim measure are documented. Do not assume denial rates or penalties from national averages.
              </p>
              <p>
                <strong>Discussion:</strong> If an agency-specific claims review identifies a billing workflow issue, compare vendor capabilities, costs, compliance responsibilities, and expected outcomes with finance and procurement.
              </p>
              <div className="p-3.5 bg-blue-50/60 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-900/60 rounded-xl text-blue-950 dark:text-blue-200 text-xs leading-relaxed">
                <span className="font-semibold text-blue-900 dark:text-blue-300 block mb-1">Consultative soundbite:</span>
                &ldquo;Before we discuss potential savings, can we review a source-backed claims baseline and confirm the reporting period with your finance team?&rdquo;
              </div>
            </>
          )}

          {selectedPlaybook === 'rosc' && (
            <>
              <div className="font-semibold text-slate-900 dark:text-white text-sm">
                Playbook 2: The Out-of-Hospital Cardiac Arrest (OHCA) Survival Play
              </div>
              <p>
                <strong>Source check:</strong> Confirm the agency’s CARES participation, case definition, reporting period, and comparison benchmark before describing local cardiac-arrest outcomes.
              </p>
              <p>
                <strong>Discussion:</strong> Review protocol, training, and clinical evidence with medical direction. Compare equipment options using the agency’s requirements and independently reviewed evidence; do not infer an outcome improvement.
              </p>
              <div className="p-3.5 bg-blue-50/60 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-900/60 rounded-xl text-blue-950 dark:text-blue-200 text-xs leading-relaxed">
                <span className="font-semibold text-blue-900 dark:text-blue-300 block mb-1">Consultative soundbite:</span>
                &ldquo;Would it be useful to compare the clinical evidence, training requirements, and operational tradeoffs for the available resuscitation options?&rdquo;
              </div>
            </>
          )}

          {selectedPlaybook === 'fleet' && (
            <>
              <div className="font-semibold text-slate-900 dark:text-white text-sm">
                Playbook 3: The Aging Competitor Fleet & Obsolescence Replacement
              </div>
              <p>
                <strong>Source check:</strong> Verify each agency’s actual monitor models, service status, age, and replacement plans from current inventory and procurement records. Do not generalize one agency’s equipment status to another.
              </p>
              <p>
                <strong>Discussion:</strong> Compare requested capabilities, service terms, training, lifecycle costs, and any trade-in offer using current written vendor quotes and the agency’s verified inventory.
              </p>
              <div className="p-3.5 bg-blue-50/60 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-900/60 rounded-xl text-blue-950 dark:text-blue-200 text-xs leading-relaxed">
                <span className="font-semibold text-blue-900 dark:text-blue-300 block mb-1">Consultative soundbite:</span>
                &ldquo;If your current inventory or contract records identify an upcoming replacement need, we can compare written offers against your specifications and service requirements.&rdquo;
              </div>
            </>
          )}

          {selectedPlaybook === 'afg' && (
            <>
              <div className="font-semibold text-slate-900 dark:text-white text-sm">
                Playbook 4: The FEMA Assistance to Firefighters Grant (AFG) Fast-Track
              </div>
              <p>
                <strong>The Public Data Trigger:</strong> FEMA publishes public lists of fire and EMS departments awarded AFG and SAFER grants under the &ldquo;Operations and Safety - EMS Equipment&rdquo; category.
              </p>
              <p>
                <strong>Discussion:</strong> Confirm the award, allowable costs, period of performance, matching requirements, and local procurement rules. Do not promise a grant can be spent immediately or that competition can be bypassed.
              </p>
              <div className="p-3.5 bg-blue-50/60 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-900/60 rounded-xl text-blue-950 dark:text-blue-200 text-xs leading-relaxed">
                <span className="font-semibold text-blue-900 dark:text-blue-300 block mb-1">Consultative soundbite:</span>
                &ldquo;I can share product and pricing information for your team to evaluate against the grant terms and your procurement process.&rdquo;
              </div>
            </>
          )}

          {selectedPlaybook === 'nemsqa' && (
            <>
              <div className="font-semibold text-slate-900 dark:text-white text-sm">
                Playbook 5: NEMSQA Quality Measures & AHA Mission: Lifeline Recognition
              </div>
              <p>
                <strong>Source check:</strong> Validate any quality measure against its original registry, inclusion criteria, and reporting period. Do not infer a quality gap or recognition status from general benchmarks.
              </p>
              <p>
                <strong>Discussion:</strong> Compare device and documentation features with the agency’s clinical, technical, privacy, and procurement requirements; have the agency validate all interoperability and recognition criteria.
              </p>
              <div className="p-3.5 bg-blue-50/60 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-900/60 rounded-xl text-blue-950 dark:text-blue-200 text-xs leading-relaxed">
                <span className="font-semibold text-blue-900 dark:text-blue-300 block mb-1">Consultative soundbite:</span>
                &ldquo;Which quality measures and documentation workflows are priorities for your medical director, and what source would you use to establish a baseline?&rdquo;
              </div>
            </>
          )}

          {selectedPlaybook === 'et3' && (
            <>
              <div className="font-semibold text-slate-900 dark:text-white text-sm">
                Playbook 6: CMS ET3, Hospital Handoff Reduction & Community Paramedicine
              </div>
              <p>
                <strong>Source check:</strong> Confirm current program availability, local protocols, payer rules, destination agreements, and any agency-specific offload-time data before discussing reimbursement or coverage impacts.
              </p>
              <p>
                <strong>Discussion:</strong> Review dispatch, telehealth, and alternative-destination workflows with clinical leadership, receiving facilities, compliance, and procurement. Do not assume eligibility or payment.
              </p>
              <div className="p-3.5 bg-blue-50/60 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-900/60 rounded-xl text-blue-950 dark:text-blue-200 text-xs leading-relaxed">
                <span className="font-semibold text-blue-900 dark:text-blue-300 block mb-1">Consultative soundbite:</span>
                &ldquo;Do you have a current source for transfer-of-care time and a locally approved protocol for alternative destinations? We can review system requirements once those are confirmed.&rdquo;
              </div>
            </>
          )}
        </div>

      </div>

      {/* NEMSQA & CARES National Quality Benchmark Comparison */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 shadow-[0_1px_3px_rgba(15,23,42,0.03)]">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">NEMSQA &amp; CARES national clinical quality standards</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Comparative pre-hospital clinical quality metrics driving resuscitation hardware adoption.
            </p>
          </div>
          <span className="text-xs text-sky-800 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 px-2.5 py-1 rounded-md font-semibold">
            National registry benchmarks
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <div className="bg-slate-50 dark:bg-slate-800/70 p-5 rounded-xl border border-slate-200/80 dark:border-slate-700">
            <div className="text-xs text-slate-600 dark:text-slate-400 font-semibold">STEMI 12-lead acquisition &le;10 min</div>
            <div className="text-2xl font-[650] text-sky-800 dark:text-sky-400 tabular-nums mt-1">
              {NATIONAL_BENCHMARKS.nemsqaStemi12LeadAcquisitionPct}%
            </div>
            <div className="text-[11px] text-slate-400 mt-1">NEMSQA Cardiac-01 Benchmark</div>
            <div className="text-xs text-slate-600 dark:text-slate-300 mt-2.5 leading-relaxed">
              ZOLL cellular telemetry transmits ECG directly to cath lab interventionalists, reducing door-to-balloon times by up to 20 minutes.
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/70 p-5 rounded-xl border border-slate-200/80 dark:border-slate-700">
            <div className="text-xs text-slate-600 dark:text-slate-400 font-semibold">Chest compression fraction (CCF)</div>
            <div className="text-2xl font-[650] text-emerald-800 dark:text-emerald-400 tabular-nums mt-1">
              {NATIONAL_BENCHMARKS.nemsqaChestCompressionFractionPct}%
            </div>
            <div className="text-[11px] text-slate-400 mt-1">Target &ge;80% for Favorable ROSC</div>
            <div className="text-xs text-slate-600 dark:text-slate-300 mt-2.5 leading-relaxed">
              AutoPulse circumferential band eliminates compressions pauses down stairs and during ambulance transport, maintaining 95%+ CCF.
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/70 p-5 rounded-xl border border-slate-200/80 dark:border-slate-700">
            <div className="text-xs text-slate-600 dark:text-slate-400 font-semibold">Favorable cerebral survival (CPC 1/2)</div>
            <div className="text-2xl font-[650] text-slate-900 dark:text-white tabular-nums mt-1">
              {NATIONAL_BENCHMARKS.caresGoodNeurologicalSurvivalPct}%
            </div>
            <div className="text-[11px] text-slate-400 mt-1">CARES Registry Discharge Benchmark</div>
            <div className="text-xs text-slate-600 dark:text-slate-300 mt-2.5 leading-relaxed">
              Real CPR Help and Real BVM Help prevent hyperventilation and maintain optimal cerebral perfusion pressure throughout resuscitation.
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};
