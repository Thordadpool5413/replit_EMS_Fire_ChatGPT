import { stripAgencyReviewOverlay } from '../services/agencyReviewOverlay';
import { applyAgencyMutation } from '../services/agencyMutation';
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
const STORAGE_KEY_OUTBOX = 'zoll_pulseiq_outbox_v1';
const STORAGE_KEY_WEIGHTS = 'zoll_pulseiq_weights_v1';

interface CompactAgencyDelta {
  isBookmarked?: boolean;
  inDayRoute?: boolean;
  lastContactDate?: string;
  salesStage?: LeadStage;
  fieldNotes?: Agency['fieldNotes'];
  record?: Agency;
}

export function loadStoredAgencies(): Agency[] {
  const baseline = nationalProviderDb.getInitialBaselineAgencies();
  const sourceData = loadAgencySourceRecordData();
  const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_AGENCIES);
  const entries: [string, CompactAgencyDelta][] = raw ? JSON.parse(raw) : [];
  if (!Array.isArray(entries)) throw new Error('Saved agencies could not be read. Existing data has not been overwritten.');
  const records = new Map(baseline.map(a => [a.id, a]));
  for (const [id, custom] of entries) {
    const agency = custom.record ?? records.get(id);
    if (!agency) continue; // Older v8 deltas did not contain new-agency identities.
    records.set(id, {
      ...agency,
      isBookmarked: custom.isBookmarked ?? agency.isBookmarked,
      inDayRoute: custom.inDayRoute ?? agency.inDayRoute,
      lastContactDate: custom.lastContactDate ?? agency.lastContactDate,
      fieldNotes: custom.fieldNotes ?? agency.fieldNotes ?? [],
      zollOpportunity: { ...agency.zollOpportunity, salesStage: custom.salesStage ?? agency.zollOpportunity.salesStage }
    });
  }
  for (const item of loadStoredOutbox()) {
    if (item.status === 'SYNCED' && item.syncedRevision && (records.get(item.agencyId)?._revision ?? 0) >= item.syncedRevision) continue;
    try { records.set(item.agencyId, applyAgencyMutation(records.get(item.agencyId), item)); }
    catch { /* Unsupported legacy actions remain in the queue for review. */ }
  }
  return applyAgencySourceRecordDataMap([...records.values()], sourceData);
}

/** Atomic storage write: never truncate history or silently report a failed save. */
export function saveAgencies(agencies: Agency[]): void {
  const baseline = new Map(nationalProviderDb.getInitialBaselineAgencies().map(a => [a.id, a]));
  const entries: [string, CompactAgencyDelta][] = [];
  for (const displayed of agencies) {
    const a = stripAgencyReviewOverlay(displayed);
    const base = baseline.get(a.id);
    const delta: CompactAgencyDelta = {
      isBookmarked: a.isBookmarked, inDayRoute: a.inDayRoute,
      lastContactDate: a.lastContactDate, salesStage: a.zollOpportunity.salesStage,
      fieldNotes: a.fieldNotes ?? []
    };
    if (!base || a.isCloudPersisted) delta.record = a;
    if (delta.record || Boolean(a.isBookmarked) !== Boolean(base?.isBookmarked) ||
        Boolean(a.inDayRoute) !== Boolean(base?.inDayRoute) ||
        a.lastContactDate !== base?.lastContactDate ||
        a.zollOpportunity.salesStage !== base?.zollOpportunity.salesStage ||
        JSON.stringify(a.fieldNotes ?? []) !== JSON.stringify(base?.fieldNotes ?? [])) entries.push([a.id, delta]);
  }
  try { localStorage.setItem(STORAGE_KEY_CUSTOM_AGENCIES, JSON.stringify(entries)); }
  catch { throw new Error('Device storage is full or unavailable. Nothing was discarded. Export a backup or free space, then retry.'); }
}

export function loadStoredOutbox(): SyncOutboxItem[] {
  const raw = localStorage.getItem(STORAGE_KEY_OUTBOX);
  const items = raw ? JSON.parse(raw) : [];
  if (!Array.isArray(items)) throw new Error('Saved changes could not be read. The queue has not been overwritten.');
  return items;
}

export function saveOutbox(items: SyncOutboxItem[]): void {
  localStorage.setItem(STORAGE_KEY_OUTBOX, JSON.stringify(items));
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('ems-outbox-changed'));
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
