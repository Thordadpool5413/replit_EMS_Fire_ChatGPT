import {equipmentObservationFacts,definitionFor} from '../services/documentedIntelligence';
import { matchesAgencyCounty } from './countyIdentity';
import type {Agency, AgencyFactEvidenceKey} from '../types';
import {hasAgencyFactData,getAgencyFactEvidenceStatus} from '../data/agencyFactEvidence';
export type EquipmentPresence = 'all'|'zoll'|'competitor'|'mixed'|'unknown';
export type EquipmentFamily = 'all'|'monitors'|'cpr'|'ventilators'|'software';
export type EquipmentEvidenceMode='recorded'|'documented';
export type EquipmentMapFilter = {presence:EquipmentPresence;family:EquipmentFamily;vendor?:string;evidence?:EquipmentEvidenceMode};
export const DEFAULT_EQUIPMENT_FILTER:EquipmentMapFilter={presence:'all',family:'all'};
export function isEquipmentFilterActive(filter:EquipmentMapFilter):boolean { return filter.presence!=='all'||filter.family!=='all'||filter.evidence==='documented'||Boolean(filter.vendor&&filter.vendor!=='all'); }
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
type EquipmentField={family:Exclude<EquipmentFamily,'all'>;key:AgencyFactEvidenceKey;value:string|undefined};
function equipmentFields(agency:Agency):EquipmentField[] {
 const f=agency.installedFleet;
 const legacy=agency.fleet;
 return [
  {family:'monitors',key:'defibrillatorBiomedicalFleet',value:f?.defibBrand},
  {family:'cpr',key:'equipmentSuppliers',value:f?.mechanicalCPR},
  {family:'ventilators',key:'equipmentSuppliers',value:f?.transportVentilator},
  {family:'software',key:'epcrSystem',value:f?.epcrCadSoftware},
  {family:'software',key:'communicationsSystems',value:f?.dispatchCadVendor},
  {family:'software',key:'billingSoftware',value:f?.billingSoftware},
  {family:'monitors',key:'defibrillatorBiomedicalFleet',value:legacy?.currentDefibVendor},
  {family:'cpr',key:'equipmentSuppliers',value:legacy?.currentCprDevice},
  {family:'ventilators',key:'equipmentSuppliers',value:legacy?.currentVentilator},
  {family:'software',key:'epcrSystem',value:legacy?.currentEpcrVendor},
  {family:'software',key:'communicationsSystems',value:legacy?.currentCadVendor},
 ];
}
const NON_EQUIPMENT_ENTRIES=/^(?:not (?:reported|recorded|confirmed|deployed|available|specified)|unknown|n\/?a|none reported|no data)$/i;
const NON_INSTALLED_ENTRIES=/not (?:reported|recorded|confirmed|deployed)|unknown|\bno zoll\b|consider|proposed|recommended|planning|target/i;
export type RecordedEquipmentEntry={
 family:Exclude<EquipmentFamily,'all'>;
 label:string;
 value:string;
 sourceStatus:string;
 evidenceKeys:AgencyFactEvidenceKey[];
 manufacturerIds:string[];
 manufacturerNames:string[];
};
const FAMILY_LABELS:Record<Exclude<EquipmentFamily,'all'>,string>={
 monitors:'Monitor / defibrillator',
 cpr:'Mechanical CPR',
 ventilators:'Transport ventilator',
 software:'ePCR / CAD / billing',
};
/** Returns the substantive values even when manufacturer recognition is unavailable. */
export function getRecordedEquipmentEntries(agency:Agency,family:EquipmentFamily='all',evidence:EquipmentEvidenceMode='recorded'):RecordedEquipmentEntry[] {
 if(evidence==='documented'){
  const result=new Map<string,RecordedEquipmentEntry>();
  for(const fact of equipmentObservationFacts(agency)){
   const category=definitionFor(fact.intelligence.kind)?.family;if(!category||(family!=='all'&&family!==category))continue;
   const key=category+':'+fact.value.trim().toLowerCase();const vendors=EQUIPMENT_VENDORS.filter(v=>v.pattern.test(fact.value));
   result.set(key,{family:category,label:FAMILY_LABELS[category],value:fact.value,sourceStatus:'documented-observation',evidenceKeys:[fact.fieldKey],manufacturerIds:vendors.map(v=>v.id),manufacturerNames:vendors.map(v=>v.name)});
  }
  return [...result.values()];
 }
 const entries=new Map<string,RecordedEquipmentEntry>();
 const statusRank:Record<string,number>={'source-required':0,'source-mapped':1,'source-reviewed':2};
 for(const {family:category,key,value} of equipmentFields(agency)){
  if(!value||!hasAgencyFactData(agency,key)||(family!=='all'&&category!==family))continue;
  const text=value.trim();
  if(NON_EQUIPMENT_ENTRIES.test(text)||NON_INSTALLED_ENTRIES.test(text))continue;
  const identity=category+':'+text.toLowerCase();
  const matchedManufacturers=EQUIPMENT_VENDORS.filter((vendor)=>vendor.pattern.test(text));
  const sourceStatus=getAgencyFactEvidenceStatus(agency,key);
  const existing=entries.get(identity);
  if(existing){
   if(!existing.evidenceKeys.includes(key))existing.evidenceKeys.push(key);
   for(const vendor of matchedManufacturers){
    if(!existing.manufacturerIds.includes(vendor.id))existing.manufacturerIds.push(vendor.id);
    if(!existing.manufacturerNames.includes(vendor.name))existing.manufacturerNames.push(vendor.name);
   }
   if((statusRank[sourceStatus]||0)>(statusRank[existing.sourceStatus]||0))existing.sourceStatus=sourceStatus;
  }else{
   entries.set(identity,{
    family:category,
    label:FAMILY_LABELS[category],
    value:text,
    sourceStatus,
    evidenceKeys:[key],
    manufacturerIds:matchedManufacturers.map((vendor)=>vendor.id),
    manufacturerNames:matchedManufacturers.map((vendor)=>vendor.name),
   });
  }
 }
 return [...entries.values()];
}
/** True when a current equipment field contains a substantive entry, whether or not its maker is recognized. */
export function hasRecordedEquipmentValue(agency:Agency,family:EquipmentFamily='all'):boolean {
 return getRecordedEquipmentEntries(agency,family).length>0;
}
/** Only installed-product fields participate; sales targets and bundles never do. */
export function getRecordedVendorMatches(agency:Agency,family:EquipmentFamily='all',evidence:EquipmentEvidenceMode='recorded'):RecordedVendorMatch[] {
 if(evidence==='documented')return getRecordedEquipmentEntries(agency,family,evidence).flatMap(entry=>entry.manufacturerIds.map((vendor,i)=>({vendor,name:entry.manufacturerNames[i],family:entry.family,product:entry.value,sourceStatus:entry.sourceStatus})));
 const matches:RecordedVendorMatch[]=[];
 const seen=new Set<string>();
 for(const {family:category,key,value:raw} of equipmentFields(agency)) {
  if(family!=='all'&&category!==family)continue;
  if(!raw||!hasAgencyFactData(agency,key))continue;
  const text=raw.trim();
  if (NON_INSTALLED_ENTRIES.test(text)) continue;
  for(const vendor of EQUIPMENT_VENDORS) if(vendor.pattern.test(text)) {
   const matchKey=category+':'+vendor.id+':'+text.toLowerCase();
   if(seen.has(matchKey))continue;
   seen.add(matchKey);
   matches.push({vendor:vendor.id,name:vendor.name,family:category,product:text,sourceStatus:getAgencyFactEvidenceStatus(agency,key)});
  }
 }
 return matches;
}
export function equipmentPresence(agency:Agency,family:EquipmentFamily='all',evidence:EquipmentEvidenceMode='recorded'):Exclude<EquipmentPresence,'all'> {
 const matches=getRecordedVendorMatches(agency,family,evidence);
 const zoll=matches.some(m=>m.vendor==='zoll'),competitor=matches.some(m=>m.vendor!=='zoll');
 return zoll&&competitor?'mixed':zoll?'zoll':competitor?'competitor':'unknown';
}

