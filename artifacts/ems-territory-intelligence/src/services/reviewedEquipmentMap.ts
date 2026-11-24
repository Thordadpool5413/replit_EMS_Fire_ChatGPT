import type { Agency } from '../types';
import { shareableAgencies, sharedAgencyKey } from './sharedEvidence';
import type { ReviewedRadarResult, ReviewedEquipmentObservation } from './sharedOpportunityRadar';
import type { EquipmentFamily } from '../utils/equipmentPresence';

export const REVIEWED_MAP_SAMPLE_LIMIT=5;
export type ReviewedMapPresence='zoll'|'competitor'|'mixed'|'unknown'|'unavailable';
export type ReviewedMapAccount={
  agency:Agency;
  review?:ReviewedRadarResult;
  reason?:string;
  checkedAt?:string;
};
export type CountyReference={countyFips:string;countyName:string;stateCode:string};
export const REVIEWED_MAP_COLORS={
  zoll:'#008E83',competitor:'#F3A329',mixed:'#8064D8',unknown:'#A2AAB6',unavailable:'#CBD5E1',unchecked:'#EDF1F5',
} as const;
export const REVIEWED_MAP_LABELS:Record<ReviewedMapPresence,string>={
  zoll:'ZOLL observed',competitor:'Other maker observed',mixed:'ZOLL and other maker observed',unknown:'No eligible recognized observation',unavailable:'Review unavailable',
};
/** A directory row is eligible only when both account ID and source-native key are unambiguous. */
export function reviewedMapAccounts(agencies:Agency[]):Agency[]{
 const counts=new Map<string,number>();
 for(const a of agencies)counts.set(a.id,(counts.get(a.id)??0)+1);
 return shareableAgencies(agencies).filter(a=>counts.get(a.id)===1);
}
export function reviewedMapIdentity(a:Agency):string{
 return JSON.stringify([a.id,sharedAgencyKey(a),a.name,a.stateCode,a.registryIdentity?.countyFips??'',a.registryIdentity?.headquartersState??'',a.countyFips??'']);
}
/** Use source-native registry FIPS only. Never use county name guesses, city centroid or service-area fan-out. */
export function reviewedCountyFips(a:Agency,countyRefs:CountyReference[]):string|undefined{
 const fips=a.registryIdentity?.countyFips;
 if(!sharedAgencyKey(a)||!fips||!/^\d{5}$/.test(fips)||fips.endsWith('000'))return;
 if(a.registryIdentity?.headquartersState&&a.registryIdentity.headquartersState!==a.stateCode)return;
 if(a.countyFips&&a.countyFips!==fips)return;
 const refs=countyRefs.filter(c=>c.countyFips===fips);
 return refs.length===1&&refs[0].stateCode===a.stateCode?fips:undefined;
}
export function classifyReviewedEquipment(review:ReviewedRadarResult|undefined,family:EquipmentFamily):{presence:ReviewedMapPresence;observations:ReviewedEquipmentObservation[]}{
 if(!review?.complete)return {presence:'unavailable',observations:[]};
 const observations=review.equipment.filter(e=>family==='all'||family===e.family);
 const zoll=observations.some(o=>o.vendorId==='zoll'),other=observations.some(o=>o.vendorId!=='zoll');
 return {presence:zoll&&other?'mixed':zoll?'zoll':other?'competitor':'unknown',observations};
}
export type ReviewedCountyRollup={countyFips:string;countyName:string;sampled:number;zoll:number;competitor:number;mixed:number;unknown:number;unavailable:number;presence:ReviewedMapPresence};
export function buildReviewedEquipmentGeography(accounts:ReviewedMapAccount[],state:string,family:EquipmentFamily,countyRefs:CountyReference[]){
 const rows=accounts.filter(r=>r.agency.stateCode===state);
 const ids=new Map<string,number>(),keys=new Map<string,number>();
 for(const r of rows){const k=sharedAgencyKey(r.agency);ids.set(r.agency.id,(ids.get(r.agency.id)??0)+1);if(k)keys.set(k,(keys.get(k)??0)+1);}
 const byCounty:Record<string,ReviewedCountyRollup>={};
 const unique=rows.filter(r=>{const k=sharedAgencyKey(r.agency);return k&&keys.get(k)===1&&ids.get(r.agency.id)===1;});
 const totals={zoll:0,competitor:0,mixed:0,unknown:0,unavailable:0};
 let unassigned=0;
 const classified=unique.map(r=>{
  const result=classifyReviewedEquipment(r.review,family);
  totals[result.presence]++;
  const fips=reviewedCountyFips(r.agency,countyRefs);
  if(!fips)unassigned++;
  else{
   const county=byCounty[fips]??={countyFips:fips,countyName:countyRefs.find(c=>c.countyFips===fips)!.countyName,sampled:0,zoll:0,competitor:0,mixed:0,unknown:0,unavailable:0,presence:'unknown'};
   county.sampled++;county[result.presence]++;
   const z=county.zoll+county.mixed>0,o=county.competitor+county.mixed>0;
   county.presence=z&&o?'mixed':z?'zoll':o?'competitor':county.unknown?'unknown':'unavailable';
  }
  return {...r,...result,countyFips:fips};
 });
 return {byCounty,totals,unassigned,duplicateOrInvalid:rows.length-unique.length,sampled:unique.length,classified};
}
