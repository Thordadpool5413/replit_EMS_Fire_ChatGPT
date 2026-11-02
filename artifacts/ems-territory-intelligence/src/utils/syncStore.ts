/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Agency, SyncOutboxItem, PredictiveWeights, LeadStage } from '../types';
import { nationalProviderDb } from '../services/nationalProviderDatabase';
import { calculateScore, DEFAULT_WEIGHTS } from './pulseIqScoring';
export { calculateScore, DEFAULT_WEIGHTS } from './pulseIqScoring';
import {
  applyAgencySourceRecordData,
  loadAgencySourceRecordData,
} from '../services/agencySourceRecordStore';

const STORAGE_KEY_CUSTOM_AGENCIES = 'zoll_pulseiq_custom_agencies_v8';
const LEGACY_AGENCY_KEYS = [
  'zoll_pulseiq_agencies_v1',
  'zoll_pulseiq_agencies_v2',
  'zoll_pulseiq_agencies_v3',
  'zoll_pulseiq_agencies_v4',
  'zoll_pulseiq_agencies_v5',
  'zoll_pulseiq_custom_agencies_v1',
  'zoll_pulseiq_custom_agencies_v2',
  'zoll_pulseiq_custom_agencies_v3',
  'zoll_pulseiq_custom_agencies_v4',
  'zoll_pulseiq_custom_agencies_v5',
  'zoll_pulseiq_custom_agencies_v6',
  'zoll_pulseiq_custom_agencies_v7'
];
const STORAGE_KEY_OUTBOX = 'zoll_pulseiq_outbox_v1';
const STORAGE_KEY_WEIGHTS = 'zoll_pulseiq_weights_v1';

interface CompactAgencyDelta {
  isBookmarked?: boolean;
  inDayRoute?: boolean;
  lastContactDate?: string;
  salesStage?: LeadStage;
  fieldNotes?: Agency['fieldNotes'];
}

let baselineSignatureMap: Map<string, {
  isBookmarked: boolean;
  inDayRoute: boolean;
  notesCount: number;
  salesStage: LeadStage;
}> | null = null;

