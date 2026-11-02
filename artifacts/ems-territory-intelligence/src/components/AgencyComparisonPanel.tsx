import { useEffect, useMemo, useRef } from 'react';
import { ArrowUpRight, Building2, ClipboardList, MapPin, Shield, X } from 'lucide-react';
import type { Agency, AgencyFactEvidenceKey, AgencySourceFact } from '../types';

type AgencyComparisonPanelProps = {
  agencies: Agency[];
  onClose: () => void;
  onRemoveAgency: (agencyId: string) => void;
  onOpenProfile: (agency: Agency) => void;
};

type ComparisonRow = {
  label: string;
  key: string;
  unit?: string;
  getValue: (agency: Agency) => unknown;
};

type ComparisonSection = {
  title: string;
  caption: string;
  icon: typeof Building2;
  rows: ComparisonRow[];
};

const sections: ComparisonSection[] = [
  {
    title: 'Identity & location',
    caption: 'Agency record and jurisdiction',
    icon: Building2,
    rows: [
      { label: 'Agency type', key: 'departmentRegistry', getValue: (a) => a.agencyType },
      { label: 'Jurisdiction level', key: 'departmentRegistry', getValue: (a) => a.jurisdictionLevel },
      { label: 'FDID', key: 'departmentRegistry', getValue: (a) => a.fdid },
      { label: 'NPI', key: 'departmentRegistry', getValue: (a) => a.npiNumber },
      {
        label: 'Agency leadership',
        key: 'agencyLeadership',
        getValue: (a) => a.keyContacts?.map((contact) => `${contact.name} — ${contact.title || contact.role}`).filter(Boolean).join('; '),
      },
      { label: 'Address', key: 'providerAddress', getValue: (a) => a.address },
      { label: 'City', key: 'providerAddress', getValue: (a) => a.city },
      { label: 'County', key: 'serviceArea', getValue: (a) => a.county },
      { label: 'State', key: 'providerAddress', getValue: (a) => a.state },
      { label: 'ZIP code', key: 'providerAddress', getValue: (a) => a.zipCode },
      { label: 'Population served', key: 'serviceArea', unit: 'people', getValue: (a) => a.populationServed },
      { label: 'Response area', key: 'serviceArea', unit: 'sq mi', getValue: (a) => a.responseAreaSqMiles },
    ],
  },
  {
    title: 'Staffing & capacity',
    caption: 'Stations and frontline resources in the current record',
    icon: Shield,
    rows: [
      { label: 'EMS staff', key: 'frontlineApparatusStations', unit: 'staff', getValue: (a) => a.totalEMSStaff },
      { label: 'Stations', key: 'stationCount', unit: 'stations', getValue: (a) => a.stationsCount },
      { label: 'Ambulances', key: 'frontlineApparatusStations', unit: 'units', getValue: (a) => a.totalAmbulances },
      { label: 'Fire engines', key: 'apparatusBreakdown', unit: 'units', getValue: (a) => a.totalFireEngines },
      { label: 'Frontline rescue units', key: 'frontlineRescueUnits', unit: 'units', getValue: (a) => a.frontlineRescueUnitCount },
      { label: 'Response units', key: 'frontlineRescueUnits', unit: 'units', getValue: (a) => a.responseUnitCount },
    ],
  },
  {
    title: 'Emergency volume',
    caption: 'Annual volume fields in the current record',
    icon: ClipboardList,
    rows: [
      { label: 'Annual call volume', key: 'annualEmergencyVolume', unit: 'calls / year', getValue: (a) => a.annualCallVolume },
      { label: 'Annual 911 transports', key: 'annualEmergencyVolume', unit: 'transports / year', getValue: (a) => a.annual911Transports },
      { label: 'Annual cardiac arrest calls', key: 'clinicalOutcomes', unit: 'calls / year', getValue: (a) => a.annualCardiacArrestCalls },
    ],
  },
  {
    title: 'Clinical outcomes',
    caption: 'Values shown as recorded; no benchmark or interpretation applied',
    icon: Shield,
    rows: [
      { label: 'Bystander CPR rate', key: 'clinicalOutcomes', unit: '%', getValue: (a) => a.bystanderCPRRate },
      { label: 'Utstein survival rate', key: 'clinicalOutcomes', unit: '%', getValue: (a) => a.utsteinSurvivalRate },
      { label: 'CARES good neurological survival', key: 'clinicalOutcomes', unit: '%', getValue: (a) => a.qualityMetrics?.caresGoodNeurologicalSurvivalPct },
      { label: 'NEMSQA STEMI 12-lead acquisition', key: 'clinicalOutcomes', unit: '%', getValue: (a) => a.qualityMetrics?.nemsqaStemi12LeadAcquisitionPct },
      { label: 'NEMSQA chest compression fraction', key: 'clinicalOutcomes', unit: '%', getValue: (a) => a.qualityMetrics?.nemsqaChestCompressionFractionPct },
      { label: 'NEMSQA ETCO₂ ventilation compliance', key: 'clinicalOutcomes', unit: '%', getValue: (a) => a.qualityMetrics?.nemsqaEtco2VentilationCompliancePct },
      { label: 'AHA Mission: Lifeline tier', key: 'clinicalOutcomes', getValue: (a) => a.qualityMetrics?.ahaMissionLifelineTier },
    ],
  },
  {
    title: 'Installed equipment & systems',
    caption: 'Fleet and system fields in the current record',
    icon: ClipboardList,
    rows: [
      { label: 'Defibrillator brand / model', key: 'defibrillatorBiomedicalFleet', getValue: (a) => a.installedFleet?.defibBrand },
      { label: 'Defibrillator units', key: 'defibrillatorBiomedicalFleet', unit: 'units', getValue: (a) => a.installedFleet?.defibUnitsCount },
      { label: 'Defibrillator fleet age', key: 'defibrillatorBiomedicalFleet', unit: 'years', getValue: (a) => a.installedFleet?.defibAgeYears },
      { label: 'Warranty status', key: 'maintenanceContracts', getValue: (a) => a.installedFleet?.defibWarrantyStatus },
      { label: 'Mechanical CPR device', key: 'equipmentSuppliers', getValue: (a) => a.installedFleet?.mechanicalCPR },
      { label: 'Mechanical CPR units', key: 'equipmentSuppliers', unit: 'units', getValue: (a) => a.installedFleet?.cprUnitsCount },
      { label: 'Transport ventilator', key: 'equipmentSuppliers', getValue: (a) => a.installedFleet?.transportVentilator },
      { label: 'Ventilator units', key: 'equipmentSuppliers', unit: 'units', getValue: (a) => a.installedFleet?.ventUnitsCount },
      { label: 'ePCR / CAD software', key: 'communicationsSystems', getValue: (a) => a.installedFleet?.epcrCadSoftware },
      { label: 'Dispatch CAD vendor', key: 'communicationsSystems', getValue: (a) => a.installedFleet?.dispatchCadVendor },
      { label: 'Billing software', key: 'billingSoftware', getValue: (a) => a.installedFleet?.billingSoftware },
      { label: 'ALS monitors', key: 'defibrillatorBiomedicalFleet', unit: 'units', getValue: (a) => a.installedFleet?.alsMonitorsCount },
      { label: 'BLS defibrillators', key: 'defibrillatorBiomedicalFleet', unit: 'units', getValue: (a) => a.installedFleet?.blsDefibsCount },
    ],
  },
  {
    title: 'Contracts',
    caption: 'Contract fields in the current record',
    icon: ClipboardList,
    rows: [
      { label: 'Contract vendor', key: 'maintenanceContracts', getValue: (a) => a.competitorContract?.vendor },
      { label: 'Contract end date', key: 'operationalVolumeContracts', getValue: (a) => a.competitorContract?.contractEndDate },
      { label: 'Renewal window', key: 'maintenanceContracts', unit: 'days', getValue: (a) => a.competitorContract?.renewalWindowDays },
      { label: 'Annual service cost per unit', key: 'maintenanceContracts', unit: 'USD / unit / year', getValue: (a) => a.competitorContract?.annualServiceCostPerUnit },
      { label: 'Contract status', key: 'maintenanceContracts', getValue: (a) => a.competitorContract?.status },
      { label: 'Contract number', key: 'operationalVolumeContracts', getValue: (a) => a.competitorContract?.contractNumber },
    ],
  },
];

