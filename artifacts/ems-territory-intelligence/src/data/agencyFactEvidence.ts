import type { Agency, AgencyFactEvidence, AgencyFactEvidenceKey } from '../types';

export const AGENCY_FACT_EVIDENCE_FIELDS: Array<{
  key: AgencyFactEvidenceKey;
  label: string;
}> = [
  { key: 'providerAddress', label: 'Provider or department address' },
  { key: 'departmentRegistry', label: 'Agency registry identifier' },
  { key: 'agencyLeadership', label: 'Agency leadership' },
  { key: 'decisionMakers', label: 'Decision makers and command directory' },
  { key: 'frontlineApparatusStations', label: 'Frontline apparatus and stations' },
  { key: 'annualEmergencyVolume', label: 'Annual emergency volume' },
  { key: 'apparatusBreakdown', label: 'Apparatus and emergency vehicle breakdown' },
  { key: 'receivingHospitalStemi', label: 'Receiving hospitals and STEMI cath lab logistics' },
  { key: 'defibrillatorBiomedicalFleet', label: 'Active defibrillator and biomedical fleet' },
  { key: 'maintenanceContracts', label: 'Frontline apparatus and maintenance contracts' },
  { key: 'communicationsSystems', label: '911 CAD and ePCR systems' },
  { key: 'equipmentSuppliers', label: 'Equipment in use and current suppliers' },
  { key: 'verifiedHardware', label: 'Verified hardware' },
  { key: 'operationalVolumeContracts', label: 'Operational volume and contract records' },
  { key: 'clinicalOutcomes', label: 'Clinical outcomes' },
  { key: 'cmsClaims', label: 'CMS claims and reimbursement' },
  { key: 'federalGrant', label: 'Federal grant records' },
  { key: 'stationCount', label: 'Fire-rescue station count' },
  { key: 'frontlineRescueUnits', label: 'Frontline rescue-unit count' },
  { key: 'annualCallsReceived', label: 'Reported fire-rescue calls received' },
  { key: 'epcrSystem', label: 'ePCR system and contract record' },
  { key: 'billingSoftware', label: 'EMS billing software' },
  { key: 'monitorModelTransition', label: 'Cardiac monitor model and replacement status' },
  { key: 'serviceArea', label: 'Reported service area' },
];

/**
 * Indicates that a fact has a concrete source or methodology mapped to it.
 * This does not assert that the value is correct; the end user still reviews
 * the linked source. A reviewed flag is tracked separately.
 */
export function hasMappedFactSource(
  evidence: AgencyFactEvidence | undefined,
): boolean {
  if (!evidence?.sourceName.trim() || !evidence.sourceRecordId.trim()) {
    return false;
  }

  if (
    evidence.geographicLevel &&
    evidence.geographicLevel !== 'agency' &&
    (!evidence.geographicRelationship ||
      evidence.geographicMatchBasis !== 'user-confirmed')
  ) {
    return false;
  }

  if (
    (evidence.sourceKind === 'logic' ||
      evidence.sourceKind === 'mcp' ||
      evidence.sourceKind === 'dataset' ||
      evidence.sourceKind === 'manual') &&
    evidence.note?.trim()
  ) {
    return true;
  }

  try {
    const source = new URL(evidence.sourceUrl || '');
    return source.protocol === 'https:' && source.pathname.length > 1;
  } catch {
    return false;
  }
}

/** Indicates that a mapped source was checked against the exact fact. */
export function hasReviewedFactEvidence(
  evidence: AgencyFactEvidence | undefined,
): boolean {
  if (!evidence?.reviewed || !hasMappedFactSource(evidence)) return false;
  const reviewedAt = Date.parse(evidence.reviewedAt || '');
  return Number.isFinite(reviewedAt) && reviewedAt <= Date.now();
}

export function hasReviewedAgencyFactEvidence(
  agency: Pick<Agency, 'factEvidence'>,
  key: AgencyFactEvidenceKey,
): boolean {
  return hasReviewedFactEvidence(agency.factEvidence?.[key]);
}

