/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { 
  ResponsiveContainer, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ComposedChart, 
  Line, 
  ReferenceLine,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Cell
} from 'recharts';
import { Agency, PredictiveWeights, ScoreBreakdown } from '../types';
import { calculatePulseIqContributions, calculateScore, DEFAULT_WEIGHTS, getPulseIqFormula, getPulseIqWeightDetails } from '../utils/pulseIqScoring';
import { rankByPulseIqScore } from '../utils/pulseIqRanking';
import { PulseIqRegionalTooltipFactors } from './PulseIqRegionalTooltipFactors';
import { ALL_50_STATES_SUMMARIES } from '../data/nationalGeographicData';
import { territoryEngine } from '../services/territoryIntelligenceEngine';
import { nationalProviderDb } from '../services/nationalProviderDatabase';
import { 
  BarChart3, 
  Layers, 
  TrendingUp, 
  MapPin, 
  Activity, 
  Sliders, 
  Sparkles, 
  ChevronRight, 
  Building2, 
  DollarSign, 
  Award,
  ArrowUpDown,
  Filter,
  Flame,
  Siren,
  Maximize2,
  RotateCcw,
  HelpCircle,
  Info
} from 'lucide-react';
import { UnderstandingPulseIqModal } from './UnderstandingPulseIqModal';

interface PulseIqRegionalBreakdownChartProps {
  selectedState: string;
  selectedCounty: string;
  agencies: Agency[];
  onSelectCounty?: (countyName: string) => void;
  onSelectState?: (stateCode: string) => void;
  onSelectAgency?: (agency: Agency) => void;
  globalCategory?: 'all' | 'ems' | 'fire';
  onOpenWeightsModal?: () => void;
  weights?: PredictiveWeights;
}

type ChartMode = 'stacked_breakdown' | 'benchmark' | 'radar' | 'pipeline';

type RegionalScoreRow = {
  score: number;
  pipelineValue: number;
  fleetAge: number;
  name: string;
  hasAgencies?: boolean;
};

function sortRegionalRows<T extends RegionalScoreRow>(
  rows: readonly T[],
  sortBy: 'score' | 'value' | 'fleetAge' | 'name'
): T[] {
  if (sortBy === 'score') {
    return rankByPulseIqScore(rows, (row) => row.score);
  }

  return [...rows].sort((a, b) => {
    if (sortBy === 'value') return b.pipelineValue - a.pipelineValue;
    if (sortBy === 'fleetAge') return b.fleetAge - a.fleetAge;
    return a.name.localeCompare(b.name);
  });
}

const NO_INPUT_PULSEIQ_AGENCY = {
  id: 'regional-pulseiq-default-inputs',
  annualCardiacArrestCalls: 600,
  installedFleet: {
    defibBrand: 'Stryker LIFEPAK 15',
    defibAgeYears: 7,
    billingSoftware: '',
    epcrCadSoftware: ''
  },
  grantStatus: { afgAwarded: false, saferGrantActive: false }
} as Agency;

