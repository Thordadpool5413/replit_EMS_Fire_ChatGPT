import React from 'react';
import type { PredictiveWeights } from '../types';
import type { PulseIqScoreExplanation } from '../utils/pulseIqExplanation';
import { getPulseIqFormula } from '../utils/pulseIqScoring';

export const PulseIqProfileFactorDetails: React.FC<{
  explanation: PulseIqScoreExplanation;
  weights: PredictiveWeights;
  variant: 'compact' | 'full';
}> = ({ explanation, weights, variant }) => {
  const getUrgencyBadge = (level: string) => {
    switch (level) {
      case 'Critical':
        return 'bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300';
      case 'Elevated':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300';
      case 'Moderate':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-950/80 dark:text-blue-300';
      default:
        return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
    }
  };

  return (
    <>
      <div className={variant === 'compact'
        ? 'mb-3 rounded-lg border border-indigo-100 dark:border-slate-700 bg-white/70 dark:bg-slate-800/60 px-3 py-2 font-mono text-[10px] text-indigo-800 dark:text-indigo-300'
        : 'mb-4 rounded-lg border border-indigo-100 dark:border-slate-700 bg-indigo-50/50 dark:bg-slate-800/60 px-3 py-2 font-mono text-xs text-indigo-800 dark:text-indigo-300'}>
        PulseIQ estimate = {getPulseIqFormula(weights)}
      </div>
      <div className={variant === 'compact' ? 'space-y-2 my-2.5' : 'my-5 space-y-3'}>
        {explanation.factors.map((factor, index) => (
          variant === 'compact' ? (
            <div key={factor.id} className="p-2 rounded-lg bg-white dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 text-xs">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5 truncate pr-2">
                  <span className="font-semibold text-slate-800 dark:text-slate-200 text-[11px] truncate">
                    {factor.name}
                  </span>
                  <span className="text-[10px] text-slate-400 shrink-0">({factor.weightPct.toFixed(1)}% weight)</span>
                </div>
                <span className="pi-data-number font-bold text-indigo-700 dark:text-indigo-400 text-[11px] shrink-0">
                  +{factor.pointsContributed} pts
                </span>
              </div>
              <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-600 dark:bg-indigo-500 rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.max(10, factor.componentScore))}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                <span className="truncate">{factor.agencyMetricValue}</span>
                <span className={`px-1.5 py-0.2 rounded font-semibold uppercase tracking-wider text-[9px] ${getUrgencyBadge(factor.urgencyLevel)}`}>
                  {factor.urgencyLevel}
                </span>
              </div>
              <p className="mt-1 text-[10px] leading-snug text-slate-500 dark:text-slate-400">{factor.method}</p>
            </div>
          ) : (
            <div key={factor.id} className="p-4 rounded-xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-xs font-bold flex items-center justify-center pi-data-number">
                    {index + 1}
                  </span>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">{factor.name}</h4>
                  <span className="text-xs text-slate-400 pi-data-inline">(Weight: {factor.weightPct.toFixed(1)}%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${getUrgencyBadge(factor.urgencyLevel)}`}>
                    {factor.urgencyLevel} Urgency
                  </span>
                  <div className="pi-data-number font-bold text-sm text-indigo-700 dark:text-indigo-400 bg-white dark:bg-slate-900 px-2 py-0.5 rounded border border-indigo-100 dark:border-slate-700">
                    +{factor.pointsContributed} Points
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-center my-2">
                <div className="md:col-span-3">
                  <div className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-600 dark:bg-indigo-500 rounded-full"
                      style={{ width: `${Math.min(100, Math.max(15, factor.componentScore))}%` }}
                    />
                  </div>
                </div>
                <div className="text-right text-xs pi-data-inline font-semibold text-slate-700 dark:text-slate-300">
                  Raw Index: <span className="pi-data-number font-semibold">{factor.componentScore}/100</span>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-2 border-t border-slate-200/50 dark:border-slate-700/50 text-xs">
                <div className="text-slate-500 dark:text-slate-400">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Observed Metric:</span> {factor.agencyMetricValue}
                </div>
                <div className="text-slate-600 dark:text-slate-300 font-medium">{factor.clinicalImpactSummary}</div>
              </div>
            </div>
          )
        ))}
      </div>
    </>
  );
};
