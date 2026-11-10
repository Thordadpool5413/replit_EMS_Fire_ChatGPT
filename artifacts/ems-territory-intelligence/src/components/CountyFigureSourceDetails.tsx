import React from 'react';
import type {
  CountyFigureSourceKey,
  CountyFigureSourceMetadata,
} from '../types';
import { DataLabel } from './DataLabel';

type CountyFigureValues = Partial<Record<CountyFigureSourceKey, number | null | undefined>>;

interface CountyFigureSourceDetailsProps {
  countyFips: string;
  sources?: Partial<Record<CountyFigureSourceKey, CountyFigureSourceMetadata>>;
  /** Optional county record; when given, each row shows the figure value beside its source. */
  record?: CountyFigureValues | object;
  /** Hide the value column when values are already displayed elsewhere. */
  showValues?: boolean;
  /** Summary figures already shown immediately above this source section. */
  omitValuesFor?: readonly CountyFigureSourceKey[];
  /** Show the general FIPS / NEMSIS scope notes. Defaults to true; set false when explained once elsewhere. */
  showGeneralNotes?: boolean;
  /** Optional extra class for layout hooks. */
  className?: string;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export const COUNTY_FIGURES: Array<{ key: CountyFigureSourceKey; label: string; format: (v: number) => string }> = [
  { key: 'population', label: 'Population', format: (v) => v.toLocaleString() },
  { key: 'averageTransportMinutes', label: 'Average EMS transport time', format: (v) => `${v} min` },
  { key: 'annualCardiacArrestIncidents', label: 'Out-of-hospital cardiac arrests per year (OHCA)', format: (v) => v.toLocaleString() },
  { key: 'annualEmergencyTransports', label: 'Emergency transports per year', format: (v) => v.toLocaleString() },
  { key: 'seniorPopPct', label: 'Population age 65+', format: (v) => `${v.toFixed(1)}%` },
  { key: 'medianIncome', label: 'Median household income', format: (v) => `$${v.toLocaleString()}` },
  { key: 'povertyRatePct', label: 'Poverty rate', format: (v) => `${v.toFixed(1)}%` },
  { key: 'primaryCathLabDistanceMiles', label: 'Distance to primary cath lab', format: (v) => `${v.toFixed(1)} mi` },
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

/** Always-visible, aligned figure/source table. No disclosure is used. */
export const CountyFigureSourceDetails: React.FC<CountyFigureSourceDetailsProps> = ({
  countyFips,
  sources,
  record,
  showValues = true,
  omitValuesFor = [],
  showGeneralNotes = true,
  className,
}) => {
  const values = (record ?? {}) as CountyFigureValues;
  const withValues = showValues && Boolean(record);
  const hasMetadata = (key: CountyFigureSourceKey) => {
    const metadata = sources?.[key];
    return Boolean(metadata && Object.values(metadata).some(value => typeof value === 'string' && value.trim()));
  };
  const attached = COUNTY_FIGURES.filter(({ key }) => hasMetadata(key));
  const missing = COUNTY_FIGURES.filter(({ key }) => !hasMetadata(key));
  return (
    <div className={`county-figure-source-details cv-sources${className ? ` ${className}` : ''}`} data-testid={`sources-county-${countyFips}`}>
      {withValues && (
        <dl className="cv-source-figures" aria-label="County reference figures">
          {COUNTY_FIGURES.filter(({ key }) => !omitValuesFor.includes(key)).map(({ key, label, format }) => (
            <div key={key} data-figure-key={key}>
              <dt>{label}</dt>
              <dd>{isNum(values[key]) ? format(values[key]) : 'Not reported'}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className="cv-section-label"><span>{showGeneralNotes ? 'Sources & coverage' : 'Sources'}</span></div>
      {attached.length > 0 && <table className="cv-sources-table">
        <thead>
          <tr>
            <th scope="col">Figure</th>
            <th scope="col"><DataLabel kind="source">Source</DataLabel></th>
            <th scope="col"><DataLabel kind="period">Vintage</DataLabel></th>
            <th scope="col"><DataLabel kind="source">Source scope</DataLabel></th>
            <th scope="col"><DataLabel kind="period">Reporting period</DataLabel></th>
          </tr>
        </thead>
        <tbody>
          {attached.map(({ key, label }) => {
            const m = sources?.[key];
            const url = safeSourceUrl(m?.sourceUrl);
            const name = m?.source?.trim();
            const vintage = m?.vintage?.trim();
            const scope = m?.scope?.trim();
            const period = m?.reportingPeriod?.trim();
            return (
              <tr key={key} className="county-figure-source-record">
                <th scope="row">{label}</th>
                    <td data-label="Source">
                      {url ? (
                        <a href={url} target="_blank" rel="noopener noreferrer" className="cv-link">{name || 'Open source'}</a>
                      ) : name || <span className="cv-na">Not provided</span>}
                    </td>
                    <td data-label="Vintage">{vintage || <span className="cv-na">Not provided</span>}</td>
                    <td data-label="Source scope">{scope || <span className="cv-na">Not provided</span>}</td>
                    <td data-label="Reporting period">{period || <span className="cv-na">Not provided</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>}
      <p className="cv-sources-foot">
        {missing.length === COUNTY_FIGURES.length
          ? (showGeneralNotes ? 'Source details are not attached to the eight county figures displayed here.' : 'No source details attached to these 8 figures.')
          : missing.length > 0
            ? `Source details not attached for: ${missing.map(({ label }) => label).join('; ')}.`
            : 'Source scope and reporting periods are shown for each figure.'}
        {showGeneralNotes && (
          <>
            {' '}Display geography: county FIPS {countyFips}; this does not establish a source&apos;s own scope.
            {' '}NEMSIS v3.5 is a data standard, not a source citation.
          </>
        )}
      </p>
    </div>
  );
};
