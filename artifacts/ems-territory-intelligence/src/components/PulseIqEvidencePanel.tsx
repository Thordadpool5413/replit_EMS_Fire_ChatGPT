import React from 'react';
import type { Agency } from '../types';
import {
  evaluatePulseIqFactors,
  type PulseIqFactorEvaluation,
  type PulseIqScoreContributions
} from '../utils/pulseIqScoring';
import {
  hasMappedAgencyFactEvidence,
  hasReviewedAgencyFactEvidence
} from '../data/agencyFactEvidence';

interface PulseIqEvidencePanelProps {
  agency: Agency;
  compact?: boolean;
}

const contributionFieldMap: Record<PulseIqFactorEvaluation['key'], keyof PulseIqScoreContributions> = {
  fleet: 'fleetObsolescencePts',
  clinical: 'clinicalAcuityPts',
  grant: 'budgetGrantReadinessPts',
  software: 'softwareWhitespacePts'
};

const statusLabel = (agency: Agency, key: PulseIqFactorEvaluation['inputs'][number]['sourceKey']) => {
  if (hasReviewedAgencyFactEvidence(agency, key)) return 'Source reviewed';
  if (hasMappedAgencyFactEvidence(agency, key)) return 'Source linked · user verify';
  return 'No source mapped';
};

const getSafeSourceUrl = (url?: string): string | null => {
  try {
    const parsed = new URL(url || '');
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
};

export const PulseIqEvidencePanel: React.FC<PulseIqEvidencePanelProps> = ({
  agency,
  compact = false
}) => {
  const factors = evaluatePulseIqFactors(agency);

  return (
    <section
      aria-label="PulseIQ score inputs and evidence"
      data-testid="pulseiq-input-evidence"
      className={`rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 ${
        compact ? 'p-3' : 'p-4'
      }`}
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">PulseIQ inputs and evidence</h3>
        <span className="text-[11px] text-slate-500 dark:text-slate-400">4 operational factors · local claims excluded</span>
      </div>

      <div className="space-y-2.5">
        {factors.map((factor) => {
          const storedContribution = agency.zollOpportunity?.scoreBreakdown?.[contributionFieldMap[factor.key]];
          const contribution = typeof storedContribution === 'number' && Number.isFinite(storedContribution)
            ? storedContribution
            : factor.contributionPts;
          const effectiveWeight = factor.baseScore > 0
            ? contribution / factor.baseScore * 100
            : factor.weightPct;

          return (
            <article
              key={factor.key}
              className="rounded-lg border border-slate-100 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-900/70"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-100">{factor.label}</h4>
                  <p className="mt-1 text-[11px] font-medium text-slate-700 dark:text-slate-300">
                    Factor value: {factor.baseScore}/100
                    <span className="mx-1 text-slate-400">×</span>
                    {effectiveWeight.toFixed(1)}% weight
                    <span className="mx-1 text-slate-400">=</span>
                    <strong className="text-blue-700 dark:text-blue-300">+{contribution.toFixed(1)} score points</strong>
                  </p>
                </div>
              </div>

              <div className="mt-2 space-y-2">
                {factor.inputs.map((input) => {
                  const evidence = agency.factEvidence?.[input.sourceKey];
                  const status = statusLabel(agency, input.sourceKey);
                  const reviewed = hasReviewedAgencyFactEvidence(agency, input.sourceKey);
                  const mapped = hasMappedAgencyFactEvidence(agency, input.sourceKey);
                  const sourceUrl = getSafeSourceUrl(evidence?.sourceUrl);

                  return (
                    <div key={`${factor.key}-${input.label}`} className="border-t border-slate-200/80 pt-2 dark:border-slate-800">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">{input.label}</span>
                        <span className="text-[11px] font-semibold text-slate-800 dark:text-slate-100">{input.valueUsed}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-slate-500 dark:text-slate-400">
                        <span className={reviewed ? 'text-emerald-700 dark:text-emerald-300' : mapped ? 'text-sky-700 dark:text-sky-300' : 'text-amber-700 dark:text-amber-300'}>
                          {status}
                        </span>
                        {input.usedDefault && <span>· model fallback used</span>}
                        {evidence?.sourceName && <span>· {evidence.sourceName}</span>}
                        {evidence?.sourceRecordId && <span>· record {evidence.sourceRecordId}</span>}
                        {evidence?.reportingPeriod && <span>· {evidence.reportingPeriod}</span>}
                        {sourceUrl && (
                          <a
                            href={sourceUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-blue-700 hover:underline dark:text-blue-300"
                          >
                            Open source
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <details className="mt-2 text-[10px] text-slate-500 dark:text-slate-400">
                <summary className="cursor-pointer font-medium hover:text-slate-700 dark:hover:text-slate-200">
                  Scoring rule
                </summary>
                <p className="mt-1 leading-relaxed">{factor.method}</p>
              </details>
            </article>
          );
        })}
      </div>

      <p className="mt-3 text-[10px] leading-relaxed text-slate-500 dark:text-slate-400">
        A linked source is a path for you to verify the value, not proof that it is correct. Unmapped values and fallbacks should be checked directly with the agency. Claim counts and citations are separate from PulseIQ.
      </p>
    </section>
  );
};
