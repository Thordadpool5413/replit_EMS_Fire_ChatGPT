import {matchesSourceAddress,sourceStreetLine,type AddressMatchBasis} from './addressNormalization';
import {isFederalPointMethod,validateFederalPrimaryPoint,FEDERAL_POINT_SOURCES,type FederalPointMethod,type FederalPrimaryPoint} from './federalPrimaryPointContract';
/** Street-level public registry location and Census range match, never a verified station. */
export type StreetAddress={street:string;city:string;state:string;zip:string};
export type NpiAddress={npi:string;name:string;address:StreetAddress;sourceDate:string|null};
const NAD_PLACEMENTS=['Structure - Rooftop','Structure - Entrance','Structure - Interior','Structure - Interior Unit Location','Property Access Point','Site Placement','Parcel - Centroid','Parcel - Other/Manual Placement'] as const;
export type NadPoint={objectId:number;release:'2026-09-30';authority:string;placement:typeof NAD_PLACEMENTS[number];countyFips:string;dataset?:'bulk-r24'};
export type NyPoint={objectId:number;nativeId:string;sourceDate:string;authority:string;placement:'Rooftop'|'Primary structure entrance'|'Driveway entrance'|'Parcel centroid';countyFips:string};
export const NY_SAM_SOURCE_URL='https://services6.arcgis.com/EbVsqZ18sv1kVJ3k/ArcGIS/rest/services/NYS_Address_Points/FeatureServer/0';
export const NAD_BULK_SOURCE_URL='https://data.transportation.gov/d/fc2s-wawr';
export type OhioPoint={objectId:number;sourceDate:string;countyFips:string};
export const OHIO_LBRS_SOURCE_URL='https://services2.arcgis.com/MlJ0G8iWUyC7jAmu/arcgis/rest/services/Statewide_LBRS_Address_Points/FeatureServer/0';
export const REGIONAL_POINT_SOURCES={"nc-addressnc":{"url":"https://services.nconemap.gov/secure/rest/services/AddressNC/NC1Map_Addresses/FeatureServer/0","label":"North Carolina AddressNC","state":"NC","countyPrefix":"37","county":"","bounds":[-84.4,33.75,-75.35,36.6],"placements":["Structure","Other_Site","Centroid","Driveway","GPS","Plan","Survey"]},"fl-hillsborough":{"url":"https://services.arcgis.com/apTfC6SUmnNfnxuF/arcgis/rest/services/Site_Address_Point/FeatureServer/0","label":"Hillsborough County GIS","state":"FL","countyPrefix":"12","county":"12057","bounds":[-82.95,27.55,-81.95,28.25],"placements":["Driveway","Location","Master","Parcel"]},"fl-pinellas":{"url":"https://maps.pinellas.gov/gis/rest/services/PublicWebGIS/Parcels/MapServer/0","label":"Pinellas County Regional 911","state":"FL","countyPrefix":"12","county":"12103","bounds":[-83.05,27.58,-82.48,28.25],"placements":["Primary building address"]},"nj-addresspoints":{"url":"https://services2.arcgis.com/XVOqAjTOJ5P6ngMu/arcgis/rest/services/AddressPoints/FeatureServer/0","label":"New Jersey Office of GIS NG911","state":"NJ","countyPrefix":"34","county":"","bounds":[-75.6,38.85,-73.85,41.4],"placements":["Structure - Rooftop","Parcel - Centroid"]},"tx-prosper":{"url":"https://services8.arcgis.com/8ofMLzOrtxGP9wVQ/ArcGIS/rest/services/Land_Records/FeatureServer/3","label":"Town of Prosper GIS","state":"TX","countyPrefix":"48","county":"","bounds":[-97.15,33.05,-96.65,33.45],"placements":["Structure","Site","Property Access"]},"pa-cumberland":{"url":"https://gis.ccpa.net/arcgiswebadaptor/rest/services/PASDA_Sharing/Address_Points/FeatureServer/0","label":"Cumberland County Pennsylvania GIS","state":"PA","countyPrefix":"42","county":"42041","bounds":[-77.7,39.95,-76.8,40.45],"placements":["Structure","Site","Property Access","Parcel"]},"tx-stratmap":{"url":"https://feature.geographic.texas.gov/arcgis/rest/services/Address_Points/stratmap_address_points_48_most_recent/MapServer/0","label":"Texas Geographic Information Office StratMap","state":"TX","countyPrefix":"48","county":"","bounds":[-106.7,25.8,-93.4,36.6],"placements":["Placement not reported"]},"il-peoria":{"url":"https://services.arcgis.com/iPiPjILCMYxPZWTc/ArcGIS/rest/services/E_911_Addresses/FeatureServer/0","label":"Peoria County E911 GIS","state":"IL","countyPrefix":"17","county":"17143","bounds":[-90.1,40.45,-89.3,41.25],"placements":["STRUCTURE","SITE","PROPERTY ACCESS","PARCEL"]},"il-lake":{"url":"https://services3.arcgis.com/HESxeTbDliKKvec2/arcgis/rest/services/LakeCounty_AddressPoints/FeatureServer/0","label":"Lake County Illinois GIS","state":"IL","countyPrefix":"17","county":"17097","bounds":[-88.25,42.05,-87.65,42.51],"placements":["STRUCTURE","SITE","PROPERTY ACCESS","PARCEL"]},"pa-northampton":{"url":"https://gis.northamptoncounty.org/arcgisweb/rest/services/Assessment_Services/Land_Records_LGM/MapServer/6","label":"Northampton County Pennsylvania GIS","state":"PA","countyPrefix":"42","county":"42095","bounds":[-75.65,40.5,-75,41.2],"placements":["Placement not reported"]},"al-baldwin":{"url":"https://gisportal.baldwincountyal.gov/server/rest/services/911/Addresses/FeatureServer/0","label":"Baldwin County Alabama 911 GIS","state":"AL","countyPrefix":"01","county":"01003","bounds":[-88.1,30.15,-87.35,31.35],"placements":["Structure","Site","Property Access","Parcel"]},"in-data-harvest":{"url":"https://gisdata.in.gov/server/rest/services/Hosted/Address_Points_of_Indiana_2025/FeatureServer/0","label":"Indiana Geographic Information Office Data Harvest","state":"IN","countyPrefix":"18","county":"","bounds":[-88.1,37.75,-84.75,41.8],"placements":["Structure","Site"]},"ga-fulton":{"url":"https://services1.arcgis.com/AQDHTHDrZzfsFsB5/ArcGIS/rest/services/Address_Points/FeatureServer/0","label":"Fulton County Georgia GIS Division","state":"GA","countyPrefix":"13","county":"13121","bounds":[-84.87,33.48,-84.04,34.25],"placements":["Main address (placement not reported)"]}} as const;
export type RegionalSource=keyof typeof REGIONAL_POINT_SOURCES;
export type RegionalPoint={source:RegionalSource;objectId:number;checkedAt:string;recordUpdatedAt:string|null;placement:string;countyFips:string};
export type NerisAddressPoint={objectId:number;nativeId:string;parentId:string;sourceKind:'department'|'station';sourceDate:'2026-11-26';sourceSha256:string;countyFips:string};
const NERIS_POINT_HASH='1ec2a427cbc5ea1949ff731527de3c701ed9592bc4fa83fe796a54defa18880b';
const NERIS_POINT_URL='https://services5.arcgis.com/lPbcyJOcoLyZmvo6/arcgis/rest/services/NERIS%20Public%20Fire%20Departments/FeatureServer';
type AddressCoordinates={latitude:number;longitude:number;matchedAddress:string;sourceAddress?:StreetAddress;matchBasis?:AddressMatchBasis};
export type AddressMatch=AddressCoordinates&({method:'census-address-range'}|{method:'nad-address-point';point:NadPoint}|{method:'ohio-lbrs-address-point';point:OhioPoint}|{method:'ny-sam-address-point';point:NyPoint}|{method:'regional-address-point';point:RegionalPoint}|{method:'neris-reported-address';point:NerisAddressPoint}|{method:FederalPointMethod;point:FederalPrimaryPoint});
export function addressMatchLabel(m:AddressMatch){if('point' in m&&isFederalPointMethod(m.method)){const point=m.point as FederalPrimaryPoint;return FEDERAL_POINT_SOURCES[m.method].label+' · '+point.precision.replaceAll('-',' ')+(point.sourceDate?' · source '+point.sourceDate:' · source date not reported')+' · end-user validation required';}return m.method==='neris-reported-address'?'Federal NERIS source-reported address location · end-user validation required':m.method==='nad-address-point'?'USDOT NAD address point · '+m.point.placement+(m.point.dataset==='bulk-r24'?' · release r24':''):m.method==='ny-sam-address-point'?'New York SAM address point · '+m.point.placement:m.method==='ohio-lbrs-address-point'?'Ohio LBRS public address point':m.method==='regional-address-point'?REGIONAL_POINT_SOURCES[m.point.source].label+' · '+m.point.placement:'Census approximate street-range location';}
export function addressPointSource(m:AddressMatch):{url:string;label:string}|undefined{
 if('point' in m&&isFederalPointMethod(m.method)){const point=m.point as FederalPrimaryPoint;return {url:FEDERAL_POINT_SOURCES[m.method].url,label:FEDERAL_POINT_SOURCES[m.method].label+' #'+point.objectId+' · collected '+point.collectionDate};}
 if(m.method==='neris-reported-address')return {url:NERIS_POINT_URL+'/'+(m.point.sourceKind==='department'?0:1)+'/query?'+new URLSearchParams({where:'OBJECTID='+m.point.objectId,outFields:'OBJECTID,neris_id,export_date',returnGeometry:'true',outSR:'4326',f:'pjson'}),label:'NERIS '+m.point.sourceKind+' '+m.point.nativeId+' · snapshot '+m.point.sourceDate};
 if(m.method==='regional-address-point')return {url:REGIONAL_POINT_SOURCES[m.point.source].url,label:REGIONAL_POINT_SOURCES[m.point.source].label+' #'+m.point.objectId+' · checked '+m.point.checkedAt+(m.point.recordUpdatedAt?' · record updated '+m.point.recordUpdatedAt:'')};
 if(m.method==='ny-sam-address-point')return {url:NY_SAM_SOURCE_URL,label:'New York SAM #'+m.point.objectId+' · '+m.point.sourceDate};
 if(m.method==='ohio-lbrs-address-point')return {url:OHIO_LBRS_SOURCE_URL,label:'Ohio LBRS #'+m.point.objectId+' · '+m.point.sourceDate};
 if(m.method==='nad-address-point')return {url:m.point.dataset==='bulk-r24'?NAD_BULK_SOURCE_URL:NAD_SOURCE_URL,label:'NAD #'+m.point.objectId+' · '+m.point.authority};
 return undefined;
}
export const NAD_SOURCE_URL='https://services.arcgis.com/xOi1kZaI0eWDREZv/ArcGIS/rest/services/Address_Points_from_National_Address_Database_view/FeatureServer/0';
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const clean=(v:unknown,max:number)=>typeof v==='string'&&v.trim().length>0&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v)?v.trim():'';
export function parseStreetAddress(v:unknown):StreetAddress|undefined{
 if(!obj(v))return undefined;
 const street=clean(v.street,160),city=clean(v.city,100),state=clean(v.state,2).toUpperCase(),rawZip=clean(v.zip,10);
 const zip=/^\d{5}(?:-?\d{4})?$/.test(rawZip)?rawZip.slice(0,5):'';
 if(!street||!city||!(/^[A-Z]{2}$/.test(state))||rawZip&&!zip)return undefined;
 return {street,city,state,zip};
}
export const isPhysicalStreet=(s:string)=>/^\d+[A-Za-z]?(?:[- ]\d+[A-Za-z]?)?\s+\S/.test(s)&&!/\b(?:P\s*\.?\s*O\s*\.?\s*BOX|POST OFFICE BOX|PMB|PRIVATE MAILBOX)\b/i.test(s);
export const addressText=(a:StreetAddress)=>a.street+', '+a.city+', '+[a.state,a.zip].filter(Boolean).join(' ');
export const addressKey=(a:StreetAddress)=>JSON.stringify([a.street,a.city,a.state,a.zip].map(s=>s.toUpperCase().replace(/\s+/g,' ').trim()));
/** Source address equality may complete an omitted ZIP, but never replace a conflicting ZIP or unit. */
export function compatibleSourceAddress(a:StreetAddress,b:StreetAddress):boolean{
 const key=(s:string)=>s.toUpperCase().replace(/\s+/g,' ').trim();
 return key(a.street)===key(b.street)&&key(a.city)===key(b.city)&&a.state===b.state&&(!a.zip||!b.zip||a.zip===b.zip);
}
/** Official registry lookup also supplies comma-delimited full addresses, unlike the national street-only snapshot. */
export function parseRegistryStreet(street:unknown,city:unknown,state:string,postal:unknown):StreetAddress|undefined{
 if(typeof street!=='string'||typeof city!=='string')return undefined;
 const parts=street.split(',').map(s=>s.trim());
 const tail=parts[parts.length-1]??'';
 const zipOnly=/^\d{5}(?:-?\d{4})?$/.test(tail);
 const statePart=zipOnly?parts[parts.length-2]:tail;
 const suffix=/^([A-Za-z]{2})(?:\s+(\d{5}(?:-?\d{4})?))?$/.exec(statePart??'');
 if(suffix&&parts.length>=(zipOnly?4:3)){
  const cityIndex=parts.length-(zipOnly?3:2),reportedCity=parts[cityIndex];
  const suffixZip=zipOnly?tail:suffix[2]??'';
  if(suffix[1].toUpperCase()!==state||reportedCity.toUpperCase()!==city.trim().toUpperCase())return undefined;
  const a=parseStreetAddress({street:parts.slice(0,cityIndex).join(', '),city,state,zip:suffixZip||postal});
  if(!a)return undefined;
  const explicit=parseStreetAddress({street:a.street,city,state,zip:postal});
  if(explicit?.zip&&a.zip&&explicit.zip!==a.zip)return undefined;
  return a;
 }
 return parseStreetAddress({street,city,state,zip:postal});
}
export function validNpi(v:unknown):v is string{
 if(typeof v!=='string'||!/^\d{10}$/.test(v))return false;
 return [...('80840'+v)].reverse().reduce((sum,d,i)=>{const n=Number(d)*(i%2?2:1);return sum+(n>9?n-9:n);},0)%10===0;
}
export function validateNpiAddress(v:unknown,npi:string):NpiAddress|null{
 if(v===null)return null;
 if(!obj(v)||v.npi!==npi||!validNpi(npi)||!clean(v.name,300)||!(v.sourceDate===null||typeof v.sourceDate==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v.sourceDate)))throw Error('Invalid NPPES location response.');
 const address=parseStreetAddress(v.address);if(!address)throw Error('Invalid NPPES address.');
 return {npi,name:clean(v.name,300),address,sourceDate:v.sourceDate as string|null};
}
const aliases:Record<string,string>={STREET:'ST',ROAD:'RD',AVENUE:'AVE',BOULEVARD:'BLVD',DRIVE:'DR',LANE:'LN',COURT:'CT',HIGHWAY:'HWY',PARKWAY:'PKWY',PLACE:'PL',TERRACE:'TER',CIRCLE:'CIR',NORTH:'N',SOUTH:'S',EAST:'E',WEST:'W',NORTHEAST:'NE',NORTHWEST:'NW',SOUTHEAST:'SE',SOUTHWEST:'SW'};
const norm=(s:string)=>s.toUpperCase().replace(/[.,]/g,' ').replace(/\s+/g,' ').trim().split(' ').map(t=>aliases[t]??t).join(' ');
export const geocodeStreet=(s:string)=>s.replace(/(?:,?\s+(?:STE|SUITE|UNIT|APT|FLOOR|FL|#)\s*[\w-]+.*)$/i,'').trim();
/** Require matched structure number, street, city, state and ZIP; never accept city/ZIP fallback. */
export function matchedStreet(a:StreetAddress,matched:string):boolean{
 if(!a.zip)return false;
 const parts=matched.split(',').map(s=>s.trim());
 if(parts.length===4)return norm(parts[0])===norm(geocodeStreet(a.street))&&norm(parts[1])===norm(a.city)&&parts[2].toUpperCase()===a.state&&parts[3].slice(0,5)===a.zip;
 if(parts.length===3)return norm(parts[0])===norm(geocodeStreet(a.street))&&norm(parts[1])===norm(a.city)&&parts[2].toUpperCase()===a.state+' '+a.zip;
 return false;
}
/** A locality fallback keeps the source's actual address and names its exact basis. */
function addressEvidence(v:Record<string,unknown>,a:StreetAddress):{sourceAddress:StreetAddress;matchBasis:AddressMatchBasis}|undefined{
 if(v.sourceAddress===undefined&&v.matchBasis===undefined)return undefined;
 const source=v.sourceAddress,basis=v.matchBasis;
 if(!obj(source)||!['normalized-street-city-state-zip','normalized-street-state-zip','normalized-street-city-state'].includes(String(basis))||v.method!=='neris-reported-address'&&!isFederalPointMethod(v.method)||isFederalPointMethod(v.method)&&basis==='normalized-street-city-state')throw Error('Unsupported address correspondence evidence.');
 if(typeof source.street!=='string'||!source.street.trim()||source.street.length>200||typeof source.city!=='string'||source.city.length>100||typeof source.state!=='string'||!/^[A-Z]{2}$/.test(source.state)||typeof source.zip!=='string'||source.zip!==''&&!/^\d{5}$/.test(source.zip)||[source.street,source.city].some(s=>/[\u0000-\u001f\u007f]/.test(s)))throw Error('Invalid reported source address.');
 const sourceAddress={street:source.street,city:source.city,state:source.state,zip:source.zip};
 if(!matchesSourceAddress(a,sourceAddress,basis as AddressMatchBasis)||v.matchedAddress!==[sourceStreetLine(sourceAddress.street),sourceAddress.city,sourceAddress.state,sourceAddress.zip].join(', '))throw Error('Source address does not support the primary address.');
 return {sourceAddress,matchBasis:basis as AddressMatchBasis};
}
export function validateAddressMatch(v:unknown,a:StreetAddress):AddressMatch|null{
 if(v===null)return null;
 if(!obj(v))throw Error('Unverified address match.');
 const evidence=addressEvidence(v,a);
 if((v.method!=='census-address-range'&&v.method!=='nad-address-point'&&v.method!=='ohio-lbrs-address-point'&&v.method!=='ny-sam-address-point'&&v.method!=='regional-address-point'&&v.method!=='neris-reported-address'&&!isFederalPointMethod(v.method))||typeof v.latitude!=='number'||!Number.isFinite(v.latitude)||Math.abs(v.latitude)>90||typeof v.longitude!=='number'||!Number.isFinite(v.longitude)||Math.abs(v.longitude)>180||v.latitude===0&&v.longitude===0||typeof v.matchedAddress!=='string'||!evidence&&!matchedStreet(a,v.matchedAddress))throw Error('Unverified address match.');
 const coords={latitude:v.latitude,longitude:v.longitude,matchedAddress:v.matchedAddress,...evidence};
 if(v.method==='census-address-range')return {...coords,method:v.method};
 const p=v.point;
 if(isFederalPointMethod(v.method)){
  if(!evidence)throw Error('Federal source address evidence is required.');
  return {...coords,method:v.method,point:validateFederalPrimaryPoint(p,v.method)};
 }
 if(v.method==='neris-reported-address'){
  if(!obj(p)||typeof p.objectId!=='number'||!Number.isSafeInteger(p.objectId)||p.objectId<=0||typeof p.nativeId!=='string'||!/^[-A-Z0-9]{1,14}$/.test(p.nativeId)||typeof p.parentId!=='string'||!/^[-A-Z0-9]{1,14}$/.test(p.parentId)||!(p.sourceKind==='department'||p.sourceKind==='station')||p.sourceKind==='department'&&p.nativeId!==p.parentId||p.sourceDate!=='2026-11-26'||p.sourceSha256!==NERIS_POINT_HASH||typeof p.countyFips!=='string'||!/^\d{5}$/.test(p.countyFips))throw Error('Invalid NERIS address provenance.');
  return {...coords,method:v.method,point:{objectId:p.objectId,nativeId:p.nativeId,parentId:p.parentId,sourceKind:p.sourceKind,sourceDate:p.sourceDate,sourceSha256:p.sourceSha256,countyFips:p.countyFips}};
 }
 if(v.method==='regional-address-point'){
  if(!obj(p)||typeof p.source!=='string'||!Object.hasOwn(REGIONAL_POINT_SOURCES,p.source))throw Error('Unknown regional point source.');
  const source=p.source as RegionalSource,def=REGIONAL_POINT_SOURCES[source],b=def.bounds;
  if(source==='tx-prosper'&&p.countyFips!=='48085'&&p.countyFips!=='48121')throw Error('Invalid Prosper county scope.');
  const day=(x:unknown):x is string=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
  if(a.state!==def.state||typeof p.objectId!=='number'||!Number.isSafeInteger(p.objectId)||p.objectId<=0||!day(p.checkedAt)||!(p.recordUpdatedAt===null||day(p.recordUpdatedAt)&&p.recordUpdatedAt<=p.checkedAt)||typeof p.placement!=='string'||!(def.placements as readonly string[]).includes(p.placement)||typeof p.countyFips!=='string'||!/^\d{5}$/.test(p.countyFips)||!p.countyFips.startsWith(def.countyPrefix)||def.county&&p.countyFips!==def.county||v.longitude<b[0]||v.longitude>b[2]||v.latitude<b[1]||v.latitude>b[3])throw Error('Invalid regional address-point provenance.');
  return {...coords,method:v.method,point:{source,objectId:p.objectId,checkedAt:p.checkedAt,recordUpdatedAt:p.recordUpdatedAt as string|null,placement:p.placement,countyFips:p.countyFips}};
 }
 if(v.method==='ny-sam-address-point'){
  if(a.state!=='NY'||!obj(p)||typeof p.objectId!=='number'||!Number.isSafeInteger(p.objectId)||p.objectId<=0||typeof p.nativeId!=='string'||!/^[-A-Za-z0-9]{1,30}$/.test(p.nativeId)||typeof p.sourceDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(p.sourceDate)||!Number.isFinite(Date.parse(p.sourceDate))||!clean(p.authority,150)||typeof p.placement!=='string'||!['Rooftop','Primary structure entrance','Driveway entrance','Parcel centroid'].includes(p.placement)||typeof p.countyFips!=='string'||!/^36\d{3}$/.test(p.countyFips)||v.latitude<40.4||v.latitude>45.2||v.longitude< -80||v.longitude> -71.7)throw Error('Invalid NYS SAM point provenance.');
  return {...coords,method:v.method,point:{objectId:p.objectId,nativeId:p.nativeId,sourceDate:p.sourceDate,authority:clean(p.authority,150),placement:p.placement as NyPoint['placement'],countyFips:p.countyFips}};
 }
 if(v.method==='ohio-lbrs-address-point'){
  if(a.state!=='OH'||!obj(p)||typeof p.objectId!=='number'||!Number.isSafeInteger(p.objectId)||p.objectId<=0||typeof p.sourceDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(p.sourceDate)||!Number.isFinite(Date.parse(p.sourceDate))||typeof p.countyFips!=='string'||!/^39\d{3}$/.test(p.countyFips)||v.latitude<38.3||v.latitude>42.1||v.longitude< -85||v.longitude> -80.4)throw Error('Invalid Ohio LBRS point provenance.');
  return {...coords,method:v.method,point:{objectId:p.objectId,sourceDate:p.sourceDate,countyFips:p.countyFips}};
 }
 if(!obj(p)||typeof p.objectId!=='number'||!Number.isSafeInteger(p.objectId)||p.objectId<=0||p.release!=='2026-09-30'||(p.dataset!==undefined&&p.dataset!=='bulk-r24')||!clean(p.authority,150)||typeof p.placement!=='string'||!NAD_PLACEMENTS.includes(p.placement as NadPoint['placement'])||typeof p.countyFips!=='string'||!/^\d{5}$/.test(p.countyFips))throw Error('Invalid NAD address point provenance.');
 return {...coords,method:'nad-address-point',point:{objectId:p.objectId,release:p.release,authority:clean(p.authority,150),placement:p.placement as NadPoint['placement'],countyFips:p.countyFips,...(p.dataset==='bulk-r24'?{dataset:'bulk-r24' as const}:{})}};
}
