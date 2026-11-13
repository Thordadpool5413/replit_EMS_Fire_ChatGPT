import React from 'react';
import {
  ArrowRight, ExternalLink, Users, Ambulance, HeartPulse, Timer, Hospital, Wallet, UserRound,
  HandCoins, Shield, MapPinned, Navigation, Hash, MapPin,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { CountyFigureSourceKey, CountyHealthRecord } from '../types';
import { CountyFigureSourceDetails } from './CountyFigureSourceDetails';
import { FEMA_NRI_RATING_COLORS } from '../utils/femaNriRisk';
import { formatCoordinates, uniquePlaceNames } from '../utils/countyPresentation';
import './countyGeoTokens.css';
import './CountyFigures.css';
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

const ALL_FIGURE_KEYS: CountyFigureSourceKey[] = [
  'population', 'averageTransportMinutes', 'annualCardiacArrestIncidents', 'annualEmergencyTransports',
  'seniorPopPct', 'medianIncome', 'povertyRatePct', 'primaryCathLabDistanceMiles',
];

/**
 * County brief. Reading order:
 * blue name bar -> three lead figures (population, average EMS transport time, cardiac arrests)
 * -> context ledger (care access + community, label left / value right, never wrapping)
 * -> FEMA natural-hazard line -> places & geography -> citations.
 */
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

  const fig = (
    key: CountyFigureSourceKey, Icon: LucideIcon, tone: string, label: string, title: string,
    format: (v: number) => React.ReactNode, testId?: string,
  ) => {
    const v = values[key];
    return (
      <div className="cfs-fig" data-figure-key={key} data-tone={tone}>
        <dt title={title}><Icon className="cfs-ico" aria-hidden="true" /><span>{label}</span></dt>
        <dd data-testid={testId}>{isNum(v) ? format(v) : <span className="cfs-na">Not reported</span>}</dd>
      </div>
    );
  };

  return (
    <article aria-labelledby={titleId} className="county-brief county-signal-row" data-testid={`row-county-signals-${c.countyFips}`}>
      <header className="cb-head">
        <div className="cb-ident">
          <h3 id={titleId} className="cb-name">{c.countyName}</h3>
          <p className="cb-seat">
            <span>Seat <strong>{c.countySeat}</strong></span>
            <span>FIPS <strong>{c.countyFips}</strong></span>
          </p>
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

      <div className="cb-body cfs-brief" data-testid={`details-county-context-${c.countyFips}`}>
        <dl className="cfs-lead" aria-label={`Primary figures for ${c.countyName}`}>
          {fig('population', Users, 'community', 'Population', 'Resident population', v => v.toLocaleString(), `text-county-population-${c.countyFips}`)}
          {fig('averageTransportMinutes', Timer, 'ops', 'Avg transport time', 'Average EMS transport time', v => <>{v.toLocaleString()}<small>min</small></>, `text-county-transport-${c.countyFips}`)}
          {fig('annualCardiacArrestIncidents', HeartPulse, 'cardiac', 'Cardiac arrests', 'Out-of-hospital cardiac arrest (OHCA) incidents per year', v => <>{v.toLocaleString()}<small>/yr</small></>, `text-county-ohca-${c.countyFips}`)}
        </dl>

        <dl className="cfs-ledger" aria-label={`Care access and community context for ${c.countyName}`}>
          {fig('annualEmergencyTransports', Ambulance, 'ops', 'EMS transports', 'Emergency EMS transports per year', v => <>{v.toLocaleString()}<small>/yr</small></>, `text-county-transports-${c.countyFips}`)}
          {fig('primaryCathLabDistanceMiles', Hospital, 'access', 'Nearest cath lab', 'Distance to primary cath lab', v => <>{v.toFixed(1)}<small>mi</small></>, `text-county-cathlab-${c.countyFips}`)}
          {fig('seniorPopPct', UserRound, 'community', 'Age 65+', 'Residents age 65 and older', v => <>{v.toFixed(1)}<small>%</small></>)}
          {fig('povertyRatePct', HandCoins, 'community', 'Poverty rate', 'Poverty rate', v => <>{v.toFixed(1)}<small>%</small></>)}
          {fig('medianIncome', Wallet, 'community', 'Median income', 'Median household income', v => `$${v.toLocaleString()}`)}
        </dl>

        <p className="cb-risk" style={{ '--cb-risk': riskColor ?? '#b6c1cf' } as React.CSSProperties}>
          <span className="cb-risk-label" title="FEMA National Risk Index: natural hazard category, not agency performance">
            <Shield className="cfs-ico" aria-hidden="true" />FEMA natural hazard
          </span>
          {nriLoading ? (
            <span className="cb-risk-status" role="status">Loading FEMA record</span>
          ) : nriError ? (
            <span className="cb-risk-status" role="status">FEMA NRI source unavailable</span>
          ) : nri ? (
            <>
              <span className={`cb-risk-chip${riskColor ? '' : ' cb-risk-chip--none'}`} data-testid={`text-fema-nri-rating-${c.countyFips}`}>
                {nri.riskRating || 'Rating not stated'}
              </span>
              {nriScore && <span className="cb-risk-meta" data-testid={`text-fema-nri-score-${c.countyFips}`}>Score <strong>{nriScore}</strong></span>}
              {vintage && <span className="cb-risk-meta">{vintage}</span>}
              {nriSourceUrl && (
                <a className="cb-link" href={nriSourceUrl} target="_blank" rel="noopener noreferrer" data-testid={`link-fema-nri-${c.countyFips}`}>
                  FEMA <ExternalLink aria-hidden="true" />
                </a>
              )}
            </>
          ) : (
            <span className="cb-risk-chip cb-risk-chip--none" data-testid={`text-fema-nri-rating-${c.countyFips}`}>No county-equivalent record</span>
          )}
        </p>

        <section className="cb-geo" aria-label={`Geography and places for ${c.countyName}`}>
          <p className="cb-geo-facts">
            <span><MapPinned className="cfs-ico" aria-hidden="true" />{isNum(c.landAreaSqMiles) ? <><strong>{c.landAreaSqMiles.toLocaleString()}</strong> sq mi</> : 'Area not reported'}</span>
            <span><Navigation className="cfs-ico" aria-hidden="true" />{formatCoordinates(c.centroidLat, c.centroidLng, 3)}</span>
          </p>
          <div className="cb-geo-row">
            <span className="cb-geo-label"><MapPin className="cfs-ico" aria-hidden="true" />{hasMappedPlaces ? `${places.length} ${places.length === 1 ? 'place' : 'places'}` : 'Seat'}</span>
            <div className="cb-place-list county-profile-city-list" role="group" aria-label={`Mapped places for ${c.countyName}`}>
              {places.map(name => (
                <button key={`${c.stateCode}-${c.countyName}-${name}`} type="button" className="cb-place county-profile-place-button" onClick={() => onSelectPlace(name)}>{name}</button>
              ))}
            </div>
          </div>
          <div className="cb-geo-row">
            <span className="cb-geo-label"><Hash className="cfs-ico" aria-hidden="true" />{zips.length} ZIP{zips.length === 1 ? '' : 's'}</span>
            <p className="cb-zip-run">{zips.length > 0 ? zips.join(' · ') : 'None listed'}</p>
          </div>
        </section>

        <CountyFigureSourceDetails
          countyFips={c.countyFips}
          sources={c.figureSources}
          record={c}
          showValues={false}
          omitValuesFor={ALL_FIGURE_KEYS}
          showGeneralNotes={false}
          variant="brief"
          className="cb-sources"
        />
      </div>
    </article>
  );
};