const displayValue = (value: unknown): string => {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
    return 'Not reported';
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
};

const safeExternalUrl = (url?: string) => {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : null;
  } catch {
    return null;
  }
};

function EvidenceDetails({ agency, factKey }: { agency: Agency; factKey: AgencyFactEvidenceKey }) {
  const evidence = agency.factEvidence?.[factKey];
  const sourceFacts = (agency.sourceFacts ?? []).filter((fact) => fact.fieldKey === factKey);

  if (!evidence && sourceFacts.length === 0) return null;

  return (
    <div className="mt-2 space-y-2 border-t border-dashed border-[#D9E2EC] pt-2 dark:border-[#2B3F5C]">
      {evidence && (
        <div className="rounded-md bg-[#F1F5F8] px-2.5 py-2 text-[11px] leading-4 text-[#586B80] dark:bg-[#16243A] dark:text-slate-300" data-testid={`evidence-${agency.id}-${factKey}`}>
          <div className="mb-1 flex items-center gap-1.5 font-semibold text-[#3C526B] dark:text-slate-200">
            <span className="h-1.5 w-1.5 rounded-full bg-[#0E7778]" aria-hidden="true" />
            Attached source reference
          </div>
          <p><span className="font-medium">Source:</span> {displayValue(evidence.sourceName)}</p>
          <p><span className="font-medium">Record ID:</span> {displayValue(evidence.sourceRecordId)}</p>
          {safeExternalUrl(evidence.sourceUrl) ? (
            <a className="mt-0.5 inline-flex items-center gap-1 text-[#2458A6] underline underline-offset-2 hover:text-[#173E78] dark:text-sky-300 dark:hover:text-sky-200" href={safeExternalUrl(evidence.sourceUrl) ?? undefined} target="_blank" rel="noreferrer" data-testid={`evidence-link-${agency.id}-${factKey}`}>
              Open source <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
            </a>
          ) : null}
          <p><span className="font-medium">Period:</span> {evidence.reportingPeriod?.trim() || 'Period not stated'}</p>
          <p><span className="font-medium">Geography:</span> {[evidence.geographicLevel, evidence.geographicId, evidence.geographicRelationship, evidence.geographicMatchBasis].filter(Boolean).join(' · ') || 'Not reported'}</p>
          {evidence.note?.trim() && <p className="mt-1 break-words">{evidence.note}</p>}
        </div>
      )}
      {sourceFacts.map((fact) => (
        <SourceFactDetails key={fact.id} fact={fact} agencyId={agency.id} />
      ))}
    </div>
  );
}

