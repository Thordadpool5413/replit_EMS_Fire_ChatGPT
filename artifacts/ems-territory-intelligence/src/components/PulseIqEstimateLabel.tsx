import React from 'react';

export const PULSE_IQ_ESTIMATE_LABEL = 'PulseIQ estimate';

export const PulseIqEstimateLabel: React.FC<{ className?: string }> = ({
  className
}) => (
  <span className={className} data-testid="pulseiq-estimate-label">
    {PULSE_IQ_ESTIMATE_LABEL}
  </span>
);
