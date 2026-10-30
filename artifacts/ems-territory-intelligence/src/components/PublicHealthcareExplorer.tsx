/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { STATE_SUMMARIES } from '../data/healthcareData';
import { Agency } from '../types';
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
  onSelectStateFilter: (stateCode: string) => void;
  onNavigateToQueue: () => void;
  globalState?: string;
  globalCounty?: string;
  globalCity?: string;
  globalCategory?: 'all' | 'ems' | 'fire';
  activeAccount?: Agency | null;
}

export const PublicHealthcareExplorer: React.FC<PublicHealthcareExplorerProps> = ({
  onSelectStateFilter,
  onNavigateToQueue,
  activeAccount
}) => {
  const [selectedPlaybook, setSelectedPlaybook] = useState<'cms' | 'rosc' | 'fleet' | 'afg' | 'nemsqa' | 'et3'>('cms');

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
                  Profile metrics · unverified estimates
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
              <span className="text-slate-500 dark:text-slate-400 block text-[11px] font-medium">Denial rate · estimate</span>
              <span className="text-amber-700 dark:text-amber-400 font-semibold tabular-nums text-sm">{activeAccount.cmsData.claimDenialRate}% · not CMS verified</span>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 px-3 py-1.5 rounded-lg">
              <span className="text-slate-500 dark:text-slate-400 block text-[11px] font-medium">Annual transports · estimate</span>
              <span className="text-slate-900 dark:text-white font-semibold tabular-nums text-sm">{activeAccount.annual911Transports.toLocaleString()} · unverified</span>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/80 px-3 py-1.5 rounded-lg">
              <span className="text-slate-500 dark:text-slate-400 block text-[11px] font-medium">Primary insurer · estimate</span>
              <span className="text-sky-700 dark:text-sky-300 font-semibold text-sm">{activeAccount.cmsData.primaryPayerMix || (activeAccount.cmsData.medicareBilledAnnual > activeAccount.cmsData.medicaidBilledAnnual ? 'Medicare FFS' : 'Commercial')} · unverified</span>
            </div>
            <div className="bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-800/80 px-3 py-1.5 rounded-lg">
              <span className="text-emerald-700 dark:text-emerald-300 block text-[11px] font-medium">Projected deal value · model</span>
              <span className="text-emerald-800 dark:text-emerald-400 font-semibold tabular-nums text-sm">${(activeAccount.zollOpportunity.estimatedDealValue ?? activeAccount.zollOpportunity.projectedPipelineValue).toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}

      {/* Strategic Consultant Executive Briefing */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 shadow-[0_1px_3px_rgba(15,23,42,0.03)]">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div>
            <div className="text-xs text-sky-700 dark:text-sky-400 font-semibold flex items-center gap-2">
              <Database className="w-4 h-4 text-sky-600 dark:text-sky-400" />
              <span>Strategic consultant &amp; business analyst intelligence</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-[650] text-slate-900 dark:text-white mt-1 tracking-tight">
              Public source references &amp; estimate limits
            </h1>
            <p className="text-xs text-slate-600 dark:text-slate-300 mt-2 max-w-3xl leading-relaxed">
              Public registries can corroborate provider identity, fire-department records, published fee schedules and matched grant awards. They do not verify the modeled agency denial, transport, survival, equipment or reimbursement values shown elsewhere.
            </p>
          </div>

          <div className="bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800 p-4 rounded-xl shrink-0 text-right">
            <div className="text-[11px] text-sky-800 dark:text-sky-300 font-medium">Provider-specific reimbursement totals</div>
            <div className="text-lg font-[650] text-sky-950 dark:text-white mt-1">Not source verified</div>
            <a className="text-[11px] text-sky-700 dark:text-sky-400 mt-0.5 underline" href="https://www.cms.gov/medicare/payment/fee-schedules/ambulance/ambulance-fee-schedule-public-use-files" target="_blank" rel="noreferrer">CMS AFS PUF · CY2026 fee schedule only</a>
          </div>
        </div>

        {/* National Macro Benchmarks */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-slate-200 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden mt-6">
          <div className="bg-slate-50/70 dark:bg-slate-900 p-4">
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Agency Medicare denial rate</div>
            <div className="text-xl font-[650] text-rose-700 dark:text-rose-400 tabular-nums mt-1">
              Not available
            </div>
            <a className="text-[11px] text-slate-400 mt-0.5 underline" href="https://www.cms.gov/medicare/payment/fee-schedules/ambulance/ambulance-fee-schedule-public-use-files" target="_blank" rel="noreferrer">CMS AFS PUF · CY2026 fee rates, not denials</a>
          </div>

          <div className="bg-slate-50/70 dark:bg-slate-900 p-4">
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Agency cardiac survival (Utstein)</div>
            <div className="text-xl font-[650] text-emerald-700 dark:text-emerald-400 tabular-nums mt-1">
              Not available
            </div>
            <a className="text-[11px] text-slate-400 mt-0.5 underline" href="https://nemsis.org/using-ems-data/request-research-data" target="_blank" rel="noreferrer">NEMSIS 2025 release is de-identified · reviewed 2026-10-30</a>
          </div>

          <div className="bg-slate-50/70 dark:bg-slate-900 p-4">
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Agency annual transports</div>
            <div className="text-xl font-[650] text-slate-900 dark:text-white tabular-nums mt-1">
              Not available
            </div>
            <a className="text-[11px] text-slate-400 mt-0.5 underline" href="https://nemsis.org/using-ems-data/request-research-data" target="_blank" rel="noreferrer">NEMSIS 2025 public release · does not identify agencies</a>
          </div>

          <div className="bg-slate-50/70 dark:bg-slate-900 p-4">
            <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Agency FEMA AFG award</div>
            <div className="text-xl font-[650] text-sky-700 dark:text-sky-400 tabular-nums mt-1">
              Not available
            </div>
            <a className="text-[11px] text-slate-400 mt-0.5 underline" href="https://www.fema.gov/openfema-data-page/non-disaster-and-assistance-firefighter-grants-v1" target="_blank" rel="noreferrer">OpenFEMA refresh 2026-06-04 · no award matched here</a>
          </div>
        </div>
      </div>

      {/* State-by-State Public Data Intelligence */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 shadow-[0_1px_3px_rgba(15,23,42,0.03)]">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">State source availability</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              State-level denial, survival and grant totals are withheld until matched source records are available. Lineage reviewed 2026-10-30.
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
                <th className="py-2.5 px-3 text-right">Agency count</th>
                <th className="py-2.5 px-3 text-right">Medicare denials</th>
                <th className="py-2.5 px-3 text-right">Cardiac survival</th>
                <th className="py-2.5 px-3 text-right">AFG awards</th>
                <th className="py-2.5 px-3 text-center">Lead estimates</th>
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
                    Unverified
                  </td>
                  <td className="py-3 px-3 text-right text-slate-500">
                    No agency-level public rate
                  </td>
                  <td className="py-3 px-3 text-right text-slate-500">
                    No agency-specific public outcome
                  </td>
                  <td className="py-3 px-3 text-right text-slate-500">
                    Requires matched OpenFEMA records
                  </td>
                  <td className="py-3 px-3 text-right font-semibold text-amber-800 dark:text-amber-400 tabular-nums">
                    Unavailable · no source-verified profile set
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
                <strong>Source limit:</strong> CMS ambulance fee schedule files publish payment rates, not provider-specific billed amounts, claim counts, or denial rates. Use an agency’s adjudicated claims and billing records before estimating recovery.
              </p>
              <p>
                <strong>Discussion:</strong> A billing workflow review may identify process changes. Any financial impact must be calculated from agency records and presented as a scenario, not a public-source finding.
              </p>
              <div className="p-3.5 bg-blue-50/60 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-900/60 rounded-xl text-blue-950 dark:text-blue-200 text-xs leading-relaxed">
                <span className="font-semibold text-blue-900 dark:text-blue-300 block mb-1">Consultative soundbite:</span>
                &ldquo;Chief, we have not verified your denial rate or recoverable amount. If you can share current billing records, we can build a clearly labeled estimate for discussion.&rdquo;
              </div>
            </>
          )}

          {selectedPlaybook === 'rosc' && (
            <>
              <div className="font-semibold text-slate-900 dark:text-white text-sm">
                Playbook 2: The Out-of-Hospital Cardiac Arrest (OHCA) Survival Play
              </div>
              <p>
                <strong>Source limit:</strong> The NEMSIS public research release removes agency identifiers. This dashboard does not establish county- or agency-specific survival rates; use a matched CARES or agency report before making comparisons.
              </p>
              <p>
                <strong>The ZOLL Solution:</strong> Pitch the combined <strong>AutoPulse Resuscitation System</strong> and <strong>X Series Advanced Real BVM Help</strong> to the EMS Medical Director and Training Captain. Point out that manual chest compressions degrade significantly during stairwell extrications and high-speed transit. The AutoPulse circumferential band provides continuous cerebral and coronary perfusion. Real BVM Help prevents hyperventilation—the leading cause of decreased survival in resuscitation.
              </p>
              <div className="p-3.5 bg-blue-50/60 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-900/60 rounded-xl text-blue-950 dark:text-blue-200 text-xs leading-relaxed">
                <span className="font-semibold text-blue-900 dark:text-blue-300 block mb-1">Consultative soundbite:</span>
                &ldquo;Dr. Chen, we do not have a verified outcome record for your agency. We can review your own clinical reports and discuss whether equipment or workflow changes fit your protocols.&rdquo;
              </div>
            </>
          )}

          {selectedPlaybook === 'fleet' && (
            <>
              <div className="font-semibold text-slate-900 dark:text-white text-sm">
                Playbook 3: The Aging Competitor Fleet & Obsolescence Replacement
              </div>
              <p>
                <strong>Source limit:</strong> The USFA public registry lists department identifiers, addresses, stations and staffing; it does not report monitor brands, fleet ages, warranties or maintenance costs. Confirm equipment against agency inventory and asset records.
              </p>
              <p>
                <strong>The ZOLL Solution:</strong> Offer the <strong>X Series Advanced Trade-In Program</strong>. Present the 11.7 lb weight advantage (reducing back strain on medics compared to 19+ lb LIFEPAK units) plus the integrated Traumatic Brain Injury (TBI) EPIC protocol dashboard.
              </p>
              <div className="p-3.5 bg-blue-50/60 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-900/60 rounded-xl text-blue-950 dark:text-blue-200 text-xs leading-relaxed">
                <span className="font-semibold text-blue-900 dark:text-blue-300 block mb-1">Consultative soundbite:</span>
                &ldquo;Chief, we have not verified your monitor fleet, warranty status or contract terms. If you provide an inventory, we can compare options using current written quotations.&rdquo;
              </div>
            </>
          )}

          {selectedPlaybook === 'afg' && (
            <>
              <div className="font-semibold text-slate-900 dark:text-white text-sm">
                Playbook 4: The FEMA Assistance to Firefighters Grant (AFG) Fast-Track
              </div>
              <p>
                <strong>Source limit:</strong> OpenFEMA publishes AFG award records. Match the recipient and award identifier before stating that an agency received an award; a missing match does not prove no award exists.
              </p>
              <p>
                <strong>Discussion:</strong> Confirm award terms, procurement rules, and agency purchasing authority before discussing cooperative contracts or timelines.
              </p>
              <div className="p-3.5 bg-blue-50/60 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-900/60 rounded-xl text-blue-950 dark:text-blue-200 text-xs leading-relaxed">
                <span className="font-semibold text-blue-900 dark:text-blue-300 block mb-1">Consultative soundbite:</span>
                &ldquo;We have not matched a public award record to your department. If you share an award notice, we can confirm its terms and review procurement options with your team.&rdquo;
              </div>
            </>
          )}

          {selectedPlaybook === 'nemsqa' && (
            <>
              <div className="font-semibold text-slate-900 dark:text-white text-sm">
                Playbook 5: NEMSQA Quality Measures & AHA Mission: Lifeline Recognition
              </div>
              <p>
                <strong>Source limit:</strong> The de-identified NEMSIS public release does not establish these measures for a named agency. Use a source-linked agency quality report before discussing performance or recognition status.
              </p>
              <p>
                <strong>The ZOLL Solution:</strong> Present the <strong>X Series Advanced with Real CPR Help and Real BVM Help</strong> alongside <strong>RescueNet ePCR</strong>. Real BVM Help automatically records rate and tidal volume directly into the ePCR, providing audit-proof compliance for AHA Mission: Lifeline Gold Plus recognition.
              </p>
              <div className="p-3.5 bg-blue-50/60 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-900/60 rounded-xl text-blue-950 dark:text-blue-200 text-xs leading-relaxed">
                <span className="font-semibold text-blue-900 dark:text-blue-300 block mb-1">Consultative soundbite:</span>
                &ldquo;Chief, achieving AHA Mission: Lifeline Gold Plus status not only showcases clinical excellence to your city council, but it protects your agency against malpractice liability. ZOLL provides the only clinical system that measures real-time ventilation rate and depth directly at the patient&apos;s side.&rdquo;
              </div>
            </>
          )}

          {selectedPlaybook === 'et3' && (
            <>
              <div className="font-semibold text-slate-900 dark:text-white text-sm">
                Playbook 6: CMS ET3, Hospital Handoff Reduction & Community Paramedicine
              </div>
              <p>
                <strong>Source limit:</strong> Reimbursement eligibility and handoff times depend on current program rules, payer contracts, and local records. This dashboard does not verify agency-specific reimbursement or hospital wall-time data.
              </p>
              <p>
                <strong>The ZOLL Solution:</strong> Deploy <strong>ZOLL Respond CAD and RescueNet Telehealth</strong>. Paramedics can initiate secure video telemetry consults directly from the scene, receive emergency physician sign-off for treatment-in-place, and bill Medicare at standard transport rates without unnecessary hospital transfer delays.
              </p>
              <div className="p-3.5 bg-blue-50/60 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-900/60 rounded-xl text-blue-950 dark:text-blue-200 text-xs leading-relaxed">
                <span className="font-semibold text-blue-900 dark:text-blue-300 block mb-1">Consultative soundbite:</span>
                &ldquo;We have not verified your handoff times or reimbursement eligibility. We can review local operational records and current payer guidance before estimating potential changes.&rdquo;
              </div>
            </>
          )}
        </div>

      </div>

      {/* NEMSQA & CARES National Quality Benchmark Comparison */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-xl p-5 sm:p-6 shadow-[0_1px_3px_rgba(15,23,42,0.03)]">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Clinical public-source availability</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Agency-level values are not shown without matched reports. The NEMSIS public research release is de-identified; lineage reviewed 2026-10-30.
            </p>
          </div>
          <span className="text-xs text-sky-800 dark:text-sky-300 bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 px-2.5 py-1 rounded-md font-semibold">
            Source links
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <div className="bg-slate-50 dark:bg-slate-800/70 p-5 rounded-xl border border-slate-200/80 dark:border-slate-700">
            <div className="text-xs text-slate-600 dark:text-slate-400 font-semibold">STEMI 12-lead acquisition</div>
            <div className="text-2xl font-[650] text-sky-800 dark:text-sky-400 tabular-nums mt-1">
              Not available
            </div>
            <a className="text-[11px] text-slate-400 mt-1 underline" href="https://nemsis.org/using-ems-data/request-research-data" target="_blank" rel="noreferrer">NEMSIS public data scope · 2025</a>
            <div className="text-xs text-slate-600 dark:text-slate-300 mt-2.5 leading-relaxed">
              No agency-specific measure is attached. The NEMSIS public research release is de-identified.
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/70 p-5 rounded-xl border border-slate-200/80 dark:border-slate-700">
            <div className="text-xs text-slate-600 dark:text-slate-400 font-semibold">Chest compression fraction (CCF)</div>
            <div className="text-2xl font-[650] text-emerald-800 dark:text-emerald-400 tabular-nums mt-1">
              Not available
            </div>
            <a className="text-[11px] text-slate-400 mt-1 underline" href="https://nemsis.org/using-ems-data/request-research-data" target="_blank" rel="noreferrer">NEMSIS public data scope · 2025</a>
            <div className="text-xs text-slate-600 dark:text-slate-300 mt-2.5 leading-relaxed">
              No agency-specific measure is attached. The NEMSIS public research release is de-identified.
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/70 p-5 rounded-xl border border-slate-200/80 dark:border-slate-700">
            <div className="text-xs text-slate-600 dark:text-slate-400 font-semibold">Favorable cerebral survival (CPC 1/2)</div>
            <div className="text-2xl font-[650] text-slate-900 dark:text-white tabular-nums mt-1">
              Not available
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">Agency source record not attached</span>
            <div className="text-xs text-slate-600 dark:text-slate-300 mt-2.5 leading-relaxed">
              No agency-specific measure is attached; use a matched quality report for clinical outcomes.
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};
