import { hasAgencyContractEvidence, hasMappedFactSource } from '../data/agencyFactEvidence';
import type { DepartmentMetric, EquipmentCategory, ProviderEvidence } from '../data/providerProfileEvidence';
import type { Agency, AgencyFactEvidenceKey } from '../types';
import { safeSourceUrl } from './factReviewStore';

export const providerEquipmentLabels = {
  aed: 'AED',
  monitor: 'Monitor / defibrillator',
  cpr: 'Mechanical CPR',
  ventilator: 'Transport ventilator',
  supplies: 'Accessories & supplies',
} satisfies Record<EquipmentCategory, string>;

export const providerCurrency = new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2,
});

export function formatProviderMetric(metric: Pick<DepartmentMetric, 'value' | 'format'>) {
  if (metric.format === 'currency') return providerCurrency.format(metric.value);
  if (metric.format === 'duration') return Math.floor(metric.value / 60) + 'm ' + metric.value % 60 + 's';
  return metric.value.toLocaleString('en-US') + (metric.format === 'percent' ? '%' : '');
}

type CardSource = { label: string; date?: string; url?: string };
type CardFact = { label: string; value: string; status?: string; period?: string; detail?: string; source: CardSource };
type GroupKey = 'equipment' | 'funding' | 'quality' | 'operations' | 'workflow';
export type CardFacts = Record<GroupKey, CardFact[]>;

const number = (value: number | undefined) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value.toLocaleString('en-US') : undefined;
const rate = (value: number | undefined) =>
  typeof value === 'number' && value <= 100 && number(value) !== undefined ? value.toLocaleString('en-US') + '%' : undefined;
const text = (value?: string) =>
  value?.trim() && !/^(not reported|not listed|unknown|n\/a|unavailable|—)$/i.test(value.trim()) ? value.trim() : undefined;

function metricFact(metric: DepartmentMetric): CardFact {
  return { label: metric.label, value: formatProviderMetric(metric), period: metric.reportingPeriod, detail: metric.context, source: metric.source };
}

function details(parts: [string, string | undefined][]) {
  return parts.filter(([, value]) => value).map(([label, value]) => label + ' ' + value).join(' · ');
}

