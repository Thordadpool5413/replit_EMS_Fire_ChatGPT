import { useState, type ReactNode } from 'react';
import { ArrowUpRight, Building2, ChevronDown, ChevronRight, ExternalLink, FileSearch, MapPin, Radio, Shield, Truck, Users } from 'lucide-react';
import { AGENCY_FACT_EVIDENCE_FIELDS } from '../data/agencyFactEvidence';
import type { Agency, AgencyFactEvidence, AgencyFactEvidenceKey } from '../types';
import type { CommandSection as ProfileSection } from './profile/ProfileCommandOverview';

const EMPTY_VALUE_LABELS = new Set([
  'not reported',
  'not listed in this profile',
  'not source-verified',
  'source not listed',
]);

interface AgencyIntelligenceOverviewProps {
  agency: Agency;
  onOpenSources: () => void;
  onNavigateSection?: (section: ProfileSection) => void;
}

const textAvailable = (value: unknown): value is string => {
  if (typeof value !== 'string' || !value.trim()) return false;
  return !EMPTY_VALUE_LABELS.has(value.trim().toLowerCase());
};

const numberLabel = (value: number | null | undefined, suffix = '') =>
  value === null || value === undefined || !Number.isFinite(value)
    ? null
    : `${new Intl.NumberFormat('en-US').format(value)}${suffix}`;

const dateLabel = (value: string | null | undefined) => {
  if (!textAvailable(value)) return null;
  if (/^\d{4}$/.test(value)) return value;
  if (/^\d{4}-\d{2}$/.test(value)) {
    const [year, month] = value.split('-').map(Number);
    return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(Date.UTC(year, month - 1, 1)));
  }
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? value : new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(timestamp);
};

function ExternalSourceLink({ href, label, testId }: { href: string; label: string; testId: string }) {
  let safeHref: string;
  try {
    const parsed = new URL(href);
    if (parsed.protocol !== 'https:') return null;
    safeHref = parsed.href;
  } catch {
    return null;
  }

  return (
    <a
      href={safeHref}
      target="_blank"
      rel="noreferrer"
      data-testid={testId}
      className="inline-flex min-h-7 items-center gap-1 rounded px-1.5 text-xs font-medium text-[var(--pi-action)] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      {label}<ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
    </a>
  );
}

function Field({ label, value, testId, mono = false }: { label: string; value: ReactNode; testId: string; mono?: boolean }) {
  return (
    <div className="min-w-0 border-b border-[var(--pi-border)] py-2 last:border-b-0 sm:grid sm:grid-cols-[minmax(7.5rem,0.8fr)_minmax(0,1.2fr)] sm:gap-3">
      <dt className="text-xs font-medium text-[var(--pi-text-secondary)]">{label}</dt>
      <dd data-testid={testId} className={`mt-0.5 break-words text-sm font-medium text-[var(--pi-text-primary)] sm:mt-0 ${mono ? 'font-mono text-[0.82rem]' : ''}`}>
        {value ?? <span className="font-normal text-[var(--pi-text-muted)]">Not listed in this profile</span>}
      </dd>
    </div>
  );
}

