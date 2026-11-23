import React from 'react';
import type { Agency } from '../types';
import { getPlanningValueExplanation } from '../utils/planningValueExplanation';

interface PlanningValueDisclosureProps {
  agency: Agency;
  compact?: boolean;
}

const money = (amount: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount);

export const PlanningValueDisclosure: React.FC<PlanningValueDisclosureProps> = ({
  agency,
  compact = false,
}) => {
  const explanation = getPlanningValueExplanation(agency);

  return (
    <details
      data-testid="planning-value-explanation"
      className={`planning-value-disclosure border-t border-slate-200 dark:border-slate-800 ${
        compact ? 'pt-1.5' : 'pt-2'
      }`}
      onClick={(event) => event.stopPropagation()}
    >
      <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-2 text-xs font-semibold text-slate-700 marker:hidden hover:text-blue-800 dark:text-slate-200 dark:hover:text-blue-300">
        <span>How the pipeline estimate is modeled</span>
        <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">Inputs &amp; assumptions</span>
      </summary>
      <div className="space-y-1 pb-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
        {explanation.status === 'method_missing' ? (
          <p>
            The calculation method, inputs, source period, and time horizon were not stored with this record.
            Calculation inputs and method are not available for this value.
          </p>
        ) : (
          <>
            {explanation.status === 'value_mismatch' && (
              <p className="font-semibold text-amber-700 dark:text-amber-300">
                The saved value differs from the attached model inputs.
              </p>
            )}
            <p>
              Formula: max(2, rounded population input ÷ {explanation.populationPerModeledUnit?.toLocaleString()})
              modeled units × {money(explanation.dollarsPerModeledUnit ?? 0)} per unit.
            </p>
            <p>
              Input: {explanation.populationInput?.toLocaleString()} population proxy
              {explanation.populationBasis ? ` — ${explanation.populationBasis}` : ''}.
              {' '}Modeled units: {explanation.modeledUnits?.toLocaleString()}.
            </p>
            <p>
              Period: {explanation.period || 'not specified'}.
              {' '}This pipeline-value estimate is illustrative, not an agency budget, vendor quote,
              confirmed procurement plan, or guaranteed revenue.
            </p>
          </>
        )}
      </div>
    </details>
  );
};
