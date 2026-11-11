import React, { useState } from 'react';
import type { PredictiveWeights } from '../types';
import {
  DEFAULT_WEIGHTS,
  getPulseIqFormula,
  getPulseIqWeightDetails,
  PULSE_IQ_FACTOR_RULES
} from '../utils/pulseIqScoring';
import {
  X,
  Layers,
  Scale,
  Activity,
  AlertTriangle,
  Award,
  DollarSign,
  Laptop,
  CheckCircle2,
  HelpCircle,
  TrendingUp,
  FileSpreadsheet,
  Calendar,
  ExternalLink
} from 'lucide-react';

interface UnderstandingPulseIqModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenCalibration?: () => void;
  onOpenWeightsModal?: () => void;
  weights?: PredictiveWeights;
}

export const PulseIqMethodologyFactors: React.FC<{ weights: PredictiveWeights }> = ({ weights }) => {
  const weightDetails = getPulseIqWeightDetails(weights);

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">
        PulseIQ uses the active factors and weights below. Weights are normalized by their active total, and the displayed formula follows the same calculation used for each score:
      </p>
      <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 font-mono text-xs text-cyan-300">
        PulseIQ estimate = {getPulseIqFormula(weights)}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {weightDetails.factors.map((factor, index) => (
          <article key={factor.key} className="p-4 rounded-xl border border-slate-800 bg-slate-950/40">
            <div className="flex items-start justify-between gap-3">
              <h4 className="text-sm font-bold text-white">{index + 1}. {factor.label}</h4>
              <span className="shrink-0 px-2 py-1 text-xs font-mono font-bold text-cyan-300 bg-cyan-500/10 border border-cyan-500/30 rounded-md">
                {factor.weightPct.toFixed(1)}% weight
              </span>
            </div>
            <p className="mt-3 text-xs text-slate-300 leading-relaxed">
              {PULSE_IQ_FACTOR_RULES[factor.key]}
            </p>
            <p className="mt-2 text-[11px] text-slate-500">
              Active weight: {factor.weight} · Total active weight: {weightDetails.totalWeight}
            </p>
          </article>
        ))}
      </div>
      <p className="text-xs text-slate-400">
        Medicare claim records and local denial rates are excluded from the scored factors and remain available separately for review.
      </p>
    </div>
  );
};

