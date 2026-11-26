import {validateAddressMatch,type AddressMatch} from './providerLocationContract';
import {matchesSourceAddress} from './addressNormalization';
import {selectNerisNativeAddress,validNerisCoordinates,type NerisNativeAddress,type NerisAddressComponent} from './nerisAddressComponent';
import {validateNerisSiteIdentity,type NerisSiteIdentityEvidence,type NerisPrimarySiteContext} from './nerisPrimarySiteContract';

export const NERIS_GEOCODED_SITE_METHOD='neris-department-geocoded-site-correlation' as const;
const TARGET_SHA='cb4c896b00f7ca2a1710a57a142f94e67b0e4463871e217ae9b1a8eeafe7744a';
const METHODS={nad:'nad-address-point',usgs:'usgs-structure-address','hifld-ems':'hifld-ems-address','hifld-fire':'hifld-fire-address'} as const;
type IndependentSource=keyof typeof METHODS;
type SourceObservation={source:IndependentSource;match:AddressMatch;countyFips:string;selected:boolean;distanceToSelectedMeters:number};
type NativeObservation={nativeId:string;objectId:number;sourceKind:'department'|'station';addressAsReported:NerisNativeAddress;coordinatesAsReported:[number,number]|null;pointCountyFips:string|null;nativePointIssue:string|null;selectedNativeSite:boolean;distanceToSelectedMeters:number|null};
export type NerisGeocodedSiteEvidence=Omit<NerisSiteIdentityEvidence,'method'|'site'>&{
 method:typeof NERIS_GEOCODED_SITE_METHOD;originalMappingWithheld:boolean;
 site:NerisSiteIdentityEvidence['site']&{addressComponent:NerisAddressComponent};
 geocoding:{targetKey:string;targetsSha256:string;selectionBasis:'separate-public-source-exact-native-site-address';nativeCoordinatesUsed:false;maximumIndependentSeparationMeters:75;auditedSources:IndependentSource[];sourceReportDigests:Record<IndependentSource,string>;selectedCoordinates:[number,number];sourceObservations:SourceObservation[];nativeNerisObservations:NativeObservation[]};
};
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const sourceNames=Object.keys(METHODS).sort();
const same=(a:unknown,b:unknown):boolean=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
function canonical(value:unknown):unknown{
 if(Array.isArray(value))return value.map(canonical);
 if(obj(value))return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,canonical(v)]));
 return value;
}
function distance(a:[number,number],b:[number,number]):number{
 const rad=Math.PI/180,y1=a[0]*rad,x1=a[1]*rad,y2=b[0]*rad,x2=b[1]*rad;
 const h=Math.sin((y2-y1)/2)**2+Math.cos(y1)*Math.cos(y2)*Math.sin((x2-x1)/2)**2;
 return 12742000*Math.asin(Math.min(1,Math.sqrt(h)));
}
const validDistance=(reported:unknown,a:[number,number],b:[number,number])=>typeof reported==='number'&&Number.isFinite(reported)&&reported>=0&&Math.abs(reported-distance(a,b))<0.01;

