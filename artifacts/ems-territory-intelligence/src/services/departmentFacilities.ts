import type {Agency} from '../types';
import {canCreateRegistryAccount,registryIdentityKey} from './registryAccountLink';
export type FacilityParent={source:'USFA NFDR'|'NERIS';stateCode:string;identifier:string};
export type Facility={source:FacilityParent['source'];sourceRecordId:string|null;name:string|null;address:string|null;city:string|null;stateCode:string;postalCode:string|null;coordinates:{latitude:number;longitude:number}|null;sourceUrl:string;exportDate:string|null;endUserValidationRequired:true};
export type FacilityResult={parent:FacilityParent;facilities:Facility[];withheld:number;reportedStationCount:number|null;retrievedAt:string;warning:string|null};
export function facilityParents(agency:Agency):FacilityParent[]{
 const out:FacilityParent[]=[];
 const add=(source:FacilityParent['source'],identifier:string,stateCode:string)=>{
  const id=identifier.trim().toUpperCase();
  if(stateCode!==agency.stateCode||!/^[-A-Z0-9.]{1,80}$/.test(id)||/^LOCATION-|^[A-Z]{2}-(?:FD|EMS)-\d{5}/.test(id))return;
  if(source==='NERIS'&&!/^[-A-Z0-9]{1,14}$/.test(id))return;
  if(!out.some(p=>p.source===source&&p.identifier===id))out.push({source,stateCode,identifier:id});
 };
 const direct=agency.registryIdentity;
 if(direct&&canCreateRegistryAccount(direct)&&registryIdentityKey(direct)&&(direct.sourceName==='USFA NFDR'||direct.sourceName==='NERIS'))add(direct.sourceName,direct.identifier,direct.stateCode);
 for(const s of agency.sourceRecordAssociations??[]){
  if(s.decision!=='confirmed'||(s.sourceName!=='USFA NFDR'&&s.sourceName!=='NERIS'))continue;
  const fields=s.sourceFields;
  if(!fields||fields.stateCode!==agency.stateCode)continue;
  try{
   const url=new URL(s.sourceUrl);
   if(url.protocol!=='https:'||url.username||url.password||!(s.sourceName==='NERIS'?['services5.arcgis.com','www.usfa.fema.gov']:['apps.usfa.fema.gov']).includes(url.hostname))continue;
   if(s.sourceName==='NERIS'&&fields.nerisId===s.sourceRecordId)add(s.sourceName,s.sourceRecordId,agency.stateCode);
   if(s.sourceName==='USFA NFDR'&&typeof fields.fdid==='string'&&s.sourceRecordId===agency.stateCode+':'+fields.fdid)add(s.sourceName,fields.fdid,agency.stateCode);
  }catch{continue;}
 }
 // Multiple IDs in one source are a relationship conflict, not a union of stations.
 return out.filter(p=>out.filter(other=>other.source===p.source).length===1);
}
export function facilityDirections(f:Facility):string|undefined{
 // Use source-reported street addresses, not unvalidated station geometry, for directions.
 if(!f.address||!f.city||!f.postalCode||!/^\d/.test(f.address)||/\b(?:P\.?\s*O\.?\s*BOX|POST OFFICE BOX|PMB)\b/i.test(f.address)||!/^\d{5}(?:-\d{4})?$/.test(f.postalCode))return undefined;
 return 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent([f.address,f.city,f.stateCode,f.postalCode].join(', '));
}

/** Literal map bounds avoid relying on a global Google Maps constructor. */
export function stationMapBounds(points:readonly {lat:number;lng:number}[]){
 if(!points.length)return undefined;
 let south=90,north=-90,west=180,east=-180;
 for(const p of points){
  if(!Number.isFinite(p.lat)||!Number.isFinite(p.lng)||Math.abs(p.lat)>90||Math.abs(p.lng)>180)return undefined;
  south=Math.min(south,p.lat);north=Math.max(north,p.lat);west=Math.min(west,p.lng);east=Math.max(east,p.lng);
 }
 return {south,west,north,east};
}