function purgeLegacyStorageKeys(): void {
  try {
    for (const key of LEGACY_AGENCY_KEYS) {
      localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage access errors in restricted contexts
  }
}

function getBaselineSignatures(baseline: Agency[]) {
  if (!baselineSignatureMap) {
    baselineSignatureMap = new Map();
    for (const a of baseline) {
      baselineSignatureMap.set(a.id, {
        isBookmarked: Boolean(a.isBookmarked),
        inDayRoute: Boolean(a.inDayRoute),
        notesCount: a.fieldNotes ? a.fieldNotes.length : 0,
        salesStage: a.zollOpportunity.salesStage
      });
    }
  }
  return baselineSignatureMap;
}

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

export function explainAgencyScore(
  agency: Agency,
  weights: PredictiveWeights = DEFAULT_WEIGHTS
): PulseIqScoreExplanation {
  const wFleet = typeof weights?.fleetAgeWeight === 'number' ? weights.fleetAgeWeight : DEFAULT_WEIGHTS.fleetAgeWeight;
  const wCardiac = typeof weights?.cardiacVolumeWeight === 'number' ? weights.cardiacVolumeWeight : DEFAULT_WEIGHTS.cardiacVolumeWeight;
  const wGrant = typeof weights?.grantAwardWeight === 'number' ? weights.grantAwardWeight : DEFAULT_WEIGHTS.grantAwardWeight;
  const wSoftware = typeof weights?.softwareWhitespaceWeight === 'number' ? weights.softwareWhitespaceWeight : DEFAULT_WEIGHTS.softwareWhitespaceWeight;

  const totalWeight = (wFleet + wCardiac + wGrant + wSoftware) || 100;

  // 1. Fleet Age Component
  const age = agency.installedFleet?.defibAgeYears ?? 7;
  const brand = agency.installedFleet?.defibBrand || 'Stryker LIFEPAK 15';
  const isCompetitor = !brand.includes('ZOLL');
  let fleetScore = 20;
  if (isCompetitor) {
    if (age >= 9) fleetScore = 100;
    else if (age >= 7) fleetScore = 85;
    else if (age >= 5) fleetScore = 65;
    else fleetScore = 40;
  } else {
    if (age >= 7) fleetScore = 75;
    else fleetScore = 30;
  }
  const fleetPts = +((fleetScore * wFleet) / totalWeight).toFixed(1);

  // Claims remain available as evidence, but local denial percentages do not affect PulseIQ.
  const cmsScore = 0;
  const cmsPts = 0;

  // 3. Cardiac Volume / Clinical Acuity
  const cardiac = agency.annualCardiacArrestCalls ?? 600;
  let cardiacScore = 40;
  if (cardiac >= 1800) cardiacScore = 100;
  else if (cardiac >= 1000) cardiacScore = 85;
  else if (cardiac >= 500) cardiacScore = 70;
  else cardiacScore = 50;
  const cardiacPts = +((cardiacScore * wCardiac) / totalWeight).toFixed(1);

  // 4. Grant Award Component
  const grantScore = agency.grantStatus?.afgAwarded ? 100 : (agency.grantStatus?.saferGrantActive ? 60 : 25);
  const grantPts = +((grantScore * wGrant) / totalWeight).toFixed(1);

  // 5. Software Whitespace
  const billingSw = agency.installedFleet?.billingSoftware || '';
  const epcrSw = agency.installedFleet?.epcrCadSoftware || '';
  const hasZollSoftware = billingSw.includes('ZOLL') || epcrSw.includes('ZOLL');
  const softwareScore = hasZollSoftware ? 35 : 95;
  const softwarePts = +((softwareScore * wSoftware) / totalWeight).toFixed(1);

  const finalScore = calculateScore(agency, weights);

  const brandName = agency.installedFleet?.defibBrand || 'Stryker LIFEPAK 15';
  const unitsCount = agency.installedFleet?.defibUnitsCount ?? 12;
  const warrantyStatus = agency.installedFleet?.defibWarrantyStatus || 'Expired';
  const afgAmount = agency.grantStatus?.afgAwardAmount ? Math.round(agency.grantStatus.afgAwardAmount / 1000) : 0;
  const afgYear = agency.grantStatus?.afgFiscalYear || 2025;
  const epcrName = agency.installedFleet?.epcrCadSoftware || 'Legacy ePCR';
  const billingName = agency.installedFleet?.billingSoftware || 'In-House Billing';

  const factors: PulseIqFactorBreakdown[] = [
    {
      id: 'fleet',
      name: 'Installed Defib Fleet & Warranty Risk',
      weightPct: Math.round((wFleet / totalWeight) * 100),
      componentScore: fleetScore,
      pointsContributed: fleetPts,
      agencyMetricValue: `${brandName} · ${unitsCount} units (${age} yrs old)`,
      clinicalImpactSummary:
        age >= 7
          ? `Aging ${brandName} monitors are ${age} years old with ${warrantyStatus.toLowerCase()} warranty, driving urgent tech refresh.`
          : `Fleet monitors are ${age} years old (${warrantyStatus}).`,
      urgencyLevel: age >= 8 ? 'Critical' : age >= 6 ? 'Elevated' : 'Moderate'
    },
    {
      id: 'cms',
      name: 'Local claim rates excluded',
      weightPct: 0,
      componentScore: cmsScore,
      pointsContributed: cmsPts,
      agencyMetricValue: 'Excluded from the score; source records remain available separately',
      clinicalImpactSummary: 'Imported claim counts and citations are for direct review only. No local percentage or denial-based recovery estimate contributes to PulseIQ.',
      urgencyLevel: 'Nominal'
    },
    {
      id: 'cardiac',
      name: 'Cardiac Arrest Call Volume (Acuity)',
      weightPct: Math.round((wCardiac / totalWeight) * 100),
      componentScore: cardiacScore,
      pointsContributed: cardiacPts,
      agencyMetricValue: `${cardiac.toLocaleString()} OHCA Cardiac Calls/yr`,
      clinicalImpactSummary:
        cardiac >= 1000
          ? `High-volume resuscitation system with ${cardiac.toLocaleString()} annual cardiac arrest calls and ${agency.utsteinSurvivalRate || 14}% Utstein survival.`
          : `Moderate cardiac arrest volume (${cardiac.toLocaleString()} calls/yr) with opportunity for AutoPulse mechanical CPR.`,
      urgencyLevel: cardiac >= 1200 ? 'Critical' : cardiac >= 700 ? 'Elevated' : 'Moderate'
    },
    {
      id: 'grants',
      name: 'Federal AFG / SAFER Grant Award Status',
      weightPct: Math.round((wGrant / totalWeight) * 100),
      componentScore: grantScore,
      pointsContributed: grantPts,
      agencyMetricValue: agency.grantStatus?.afgAwarded
        ? `FEMA AFG Awarded: $${afgAmount}K (FY${afgYear})`
        : 'Eligible for FY2026 AFG Equipment Grant',
      clinicalImpactSummary: agency.grantStatus?.afgAwarded
        ? `Federal funding ($${afgAmount}K) secured under FEMA AFG FY${afgYear} for capital equipment purchase.`
        : 'Department meets qualifying criteria for FEMA AFG regional joint grant application.',
      urgencyLevel: agency.grantStatus?.afgAwarded ? 'Critical' : 'Moderate'
    },
    {
      id: 'software',
      name: 'ePCR & Billing Software Whitespace',
      weightPct: Math.round((wSoftware / totalWeight) * 100),
      componentScore: softwareScore,
      pointsContributed: softwarePts,
      agencyMetricValue: `Charting: ${epcrName} · Billing: ${billingName}`,
      clinicalImpactSummary: !hasZollSoftware
        ? `Opportunity to displace legacy ${epcrName} and unify billing with ZOLL RescueNet & AR Boost.`
        : 'Existing customer with expansion opportunity into ZOLL Respond & CAD dispatch integration.',
      urgencyLevel: !hasZollSoftware ? 'Elevated' : 'Nominal'
    }
  ];

  return {
    totalScore: finalScore,
    priorityTier: agency.zollOpportunity.priorityTier || (finalScore >= 88 ? 'Tier 1 Prime Target' : finalScore >= 78 ? 'Tier 2 Active Target' : 'Tier 3 Standard'),
    factors
  };
}

export function loadStoredAgencies(): Agency[] {
  purgeLegacyStorageKeys();
  try {
    const baseline = nationalProviderDb.getInitialBaselineAgencies();
    getBaselineSignatures(baseline);
    const sourceData = loadAgencySourceRecordData();

    const rawCustom = localStorage.getItem(STORAGE_KEY_CUSTOM_AGENCIES);
    if (!rawCustom) {
      return baseline.map((agency) =>
        applyAgencySourceRecordData(agency, sourceData[agency.id]),
      );
    }

    const customEntries: [string, CompactAgencyDelta][] = JSON.parse(rawCustom);
    if (!Array.isArray(customEntries) || customEntries.length === 0) {
      return baseline.map((agency) =>
        applyAgencySourceRecordData(agency, sourceData[agency.id]),
      );
    }

    const customMap = new Map<string, CompactAgencyDelta>(customEntries);
    return baseline.map(agency => {
      const custom = customMap.get(agency.id);
      const restored = !custom ? agency : {
        ...agency,
        isBookmarked: custom.isBookmarked ?? agency.isBookmarked,
        inDayRoute: custom.inDayRoute ?? agency.inDayRoute,
        lastContactDate: custom.lastContactDate ?? agency.lastContactDate,
        fieldNotes: (custom.fieldNotes ?? agency.fieldNotes ?? []).filter(
          n => n.repName !== 'Sarah Jenkins (TM)' && !n.notes.includes('Kowalski') && !n.notes.includes('Chief Adams')
        ),
        zollOpportunity: {
          ...agency.zollOpportunity,
          salesStage: custom.salesStage ?? agency.zollOpportunity.salesStage
        }
      };
      return applyAgencySourceRecordData(restored, sourceData[agency.id]);
    });
  } catch {
    return nationalProviderDb.getInitialBaselineAgencies();
  }
}

export function saveAgencies(agencies: Agency[]): void {
  purgeLegacyStorageKeys();
  try {
    const baseline = nationalProviderDb.getInitialBaselineAgencies();
    const signatures = getBaselineSignatures(baseline);
    const customEntries: [string, CompactAgencyDelta][] = [];

    for (const a of agencies) {
      const baseSig = signatures.get(a.id);
      const notesCount = a.fieldNotes ? a.fieldNotes.length : 0;

      const isModified = baseSig
        ? (
            Boolean(a.isBookmarked) !== baseSig.isBookmarked ||
            Boolean(a.inDayRoute) !== baseSig.inDayRoute ||
            notesCount !== baseSig.notesCount ||
            a.zollOpportunity.salesStage !== baseSig.salesStage
          )
        : (Boolean(a.isBookmarked) || Boolean(a.inDayRoute) || notesCount > 1);

      if (isModified) {
        const delta: CompactAgencyDelta = {
          isBookmarked: a.isBookmarked,
          inDayRoute: a.inDayRoute,
          lastContactDate: a.lastContactDate,
          salesStage: a.zollOpportunity.salesStage
        };
        if (!baseSig || notesCount !== baseSig.notesCount) {
          delta.fieldNotes = (a.fieldNotes || []).slice(0, 8);
        }
        customEntries.push([a.id, delta]);
        if (customEntries.length >= 150) break;
      }
    }

    const serialized = JSON.stringify(customEntries);
    try {
      localStorage.setItem(STORAGE_KEY_CUSTOM_AGENCIES, serialized);
    } catch {
      // If quota is still tight due to other keys, prune to top 40 deltas and retry safely
      purgeLegacyStorageKeys();
      const trimmed = JSON.stringify(customEntries.slice(0, 40));
      try {
        localStorage.setItem(STORAGE_KEY_CUSTOM_AGENCIES, trimmed);
      } catch {
        // Silently skip localStorage cache if browser storage is completely full
      }
    }
  } catch {
    // Prevent storage quota issues from disrupting application state
  }
}

export function loadStoredOutbox(): SyncOutboxItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_OUTBOX);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveOutbox(items: SyncOutboxItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_OUTBOX, JSON.stringify(items.slice(0, 50)));
  } catch {
    // Ignore quota errors on offline outbox cache
  }
}