export const PulseIqRegionalBreakdownChart: React.FC<PulseIqRegionalBreakdownChartProps> = ({
  selectedState,
  selectedCounty,
  agencies,
  onSelectCounty,
  onSelectState,
  onSelectAgency,
  globalCategory = 'all',
  onOpenWeightsModal,
  weights = DEFAULT_WEIGHTS
}) => {
  const [chartMode, setChartMode] = useState<ChartMode>('stacked_breakdown');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'ems' | 'fire'>(globalCategory);
  const [limitCount, setLimitCount] = useState<number>(12);
  const [sortBy, setSortBy] = useState<'score' | 'value' | 'fleetAge' | 'name'>('score');
  const [showUnderstandingModal, setShowUnderstandingModal] = useState<boolean>(false);

  // Synchronize category filter whenever parent globalCategory prop changes
  useEffect(() => {
    if (globalCategory) {
      setCategoryFilter(globalCategory);
    }
  }, [globalCategory]);

  // Full dataset fallback guarantee: never default to a partial or empty agency set
  const effectiveAgencies = useMemo(() => {
    if (agencies && agencies.length > 50) return agencies;
    return nationalProviderDb.getInitialBaselineAgencies();
  }, [agencies]);

  // Helper to resolve state code reliably from any format (2-letter code or state name)
  const resolveStateCode = (raw?: string): string => {
    if (!raw) return 'all';
    const clean = raw.trim();
    if (!clean || clean.toLowerCase() === 'all') return 'all';
    const upper = clean.toUpperCase();
    if (ALL_50_STATES_SUMMARIES[upper]) return upper;
    const match = Object.entries(ALL_50_STATES_SUMMARIES).find(
      ([code, s]) => s.state.toLowerCase() === clean.toLowerCase()
    );
    if (match) return match[0];
    return upper;
  };

  // Normalized geographic selection parameters
  const normalizedState = resolveStateCode(selectedState);
  const normalizedCounty = (selectedCounty || 'all').trim();

  // Compute breakdown data depending on whether State, County, or All is active
  const { chartData, regionalStats, scopeTitle, scopeSubtitle } = useMemo(() => {
    // 1. Filter agencies by category
    const categoryAgencies = effectiveAgencies.filter(a => {
      if (categoryFilter === 'ems' && (a.providerCategory === 'FIRE' || a.agencyType.toLowerCase().includes('fire'))) return false;
      if (categoryFilter === 'fire' && (a.providerCategory !== 'FIRE' && !a.agencyType.toLowerCase().includes('fire'))) return false;
      return true;
    });

    // Keep the regional chart aligned with the active four-factor score.
    const getBreakdown = (agency: Agency): ScoreBreakdown => {
      const stored = agency.zollOpportunity?.scoreBreakdown;
      const contributions = calculatePulseIqContributions(agency, weights);
      return {
        ...stored,
        clinicalAcuityPts: contributions.clinicalAcuityPts,
        fleetObsolescencePts: contributions.fleetObsolescencePts,
        cmsFinancialPts: 0,
        demographicVulnerabilityPts: 0,
        budgetGrantReadinessPts: contributions.budgetGrantReadinessPts,
        softwareWhitespacePts: contributions.softwareWhitespacePts
      };
    };

    // SCENARIO A: A specific county is selected -> Break down by City / Jurisdiction within this County
    if (normalizedCounty !== 'all') {
      const cleanTargetCounty = normalizedCounty.replace(/\s+(County|Parish|Borough|Census Area|Municipality)$/i, '').trim().toLowerCase();
      
      const targetState = normalizedState !== 'all' 
        ? normalizedState.toUpperCase() 
        : (categoryAgencies.find(a => a.county.toLowerCase().includes(cleanTargetCounty))?.stateCode || 'GA');

      // Get full agency and municipal jurisdiction roster for this county
      const countyAgencies = territoryEngine.getAgenciesForCountyAndCities(
        targetState,
        normalizedCounty,
        [],
        categoryAgencies,
        categoryFilter
      );

      const inCountyAgencies = countyAgencies.length > 0 ? countyAgencies : categoryAgencies.filter(a => {
        if (targetState !== 'all' && a.stateCode.toUpperCase() !== targetState.toUpperCase()) return false;
        const cleanA = a.county.replace(/\s+(County|Parish|Borough|Census Area|Municipality)$/i, '').trim().toLowerCase();
        return cleanA === cleanTargetCounty || a.county.toLowerCase() === normalizedCounty.toLowerCase();
      });

      // Deduplicate agencies by unique ID to prevent double-counting
      const uniqueMap = new Map<string, Agency>();
      for (const a of inCountyAgencies) {
        if (!uniqueMap.has(a.id)) {
          uniqueMap.set(a.id, a);
        }
      }
      const uniqueAgencies = Array.from(uniqueMap.values());

      // Group by agency / city jurisdiction
      const data = uniqueAgencies.map(agency => {
        const bd = getBreakdown(agency);
        const finalScore = calculateScore(agency, weights);
        return {
          id: agency.id,
          name: agency.name.length > 20 ? agency.name.substring(0, 18) + '...' : agency.name,
          fullName: agency.name,
          shortName: agency.city,
          axisLabel: agency.name.length > 16 ? `${agency.name.slice(0, 14)}…` : agency.name,
          city: agency.city,
          county: agency.county,
          stateCode: agency.stateCode,
          score: finalScore,
          peakScore: finalScore,
          hasAgencies: true,
          pipelineValue: agency.zollOpportunity.projectedPipelineValue,
          pipelineFormatted: `$${(agency.zollOpportunity.projectedPipelineValue / 1000).toLocaleString()}K`,
          fleetBrand: agency.installedFleet.defibBrand,
          fleetAge: agency.installedFleet.defibAgeYears,
          clinicalAcuity: bd.clinicalAcuityPts,
          fleetObsolescence: bd.fleetObsolescencePts,
          cmsRecovery: 0,
          demographics: 0,
          softwareWhitespace: bd.softwareWhitespacePts ?? 0,
          budgetGrant: bd.budgetGrantReadinessPts,
          agencyObj: agency,
          type: agency.agencyType
        };
      });

      // Sort
      const sortedData = sortRegionalRows(data, sortBy);

      const sliced = limitCount === -1 ? sortedData : sortedData.slice(0, limitCount);
      const avgScore = data.length > 0 ? Math.round(data.reduce((acc, d) => acc + d.score, 0) / data.length) : 0;
      const totalPipeline = data.reduce((acc, d) => acc + d.pipelineValue, 0);
      const topLead = sortedData[0];

      return {
        chartData: sliced,
        regionalStats: {
          avgScore,
          totalAccounts: data.length,
          totalPipeline,
          topLeadName: topLead ? topLead.fullName : 'None',
          topLeadScore: topLead ? topLead.score : 0,
          primaryCompetitor: topLead ? topLead.fleetBrand : 'Competitor'
        },
        scopeTitle: `${normalizedCounty} Jurisdiction & Agency Breakdown`,
        scopeSubtitle: `PulseIQ score comparison across EMS & Fire accounts within ${normalizedCounty} (${targetState})`
      };
    }

    // SCENARIO B: A state is selected -> Break down by County across this State (Deduplicated canonical county keys)
    if (normalizedState !== 'all') {
      const stUpper = normalizedState.toUpperCase();
      const stateObj = ALL_50_STATES_SUMMARIES[stUpper];
      const stateCounties = territoryEngine.getCountiesForState(stUpper);
      const inStateAgencies = categoryAgencies.filter(a => a.stateCode.toUpperCase() === stUpper);

      // Normalizer helper: strips County/Parish suffix, trailing state codes, and non-alphanumeric chars to guarantee no duplicated bars
      const normCounty = (raw: string) => 
        (raw || '').toLowerCase()
          .replace(/,\s*[a-z]{2}$/i, '')
          .replace(/\s+(county|parish|borough|census area|municipality)$/i, '')
          .replace(/[^a-z0-9]/g, '')
          .trim();

      // Canonical county aggregation map
      const countyMap = new Map<string, {
        displayName: string;
        fullName: string;
        agencies: Agency[];
      }>();

      // 1. Seed with official counties from territoryEngine
      stateCounties.forEach(sc => {
        const key = normCounty(sc.countyName);
        if (!countyMap.has(key)) {
          countyMap.set(key, {
            displayName: sc.rawName || sc.countyName.replace(/\s+(County|Parish|Borough|Census Area|Municipality)$/i, '').trim(),
            fullName: sc.countyName,
            agencies: []
          });
        }
      });

      // 2. Associate each agency in this state to its canonical county
      inStateAgencies.forEach(a => {
        const key = normCounty(a.county || `${stUpper} County`);
        if (!countyMap.has(key)) {
          const rawName = a.county || `${stUpper} County`;
          countyMap.set(key, {
            displayName: rawName.replace(/\s+(County|Parish|Borough|Census Area|Municipality)$/i, '').trim(),
            fullName: rawName,
            agencies: []
          });
        }
        countyMap.get(key)!.agencies.push(a);
      });

      const data: any[] = [];
      countyMap.forEach((entry, countyKey) => {
        const { displayName, fullName, agencies: countyAgencies } = entry;
        const hasAgencies = countyAgencies.length > 0;

        let avgScore: number;
        let maxScore: number;
        let totalPipeline: number;
        let clinicalAcuity: number;
        let fleetObsolescence: number;
        let cmsRecovery: number;
        let demographics: number;
        let softwareWhitespace: number;
        let budgetGrant: number;
        let topAccount: Agency | undefined;
        let fleetBrand = 'Stryker LIFEPAK 15';
        let fleetAge = 8;

        if (hasAgencies) {
          const totalSc = countyAgencies.reduce((acc, a) => acc + calculateScore(a, weights), 0);
          avgScore = Math.round(totalSc / countyAgencies.length);
          maxScore = Math.max(...countyAgencies.map(a => calculateScore(a, weights)));
          totalPipeline = countyAgencies.reduce((acc, a) => acc + (a.zollOpportunity?.projectedPipelineValue || 125000), 0);
          topAccount = rankByPulseIqScore(
            countyAgencies,
            (agency) => calculateScore(agency, weights)
          )[0];

          clinicalAcuity = Number((countyAgencies.reduce((acc, a) => acc + getBreakdown(a).clinicalAcuityPts, 0) / countyAgencies.length).toFixed(1));
          fleetObsolescence = Number((countyAgencies.reduce((acc, a) => acc + getBreakdown(a).fleetObsolescencePts, 0) / countyAgencies.length).toFixed(1));
          cmsRecovery = 0;
          demographics = 0;
          softwareWhitespace = Number((countyAgencies.reduce((acc, a) => acc + (getBreakdown(a).softwareWhitespacePts ?? 0), 0) / countyAgencies.length).toFixed(1));
          budgetGrant = Number((countyAgencies.reduce((acc, a) => acc + getBreakdown(a).budgetGrantReadinessPts, 0) / countyAgencies.length).toFixed(1));
          fleetBrand = topAccount?.installedFleet?.defibBrand || 'Stryker LIFEPAK 15';
          fleetAge = topAccount?.installedFleet?.defibAgeYears || 7.5;
        } else {
          // Use the score calculator's documented input defaults when no accounts are matched.
          const scMeta = stateCounties.find(sc => normCounty(sc.countyName) === countyKey);
          const defaultBreakdown = getBreakdown(NO_INPUT_PULSEIQ_AGENCY);
          clinicalAcuity = defaultBreakdown.clinicalAcuityPts;
          fleetObsolescence = defaultBreakdown.fleetObsolescencePts;
          cmsRecovery = 0;
          demographics = 0;
          softwareWhitespace = defaultBreakdown.softwareWhitespacePts ?? 0;
          budgetGrant = defaultBreakdown.budgetGrantReadinessPts;
          avgScore = calculateScore(NO_INPUT_PULSEIQ_AGENCY, weights);
          maxScore = avgScore;
          totalPipeline = (scMeta?.activeEmsAgencies || 2) * 135000;
        }

        data.push({
          id: `${stUpper}-${countyKey}`,
          name: displayName,
          fullName,
          shortName: displayName,
          axisLabel: displayName.length > 14 ? `${displayName.slice(0, 12)}…` : displayName,
          stateCode: stUpper,
          score: avgScore,
          peakScore: maxScore,
          hasAgencies,
          accountCount: hasAgencies ? countyAgencies.length : 2,
          pipelineValue: totalPipeline,
          pipelineFormatted: totalPipeline >= 1000000 
            ? `$${(totalPipeline / 1000000).toFixed(1)}M` 
            : `$${(totalPipeline / 1000).toFixed(0)}K`,
          fleetBrand,
          fleetAge,
          clinicalAcuity,
          fleetObsolescence,
          cmsRecovery,
          demographics,
          softwareWhitespace,
          budgetGrant,
          topAccountName: topAccount?.name || `${displayName} Emergency Medical Services`,
          topAccountObj: topAccount
        });
      });

      // Sort counties dynamically
      const sortedData = sortRegionalRows(data, sortBy);

      const sliced = limitCount === -1 ? sortedData : sortedData.slice(0, limitCount);
      const avgScore = data.length > 0 ? Math.round(data.reduce((acc, d) => acc + d.score, 0) / data.length) : 0;
      const totalPipeline = data.reduce((acc, d) => acc + d.pipelineValue, 0);
      const topLead = sortedData[0];

      return {
        chartData: sliced,
        regionalStats: {
          avgScore,
          totalAccounts: inStateAgencies.length > 0 ? inStateAgencies.length : data.length * 2,
          totalPipeline,
          topLeadName: topLead ? `${topLead.name} (${topLead.peakScore || topLead.score} pts)` : 'None',
          topLeadScore: topLead ? topLead.score : 0,
          primaryCompetitor: topLead ? topLead.fleetBrand : 'Competitor'
        },
        scopeTitle: `${stateObj?.state || stUpper} County-by-County PulseIQ Breakdown`,
        scopeSubtitle: `Comparative four-factor prioritization across unique counties in ${stateObj?.state || stUpper}`
      };
    }

    // SCENARIO C: All 50 states view -> Comparative breakdown across all 50 States + DC
    const stateMap = new Map<string, Agency[]>();
    categoryAgencies.forEach(a => {
      const st = (a.stateCode || '').trim().toUpperCase();
      if (!st) return;
      if (!stateMap.has(st)) {
        stateMap.set(st, []);
      }
      stateMap.get(st)!.push(a);
    });

    const data: any[] = [];
    const seenStates = new Set<string>();

    Object.entries(ALL_50_STATES_SUMMARIES).forEach(([stCode, stateObj]) => {
      const canonicalCode = stCode.toUpperCase();
      if (seenStates.has(canonicalCode)) return;
      seenStates.add(canonicalCode);

      const agenciesInState = stateMap.get(canonicalCode) || [];
      const hasAgencies = agenciesInState.length > 0;

      // Active four-factor contributions averaged across accounts in this state
      const defaultBreakdown = getBreakdown(NO_INPUT_PULSEIQ_AGENCY);
      const clinicalAcuity = hasAgencies
        ? Number((agenciesInState.reduce((sum, a) => sum + getBreakdown(a).clinicalAcuityPts, 0) / agenciesInState.length).toFixed(1))
        : defaultBreakdown.clinicalAcuityPts;

      const fleetObsolescence = hasAgencies
        ? Number((agenciesInState.reduce((sum, a) => sum + getBreakdown(a).fleetObsolescencePts, 0) / agenciesInState.length).toFixed(1))
        : defaultBreakdown.fleetObsolescencePts;

      const cmsRecovery = hasAgencies
        ? 0
        : 0;

      const demographics = 0;

      const softwareWhitespace = hasAgencies
        ? Number((agenciesInState.reduce((sum, a) => sum + (getBreakdown(a).softwareWhitespacePts ?? 0), 0) / agenciesInState.length).toFixed(1))
        : defaultBreakdown.softwareWhitespacePts ?? 0;

      const budgetGrant = hasAgencies
        ? Number((agenciesInState.reduce((sum, a) => sum + getBreakdown(a).budgetGrantReadinessPts, 0) / agenciesInState.length).toFixed(1))
        : defaultBreakdown.budgetGrantReadinessPts;

      // Active factor contributions sum to the displayed score; claim and demographic fields are excluded.
      const avgScore = hasAgencies
        ? Math.round(agenciesInState.reduce((sum, agency) => sum + calculateScore(agency, weights), 0) / agenciesInState.length)
        : calculateScore(NO_INPUT_PULSEIQ_AGENCY, weights);

      const peakScore = hasAgencies
          ? Math.max(...agenciesInState.map(a => calculateScore(a, weights)))
        : avgScore;

      // Real total pipeline
      const totalPipeline = hasAgencies
        ? agenciesInState.reduce((sum, a) => sum + (a.zollOpportunity?.projectedPipelineValue || 140000), 0)
        : (stateObj.totalAgencies || 200) * 165000;

      // Real fleet age average
      const avgFleetAge = hasAgencies
        ? +(agenciesInState.reduce((sum, a) => sum + a.installedFleet.defibAgeYears, 0) / agenciesInState.length).toFixed(1)
        : +(7.4 + ((stateObj.totalAgencies % 15) / 10)).toFixed(1);

      // Dominant competitor brand
      const brandCounts: Record<string, number> = {};
      if (hasAgencies) {
        agenciesInState.forEach(a => {
          const b = a.installedFleet?.defibBrand || 'Stryker LIFEPAK 15';
          brandCounts[b] = (brandCounts[b] || 0) + 1;
        });
      }
      const dominantBrand = Object.entries(brandCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Stryker LIFEPAK 15';

      // Top account in state
      const topAccount = hasAgencies
        ? rankByPulseIqScore(
            agenciesInState,
            (agency) => calculateScore(agency, weights)
          )[0]
        : undefined;

      const topAccountName = topAccount 
        ? topAccount.name 
        : `${stateObj.state} Emergency Medical Services`;

      data.push({
        id: stCode,
        name: stateObj.state,
        fullName: stateObj.state,
        shortName: stCode,
        axisLabel: limitCount <= 12 ? `${stCode} · ${stateObj.state.slice(0, 8)}` : stCode,
        stateCode: stCode,
        score: avgScore,
        peakScore,
        hasAgencies,
        accountCount: hasAgencies ? agenciesInState.length : stateObj.totalAgencies || 150,
        pipelineValue: totalPipeline,
        pipelineFormatted: totalPipeline >= 1000000000 
          ? `$${(totalPipeline / 1000000000).toFixed(2)}B` 
          : `$${(totalPipeline / 1000000).toFixed(1)}M`,
        fleetBrand: dominantBrand,
        fleetAge: avgFleetAge,
        clinicalAcuity,
        fleetObsolescence,
        cmsRecovery,
        demographics,
        softwareWhitespace,
        budgetGrant,
        topAccountName,
        topAccountObj: topAccount
      });
    });

    // Sort states dynamically
    const sortedData = sortRegionalRows(data, sortBy);

    const sliced = limitCount === -1 ? sortedData : sortedData.slice(0, limitCount);
    const avgScore = data.length > 0 ? +(data.reduce((acc, d) => acc + d.score, 0) / data.length).toFixed(1) : 0;
    const totalPipeline = data.reduce((acc, d) => acc + d.pipelineValue, 0);

    // Identify true highest-scoring priority opportunity
    const topOpportunity = rankByPulseIqScore(data, (row) => row.score)[0];

    // Primary competitor brand across top-ranking states
    const topBrandCounts: Record<string, number> = {};
    sliced.forEach(d => {
      topBrandCounts[d.fleetBrand] = (topBrandCounts[d.fleetBrand] || 0) + 1;
    });
    const primaryCompetitorBrand = Object.entries(topBrandCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Stryker LIFEPAK 15';

    return {
      chartData: sliced,
      regionalStats: {
        avgScore: Number(avgScore),
        totalAccounts: categoryAgencies.length,
        totalPipeline,
        topLeadName: topOpportunity ? `${topOpportunity.fullName} (${topOpportunity.score} pts)` : 'None',
        topLeadScore: topOpportunity ? topOpportunity.score : 0,
        primaryCompetitor: primaryCompetitorBrand
      },
      scopeTitle: 'Nationwide State-by-State PulseIQ Score Comparison',
      scopeSubtitle: 'Comparative four-factor scoring across states in the territory'
    };
  }, [effectiveAgencies, normalizedState, normalizedCounty, categoryFilter, limitCount, sortBy, weights]);

  // Radar chart data comparing active average vs national benchmark
  const radarData = useMemo(() => {
    if (chartData.length === 0) return [];
    
    // Calculate averages of current dataset
    const avgClinical = Math.round(chartData.reduce((acc, d) => acc + (d.clinicalAcuity || 20), 0) / chartData.length);
    const avgFleet = Math.round(chartData.reduce((acc, d) => acc + (d.fleetObsolescence || 20), 0) / chartData.length);
    const avgGrant = Math.round(chartData.reduce((acc, d) => acc + (d.budgetGrant || 11), 0) / chartData.length);
    const avgSoftware = Math.round(chartData.reduce((acc, d) => acc + (d.softwareWhitespace || 0), 0) / chartData.length);
    const weightsByFactor = Object.fromEntries(
      getPulseIqWeightDetails(weights).factors.map((factor) => [factor.key, factor.weightPct])
    ) as Record<'fleet' | 'clinical' | 'grant' | 'software', number>;

    return [
      { pillar: 'Clinical call volume', score: avgClinical, benchmark: (18 / 27) * weightsByFactor.clinical, fullMark: weightsByFactor.clinical },
      { pillar: 'Fleet replacement pressure', score: avgFleet, benchmark: (17 / 40) * weightsByFactor.fleet, fullMark: weightsByFactor.fleet },
      { pillar: 'Grant readiness', score: avgGrant, benchmark: (10 / 20) * weightsByFactor.grant, fullMark: weightsByFactor.grant },
      { pillar: 'Software whitespace', score: avgSoftware, benchmark: (12 / 13) * weightsByFactor.software, fullMark: weightsByFactor.software }
    ];
  }, [chartData, weights]);

  // List of all 50 states + DC for interactive dropdown selection
  const allStatesList = useMemo(() => {
    return Object.entries(ALL_50_STATES_SUMMARIES).map(([code, s]) => ({
      code,
      name: s.state,
      label: `${code} - ${s.state}`
    })).sort((a, b) => a.name.localeCompare(b.name));
  }, []);

  // Counties in the currently selected state
  const inStateCountiesList = useMemo(() => {
    if (!normalizedState || normalizedState === 'all') return [];
    return territoryEngine.getCountiesForState(normalizedState.toUpperCase()).map(c => c.countyName).sort();
  }, [normalizedState]);

  // Handle bar click with full drill-down (Nationwide -> State -> County -> Agency)
  const handleBarClick = (data: any) => {
    if (!data) return;
    if (data.agencyObj && onSelectAgency) {
      onSelectAgency(data.agencyObj);
      return;
    }
    if (normalizedCounty !== 'all' && data.agencyObj && onSelectAgency) {
      onSelectAgency(data.agencyObj);
      return;
    }
    if (normalizedCounty === 'all' && normalizedState !== 'all' && data.fullName && onSelectCounty) {
      onSelectCounty(data.fullName);
      return;
    }
    if (normalizedState === 'all' && data.stateCode && onSelectState) {
      onSelectState(data.stateCode);
      if (onSelectCounty) onSelectCounty('all');
    }
  };

  // Custom high-contrast tooltip adhering strictly to unified light/dark theme & institutional palette
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload;
      return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 shadow-xl text-xs space-y-1.5 max-w-xs pointer-events-none select-none">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-1.5">
            <span className="font-semibold text-slate-900 dark:text-white text-sm tracking-[-0.01em]">{item.fullName || label}</span>
            <span className="tabular-nums text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[#1E3A8A] dark:text-blue-400">
              Score: {item.score}
            </span>
          </div>

          <div className="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed tabular-nums">
            {item.hasAgencies === false && (
              <div className="mb-1 text-amber-700 dark:text-amber-300">
                No matched accounts; this row uses the model&apos;s documented default inputs.
              </div>
            )}
            {item.city && <div><strong>City:</strong> {item.city}, {item.stateCode}</div>}
            {item.county && <div><strong>County:</strong> {item.county}</div>}
            {item.topAccountName && <div><strong>Top Lead:</strong> {item.topAccountName}</div>}
            {item.fleetBrand && <div><strong>Installed Fleet:</strong> {item.fleetBrand} (<span className="tabular-nums font-semibold">{item.fleetAge} yrs</span>)</div>}
            {item.pipelineFormatted && <div><strong>Projected Pipeline:</strong> <span className="tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">{item.pipelineFormatted}</span></div>}
          </div>

          {/* PulseIQ score contribution details */}
          <div className="pt-1.5 border-t border-slate-100 dark:border-slate-800 space-y-1 tabular-nums text-[10px]">
            <PulseIqRegionalTooltipFactors
              values={item}
              weights={weights}
            />
            <div className="pt-1 text-slate-500 dark:text-slate-400">
              Local claim data is excluded from PulseIQ.
            </div>
          </div>

          <div className="text-[9px] text-slate-500 dark:text-slate-400 font-mono pt-1">
            Click bar to drill down into this {normalizedCounty !== 'all' ? 'agency' : normalizedState !== 'all' ? 'county' : 'state'}
          </div>
        </div>
      );
    }
    return null;
  };

  // Format X-axis tick labels cleanly to prevent clipping
  const formatXAxisLabel = (val: string, index: number) => {
    const entry = chartData[index];
    if (!entry) return val;
    if (normalizedCounty !== 'all' || normalizedState !== 'all') {
      return entry.name?.length > 16 ? `${entry.name.slice(0, 14)}…` : (entry.name || val);
    }
    // Nationwide state comparison
    if (limitCount === 8 || limitCount === 12) {
      return `${entry.shortName} · ${entry.name.slice(0, 10)}`;
    }
    return entry.shortName || val;
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs space-y-5 transition-colors w-full max-w-full overflow-hidden">
      
      {/* Header & Quick Filter Strip */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-sky-50 dark:bg-sky-950/60 border border-sky-300 dark:border-sky-800 text-sky-700 dark:text-sky-400 flex items-center justify-center font-bold shadow-2xs">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono uppercase font-bold text-sky-700 dark:text-sky-400 tracking-wider bg-sky-50 dark:bg-sky-950/60 border border-sky-200 dark:border-sky-800 px-2 py-0.5 rounded">
                  Recharts Analytics
                </span>
                <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                  {normalizedCounty !== 'all' ? `County Scope: ${normalizedCounty}` : normalizedState !== 'all' ? `State Scope: ${ALL_50_STATES_SUMMARIES[normalizedState.toUpperCase()]?.state || normalizedState}` : 'National Scope (50 States + DC)'}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white tracking-[-0.02em]">
                  {scopeTitle}
                </h2>
                <button
                  type="button"
                  onClick={() => setShowUnderstandingModal(true)}
                  className="p-1 rounded-lg text-slate-400 hover:text-sky-600 dark:hover:text-sky-400 hover:bg-sky-50 dark:hover:bg-sky-950/50 transition-colors cursor-pointer"
                  title="Understanding PulseIQ Scoring Methodology"
                  aria-label="Understanding PulseIQ Scoring Methodology"
                >
                  <Info className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
          <p className="text-xs text-slate-700 dark:text-slate-300 mt-1 max-w-2xl leading-relaxed">
            {scopeSubtitle}. PulseIQ uses fleet condition, clinical call volume, grant readiness, and software status. Demographics and local claim data are excluded; imported claim evidence remains available separately for review.
          </p>
        </div>

        {/* View Mode Segmented Controls */}
        <div className="flex flex-wrap items-center gap-2">
          
          {/* Mode Switcher */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold">
            <button
              onClick={() => setChartMode('stacked_breakdown')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                chartMode === 'stacked_breakdown'
                  ? 'bg-[#0F172A] dark:bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Stacked PulseIQ factor contributions"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Factor Breakdown</span>
            </button>

            <button
              onClick={() => setChartMode('benchmark')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                chartMode === 'benchmark'
                  ? 'bg-[#0F172A] dark:bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="PulseIQ Score vs Territory Benchmark"
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>Benchmark Bars</span>
            </button>

            <button
              onClick={() => setChartMode('radar')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                chartMode === 'radar'
                  ? 'bg-[#0F172A] dark:bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="5-Axis Radar Diagnostic Profile"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Radar Profile</span>
            </button>

            <button
              onClick={() => setChartMode('pipeline')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                chartMode === 'pipeline'
                  ? 'bg-[#0F172A] dark:bg-blue-600 text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
              title="Pipeline Value vs PulseIQ"
            >
              <DollarSign className="w-3.5 h-3.5" />
              <span>Score vs Pipeline</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowUnderstandingModal(true)}
              className="px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-900 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Understanding PulseIQ Methodology, Calculation & Prioritization"
            >
              <Info className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Understanding PulseIQ</span>
            </button>

            {onOpenWeightsModal && (
              <button
                type="button"
                onClick={onOpenWeightsModal}
                className="px-3 py-1.5 rounded-xl bg-sky-50 dark:bg-sky-950/60 hover:bg-sky-100 dark:hover:bg-sky-900/60 text-sky-800 dark:text-sky-300 border border-sky-200 dark:border-sky-800 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                title="Calibrate PulseIQ scoring weights"
              >
                <Sliders className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                <span>Calibrate Weights</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* KPI Highlight Strip (1px Hairline Institutional Ledger Grid) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-slate-200 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden text-xs">
        
        <div className="bg-white dark:bg-slate-900 p-4 space-y-1">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Mean regional PulseIQ</div>
          <div className="flex items-baseline gap-2">
            <span className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white tabular-nums">
              {regionalStats.avgScore}
            </span>
            <span className="text-xs tabular-nums text-[#1E3A8A] dark:text-blue-400 font-medium">
              / 100
            </span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed tabular-nums">
            {regionalStats.totalAccounts.toLocaleString()} USFA / NPI providers
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 space-y-1">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Top priority opportunity</div>
          <div className="text-sm font-semibold text-slate-900 dark:text-white truncate" title={regionalStats.topLeadName}>
            {regionalStats.topLeadName}
          </div>
          <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium leading-relaxed flex items-center gap-1">
            <span>Tier-1 conversion readiness</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 space-y-1">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Addressable pipeline</div>
          <div className="text-xl sm:text-2xl font-semibold text-emerald-700 dark:text-emerald-400 tabular-nums">
            {regionalStats.totalPipeline >= 1000000000
              ? `$${(regionalStats.totalPipeline / 1000000000).toFixed(2)}B`
              : `$${(regionalStats.totalPipeline / 1000000).toFixed(1)}M`}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            Sourcewell / NPPGov Schedule
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-4 space-y-1">
          <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Primary displacement target</div>
          <div className="text-sm font-semibold text-amber-700 dark:text-amber-400 truncate">
            {regionalStats.primaryCompetitor}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed tabular-nums">
            Legacy fleet cycle (&gt;7 yrs)
          </div>
        </div>

      </div>

      {/* Interactive Geography Selector & Filters Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs pt-1 pb-1 border-y border-slate-100 dark:border-slate-800">
        
        {/* Left: State & County Selectors + Breadcrumb Reset */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300">State:</span>
            <select
              value={normalizedState}
              onChange={(e) => {
                const val = e.target.value;
                if (onSelectState) onSelectState(val);
                if (onSelectCounty) onSelectCounty('all');
              }}
              className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-800 dark:text-white font-medium focus:outline-none focus:border-sky-500 shadow-2xs cursor-pointer"
            >
              <option value="all">All 50 States (National Comparison)</option>
              {allStatesList.map(st => (
                <option key={st.code} value={st.code}>{st.code} - {st.name}</option>
              ))}
            </select>
          </div>

          {/* County Selector (Visible when a State is chosen) */}
          {normalizedState !== 'all' && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">County:</span>
              <select
                value={normalizedCounty}
                onChange={(e) => {
                  const val = e.target.value;
                  if (onSelectCounty) onSelectCounty(val);
                }}
                className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-800 dark:text-white font-semibold focus:outline-none focus:border-sky-500 shadow-2xs cursor-pointer max-w-[180px]"
              >
                <option value="all">All Counties in {ALL_50_STATES_SUMMARIES[normalizedState.toUpperCase()]?.state || normalizedState}</option>
                {inStateCountiesList.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          )}

          {/* Reset Filter Button */}
          {(normalizedState !== 'all' || normalizedCounty !== 'all') && (
            <button
              onClick={() => {
                if (onSelectState) onSelectState('all');
                if (onSelectCounty) onSelectCounty('all');
              }}
              className="px-2 py-1 text-[11px] text-sky-700 dark:text-sky-300 hover:text-sky-900 bg-sky-50 dark:bg-sky-950/60 hover:bg-sky-100 border border-sky-200 dark:border-sky-800 rounded-lg font-semibold flex items-center gap-1 cursor-pointer transition-colors"
              title="Reset to Nationwide comparison"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset to National</span>
            </button>
          )}
        </div>

        {/* Right: Category, Sort & Limit Controls */}
        <div className="flex flex-wrap items-center gap-2">
          
          {/* Category Pill Filters */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setCategoryFilter('all')}
              className={`px-2 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                categoryFilter === 'all'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              All
            </button>

            <button
              onClick={() => setCategoryFilter('ems')}
              className={`px-2 py-1 rounded-md text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                categoryFilter === 'ems'
                  ? 'bg-sky-600 text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Siren className="w-3 h-3" />
              <span>EMS</span>
            </button>

            <button
              onClick={() => setCategoryFilter('fire')}
              className={`px-2 py-1 rounded-md text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                categoryFilter === 'fire'
                  ? 'bg-rose-600 text-white shadow-2xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Flame className="w-3 h-3" />
              <span>Fire</span>
            </button>
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-1">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-800 dark:text-white font-semibold focus:outline-none focus:border-sky-500 shadow-2xs cursor-pointer"
            >
              <option value="score">PulseIQ Score (Highest)</option>
              <option value="value">Pipeline Value ($)</option>
              <option value="fleetAge">Installed Fleet Age</option>
              <option value="name">Alphabetical (A–Z)</option>
            </select>
          </div>

          {/* Quantity Limit Selector */}
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Show:</span>
            <select
              value={limitCount}
              onChange={(e) => setLimitCount(Number(e.target.value))}
              className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-800 dark:text-white font-semibold focus:outline-none focus:border-sky-500 shadow-2xs cursor-pointer"
            >
              <option value={8}>Top 8</option>
              <option value={12}>Top 12</option>
              <option value={20}>Top 20</option>
              <option value={-1}>All in Scope</option>
            </select>
          </div>

        </div>

      </div>

      {/* Main Chart Rendering Container */}
      <div className="w-full min-w-0 overflow-hidden h-[460px] sm:h-[500px] pt-2">
        
        {/* MODE 1: Active PulseIQ factor breakdown */}
        {chartMode === 'stacked_breakdown' && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 20, right: 25, left: 10, bottom: 55 }}
              onClick={(e: any) => {
                if (e && e.activePayload && e.activePayload[0]) {
                  handleBarClick(e.activePayload[0].payload);
                }
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="axisLabel"
                stroke="#64748b"
                fontSize={limitCount > 20 || limitCount === -1 ? 9.5 : 11}
                fontWeight={600}
                tickLine={false}
                interval={0}
                angle={normalizedState === 'all' && (limitCount > 12 || limitCount === -1) ? 0 : -35}
                textAnchor={normalizedState === 'all' && (limitCount > 12 || limitCount === -1) ? "middle" : "end"}
                height={55}
              />
              <YAxis
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                domain={[0, 100]}
                tickFormatter={(val) => `${val} pt`}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(2, 132, 199, 0.06)' }} />
              <Legend
                wrapperStyle={{ paddingTop: '10px', fontSize: '11px' }}
                iconType="circle"
                iconSize={8}
              />
              <ReferenceLine y={85} stroke="#1E3A8A" strokeDasharray="4 4" label={{ value: 'Priority Tier (85 pts)', position: 'insideTopRight', fill: '#1E3A8A', fontSize: 10, fontWeight: 'bold' }} />
              
              {/* 5 Stacked Pillars with Harmonious Clinical Palette */}
              <Bar dataKey="clinicalAcuity" name="Clinical acuity (weighted points)" stackId="a" fill="#1E3A8A" radius={[0, 0, 0, 0]} cursor="pointer" />
              <Bar dataKey="fleetObsolescence" name="Fleet pressure (weighted points)" stackId="a" fill="#2563EB" radius={[0, 0, 0, 0]} cursor="pointer" />
              <Bar dataKey="softwareWhitespace" name="Software whitespace (weighted points)" stackId="a" fill="#60A5FA" radius={[0, 0, 0, 0]} cursor="pointer" />
              <Bar dataKey="budgetGrant" name="Grant readiness (weighted points)" stackId="a" fill="#059669" radius={[4, 4, 0, 0]} cursor="pointer" />
            </BarChart>
          </ResponsiveContainer>
        )}

        {/* MODE 2: PulseIQ Score vs Benchmark Composed Bar Chart */}
        {chartMode === 'benchmark' && (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 20, right: 25, left: 10, bottom: 55 }}
              onClick={(e: any) => {
                if (e && e.activePayload && e.activePayload[0]) {
                  handleBarClick(e.activePayload[0].payload);
                }
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="axisLabel"
                stroke="#64748b"
                fontSize={limitCount > 20 || limitCount === -1 ? 9.5 : 11}
                fontWeight={600}
                tickLine={false}
                interval={0}
                angle={normalizedState === 'all' && (limitCount > 12 || limitCount === -1) ? 0 : -35}
                textAnchor={normalizedState === 'all' && (limitCount > 12 || limitCount === -1) ? "middle" : "end"}
                height={55}
              />
              <YAxis
                stroke="#64748b"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                domain={[0, 100]}
                tickFormatter={(val) => `${val} pt`}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(2, 132, 199, 0.06)' }} />
              <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '11px' }} iconType="circle" iconSize={8} />
              <ReferenceLine y={regionalStats.avgScore} stroke="#d97706" strokeWidth={1.5} label={{ value: `Territory Mean (${regionalStats.avgScore} pts)`, position: 'insideTopLeft', fill: '#d97706', fontSize: 10, fontWeight: 'bold' }} />
              
              <Bar dataKey="score" name="PulseIQ Score (Average / Account)" fill="#1E3A8A" radius={[4, 4, 0, 0]} cursor="pointer">
                {chartData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.score >= 82 ? '#1E3A8A' : entry.score >= 74 ? '#2563EB' : '#64748B'} 
                  />
                ))}
              </Bar>

              {chartData[0]?.peakScore && (
                <Line
                  type="monotone"
                  dataKey="peakScore"
                  name="Top Account Score in Region"
                  stroke="#059669"
                  strokeWidth={2}
                  dot={{ r: 4, fill: '#059669' }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        )}

        {/* MODE 3: PulseIQ factor comparison */}
        {chartMode === 'radar' && (
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
              <PolarGrid stroke="#cbd5e1" />
              <PolarAngleAxis dataKey="pillar" stroke="#334155" fontSize={11} fontWeight={600} />
              <PolarRadiusAxis angle={30} domain={[0, 25]} stroke="#64748b" fontSize={10} />
              <Tooltip 
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const d = payload[0].payload;
                    return (
                      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5 shadow-md text-xs font-mono tabular-nums">
                        <div className="font-bold text-slate-900 dark:text-white">{d.pillar}</div>
                        <div className="text-[#1E3A8A] dark:text-blue-400 font-bold mt-1 tabular-nums">Regional Average: {d.score} / {d.fullMark} pts</div>
                        <div className="text-slate-600 dark:text-slate-400 tabular-nums">National Baseline: {d.benchmark} / {d.fullMark} pts</div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '11px' }} />
              <Radar
                name="Current Region Score Profile"
                dataKey="score"
                stroke="#1E3A8A"
                fill="#1E3A8A"
                fillOpacity={0.35}
                strokeWidth={2}
              />
              <Radar
                name="National Clinical Baseline"
                dataKey="benchmark"
                stroke="#64748B"
                fill="#64748B"
                fillOpacity={0.15}
                strokeDasharray="4 4"
                strokeWidth={1.5}
              />
            </RadarChart>
          </ResponsiveContainer>
        )}

        {/* MODE 4: Score vs Addressable Pipeline Composed Chart */}
        {chartMode === 'pipeline' && (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartData}
              margin={{ top: 20, right: 30, left: 10, bottom: 55 }}
              onClick={(e: any) => {
                if (e && e.activePayload && e.activePayload[0]) {
                  handleBarClick(e.activePayload[0].payload);
                }
              }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="axisLabel"
                stroke="#64748b"
                fontSize={limitCount > 20 || limitCount === -1 ? 9.5 : 11}
                fontWeight={600}
                tickLine={false}
                interval={0}
                angle={normalizedState === 'all' && (limitCount > 12 || limitCount === -1) ? 0 : -35}
                textAnchor={normalizedState === 'all' && (limitCount > 12 || limitCount === -1) ? "middle" : "end"}
                height={55}
              />
              {/* Left Y Axis: PulseIQ Score */}
              <YAxis
                yAxisId="left"
                stroke="#1E3A8A"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                domain={[0, 100]}
                tickFormatter={(val) => `${val} pt`}
              />
              {/* Right Y Axis: Pipeline Value */}
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="#059669"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val) => `$${val >= 1000000 ? (val / 1000000).toFixed(1) + 'M' : (val / 1000).toFixed(0) + 'K'}`}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(30, 58, 138, 0.06)' }} />
              <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '11px' }} iconType="circle" iconSize={8} />
              
              <Bar
                yAxisId="left"
                dataKey="score"
                name="PulseIQ Score (0–100)"
                fill="#1E3A8A"
                radius={[4, 4, 0, 0]}
                cursor="pointer"
              />
              
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="pipelineValue"
                name="Pipeline Opportunity ($)"
                stroke="#059669"
                strokeWidth={2.5}
                dot={{ r: 4, fill: '#059669' }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}

      </div>

      {/* Chart Footer with Interactive Drill-Down Breadcrumb Action */}
      <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-800 dark:text-slate-200">Direct Navigation:</span>
          {normalizedCounty !== 'all' ? (
            <div className="flex items-center gap-1.5 font-mono text-[11px]">
              <button
                onClick={() => onSelectCounty && onSelectCounty('all')}
                className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[#1E3A8A] dark:text-blue-400 font-bold border border-slate-200 dark:border-slate-700 transition-colors"
              >
                &larr; Return to {normalizedState !== 'all' ? normalizedState : 'State'} County Overview
              </button>
            </div>
          ) : normalizedState !== 'all' ? (
            <div className="flex items-center gap-1.5 font-mono text-[11px]">
              <span className="text-slate-500">Click any county bar above or</span>
              <button
                onClick={() => onSelectState && onSelectState('all')}
                className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[#1E3A8A] dark:text-blue-400 font-bold border border-slate-200 dark:border-slate-700 transition-colors"
              >
                &larr; View All 50 States
              </button>
            </div>
          ) : (
            <span className="text-slate-500 font-mono text-[11px]">
              Click any state bar above to zoom into its counties
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 font-mono tabular-nums text-[10px] text-slate-600 dark:text-slate-400">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#1E3A8A]"></span>
            <span>Clinical Acuity (25)</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#2563EB]"></span>
            <span>Fleet Obsolescence (25)</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#60A5FA]"></span>
            <span>Software whitespace</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#93C5FD]"></span>
            <span>Demographics (15)</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-[#059669]"></span>
            <span>FEMA Grants (15)</span>
          </span>
        </div>
      </div>

      {/* Understanding PulseIQ Modal */}
      <UnderstandingPulseIqModal
        isOpen={showUnderstandingModal}
        onClose={() => setShowUnderstandingModal(false)}
        onOpenWeightsModal={onOpenWeightsModal}
        weights={weights}
      />
    </div>
  );
};
