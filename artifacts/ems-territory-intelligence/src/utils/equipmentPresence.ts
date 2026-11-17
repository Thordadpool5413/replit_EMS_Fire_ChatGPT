import { matchesAgencyCounty } from './countyIdentity';
import type {Agency, AgencyFactEvidenceKey} from '../types';
import {hasAgencyFactData,getAgencyFactEvidenceStatus} from '../data/agencyFactEvidence';
export type EquipmentPresence = 'all'|'zoll'|'competitor'|'mixed'|'unknown';
export type EquipmentFamily = 'all'|'monitors'|'cpr'|'ventilators'|'software';
export type EquipmentMapFilter = {presence:EquipmentPresence;family:EquipmentFamily;vendor?:string};
export const DEFAULT_EQUIPMENT_FILTER:EquipmentMapFilter={presence:'all',family:'all'};
// Names describe recorded brands, not a claim about current corporate ownership.
export const EQUIPMENT_VENDORS = [
 {id:'zoll',name:'ZOLL',pattern:/\b(zoll|autopulse|rescuenet|emscharts)\b|\bz[ -]?vent\b|\b[rx] series\b/i},
 {id:'stryker',name:'Stryker / Physio-Control',pattern:/\b(stryker|physio[ -]?control|lifepak|lucas|heartsine|lifenet|code-stat)\b/i},
 {id:'philips',name:'Philips',pattern:/\bphilips\b/i},
 {id:'hamilton',name:'Hamilton Medical',pattern:/\bhamilton\b/i},
 {id:'weinmann',name:'WEINMANN',pattern:/\bweinmann\b/i},
 {id:'draeger',name:'Dräger',pattern:/\b(dr[aä]eger|dräger)\b/i},
 {id:'medtronic',name:'Medtronic',pattern:/\bmedtronic\b/i},
 {id:'mindray',name:'Mindray',pattern:/\bmindray\b/i},
 {id:'schiller',name:'SCHILLER',pattern:/\bschiller\b/i},
 {id:'nihon-kohden',name:'Nihon Kohden',pattern:/\bnihon kohden\b/i},
 {id:'eso',name:'ESO',pattern:/\beso\b/i},
 {id:'imagetrend',name:'ImageTrend',pattern:/\bimagetrend\b/i},
 {id:'digitech',name:'Digitech',pattern:/\bdigitech\b/i},
 {id:'optum',name:'Optum',pattern:/\boptum\b/i},
 {id:'centralsquare',name:'CentralSquare',pattern:/\bcentralsquare\b/i},
 {id:'motorola',name:'Motorola Solutions',pattern:/\bmotorola\b/i},
 {id:'hexagon',name:'Hexagon',pattern:/\bhexagon\b/i},
 {id:'tyler',name:'Tyler Technologies',pattern:/\btyler\b/i},
 {id:'traumasoft',name:'Traumasoft',pattern:/\btraumasoft\b/i},
] as const;
export type RecordedVendorMatch={vendor:string;name:string;family:EquipmentFamily;product:string;sourceStatus:string};
/** Only installed-product fields participate; sales targets and bundles never do. */
export function getRecordedVendorMatches(agency:Agency,family:EquipmentFamily='all'):RecordedVendorMatch[] {
 const f=agency.installedFleet;
 const legacy=agency.fleet;
 const fields:Array<[EquipmentFamily,AgencyFactEvidenceKey,string|undefined]>=[
  ['monitors','defibrillatorBiomedicalFleet',f?.defibBrand],
  ['cpr','equipmentSuppliers',f?.mechanicalCPR],
  ['ventilators','equipmentSuppliers',f?.transportVentilator],
  ['software','epcrSystem',f?.epcrCadSoftware],
  ['software','communicationsSystems',f?.dispatchCadVendor],
  ['software','billingSoftware',f?.billingSoftware],
  ['monitors','defibrillatorBiomedicalFleet',legacy?.currentDefibVendor],
  ['cpr','equipmentSuppliers',legacy?.currentCprDevice],
  ['ventilators','equipmentSuppliers',legacy?.currentVentilator],
  ['software','epcrSystem',legacy?.currentEpcrVendor],
  ['software','communicationsSystems',legacy?.currentCadVendor],
 ];
 const matches:RecordedVendorMatch[]=[];
 const seen=new Set<string>();
 for(const [category,key,raw] of fields) {
  if(family!=='all'&&category!==family)continue;
  if(!raw||!hasAgencyFactData(agency,key))continue;
  const text=raw.trim();
  if (/not (reported|recorded|confirmed|deployed)|unknown|\bno zoll\b|consider|proposed|recommended|planning|target/i.test(text)) continue;
  for(const vendor of EQUIPMENT_VENDORS) if(vendor.pattern.test(text)) {
   const matchKey=category+':'+vendor.id+':'+text.toLowerCase();
   if(seen.has(matchKey))continue;
   seen.add(matchKey);
   matches.push({vendor:vendor.id,name:vendor.name,family:category,product:text,sourceStatus:getAgencyFactEvidenceStatus(agency,key)});
  }
 }
 return matches;
}
export function equipmentPresence(agency:Agency,family:EquipmentFamily='all'):Exclude<EquipmentPresence,'all'> {
 const matches=getRecordedVendorMatches(agency,family);
 const zoll=matches.some(m=>m.vendor==='zoll'),competitor=matches.some(m=>m.vendor!=='zoll');
 return zoll&&competitor?'mixed':zoll?'zoll':competitor?'competitor':'unknown';
}