function SourceFactDetails({ fact, agencyId }: { fact: AgencySourceFact; agencyId: string }) {
  const href = safeExternalUrl(fact.sourceUrl);
  return (
    <div className="rounded-md border border-[#D4E3E4] bg-[#F1F8F7] px-2.5 py-2 text-[11px] leading-4 text-[#486567] dark:border-[#285153] dark:bg-[#102B30] dark:text-teal-100" data-testid={`source-fact-${agencyId}-${fact.id}`}>
      <div className="mb-1 flex items-center gap-1.5 font-semibold text-[#176568] dark:text-teal-200">
        <span className="h-1.5 w-1.5 rounded-full bg-[#16888A]" aria-hidden="true" />
        Separate source fact
      </div>
      <p className="break-words"><span className="font-medium">Source value:</span> {displayValue(fact.value)}{fact.unit ? ` ${fact.unit}` : ''}</p>
      <p><span className="font-medium">Source:</span> {displayValue(fact.sourceName)}</p>
      <p><span className="font-medium">Record ID:</span> {displayValue(fact.sourceRecordId)}</p>
      {href && <a className="mt-0.5 inline-flex items-center gap-1 text-[#176568] underline underline-offset-2 dark:text-teal-200" href={href} target="_blank" rel="noreferrer" data-testid={`source-fact-link-${agencyId}-${fact.id}`}>Open source <ArrowUpRight className="h-3 w-3" aria-hidden="true" /></a>}
      <p><span className="font-medium">Period:</span> {fact.reportingPeriod?.trim() || fact.effectivePeriod?.trim() || 'Period not stated'}{fact.reportingPeriod && fact.effectivePeriod ? ` · Effective: ${fact.effectivePeriod}` : ''}</p>
      <p><span className="font-medium">Geography:</span> {[fact.geographicLevel, fact.geographicId, fact.geographicRelationship].filter(Boolean).join(' · ') || 'Not reported'}</p>
      <p><span className="font-medium">Basis:</span> {displayValue(fact.basis)}</p>
      {fact.note?.trim() && <p className="mt-1 break-words">{fact.note}</p>}
    </div>
  );
}

