import type {EquipmentFamily} from '../utils/equipmentPresence';
import {EquipmentRecordSummary} from './EquipmentRecordComposition';
import React from 'react';
import {
  BadgeCheck,
  Building2,
  CircleHelp,
  ExternalLink,
  FileText,
  MapPin,
  Package,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import type { Agency } from '../types';
import type { Coverage } from '../utils/equipmentGeography';
import type {
  CountyAgencyEquipmentRecord,
  CountyEquipmentRecord,
  EquipmentEvidenceReference,
} from '../utils/countyEquipmentRecords';

interface CountyEquipmentRecordsPanelProps {
  countyName: string;
  stateName: string;
  coverage?: Coverage;
  family?: EquipmentFamily;
  onSelectAgency?: (agency: Agency) => void;
}

const FAMILY_NAMES: Record<CountyAgencyEquipmentRecord['notReportedFamilies'][number], string> = {
  monitors: 'Monitor / defibrillator',
  cpr: 'Mechanical CPR',
  ventilators: 'Transport ventilator',
  software: 'ePCR, CAD or billing software',
};

function formatDate(value?: string): string | undefined {
  if (!value) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(timestamp)
    : value;
}

function EvidenceDetails({ evidence }: { evidence: EquipmentEvidenceReference[] }) {
  if (!evidence.length) {
    return <p className="county-equipment-evidence-missing">Source details are not attached to this entry. Confirm it with the agency.</p>;
  }

  return (
    <ul className="county-equipment-evidence-list" aria-label="Equipment evidence">
      {evidence.map((source, index) => (
        <li key={`${source.sourceName}:${source.sourceRecordId ?? index}`}>
          <div className="county-equipment-source-name">
            <FileText aria-hidden="true" />
            <span>{source.sourceName}</span>
            {source.sourceUrl && (
              <a href={source.sourceUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open ${source.sourceName} source`}>
                Open source <ExternalLink aria-hidden="true" />
              </a>
            )}
          </div>
          <div className="county-equipment-source-meta">
            {source.sourceRecordId && <span>Record {source.sourceRecordId}</span>}
            {source.basis && source.basis !== 'agency-fact-evidence' && <span>Basis: {source.basis.replaceAll('-', ' ')}</span>}
            {source.reportingPeriod && <span>Reporting period: {source.reportingPeriod}</span>}
            {source.effectivePeriod && <span>Effective period: {source.effectivePeriod}</span>}
            {source.enteredAt && <span>Entered: {formatDate(source.enteredAt)}</span>}
            {source.reviewedAt && <span>Reviewed: {formatDate(source.reviewedAt)}</span>}
            {!source.reportingPeriod && !source.effectivePeriod && !source.enteredAt && !source.reviewedAt
              && <span>Source date not stated</span>}
          </div>
        </li>
      ))}
    </ul>
  );
}

function EquipmentRecordCard({ record }: { record: CountyEquipmentRecord }) {
  const statusText = record.status === 'documented' ? 'Source mapped' : 'Unverified';
  return (
    <article className="county-equipment-record" data-testid="county-equipment-record">
      <div className="county-equipment-record-icon" aria-hidden="true"><Package /></div>
      <div className="county-equipment-record-main">
        <div className="county-equipment-record-heading">
          <div className="min-w-0">
            <p className="county-equipment-record-category">
              {record.category}
              {record.recordType === 'source-fact' && <span className="county-equipment-record-kind">Source fact · not assumed current</span>}
            </p>
            <h6>{record.product}</h6>
          </div>
          <span className={`county-equipment-status is-${record.status}`}>
            {record.status === 'documented' ? <BadgeCheck aria-hidden="true" /> : <CircleHelp aria-hidden="true" />}
            {statusText}
          </span>
        </div>
        <p className="county-equipment-manufacturer">
          <strong>Manufacturer</strong>
          <span>{record.manufacturers.length ? record.manufacturers.join(' · ') : 'Not recognized in this entry'}</span>
        </p>
        {record.evidenceReview === 'review-needed' && (
          <p className="county-equipment-review-note"><TriangleAlert aria-hidden="true" /> Source linked; user review is not recorded.</p>
        )}
        {record.evidenceReview === 'reviewed' && (
          <p className="county-equipment-review-note is-reviewed"><ShieldCheck aria-hidden="true" /> Source marked reviewed; independently confirm before relying on it.</p>
        )}
        <EvidenceDetails evidence={record.evidence} />
      </div>
    </article>
  );
}

function AgencyRecord({ record, onSelectAgency }: {
  record: CountyAgencyEquipmentRecord;
  onSelectAgency?: (agency: Agency) => void;
}) {
  const documentedCount = record.equipmentRecords.filter((entry) => entry.status === 'documented').length;
  const unverifiedCount = record.equipmentRecords.length - documentedCount;
  return (
    <details className="county-equipment-agency" data-testid="county-equipment-agency">
      <summary>
        <Building2 aria-hidden="true" />
        <span className="county-equipment-agency-name">{record.agencyName}</span>
        <span className={`county-equipment-status is-${record.equipmentStatus}`}>
          {record.equipmentStatus === 'documented'
            ? <BadgeCheck aria-hidden="true" />
            : record.equipmentStatus === 'not-reported'
              ? <CircleHelp aria-hidden="true" />
              : <TriangleAlert aria-hidden="true" />}
          {record.equipmentStatus === 'not-reported'
            ? record.sourceFactRecordCount
              ? `Installed entry not reported · ${record.sourceFactRecordCount} source ${record.sourceFactRecordCount === 1 ? 'fact' : 'facts'}`
              : 'Installed equipment not reported'
            : `${documentedCount} documented · ${unverifiedCount} unverified`}
        </span>
      </summary>
      <div className="county-equipment-agency-body">
        <div className="county-equipment-agency-meta">
          <span className={record.agencyIdentityStatus === 'verified' ? 'is-verified' : 'is-unverified'}>
            {record.agencyIdentityStatus === 'verified'
              ? <BadgeCheck aria-hidden="true" />
              : <CircleHelp aria-hidden="true" />}
            Agency identity {record.agencyIdentityStatus === 'verified' ? 'verified' : 'not verified'}
          </span>
          <span><MapPin aria-hidden="true" />County assignment: {record.assignmentBasis.replaceAll('-', ' ')}</span>
          {onSelectAgency && (
            <button type="button" className="county-equipment-profile-link" onClick={() => onSelectAgency(record.agency)}>
              Open agency profile <ExternalLink aria-hidden="true" />
            </button>
          )}
        </div>

        {record.serviceAreas.length > 0 && (
          <div className="county-equipment-service-areas">
            <strong>Service-area references · not used for county totals</strong>
            <ul>
              {record.serviceAreas.map((serviceArea) => (
                <li key={`${serviceArea.geographyId ?? ''}:${serviceArea.label}`}>
                  <span>{serviceArea.label}</span>
                  <span>{serviceArea.documented ? 'Documented' : 'Reference only'}</span>
                  {serviceArea.sourceName && <span>{serviceArea.sourceName}</span>}
                  {serviceArea.reportingPeriod && <span>{serviceArea.reportingPeriod}</span>}
                  {serviceArea.sourceUrl && (
                    <a href={serviceArea.sourceUrl} target="_blank" rel="noopener noreferrer">
                      Source <ExternalLink aria-hidden="true" />
                    </a>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {record.equipmentRecords.length ? (
          <div className="county-equipment-record-list">
            {record.equipmentRecords.map((entry) => <EquipmentRecordCard key={entry.id} record={entry} />)}
          </div>
        ) : (
          <p className="county-equipment-not-reported">No equipment details are attached to this agency record. This is not evidence that the agency has no equipment.</p>
        )}
        {record.notReportedFamilies.length > 0 && record.equipmentRecords.length > 0 && (
          <p className="county-equipment-not-reported-categories">
            No entry for this agency: {record.notReportedFamilies.map((family) => FAMILY_NAMES[family]).join(' · ')}.
          </p>
        )}
      </div>
    </details>
  );
}

export function CountyEquipmentRecordsPanel({
  countyName,
  stateName,
  coverage,
  family,
  onSelectAgency,
}: CountyEquipmentRecordsPanelProps) {
  const agencies = coverage?.agencyRecords ?? [];
  const notReported = coverage?.notReportedByFamily;
  return (
    <section className="cv-panel county-equipment-panel" aria-label={`${countyName} agency and equipment records`} data-testid="county-equipment-panel">
      <div className="county-equipment-panel-head">
        <div>
          <p className="cv-geo-kicker"><Package aria-hidden="true" />County-first equipment records</p>
          <h4 className="cv-geo-title">{countyName}, {stateName}</h4>
        </div>
        <span className="county-equipment-assignment-count">
          {coverage?.total ?? 0} unique agency {coverage?.total === 1 ? 'record' : 'records'}
        </span>
      </div>
      <p className="county-equipment-panel-note">
        Each directory ID is assigned to one county by recorded location. Service-area references remain visible but do not duplicate agency or equipment totals. Source facts are kept separate from installed fields and are not assumed current. Missing entries mean not reported, not that equipment is absent.
      </p>

      <EquipmentRecordSummary coverage={coverage} family={family}/>
      <dl className="county-equipment-summary">
        <div><dt>Installed entries</dt><dd>{coverage?.equipmentRecordCount ?? 0}</dd></div>
        <div><dt>Source facts only</dt><dd>{coverage?.sourceFactRecordCount ?? 0}</dd></div>
        <div><dt>Installed source mapped</dt><dd>{coverage?.documentedEquipmentRecordCount ?? 0}</dd></div>
        <div><dt>Unverified</dt><dd>{coverage?.unverifiedEquipmentRecordCount ?? 0}</dd></div>
        <div><dt>Agency identity verified</dt><dd>{coverage?.verifiedAgencyCount ?? 0}</dd></div>
        <div><dt>Agency identity unverified</dt><dd>{coverage?.unverifiedAgencyCount ?? 0}</dd></div>
      </dl>

      {notReported && coverage?.total ? (
        <p className="county-equipment-missing-summary">
          No installed entry among assigned agencies: monitors {notReported.monitors} · mechanical CPR {notReported.cpr} · ventilators {notReported.ventilators} · software {notReported.software}.
        </p>
      ) : null}

      {!coverage?.total ? (
        <div className="county-equipment-empty" data-testid="county-equipment-empty">
          <CircleHelp aria-hidden="true" />
          <div>
            <strong>No directory agency records are assigned to this county.</strong>
            <p>Equipment status is not reported. The missing county record does not establish that equipment is absent.</p>
          </div>
        </div>
      ) : (
        <div className="county-equipment-agency-list" aria-label="County agency records">
          {agencies.map((record) => (
            <AgencyRecord key={record.agencyId} record={record} onSelectAgency={onSelectAgency} />
          ))}
        </div>
      )}
    </section>
  );
}
