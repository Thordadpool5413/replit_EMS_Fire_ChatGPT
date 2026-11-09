import React from 'react';
import { ArrowRight, ExternalLink, ShieldAlert, Users, Ambulance, MapPin, Landmark } from 'lucide-react';
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
          <span className="cb-seal" aria-hidden="true"><Landmark /></span>
          <div className="cb-ident-text">
          <h3 id={titleId} className="cb-name">{c.countyName}</h3>
          <p className="cb-seat">Seat <strong>{c.countySeat}</strong><span className="cb-dot" aria-hidden="true" />FIPS {c.countyFips}</p>
          </div>
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
      </header>

      <section className="cb-risk" aria-label="FEMA National Risk Index hazard risk">
        <span className="cb-risk-body">
          <span className="cb-risk-label" title="FEMA National Risk Index source-defined category"><ShieldAlert aria-hidden="true" />FEMA hazard risk</span>
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
                  Source <ExternalLink aria-hidden="true" />
                </a>
              )}
            </>
          ) : (
            <span className="cb-risk-chip cb-risk-chip--none" data-testid={`text-fema-nri-rating-${c.countyFips}`}>No county-equivalent record</span>
          )}
        </span>
      </section>

      <div className="cb-body" data-testid={`details-county-context-${c.countyFips}`}>
        <div className="cb-groups" aria-label={`County figures for ${c.countyName}`}>
          <section className="cb-group cb-group--snapshot" aria-labelledby={`${titleId}-snapshot`}>
            <h4 id={`${titleId}-snapshot`} className="cb-group-cap"><span className="cb-cap-ico" aria-hidden="true"><Ambulance /></span>Operational snapshot</h4>
            <dl className="cb-figs">
              {fig('population', 'Population', num('population', v => v.toLocaleString()), `text-county-population-${c.countyFips}`)}
              {fig('averageTransportMinutes', 'Average transport', num('averageTransportMinutes', v => <>{v.toLocaleString()}<small> min</small></>), `text-county-transport-${c.countyFips}`, 'Average EMS transport time')}
              {fig('annualCardiacArrestIncidents', 'Cardiac arrests', num('annualCardiacArrestIncidents', v => <>{v.toLocaleString()}<small> /yr</small></>), `text-county-ohca-${c.countyFips}`, 'Out-of-hospital cardiac arrest (OHCA) incidents per year')}
            </dl>
          </section>
          <section className="cb-group cb-group--context" aria-labelledby={`${titleId}-context`}>
            <h4 id={`${titleId}-context`} className="cb-group-cap"><span className="cb-cap-ico" aria-hidden="true"><Users /></span>County context</h4>
            <dl className="cb-figs">
              {fig('annualEmergencyTransports', 'Emergency transports', num('annualEmergencyTransports', v => <>{v.toLocaleString()}<small> /yr</small></>), undefined, 'Emergency transports per year')}
              {fig('primaryCathLabDistanceMiles', 'Primary cath lab distance', num('primaryCathLabDistanceMiles', v => <>{v.toFixed(1)}<small> mi</small></>), undefined, 'Distance to primary cath lab')}
              {fig('seniorPopPct', 'Residents age 65+', num('seniorPopPct', v => `${v.toFixed(1)}%`))}
              {fig('povertyRatePct', 'Poverty rate', num('povertyRatePct', v => `${v.toFixed(1)}%`))}
              {fig('medianIncome', 'Median household income', num('medianIncome', v => `$${v.toLocaleString()}`), undefined, 'Median household income')}
            </dl>
          </section>
        </div>

        <dl className="cb-ref" data-cap="Geography" aria-label={`Geography for ${c.countyName}`}>
          <div><dt><MapPin aria-hidden="true" />Land area</dt><dd>{isNum(c.landAreaSqMiles) ? `${c.landAreaSqMiles.toLocaleString()} sq mi` : NOT_REPORTED}</dd></div>
          <div><dt>Centroid</dt><dd>{formatCoordinates(c.centroidLat, c.centroidLng, 3)}</dd></div>
          <div className="cb-ref-wide"><dt>ZIPs{zips.length ? ` (${zips.length})` : ''}</dt><dd>{zips.length > 0 ? zips.join(', ') : 'None listed'}</dd></div>
          <div className="cb-ref-wide">
            <dt>{hasMappedPlaces ? `Places (${places.length})` : 'County seat reference'}</dt>
            <dd className="cb-place-list county-profile-city-list" role="group" aria-label={`Mapped places for ${c.countyName}`}>
              {places.map(name => (
                <button key={`${c.stateCode}-${c.countyName}-${name}`} type="button" className="cb-place county-profile-place-button" onClick={() => onSelectPlace(name)}>{name}</button>
              ))}
            </dd>
          </div>
        </dl>

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
