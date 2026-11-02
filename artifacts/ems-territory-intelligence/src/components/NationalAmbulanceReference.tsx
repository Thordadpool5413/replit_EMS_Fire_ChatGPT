import React from 'react';
import { ArrowUpRight, BadgeInfo, ChartNoAxesColumnIncreasing } from 'lucide-react';
import { getNationalRsnatReference } from '../services/nationalAmbulanceReference';

export function NationalAmbulanceReference() {
  const metric = getNationalRsnatReference();
  const count = (value: number) => value.toLocaleString('en-US');

  return (
    <section
      aria-label="National RSNAT claim-line denial reference"
      className="relative isolate overflow-hidden rounded-2xl border border-[#223a59] bg-[radial-gradient(ellipse_at_top_right,rgba(37,99,235,0.26),transparent_42%),linear-gradient(125deg,#0a1527_0%,#10243d_58%,#142b48_100%)] p-5 text-white shadow-[0_18px_45px_-28px_rgba(9,24,46,0.65)] sm:p-6"
    >
      <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-20 -z-10 h-64 w-64 rounded-full bg-blue-400/10 blur-3xl" />
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-200">
            <ChartNoAxesColumnIncreasing className="h-4 w-4" />
            National program reference
          </p>
          <h3 className="mt-2 text-lg font-bold tracking-tight text-white sm:text-xl">RSNAT claim-line denials</h3>
          <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-slate-200">{metric.scope}</p>
          <p className="mt-2 text-xs font-medium text-slate-400">{metric.reportingPeriod}</p>
        </div>
        <div className="flex shrink-0 items-center justify-between gap-5 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 sm:min-w-[250px] sm:flex-col sm:items-end sm:gap-1 sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 sm:text-right">
          <p className="text-4xl font-bold tabular-nums tracking-[-0.05em] text-white sm:text-5xl">
            {metric.ratePct.toFixed(2)}%
          </p>
          <p className="max-w-[185px] text-right text-xs leading-relaxed text-slate-300 sm:max-w-none">
            {count(metric.deniedClaimLines)} denied / {count(metric.outcomeClaimLines)} paid-or-denied lines
          </p>
        </div>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
        <p className="inline-flex items-center gap-2 text-xs text-slate-300">
          <BadgeInfo className="h-4 w-4 shrink-0 text-cyan-200" />
          Program reference only—not a state, county, or provider rate.
        </p>
        <a
          href={metric.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-xs font-semibold text-cyan-100 transition-colors hover:border-cyan-200/40 hover:bg-white/10"
        >
          CMS report · page 6
          <ArrowUpRight className="h-3.5 w-3.5" />
        </a>
      </div>
      <details className="group mt-3 text-xs text-slate-300">
        <summary className="w-fit cursor-pointer select-none font-medium text-slate-400 transition-colors hover:text-white">Calculation &amp; coverage</summary>
        <div className="mt-3 grid gap-2 border-l border-cyan-300/30 pl-3 leading-relaxed">
        <p>
          {count(metric.deniedClaimLines)} ÷ ({count(metric.paidClaimLines)} paid + {count(metric.deniedClaimLines)} denied) × 100 = {metric.ratePct.toFixed(2)}%.
        </p>
        <p>
          Independent, noninstitutional ambulance suppliers in the RSNAT program. Claim lines are not unique claims.
          This is not an all-emergency-ambulance or final post-appeal rate. Authorization decisions and selected medical-review results are separate measures.
        </p>
        </div>
      </details>
    </section>
  );
}
