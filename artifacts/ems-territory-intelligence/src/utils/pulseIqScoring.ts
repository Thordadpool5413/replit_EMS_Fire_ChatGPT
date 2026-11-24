import { requiresAgencyFieldEvidence } from './providerRecordTrust';
import { hasMappedFactSource } from '../data/agencyFactEvidence';
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
  weight: number;
  weightPct: number;
  contributionPts: number;
  scoreBreakdownKey: keyof PulseIqScoreContributions;
  method: string;
  inputs: PulseIqFactorInput[];
}

export interface PulseIqWeightDetail {
  key: PulseIqFactorEvaluation['key'];
  label: string;
  weight: number;
  weightPct: number;
}

export const PULSE_IQ_FACTOR_RULES: Record<PulseIqFactorEvaluation['key'], string> = {
  fleet: 'Competitor monitor: 100 at 9+ years, 85 at 7–8, 65 at 5–6, otherwise 40. ZOLL monitor: 75 at 7+ years, otherwise 30.',
  clinical: 'Annual cardiac arrests: 100 at 1,800+, 85 at 1,000–1,799, 70 at 500–999, otherwise 50.',
  grant: 'AFG award: 100. Otherwise active SAFER grant: 60. Neither recorded: 25.',
  software: 'Any listed ZOLL billing or ePCR software: 35. Otherwise: 95. Missing software names earn no points.'
};

const getActiveWeights = (weights: PredictiveWeights = DEFAULT_WEIGHTS) => [
  { key: 'fleet' as const, label: 'Fleet replacement pressure', weight: typeof weights?.fleetAgeWeight === 'number' ? weights.fleetAgeWeight : DEFAULT_WEIGHTS.fleetAgeWeight },
  { key: 'clinical' as const, label: 'Clinical call volume', weight: typeof weights?.cardiacVolumeWeight === 'number' ? weights.cardiacVolumeWeight : DEFAULT_WEIGHTS.cardiacVolumeWeight },
  { key: 'grant' as const, label: 'Grant readiness', weight: typeof weights?.grantAwardWeight === 'number' ? weights.grantAwardWeight : DEFAULT_WEIGHTS.grantAwardWeight },
  { key: 'software' as const, label: 'Software whitespace', weight: typeof weights?.softwareWhitespaceWeight === 'number' ? weights.softwareWhitespaceWeight : DEFAULT_WEIGHTS.softwareWhitespaceWeight }
];

export function getPulseIqWeightDetails(weights: PredictiveWeights = DEFAULT_WEIGHTS): {
  totalWeight: number;
  factors: PulseIqWeightDetail[];
} {
  const activeWeights = getActiveWeights(weights);
  const totalWeight = activeWeights.reduce((sum, factor) => sum + factor.weight, 0) || 100;

  return {
    totalWeight,
    factors: activeWeights.map((factor) => ({
      ...factor,
      weightPct: factor.weight / totalWeight * 100
    }))
  };
}

export function getPulseIqFormula(weights: PredictiveWeights = DEFAULT_WEIGHTS): string {
  const { totalWeight, factors } = getPulseIqWeightDetails(weights);
  const numerator = factors.map((factor) => `F_${factor.key} × ${factor.weight}`).join(' + ');
  return `(${numerator}) ÷ ${totalWeight}`;
}

