import React from 'react';
import type { Agency, PredictiveWeights } from '../types';
import { evaluatePulseIqFactors } from '../utils/pulseIqScoring';

interface PulseIqLeadFactorBarsProps {
  agency: Agency;
  weights?: PredictiveWeights;
}

const factorColors = {
  fleet: 'bg-amber-500',
  clinical: 'bg-[#1E3A8A] dark:bg-blue-500',
  grant: 'bg-emerald-600 dark:bg-emerald-500',
  software: 'bg-blue-500 dark:bg-blue-400'
} as const;

export const PulseIqLeadFactorBars: React.FC<PulseIqLeadFactorBarsProps> = ({
  agency,
  weights
}) => {
  const factors = evaluatePulseIqFactors(agency, weights);

  return (
    <section
      aria-label="PulseIQ factor scores and weighted contributions"
      className="space-y-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 p-3"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-200">
          PulseIQ factor contributions
        </h4>
        <p className="text-[10px] text-slate-500 dark:text-slate-400">
          Bars show weighted points; scores are unweighted
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5">
        {factors.map((factor) => (
          <div
            key={factor.key}
            aria-label={`${factor.label}: factor score ${factor.baseScore} out of 100; active normalized weight ${factor.weightPct.toFixed(1)} percent; weighted contribution ${factor.contributionPts.toFixed(1)} points`}
            className="min-w-0"
          >
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 text-[11px]">
              <span className="truncate font-medium text-slate-700 dark:text-slate-300">
                {factor.label}
              </span>
              <span className="shrink-0 tabular-nums text-slate-600 dark:text-slate-400">
                <span>Score {factor.baseScore}/100</span>
                <span className="mx-1 text-slate-400" aria-hidden="true">·</span>
                <span>Weight {factor.weightPct.toFixed(1)}%</span>
                <span className="mx-1 text-slate-400" aria-hidden="true">·</span>
                <span>+{factor.contributionPts.toFixed(1)} pts</span>
              </span>
            </div>
            <div
              role="img"
              aria-label={`${factor.label} weighted contribution: ${factor.contributionPts.toFixed(1)} of 100 points`}
              className="h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
            >
              <div
                className={`h-full rounded-full ${factorColors[factor.key]}`}
                style={{ width: `${Math.min(100, Math.max(0, factor.contributionPts))}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};
