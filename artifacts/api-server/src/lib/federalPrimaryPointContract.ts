/** Native physical-address evidence. Historical facilities do not establish current headquarters. */
export type FederalPointMethod='usgs-structure-address'|'hifld-ems-address'|'hifld-fire-address';
export type FederalPrimaryPoint={objectId:number;nativeId:string;sourceSha256:string;sourceFile:string;sourceInventorySha256:string;sourceUrl:string;sourceDate:string|null;sourceTimestamp:number|null;collectionDate:'2026-11-26';countyFips:string;precision:'structure-centroid'|'entrance-or-egress'|'on-entity'|'blockface';addressRole:'source-address-location';featureCode?:number;pointLocationType?:number;sourceFeatureId?:unknown;sourceDatasetId?:unknown;sourceOriginator?:unknown;sourceDescription?:unknown;geoPrecision?:'ONENTITY'|'BLOCKFACE';sourceCountyFips?:string;contactDate?:string|null;contactTimestamp?:number|null;historicalFacilityEvidence?:true};
export const FEDERAL_POINT_SOURCES={
 'usgs-structure-address':{url:'https://carto-wfs.nationalmap.gov/arcgis/rest/services/structures/MapServer/0',label:'USGS National Map Structures',inventory:'c0e84211d138249aa7b6064ecfe1ad72dcd1a35b6024d53c823aec852b5a7cd1'},
 'hifld-ems-address':{url:'https://services.arcgis.com/XG15cJAlne2vxtgt/ArcGIS/rest/services/Critical_Infrastructure_Map_Service/FeatureServer/14',label:'Historical HIFLD EMS facility',inventory:'ef97834e61cbb678e88fa8cba35798a6fcda475055dc27308abd2eb4f8715058'},
 'hifld-fire-address':{url:'https://services.arcgis.com/XG15cJAlne2vxtgt/ArcGIS/rest/services/Critical_Infrastructure_Map_Service/FeatureServer/12',label:'Historical HIFLD fire facility',inventory:'f11a2778ecc4c46f047148cf6a885c1adc165106dde8fecffd9100c918b1c236'},
} as const;
export const isFederalPointMethod=(method:unknown):method is FederalPointMethod=>typeof method==='string'&&Object.hasOwn(FEDERAL_POINT_SOURCES,method);
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const hash=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const day=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
function nativeDate(timestamp:unknown):string|null{
 if(typeof timestamp!=='number'||!Number.isFinite(timestamp))return null;
 const date=new Date(timestamp);return Number.isFinite(date.getTime())?date.toISOString().slice(0,10):null;
}
export function validateFederalPrimaryPoint(value:unknown,method:FederalPointMethod):FederalPrimaryPoint{
 const p=value,source=FEDERAL_POINT_SOURCES[method];
 if(!record(p)||typeof p.objectId!=='number'||!Number.isSafeInteger(p.objectId)||p.objectId<=0||typeof p.nativeId!=='string'||!p.nativeId.trim()||p.nativeId.length>100||!hash(p.sourceSha256)||typeof p.sourceFile!=='string'||!/^pages\/\d{5}\.json$/.test(p.sourceFile)||!source.inventory||p.sourceInventorySha256!==source.inventory||p.sourceUrl!==source.url||p.collectionDate!=='2026-11-26'||p.addressRole!=='source-address-location'||typeof p.countyFips!=='string'||!/^\d{5}$/.test(p.countyFips)||!(p.sourceTimestamp===null||typeof p.sourceTimestamp==='number'&&Number.isFinite(p.sourceTimestamp))||p.sourceDate!==nativeDate(p.sourceTimestamp)||p.sourceDate!==null&&(!day(p.sourceDate)||p.sourceDate>'2026-11-26'))throw Error('Invalid retained federal address-point provenance.');
 if(method==='usgs-structure-address'){
  if(typeof p.featureCode!=='number'||!Number.isInteger(p.featureCode)||p.featureCode<=0||!(p.pointLocationType===1&&p.precision==='structure-centroid'||p.pointLocationType===2&&p.precision==='entrance-or-egress'))throw Error('Unsupported USGS point placement.');
 }else if(p.historicalFacilityEvidence!==true||p.sourceCountyFips!==p.countyFips||!(p.geoPrecision==='ONENTITY'&&p.precision==='on-entity'||p.geoPrecision==='BLOCKFACE'&&p.precision==='blockface')||p.contactDate!==nativeDate(p.contactTimestamp)||!(p.contactTimestamp===null||typeof p.contactTimestamp==='number'&&Number.isFinite(p.contactTimestamp)))throw Error('Unsupported historical HIFLD facility point.');
 return {...p} as FederalPrimaryPoint;
}