function ValueCell({ agency, row }: { agency: Agency; row: ComparisonRow }) {
  const value = row.getValue(agency);
  return (
    <div className="min-w-0 px-3 py-3 sm:px-4" data-testid={`comparison-value-${agency.id}-${row.key}-${row.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}>
      <div className={`break-words text-[13px] font-semibold leading-5 ${value === null || value === undefined || (typeof value === 'string' && value.trim() === '') ? 'text-[#8997A8] dark:text-slate-500' : 'text-[#1B3047] dark:text-slate-100'}`}>
        {displayValue(value)}{row.unit && displayValue(value) !== 'Not reported' ? <span className="ml-1 font-normal text-[#78889B] dark:text-slate-400">{row.unit}</span> : null}
      </div>
      <EvidenceDetails agency={agency} factKey={row.key as AgencyFactEvidenceKey} />
    </div>
  );
}

export function AgencyComparisonPanel({ agencies, onClose, onRemoveAgency, onOpenProfile }: AgencyComparisonPanelProps) {
  const agencyCount = agencies.length;
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const columnStyle = useMemo(() => ({ gridTemplateColumns: `minmax(132px, 0.84fr) repeat(${Math.max(agencyCount, 1)}, minmax(210px, 1fr))` }), [agencyCount]);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === 'Tab') {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (!focusable?.length) {
          event.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <section ref={dialogRef} className="fixed inset-0 z-[70] flex min-h-[100dvh] flex-col bg-[#EDF2F5] text-[#172D43] dark:bg-[#0B1320] dark:text-slate-100" role="dialog" aria-modal="true" aria-labelledby="agency-comparison-title" data-testid="agency-comparison-panel">
      <header className="shrink-0 border-b border-[#D5DFE8] bg-[#F8FAFB] dark:border-[#263951] dark:bg-[#111C2D]">
        <div className="mx-auto flex w-full max-w-[1600px] items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#E1ECEC] text-[#176568] dark:bg-[#163638] dark:text-teal-200">
              <MapPin className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#667B8F] dark:text-slate-400">Territory intelligence / field comparison</p>
              <h1 id="agency-comparison-title" className="mt-0.5 truncate font-display text-xl font-bold tracking-tight sm:text-2xl">Agency comparison</h1>
              <p className="mt-1 text-xs text-[#617488] dark:text-slate-400">Current agency records only · {agencyCount} {agencyCount === 1 ? 'agency' : 'agencies'} selected</p>
            </div>
          </div>
          <button ref={closeButtonRef} type="button" onClick={onClose} aria-label="Close agency comparison" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#D2DDE6] bg-[#F8FAFB] text-[#52677B] transition-colors hover:border-[#AEBECA] hover:bg-white hover:text-[#1A3048] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#16888A] dark:border-[#2B3F5C] dark:bg-[#16243A] dark:text-slate-300 dark:hover:bg-[#1B2C44]" data-testid="button-close-comparison">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="mx-auto max-w-[1600px] px-4 pb-3 sm:px-6 lg:px-8">
          <p className="rounded-md border-l-[3px] border-[#B66A35] bg-[#F7F0E9] px-3 py-2 text-[11px] leading-4 text-[#6D523D] dark:border-[#D68B54] dark:bg-[#30271F] dark:text-orange-100">
            Profile values and attached source facts are shown separately. “Not reported” means the supplied record has no displayable value.
          </p>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto">
        {agencies.length === 0 ? (
          <div className="mx-auto flex min-h-[50vh] max-w-xl flex-col items-center justify-center px-6 text-center" data-testid="comparison-empty-state">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#E1ECEC] text-[#176568] dark:bg-[#163638] dark:text-teal-200"><Building2 className="h-5 w-5" aria-hidden="true" /></div>
            <h2 className="mt-4 font-display text-lg font-bold">No agencies selected</h2>
            <p className="mt-1 text-sm text-[#65798D] dark:text-slate-400">Close this workspace and select current agency records to compare.</p>
            <button type="button" onClick={onClose} className="mt-5 rounded-md bg-[#176568] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#105255] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#16888A]" data-testid="button-close-empty-comparison">Return to territory</button>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-[1600px] px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
            <div className="hidden overflow-x-auto rounded-xl border border-[#D5DFE8] bg-[#F9FBFC] shadow-[0_8px_24px_-20px_rgba(22,45,66,0.45)] dark:border-[#263951] dark:bg-[#111C2D] md:block">
              <div className="sticky top-0 z-20 grid border-b border-[#D5DFE8] bg-[#F5F8FA] dark:border-[#263951] dark:bg-[#142238]" style={columnStyle}>
                <div className="flex items-end px-4 py-4 text-[10px] font-bold uppercase tracking-[0.13em] text-[#728398] dark:text-slate-400">Comparable field</div>
                {agencies.map((agency, index) => (
                  <div key={agency.id} className={`min-w-0 border-l border-[#D5DFE8] px-4 py-3 dark:border-[#263951] ${index === 0 ? 'border-t-[3px] border-t-[#176568]' : index === 1 ? 'border-t-[3px] border-t-[#B66A35]' : 'border-t-[3px] border-t-[#647891]'}`} data-testid={`comparison-agency-header-${agency.id}`}>
                    <div className="flex items-start justify-between gap-2">
                      <button type="button" onClick={() => onOpenProfile(agency)} className="min-w-0 text-left group" data-testid={`button-open-profile-${agency.id}`}>
                        <span className="block truncate font-display text-[15px] font-bold leading-5 text-[#20354B] group-hover:text-[#176568] group-focus-visible:text-[#176568] dark:text-slate-100 dark:group-hover:text-teal-200">{agency.name}</span>
                        <span className="mt-1 block truncate text-[11px] text-[#6B7F92] dark:text-slate-400">{[agency.city, agency.stateCode].filter(Boolean).join(', ') || 'Location not reported'}</span>
                      </button>
                      <button type="button" onClick={() => onRemoveAgency(agency.id)} aria-label={`Remove ${agency.name} from comparison`} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#8291A1] transition-colors hover:bg-[#F0E8E2] hover:text-[#9B4E2E] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#16888A] dark:hover:bg-[#3A2A24] dark:hover:text-orange-200" data-testid={`button-remove-agency-${agency.id}`}>
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                    <div className="mt-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-[#6C7D8E] dark:text-slate-400"><span className="h-1.5 w-1.5 rounded-full bg-[#16888A]" />{agency.agencyType}</div>
                  </div>
                ))}
              </div>
              {sections.map((section) => {
                const SectionIcon = section.icon;
                return (
                  <section key={section.title} aria-label={section.title}>
                    <div className="flex items-center gap-2 border-b border-[#DCE4EA] bg-[#EDF2F5] px-4 py-2.5 dark:border-[#263951] dark:bg-[#16243A]">
                      <SectionIcon className="h-3.5 w-3.5 text-[#176568] dark:text-teal-300" aria-hidden="true" />
                      <h2 className="text-xs font-bold text-[#30465C] dark:text-slate-100">{section.title}</h2>
                      <span className="ml-1 text-[10px] text-[#74869A] dark:text-slate-400">{section.caption}</span>
                    </div>
                    {section.rows.map((row) => (
                      <div key={`${section.title}-${row.label}`} className="grid border-b border-[#E0E7EC] last:border-b-0 dark:border-[#263951]" style={columnStyle}>
                        <div className="flex items-start px-4 py-3 text-[11px] font-semibold leading-5 text-[#61758A] dark:text-slate-300">{row.label}{row.unit && <span className="ml-1 font-normal text-[#8492A1]">({row.unit})</span>}</div>
                        {agencies.map((agency) => <div key={agency.id} className="border-l border-[#E0E7EC] dark:border-[#263951]"><ValueCell agency={agency} row={row} /></div>)}
                      </div>
                    ))}
                  </section>
                );
              })}
            </div>

            <div className="space-y-4 md:hidden">
              {agencies.map((agency) => (
                <article key={agency.id} className="overflow-hidden rounded-xl border border-[#D5DFE8] bg-[#F9FBFC] shadow-[0_8px_24px_-20px_rgba(22,45,66,0.45)] dark:border-[#263951] dark:bg-[#111C2D]" data-testid={`comparison-agency-card-${agency.id}`}>
                  <div className="sticky top-0 z-10 border-b border-[#D5DFE8] border-t-[3px] border-t-[#176568] bg-[#F5F8FA] px-4 py-3 dark:border-[#263951] dark:bg-[#142238]">
                    <div className="flex items-start justify-between gap-3">
                      <button type="button" onClick={() => onOpenProfile(agency)} className="min-w-0 text-left" data-testid={`button-open-profile-mobile-${agency.id}`}>
                        <span className="block truncate font-display text-base font-bold text-[#20354B] dark:text-slate-100">{agency.name}</span>
                        <span className="mt-0.5 block truncate text-xs text-[#6B7F92] dark:text-slate-400">{[agency.city, agency.stateCode].filter(Boolean).join(', ') || 'Location not reported'}</span>
                      </button>
                      <button type="button" onClick={() => onRemoveAgency(agency.id)} aria-label={`Remove ${agency.name} from comparison`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-[#8291A1] hover:bg-[#F0E8E2] hover:text-[#9B4E2E] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#16888A] dark:hover:bg-[#3A2A24]" data-testid={`button-remove-agency-mobile-${agency.id}`}><X className="h-4 w-4" aria-hidden="true" /></button>
                    </div>
                    <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#738498] dark:text-slate-400">{agency.agencyType} <span className="mx-1">/</span> FDID {displayValue(agency.fdid)}</p>
                  </div>
                  {sections.map((section) => (
                    <section key={section.title} aria-label={`${agency.name} ${section.title}`}>
                      <h2 className="border-b border-[#DCE4EA] bg-[#EDF2F5] px-4 py-2 text-xs font-bold text-[#30465C] dark:border-[#263951] dark:bg-[#16243A] dark:text-slate-100">{section.title}</h2>
                      {section.rows.map((row) => (
                        <div key={`${section.title}-${row.label}`} className="border-b border-[#E0E7EC] px-1 last:border-b-0 dark:border-[#263951]">
                          <div className="px-3 pt-3 text-[10px] font-bold uppercase tracking-wide text-[#7A8A9A] dark:text-slate-400">{row.label}{row.unit && <span className="ml-1 font-normal normal-case">({row.unit})</span>}</div>
                          <ValueCell agency={agency} row={row} />
                        </div>
                      ))}
                    </section>
                  ))}
                </article>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

export default AgencyComparisonPanel;
