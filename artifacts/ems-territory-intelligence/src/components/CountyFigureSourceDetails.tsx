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
    className="county-figure-source-details group min-w-0 rounded-lg border border-slate-200 px-2.5 py-2 text-xs leading-relaxed text-slate-600"
    onClick={(event) => event.stopPropagation()}
  >
    <summary className="county-figure-source-summary flex cursor-pointer list-none items-center justify-between gap-2 font-semibold text-slate-700 [&::-webkit-details-marker]:hidden">
      <span>Data sources &amp; coverage</span>
      <span className="county-figure-source-toggle shrink-0 text-[11px] font-medium text-slate-500">
        <span className="group-open:hidden">Open details</span>
        <span className="hidden group-open:inline">Close details</span>
      </span>
    </summary>
    <div className="county-figure-source-content mt-2 space-y-2">
      {FIGURES.map(({ key, label }) => {
        const metadata = sources?.[key];
        const sourceUrl = safeSourceUrl(metadata?.sourceUrl);
        return (
          <section key={key} className="county-figure-source-record">
            <h4 className="county-figure-source-record-title">{label}</h4>
            <dl className="county-figure-source-fields">
              <div className="county-figure-source-field">
                <dt>Source</dt>
                <dd>
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
                </dd>
              </div>
              <div className="county-figure-source-field">
                <dt>Vintage</dt>
                <dd>{metadata?.vintage?.trim() || 'Unavailable'}</dd>
              </div>
              <div className="county-figure-source-field">
                <dt>Source scope</dt>
                <dd>{metadata?.scope?.trim() || 'Unavailable'}</dd>
              </div>
              <div className="county-figure-source-field">
                <dt>Reporting period</dt>
                <dd>{metadata?.reportingPeriod?.trim() || 'Unavailable'}</dd>
              </div>
              {key === 'annualCardiacArrestIncidents' && (
                <div className="county-figure-source-field">
                  <dt>Note</dt>
                  <dd>NEMSIS v3.5 is a data standard, not a citation for this county figure.</dd>
                </div>
              )}
            </dl>
          </section>
        );
      })}
      <p className="border-t border-slate-100 pt-1.5 text-slate-500">
        Display geography: county FIPS {countyFips}. This does not establish the source record&apos;s scope.
      </p>
    </div>
  </details>
);
