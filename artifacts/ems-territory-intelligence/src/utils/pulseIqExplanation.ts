import type { Agency, PredictiveWeights } from '../types';
import { calculateScore, DEFAULT_WEIGHTS, evaluatePulseIqFactors } from './pulseIqScoring';

export interface PulseIqFactorBreakdown {
  id: string;
  name: string;
  weightPct: number;
  componentScore: number;
  pointsContributed: number;
  agencyMetricValue: string;
  clinicalImpactSummary: string;
  urgencyLevel: 'Critical' | 'Elevated' | 'Moderate' | 'Nominal';
  method: string;
}

export interface PulseIqScoreExplanation {
  totalScore: number;
  priorityTier: string;
  factors: PulseIqFactorBreakdown[];
}

export function explainAgencyScore(
  agency: Agency,
  weights: PredictiveWeights = DEFAULT_WEIGHTS
): PulseIqScoreExplanation {
  const age = agency.installedFleet?.defibAgeYears ?? 0;
  const brand = agency.installedFleet?.defibBrand || 'Not reported';
  const cardiac = agency.annualCardiacArrestCalls ?? 0;
  const billingSw = agency.installedFleet?.billingSoftware || '';
  const epcrSw = agency.installedFleet?.epcrCadSoftware || '';
  const hasZollSoftware = billingSw.includes('ZOLL') || epcrSw.includes('ZOLL');

  const finalScore = calculateScore(agency, weights);
  const warrantyStatus = agency.installedFleet?.defibWarrantyStatus || 'Not reported';
  const afgAmount = agency.grantStatus?.afgAwardAmount ? Math.round(agency.grantStatus.afgAwardAmount / 1000) : 0;
  const afgYear = agency.grantStatus?.afgFiscalYear || 'not reported';
  const epcrName = agency.installedFleet?.epcrCadSoftware || 'Legacy ePCR';
  const billingName = agency.installedFleet?.billingSoftware || 'In-House Billing';
  const factors: PulseIqFactorBreakdown[] = evaluatePulseIqFactors(agency, weights).map((factor) => {
    let agencyMetricValue: string;
    let clinicalImpactSummary: string;
    let urgencyLevel: PulseIqFactorBreakdown['urgencyLevel'];

    switch (factor.key) {
      case 'fleet':
        agencyMetricValue = `${brand} · ${agency.installedFleet?.defibUnitsCount ?? 'Not reported'} units (${age} yrs old)`;
        clinicalImpactSummary = age >= 7
          ? `Aging ${brand} monitors are ${age} years old with ${warrantyStatus.toLowerCase()} warranty, driving urgent tech refresh.`
          : `Fleet monitors are ${age} years old (${warrantyStatus}).`;
        urgencyLevel = age >= 8 ? 'Critical' : age >= 6 ? 'Elevated' : 'Moderate';
        break;
      case 'clinical':
        agencyMetricValue = `${cardiac.toLocaleString()} OHCA cardiac calls/year`;
        clinicalImpactSummary = cardiac >= 1000
          ? `High-volume resuscitation system with ${cardiac.toLocaleString()} annual cardiac arrest calls and ${agency.utsteinSurvivalRate ?? 'not reported'}% Utstein survival.`
          : `Moderate cardiac arrest volume (${cardiac.toLocaleString()} calls/year) with opportunity for AutoPulse mechanical CPR.`;
        urgencyLevel = cardiac >= 1200 ? 'Critical' : cardiac >= 700 ? 'Elevated' : 'Moderate';
        break;
      case 'grant':
        agencyMetricValue = agency.grantStatus?.afgAwarded
          ? `FEMA AFG awarded: $${afgAmount}K (FY${afgYear})`
          : agency.grantStatus?.saferGrantActive
            ? 'Active SAFER grant; no AFG award recorded'
            : 'No AFG award or active SAFER grant recorded';
        clinicalImpactSummary = agency.grantStatus?.afgAwarded
          ? `Federal funding ($${afgAmount}K) secured under FEMA AFG FY${afgYear} for capital equipment purchase.`
          : agency.grantStatus?.saferGrantActive
            ? 'An active SAFER grant is recorded.'
            : 'No active federal grant is recorded in this profile.';
        urgencyLevel = agency.grantStatus?.afgAwarded ? 'Critical' : agency.grantStatus?.saferGrantActive ? 'Elevated' : 'Moderate';
        break;
      case 'software':
        agencyMetricValue = `Charting: ${epcrName} · Billing: ${billingName}`;
        clinicalImpactSummary = !hasZollSoftware
          ? `Opportunity to displace legacy ${epcrName} and unify billing with ZOLL RescueNet & AR Boost.`
          : 'Existing customer with expansion opportunity into ZOLL Respond & CAD dispatch integration.';
        urgencyLevel = !hasZollSoftware ? 'Elevated' : 'Nominal';
        break;
    }

    if (factor.inputs.some(input => input.usedDefault)) {
      agencyMetricValue = factor.inputs.map(input => `${input.label}: ${input.valueUsed}`).join(' · ');
      clinicalImpactSummary = 'Missing inputs. No opportunity points are awarded until these facts are supplied.';
      urgencyLevel = 'Nominal';
    }
    return {
      id: factor.key,
      name: factor.label,
      weightPct: factor.weightPct,
      componentScore: factor.baseScore,
      pointsContributed: factor.contributionPts,
      agencyMetricValue,
      clinicalImpactSummary,
      urgencyLevel,
      method: factor.method
    };
  });

  return {
    totalScore: finalScore,
    priorityTier: finalScore >= 88 ? 'Tier 1 Prime Target' : finalScore >= 78 ? 'Tier 2 Active Target' : 'Tier 3 Standard',
    factors
  };
}
