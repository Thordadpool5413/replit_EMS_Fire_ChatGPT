import type { Agency, PredictiveWeights, ScoreBreakdown } from '../types';
import { hasCompleteVerifiedDirectoryProfile } from './providerIdentity.ts';

export const DEFAULT_WEIGHTS: PredictiveWeights = {
  fleetAgeWeight: 30,
  cmsDenialWeight: 25,
  cardiacVolumeWeight: 20,
  grantAwardWeight: 15,
  softwareWhitespaceWeight: 10,
};

export interface PulseIqFactorBreakdown {
  id: string;
  name: string;
  weightPct: number;
  componentScore: number;
  pointsContributed: number;
  agencyMetricValue: string;
  clinicalImpactSummary: string;
  urgencyLevel: 'Critical' | 'Elevated' | 'Moderate' | 'Nominal';
}

export interface PulseIqScoreExplanation {
  totalScore: number;
  priorityTier: string;
  factors: PulseIqFactorBreakdown[];
}

export function pulseIqBreakdownFromExplanation(
  explanation: PulseIqScoreExplanation,
): ScoreBreakdown {
  const points = (factorId: string) =>
    explanation.factors.find((factor) => factor.id === factorId)?.pointsContributed ?? 0;

  return {
    clinicalAcuityPts: points('cardiac'),
    fleetObsolescencePts: points('fleet'),
    cmsFinancialPts: points('cms'),
    softwareWhitespacePts: points('software'),
    budgetGrantReadinessPts: points('grants'),
  };
}

