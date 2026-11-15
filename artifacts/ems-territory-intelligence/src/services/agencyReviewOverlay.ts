import type { Agency } from '../types';
import { effectiveFactValue, type FactReviewEntry } from './factReviewStore';
import { calculateScore, calculatePulseIqContributions } from '../utils/pulseIqScoring';

export const REVIEW_FIELDS: Record<string, { path: string; numeric?: boolean; integer?: boolean }> = {
  'monitor.model': {path:'installedFleet.defibBrand'}, 'monitor.quantity': {path:'installedFleet.defibUnitsCount',numeric:true,integer:true},
  'monitor.age': {path:'installedFleet.defibAgeYears',numeric:true}, 'monitor.warranty': {path:'installedFleet.defibWarrantyStatus'},
  'cpr.model': {path:'installedFleet.mechanicalCPR'}, 'cpr.quantity': {path:'installedFleet.cprUnitsCount',numeric:true,integer:true},
  'ventilator.model': {path:'installedFleet.transportVentilator'}, 'ventilator.quantity': {path:'installedFleet.ventUnitsCount',numeric:true,integer:true},
  'software.epcr': {path:'installedFleet.epcrCadSoftware'}, 'software.cad': {path:'installedFleet.dispatchCadVendor'},
  'software.billing': {path:'installedFleet.billingSoftware'}, 'contract.vendor': {path:'competitorContract.vendor'},
  'contract.end': {path:'competitorContract.contractEndDate'}, 'identity.address': {path:'address'},
  'identity.phone': {path:'headquartersPhone'}, 'operations.calls': {path:'annualCallVolume',numeric:true,integer:true},
  'operations.transports': {path:'annual911Transports',numeric:true,integer:true}, 'operations.stations': {path:'stationsCount',numeric:true,integer:true}
};
export function validateCorrection(fieldId: string, value: string): void {
  const field = REVIEW_FIELDS[fieldId];
  if (!field) throw new Error('Unsupported fact.');
  if (field.numeric && (!value.trim() || !Number.isFinite(Number(value)) || Number(value) < 0 || (field.integer && !Number.isInteger(Number(value)))))
    throw new Error('Enter a non-negative number' + (field.integer ? ' without fractions.' : '.'));
  if (fieldId === 'contract.end' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Use a contract end date in YYYY-MM-DD format.');
}
export function applyAgencyReviews(agency: Agency, entries: FactReviewEntry[]): Agency {
  if (!entries.some(e => e.action === 'correct')) return agency;
  const result = { ...agency, installedFleet: { ...agency.installedFleet }, competitorContract: { ...agency.competitorContract }, _reviewOriginalValues: {} as Record<string,string> } as Agency;
  for (const [id, field] of Object.entries(REVIEW_FIELDS)) {
    const parts = field.path.split('.');
    const value = parts.reduce((o: any, k) => o?.[k], agency);
    const original = agency._reviewOriginalValues?.[id] ?? (value == null || value === '' ? 'Not reported' : String(value));
    const corrected = effectiveFactValue(original, entries.filter(e => e.fieldId === id));
    if (corrected === original) continue;
    try { validateCorrection(id, corrected); } catch { continue; }
    result._reviewOriginalValues![id] = original;
    const target: any = parts.length === 2 ? (result as any)[parts[0]] : result;
    target[parts.at(-1)!] = field.numeric ? Number(corrected) : corrected;
  }
  const score = calculateScore(result);
  const priorityTier = score >= 88 ? 'Critical Opportunity' : score >= 78 ? 'High Value' : score >= 65 ? 'Mid-Term Pipeline' : 'Maintained Account';
  result.zollOpportunity = { ...result.zollOpportunity, pulseIqScore: score, priorityTier, scoreBreakdown: { ...result.zollOpportunity.scoreBreakdown, ...calculatePulseIqContributions(result) } };
  return result;
}

/** Prevent a resolved UI value from replacing its imported source during caching or upload. */
export function stripAgencyReviewOverlay(agency: Agency): Agency {
  if (!agency._reviewOriginalValues) return agency;
  const result = { ...agency, installedFleet: { ...agency.installedFleet }, competitorContract: { ...agency.competitorContract } } as Agency;
  for (const [id, original] of Object.entries(agency._reviewOriginalValues)) {
    const field = REVIEW_FIELDS[id]; if (!field) continue;
    const parts = field.path.split('.');
    const target: any = parts.length === 2 ? (result as any)[parts[0]] : result;
    if (original === 'Not reported') delete target[parts.at(-1)!];
    else target[parts.at(-1)!] = field.numeric ? Number(original) : original;
  }
  delete result._reviewOriginalValues;
  return result;
}
