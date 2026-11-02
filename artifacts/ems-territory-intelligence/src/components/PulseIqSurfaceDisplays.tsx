import React from 'react';
import { PulseIqEstimateLabel } from './PulseIqEstimateLabel';
import { formatScore } from '../utils/numberFormatting';

export const MobileDashboardPulseIqScore: React.FC<{
  agencyId: string;
  score: number | null | undefined;
}> = ({ agencyId, score }) => (
  <>
    <span data-testid={`mobile-dashboard-pulseiq-score-${agencyId}`} className="text-sm font-[650] tabular-nums leading-none">
      {score ?? '—'}
    </span>
    <PulseIqEstimateLabel className="text-[8px] font-medium text-slate-300 mt-0.5 whitespace-nowrap" />
  </>
);

export const MobileProviderSelectorPulseIqScore: React.FC<{
  agencyId: string;
  score: number | null | undefined;
}> = ({ agencyId, score }) => (
  <>
    <PulseIqEstimateLabel className="text-[10px] font-normal text-slate-400" />
    <span
      data-testid={`provider-selector-pulseiq-score-${agencyId}`}
      className="text-[#285EE8] dark:text-blue-400 font-bold"
    >
      {score ?? '—'}
    </span>
  </>
);

export const HomeMapPulseIqReadout: React.FC<{
  score: number | null | undefined;
}> = ({ score }) => (
  <>
    <span className="text-[10px] font-medium text-[#9CB1C7]">PulseIQ estimate · modeled average</span>
    <span data-testid="home-map-pulseiq-readout-value" className="text-sm font-bold tabular-nums text-[#67D6CE]">
      {score == null || !Number.isFinite(score) ? 'Not reported' : formatScore(score)}
    </span>
  </>
);

export const TerritoryMapPulseIqScore: React.FC<{
  score: number | null | undefined;
}> = ({ score }) => (
  <div data-testid="territory-map-pulseiq-details">
    <PulseIqEstimateLabel className="text-[11px] text-slate-500 font-medium block" />
    <span data-testid="territory-map-pulseiq-score" className="font-semibold text-blue-700 text-sm pi-data-number">
      {formatScore(score)}
    </span>
  </div>
);
