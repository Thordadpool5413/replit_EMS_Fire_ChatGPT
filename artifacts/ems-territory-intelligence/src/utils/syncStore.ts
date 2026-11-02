/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Agency, SyncOutboxItem, PredictiveWeights, LeadStage } from '../types';
import { nationalProviderDb } from '../services/nationalProviderDatabase';
import { calculateScore, DEFAULT_WEIGHTS } from './pulseIqScoring';
export { calculateScore, DEFAULT_WEIGHTS } from './pulseIqScoring';
import {
  applyAgencySourceRecordDataMap,
  applyAgencySourceRecordData,
  loadAgencySourceRecordData,
} from '../services/agencySourceRecordStore';
export { explainAgencyScore, type PulseIqFactorBreakdown, type PulseIqScoreExplanation } from './pulseIqExplanation';

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

export function loadStoredAgencies(): Agency[] {
  purgeLegacyStorageKeys();
  const baseline = nationalProviderDb.getInitialBaselineAgencies();
  const sourceData = loadAgencySourceRecordData();
  const restoreBaselineWithLocalSources = () =>
    applyAgencySourceRecordDataMap(baseline, sourceData);

  try {
    getBaselineSignatures(baseline);

    const rawCustom = localStorage.getItem(STORAGE_KEY_CUSTOM_AGENCIES);
    if (!rawCustom) {
      return restoreBaselineWithLocalSources();
    }

    const customEntries: [string, CompactAgencyDelta][] = JSON.parse(rawCustom);
    if (!Array.isArray(customEntries) || customEntries.length === 0) {
      return restoreBaselineWithLocalSources();
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
    return restoreBaselineWithLocalSources();
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