export function evaluatePulseIqFactors(
  agency: Agency,
  weights: PredictiveWeights = DEFAULT_WEIGHTS
): PulseIqFactorEvaluation[] {
  if (!agency) return [];

  const { totalWeight, factors: weightDetails } = getPulseIqWeightDetails(weights);
  const weightByKey = Object.fromEntries(weightDetails.map((factor) => [factor.key, factor.weight])) as Record<PulseIqFactorEvaluation['key'], number>;
  const labelByKey = Object.fromEntries(weightDetails.map((factor) => [factor.key, factor.label])) as Record<PulseIqFactorEvaluation['key'], string>;

  const age = agency.installedFleet?.defibAgeYears ?? 0;
  const brand = agency.installedFleet?.defibBrand || '';
  const isCompetitor = !brand.includes('ZOLL');
  const fleetScore = isCompetitor
    ? age >= 9 ? 100 : age >= 7 ? 85 : age >= 5 ? 65 : 40
    : age >= 7 ? 75 : 30;

  const cardiac = agency.annualCardiacArrestCalls ?? 0;
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
      label: labelByKey.fleet,
      baseScore: fleetScore,
      weight: weightByKey.fleet,
      scoreBreakdownKey: 'fleetObsolescencePts',
      method: PULSE_IQ_FACTOR_RULES.fleet,
      inputs: [
        {
          label: 'Defibrillator age',
          valueUsed: agency.installedFleet?.defibAgeYears == null ? 'Not reported' : `${age} years`,
          sourceKey: 'defibrillatorBiomedicalFleet',
          usedDefault: agency.installedFleet?.defibAgeYears == null
        },
        {
          label: 'Monitor vendor',
          valueUsed: brand || 'Not reported',
          sourceKey: 'monitorModelTransition',
          usedDefault: !agency.installedFleet?.defibBrand
        }
      ]
    },
    {
      key: 'clinical',
      label: labelByKey.clinical,
      baseScore: cardiacScore,
      weight: weightByKey.clinical,
      scoreBreakdownKey: 'clinicalAcuityPts',
      method: PULSE_IQ_FACTOR_RULES.clinical,
      inputs: [{
        label: 'Annual cardiac arrests',
        valueUsed: agency.annualCardiacArrestCalls == null ? 'Not reported' : `${cardiac.toLocaleString()} calls/year`,
        sourceKey: 'clinicalOutcomes',
        usedDefault: agency.annualCardiacArrestCalls == null
      }]
    },
    {
      key: 'grant',
      label: labelByKey.grant,
      baseScore: grantScore,
      weight: weightByKey.grant,
      scoreBreakdownKey: 'budgetGrantReadinessPts',
      method: PULSE_IQ_FACTOR_RULES.grant,
      inputs: [{
        label: 'Grant status used',
        valueUsed: `${agency.grantStatus?.afgAwarded ? 'AFG awarded' : 'No AFG award recorded'} · ${agency.grantStatus?.saferGrantActive ? 'SAFER active' : 'No active SAFER grant recorded'}`,
        sourceKey: 'federalGrant',
        usedDefault: !agency.grantStatus
      }]
    },
    {
      key: 'software',
      label: labelByKey.software,
      baseScore: softwareScore,
      weight: weightByKey.software,
      scoreBreakdownKey: 'softwareWhitespacePts',
      method: PULSE_IQ_FACTOR_RULES.software,
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

  // An incomplete factor contributes zero, never an invented default or score floor.
  for (const factor of factors) {
    if (requiresAgencyFieldEvidence(agency)) {
      for (const input of factor.inputs) if (!hasMappedFactSource(agency.factEvidence?.[input.sourceKey])) { input.usedDefault=true; input.valueUsed='Agency-specific source required'; }
    }
    if (factor.inputs.some(input => input.usedDefault)) factor.baseScore = 0;
  }
  return factors.map((factor) => ({
    key: factor.key,
    label: factor.label,
    baseScore: factor.baseScore,
    weight: factor.weight,
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
  if (!agency) return 0;

  const contributions = calculatePulseIqContributions(agency, weights);
  const raw = (
    contributions.fleetObsolescencePts +
    contributions.clinicalAcuityPts +
    contributions.budgetGrantReadinessPts +
    contributions.softwareWhitespacePts
  );

  return Math.min(99, Math.max(0, Math.round(raw)));
}

export function scoreEvidenceCompleteness(agency: Agency): number {
  const inputs = evaluatePulseIqFactors(agency).flatMap(f => f.inputs);
  if (!inputs.length) return 0;
  return Math.round(100 * inputs.filter(i => !i.usedDefault && !!agency.factEvidence?.[i.sourceKey]).length / inputs.length);
}
