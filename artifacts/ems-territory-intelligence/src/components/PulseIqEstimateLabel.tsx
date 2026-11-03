import React from 'react';
import { formatScore } from '../utils/numberFormatting';

export const PULSE_IQ_ESTIMATE_LABEL = 'PulseIQ estimate';

export interface PulseIqScoreSummary {
  availableCount: number;
  missingCount: number;
  averageScore: number | null;
}

export function summarizePulseIqScores(
  scores: readonly (number | null | undefined)[]
): PulseIqScoreSummary {
  const availableScores = scores.filter(
    (score): score is number => typeof score === 'number' && Number.isFinite(score)
  );

  return {
    availableCount: availableScores.length,
    missingCount: scores.length - availableScores.length,
    averageScore: availableScores.length
      ? availableScores.reduce((total, score) => total + score, 0) / availableScores.length
      : null,
  };
}

export function describePulseIqScoreSummary(summary: PulseIqScoreSummary): string {
  const estimateSummary = summary.averageScore === null
    ? 'no available estimates'
    : `average PulseIQ estimate ${formatScore(summary.averageScore)}`;
  const missingSummary = summary.missingCount
    ? `; ${summary.missingCount} ${summary.missingCount === 1 ? 'estimate' : 'estimates'} not reported`
    : '';

  return `${summary.availableCount} ${summary.availableCount === 1 ? 'estimate' : 'estimates'} available; ${estimateSummary}${missingSummary}`;
}

export const PulseIqEstimateLabel: React.FC<{ className?: string }> = ({
  className
}) => (
  <span className={className} data-testid="pulseiq-estimate-label">
    {PULSE_IQ_ESTIMATE_LABEL}
  </span>
);

export const PulseIqClusterSummary: React.FC<{
  scores: readonly (number | null | undefined)[];
}> = ({ scores }) => {
  const summary = summarizePulseIqScores(scores);

  return (
    <span
      aria-label={describePulseIqScoreSummary(summary)}
      data-testid="pulseiq-cluster-summary"
      className="flex flex-col items-center leading-none"
    >
      <span className="mt-0.5 text-[9px] font-semibold text-blue-200">
        {summary.averageScore === null
          ? 'No estimates'
          : `Avg ${formatScore(summary.averageScore)}`}
      </span>
      <span className="mt-0.5 text-[8px] font-medium text-slate-300">
        {summary.availableCount} available
        {summary.missingCount > 0 && ` · ${summary.missingCount} missing`}
      </span>
    </span>
  );
};

export const PulseIqMarkerEstimate: React.FC<{
  agencyId: string;
  score: number | null | undefined;
  compact?: boolean;
}> = ({ agencyId, score, compact = false }) => {
  const hasScore = typeof score === 'number' && Number.isFinite(score);
  const scoreLabel = hasScore ? formatScore(score) : 'Not reported';

  return (
    <div
      aria-label={`${PULSE_IQ_ESTIMATE_LABEL}: ${scoreLabel}`}
      data-testid={`pulseiq-marker-estimate-${agencyId}`}
      className={
        compact
          ? 'inline-flex flex-col items-start whitespace-nowrap rounded border border-slate-600/80 bg-slate-950/95 px-1.5 py-1 text-left'
          : 'mb-1 flex flex-col items-center whitespace-nowrap rounded-md border border-slate-600/80 bg-slate-950/95 px-2 py-1 text-center shadow-md'
      }
    >
      <PulseIqEstimateLabel className={`${compact ? 'text-[9px]' : 'text-[8px]'} font-medium leading-none text-slate-300`} />
      <span className={`${compact ? 'mt-1 text-xs' : 'mt-0.5 text-[10px]'} font-bold leading-none tabular-nums text-white`}>
        {scoreLabel}
      </span>
    </div>
  );
};