export const UnderstandingPulseIqModal: React.FC<UnderstandingPulseIqModalProps> = ({
  isOpen,
  onClose,
  onOpenCalibration,
  onOpenWeightsModal,
  weights = DEFAULT_WEIGHTS
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'pillars' | 'playbook' | 'provenance'>('overview');
  const handleOpenCalibration = onOpenCalibration || onOpenWeightsModal;
  if (!isOpen) return null;

  return (
    <div className="pi-dialog-overlay fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto bg-slate-950/70 backdrop-blur-sm animate-fadeIn">
      <div 
        className="pi-dialog-panel relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden text-slate-100"
        role="dialog"
        aria-labelledby="pulseiq-modal-title"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800/80 bg-slate-950/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <Scale className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="pulseiq-modal-title" className="text-xl font-bold font-display text-white tracking-tight">
                  Understanding PulseIQ™ Scoring
                </h2>
                <span className="px-2 py-0.5 text-xs font-semibold uppercase tracking-wider bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 rounded-md">
                  White-Box Formula
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Actuarial, deterministic account prioritization for EMS & Fire territory intelligence
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/30 px-6 gap-2">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-3 px-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'overview'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            Overview & Score Tiers
          </button>
          <button
            onClick={() => setActiveTab('pillars')}
            className={`py-3 px-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'pillars'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Four-factor Methodology
          </button>
          <button
            onClick={() => setActiveTab('playbook')}
            className={`py-3 px-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'playbook'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            Sales Prioritization Playbook
          </button>
          <button
            onClick={() => setActiveTab('provenance')}
            className={`py-3 px-3 text-xs font-semibold border-b-2 transition-all flex items-center gap-2 ${
              activeTab === 'provenance'
                ? 'border-cyan-500 text-cyan-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Data Sources & Verification
          </button>
        </div>

        {/* Modal Body Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-300 text-sm">
          {/* TAB: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="bg-gradient-to-r from-cyan-950/30 to-blue-950/20 border border-cyan-800/40 rounded-xl p-4 sm:p-5">
                <h3 className="text-base font-bold text-white mb-2 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  What is PulseIQ™?
                </h3>
                <p className="text-slate-300 text-sm leading-relaxed">
                  PulseIQ™ is a transparent prioritization estimate (0–100) based on fleet condition, cardiac call volume, grant readiness, and software status across EMS and fire departments.
                </p>
                <p className="text-slate-300 text-sm leading-relaxed mt-2">
                  PulseIQ™ is a deterministic model based on available fleet, cardiac-volume, grant, and software inputs. Local claim-denial rates and claim-based recovery estimates are excluded from the score; imported claim summaries remain available for separate review.
                </p>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                  Score Interpretation & Lead Tier Matrix
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {/* Tier 1 */}
                  <div className="p-4 rounded-xl border border-red-500/30 bg-red-950/10">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-500/20 text-red-400 border border-red-500/30">
                        88 – 100 PTS
                      </span>
                      <span className="text-xs font-semibold text-red-300 uppercase tracking-wider">
                        Immediate Action (Tier 1)
                      </span>
                    </div>
                    <div className="font-semibold text-white text-sm mb-1">
                      Active Capital Procurement Cycle
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      End-of-life competitor fleet (≥ 8–10 years old) paired with an active FEMA AFG grant award or documented billing issues. Organization has budget or acute pain. Deploy direct rep visit within 7 days.
                    </p>
                  </div>

                  {/* Tier 2 */}
                  <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-950/10">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="px-2 py-0.5 rounded text-xs font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                        75 – 87 PTS
                      </span>
                      <span className="text-xs font-semibold text-amber-300 uppercase tracking-wider">
                        High Opportunity (Tier 2)
                      </span>
                    </div>
                    <div className="font-semibold text-white text-sm mb-1">
                      Budgeted Evaluation Window
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Fleet reaching replacement age (6–8 years) with high Medicare cardiac run volumes. Active clinical committee or upcoming fiscal renewal. Initiate RFP advisory and clinical evaluation trial.
                    </p>
                  </div>

                  {/* Tier 3 */}
                  <div className="p-4 rounded-xl border border-blue-500/30 bg-blue-950/10">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="px-2 py-0.5 rounded text-xs font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                        60 – 74 PTS
                      </span>
                      <span className="text-xs font-semibold text-blue-300 uppercase tracking-wider">
                        Medium Pipeline (Tier 3)
                      </span>
                    </div>
                    <div className="font-semibold text-white text-sm mb-1">
                      Mid-Term Nurture Target
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Fleet aged 4–6 years or mixed competitor software install. Target with clinical trial evidence, CPR quality case studies, and grant application writing assistance for upcoming funding cycles.
                    </p>
                  </div>

                  {/* Tier 4 */}
                  <div className="p-4 rounded-xl border border-slate-700 bg-slate-900/60">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="px-2 py-0.5 rounded text-xs font-bold bg-slate-800 text-slate-400 border border-slate-700">
                        &lt; 60 PTS
                      </span>
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                        Low Priority / Established
                      </span>
                    </div>
                    <div className="font-semibold text-slate-200 text-sm mb-1">
                      Stable or Fresh Capital Deployment
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Recent monitor purchase (&lt; 3 years old), or already fully equipped with ZOLL X Series ecosystem. Maintain low-touch account relationship and monitor for dispatch software renewal triggers.
                    </p>
                  </div>
                </div>
              </div>

              {/* Bottom Quick Action */}
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-400">
                    <Scale className="w-4 h-4" />
                  </div>
                  <div className="text-xs">
                    <span className="font-semibold text-white block">Custom Territory Weight Calibration</span>
                    <span className="text-slate-400">Territory managers can adjust individual pillar weights to fit specific quarter campaigns.</span>
                  </div>
                </div>
                {handleOpenCalibration && (
                  <button
                    onClick={() => {
                      onClose();
                      handleOpenCalibration();
                    }}
                    className="px-3 py-1.5 text-xs font-semibold text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 rounded-lg transition-colors whitespace-nowrap"
                  >
                    Calibrate Weights
                  </button>
                )}
              </div>
            </div>
          )}

          {/* TAB: PILLARS */}
          {activeTab === 'pillars' && (
            <PulseIqMethodologyFactors weights={weights} />
          )}

          {/* TAB: PLAYBOOK */}
          {activeTab === 'playbook' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                <h4 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-cyan-400" />
                  Field Prioritization Workflow
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  How Nick and sales territory managers turn PulseIQ numbers into closed business:
                </p>
              </div>

              <div className="space-y-3">
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex gap-4">
                  <div className="w-7 h-7 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    1
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-white uppercase tracking-wider mb-1">
                      Filter for Tier 1 Accounts (Score &ge; 88) in Your County
                    </h5>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Use the Lead Queue or Geographic Filter to isolate Tier 1 accounts. Sort by Fleet Age descending. These agencies have aging competitor devices with expiring repair warranties.
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex gap-4">
                  <div className="w-7 h-7 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    2
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-white uppercase tracking-wider mb-1">
                      Check Grant & Procurement Status
                    </h5>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Open Account 360 &rarr; Grants & Capital. If a FEMA AFG grant has been awarded, the agency has a strict 12-month period of performance to obligate funds. Lead with product specifications that match federal bid requirements.
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex gap-4">
                  <div className="w-7 h-7 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    3
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-white uppercase tracking-wider mb-1">
                      Arm Your Pitch with Reimbursement Recovery
                    </h5>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      When source records show Medicare Part B billing issues, present the ZOLL Billing / ePCR clinical documentation package. Show the Chief and Fiscal Director how automated ECG transmission and narrative validation can help reduce billing rejections.
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex gap-4">
                  <div className="w-7 h-7 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">
                    4
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-white uppercase tracking-wider mb-1">
                      Log Field Visit & Generate Brief
                    </h5>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Before walking into headquarters, generate the 1-Page Account Dossier directly from Account 360. Log meeting notes, competitive equipment serial numbers, and update the Sales Stage to &ldquo;Evaluation / Demo Scheduled&rdquo;.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: PROVENANCE */}
          {activeTab === 'provenance' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                <h4 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                  Primary Public Records & Statutory Citations
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Every data attribute behind PulseIQ is verified against authoritative government databases and public state regulatory bodies:
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/50">
                  <div className="flex items-center gap-2 text-white font-semibold text-xs mb-1">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    CMS Part B Ambulance Claims File
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Annual Medicare fee-for-service carrier data detailing allowed vs. non-allowed transport claims, denial percentages, and emergency ALS/BLS service ratios.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/50">
                  <div className="flex items-center gap-2 text-white font-semibold text-xs mb-1">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    FEMA Assistance to Firefighters Grants
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Federal Emergency Management Agency AFG and SAFER award public disclosures including federal share, grant activity type, and congressional district tracking.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/50">
                  <div className="flex items-center gap-2 text-white font-semibold text-xs mb-1">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    IDPH & State EMS Licensing Rosters
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    State Department of Public Health regulatory rosters confirming operating level (Paramedic, AEMT, Basic), ambulance fleet count, and primary service territory.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/50">
                  <div className="flex items-center gap-2 text-white font-semibold text-xs mb-1">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    CARES / NEMSIS Registry Telemetry
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    National and regional cardiac arrest benchmarking data quantifying out-of-hospital resuscitation volume and shockable rhythm response rates.
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-cyan-950/20 border border-cyan-800/30 text-xs text-slate-300">
                <span className="font-semibold text-cyan-300 block mb-1">Illinois FOIA & Municipal Transparency Compliance</span>
                All apparatus serial numbers, warranty expirations, and board meeting minutes are compiled pursuant to the Illinois Freedom of Information Act (5 ILCS 140/) and published municipal purchasing registries.
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-950/70">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>PulseIQ Algorithm v3.4 Active &bull; Fully Deterministic</span>
          </div>
          <div className="flex items-center gap-3">
            {handleOpenCalibration && (
              <button
                onClick={() => {
                  onClose();
                  handleOpenCalibration();
                }}
                className="px-4 py-2 text-xs font-semibold text-cyan-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors border border-slate-700"
              >
                Adjust Weights
              </button>
            )}
            <button
              onClick={onClose}
              className="px-5 py-2 text-xs font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-lg transition-colors shadow-sm"
            >
              Close Guide
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
