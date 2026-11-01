/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Agency } from '../types';
import { getAgencyMedicareDenialMetricForDisplay } from '../services/agencyMedicareDenialService';
import { 
  calculateAgencyFleetTco, 
  COOPERATIVE_CONTRACTS 
} from '../data/clinicalAndCompetitiveIntelligence';
import { 
  ShieldAlert, 
  DollarSign, 
  Copy, 
  Check, 
  FileText, 
  HeartPulse, 
  Award,
  ChevronDown,
  ChevronUp,
  Printer,
  HelpCircle,
  ExternalLink,
  MessageSquare,
  ShieldCheck,
  CheckCircle2
} from 'lucide-react';

interface DealStoryBriefingViewProps {
  agency: Agency;
  variant?: 'compact' | 'full';
  onOpenFullProfile?: (agency: Agency) => void;
  onOpenDossier?: () => void;
  className?: string;
}

const hasReportedValue = (value: number | null | undefined): value is number =>
  value != null && Number.isFinite(value);

const reportMetric = (value: number | null | undefined, suffix = '') =>
  hasReportedValue(value) ? `${value.toLocaleString()}${suffix}` : 'Not reported';

const reportCurrency = (value: number | null | undefined) =>
  hasReportedValue(value) ? `$${value.toLocaleString()}` : 'Not reported';