export function explainAgencyScore(
  agency: Agency,
  weights: PredictiveWeights = DEFAULT_WEIGHTS,
): PulseIqScoreExplanation {
  if (!agency || !hasCompleteVerifiedDirectoryProfile(agency)) {
    return { totalScore: 0, priorityTier: 'Unavailable', factors: [] };
  }

  const wFleet = typeof weights?.fleetAgeWeight === 'number' ? weights.fleetAgeWeight : DEFAULT_WEIGHTS.fleetAgeWeight;
  const wCms = typeof weights?.cmsDenialWeight === 'number' ? weights.cmsDenialWeight : DEFAULT_WEIGHTS.cmsDenialWeight;
  const wCardiac = typeof weights?.cardiacVolumeWeight === 'number' ? weights.cardiacVolumeWeight : DEFAULT_WEIGHTS.cardiacVolumeWeight;
  const wGrant = typeof weights?.grantAwardWeight === 'number' ? weights.grantAwardWeight : DEFAULT_WEIGHTS.grantAwardWeight;
  const wSoftware = typeof weights?.softwareWhitespaceWeight === 'number' ? weights.softwareWhitespaceWeight : DEFAULT_WEIGHTS.softwareWhitespaceWeight;
  const totalWeight = (wFleet + wCms + wCardiac + wGrant + wSoftware) || 100;

  const age = agency.installedFleet?.defibAgeYears ?? 0;
  const brand = agency.installedFleet?.defibBrand || '';
  const isCompetitor = !brand.includes('ZOLL');
  const fleetScore = isCompetitor
    ? age >= 9 ? 100 : age >= 7 ? 85 : age >= 5 ? 65 : 40
    : age >= 7 ? 75 : 30;

  const denial = agency.cmsData?.claimDenialRate ?? 0;
  const cmsScore = denial >= 22 ? 100 : denial >= 18 ? 85 : denial >= 15 ? 65 : 40;

  const cardiac = agency.annualCardiacArrestCalls ?? 0;
  const cardiacScore = cardiac >= 1800 ? 100 : cardiac >= 1000 ? 85 : cardiac >= 500 ? 70 : 50;

  const grantScore = agency.grantStatus?.afgAwarded
    ? 100
    : agency.grantStatus?.saferGrantActive ? 60 : 25;

  const billingSw = agency.installedFleet?.billingSoftware || '';
  const epcrSw = agency.installedFleet?.epcrCadSoftware || '';
  const hasZollSoftware = billingSw.includes('ZOLL') || epcrSw.includes('ZOLL');
  const softwareScore = hasZollSoftware ? 35 : 95;

  const brandName = agency.installedFleet?.defibBrand || 'Not sourced';
  const unitsCount = agency.installedFleet?.defibUnitsCount ?? 0;
  const warrantyStatus = agency.installedFleet?.defibWarrantyStatus || 'Not sourced';
  const recovRev = agency.cmsData?.estimatedRecoverableRevenue
    ? Math.round(agency.cmsData.estimatedRecoverableRevenue / 1000)
    : 0;
  const afgAmount = Math.round((agency.grantStatus?.afgAwardAmount ?? 0) / 1000);
  const afgYear = agency.grantStatus?.afgFiscalYear ?? 0;
  const epcrName = agency.installedFleet?.epcrCadSoftware || 'Not sourced';
  const billingName = agency.installedFleet?.billingSoftware || 'Not sourced';

  const factors: PulseIqFactorBreakdown[] = [
    {
      id: 'fleet',
      name: 'Fleet Age & Brand Factor',
      weightPct: Math.round((wFleet / totalWeight) * 100),
      componentScore: fleetScore,
      pointsContributed: +((fleetScore * wFleet) / totalWeight).toFixed(1),
      agencyMetricValue: `${brandName} · ${unitsCount} units (${age} yrs old)`,
      clinicalImpactSummary: `Modeled factor uses the source-reported ${age}-year fleet age and ${brandName} brand; warranty status: ${warrantyStatus}.`,
      urgencyLevel: age >= 8 ? 'Critical' : age >= 6 ? 'Elevated' : 'Moderate',
    },
    {
      id: 'cms',
      name: 'Medicare Claim Denial Rate',
      weightPct: Math.round((wCms / totalWeight) * 100),
      componentScore: cmsScore,
      pointsContributed: +((cmsScore * wCms) / totalWeight).toFixed(1),
      agencyMetricValue: `${denial}% source-reported denial rate · Code ${agency.cmsData?.topDenialReasonCode || 'not recorded'}`,
      clinicalImpactSummary: agency.cmsData?.estimatedRecoverableRevenue
        ? `Modeled recovery estimate: $${recovRev}K/year. This is not a CMS-reported amount or realized savings.`
        : 'The source-reported denial rate contributes to the model; no recovery estimate is available.',
      urgencyLevel: denial >= 20 ? 'Critical' : denial >= 16 ? 'Elevated' : 'Moderate',
    },
    {
      id: 'cardiac',
      name: 'Cardiac Arrest Call Volume',
      weightPct: Math.round((wCardiac / totalWeight) * 100),
      componentScore: cardiacScore,
      pointsContributed: +((cardiacScore * wCardiac) / totalWeight).toFixed(1),
      agencyMetricValue: `${cardiac.toLocaleString()} source-reported cardiac arrest calls/year`,
      clinicalImpactSummary: 'This contribution uses annual cardiac arrest call volume only; it does not measure clinical quality or patient outcomes.',
      urgencyLevel: cardiac >= 1200 ? 'Critical' : cardiac >= 700 ? 'Elevated' : 'Moderate',
    },
    {
      id: 'grants',
      name: 'Federal AFG / SAFER Grant Award Status',
      weightPct: Math.round((wGrant / totalWeight) * 100),
      componentScore: grantScore,
      pointsContributed: +((grantScore * wGrant) / totalWeight).toFixed(1),
      agencyMetricValue: agency.grantStatus?.afgAwarded
        ? `Source-reported AFG award: $${afgAmount}K (FY${afgYear})`
        : agency.grantStatus?.saferGrantActive
          ? 'Source-reported active SAFER grant; no AFG award reported'
          : 'No AFG award or active SAFER grant reported in the cited source',
      clinicalImpactSummary: 'Grant status is a modeled factor; it does not establish current grant eligibility, available funds, or an open application window.',
      urgencyLevel: agency.grantStatus?.afgAwarded ? 'Critical' : 'Moderate',
    },
    {
      id: 'software',
      name: 'ePCR & Billing Software Whitespace',
      weightPct: Math.round((wSoftware / totalWeight) * 100),
      componentScore: softwareScore,
      pointsContributed: +((softwareScore * wSoftware) / totalWeight).toFixed(1),
      agencyMetricValue: `Charting: ${epcrName} · Billing: ${billingName}`,
      clinicalImpactSummary: !hasZollSoftware
        ? 'Modeled software whitespace based on the cited billing and ePCR vendor fields; this does not confirm a purchase need.'
        : 'The cited software fields include a ZOLL product; this factor is not an estimate of future purchases.',
      urgencyLevel: !hasZollSoftware ? 'Elevated' : 'Nominal',
    },
  ];

  const factorTotal = factors.reduce((sum, factor) => sum + factor.pointsContributed, 0);
  const totalScore = Math.min(99, Math.max(30, Math.round(factorTotal)));

  return {
    totalScore,
    priorityTier: totalScore >= 88
      ? 'Critical Opportunity'
      : totalScore >= 78
        ? 'High Value'
        : totalScore >= 65
          ? 'Mid-Term Pipeline'
          : 'Maintained Account',
    factors,
  };
}

export function calculateScore(
  agency: Agency,
  weights: PredictiveWeights = DEFAULT_WEIGHTS,
): number {
  return explainAgencyScore(agency, weights).totalScore;
}