export function matchesEquipmentFilter(agency:Agency,filter:EquipmentMapFilter) {
 if(filter.vendor&&filter.vendor!=='all'&&!getRecordedVendorMatches(agency,filter.family,filter.evidence).some(m=>m.vendor===filter.vendor))return false;
 if(filter.presence==='all')return true;
 const presence=equipmentPresence(agency,filter.family,filter.evidence);
 return filter.presence==='zoll'?presence==='zoll'||presence==='mixed':filter.presence==='competitor'?presence==='competitor'||presence==='mixed':presence===filter.presence;
}
export function parseEquipmentFilter(value:unknown):EquipmentMapFilter {
 const v=value as Partial<EquipmentMapFilter>|null;
 const vendor=(v?.presence==='competitor'||v?.presence==='mixed')&&EQUIPMENT_VENDORS.some(item=>item.id===v?.vendor&&item.id!=='zoll')?v!.vendor:undefined;
 return {...(vendor?{vendor}:{}),...(v?.evidence==='documented'?{evidence:'documented' as const}:{}),presence:['all','zoll','competitor','mixed','unknown'].includes(v?.presence||'')?v!.presence!:'all',family:['all','monitors','cpr','ventilators','software'].includes(v?.family||'')?v!.family!:'all'};
}

/** Colors encode recorded equipment presence, never clinical performance or evidence quality. */
export const EQUIPMENT_MAP_STYLES = {
 zoll:{label:'ZOLL recorded',background:'#12B8A6',glyphColor:'#072C2A',glyph:'Z'},
 competitor:{label:'Competitor recorded',background:'#F59E0B',glyphColor:'#362000',glyph:'C'},
 mixed:{label:'ZOLL + competitor',background:'#A78BFA',glyphColor:'#251541',glyph:'M'},
 unknown:{label:'No recognized maker',background:'#718096',glyphColor:'#FFFFFF',glyph:'?'},
} as const;
export function equipmentMapStyle(agency:Agency,family:EquipmentFamily='all',evidence:EquipmentEvidenceMode='recorded') {
 return EQUIPMENT_MAP_STYLES[equipmentPresence(agency,family,evidence)];
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