export function matchesEquipmentFilter(agency:Agency,filter:EquipmentMapFilter) {
 if(filter.vendor&&filter.vendor!=='all'&&!getRecordedVendorMatches(agency,filter.family).some(m=>m.vendor===filter.vendor))return false;
 if(filter.presence==='all')return true;
 const presence=equipmentPresence(agency,filter.family);
 return filter.presence==='zoll'?presence==='zoll'||presence==='mixed':filter.presence==='competitor'?presence==='competitor'||presence==='mixed':presence===filter.presence;
}
export function parseEquipmentFilter(value:unknown):EquipmentMapFilter {
 const v=value as Partial<EquipmentMapFilter>|null;
 const vendor=(v?.presence==='competitor'||v?.presence==='mixed')&&EQUIPMENT_VENDORS.some(item=>item.id===v?.vendor&&item.id!=='zoll')?v!.vendor:undefined;
 return {...(vendor?{vendor}:{}),presence:['all','zoll','competitor','mixed','unknown'].includes(v?.presence||'')?v!.presence!:'all',family:['all','monitors','cpr','ventilators','software'].includes(v?.family||'')?v!.family!:'all'};
}

/** Colors encode recorded equipment presence, never clinical performance or evidence quality. */
export const EQUIPMENT_MAP_STYLES = {
 zoll:{label:'ZOLL recorded',background:'#087f8c',glyph:'Z'},
 competitor:{label:'Competitor recorded',background:'#b45309',glyph:'C'},
 mixed:{label:'ZOLL + competitor',background:'#7252ad',glyph:'M'},
 unknown:{label:'Unknown equipment',background:'#526277',glyph:'?'},
} as const;
export function equipmentMapStyle(agency:Agency,family:EquipmentFamily='all') {
 return EQUIPMENT_MAP_STYLES[equipmentPresence(agency,family)];
}

export function equipmentGeographyScope(agencies:Agency[],scope:{state?:string;county?:string;city?:string;category?:string}) {
 const normalized=(value:string='')=>value.toLowerCase().replace(/\s+(county|parish|borough|census area|municipality)$/i,'').trim();
 return agencies.filter(a=>{
  if(scope.state&&scope.state!=='all'&&(a.stateCode||'').toLowerCase()!==scope.state.toLowerCase())return false;
  if(scope.county&&scope.county!=='all'&&!matchesAgencyCounty(a,scope.county))return false;
  if(scope.city&&scope.city!=='all'&&normalized(a.city)!==normalized(scope.city))return false;
  const fire=a.providerCategory==='FIRE'||/fire/i.test(a.agencyType||'');
  return scope.category==='fire'?fire:scope.category==='ems'?!fire:true;
 });
}
