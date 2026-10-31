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

/** Source mapped for user review; this is not the same as source-reviewed. */
export function hasAgencyFactEvidence(
  agency: Pick<Agency, 'factEvidence'>,
  key: AgencyFactEvidenceKey,
): boolean {
  return hasMappedFactSource(agency.factEvidence?.[key]);
}

export function getAgencyFactEvidenceStatus(
  agency: Pick<Agency, 'factEvidence'>,
  key: AgencyFactEvidenceKey,
): 'source-reviewed' | 'source-mapped' | 'source-required' {
  if (hasReviewedAgencyFactEvidence(agency, key)) return 'source-reviewed';
  if (hasAgencyFactEvidence(agency, key)) return 'source-mapped';
  return 'source-required';
}
