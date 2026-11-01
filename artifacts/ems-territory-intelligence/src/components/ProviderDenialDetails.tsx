import React from 'react';
import type { AgencyMedicareDenialDisplayMetric } from '../services/agencyMedicareDenialService';

export function ProviderDenialDetails({ metric }: { metric: AgencyMedicareDenialDisplayMetric }) {
  const citation = `${metric.source}${metric.sourceReference ? ` · ${metric.sourceReference}` : ''}`;
  return (
    <details
      className="mt-1 text-left text-[10px] leading-4 text-slate-500 dark:text-slate-400"
      onClick={(event) => event.stopPropagation()}
    >
      <summary className="cursor-pointer font-medium text-blue-700 dark:text-blue-300">
        Claim counts &amp; source
      </summary>
      <div className="mt-1 space-y-0.5 break-words">
        <p>Billing NPI {metric.npi} · {metric.ratePct.toFixed(1)}%</p>
        <p>{metric.deniedClaimCount.toLocaleString()} denied / {metric.adjudicatedClaimCount.toLocaleString()} adjudicated</p>
        <p>Period: {metric.reportingPeriod}</p>
        <p>Scope: {metric.claimScope}</p>
        <p>Definition: {metric.denialDefinition}</p>
        {metric.sourceUrl ? (
          <a href={metric.sourceUrl} target="_blank" rel="noopener noreferrer" className="block underline underline-offset-2">
            Source: {citation}
          </a>
        ) : <p>Source: {citation}</p>}
      </div>
    </details>
  );
}
