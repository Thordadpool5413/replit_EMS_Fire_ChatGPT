import React from 'react';
import type { PredictiveWeights } from '../types';
import { getPulseIqFormula, getPulseIqWeightDetails } from '../utils/pulseIqScoring';

type RegionalFactorValues = {
  clinicalAcuity: number;
  fleetObsolescence: number;
  budgetGrant: number;
  softwareWhitespace: number;
};

export const PulseIqRegionalTooltipFactors: React.FC<{
  values: RegionalFactorValues;
  weights: PredictiveWeights;
}> = ({ values, weights }) => {
  const valueByFactor = {
    clinical: values.clinicalAcuity,
    fleet: values.fleetObsolescence,
    software: values.softwareWhitespace,
    grant: values.budgetGrant
  };

  return (
    <>
      {getPulseIqWeightDetails(weights).factors.map((factor) => (
        <div
          key={factor.key}
          className="flex items-center justify-between text-slate-900 dark:text-slate-100"
        >
          <span>{factor.label} ({factor.weightPct.toFixed(1)}%):</span>
          <span className="font-bold tabular-nums">+{valueByFactor[factor.key]} pts</span>
        </div>
      ))}
      <div className="pt-1 text-slate-500 dark:text-slate-400">
        Formula: {getPulseIqFormula(weights)}
      </div>
    </>
  );
};