export function buildProviderCardFacts(evidence?: ProviderEvidence, agency?: Agency, archived: DepartmentMetric[] = []): CardFacts {
  const facts: CardFacts = {
    equipment: (evidence?.equipment ?? []).map(entry => {
      const model = [entry.manufacturer, entry.model].filter(Boolean).join(' ');
      const quantity = entry.quantity === undefined ? undefined : entry.quantity.toLocaleString('en-US') + ' units';
      return {
        label: providerEquipmentLabels[entry.category],
        value: [quantity, model].filter(Boolean).join(' · ') || entry.deployment || providerEquipmentLabels[entry.category],
        status: entry.status,
        detail: [entry.details, details([
          ['Supplier', entry.supplier], ['Approved', entry.approvedOn], ['Purchased', entry.lastPurchasedOn], ['Paid', entry.paidOn],
          ['Owner', entry.owner], ['Maintainer', entry.maintainedBy], ['Acquired', entry.acquiredOn],
          ['Warranty ends', entry.warrantyEnds], ['Service ends', entry.serviceEnds],
          ['Pads expire', entry.padsExpireOn], ['Batteries expire', entry.batteriesExpireOn],
        ])].filter(Boolean).join(' '),
        source: entry.source,
      };
    }),
    funding: (evidence?.funding ?? []).map(entry => ({
      label: entry.title,
      value: entry.amount === undefined ? entry.status : providerCurrency.format(entry.amount),
      status: entry.amount === undefined ? undefined : entry.status,
      detail: [entry.basis, details([
        ['Fiscal year', entry.fiscalYear?.toString()], ['Spend by', entry.spendBy], ['Purchasing vehicle', entry.purchasingVehicle],
        ['Local match', entry.localMatch === undefined ? undefined : providerCurrency.format(entry.localMatch)],
      ])].filter(Boolean).join(' '),
      source: entry.source,
    })),
    quality: (evidence?.quality ?? []).map(metricFact),
    operations: (evidence?.operations ?? []).map(metricFact),
    workflow: [
      ...(evidence?.contacts ?? []).map(entry => ({
        label: entry.role, value: entry.name ?? entry.phone ?? entry.email ?? entry.role,
        detail: [entry.name && entry.phone, entry.email].filter(Boolean).join(' · '), source: entry.source,
      })),
      ...(evidence?.accountContext ?? []).map(entry => ({
        label: entry.area, value: entry.title, detail: entry.detail, source: entry.source,
      })),
    ],
  };

  const stationDirectory = evidence?.stationDirectory;
  if (stationDirectory) {
    facts.operations.push({
      label: 'Locations in department directory',
      value: stationDirectory.stations.length.toLocaleString('en-US'),
      detail: stationDirectory.visitContact?.phone ? 'Station visits: ' + stationDirectory.visitContact.phone : undefined,
      source: stationDirectory.source,
    });
  }

  if (agency) {
    const add = (group: GroupKey, key: AgencyFactEvidenceKey, label: string, value?: string, detail?: string) => {
      const fact = agency.factEvidence?.[key];
      if (!value || !fact || fact.sourceKind === 'logic' ||
        (fact.geographicLevel && fact.geographicLevel !== 'agency') || !hasMappedFactSource(fact)) return;
      facts[group].push({ label, value, detail, source: {
        label: fact.sourceName, date: fact.reportingPeriod, url: safeSourceUrl(fact.sourceUrl),
      } });
    };

    const fleet = agency.installedFleet;
    const clinical = agency.qualityMetrics;
    const volumeSource = agency.factEvidence?.annualCallsReceived ? 'annualCallsReceived' : 'annualEmergencyVolume';
    const stationsSource = agency.factEvidence?.stationCount ? 'stationCount' : 'frontlineApparatusStations';
    add('equipment', 'defibrillatorBiomedicalFleet', 'Monitor / defibrillator', text(fleet?.defibBrand), details([
      ['Units', number(fleet?.defibUnitsCount)], ['Age in years', number(fleet?.defibAgeYears)], ['Warranty', text(fleet?.defibWarrantyStatus)],
    ]));
    add('equipment', 'monitorModelTransition', 'Monitor replacement record', text(fleet?.defibBrand), agency.factEvidence?.monitorModelTransition?.note);
    add('equipment', 'equipmentSuppliers', 'Mechanical CPR', text(fleet?.mechanicalCPR), details([['Units', number(fleet?.cprUnitsCount)]]));
    add('equipment', 'equipmentSuppliers', 'Transport ventilator', text(fleet?.transportVentilator), details([['Units', number(fleet?.ventUnitsCount)]]));
    if (hasAgencyContractEvidence(agency)) {
      add('funding', 'maintenanceContracts', 'Service contract ends', agency.competitorContract.contractEndDate,
        details([['Vendor', text(agency.competitorContract.vendor)], ['Contract', text(agency.competitorContract.contractNumber)]]));
    }
    const grant = agency.grantStatus;
    if (grant?.afgAwarded) {
      const amount = number(grant.afgAwardAmount) === undefined ? undefined : providerCurrency.format(grant.afgAwardAmount);
      add('funding', 'federalGrant', 'FEMA Assistance to Firefighters Grant', amount ?? 'Award reported',
        details([['Fiscal year', number(grant.afgFiscalYear)], ['Award number', text(grant.afgAwardNumber)], ['Purpose', text(grant.afgPurpose)]]));
    }
    add('quality', 'clinicalOutcomes', 'Utstein survival to hospital discharge', rate(agency.utsteinSurvivalRate));
    add('quality', 'clinicalOutcomes', 'Annual cardiac arrests', number(agency.annualCardiacArrestCalls));
    add('quality', 'clinicalOutcomes', 'Bystander CPR', rate(agency.bystanderCPRRate));
    add('quality', 'clinicalOutcomes', 'Chest compression fraction', rate(clinical?.nemsqaChestCompressionFractionPct));
    add('quality', 'clinicalOutcomes', 'Timely STEMI 12-lead acquisition', rate(clinical?.nemsqaStemi12LeadAcquisitionPct));
    add('quality', 'clinicalOutcomes', 'ETCO₂ ventilation compliance', rate(clinical?.nemsqaEtco2VentilationCompliancePct));
    add('quality', 'clinicalOutcomes', 'Pediatric respiratory support', rate(clinical?.nemsqaPediatricRespiratorySupportPct));
    add('quality', 'clinicalOutcomes', 'Stroke last-known-well documentation', rate(clinical?.nemsqaStrokeLkwDocumentedPct));
    add('quality', 'clinicalOutcomes', 'Effective pain management', rate(clinical?.nemsqaPainManagementEffectivePct));
    add('quality', 'clinicalOutcomes', 'Good neurological survival at discharge', rate(clinical?.caresGoodNeurologicalSurvivalPct));
    add('operations', volumeSource, 'Annual calls', number(agency.annualCallVolume));
    add('operations', 'annualEmergencyVolume', 'Annual 911 transports', number(agency.annual911Transports));
    add('operations', stationsSource, 'Stations', number(agency.stationsCount));
    add('operations', 'frontlineApparatusStations', 'Ambulances', number(agency.totalAmbulances));
    add('operations', 'frontlineApparatusStations', 'Fire engines', number(agency.totalFireEngines));
    add('operations', 'frontlineRescueUnits', 'Frontline rescue units', number(agency.frontlineRescueUnitCount));
    add('operations', 'frontlineRescueUnits', 'Response units', number(agency.responseUnitCount));
    add('workflow', 'epcrSystem', 'ePCR system', text(fleet?.epcrCadSoftware));
    add('workflow', 'communicationsSystems', 'Dispatch CAD', text(fleet?.dispatchCadVendor));
    add('workflow', 'billingSoftware', 'EMS billing system', text(fleet?.billingSoftware));
    for (const contact of agency.keyContacts ?? []) {
      const key = agency.factEvidence?.decisionMakers ? 'decisionMakers' : 'agencyLeadership';
      add('workflow', key, text(contact.title) ?? 'Department leadership', text(contact.name));
    }
  }

  facts.operations.push(...archived.map(metricFact));
  return facts;
}