/** True when the agency record contains data this field can display. */
export function hasAgencyFactEvidence(
  agency: Agency,
  key: AgencyFactEvidenceKey,
): boolean {
  return hasMappedFactSource(agency.factEvidence?.[key]) || hasAgencyFactData(agency, key);
}

export function hasMappedAgencyFactEvidence(
  agency: Pick<Agency, 'factEvidence'>,
  key: AgencyFactEvidenceKey,
): boolean {
  return hasMappedFactSource(agency.factEvidence?.[key]);
}

function containsDisplayableValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number' || typeof value === 'boolean') return true;
  if (Array.isArray(value)) return value.some(containsDisplayableValue);
  if (typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).some(containsDisplayableValue);
  }
  return false;
}

export function getAgencyFactValues(
  agency: Agency,
  key: AgencyFactEvidenceKey,
): unknown[] {
  const facts: Record<AgencyFactEvidenceKey, unknown[]> = {
    providerAddress: [agency.address, agency.headquartersPhone, agency.officialWebsite],
    departmentRegistry: [agency.fdid, agency.stateLicenseNumber, agency.npiNumber, agency.taxonomyCode],
    agencyLeadership: [agency.keyContacts],
    decisionMakers: [agency.keyContacts],
    frontlineApparatusStations: [
      agency.totalAmbulances, agency.totalFireEngines, agency.stationsCount,
      agency.frontlineRescueUnitCount, agency.responseUnitCount, agency.apparatusFleet,
    ],
    annualEmergencyVolume: [agency.annualCallVolume, agency.annual911Transports],
    apparatusBreakdown: [agency.apparatusFleet, agency.fleet],
    receivingHospitalStemi: [agency.hospitalLogistics, agency.clinical?.primaryReceivingHospitals, agency.gisData?.primaryReceivingHospital],
    defibrillatorBiomedicalFleet: [agency.installedFleet, agency.fleet],
    maintenanceContracts: [agency.competitorContract, agency.installedFleet?.warrantyContractDoc],
    communicationsSystems: [agency.installedFleet?.dispatchCadVendor, agency.installedFleet?.epcrCadSoftware],
    equipmentSuppliers: [agency.installedFleet, agency.fleet],
    verifiedHardware: [agency.installedFleet?.capitalAssetLedgerId, agency.installedFleet?.procurementResolutionId, agency.installedFleet?.procurementSourceDoc],
    operationalVolumeContracts: [agency.annualCallVolume, agency.annual911Transports, agency.competitorContract],
    clinicalOutcomes: [agency.annualCardiacArrestCalls, agency.utsteinSurvivalRate, agency.clinical, agency.qualityMetrics],
    cmsClaims: [agency.cmsData],
    federalGrant: [agency.grantStatus, agency.femaGrantHistory, agency.afgGrants, agency.liveFemaAwards],
    stationCount: [agency.stationsCount, agency.fleet?.totalStations],
    frontlineRescueUnits: [agency.frontlineRescueUnitCount, agency.responseUnitCount],
    annualCallsReceived: [agency.annualCallVolume, agency.annual911Transports],
    epcrSystem: [agency.installedFleet?.epcrCadSoftware],
    billingSoftware: [agency.installedFleet?.billingSoftware],
    monitorModelTransition: [agency.installedFleet?.defibBrand, agency.fleet?.currentDefibVendor],
    serviceArea: [agency.populationServed, agency.responseAreaSqMiles, agency.gisData],
  };
  return facts[key].filter(containsDisplayableValue);
}

export function hasAgencyFactData(
  agency: Agency,
  key: AgencyFactEvidenceKey,
): boolean {
  return getAgencyFactValues(agency, key).length > 0;
}

export function getAgencyFactEvidenceStatus(
  agency: Pick<Agency, 'factEvidence'>,
  key: AgencyFactEvidenceKey,
): 'source-reviewed' | 'source-mapped' | 'source-required' {
  if (hasReviewedAgencyFactEvidence(agency, key)) return 'source-reviewed';
  if (hasMappedAgencyFactEvidence(agency, key)) return 'source-mapped';
  return 'source-required';
}