export function loadStoredWeights(): PredictiveWeights {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_WEIGHTS);
    if (!raw) return DEFAULT_WEIGHTS;
    const parsed = JSON.parse(raw);
    const fleet = typeof parsed?.fleetAgeWeight === 'number' ? parsed.fleetAgeWeight : DEFAULT_WEIGHTS.fleetAgeWeight;
    const cardiac = typeof parsed?.cardiacVolumeWeight === 'number' ? parsed.cardiacVolumeWeight : DEFAULT_WEIGHTS.cardiacVolumeWeight;
    const grants = typeof parsed?.grantAwardWeight === 'number' ? parsed.grantAwardWeight : DEFAULT_WEIGHTS.grantAwardWeight;
    const software = typeof parsed?.softwareWhitespaceWeight === 'number' ? parsed.softwareWhitespaceWeight : DEFAULT_WEIGHTS.softwareWhitespaceWeight;
    const activeTotal = fleet + cardiac + grants + software;
    if (!Number.isFinite(activeTotal) || activeTotal <= 0) return DEFAULT_WEIGHTS;
    const fleetAgeWeight = Math.round((fleet / activeTotal) * 100);
    const cardiacVolumeWeight = Math.round((cardiac / activeTotal) * 100);
    const grantAwardWeight = Math.round((grants / activeTotal) * 100);
    return {
      fleetAgeWeight,
      cmsDenialWeight: 0,
      cardiacVolumeWeight,
      grantAwardWeight,
      softwareWhitespaceWeight: 100 - fleetAgeWeight - cardiacVolumeWeight - grantAwardWeight
    };
  } catch {
    return DEFAULT_WEIGHTS;
  }
}

export function saveStoredWeights(weights: PredictiveWeights): void {
  try {
    localStorage.setItem(STORAGE_KEY_WEIGHTS, JSON.stringify({ ...weights, cmsDenialWeight: 0 }));
  } catch {
    // Ignore quota errors
  }
}

export function createOutboxItem(
  agencyId: string,
  agencyName: string,
  actionType: SyncOutboxItem['actionType'],
  payload: any
): SyncOutboxItem {
  return {
    id: `sync-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    timestamp: new Date().toISOString(),
    agencyId,
    agencyName,
    actionType,
    payload,
    status: 'PENDING'
  };
}
