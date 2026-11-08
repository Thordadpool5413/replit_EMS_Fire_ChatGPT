import React from 'react';
import { ArrowRight, ExternalLink, HeartPulse, MapPin, ShieldAlert, Timer, Users } from 'lucide-react';
import type { CountyFigureSourceKey, CountyHealthRecord } from '../types';
import { CountyFigureSourceDetails } from './CountyFigureSourceDetails';
import { FEMA_NRI_RATING_COLORS } from '../utils/femaNriRisk';
import { formatCoordinates, uniquePlaceNames } from '../utils/countyPresentation';
import './CountyDirectoryCard.css';

/** Minimal structural view of the FEMA NRI county record used by this card. */
export interface CountyBriefNriRecord {
  riskRating?: string | null;
  riskScore?: number | null;
  sourceVersion?: string | null;
}

interface CountyDirectoryCardProps {
  county: CountyHealthRecord;
  nri?: CountyBriefNriRecord;
  /** Already-sanitized http(s) FEMA source URL, if any. */
  nriSourceUrl?: string;
  nriLoading: boolean;
  nriError: boolean;
  onInspectCounty: () => void;
  onSelectPlace: (placeName: string) => void;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const NOT_REPORTED = 'Not reported';

const CONTEXT_FIGURES: Array<{ key: CountyFigureSourceKey; label: string; format: (v: number) => React.ReactNode }> = [
  { key: 'annualEmergencyTransports', label: 'Emergency transports / yr', format: v => v.toLocaleString() },
  { key: 'seniorPopPct', label: 'Age 65+', format: v => `${v.toFixed(1)}%` },
  { key: 'medianIncome', label: 'Median household income', format: v => `$${v.toLocaleString()}` },
  { key: 'povertyRatePct', label: 'Poverty rate', format: v => `${v.toFixed(1)}%` },
  { key: 'primaryCathLabDistanceMiles', label: 'Primary cath lab', format: v => <>{v.toFixed(1)}<small> mi</small></> },
];

const ALL_FIGURE_KEYS: CountyFigureSourceKey[] = [
  'population', 'averageTransportMinutes', 'annualCardiacArrestIncidents',
  ...CONTEXT_FIGURES.map(f => f.key),
];

export const CountyDirectoryCard: React.FC<CountyDirectoryCardProps> = ({
  county: c, nri, nriSourceUrl, nriLoading, nriError, onInspectCounty, onSelectPlace,
}) => {
  const values = c as unknown as Record<string, unknown>;
  const places = uniquePlaceNames(c.cities && c.cities.length > 0 ? c.cities : [c.countySeat]);
  const hasMappedPlaces = Boolean(c.cities && c.cities.length > 0);
  const riskColor = nri?.riskRating ? FEMA_NRI_RATING_COLORS[nri.riskRating] : undefined;
  const nriScore = isNum(nri?.riskScore) ? nri!.riskScore!.toFixed(2) : null;
  const vintage = nri?.sourceVersion && nri.sourceVersion !== 'Version not stated' ? nri.sourceVersion : null;
  const zips = c.primaryZipCodes ?? [];
  const titleId = `county-card-title-${c.countyFips}`;

  const metric = (
    key: CountyFigureSourceKey, label: string, unit: string | null, testid: string,
    Icon: React.ComponentType<{ 'aria-hidden'?: boolean | 'true' }>, title?: string,
  ) => {
    const v = values[key];
    return (
      <div className="cb-metric" data-figure-key={key}>
        <span className="cb-metric-glyph"><Icon aria-hidden="true" /></span>
        <dl className="cb-metric-text">
          <dt title={title}>{label}</dt>
          <dd data-testid={testid}>
            {isNum(v) ? <>{v.toLocaleString()}{unit && <small> {unit}</small>}</> : <span className="cb-na">{NOT_REPORTED}</span>}
          </dd>
        </dl>
      </div>
    );
  };

  return (
    <article aria-labelledby={titleId} className="county-brief county-signal-row" data-testid={`row-county-signals-${c.countyFips}`}>
      <header className="cb-head">
        <div className="cb-ident">
          <p className="cb-eyebrow">County brief</p>
          <h3 id={titleId} className="cb-name">{c.countyName}</h3>
          <p className="cb-seat"><MapPin aria-hidden="true" /> Seat <strong>{c.countySeat}</strong></p>
        </div>

        <section className="cb-risk" aria-label="FEMA National Risk Index hazard risk">
          <p className="cb-risk-label"><ShieldAlert aria-hidden="true" /> FEMA hazard-risk category</p>
          {nriLoading ? (
            <span className="cb-risk-status" role="status">Loading FEMA record</span>
          ) : nriError ? (
            <span className="cb-risk-status" role="status">FEMA NRI source unavailable</span>
          ) : nri ? (
            <>
              <span
                className={`cb-risk-chip${riskColor ? '' : ' cb-risk-chip--none'}`}
                style={{ '--cb-risk': riskColor ?? '#b6c1cf' } as React.CSSProperties}
                data-testid={`text-fema-nri-rating-${c.countyFips}`}
              >
                {nri.riskRating || 'Rating not stated'}
              </span>
              <p className="cb-risk-meta">
                <span data-testid={`text-fema-nri-score-${c.countyFips}`}>
                  {nriScore ? <>Score <strong>{nriScore}</strong></> : 'Score not stated'}
                </span>
                <span>{vintage ? `Vintage ${vintage}` : 'Vintage not stated'}</span>
                {nriSourceUrl && (
                  <a className="cb-link cb-link--onband" href={nriSourceUrl} target="_blank" rel="noopener noreferrer" data-testid={`link-fema-nri-${c.countyFips}`}>
                    FEMA source <ExternalLink aria-hidden="true" />
                  </a>
                )}
              </p>
            </>
          ) : (
            <span className="cb-risk-chip cb-risk-chip--none" data-testid={`text-fema-nri-rating-${c.countyFips}`}>No county-equivalent record</span>
          )}
        </section>

        <button
          type="button"
          className="cb-inspect"
          onClick={onInspectCounty}
          aria-label={`Inspect ${c.countyName}`}
          data-testid={`button-inspect-county-${c.countyFips}`}
        >
          Inspect county <ArrowRight aria-hidden="true" />
        </button>
      </header>

      <div className="cb-metrics" role="group" aria-label={`Key county figures for ${c.countyName}`}>
        {metric('population', 'Population', null, `text-county-population-${c.countyFips}`, Users)}
        {metric('averageTransportMinutes', 'Avg EMS transport', 'min', `text-county-transport-${c.countyFips}`, Timer)}
        {metric('annualCardiacArrestIncidents', 'Cardiac arrests / yr', null, `text-county-ohca-${c.countyFips}`, HeartPulse, 'Out-of-hospital cardiac arrest incidents per year')}
      </div>

      <div className="cb-body county-profile-details-content" data-testid={`details-county-context-${c.countyFips}`}>
        <div className="cb-context-wrap">
        <p className="cb-group-label">Operating context</p>
        <dl className="cb-context" aria-label={`Supporting figures for ${c.countyName}`}>
          {CONTEXT_FIGURES.map(({ key, label, format }) => {
            const v = values[key];
            return (
              <div key={key} data-figure-key={key}>
                <dt>{label}</dt>
                <dd>{isNum(v) ? format(v) : <span className="cb-na">{NOT_REPORTED}</span>}</dd>
              </div>
            );
          })}
        </dl>
        </div>

        <dl className="cb-geo" aria-label={`Geography for ${c.countyName}`}>
          <div><dt>FIPS</dt><dd>{c.countyFips}</dd></div>
          <div><dt>Land area</dt><dd>{isNum(c.landAreaSqMiles) ? `${c.landAreaSqMiles.toLocaleString()} sq mi` : NOT_REPORTED}</dd></div>
          <div><dt>Centroid</dt><dd>{formatCoordinates(c.centroidLat, c.centroidLng, 3)}</dd></div>
          <div className="cb-geo-zips"><dt>ZIPs{zips.length ? ` (${zips.length})` : ''}</dt><dd>{zips.length > 0 ? zips.join(', ') : 'None listed'}</dd></div>
        </dl>

        <div className="cb-places">
          <span className="cb-places-label">
            {hasMappedPlaces ? <>Mapped places <span className="cb-count">{places.length}</span></> : 'County seat reference'}
          </span>
          <div className="cb-place-list county-profile-city-list" role="group" aria-label={`Mapped places for ${c.countyName}`}>
            {places.map(name => (
              <button
                key={`${c.stateCode}-${c.countyName}-${name}`}
                type="button"
                className="cb-place county-profile-place-button"
                onClick={() => onSelectPlace(name)}
              >
                {name}
              </button>
            ))}
          </div>
        </div>

        <CountyFigureSourceDetails
          countyFips={c.countyFips}
          sources={c.figureSources}
          record={c}
          showValues={false}
          omitValuesFor={ALL_FIGURE_KEYS}
          showGeneralNotes={false}
          className="cb-sources"
        />
      </div>
    </article>
  );
};
