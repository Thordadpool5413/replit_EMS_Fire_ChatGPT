import React from 'react';
import { getNationalRsnatReference } from '../services/nationalAmbulanceReference';

export function NationalAmbulanceReference() {
  const metric = getNationalRsnatReference();
  const count = (value: number) => value.toLocaleString('en-US');

  return (
    <section
      aria-label="National RSNAT claim-line denial reference"
      className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 text-slate-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-slate-200"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">
            National program reference
          </p>
          <h3 className="mt-1 text-sm font-semibold">RSNAT claim-line denials</h3>
          <p className="mt-1 text-xs">{metric.scope}</p>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{metric.reportingPeriod}</p>
        </div>
        <div className="shrink-0 sm:text-right">
          <p className="text-3xl font-semibold tabular-nums tracking-tight text-blue-800 dark:text-blue-200">
            {metric.ratePct.toFixed(2)}%
          </p>
          <p className="mt-1 text-xs">
            {count(metric.deniedClaimLines)} denied / {count(metric.outcomeClaimLines)} paid-or-denied lines
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-blue-200/70 pt-2 text-[11px] dark:border-blue-900">
        <p>Program reference only—not a state, county, or provider rate.</p>
        <a
          href={metric.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-blue-700 underline underline-offset-2 dark:text-blue-300"
        >
          CMS report · page 6
        </a>
      </div>
      <details className="mt-2 text-[11px] text-slate-600 dark:text-slate-400">
        <summary className="cursor-pointer font-medium">Calculation &amp; coverage</summary>
        <p className="mt-1">
          {count(metric.deniedClaimLines)} ÷ ({count(metric.paidClaimLines)} paid + {count(metric.deniedClaimLines)} denied) × 100 = {metric.ratePct.toFixed(2)}%.
        </p>
        <p className="mt-1">
          Independent, noninstitutional ambulance suppliers in the RSNAT program. Claim lines are not unique claims.
          This is not an all-emergency-ambulance or final post-appeal rate. Authorization decisions and selected medical-review results are separate measures.
        </p>
      </details>
    </section>
  );
}
