import React from 'react';
import { Users, Ambulance, HeartPulse, Timer, Hospital, UserRound, HandCoins, Wallet, ExternalLink } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
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
  /**
   * 'table' (default): flat figure grid and aligned source table, used by generic surfaces.
   * 'brief': county brief composition. Primary figures (population, average EMS transport time, cardiac arrests)
   * lead; care/community context follows as a ledger; sources become a citation list that
   * prints only the metadata actually supplied (no repeated "Not provided" cells).
   */
  variant?: 'table' | 'brief';
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

/** Brief-variant presentation: short labels, icon, unit split from number, tone. */
const BRIEF: Record<CountyFigureSourceKey, { short: string; Icon: LucideIcon; tone: string; unit?: string; num: (v: number) => string }> = {
  population: { short: 'Population', Icon: Users, tone: 'community', num: v => v.toLocaleString() },
  annualEmergencyTransports: { short: 'EMS transports', Icon: Ambulance, tone: 'ops', unit: '/yr', num: v => v.toLocaleString() },
  annualCardiacArrestIncidents: { short: 'Cardiac arrests', Icon: HeartPulse, tone: 'cardiac', unit: '/yr', num: v => v.toLocaleString() },
  averageTransportMinutes: { short: 'Avg transport time', Icon: Timer, tone: 'ops', unit: 'min', num: v => v.toLocaleString() },
  primaryCathLabDistanceMiles: { short: 'Nearest cath lab', Icon: Hospital, tone: 'access', unit: 'mi', num: v => v.toFixed(1) },
  seniorPopPct: { short: 'Age 65+', Icon: UserRound, tone: 'community', unit: '%', num: v => v.toFixed(1) },
  povertyRatePct: { short: 'Poverty rate', Icon: HandCoins, tone: 'community', unit: '%', num: v => v.toFixed(1) },
  medianIncome: { short: 'Median income', Icon: Wallet, tone: 'community', num: v => `$${v.toLocaleString()}` },
};
const PRIMARY: CountyFigureSourceKey[] = ['population', 'averageTransportMinutes', 'annualCardiacArrestIncidents'];
const CONTEXT: CountyFigureSourceKey[] = ['annualEmergencyTransports', 'primaryCathLabDistanceMiles', 'seniorPopPct', 'povertyRatePct', 'medianIncome'];

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
  variant = 'table',
}) => {
  const values = (record ?? {}) as CountyFigureValues;
  const withValues = showValues && Boolean(record);
  const hasMetadata = (key: CountyFigureSourceKey) => {
    const metadata = sources?.[key];
    return Boolean(metadata && Object.values(metadata).some(value => typeof value === 'string' && value.trim()));
  };
  const attached = COUNTY_FIGURES.filter(({ key }) => hasMetadata(key));
  const visibleFigures = COUNTY_FIGURES.filter(({ key }) => !omitValuesFor.includes(key));
  if (!attached.length && !showGeneralNotes && (!withValues || !visibleFigures.length)) return null;

  const notes = showGeneralNotes && (
    <p className="cv-sources-foot">
      Display geography: county FIPS {countyFips}; this does not establish a source&apos;s own scope.
      {' '}NEMSIS v3.5 is a data standard, not a source citation.
    </p>
  );

  if (variant === 'brief') {
    const shown = (keys: CountyFigureSourceKey[]) => keys.filter(k => !omitValuesFor.includes(k));
    const figure = (key: CountyFigureSourceKey) => {
      const b = BRIEF[key];
      const v = values[key];
      const full = COUNTY_FIGURES.find(f => f.key === key)!.label;
      return (
        <div key={key} data-figure-key={key} data-tone={b.tone} className="cfs-fig">
          <dt title={full}><b.Icon className="cfs-ico" aria-hidden="true" /><span>{b.short}</span></dt>
          <dd>{isNum(v) ? <>{b.num(v)}{b.unit && <small>{b.unit}</small>}</> : <span className="cfs-na">Not reported</span>}</dd>
        </div>
      );
    };
    const lead = shown(PRIMARY);
    const ctx = shown(CONTEXT);
    return (
      <div className={`county-figure-source-details cv-sources cfs-brief${className ? ` ${className}` : ''}`} data-testid={`sources-county-${countyFips}`}>
        {withValues && lead.length > 0 && <dl className="cfs-lead" aria-label="Primary county figures">{lead.map(figure)}</dl>}
        {withValues && ctx.length > 0 && <dl className="cfs-ledger" aria-label="Care access and community context">{ctx.map(figure)}</dl>}
        {attached.length > 0 && (
          <div className="cfs-cites">
            <p className="cv-section-label"><span>Sources</span></p>
            <ul className="cfs-cite-list">
              {attached.map(({ key, label }) => {
                const m = sources?.[key];
                const url = safeSourceUrl(m?.sourceUrl);
                const name = m?.source?.trim();
                const parts = [
                  m?.vintage?.trim() && <span key="v"><DataLabel kind="period">Vintage</DataLabel> {m!.vintage!.trim()}</span>,
                  m?.scope?.trim() && <span key="s">{m!.scope!.trim()}</span>,
                  m?.reportingPeriod?.trim() && <span key="p"><DataLabel kind="period">Period</DataLabel> {m!.reportingPeriod!.trim()}</span>,
                ].filter(Boolean);
                return (
                  <li key={key} className="county-figure-source-record" data-figure-key-source={key}>
                    <span className="cfs-cite-fig">{BRIEF[key].short}</span>
                    {url ? (
                      <a href={url} target="_blank" rel="noopener noreferrer" className="cv-link" title={label}>{name || 'Open source'}<ExternalLink aria-hidden="true" /></a>
                    ) : name ? <span className="cfs-cite-name">{name}</span> : null}
                    {parts.length > 0 && <span className="cfs-cite-meta">{parts}</span>}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        {notes}
      </div>
    );
  }

  return (
    <div className={`county-figure-source-details cv-sources${className ? ` ${className}` : ''}`} data-testid={`sources-county-${countyFips}`}>
      {withValues && (
        <dl className="cv-source-figures" aria-label="County reference figures">
          {visibleFigures.map(({ key, label, format }) => (
            <div key={key} data-figure-key={key}>
              <dt>{label}</dt>
              <dd>{isNum(values[key]) ? format(values[key]) : 'Not reported'}</dd>
            </div>
          ))}
        </dl>
      )}
      {(attached.length > 0 || showGeneralNotes) && <div className="cv-section-label"><span>{showGeneralNotes ? 'Sources & coverage' : 'Sources'}</span></div>}
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
      {notes}
    </div>
  );
};
