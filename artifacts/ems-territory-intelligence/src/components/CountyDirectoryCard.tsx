import React from 'react';
import { ArrowRight, ExternalLink, HeartPulse, MapPin, Navigation, ShieldAlert, Timer, Users } from 'lucide-react';
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

  return (
    <article aria-labelledby={titleId} className="county-brief county-signal-row" data-testid={`row-county-signals-${c.countyFips}`}>
      <header className="cb-head">
        <div className="cb-ident">
          <h3 id={titleId} className="cb-name">{c.countyName}</h3>
          <p className="cb-seat"><MapPin aria-hidden="true" /> Seat <strong>{c.countySeat}</strong></p>
        </div>

        <section className="cb-risk" aria-label="FEMA National Risk Index hazard risk">
          <p className="cb-risk-label"><ShieldAlert aria-hidden="true" /> FEMA hazard risk</p>
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

      <div className="cb-body county-profile-details-content" data-testid={`details-county-context-${c.countyFips}`}>
        <div className="cb-brief">
          <section className="cb-group cb-group--response" aria-labelledby={`${titleId}-resp`}>
            <h4 id={`${titleId}-resp`} className="cb-group-label"><Timer aria-hidden="true" /> Response activity</h4>
            <dl className="cb-focal">
              <div data-figure-key="averageTransportMinutes">
                <dt>Average EMS transport</dt>
                <dd data-testid={`text-county-transport-${c.countyFips}`}>
                  {isNum(c.averageTransportMinutes) ? <>{c.averageTransportMinutes.toLocaleString()}<small> min</small></> : <span className="cb-na">{NOT_REPORTED}</span>}
                </dd>
              </div>
            </dl>
            <dl className="cb-pairs">
              <div data-figure-key="annualEmergencyTransports">
                <dt>Emergency transports / yr</dt>
                <dd>{num('annualEmergencyTransports', v => v.toLocaleString())}</dd>
              </div>
              <div data-figure-key="annualCardiacArrestIncidents">
                <dt title="Out-of-hospital cardiac arrest incidents per year"><HeartPulse aria-hidden="true" /> Cardiac arrests / yr</dt>
                <dd data-testid={`text-county-ohca-${c.countyFips}`}>{num('annualCardiacArrestIncidents', v => v.toLocaleString())}</dd>
              </div>
            </dl>
          </section>

          <section className="cb-group cb-group--community" aria-labelledby={`${titleId}-comm`}>
            <h4 id={`${titleId}-comm`} className="cb-group-label"><Users aria-hidden="true" /> Community profile</h4>
            <dl className="cb-focal cb-focal--sub">
              <div data-figure-key="population">
                <dt>Population</dt>
                <dd data-testid={`text-county-population-${c.countyFips}`}>{num('population', v => v.toLocaleString())}</dd>
              </div>
            </dl>
            <dl className="cb-pairs cb-pairs--three">
              <div data-figure-key="seniorPopPct"><dt>Age 65+</dt><dd>{num('seniorPopPct', v => `${v.toFixed(1)}%`)}</dd></div>
              <div data-figure-key="medianIncome"><dt>Median household income</dt><dd>{num('medianIncome', v => `$${v.toLocaleString()}`)}</dd></div>
              <div data-figure-key="povertyRatePct"><dt>Poverty rate</dt><dd>{num('povertyRatePct', v => `${v.toFixed(1)}%`)}</dd></div>
            </dl>
          </section>
        </div>

        <section className="cb-access" aria-labelledby={`${titleId}-geo`}>
          <h4 id={`${titleId}-geo`} className="cb-group-label"><Navigation aria-hidden="true" /> Access &amp; geography</h4>
          <div className="cb-access-grid">
            <dl className="cb-focal cb-focal--sub cb-access-lead">
              <div data-figure-key="primaryCathLabDistanceMiles">
                <dt>Primary cath lab distance</dt>
                <dd>{num('primaryCathLabDistanceMiles', v => <>{v.toFixed(1)}<small> mi</small></>)}</dd>
              </div>
            </dl>
            <dl className="cb-geo" aria-label={`Geography for ${c.countyName}`}>
              <div><dt>Land area</dt><dd>{isNum(c.landAreaSqMiles) ? `${c.landAreaSqMiles.toLocaleString()} sq mi` : NOT_REPORTED}</dd></div>
              <div><dt>FIPS</dt><dd>{c.countyFips}</dd></div>
              <div><dt>Centroid</dt><dd>{formatCoordinates(c.centroidLat, c.centroidLng, 3)}</dd></div>
              <div className="cb-geo-zips"><dt>ZIPs{zips.length ? ` (${zips.length})` : ''}</dt><dd>{zips.length > 0 ? zips.join(', ') : 'None listed'}</dd></div>
            </dl>
          </div>
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
                  <MapPin aria-hidden="true" />{name}
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