function Panel({
  id,
  title,
  icon,
  children,
  action,
  summary,
  initiallyExpanded = false,
}: {
  id: string;
  title: string;
  icon: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  summary?: string;
  initiallyExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(initiallyExpanded);

  return (
    <section aria-labelledby={`${id}-heading`} data-testid={`section-${id}`} className="min-w-0 rounded-lg border border-[var(--pi-border)] bg-[var(--pi-surface-bg)]">
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={`${id}-content`}
          data-testid={`button-toggle-${id}`}
          onClick={() => setExpanded((current) => !current)}
          className="flex min-h-8 min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="text-[var(--pi-action)]">{icon}</span>
          <span className="min-w-0 flex-1">
            <h3 id={`${id}-heading`} className="text-sm font-semibold text-[var(--pi-text-primary)]">{title}</h3>
            {!expanded && summary && (
              <span data-testid={`summary-${id}`} className="mt-0.5 block truncate text-[11px] font-normal text-[var(--pi-text-secondary)]">
                {summary}
              </span>
            )}
          </span>
          <ChevronDown aria-hidden="true" className={`ml-auto h-4 w-4 shrink-0 text-[var(--pi-text-muted)] transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
        {action}
      </div>
      <div id={`${id}-content`} hidden={!expanded} className="border-t border-[var(--pi-border)] px-3.5 py-1.5">
        {children}
      </div>
    </section>
  );
}

function EvidenceLine({ evidence, testId }: { evidence: NonNullable<Agency['factEvidence']>[AgencyFactEvidenceKey]; testId: string }) {
  if (!evidence) return null;
  return (
    <div data-testid={testId} className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--pi-text-secondary)]">
      {textAvailable(evidence.sourceName) && <span>{evidence.sourceName}</span>}
      {textAvailable(evidence.reportingPeriod) && <span className="text-[var(--pi-text-muted)]">· {evidence.reportingPeriod}</span>}
      {textAvailable(evidence.sourceUrl) && (
        <ExternalSourceLink href={evidence.sourceUrl} label="Source" testId={`${testId}-link`} />
      )}
    </div>
  );
}

export default function AgencyIntelligenceOverview({
  agency,
  onOpenSources,
  onNavigateSection,
}: AgencyIntelligenceOverviewProps) {
  const labels = new Map(AGENCY_FACT_EVIDENCE_FIELDS.map(({ key, label }) => [key, label]));
  const geographicIds = [
    ['State FIPS', agency.stateFips],
    ['County FIPS', agency.countyFips],
    ['Place GEOID', agency.placeGeoid],
    ['Tract GEOID', agency.tractGeoid],
  ] as const;
  const navActions: Array<{ label: string; section: ProfileSection; testId: string }> = [
    { label: 'Operations detail', section: 'operations', testId: 'button-open-operations-detail' },
    { label: 'Equipment detail', section: 'equipment', testId: 'button-open-equipment-detail' },
    { label: 'Decision makers', section: 'decision_makers', testId: 'button-open-decision-makers-detail' },
    { label: 'Purchasing & contracts', section: 'purchasing', testId: 'button-open-purchasing-detail' },
  ];
  const evidenceEntries = Object.entries(agency.factEvidence ?? {}) as Array<[AgencyFactEvidenceKey, AgencyFactEvidence | undefined]>;
  const activeEvidence = evidenceEntries.filter((entry): entry is [AgencyFactEvidenceKey, AgencyFactEvidence] => Boolean(entry[1]));
  const contacts = (agency.keyContacts ?? []).filter((contact) =>
    [contact.name, contact.title, contact.role, contact.email, contact.phone].some(textAvailable),
  );
  const sourceFacts = (agency.sourceFacts ?? []).filter((fact) => fact.value.trim().length > 0);
  const associations = agency.sourceRecordAssociations ?? [];
  const fleet = agency.installedFleet;
  const apparatus = agency.apparatusFleet;
  const hospitals = agency.hospitalLogistics;
  const equipmentFields: Array<[string, string | number | undefined]> = [
    ['Defibrillator model / brand', fleet?.defibBrand],
    ['Defibrillator units', fleet?.defibUnitsCount],
    ['Fleet age', fleet?.defibAgeYears === undefined ? undefined : `${fleet.defibAgeYears} years`],
    ['Warranty status', fleet?.defibWarrantyStatus],
    ['Mechanical CPR', fleet?.mechanicalCPR],
    ['Mechanical CPR units', fleet?.cprUnitsCount],
    ['Transport ventilator', fleet?.transportVentilator],
    ['Transport ventilator units', fleet?.ventUnitsCount],
    ['ALS monitors', fleet?.alsMonitorsCount],
    ['BLS defibrillators', fleet?.blsDefibsCount],
    ['ePCR', fleet?.epcrCadSoftware],
    ['Dispatch CAD', fleet?.dispatchCadVendor],
    ['Billing software', fleet?.billingSoftware],
  ];

  return (
    <div data-testid="agency-intelligence-overview" className="space-y-3.5">
      <header className="rounded-lg border border-[var(--pi-border)] bg-[var(--pi-surface-subtle)] px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--pi-text-muted)]">Agency record</p>
            <h2 data-testid="text-agency-overview-heading" className="mt-0.5 break-words text-base font-semibold leading-tight text-[var(--pi-text-primary)]">Operational intelligence</h2>
            <p className="mt-1 text-xs text-[var(--pi-text-secondary)]">
              Values are from the current agency record; available source, period, and geography details appear with the related facts.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenSources}
            data-testid="button-open-agency-sources"
            className="inline-flex min-h-9 shrink-0 items-center gap-2 rounded-md border border-[var(--pi-border-strong)] bg-[var(--pi-surface-bg)] px-3 text-xs font-semibold text-[var(--pi-text-primary)] transition-colors hover:bg-[var(--pi-action-subtle)]"
          >
            <FileSearch aria-hidden="true" className="h-4 w-4 text-[var(--pi-action)]" />Sources &amp; records
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {navActions.map(({ label, section, testId }) => (
            <button
              key={testId}
              type="button"
              onClick={() => onNavigateSection?.(section)}
              data-testid={testId}
              className="inline-flex min-h-8 items-center gap-1 rounded-md px-2.5 text-xs font-medium text-[var(--pi-action)] hover:bg-[var(--pi-action-subtle)] focus-visible:outline-2 focus-visible:outline-offset-1"
            >
              {label}<ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
      </header>

      <div className="grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2">
        <Panel
          id="identity"
          title="Identity & jurisdiction"
          icon={<Building2 aria-hidden="true" className="h-4 w-4" />}
          summary={[agency.jurisdictionLevel, agency.fdid].filter(textAvailable).join(' · ')}
        >
          <dl>
            <Field label="Agency type" value={textAvailable(agency.agencyType) ? agency.agencyType : null} testId="value-agency-type" />
            <Field label="Jurisdiction" value={textAvailable(agency.jurisdictionLevel) ? agency.jurisdictionLevel : null} testId="value-jurisdiction-level" />
            <Field label="FDID / state EMS ID" value={textAvailable(agency.fdid) ? agency.fdid : null} testId="value-agency-fdid" mono />
            <Field label="State license" value={textAvailable(agency.stateLicenseNumber) ? `${agency.stateLicenseNumber}${textAvailable(agency.stateLicenseType) ? ` · ${agency.stateLicenseType}` : ''}` : null} testId="value-state-license" mono />
            <Field label="NPI" value={textAvailable(agency.npiNumber) ? agency.npiNumber : null} testId="value-agency-npi" mono />
            <Field label="Taxonomy" value={textAvailable(agency.taxonomyCode) ? `${agency.taxonomyCode}${textAvailable(agency.taxonomyDescription) ? ` · ${agency.taxonomyDescription}` : ''}` : null} testId="value-agency-taxonomy" />
            {geographicIds.map(([label, value], index) => textAvailable(value) && (
              <Field key={label} label={label} value={value} testId={`value-agency-geography-id-${index}`} mono />
            ))}
          </dl>
          <EvidenceLine evidence={agency.factEvidence?.providerAddress} testId="evidence-agency-address" />
          <EvidenceLine evidence={agency.factEvidence?.departmentRegistry} testId="evidence-agency-registry" />
        </Panel>

        <Panel
          id="command-contacts"
          title="Command contacts"
          icon={<Users aria-hidden="true" className="h-4 w-4" />}
          summary={contacts.length ? `${contacts.length} contact${contacts.length === 1 ? '' : 's'} listed` : undefined}
          action={
            <button type="button" onClick={() => onNavigateSection?.('decision_makers')} data-testid="button-view-command-directory" className="text-xs font-semibold text-[var(--pi-action)] hover:underline">Directory <ArrowUpRight aria-hidden="true" className="inline h-3.5 w-3.5" /></button>
          }
        >
          {contacts.length ? (
            <ul className="divide-y divide-[var(--pi-border)]">
              {contacts.map((contact, index) => (
                <li key={contact.id || `${contact.name}-${index}`} data-testid={`contact-command-${contact.id || index}`} className="py-2 first:pt-1 last:pb-1">
                  <p className="text-sm font-semibold text-[var(--pi-text-primary)]">{contact.name || 'Not listed in this profile'}</p>
                  <p className="text-xs text-[var(--pi-text-secondary)]">{[contact.title, contact.role].filter(textAvailable).join(' · ') || 'Not listed in this profile'}</p>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                    {textAvailable(contact.phone) && <a href={`tel:${contact.phone}`} data-testid={`link-contact-phone-${contact.id || index}`} className="text-[var(--pi-action)] hover:underline">{contact.phone}</a>}
                    {textAvailable(contact.email) && <a href={`mailto:${contact.email}`} data-testid={`link-contact-email-${contact.id || index}`} className="break-all text-[var(--pi-action)] hover:underline">{contact.email}</a>}
                    {textAvailable(contact.officialWebsite) && <a href={contact.officialWebsite} target="_blank" rel="noreferrer" data-testid={`link-contact-source-${contact.id || index}`} className="text-[var(--pi-action)] hover:underline">Official page</a>}
                  </div>
                </li>
              ))}
            </ul>
          ) : <p data-testid="text-command-contacts-empty" className="py-2 text-sm text-[var(--pi-text-muted)]">Not listed in this profile</p>}
          <EvidenceLine evidence={agency.factEvidence?.agencyLeadership || agency.factEvidence?.decisionMakers} testId="evidence-command-contacts" />
        </Panel>

        <Panel
          id="stations-apparatus"
          title="Stations & apparatus"
          icon={<Truck aria-hidden="true" className="h-4 w-4" />}
          summary="Station locations and apparatus details"
          action={
            <button type="button" onClick={() => onNavigateSection?.('operations')} data-testid="button-view-stations-operations" className="text-xs font-semibold text-[var(--pi-action)] hover:underline">Operations <ArrowUpRight aria-hidden="true" className="inline h-3.5 w-3.5" /></button>
          }
        >
          <dl>
            <Field label="Stations" value={numberLabel(agency.stationsCount)} testId="value-station-count" />
            <Field label="Ambulances" value={numberLabel(agency.totalAmbulances)} testId="value-ambulance-count" />
            <Field label="Fire engines" value={numberLabel(agency.totalFireEngines)} testId="value-fire-engine-count" />
            <Field label="Frontline rescue units" value={numberLabel(agency.frontlineRescueUnitCount)} testId="value-frontline-rescue-count" />
            <Field label="Response units" value={numberLabel(agency.responseUnitCount)} testId="value-response-unit-count" />
            {apparatus && <>
              <Field label="ALS ambulances" value={numberLabel(apparatus.alsAmbulances)} testId="value-apparatus-als-ambulances" />
              <Field label="BLS ambulances" value={numberLabel(apparatus.blsAmbulances)} testId="value-apparatus-bls-ambulances" />
              <Field label="Ladder trucks" value={numberLabel(apparatus.ladderTrucks)} testId="value-apparatus-ladder-trucks" />
              <Field label="Heavy rescue units" value={numberLabel(apparatus.heavyRescueUnits)} testId="value-apparatus-heavy-rescue" />
              <Field label="Command vehicles" value={numberLabel(apparatus.commandVehicles)} testId="value-apparatus-command-vehicles" />
              <Field label="Total active units" value={numberLabel(apparatus.totalActiveUnits)} testId="value-apparatus-total-active" />
              <Field label="Average vehicle age" value={numberLabel(apparatus.avgVehicleAgeYears, ' years')} testId="value-apparatus-average-age" />
              <Field label="Replacement cycle" value={numberLabel(apparatus.replacementCycleYears, ' years')} testId="value-apparatus-replacement-cycle" />
            </>}
          </dl>
          <EvidenceLine evidence={agency.factEvidence?.frontlineApparatusStations} testId="evidence-frontline-apparatus" />
          <EvidenceLine evidence={agency.factEvidence?.apparatusBreakdown} testId="evidence-apparatus-breakdown" />
        </Panel>

        <Panel
          id="operations-service-area"
          title="Operational volume & service area"
          icon={<MapPin aria-hidden="true" className="h-4 w-4" />}
          summary="Call volume and service-area details"
          action={
            <button type="button" onClick={() => onNavigateSection?.('operations')} data-testid="button-view-service-area" className="text-xs font-semibold text-[var(--pi-action)] hover:underline">Operations <ArrowUpRight aria-hidden="true" className="inline h-3.5 w-3.5" /></button>
          }
        >
          <dl>
            <Field label="Annual call volume" value={numberLabel(agency.annualCallVolume)} testId="value-annual-call-volume" />
            <Field label="Annual 911 transports" value={numberLabel(agency.annual911Transports)} testId="value-annual-911-transports" />
            <Field label="Population served" value={numberLabel(agency.populationServed)} testId="value-population-served" />
            <Field label="Response area" value={numberLabel(agency.responseAreaSqMiles, ' sq mi')} testId="value-response-area" />
            <Field label="Annual cardiac arrest calls" value={numberLabel(agency.annualCardiacArrestCalls)} testId="value-cardiac-arrest-calls" />
            <Field label="Bystander CPR rate" value={numberLabel(agency.bystanderCPRRate, '%')} testId="value-bystander-cpr-rate" />
            <Field label="Utstein survival rate" value={numberLabel(agency.utsteinSurvivalRate, '%')} testId="value-utstein-survival-rate" />
            {textAvailable(agency.gisData?.territoryClusterName) && <Field label="Territory cluster" value={agency.gisData.territoryClusterName} testId="value-territory-cluster" />}
            {textAvailable(agency.gisData?.territoryClusterId) && <Field label="Territory cluster ID" value={agency.gisData.territoryClusterId} testId="value-territory-cluster-id" mono />}
            {agency.geographicLinks?.filter((link) => link.relationship === 'serves').map((link, index) => (
              <Field key={`${link.level}-${link.label}-${index}`} label={`Service geography${index ? ` ${index + 1}` : ''}`} value={<>{link.label}{textAvailable(link.sourceGeographyId) && <span className="ml-1 font-mono text-xs text-[var(--pi-text-secondary)]">· {link.sourceGeographyId}</span>}</>} testId={`value-service-geography-${index}`} />
            ))}
            {agency.serviceAreaGeographyIds?.map((id, index) => textAvailable(id) && <Field key={id} label={`Service-area geography ID ${index + 1}`} value={id} testId={`value-service-area-geography-id-${index}`} mono />)}
          </dl>
          <EvidenceLine evidence={agency.factEvidence?.annualEmergencyVolume || agency.factEvidence?.annualCallsReceived} testId="evidence-annual-operations" />
          <EvidenceLine evidence={agency.factEvidence?.serviceArea} testId="evidence-service-area" />
        </Panel>

        <Panel
          id="receiving-hospitals"
          title="Receiving hospitals & STEMI logistics"
          icon={<Shield aria-hidden="true" className="h-4 w-4" />}
          summary={[hospitals?.primaryTraumaHospital, hospitals?.primaryCathLabHospital].filter(textAvailable).join(' · ')}
        >
          <dl>
            <Field label="Primary trauma hospital" value={textAvailable(hospitals?.primaryTraumaHospital) ? hospitals.primaryTraumaHospital : null} testId="value-primary-trauma-hospital" />
            <Field label="Trauma level" value={textAvailable(hospitals?.traumaLevel) ? hospitals.traumaLevel : null} testId="value-trauma-level" />
            <Field label="Trauma distance" value={numberLabel(hospitals?.distanceToTraumaMiles, ' mi')} testId="value-trauma-distance" />
            <Field label="Trauma transport time" value={numberLabel(hospitals?.transportTimeMinutes, ' min')} testId="value-trauma-transport-time" />
            <Field label="Primary cath lab hospital" value={textAvailable(hospitals?.primaryCathLabHospital) ? hospitals.primaryCathLabHospital : null} testId="value-primary-cath-lab" />
            <Field label="Cath lab distance" value={numberLabel(hospitals?.cathLabDistanceMiles, ' mi')} testId="value-cath-lab-distance" />
            <Field label="Cath lab transport time" value={numberLabel(hospitals?.cathLabTransportMinutes, ' min')} testId="value-cath-lab-transport-time" />
            <Field label="Annual ED transports" value={numberLabel(hospitals?.annualEdTransports)} testId="value-annual-ed-transports" />
            <Field label="Average ED offload latency" value={numberLabel(hospitals?.avgEdOffloadLatencyMinutes, ' min')} testId="value-ed-offload-latency" />
            {(agency.clinical?.primaryReceivingHospitals ?? []).map((hospital, index) => textAvailable(hospital) && <Field key={`${hospital}-${index}`} label={`Receiving hospital ${index + 1}`} value={hospital} testId={`value-receiving-hospital-${index}`} />)}
            {textAvailable(agency.gisData?.primaryReceivingHospital) && <Field label="GIS primary receiving hospital" value={agency.gisData.primaryReceivingHospital} testId="value-gis-receiving-hospital" />}
          </dl>
          <EvidenceLine evidence={agency.factEvidence?.receivingHospitalStemi} testId="evidence-receiving-hospitals" />
        </Panel>

        <Panel
          id="equipment-communications"
          title="Biomedical fleet & systems"
          icon={<Radio aria-hidden="true" className="h-4 w-4" />}
          summary={[fleet?.defibBrand, fleet?.epcrCadSoftware, fleet?.dispatchCadVendor].filter(textAvailable).join(' · ')}
          action={
            <button type="button" onClick={() => onNavigateSection?.('equipment')} data-testid="button-view-equipment-systems" className="text-xs font-semibold text-[var(--pi-action)] hover:underline">Equipment <ArrowUpRight aria-hidden="true" className="inline h-3.5 w-3.5" /></button>
          }
        >
          <dl>
            {equipmentFields.map(([label, value], index) => (
              <Field key={label} label={label} value={typeof value === 'number' ? numberLabel(value) : textAvailable(value) ? value : null} testId={`value-equipment-system-${index}`} />
            ))}
            <Field label="Maintenance contract provider" value={textAvailable(agency.competitorContract?.vendor) ? agency.competitorContract.vendor : null} testId="value-maintenance-contract-provider" />
            <Field label="Contract term end" value={dateLabel(agency.competitorContract?.contractEndDate)} testId="value-maintenance-contract-end" />
            <Field label="Contract status" value={textAvailable(agency.competitorContract?.status) ? agency.competitorContract.status : null} testId="value-maintenance-contract-status" />
            <Field label="Warranty contract document" value={textAvailable(fleet?.warrantyContractDoc) ? fleet.warrantyContractDoc : null} testId="value-warranty-contract-document" />
            <Field label="Procurement source document" value={textAvailable(fleet?.procurementSourceDoc) ? fleet.procurementSourceDoc : null} testId="value-procurement-source-document" />
            <Field label="Procurement resolution ID" value={textAvailable(fleet?.procurementResolutionId) ? fleet.procurementResolutionId : null} testId="value-procurement-resolution-id" mono />
            <Field label="Capital asset ledger ID" value={textAvailable(fleet?.capitalAssetLedgerId) ? fleet.capitalAssetLedgerId : null} testId="value-capital-asset-ledger-id" mono />
          </dl>
          <EvidenceLine evidence={agency.factEvidence?.defibrillatorBiomedicalFleet} testId="evidence-biomedical-fleet" />
          <EvidenceLine evidence={agency.factEvidence?.communicationsSystems || agency.factEvidence?.epcrSystem} testId="evidence-communications-systems" />
          <EvidenceLine evidence={agency.factEvidence?.maintenanceContracts} testId="evidence-maintenance-contracts" />
          <EvidenceLine evidence={agency.factEvidence?.equipmentSuppliers} testId="evidence-equipment-suppliers" />
        </Panel>
      </div>

      {(activeEvidence.length > 0 || sourceFacts.length > 0 || associations.length > 0) && (
        <section aria-labelledby="agency-evidence-heading" data-testid="section-agency-evidence" className="rounded-lg border border-[var(--pi-border)] bg-[var(--pi-surface-bg)]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--pi-border)] px-3.5 py-2.5">
            <div>
              <h3 id="agency-evidence-heading" className="text-sm font-semibold text-[var(--pi-text-primary)]">Source details &amp; record associations</h3>
              <p className="mt-0.5 text-xs text-[var(--pi-text-secondary)]">Source facts and correction history stay in this browser; corrections do not overwrite app-supplied profile fields.</p>
            </div>
            <button type="button" onClick={onOpenSources} data-testid="button-review-source-records" className="inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 text-xs font-semibold text-[var(--pi-action)] hover:bg-[var(--pi-action-subtle)]">Open source workspace <ArrowUpRight aria-hidden="true" className="h-3.5 w-3.5" /></button>
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-3 p-3.5 lg:grid-cols-2">
            {sourceFacts.length > 0 && (
              <div className="min-w-0">
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--pi-text-secondary)]">Source facts &amp; local correction history</h4>
                <ul className="space-y-2">
                  {sourceFacts.map((fact, index) => (
                    <li key={fact.id || `${fact.fieldKey}-${index}`} data-testid={`source-fact-${fact.id || index}`} className="rounded-md border border-[var(--pi-border)] bg-[var(--pi-surface-subtle)] p-2.5">
                      <p className="text-xs font-semibold text-[var(--pi-text-secondary)]">{labels.get(fact.fieldKey) || fact.fieldKey}</p>
                      <p data-testid={`source-fact-value-${fact.id || index}`} className="mt-0.5 break-words text-sm font-medium text-[var(--pi-text-primary)]">{fact.value}{textAvailable(fact.unit) ? ` ${fact.unit}` : ''}</p>
                      {fact.correction && <span className="mt-1 inline-flex rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-950/50 dark:text-amber-200">Correction · prior entry retained</span>}
                      <p className="mt-1 break-words text-xs leading-relaxed text-[var(--pi-text-secondary)]">
                        Basis: {fact.basis} · Source: {fact.sourceName || 'Not listed in this profile'}
                        {textAvailable(fact.reportingPeriod) && <> · Period: {fact.reportingPeriod}</>}
                        {textAvailable(fact.effectivePeriod) && <> · Effective: {fact.effectivePeriod}</>}
                        {textAvailable(fact.geographicLevel) && <> · Geography: {fact.geographicLevel}</>}
                        {textAvailable(fact.geographicId) && <> / {fact.geographicId}</>}
                      </p>
                      {textAvailable(fact.note) && <p className="mt-1 break-words text-xs text-[var(--pi-text-secondary)]">{fact.note}</p>}
                      {textAvailable(fact.sourceUrl) && <ExternalSourceLink href={fact.sourceUrl} label="Open source" testId={`source-fact-link-${fact.id || index}`} />}
                      {fact.correction && (
                        <div data-testid={`overview-correction-history-${fact.id || index}`} className="mt-2 rounded-md border border-amber-200 bg-amber-50/70 p-2 dark:border-amber-900 dark:bg-amber-950/20">
                          <p className="text-[10px] font-semibold text-amber-950 dark:text-amber-200">{fact.correction.profileFieldLabel || labels.get(fact.fieldKey) || fact.fieldKey} · previous profile entry</p>
                          <p className="mt-0.5 break-words text-xs font-medium text-[var(--pi-text-primary)]">{fact.correction.previousValue}{textAvailable(fact.correction.previousUnit) ? ` ${fact.correction.previousUnit}` : ''}</p>
                          <p className="mt-1 break-words text-xs text-[var(--pi-text-secondary)]">
                            Prior source: {fact.correction.previousSourceName || 'Not recorded'}
                            {textAvailable(fact.correction.previousSourceRecordId) && <> · record {fact.correction.previousSourceRecordId}</>}
                            {textAvailable(fact.correction.previousReportingPeriod) && <> · period {fact.correction.previousReportingPeriod}</>}
                            {textAvailable(fact.correction.previousGeographicLevel) && <> · geography {fact.correction.previousGeographicLevel}</>}
                            {textAvailable(fact.correction.previousGeographicId) && <> / {fact.correction.previousGeographicId}</>}
                          </p>
                          {textAvailable(fact.correction.previousSourceUrl) && <ExternalSourceLink href={fact.correction.previousSourceUrl} label="Open previous source" testId={`source-fact-prior-link-${fact.id || index}`} />}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {activeEvidence.length > 0 && (
              <div className="min-w-0">
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--pi-text-secondary)]">Fact sources</h4>
                <ul className="space-y-1.5">
                  {activeEvidence.map(([key, evidence]) => (
                    <li key={key} data-testid={`fact-source-${key}`} className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-[var(--pi-border)] px-2.5 py-2">
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-[var(--pi-text-primary)]">{labels.get(key) || key}</p>
                        <p className="mt-0.5 break-words text-xs text-[var(--pi-text-secondary)]">
                          {evidence.sourceName || 'Not listed in this profile'}
                          {textAvailable(evidence.reportingPeriod) && <> · {evidence.reportingPeriod}</>}
                        </p>
                      </div>
                      {textAvailable(evidence.sourceUrl) && <ExternalSourceLink href={evidence.sourceUrl} label="Source" testId={`fact-source-link-${key}`} />}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {associations.length > 0 && (
              <div className="min-w-0 lg:col-span-2">
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--pi-text-secondary)]">Source-record associations</h4>
                <ul className="grid min-w-0 grid-cols-1 gap-2 md:grid-cols-2">
                  {associations.map((association, index) => (
                    <li key={association.id || `${association.sourceRecordId}-${index}`} data-testid={`source-record-association-${association.id || index}`} className="min-w-0 rounded-md border border-[var(--pi-border)] p-2.5">
                      <p className="text-sm font-semibold text-[var(--pi-text-primary)]">{association.sourceName}</p>
                      <p className="mt-0.5 break-all font-mono text-xs text-[var(--pi-text-secondary)]">{association.sourceRecordId}</p>
                      <p className="mt-1 text-xs text-[var(--pi-text-secondary)]">Decision: {association.decision} · Match basis: {association.matchBasis}</p>
                      <p className="mt-0.5 text-xs text-[var(--pi-text-secondary)]">
                        {dateLabel(association.sourceDate) && <>Source date: {dateLabel(association.sourceDate)} · </>}
                        Decision date: {dateLabel(association.decidedAt) || association.decidedAt}
                      </p>
                      <ExternalSourceLink href={association.sourceUrl} label="Open source record" testId={`source-record-link-${association.id || index}`} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
