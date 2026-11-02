import type { Agency, PredictiveWeights } from '../types';

export const DEFAULT_WEIGHTS: PredictiveWeights = {
  fleetAgeWeight: 40,
  cmsDenialWeight: 0,
  cardiacVolumeWeight: 27,
  grantAwardWeight: 20,
  softwareWhitespaceWeight: 13
};

export interface PulseIqScoreContributions {
  fleetObsolescencePts: number;
  clinicalAcuityPts: number;
  budgetGrantReadinessPts: number;
  softwareWhitespacePts: number;
}

export function calculatePulseIqContributions(
  agency: Agency,
  weights: PredictiveWeights = DEFAULT_WEIGHTS
): PulseIqScoreContributions {
  if (!agency) {
    return {
      fleetObsolescencePts: 0,
      clinicalAcuityPts: 0,
      budgetGrantReadinessPts: 0,
      softwareWhitespacePts: 0
    };
  }

  const wFleet = typeof weights?.fleetAgeWeight === 'number' ? weights.fleetAgeWeight : DEFAULT_WEIGHTS.fleetAgeWeight;
  const wCardiac = typeof weights?.cardiacVolumeWeight === 'number' ? weights.cardiacVolumeWeight : DEFAULT_WEIGHTS.cardiacVolumeWeight;
  const wGrant = typeof weights?.grantAwardWeight === 'number' ? weights.grantAwardWeight : DEFAULT_WEIGHTS.grantAwardWeight;
  const wSoftware = typeof weights?.softwareWhitespaceWeight === 'number' ? weights.softwareWhitespaceWeight : DEFAULT_WEIGHTS.softwareWhitespaceWeight;
  const totalWeight = (wFleet + wCardiac + wGrant + wSoftware) || 100;

  const age = agency.installedFleet?.defibAgeYears ?? 7;
  const brand = agency.installedFleet?.defibBrand || 'Stryker LIFEPAK 15';
  const isCompetitor = !brand.includes('ZOLL');
  const fleetScore = isCompetitor
    ? age >= 9 ? 100 : age >= 7 ? 85 : age >= 5 ? 65 : 40
    : age >= 7 ? 75 : 30;

  const cardiac = agency.annualCardiacArrestCalls ?? 600;
  const cardiacScore = cardiac >= 1800 ? 100 : cardiac >= 1000 ? 85 : cardiac >= 500 ? 70 : 50;
  const grantScore = agency.grantStatus?.afgAwarded
    ? 100
    : agency.grantStatus?.saferGrantActive
      ? 60
      : 25;

  const billingSoftware = agency.installedFleet?.billingSoftware || '';
  const epcrSoftware = agency.installedFleet?.epcrCadSoftware || '';
  const softwareScore = billingSoftware.includes('ZOLL') || epcrSoftware.includes('ZOLL') ? 35 : 95;

  return {
    fleetObsolescencePts: fleetScore * wFleet / totalWeight,
    clinicalAcuityPts: cardiacScore * wCardiac / totalWeight,
    budgetGrantReadinessPts: grantScore * wGrant / totalWeight,
    softwareWhitespacePts: softwareScore * wSoftware / totalWeight
  };
}

/**
 * Deterministic PulseIQ score from operational factors only.
 * The legacy CMS weight is intentionally ignored so saved settings cannot
 * reintroduce local claim-denial rates into prioritization.
 */
export function calculateScore(
  agency: Agency,
  weights: PredictiveWeights = DEFAULT_WEIGHTS
): number {
  if (!agency) return 75;

  const contributions = calculatePulseIqContributions(agency, weights);
  const raw = (
    contributions.fleetObsolescencePts +
    contributions.clinicalAcuityPts +
    contributions.budgetGrantReadinessPts +
    contributions.softwareWhitespacePts
  );

  return Math.min(99, Math.max(30, Math.round(raw)));
}
