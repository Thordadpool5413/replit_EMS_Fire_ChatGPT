import type {Agency, AgencyFactEvidenceKey} from '../types';
import {hasAgencyFactData} from '../data/agencyFactEvidence';
export type EquipmentPresence = 'all'|'zoll'|'competitor'|'mixed'|'unknown';
export type EquipmentFamily = 'all'|'monitors'|'cpr'|'ventilators'|'software';
export type EquipmentMapFilter = {presence:EquipmentPresence;family:EquipmentFamily};
export const DEFAULT_EQUIPMENT_FILTER:EquipmentMapFilter={presence:'all',family:'all'};
/** Recorded installed products only. Opportunity targets, grants and recommended bundles are excluded. */
export function equipmentPresence(agency:Agency,family:EquipmentFamily='all'):Exclude<EquipmentPresence,'all'> {
 const f=agency.installedFleet;
 const fields:Array<[EquipmentFamily,AgencyFactEvidenceKey,string|undefined]>=[
  ['monitors','defibrillatorBiomedicalFleet',f?.defibBrand],
  ['cpr','equipmentSuppliers',f?.mechanicalCPR],
  ['ventilators','equipmentSuppliers',f?.transportVentilator],
  ['software','epcrSystem',f?.epcrCadSoftware],
  ['software','communicationsSystems',f?.dispatchCadVendor],
  ['software','billingSoftware',f?.billingSoftware],
 ];
 let zoll=false,competitor=false;
 for(const [category,key,raw] of fields) {
  if(family!=='all'&&category!==family)continue;
  if(!raw||!hasAgencyFactData(agency,key))continue;
  const text=raw.trim();
  if (/not (reported|recorded|confirmed|deployed)|unknown|\bno zoll\b|consider|proposed|recommended|planning|target/i.test(text)) continue;
  if(/\b(zoll|autopulse|rescuenet)\b|\bz[ -]?vent\b|\bx series\b/i.test(text))zoll=true;
  if(/\b(stryker|physio[ -]?control|lifepak|philips|lucas|hamilton|weinmann|dräger|draeger|medtronic|mindray|schiller|nihon kohden|eso|imagetrend|digitech|ems management|ems billing services|optum|centralsquare|motorola|hexagon|tyler|traumasoft)\b/i.test(text))competitor=true;
 }
 return zoll&&competitor?'mixed':zoll?'zoll':competitor?'competitor':'unknown';
}
export function matchesEquipmentFilter(agency:Agency,filter:EquipmentMapFilter) {
 if(filter.presence==='all')return true;
 const presence=equipmentPresence(agency,filter.family);
 return filter.presence==='zoll'?presence==='zoll'||presence==='mixed':filter.presence==='competitor'?presence==='competitor'||presence==='mixed':presence===filter.presence;
}
export function parseEquipmentFilter(value:unknown):EquipmentMapFilter {
 const v=value as Partial<EquipmentMapFilter>|null;
 return {presence:['all','zoll','competitor','mixed','unknown'].includes(v?.presence||'')?v!.presence!:'all',family:['all','monitors','cpr','ventilators','software'].includes(v?.family||'')?v!.family!:'all'};
}
