import type {Agency} from '../types';
import {parseRegistryStreet,isPhysicalStreet,addressText} from './providerLocationContract';
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
 const a=parseRegistryStreet(f.address,f.city,f.stateCode,f.postalCode);
 if(!a||!a.zip||!isPhysicalStreet(a.street))return undefined;
 return 'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(addressText(a));
}
const states=new Set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VA VT WA WI WV WY'.split(' '));
const textOrNull=(v:unknown,max=255)=>v===null||typeof v==='string'&&!!v.trim()&&v.length<=max&&!/[\x00-\x1f\x7f]/.test(v);
function trustedFacilitySource(f:Facility){
 try{
  const u=new URL(f.sourceUrl);
  if(u.protocol!=='https:'||u.username||u.password||u.port)return false;
  if(f.source==='USFA NFDR')return u.href==='https://apps.usfa.fema.gov/registry/download';
  return u.hostname==='services5.arcgis.com'&&u.pathname.endsWith('/1/query')&&u.searchParams.get('where')==="neris_id='"+f.sourceRecordId+"'";
 }catch{return false;}
}
/** Untrusted HTTP response: reject mismatched parent, malformed/duplicate station IDs and unsafe links. */
export function validateFacilityResult(value:unknown,parent:FacilityParent):FacilityResult{
 const d=value as FacilityResult;
 if(!d||d.parent?.source!==parent.source||d.parent?.identifier!==parent.identifier||d.parent?.stateCode!==parent.stateCode||!Array.isArray(d.facilities)||d.facilities.length>1000||!Number.isSafeInteger(d.withheld)||d.withheld<0||!(d.reportedStationCount===null||Number.isSafeInteger(d.reportedStationCount)&&d.reportedStationCount>=0)||typeof d.retrievedAt!=='string'||!Number.isFinite(Date.parse(d.retrievedAt))||!textOrNull(d.warning,2000))throw Error('Unexpected facility response.');
 const seen=new Set<string>();
 for(const f of d.facilities){
  if(!f||f.source!==parent.source||!states.has(f.stateCode)||f.endUserValidationRequired!==true||!textOrNull(f.name)||!textOrNull(f.address,520)||!textOrNull(f.city)||!textOrNull(f.postalCode,10)||!textOrNull(f.exportDate,40)||!trustedFacilitySource(f))throw Error('Invalid facility row.');
  if(f.source==='NERIS'){
   const id=f.sourceRecordId;
   if(typeof id!=='string'||!/^[-A-Z0-9]{1,14}$/.test(id)||id===parent.identifier||seen.has(id))throw Error('Ambiguous station identity.');
   seen.add(id);
  }else if(f.sourceRecordId!==null||f.coordinates!==null)throw Error('Unexpected USFA station identity or coordinates.');
  const c=f.coordinates;
  if(c!==null&&(!c||!Number.isFinite(c.latitude)||!Number.isFinite(c.longitude)||Math.abs(c.latitude)>90||Math.abs(c.longitude)>180||(c.latitude===0&&c.longitude===0)))throw Error('Invalid source coordinates.');
 }
 return d;
}
export function facilityCoverage(d:FacilityResult){
 const rows=d.facilities;
 return {rows:rows.length,withStreet:rows.filter(f=>!!facilityDirections(f)).length,withPoint:rows.filter(f=>!!f.coordinates).length,crossState:rows.filter(f=>f.stateCode!==d.parent.stateCode).length,missingNativeId:rows.filter(f=>!f.sourceRecordId).length,reported:d.reportedStationCount,partial:!!d.warning||d.withheld>0,countMismatch:d.reportedStationCount!==null&&d.reportedStationCount!==rows.length};
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
