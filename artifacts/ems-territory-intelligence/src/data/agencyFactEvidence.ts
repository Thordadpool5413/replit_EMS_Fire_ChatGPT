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
 * Requires a reviewed, fact-specific citation. Generic registry homepages,
 * search links, format checks, and broad verification flags are insufficient.
 */
export function hasReviewedFactEvidence(
  evidence: AgencyFactEvidence | undefined,
): boolean {
  if (!evidence?.reviewed || !evidence.sourceName.trim() || !evidence.sourceRecordId.trim()) {
    return false;
  }

  const reviewedAt = Date.parse(evidence.reviewedAt);
  if (!Number.isFinite(reviewedAt) || reviewedAt > Date.now()) return false;

  try {
    const source = new URL(evidence.sourceUrl);
    return source.protocol === 'https:' && source.pathname.length > 1;
  } catch {
    return false;
  }
}

export function hasAgencyFactEvidence(
  agency: Pick<Agency, 'factEvidence'>,
  key: AgencyFactEvidenceKey,
): boolean {
  return hasReviewedFactEvidence(agency.factEvidence?.[key]);
}

export function getAgencyFactEvidenceStatus(
  agency: Pick<Agency, 'factEvidence'>,
  key: AgencyFactEvidenceKey,
): 'verified' | 'unverified' {
  return hasAgencyFactEvidence(agency, key) ? 'verified' : 'unverified';
}