/** Native department coordinates are observations; selected geometry comes from a separately matched address source. */
export function validateNerisGeocodedSiteEvidence(value:unknown,ctx:NerisPrimarySiteContext):NerisGeocodedSiteEvidence|undefined{
 const identity=validateNerisSiteIdentity(value,ctx,NERIS_GEOCODED_SITE_METHOD,true);
 if(identity===undefined)return undefined;
 const fail=():never=>{throw Error('Invalid separately geocoded NERIS primary-site evidence.');};
 if(!obj(value)||value.diagnosticOnly!==undefined||typeof value.originalMappingWithheld!=='boolean'||value.originalMappingWithheld!==(value.originalStatus==='mapped')||!obj(value.geocoding)||!obj(value.site))return fail();
 const g=value.geocoding,site=value.site;
 const expectedKey=ctx.key+(identity.siteRole==='reported-headquarters'?'@NERIS-HQ':'@NERIS-SOLE');
 if(g.targetKey!==expectedKey||g.targetsSha256!==TARGET_SHA||g.selectionBasis!=='separate-public-source-exact-native-site-address'||g.nativeCoordinatesUsed!==false||g.maximumIndependentSeparationMeters!==75||!Array.isArray(g.auditedSources)||!same(g.auditedSources,sourceNames)||!obj(g.sourceReportDigests)||!same(Object.keys(g.sourceReportDigests).sort(),sourceNames)||Object.values(g.sourceReportDigests).some(v=>typeof v!=='string'||!/^[a-f0-9]{64}$/.test(v))||!validNerisCoordinates(g.selectedCoordinates))return fail();
 const selectedCoordinates=g.selectedCoordinates;
 const selectedNative=selectNerisNativeAddress(site.addressAsReported);
 if(!selectedNative?.component||selectedNative.conflict||!same(site.addressComponent,selectedNative.component))return fail();
 if(!Array.isArray(g.sourceObservations)||g.sourceObservations.length<1||g.sourceObservations.length>4)return fail();
 const sources=new Set<string>(),observed:[number,number][]=[],parsed:SourceObservation[]=[];
 let selectedMatch:AddressMatch|null=null;
 for(const item of g.sourceObservations){
  if(!obj(item)||typeof item.source!=='string'||!Object.hasOwn(METHODS,item.source)||sources.has(item.source)||typeof item.selected!=='boolean'||item.countyFips!==ctx.countyFips)return fail();
  sources.add(item.source);
  const source=item.source as IndependentSource;
  const match=validateAddressMatch(item.match,ctx.address);
  if(!match||match.method!==METHODS[source]||!('point' in match)||match.point.countyFips!==ctx.countyFips||!match.sourceAddress||!match.matchBasis)return fail();
  const coords:[number,number]=[match.latitude,match.longitude];
  if(!validDistance(item.distanceToSelectedMeters,coords,selectedCoordinates))return fail();
  if(item.selected){if(selectedMatch||!same(coords,selectedCoordinates))return fail();selectedMatch=match;}
  observed.push(coords);
  parsed.push({source,match,countyFips:ctx.countyFips,selected:item.selected,distanceToSelectedMeters:item.distanceToSelectedMeters as number});
 }
 if(!selectedMatch||!same(selectedMatch,validateAddressMatch(ctx.match,ctx.address)))return fail();
 for(let i=0;i<observed.length;i++)for(let j=i+1;j<observed.length;j++)if(distance(observed[i],observed[j])>75+1e-6)return fail();
 if(!Array.isArray(g.nativeNerisObservations)||g.nativeNerisObservations.length<1||g.nativeNerisObservations.length>1000)return fail();
 const nativeIds=new Set<string>();let selectedNativeCount=0;
 for(const item of g.nativeNerisObservations){
  if(!obj(item)||typeof item.nativeId!=='string'||!/^[-A-Z0-9]{1,14}$/.test(item.nativeId)||nativeIds.has(item.nativeId)||typeof item.objectId!=='number'||!Number.isSafeInteger(item.objectId)||item.objectId<=0||!['department','station'].includes(String(item.sourceKind))||typeof item.selectedNativeSite!=='boolean'||!(item.pointCountyFips===null||typeof item.pointCountyFips==='string'&&/^\d{5}$/.test(item.pointCountyFips))||!(item.nativePointIssue===null||typeof item.nativePointIssue==='string'&&item.nativePointIssue.length<160&&!/[\u0000-\u001f\u007f]/.test(item.nativePointIssue)))return fail();
  nativeIds.add(item.nativeId);
  const address=selectNerisNativeAddress(item.addressAsReported);
  if(!address?.component||!matchesSourceAddress(ctx.address,address.address,'normalized-street-state-zip')||address.conflict&&item.nativePointIssue!=='conflicting-native-address-lines')return fail();
  if(item.coordinatesAsReported===null){if(item.distanceToSelectedMeters!==null)return fail();}
  else if(!validNerisCoordinates(item.coordinatesAsReported)||!validDistance(item.distanceToSelectedMeters,item.coordinatesAsReported,selectedCoordinates))return fail();
  if(item.selectedNativeSite){
   selectedNativeCount++;
   if(item.nativeId!==identity.site.id||item.objectId!==identity.site.objectId||item.sourceKind!==identity.site.sourceKind||!same(item.addressAsReported,identity.site.addressAsReported)||!same(item.coordinatesAsReported,identity.site.coordinatesAsReported))return fail();
  }
 }
 if(selectedNativeCount!==1)return fail();
 return {...value,geocoding:{...g,sourceObservations:parsed}} as NerisGeocodedSiteEvidence;
}
