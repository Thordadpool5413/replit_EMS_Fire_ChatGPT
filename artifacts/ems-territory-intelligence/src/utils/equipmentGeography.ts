import { canonicalizeAgencyCounty, normalizeCountyName } from './countyIdentity';
import type {Agency} from '../types';
import {equipmentPresence,matchesEquipmentFilter,type EquipmentMapFilter} from './equipmentPresence';
export type Coverage={total:number;zoll:number;competitor:number;mixed:number;unknown:number;matched:number};
export const emptyCoverage=():Coverage=>({total:0,zoll:0,competitor:0,mixed:0,unknown:0,matched:0});
const clean=normalizeCountyName;
export function buildEquipmentGeography(agencies:Agency[],states:Array<{code:string;state:string}>,counties:Array<{stateCode:string;countyFips:string;countyName:string}>,filter:EquipmentMapFilter){
 const byState:Record<string,Coverage>={},byCounty:Record<string,Coverage>={};const stateNames=new Map<string,string>(),fips=new Map<string,typeof counties[number]>(),names=new Map<string,typeof counties>();
 for(const st of states){byState[st.code]=emptyCoverage();stateNames.set(clean(st.code),st.code);stateNames.set(clean(st.state),st.code);}
 for(const county of counties){byCounty[county.countyFips]=emptyCoverage();fips.set(county.countyFips,county);const key=county.stateCode+':'+clean(county.countyName);names.set(key,[...(names.get(key)||[]),county]);}
 let unassignedState=0,unassignedCounty=0,conflictingCounty=0;
 const add=(summary:Coverage,a:Agency)=>{summary.total++;summary[equipmentPresence(a,filter.family)]++;if(matchesEquipmentFilter(a,filter))summary.matched++;};
 for(const raw of agencies){const a=canonicalizeAgencyCounty(raw);const code=stateNames.get(clean(a.stateCode))||stateNames.get(clean((a as Agency&{state?:string}).state));if(!code){unassignedState++;continue;}add(byState[code],a);
  const explicit=a.countyFips?fips.get(String(a.countyFips).padStart(5,'0')):undefined;
  if(a.countyFips&&(!explicit||explicit.stateCode!==code)){conflictingCounty++;unassignedCounty++;continue;}
  const candidates=names.get(code+':'+clean(a.county))||[];
  const county=explicit||(candidates.length===1?candidates[0]:undefined);
  if(county)add(byCounty[county.countyFips],a);else unassignedCounty++;
 }
 return {byState,byCounty,unassignedState,unassignedCounty,conflictingCounty};
}
export function equipmentCoverageColor(c:Coverage|undefined,filter:EquipmentMapFilter){
 if(!c?.total)return '#172a3d';
 if(!c.matched)return c.unknown===c.total?'#64748b':'#dce5ed';
 return filter.presence==='zoll'?'#0d9488':filter.presence==='competitor'?'#d97706':filter.presence==='mixed'?'#8b5cf6':'#64748b';
}
export const EQUIPMENT_COVERAGE_LEGEND='Teal: ZOLL match · Amber: competitor match · Purple: mixed match · Slate: unknown equipment · Pale: no selected match recorded · Dark: no loaded agency records';
