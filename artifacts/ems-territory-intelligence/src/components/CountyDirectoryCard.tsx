import React from 'react';
import { ArrowRight, ExternalLink } from 'lucide-react';
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

const ALL_FIGURE_KEYS: CountyFigureSourceKey[] = [
  'population', 'averageTransportMinutes', 'annualCardiacArrestIncidents', 'annualEmergencyTransports',
  'seniorPopPct', 'medianIncome', 'povertyRatePct', 'primaryCathLabDistanceMiles',
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

  const num = (key: CountyFigureSourceKey, format: (v: number) => React.ReactNode) => {
    const v = values[key];
    return isNum(v) ? format(v) : <span className="cb-na">{NOT_REPORTED}</span>;
  };

  const fig = (
    key: CountyFigureSourceKey, label: React.ReactNode, value: React.ReactNode, testId?: string, title?: string,
  ) => (
    <div className={`cb-fig cb-fig--${key}`} data-figure-key={key}>
      <dt title={title}>{label}</dt>
      <dd data-testid={testId}>{value}</dd>
    </div>
  );

  return (
    <article aria-labelledby={titleId} className="county-brief county-signal-row" data-testid={`row-county-signals-${c.countyFips}`}>
      <header className="cb-head">
        <div className="cb-ident">
          <h3 id={titleId} className="cb-name">{c.countyName}</h3>
          <p className="cb-seat">Seat <strong>{c.countySeat}</strong><span className="cb-dot" aria-hidden="true" />FIPS {c.countyFips}</p>
        </div>
        <button
          type="button"
          className="cb-inspect"
          onClick={onInspectCounty}
          aria-label={`Inspect ${c.countyName}`}
          data-testid={`button-inspect-county-${c.countyFips}`}
        >
          Inspect <ArrowRight aria-hidden="true" />
        </button>
        <section className="cb-risk" aria-label="FEMA National Risk Index hazard risk">
          <span className="cb-risk-label" title="FEMA National Risk Index source-defined category">FEMA NRI</span>
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
              <span className="cb-risk-meta" data-testid={`text-fema-nri-score-${c.countyFips}`}>
                {nriScore ? <>Score <strong>{nriScore}</strong></> : 'Score not stated'}
              </span>
              <span className="cb-risk-meta">{vintage ? `Vintage ${vintage}` : 'Vintage not stated'}</span>
              {nriSourceUrl && (
                <a className="cb-link" href={nriSourceUrl} target="_blank" rel="noopener noreferrer" data-testid={`link-fema-nri-${c.countyFips}`}>
                  FEMA source <ExternalLink aria-hidden="true" />
                </a>
              )}
            </>
          ) : (
            <span className="cb-risk-chip cb-risk-chip--none" data-testid={`text-fema-nri-rating-${c.countyFips}`}>No county-equivalent record</span>
          )}
        </section>
      </header>

      <div className="cb-body county-profile-details-content" data-testid={`details-county-context-${c.countyFips}`}>
        <section className="cb-figs-wrap" aria-label={`County figures for ${c.countyName}`}>
          <dl className="cb-figs">
            {fig('averageTransportMinutes', 'Avg EMS transport',
              num('averageTransportMinutes', v => <>{v.toLocaleString()}<small> min</small></>), `text-county-transport-${c.countyFips}`)}
            {fig('annualEmergencyTransports', 'Emergency transports / yr',
              num('annualEmergencyTransports', v => v.toLocaleString()))}
            {fig('annualCardiacArrestIncidents', 'Cardiac arrests (OHCA) / yr',
              num('annualCardiacArrestIncidents', v => v.toLocaleString()), `text-county-ohca-${c.countyFips}`,
              'Out-of-hospital cardiac arrest incidents per year')}
            {fig('primaryCathLabDistanceMiles', 'Primary cath lab distance',
              num('primaryCathLabDistanceMiles', v => <>{v.toFixed(1)}<small> mi</small></>))}
            {fig('population', 'Population',
              num('population', v => v.toLocaleString()), `text-county-population-${c.countyFips}`)}
            {fig('seniorPopPct', 'Age 65+', num('seniorPopPct', v => `${v.toFixed(1)}%`))}
            {fig('medianIncome', 'Median household income', num('medianIncome', v => `$${v.toLocaleString()}`))}
            {fig('povertyRatePct', 'Poverty rate', num('povertyRatePct', v => `${v.toFixed(1)}%`))}
          </dl>
        </section>

        <section className="cb-access" aria-label={`Geography for ${c.countyName}`}>
          <dl className="cb-geo" aria-label={`Geography for ${c.countyName}`}>
            <div><dt>Land</dt><dd>{isNum(c.landAreaSqMiles) ? `${c.landAreaSqMiles.toLocaleString()} sq mi` : NOT_REPORTED}</dd></div>
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
        </section>

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
