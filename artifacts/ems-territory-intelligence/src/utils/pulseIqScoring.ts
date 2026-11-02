import type { Agency, AgencyFactEvidenceKey, PredictiveWeights } from '../types';

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

export interface PulseIqFactorInput {
  label: string;
  valueUsed: string;
  sourceKey: AgencyFactEvidenceKey;
  usedDefault: boolean;
}

export interface PulseIqFactorEvaluation {
  key: 'fleet' | 'clinical' | 'grant' | 'software';
  label: string;
  baseScore: number;
  weightPct: number;
  contributionPts: number;
  scoreBreakdownKey: keyof PulseIqScoreContributions;
  method: string;
  inputs: PulseIqFactorInput[];
}

export function evaluatePulseIqFactors(
  agency: Agency,
  weights: PredictiveWeights = DEFAULT_WEIGHTS
): PulseIqFactorEvaluation[] {
  if (!agency) return [];

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

  const factors: Array<{
    key: PulseIqFactorEvaluation['key'];
    label: string;
    baseScore: number;
    weight: number;
    scoreBreakdownKey: keyof PulseIqScoreContributions;
    method: string;
    inputs: PulseIqFactorInput[];
  }> = [
    {
      key: 'fleet',
      label: 'Fleet replacement pressure',
      baseScore: fleetScore,
      weight: wFleet,
      scoreBreakdownKey: 'fleetObsolescencePts',
      method: 'Competitor monitor: 100 at 9+ years, 85 at 7–8, 65 at 5–6, otherwise 40. ZOLL monitor: 75 at 7+ years, otherwise 30.',
      inputs: [
        {
          label: 'Defibrillator age',
          valueUsed: `${age} years`,
          sourceKey: 'defibrillatorBiomedicalFleet',
          usedDefault: agency.installedFleet?.defibAgeYears == null
        },
        {
          label: 'Monitor vendor',
          valueUsed: brand,
          sourceKey: 'monitorModelTransition',
          usedDefault: !agency.installedFleet?.defibBrand
        }
      ]
    },
    {
      key: 'clinical',
      label: 'Clinical call volume',
      baseScore: cardiacScore,
      weight: wCardiac,
      scoreBreakdownKey: 'clinicalAcuityPts',
      method: 'Annual cardiac arrests: 100 at 1,800+, 85 at 1,000–1,799, 70 at 500–999, otherwise 50.',
      inputs: [{
        label: 'Annual cardiac arrests',
        valueUsed: `${cardiac.toLocaleString()} calls/year`,
        sourceKey: 'clinicalOutcomes',
        usedDefault: agency.annualCardiacArrestCalls == null
      }]
    },
    {
      key: 'grant',
      label: 'Grant readiness',
      baseScore: grantScore,
      weight: wGrant,
      scoreBreakdownKey: 'budgetGrantReadinessPts',
      method: 'AFG award: 100. Otherwise active SAFER grant: 60. Neither recorded: 25.',
      inputs: [{
        label: 'Grant status used',
        valueUsed: `${agency.grantStatus?.afgAwarded ? 'AFG awarded' : 'No AFG award recorded'} · ${agency.grantStatus?.saferGrantActive ? 'SAFER active' : 'No active SAFER grant recorded'}`,
        sourceKey: 'federalGrant',
        usedDefault: !agency.grantStatus
      }]
    },
    {
      key: 'software',
      label: 'Software whitespace',
      baseScore: softwareScore,
      weight: wSoftware,
      scoreBreakdownKey: 'softwareWhitespacePts',
      method: 'Any listed ZOLL billing or ePCR software: 35. Otherwise: 95. Missing software names currently count as no ZOLL match.',
      inputs: [
        {
          label: 'Billing software',
          valueUsed: billingSoftware || 'Not listed',
          sourceKey: 'billingSoftware',
          usedDefault: !billingSoftware
        },
        {
          label: 'ePCR software',
          valueUsed: epcrSoftware || 'Not listed',
          sourceKey: 'epcrSystem',
          usedDefault: !epcrSoftware
        }
      ]
    }
  ];

  return factors.map((factor) => ({
    key: factor.key,
    label: factor.label,
    baseScore: factor.baseScore,
    weightPct: factor.weight / totalWeight * 100,
    contributionPts: factor.baseScore * factor.weight / totalWeight,
    scoreBreakdownKey: factor.scoreBreakdownKey,
    method: factor.method,
    inputs: factor.inputs
  }));
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
  const factors = evaluatePulseIqFactors(agency, weights);
  return {
    fleetObsolescencePts: factors.find((factor) => factor.key === 'fleet')?.contributionPts ?? 0,
    clinicalAcuityPts: factors.find((factor) => factor.key === 'clinical')?.contributionPts ?? 0,
    budgetGrantReadinessPts: factors.find((factor) => factor.key === 'grant')?.contributionPts ?? 0,
    softwareWhitespacePts: factors.find((factor) => factor.key === 'software')?.contributionPts ?? 0
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
