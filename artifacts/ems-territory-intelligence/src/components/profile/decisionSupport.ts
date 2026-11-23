import type { Agency, DocumentedTradeInOffer } from '../../types';
import { buildEquipmentLines, getDocumentedOffers, NOT_REPORTED, offerKindLabel, offerTotal, offerValue, reportedText, summarizeEvidence } from './equipmentInsights';

export type SignalKind = 'warranty' | 'contract' | 'replacement' | 'procurement' | 'grant';
export type RecordedSignal = {
  id: string; kind: SignalKind; title: string; date?: string;
  sourceName: string; sourceUrl: string; detail: string;
};
export type DeviceCheck = {
  eligibleQuantity: number | null;
  ownership: 'unknown' | 'owned' | 'leased' | 'restricted';
  condition: string; accessories: string;
};
export type ProfileResearch = {
  signals: RecordedSignal[]; offers: DocumentedTradeInOffer[];
  devices: Partial<Record<'monitor' | 'cpr' | 'vent', DeviceCheck>>;
};
export const emptyResearch = (): ProfileResearch => ({ signals: [], offers: [], devices: {} });
export const safeSourceUrl = (text: string): string | undefined => {
  try { const u = new URL(text); return /^https?:$/.test(u.protocol) ? u.href : undefined; } catch { return undefined; }
};
/** Strict calendar date, never rollover dates or locale-dependent parsing. */
export function calendarDate(text?: string): string | null {
  if (!text || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const time = Date.parse(`${text}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === text ? text : null;
}
const calendarToday = (now: Date) =>
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
export function dateState(date: string | undefined, now = new Date()): string {
  const day = calendarDate(date);
  if (!day) return date ? 'Invalid date — verify' : 'Date not recorded';
  const today = calendarToday(now);
  const delta = Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  return delta < 0 ? 'Past date — verify outcome' : delta === 0 ? 'Due today' : delta <= 90 ? `Within ${delta} ${delta === 1 ? 'day' : 'days'}` : 'Future date';
}
export function quoteState(offer: DocumentedTradeInOffer, now = new Date()): string {
  const expiry = calendarDate(offer.expiryDate);
  const issued = calendarDate(offer.offerDate);
  const today = calendarToday(now);
  if (offer.offerDate && !issued || offer.expiryDate && !expiry || issued && expiry && expiry < issued) return 'Invalid dates — verify';
  if (issued && issued > today) return 'Future-dated — not yet available';
  if (expiry && expiry < today) return 'Expired — request a new quote';
  if (!issued) return 'Issue date unknown — confirm availability';
  if (!expiry) return 'Expiry unknown — confirm validity';
  return expiry === today ? 'Expires today' : 'Within recorded dates — eligibility not listed';
}
export function preparationGaps(check?: DeviceCheck): string[] {
  return [
    !(Number.isSafeInteger(check?.eligibleQuantity) && (check?.eligibleQuantity ?? -1) >= 0) && 'Eligible quantity',
    (!check || check.ownership === 'unknown') && 'Ownership / restrictions',
    check && check.ownership !== 'owned' && check.ownership !== 'unknown' && 'Release permission',
    !check?.condition?.trim() && 'Condition / service history',
    !check?.accessories?.trim() && 'Accessories',
  ].filter((v): v is string => Boolean(v));
}
export type Recommendation = {
  id: string; title: string; evidence: string; confidence: 'Low' | 'Medium';
  rationale: string; nextAction: string; sourceName?: string; sourceUrl?: string; timing?: string;
};
export function buildRecommendations(agency: Agency, research: ProfileResearch, now = new Date()): Recommendation[] {
  const results: Recommendation[] = research.signals.map(s => ({
    id: s.id, title: s.title, evidence: s.detail || `${s.kind} signal recorded by user`,
    confidence: 'Medium', rationale: 'User-entered source citation.',
    sourceName: s.sourceName, sourceUrl: safeSourceUrl(s.sourceUrl),
    timing: s.date ? `${s.date} · ${dateState(s.date, now)}` : 'Date not recorded',
    nextAction: s.kind === 'grant' ? 'Confirm the published deadline, time zone, agency eligibility and allowable equipment before planning an application.'
      : s.kind === 'replacement' || s.kind === 'procurement' ? 'Read the notice, confirm agency scope and dates, then contact purchasing about the documented process.'
      : 'Confirm the covered devices, date and renewal/replacement process with the equipment lead.',
  }));
  const contract = agency.competitorContract;
  const maintenance = summarizeEvidence(agency, 'maintenanceContracts');
  const maintenanceRecord = agency.factEvidence?.maintenanceContracts;
  const hasMaintenanceSource = Boolean(reportedText(maintenance.sourceName) !== NOT_REPORTED &&
    maintenanceRecord?.sourceKind !== 'logic' &&
    (maintenance.sourceUrl || reportedText(maintenanceRecord?.sourceRecordId) !== NOT_REPORTED));
  const contractReference = reportedText(contract?.contractSourceDoc);
  const contractSource = contractReference === NOT_REPORTED ? undefined : contractReference;
  if (calendarDate(contract?.contractEndDate) && (contractSource || hasMaintenanceSource)) {
    results.push({
      id: 'record-contract', title: 'Review the recorded service-contract date',
      evidence: `${contract.vendor || 'Vendor not stated'} · recorded end ${contract.contractEndDate}`,
      confidence: contract.isVerifiedContract && contractSource ? 'Medium' : 'Low',
      rationale: 'A contract reference is recorded; review covered assets, renewal and current status.',
      sourceName: contractSource || maintenance.sourceName,
      sourceUrl: safeSourceUrl(contractSource || '') || maintenance.sourceUrl,
      timing: dateState(contract.contractEndDate, now),
      nextAction: 'Check the actual contract, covered devices and notice period with purchasing. A past date does not prove the agreement lapsed.',
    });
  }
  const fleet = agency.installedFleet;
  if (/^(expired|out of warranty)(?:\s|$)/i.test(fleet?.defibWarrantyStatus?.trim() || '') && hasMaintenanceSource) {
    results.push({
      id: 'record-warranty', title: 'Confirm recorded warranty coverage',
      evidence: `${fleet.defibBrand || 'Monitor fleet'} · ${fleet.defibWarrantyStatus}`,
      confidence: 'Medium', rationale: 'A maintenance source is attached; device-level coverage is listed separately.',
      sourceName: maintenance.sourceName, sourceUrl: maintenance.sourceUrl,
      nextAction: 'Confirm serial-level warranty coverage, extensions and current service arrangements; do not assume the devices require replacement.',
    });
  }
  if (Number.isFinite(fleet?.defibAgeYears) && fleet.defibAgeYears >= 0) {
    const source = summarizeEvidence(agency, 'defibrillatorBiomedicalFleet');
    results.push({
      id: 'record-age', title: 'Verify the monitor lifecycle',
      evidence: `Recorded monitor age: ${fleet.defibAgeYears} years · ${fleet.defibBrand || NOT_REPORTED}`,
      confidence: 'Low', rationale: 'Age is a discovery input, not evidence of failure, a funded project or replacement intent.',
      sourceName: source.sourceName, sourceUrl: source.sourceUrl,
      nextAction: 'Ask for acquisition dates, service history and the agency’s actual replacement plan.',
    });
  }
  return results;
}
export function buildMeetingBrief(agency: Agency, research: ProfileResearch, now = new Date()) {
  const equipment = buildEquipmentLines(agency);
  const recommendations = buildRecommendations(agency, research, now);
  const monitor = equipment.find(e => e.key === 'monitor')!;
  const cpr = equipment.find(e => e.key === 'cpr')!;
  const vent = equipment.find(e => e.key === 'vent')!;
  const software = equipment.filter(e => e.category === 'software');
  const documentedSignal = recommendations.find(r => r.id !== 'record-age');
  const questions = [
    `Can you confirm ${monitor.value === NOT_REPORTED ? 'the monitor models' : monitor.value}, current quantities and acquisition dates?`,
    `What is the current CPR and ventilator setup compared with these records: CPR ${cpr.value}; ventilator ${vent.value}? Which units carry them?`,
    `The software record lists ${software.map(e=>`${e.label}: ${e.value}`).join('; ')}. Which are currently used, and which systems handle ePCR and CAD separately?`,
    documentedSignal
      ? `What is the current status of “${documentedSignal.title}”, including its dates and purchasing requirements?`
      : `Do you have a documented replacement plan, warranty/service renewal or relevant funding deadline?`,
    `For any released ${monitor.value === NOT_REPORTED ? 'monitors' : monitor.value} devices, who owns them, which quantities are eligible, what is their condition, and which accessories and disposal restrictions apply?`,
  ];
  const lines = [
    `${agency.name} — equipment meeting brief`, `Prepared ${calendarToday(now)}`,
    '', 'Recorded equipment and software',
    ...equipment.map(e => {
      const sources = e.evidenceKeys.map(k => summarizeEvidence(agency, k)).filter(s => s.sourceName);
      const citation = sources.length
         ? `\nSource: ${sources.map(s=>`${s.sourceName} ${s.sourceUrl || ''} · period ${s.period || 'not stated'}`).join('; ')}`
        : '';
      return `${e.label}: ${e.value}${e.quantity ? ` · ${e.quantity}` : ''}${citation}`;
    }),
    '', 'Relevant signals and evidence',
    ...(recommendations.length ? recommendations.map(r => `${r.title}: ${r.evidence}. Confidence: ${r.confidence} — ${r.rationale}${r.timing ? ` ${r.timing}.` : ''}${r.sourceName || r.sourceUrl ? ` Source: ${r.sourceName || ''} ${r.sourceUrl || ''}` : ''}\nNext: ${r.nextAction}`) : ['No documented opportunity signals recorded.']),
    '', 'Buy-back records',
     ...(!getDocumentedOffers(agency).length && !research.offers.length ? ['No current quote recorded.'] : []),
    ...([...getDocumentedOffers(agency), ...research.offers].map(o => `${offerKindLabel(o.kind)} · ${o.provider} · ${o.eligibleDevice || 'Device not stated'} · ${quoteState(o, now)} · quoted total ${offerTotal(o) == null ? 'not calculated' : offerValue(offerTotal(o), o.currency)} · conditions: ${o.conditions || 'not stated'} · source: ${o.sourceName || 'not stated'} ${o.sourceUrl || ''}`)),
     ...equipment.filter(e=>e.category!=='software').map(e=>`${e.label}: eligibility ${preparationGaps(research.devices[e.key as 'monitor'|'cpr'|'vent']).join(', ') || 'details recorded'}`),
    '', 'Five discovery questions', ...questions.map((q, i) => `${i + 1}. ${q}`),
  ];
  return { equipment, software, recommendations, questions, text: lines.join('\n') };
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
const storageKey = (id: string) => {
  if (!id?.trim() || id.length > 300) throw new Error('A valid agency identity is required.');
  return `ems_equipment_research_v1:${encodeURIComponent(id)}`;
};
export function validateResearch(data: ProfileResearch): void {
  if (!data || !Array.isArray(data.signals) || !Array.isArray(data.offers) || !data.devices || typeof data.devices !== 'object' || Array.isArray(data.devices)) throw new Error('Invalid research record.');
  const optionalText = (value: unknown) => value == null || typeof value === 'string';
  for (const signal of data.signals) {
    if (!signal || typeof signal.id !== 'string' || !signal.id.trim() ||
        typeof signal.title !== 'string' || !signal.title.trim() ||
        typeof signal.sourceName !== 'string' || !signal.sourceName.trim() ||
        typeof signal.sourceUrl !== 'string' || !safeSourceUrl(signal.sourceUrl) ||
        typeof signal.detail !== 'string' || !optionalText(signal.date) ||
        !['warranty','contract','replacement','procurement','grant'].includes(signal.kind) ||
        signal.date && !calendarDate(signal.date)) throw new Error('Each signal needs a title, source name, valid source link and valid date if supplied.');
  }
  for (const [key, check] of Object.entries(data.devices)) {
    if (!['monitor','cpr','vent'].includes(key) || !check || !['unknown','owned','leased','restricted'].includes(check.ownership) ||
      check.eligibleQuantity != null && (!Number.isSafeInteger(check.eligibleQuantity) || check.eligibleQuantity < 0) ||
      typeof check.condition !== 'string' || typeof check.accessories !== 'string') throw new Error('Device checks require a whole non-negative eligible quantity or a blank quantity.');
  }
  for (const offer of data.offers) {
    if (!offer || typeof offer.id !== 'string' || !offer.id.trim() || typeof offer.provider !== 'string' || !offer.provider.trim() || !['cash-buyback','vendor-credit'].includes(offer.kind) ||
      typeof offer.eligibleDevice !== 'string' || !offer.eligibleDevice.trim() ||
      typeof offer.sourceName !== 'string' || !offer.sourceName.trim() || typeof offer.sourceUrl !== 'string' || !safeSourceUrl(offer.sourceUrl) ||
      ![offer.conditions, offer.offerDate, offer.expiryDate, offer.currency].every(optionalText) ||
      offer.perUnitValue != null && (!Number.isFinite(offer.perUnitValue) || offer.perUnitValue < 0) ||
      offer.eligibleQuantity != null && (!Number.isSafeInteger(offer.eligibleQuantity) || offer.eligibleQuantity < 0) ||
      offer.perUnitValue != null && offer.eligibleQuantity != null && !Number.isFinite(offer.perUnitValue * offer.eligibleQuantity) ||
      offer.currency && !/^[A-Z]{3}$/.test(offer.currency) ||
      offer.offerDate && !calendarDate(offer.offerDate) || offer.expiryDate && !calendarDate(offer.expiryDate) ||
      offer.offerDate && offer.expiryDate && offer.expiryDate < offer.offerDate) throw new Error('Check quote source, device, currency, quantities and dates.');
  }
  if (new Set(data.signals.map(s=>s.id)).size !== data.signals.length || new Set(data.offers.map(o=>o.id)).size !== data.offers.length) throw new Error('Duplicate record identifiers.');
}
export function loadResearch(id: string, storage?: StorageLike): { data: ProfileResearch; error?: string } {
  if (typeof window === 'undefined' && !storage) return { data: emptyResearch() };
  try {
    const raw = (storage || window.localStorage).getItem(storageKey(id));
    if (!raw) return { data: emptyResearch() };
    const data = JSON.parse(raw) as ProfileResearch;
    validateResearch(data);
    return { data };
  } catch { return { data: emptyResearch(), error: 'Saved equipment research could not be read. It has not been overwritten.' }; }
}
export function saveResearch(id: string, data: ProfileResearch, storage?: StorageLike): void {
  validateResearch(data);
  try { (storage || window.localStorage).setItem(storageKey(id), JSON.stringify(data)); }
  catch { throw new Error('Could not save research in this browser. Existing saved data was not replaced.'); }
}