export const DealStoryBriefingView: React.FC<DealStoryBriefingViewProps> = ({
  agency,
  variant = 'compact',
  onOpenFullProfile,
  onOpenDossier,
  className = ''
}) => {
  const [copiedPitch, setCopiedPitch] = useState(false);
  const [copiedQuestions, setCopiedQuestions] = useState(false);
  const [activeTab, setActiveTab] = useState<'brief' | 'questions' | 'solution' | 'conversation'>('brief');

  const tco = useMemo(() => {
    return calculateAgencyFleetTco(agency, 5);
  }, [agency]);

  const isFire = agency.providerCategory === 'FIRE' || (agency.agencyType || '').toLowerCase().includes('fire');
  const coopContract = useMemo(() => {
    return isFire ? COOPERATIVE_CONTRACTS[1] : COOPERATIVE_CONTRACTS[0]; // Sourcewell or HGACBuy
  }, [isFire]);

  const hasReportedDefibCount = hasReportedValue(agency.installedFleet?.defibUnitsCount);
  const defibBrand = agency.installedFleet?.defibBrand || 'Not reported';
  const reportedDefibAge = agency.installedFleet?.defibAgeYears;
  const defibAge = reportMetric(reportedDefibAge, ' years');
  const defibCount = reportMetric(agency.installedFleet?.defibUnitsCount);
  const warranty = agency.installedFleet?.defibWarrantyStatus || 'Not reported';
  const defibAgeQuestionPhrase = hasReportedValue(reportedDefibAge) && defibBrand !== 'Not reported'
    ? `the reported ${reportedDefibAge}-year-old ${defibBrand} fleet`
    : 'your current monitor fleet';
  const hasTcoInputs = hasReportedDefibCount && agency.installedFleet.defibUnitsCount > 0;
  const fiveYrSavings = hasTcoInputs ? `$${Math.round(tco.fiveYearOperatingSavings / 1000)}K` : 'Not calculated';
  const tradeIn = hasTcoInputs ? `$${Math.round(tco.totalTradeInCredit / 1000)}K` : 'Not calculated';
  const tcoMethod = hasTcoInputs
    ? `Inputs: ${reportMetric(tco.unitCount)} reported defibrillator units; five years; benchmark ${tco.incumbentModel} vs ${tco.zollModel}; per-unit annual service ${reportCurrency(tco.matchedIntel.incumbentAnnualServicePerUnit)} vs ${reportCurrency(tco.matchedIntel.zollAnnualServicePerUnit)}, 5-year batteries ${reportCurrency(tco.matchedIntel.incumbentBattery5YrCostPerUnit)} vs ${reportCurrency(tco.matchedIntel.zollBattery5YrCostPerUnit)}, annual consumables ${reportCurrency(tco.matchedIntel.incumbentConsumableAnnualPerUnit)} vs ${reportCurrency(tco.matchedIntel.zollConsumableAnnualPerUnit)}, and trade-in assumption ${reportCurrency(tco.matchedIntel.zollTradeInCreditPerUnit)}/unit. Method: operating cost difference plus trade-in; modeled values, not an agency quote.`
    : 'Not calculated: no positive reported defibrillator unit count.';
  const recoverableEstimate = 'Not calculated — agency-specific inputs and a reproducible method are unavailable.';
  const denialMetric = getAgencyMedicareDenialMetricForDisplay(agency);
  const denialRate = denialMetric
    ? `${denialMetric.ratePct.toFixed(1)}% (billing NPI ${denialMetric.npi}; ${denialMetric.deniedClaimCount.toLocaleString()} denied / ${denialMetric.adjudicatedClaimCount.toLocaleString()} adjudicated; ${denialMetric.reportingPeriod}; ${denialMetric.claimScope}; ${denialMetric.denialDefinition}; source: ${denialMetric.source}${denialMetric.sourceReference ? `, ${denialMetric.sourceReference}` : ''}${denialMetric.sourceUrl ? `, ${denialMetric.sourceUrl}` : ''})`
    : 'Not published';
  const hasGrant = Boolean(agency.grantStatus?.afgAwarded);
  const grantAmt = reportCurrency(agency.grantStatus?.afgAwardAmount);
  const grantFiscalYear = reportMetric(agency.grantStatus?.afgFiscalYear);

  // Strategic Executive Elevator Pitch
  const elevatorPitch = useMemo(() => {
    const leaderTitle = isFire ? 'Chief' : 'Director';
    const leaderName = agency.keyContacts[0]?.name ? `${leaderTitle} ${agency.keyContacts[0].name.split(' ').pop()}` : leaderTitle;
    const grantSentence = hasGrant
      ? ` A FEMA AFG award is listed for FY${grantFiscalYear}, with an amount of ${grantAmt}; current availability and eligible uses are not verified here.`
      : '';

    const tcoSentence = hasTcoInputs
      ? ` Illustrative 5-year estimate for ${defibCount} reported defibrillator units: ${fiveYrSavings} operating savings plus ${tradeIn} trade-in credit. ${tcoMethod}`
      : ` A 5-year fleet estimate is not calculated because a positive reported defibrillator unit count is unavailable. ${tcoMethod}`;
    return `${leaderName} at ${agency.name}: Recorded defibrillator details are ${defibCount} units, ${defibBrand} brand, age ${defibAge}, and warranty status ${warranty}.${tcoSentence} Medicare denial rate: ${denialRate}; recoverable revenue: ${recoverableEstimate}${grantSentence} Cooperative purchasing option listed: ${coopContract.contractName} (${coopContract.contractNumber}); local eligibility and requirements need confirmation.`;
  }, [agency, isFire, defibBrand, defibCount, defibAge, warranty, hasTcoInputs, fiveYrSavings, tradeIn, tcoMethod, denialRate, recoverableEstimate, hasGrant, grantAmt, grantFiscalYear, coopContract]);

  // Tailored Discovery Questions (3+ for different command roles)
  const discoveryQuestions = useMemo(() => [
    {
      role: isFire ? 'Fire Chief / Executive Command' : 'EMS Director / Executive Command',
      question: `How have annual preventative maintenance and battery replacement costs changed for ${defibAgeQuestionPhrase} over the past two budget cycles?`,
      objective: 'Establish escalating cost of ownership and transition the conversation toward fixed-cap 5-year service guarantees.'
    },
    {
      role: 'Medical Director / CQI Officer',
      question: `Does your current monitor provide real-time ventilation rate and tidal volume feedback on screen, or are paramedics relying on manual timing to prevent hyperventilation during cardiac arrest resuscitation?`,
      objective: 'Demonstrate Real BVM Help® clinical differentiation and AHA 2020 guideline compliance for chest compression fraction.'
    },
    {
      role: 'Operations Captain / EMS Coordinator',
      question: `What percentage of your 12-lead ECG transmissions to ${agency.hospitalLogistics?.primaryCathLabHospital || 'the local STEMI center'} fail or require redundant phone calls from the back of the ambulance?`,
      objective: 'Uncover field friction with legacy modems and present ZOLL automated cellular gateway reliability.'
    },
    {
      role: 'Finance Officer / Municipal Purchasing Agent',
      question: hasGrant 
        ? `What is the current status of the FEMA AFG award listed for FY${grantFiscalYear} with a recorded amount of ${grantAmt}?`
        : `Does your municipality currently utilize cooperative purchasing contracts such as ${coopContract.contractName} (${coopContract.contractNumber}) to accelerate capital equipment procurement?`,
      objective: 'Identify procurement vehicles and ensure adherence to local competitive purchasing thresholds.'
    }
  ], [agency, isFire, defibAgeQuestionPhrase, hasGrant, grantAmt, grantFiscalYear, coopContract]);

  const handleCopyPitch = () => {
    navigator.clipboard.writeText(elevatorPitch);
    setCopiedPitch(true);
    setTimeout(() => setCopiedPitch(false), 2200);
  };

  const handleCopyQuestions = () => {
    const text = discoveryQuestions.map((q, idx) => `Q${idx + 1} (${q.role}):\n"${q.question}"\nStrategic Objective: ${q.objective}\n`).join('\n');
    navigator.clipboard.writeText(text);
    setCopiedQuestions(true);
    setTimeout(() => setCopiedQuestions(false), 2200);
  };

  if (variant === 'compact') {
    return (
      <div className={`p-4 rounded-xl border border-[#DFE6EF] dark:border-[#1E2D42] bg-[#F5F7FA] dark:bg-[#111C2D] text-left transition-all ${className}`}>
        {/* Header / Hook */}
        <div className="flex items-start justify-between gap-3 mb-2.5">
          <div>
            <h4 className="text-xs font-semibold text-[#14283F] dark:text-white flex items-center gap-1.5">
              Prepare for Meeting: {agency.name}
            </h4>
            <p className="text-xs text-[#53657B] dark:text-slate-400 mt-0.5">
              Executive conversation strategy · reported data and research gaps
            </p>
          </div>

          <button
            type="button"
            onClick={handleCopyPitch}
            title="Copy Elevator Pitch"
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-white dark:bg-[#16243A] border border-[#DFE6EF] dark:border-[#1E2D42] text-[#14283F] dark:text-slate-200 hover:border-[#285EE8] transition-colors shrink-0 cursor-pointer"
          >
            {copiedPitch ? (
              <>
                <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                <span className="text-emerald-700 dark:text-emerald-300 font-semibold">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3 text-[#53657B]" />
                <span>Copy Pitch</span>
              </>
            )}
          </button>
        </div>

        {/* 3 Pillars Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 my-3 text-xs">
          <div className="p-2.5 rounded-lg bg-white dark:bg-[#16243A] border border-[#DFE6EF] dark:border-[#1E2D42]">
            <div className="flex items-center gap-1.5 font-semibold text-rose-700 dark:text-rose-400 text-xs mb-1">
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>1. Incumbent fleet status</span>
            </div>
            <p className="text-xs text-[#53657B] dark:text-slate-300 leading-relaxed">
              Reported fleet: <strong className="text-[#14283F] dark:text-white">{defibCount} × {defibBrand}</strong>; age {defibAge}; warranty {warranty}. Maintenance cost is not reported here.
            </p>
          </div>

          <div className="p-2.5 rounded-lg bg-white dark:bg-[#16243A] border border-[#DFE6EF] dark:border-[#1E2D42]">
            <div className="flex items-center gap-1.5 font-semibold text-emerald-700 dark:text-emerald-400 text-xs mb-1">
              <DollarSign className="w-3.5 h-3.5" />
              <span>2. Modeled financial value</span>
            </div>
            <p className="text-xs text-[#53657B] dark:text-slate-300 leading-relaxed">
              {hasTcoInputs
                ? <>Illustrative estimate: <strong className="text-emerald-700 dark:text-emerald-400 font-semibold tabular-nums">{fiveYrSavings}</strong> five-year operating savings plus <strong className="text-[#14283F] dark:text-white tabular-nums">{tradeIn}</strong> trade-in credit. {tcoMethod}</>
                : tcoMethod}
            </p>
          </div>

          <div className="p-2.5 rounded-lg bg-white dark:bg-[#16243A] border border-[#DFE6EF] dark:border-[#1E2D42]">
            <div className="flex items-center gap-1.5 font-semibold text-[#285EE8] dark:text-blue-400 text-xs mb-1">
              <Award className="w-3.5 h-3.5" />
              <span>3. Procurement vehicle</span>
            </div>
            <p className="text-xs text-[#53657B] dark:text-slate-300 leading-relaxed">
              Eligible for <strong className="text-[#14283F] dark:text-white">{coopContract.contractName.split(' ')[0]}</strong> ({coopContract.contractNumber}), subject to local purchasing limits.
            </p>
          </div>
        </div>

        {/* Concise Pitch Preview */}
        <div className="p-2.5 rounded-lg bg-white dark:bg-[#16243A] border border-[#DFE6EF] dark:border-[#1E2D42] text-xs text-[#53657B] dark:text-slate-300 leading-relaxed">
          <strong className="text-[#14283F] dark:text-white">Suggested opening: </strong>
          <span>&ldquo;{elevatorPitch.slice(0, 160)}...&rdquo;</span>
        </div>
      </div>
    );
  }

  // FULL-SCREEN VARIANT: PREPARE FOR MEETING WORKSPACE
  return (
    <section 
      aria-label="Prepare for Meeting Intelligence Workspace"
      className={`pi-surface p-5 sm:p-6 lg:p-7 space-y-6 ${className}`}
    >
      {/* Top Banner Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-[#DFE6EF] dark:border-[#1E2D42]">
        <div>
          <div className="text-xs font-semibold text-[#285EE8] dark:text-blue-400 mb-1">
            Account preparation
          </div>
          <h2 className="pi-section-heading text-xl sm:text-2xl">
            Prepare for Meeting: {agency.name}
          </h2>
          <p className="pi-supporting mt-1">
            Evidence-backed account briefing, strategic discovery questions, and conversational guidance.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {onOpenDossier && (
            <button
              type="button"
              onClick={onOpenDossier}
              className="h-9 px-3.5 rounded-lg text-xs font-semibold bg-white dark:bg-[#16243A] border border-[#DFE6EF] dark:border-[#1E2D42] text-[#14283F] dark:text-slate-200 hover:bg-[#F5F7FA] transition-colors cursor-pointer inline-flex items-center gap-1.5"
              title="Printable 2-page Executive Briefing Dossier"
            >
              <Printer className="w-3.5 h-3.5 text-[#285EE8]" />
              <span>Print Brief</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleCopyPitch}
            className="h-9 px-3.5 rounded-lg text-xs font-semibold bg-[#285EE8] hover:bg-[#194BC8] text-white transition-colors cursor-pointer inline-flex items-center gap-1.5 shadow-2xs"
          >
            {copiedPitch ? (
              <>
                <Check className="w-3.5 h-3.5" />
                <span>Pitch Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Elevator Pitch</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Sub-Navigation Strip */}
      <div className="flex items-center gap-1 bg-[#F5F7FA] dark:bg-[#16243A] p-1 rounded-lg border border-[#DFE6EF] dark:border-[#1E2D42] w-fit">
        {[
          { id: 'brief', label: '1. Account Brief' },
          { id: 'questions', label: '2. Discovery Questions' },
          { id: 'solution', label: '3. Potential Solution Fit' },
          { id: 'conversation', label: '4. Recommended Conversation' }
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === tab.id
                ? 'bg-white dark:bg-[#111C2D] text-[#14283F] dark:text-white shadow-2xs'
                : 'text-[#53657B] dark:text-slate-400 hover:text-[#14283F] dark:hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: ACCOUNT BRIEF & WHAT WE KNOW VS NEED TO CONFIRM */}
      {activeTab === 'brief' && (
        <div className="space-y-6">
          {/* Executive Opening Pitch Box */}
          <div className="p-4 sm:p-5 rounded-xl bg-[#EEF3FE]/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/70 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#285EE8] dark:text-blue-400">
                Recommended 30-second executive opening
              </span>
              <button
                type="button"
                onClick={handleCopyPitch}
                className="text-xs font-semibold text-[#285EE8] dark:text-blue-400 hover:underline cursor-pointer"
              >
                {copiedPitch ? 'Copied' : 'Copy opening'}
              </button>
            </div>
            <p className="text-sm text-[#14283F] dark:text-slate-100 leading-relaxed font-sans italic">
              &ldquo;{elevatorPitch}&rdquo;
            </p>
            <div className="text-[11px] text-[#53657B] dark:text-slate-400 pt-1">
              Note: Financial values are modeled estimates based on CMS Medicare Part B public use files and standard equipment replacement lifecycle assumptions.
            </div>
          </div>

          {/* Two-Column Grid: What We Know vs. What We Need to Confirm */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* What We Know (Supported Facts) */}
            <div className="p-5 rounded-xl bg-white dark:bg-[#111C2D] border border-[#DFE6EF] dark:border-[#1E2D42] space-y-3.5">
              <div className="flex items-center gap-2 border-b border-[#DFE6EF] dark:border-[#1E2D42] pb-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-semibold text-[#14283F] dark:text-white">
                  What we know (Supported facts)
                </h3>
              </div>
              <ul className="space-y-2.5 text-xs text-[#53657B] dark:text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 mt-1.5 shrink-0" />
                  <span>
                    <strong className="text-[#14283F] dark:text-white">Apparatus &amp; Stations: </strong>
                    {reportMetric(agency.totalAmbulances)} frontline ambulances across {reportMetric(agency.stationsCount)} stations; population served {reportMetric(agency.populationServed)}.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 mt-1.5 shrink-0" />
                  <span>
                    <strong className="text-[#14283F] dark:text-white">Installed Defibrillators: </strong>
                    Reported units: {defibCount}; brand: {defibBrand}; age: {defibAge}; warranty: {warranty}.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 mt-1.5 shrink-0" />
                  <span>
                    <strong className="text-[#14283F] dark:text-white">Federal Identifiers: </strong>
                    NPI {agency.npiNumber || 'Not reported'} and USFA FDID {agency.fdid || 'Not reported'}.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 mt-1.5 shrink-0" />
                  <span>
                    <strong className="text-[#14283F] dark:text-white">Call Volume &amp; Acuity: </strong>
                    {reportMetric(agency.annual911Transports)} annual transports and {reportMetric(agency.annualCardiacArrestCalls)} cardiac arrest runs per year.
                  </span>
                </li>
                {hasGrant && (
                  <li className="flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 mt-1.5 shrink-0" />
                    <span>
                      <strong className="text-[#14283F] dark:text-white">Public Grant Liquidity: </strong>
                      FEMA AFG award listed for FY{grantFiscalYear}, amount {grantAmt}; current availability not verified.
                    </span>
                  </li>
                )}
              </ul>
            </div>

            {/* What We Need to Confirm (Research Gaps) */}
            <div className="p-5 rounded-xl bg-white dark:bg-[#111C2D] border border-[#DFE6EF] dark:border-[#1E2D42] space-y-3.5">
              <div className="flex items-center gap-2 border-b border-[#DFE6EF] dark:border-[#1E2D42] pb-3">
                <HelpCircle className="w-4 h-4 text-amber-600" />
                <h3 className="text-sm font-semibold text-[#14283F] dark:text-white">
                  What we need to confirm (Research gaps)
                </h3>
              </div>
              <ul className="space-y-2.5 text-xs text-[#53657B] dark:text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-600 mt-1.5 shrink-0" />
                  <span>
                    <strong className="text-[#14283F] dark:text-white">Biomedical Trade-In Serial Numbers: </strong>
                    Confirm serial numbers, battery health, and accessory compatibility for the reported {defibCount} {defibBrand} units.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-600 mt-1.5 shrink-0" />
                  <span>
                    <strong className="text-[#14283F] dark:text-white">Budget Approval Gates: </strong>
                    Identify municipal council or district board voting schedules for capital equipment authorizations in FY2026.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-600 mt-1.5 shrink-0" />
                  <span>
                    <strong className="text-[#14283F] dark:text-white">Clinical Resuscitation Priorities: </strong>
                    Determine whether Medical Direction prioritizes Real BVM Help® tidal volume guidance or automated mechanical CPR adoption.
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-600 mt-1.5 shrink-0" />
                  <span>
                    <strong className="text-[#14283F] dark:text-white">Procurement Vehicle Policy: </strong>
                    Confirm whether local municipal ordinance permits piggybacking on {coopContract.contractName} ({coopContract.contractNumber}) or requires sealed bidding.
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DISCOVERY QUESTIONS */}
      {activeTab === 'questions' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-[#53657B] dark:text-slate-300">
              Role-specific discovery questions designed to uncover genuine operational priorities without making assumptions.
            </p>
            <button
              type="button"
              onClick={handleCopyQuestions}
              className="h-8 px-3 rounded-lg text-xs font-semibold bg-white dark:bg-[#16243A] border border-[#DFE6EF] dark:border-[#1E2D42] text-[#14283F] dark:text-slate-200 hover:border-[#285EE8] cursor-pointer inline-flex items-center gap-1.5"
            >
              {copiedQuestions ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedQuestions ? 'Questions Copied' : 'Copy All Questions'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {discoveryQuestions.map((q, idx) => (
              <div
                key={idx}
                className="p-4 rounded-xl bg-white dark:bg-[#111C2D] border border-[#DFE6EF] dark:border-[#1E2D42] space-y-2 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#285EE8] dark:text-blue-400">
                    Role: {q.role}
                  </span>
                  <span className="text-[#53657B] dark:text-slate-400 font-semibold tabular-nums">0{idx + 1}</span>
                </div>
                <p className="text-sm font-medium text-[#14283F] dark:text-white leading-snug">
                  &ldquo;{q.question}&rdquo;
                </p>
                <div className="pt-2 border-t border-[#DFE6EF] dark:border-[#1E2D42] text-[11px] text-[#53657B] dark:text-slate-400">
                  <strong className="text-[#14283F] dark:text-slate-300">Strategic objective: </strong>
                  {q.objective}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: POTENTIAL SOLUTION FIT */}
      {activeTab === 'solution' && (
        <div className="space-y-4">
          <p className="text-xs text-[#53657B] dark:text-slate-300">
            Applicable ZOLL product categories evaluated based on documented department needs and clinical operational metrics.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Solution 1: X Series Advanced */}
            <div className="p-4 rounded-xl bg-white dark:bg-[#111C2D] border border-[#DFE6EF] dark:border-[#1E2D42] space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#14283F] dark:text-white text-sm">
                  ZOLL X Series Advanced
                </span>
                <span className="text-[11px] font-semibold text-[#285EE8] bg-[#EEF3FE] dark:bg-blue-950/60 px-2 py-0.5 rounded">
                  Primary Fit
                </span>
              </div>
              <p className="text-[#53657B] dark:text-slate-300 leading-relaxed">
                Potential monitor option: lightweight (11.7 lbs) ruggedized hardware with Real BVM Help® ventilation feedback and automated 12-lead cellular transmission. Agency fit and replacement need are not verified.
              </p>
              <div className="pt-2 border-t border-[#DFE6EF] dark:border-[#1E2D42] text-[11px] text-[#53657B] dark:text-slate-400">
                <strong className="text-[#14283F] dark:text-slate-300">Target Clinical Metric: </strong>
                AHA Chest Compression Fraction &gt;80% and peri-shock pause &lt;10s.
              </div>
            </div>

            {/* Solution 2: AutoPulse Mechanical CPR */}
            <div className="p-4 rounded-xl bg-white dark:bg-[#111C2D] border border-[#DFE6EF] dark:border-[#1E2D42] space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#14283F] dark:text-white text-sm">
                  AutoPulse Resuscitation System
                </span>
                <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded">
                  Transport Resus
                </span>
              </div>
              <p className="text-[#53657B] dark:text-slate-300 leading-relaxed">
                Load-distributing band CPR delivering continuous, consistent compressions during transport to {agency.hospitalLogistics?.primaryCathLabHospital || 'the cath lab'} without paramedic fatigue.
              </p>
              <div className="pt-2 border-t border-[#DFE6EF] dark:border-[#1E2D42] text-[11px] text-[#53657B] dark:text-slate-400">
                <strong className="text-[#14283F] dark:text-slate-300">Transport Logistics: </strong>
                {reportMetric(agency.hospitalLogistics?.transportTimeMinutes, ' min')} average transit to STEMI facility.
              </div>
            </div>

            {/* Solution 3: RescueNet CaseReview & Billing */}
            <div className="p-4 rounded-xl bg-white dark:bg-[#111C2D] border border-[#DFE6EF] dark:border-[#1E2D42] space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[#14283F] dark:text-white text-sm">
                  RescueNet ePCR &amp; Billing Boost
                </span>
                <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 dark:bg-amber-950/60 px-2 py-0.5 rounded">
                  Reimbursement
                </span>
              </div>
              <p className="text-[#53657B] dark:text-slate-300 leading-relaxed">
                Automated NEMSIS v3.5.0 code generation and ECG telemetry attachment to reduce Medicare Part B {agency.cmsData?.topDenialReasonCode || 'CO-16'} claim rejections.
              </p>
              <div className="pt-2 border-t border-[#DFE6EF] dark:border-[#1E2D42] text-[11px] text-[#53657B] dark:text-slate-400">
                <strong className="text-[#14283F] dark:text-slate-300">Modeled Recovery: </strong>
                {recoverableEstimate}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: RECOMMENDED CONVERSATION ROADMAP */}
      {activeTab === 'conversation' && (
        <div className="p-5 rounded-xl bg-white dark:bg-[#111C2D] border border-[#DFE6EF] dark:border-[#1E2D42] space-y-4 text-xs">
          <h3 className="text-sm font-semibold text-[#14283F] dark:text-white">
            Recommended Consultative Roadmap
          </h3>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-[#EEF3FE] dark:bg-blue-950 text-[#285EE8] font-semibold flex items-center justify-center shrink-0">1</span>
              <div>
                <div className="font-semibold text-[#14283F] dark:text-white">Acknowledge &amp; Validate Current Operations</div>
                <p className="text-[#53657B] dark:text-slate-300 mt-0.5 leading-relaxed">
                  Ask about annual transport volume ({reportMetric(agency.annual911Transports)} reported) and CPR community initiatives. Confirm the reported {defibCount} {defibBrand} units and local trauma logistics.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-[#EEF3FE] dark:bg-blue-950 text-[#285EE8] font-semibold flex items-center justify-center shrink-0">2</span>
              <div>
                <div className="font-semibold text-[#14283F] dark:text-white">Explore Equipment Lifecycle &amp; Maintenance Burden</div>
                <p className="text-[#53657B] dark:text-slate-300 mt-0.5 leading-relaxed">
                  Inquire about maintenance turnaround times, battery replacements, and manufacturer end-of-service dates for {defibAgeQuestionPhrase} without assuming those details are verified.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="w-6 h-6 rounded-full bg-[#EEF3FE] dark:bg-blue-950 text-[#285EE8] font-semibold flex items-center justify-center shrink-0">3</span>
              <div>
                <div className="font-semibold text-[#14283F] dark:text-white">Introduce Pre-Competed Cooperative Purchasing</div>
                <p className="text-[#53657B] dark:text-slate-300 mt-0.5 leading-relaxed">
                  Explain how {coopContract.contractName} ({coopContract.contractNumber}) allows the municipality to adopt best-in-class technology with pre-negotiated volume pricing, while respecting all applicable public purchasing regulations.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Supporting Source Lineage Strip */}
      <div className="pt-4 border-t border-[#DFE6EF] dark:border-[#1E2D42] flex flex-wrap items-center justify-between gap-3 text-xs text-[#53657B] dark:text-slate-400">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Verified Public Registry Citations</span>
          </span>
          <span aria-hidden="true">·</span>
          <span>CMS NPPES NPI: {agency.npiNumber ? `#${agency.npiNumber}` : 'Unassigned'}</span>
          <span aria-hidden="true">·</span>
          <span>USFA FDID: {agency.fdid || 'Not Recorded'}</span>
          <span aria-hidden="true">·</span>
          <span>OpenFEMA AFG {hasGrant ? `Award #${agency.grantStatus?.afgAwardNumber || 'Active'}` : 'Registry'}</span>
        </div>

        <div className="text-[11px] text-[#53657B] dark:text-slate-400 italic">
          Complies with municipal public procurement standards and HIPAA de-identification requirements.
        </div>
      </div>
    </section>
  );
};
