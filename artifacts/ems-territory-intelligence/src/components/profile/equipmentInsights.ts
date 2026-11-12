/**
 * Pure presentation helpers for the "Technology & equipment in use" and
 * "Buy-back & trade-in" sections. No network calls, no seeded values.
 */
import type { Agency, AgencyFactEvidence, AgencyFactEvidenceKey, DocumentedTradeInOffer } from '../../types';
export type { DocumentedTradeInOffer } from '../../types';

export const NOT_REPORTED = 'Not reported';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export const reportedText = (v: string | null | undefined): string => {
  const t = (v ?? '').trim();
  return t && t.toLowerCase() !== 'not reported' ? t : NOT_REPORTED;
};

export const countText = (v: number | null | undefined, unit = 'units'): string =>
  isNum(v) ? `${v.toLocaleString()} ${unit}` : NOT_REPORTED;

export type EquipmentLine = {
  key: string;
  category: 'monitor' | 'cpr' | 'ventilator' | 'software';
  label: string;
  value: string;
  quantity?: string;
  note?: string;
  evidenceKeys: AgencyFactEvidenceKey[];
};

/** Builds category lines only from fields the record actually has. Combined ePCR/CAD stays combined. */
export const buildEquipmentLines = (agency: Agency): EquipmentLine[] => {
  const f = (agency.installedFleet ?? {}) as Partial<Agency['installedFleet']>;
  const lines: EquipmentLine[] = [
    {
      key: 'monitor', category: 'monitor', label: 'Monitor / defibrillator',
      value: reportedText(f.defibBrand),
      quantity: countText(f.defibUnitsCount),
      note: 'Brand as recorded; model shown only if included in the record.',
      evidenceKeys: ['defibrillatorBiomedicalFleet', 'verifiedHardware'],
    },
    {
      key: 'cpr', category: 'cpr', label: 'Mechanical CPR',
      value: reportedText(f.mechanicalCPR),
      quantity: isNum(f.cprUnitsCount) ? countText(f.cprUnitsCount) : undefined,
      evidenceKeys: ['verifiedHardware'],
    },
    {
      key: 'vent', category: 'ventilator', label: 'Transport ventilator',
      value: reportedText(f.transportVentilator),
      quantity: isNum(f.ventUnitsCount) ? countText(f.ventUnitsCount) : undefined,
      evidenceKeys: ['verifiedHardware'],
    },
    {
      key: 'epcrcad', category: 'software', label: 'ePCR / CAD (combined record)',
      value: reportedText(f.epcrCadSoftware),
      note: 'Recorded as one combined field; separate ePCR and CAD systems are not inferred.',
      evidenceKeys: ['epcrSystem'],
    },
    {
      key: 'dispatch', category: 'software', label: 'Dispatch CAD vendor',
      value: reportedText(f.dispatchCadVendor),
      evidenceKeys: ['communicationsSystems'],
    },
    {
      key: 'billing', category: 'software', label: 'Billing software',
      value: reportedText(f.billingSoftware),
      evidenceKeys: ['billingSoftware'],
    },
  ];
  return lines;
};

export type EvidenceSummary = {
  field: AgencyFactEvidenceKey;
  state: 'reviewed' | 'mapped' | 'none';
  stateLabel: string;
  sourceName?: string;
  sourceUrl?: string;
  period?: string;
  scope?: string;
  reviewedAt?: string;
  note?: string;
};

const safeUrl = (value?: string) => {
  if (!value) return undefined;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : undefined;
  } catch {
    return undefined;
  }
};

export const summarizeEvidence = (agency: Agency, field: AgencyFactEvidenceKey): EvidenceSummary => {
  const e: AgencyFactEvidence | undefined = agency.factEvidence?.[field];
  if (!e) return { field, state: 'none', stateLabel: '' };
  return {
    field,
    state: e.reviewed ? 'reviewed' : 'mapped',
    stateLabel: e.reviewed
      ? 'Review marker recorded (does not confirm current use)'
      : 'Source available, not reviewed',
    sourceName: e.sourceName,
    sourceUrl: safeUrl(e.sourceUrl),
    period: e.reportingPeriod,
    scope: e.geographicLevel ? `${e.geographicLevel}${e.geographicId ? ` ${e.geographicId}` : ''}` : undefined,
    reviewedAt: e.reviewedAt,
    note: e.note,
  };
};

/* ---------- Documented trade-in / buy-back offers (optional, never seeded) ---------- */

export type TradeInOfferKind = 'cash-buyback' | 'vendor-credit';

/** Reads an optional `documentedTradeInOffers` array if a record ever carries one. */
export const getDocumentedOffers = (agency: Agency): DocumentedTradeInOffer[] => {
  const raw: unknown = agency.documentedTradeInOffers;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((value): DocumentedTradeInOffer[] => {
    if (!value || typeof value !== 'object') return [];
    const o = value as Record<string, unknown>;
    if (typeof o.id !== 'string' || !o.id.trim() ||
        typeof o.provider !== 'string' || !o.provider.trim() ||
        (o.kind !== 'cash-buyback' && o.kind !== 'vendor-credit')) return [];
    const text = (key: string) => typeof o[key] === 'string' ? o[key].trim() || undefined : undefined;
    return [{
      id: o.id, provider: o.provider.trim(), kind: o.kind,
      eligibleDevice: text('eligibleDevice'), offerDate: text('offerDate'), expiryDate: text('expiryDate'),
      conditions: text('conditions'), sourceName: text('sourceName'),
      sourceUrl: safeUrl(text('sourceUrl')), currency: text('currency')?.toUpperCase(),
      perUnitValue: isNum(o.perUnitValue) && o.perUnitValue >= 0 ? o.perUnitValue : null,
      eligibleQuantity: isNum(o.eligibleQuantity) && Number.isSafeInteger(o.eligibleQuantity) && o.eligibleQuantity >= 0 ? o.eligibleQuantity : null,
    }];
  });
};

/** Total only when both a quoted per-unit value and an explicit eligible quantity exist. */
export const offerTotal = (o: DocumentedTradeInOffer): number | null =>
  isNum(o.perUnitValue) && isNum(o.eligibleQuantity) && o.perUnitValue >= 0 && Number.isSafeInteger(o.eligibleQuantity) && o.eligibleQuantity >= 0 &&
  Boolean(o.eligibleDevice?.trim() && o.currency?.match(/^[A-Z]{3}$/)) &&
  Number.isFinite(o.perUnitValue * o.eligibleQuantity)
    ? o.perUnitValue * o.eligibleQuantity
    : null;

export const offerValue = (value: number | null | undefined, currency?: string): string => {
  if (!isNum(value) || value < 0) return NOT_REPORTED;
  const amount = value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return currency && /^[A-Z]{3}$/.test(currency) ? `${currency} ${amount}` : `${amount} · currency not stated`;
};

export const offerKindLabel = (k: TradeInOfferKind) =>
  k === 'cash-buyback' ? 'Cash buy-back' : 'Vendor replacement credit';

export const TRADE_IN_CHECKLIST: string[] = [
  'Confirm exact model and software/hardware revision',
  'Confirm eligible quantity (not the whole fleet by default)',
  'Record unit condition and service history',
  'Check ownership, lease or grant-funding restrictions',
  'Inventory accessories (batteries, cables, cases)',
  'Confirm current service/warranty status',
  'Plan secure removal of patient data before release',
  'Confirm disposal and procurement rules with purchasing',
];
