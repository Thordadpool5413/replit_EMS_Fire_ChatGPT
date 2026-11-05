import React from 'react';
import type {
  CountyFigureSourceKey,
  CountyFigureSourceMetadata,
} from '../types';

interface CountyFigureSourceDetailsProps {
  countyFips: string;
  sources?: Partial<Record<CountyFigureSourceKey, CountyFigureSourceMetadata>>;
}

const FIGURES: Array<{ key: CountyFigureSourceKey; label: string }> = [
  { key: 'population', label: 'Population reference' },
  { key: 'averageTransportMinutes', label: 'Average transport' },
  { key: 'annualCardiacArrestIncidents', label: 'Annual OHCA reference' },
  { key: 'annualEmergencyTransports', label: 'Annual emergency transports' },
  { key: 'seniorPopPct', label: 'Population age 65+' },
  { key: 'medianIncome', label: 'Median income' },
  { key: 'povertyRatePct', label: 'Poverty rate' },
  { key: 'primaryCathLabDistanceMiles', label: 'Primary cath lab distance' },
];

const safeSourceUrl = (value?: string) => {
  if (!value?.trim()) return undefined;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
};

export const CountyFigureSourceDetails: React.FC<CountyFigureSourceDetailsProps> = ({
  countyFips,
  sources,
}) => (
  <details
    className="county-figure-source-details group rounded-lg border border-slate-200 px-2.5 py-2 text-[10px] leading-relaxed text-slate-600"
    onClick={(event) => event.stopPropagation()}
  >
    <summary className="county-figure-source-summary flex cursor-pointer list-none items-center justify-between gap-2 font-semibold text-slate-700 [&::-webkit-details-marker]:hidden">
      <span>Data sources &amp; coverage</span>
      <span className="county-figure-source-toggle shrink-0 text-[10px] font-medium text-slate-500">
        <span className="group-open:hidden">Open details</span>
        <span className="hidden group-open:inline">Close details</span>
      </span>
    </summary>
    <div className="county-figure-source-content mt-2 space-y-2">
      {FIGURES.map(({ key, label }) => {
        const metadata = sources?.[key];
        const sourceUrl = safeSourceUrl(metadata?.sourceUrl);
        return (
          <div key={key} className="grid grid-cols-[minmax(5rem,auto)_1fr] gap-x-2 gap-y-0.5 border-t border-slate-100 pt-1.5 first:border-0 first:pt-0">
            <span className="font-semibold text-slate-700">{label}</span>
            <span>
              Source:{' '}
              {sourceUrl ? (
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-700 underline underline-offset-2"
                >
                  {metadata?.source?.trim() || 'Open source'}
                </a>
              ) : (
                metadata?.source?.trim() || 'Unavailable'
              )}
            </span>
            <span className="text-slate-500">Vintage</span>
            <span>{metadata?.vintage?.trim() || 'Unavailable'}</span>
            <span className="text-slate-500">Source scope</span>
            <span>{metadata?.scope?.trim() || 'Unavailable'}</span>
            <span className="text-slate-500">Reporting period</span>
            <span>{metadata?.reportingPeriod?.trim() || 'Unavailable'}</span>
            {key === 'annualCardiacArrestIncidents' && (
              <>
                <span className="text-slate-500">Note</span>
                <span>NEMSIS v3.5 is a data standard, not a citation for this county figure.</span>
              </>
            )}
          </div>
        );
      })}
      <p className="border-t border-slate-100 pt-1.5 text-slate-500">
        Display geography: county FIPS {countyFips}. This does not establish the source record&apos;s scope.
      </p>
    </div>
  </details>
);
