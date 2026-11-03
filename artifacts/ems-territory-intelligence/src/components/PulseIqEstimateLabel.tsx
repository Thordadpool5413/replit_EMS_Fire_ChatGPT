import React from 'react';
import { formatScore } from '../utils/numberFormatting';

export const PULSE_IQ_ESTIMATE_LABEL = 'PulseIQ estimate';

export const PulseIqEstimateLabel: React.FC<{ className?: string }> = ({
  className
}) => (
  <span className={className} data-testid="pulseiq-estimate-label">
    {PULSE_IQ_ESTIMATE_LABEL}
  </span>
);

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