export function providerCallQuestions(evidence?: ProviderEvidence, savedContract = false) {
  const equipment = evidence?.equipment ?? [];
  const context = evidence?.accountContext ?? [];
  const purchase = evidence?.funding?.some(entry => entry.status !== 'Reported expenditure') ||
    equipment.some(entry => entry.status === 'Proposed purchase' || entry.status === 'Purchase approved');
  const reportedFleet = equipment.some(entry => entry.status === 'In service reported' || entry.status === 'Documented historically');
  const questions: string[] = [];
  if (context.some(entry => entry.title === 'AED-to-monitor compatibility')) {
    questions.push('Which pads and connectors must carry over from a public-access AED to a crew’s monitor?');
  }
  if (equipment.some(entry => entry.status === 'Service agreement') || savedContract) {
    questions.push('Who manages the service agreement, and when do the contract and its renewal options expire?');
  }
  if (evidence?.quality?.some(metric => /cardiac arrest|ROSC/i.test(metric.label))) {
    questions.push('How does the EMS quality team review CPR events today, and what information is hard to capture?');
  }
  if (purchase) questions.push('Has the purchase been awarded and deployed? What remains to be purchased, and who owns the decision?');
  questions.push(reportedFleet
    ? 'Which makes and models are in service today, and what are their service and replacement dates?'
    : 'Which devices are in service on front-line units, reserves, and public-access sites?');
  if (!purchase) questions.push('Who owns equipment evaluation and budget approval, and when is the next capital or grant decision?');
  return questions;
}
