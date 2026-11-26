import {OVERTURE_ADDRESS_FILES,OVERTURE_ADDRESS_NATIVE_POINTS} from './overturePrimaryPointPins';
import {OVERTURE_PLACE_FILES,OVERTURE_PLACE_NATIVE_POINTS,OVERTURE_PLACE_SOURCE_INVENTORY,type OverturePlaceNativePin} from './overturePlacePrimaryPointPins';
import {OVERTURE_VARIANT_ADDRESS_FILES,OVERTURE_VARIANT_ADDRESS_NATIVE_POINTS,OVERTURE_VARIANT_PLACE_FILES,OVERTURE_VARIANT_PLACE_NATIVE_POINTS,OVERTURE_VARIANT_PLACE_SOURCE_INVENTORY} from './overturePrimaryVariantPointPins';

export type OverturePointMethod='overture-address'|'overture-place-address';
export type OvertureNativeAttribution={
  property:string|null; dataset:string|null; license:string|null; record_id:string|null;
  update_time:string|null; confidence:number|null; between:number[]|null;
  provider:string|null; resource:string|null; version:string|null;
};
export type OverturePrimaryPoint={
  nativeId:string; sourceFile:string; sourceEtag:string; sourceFileSha256:string;
  sourceRowNumber:number; sourceSha256:string; sourceDigestScope:'canonical-native-record';
  sourceInventorySha256:string; release:'2026-11-18.0'; countyFips:string;
  precision:'reported-address-point'|'reported-place-point'; sourceDate:null;
  collectionDate:'2026-11-26'; coordinatesAsReported:[number,number];
  attribution:OvertureNativeAttribution[]; coordinateReuseRows:number;
  coordinateReuseDistinctAddresses:1; completeUSRowsAudited:number;
  placeName?:string; placeConfidence?:number; operatingStatus?:'open'; sourceAddressOrdinal?:number;
};
export const OVERTURE_ATTRIBUTION_URL='https://docs.overturemaps.org/attribution/';
export const OVERTURE_POINT_SOURCES={
  'overture-address':{
    url:'https://docs.overturemaps.org/guides/addresses/',label:'Overture reported address point',
    inventory:'d6846293aeb456eb246818796a87c481036209ecd067f95b78deda3c76a95fa8',
    precision:'reported-address-point',rows:126202222,enabled:true,
  },
  'overture-place-address':{
    url:'https://docs.overturemaps.org/guides/places/',label:'Overture reported place point',
    inventory:OVERTURE_PLACE_SOURCE_INVENTORY||OVERTURE_VARIANT_PLACE_SOURCE_INVENTORY,precision:'reported-place-point',rows:18806080,
    enabled:!!(OVERTURE_PLACE_SOURCE_INVENTORY||OVERTURE_VARIANT_PLACE_SOURCE_INVENTORY),
  },
} as const;
export const isOverturePointMethod=(value:unknown):value is OverturePointMethod=>value==='overture-address'||value==='overture-place-address';
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const hash=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const ATTRIBUTION_FIELDS=['property','dataset','license','record_id','update_time','confidence','between','provider','resource','version'] as const;
const TEXT_FIELDS=['property','dataset','license','record_id','update_time','provider','resource','version'] as const;
const nativeText=(value:unknown)=>value===null||typeof value==='string'&&value.length<=2000&&!/[\u0000-\u001f\u007f]/.test(value);

function attribution(value:unknown):OvertureNativeAttribution[]{
  if(!Array.isArray(value)||value.length===0||value.length>20)throw Error('Missing native Overture attribution.');
  return value.map(item=>{
    if(!object(item)||Object.keys(item).length!==ATTRIBUTION_FIELDS.length||ATTRIBUTION_FIELDS.some(k=>!Object.hasOwn(item,k))||TEXT_FIELDS.some(k=>!nativeText(item[k]))
      ||!(item.confidence===null||typeof item.confidence==='number'&&Number.isFinite(item.confidence)&&item.confidence>=0&&item.confidence<=1)
      ||!(item.between===null||Array.isArray(item.between)&&item.between.length===2&&item.between.every(v=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1)))throw Error('Invalid native Overture attribution.');
    const label=[item.provider,item.resource,item.dataset].filter(v=>typeof v==='string').join(' ').toLowerCase();
    if(/\bnad\b|national.?address.?database|usdot|us_dot|us_department_of_transportation/.test(label))throw Error('Native NAD lifecycle and placement evidence is required.');
    if(typeof item.license==='string'&&/non.?commercial|no.?derivatives|all rights reserved|no redistribution|cc-by-nc|cc-by-nd/i.test(item.license))throw Error('Unsupported source reuse restriction.');
    return {...item} as OvertureNativeAttribution;
  });
}


/** Exact native-source point binding; does not establish provider ownership or primary-site role. */
export function validateOverturePrimaryPoint(value:unknown,method:OverturePointMethod):OverturePrimaryPoint{
  if(!isOverturePointMethod(method))throw Error('Unsupported Overture point method.');
  const p=value,source=OVERTURE_POINT_SOURCES[method];
  if(!source.enabled||!object(p)||typeof p.nativeId!=='string'
    ||p.sourceInventorySha256!==source.inventory||p.release!=='2026-11-18.0'||p.sourceDate!==null||p.collectionDate!=='2026-11-26'
    ||p.sourceDigestScope!=='canonical-native-record'||p.precision!==source.precision
    ||p.completeUSRowsAudited!==source.rows||p.coordinateReuseDistinctAddresses!==1
    ||!hash(p.sourceSha256)||!hash(p.sourceFileSha256))throw Error('Invalid retained Overture point provenance.');
  const placeKey=p.nativeId+'@'+String(p.sourceAddressOrdinal);
  const ordinary=method==='overture-address'
    ?Object.hasOwn(OVERTURE_ADDRESS_NATIVE_POINTS,p.nativeId)
    :Object.hasOwn(OVERTURE_PLACE_NATIVE_POINTS,placeKey);
  const pin=method==='overture-address'
    ?(ordinary?OVERTURE_ADDRESS_NATIVE_POINTS[p.nativeId]:OVERTURE_VARIANT_ADDRESS_NATIVE_POINTS[p.nativeId])
    :(ordinary?OVERTURE_PLACE_NATIVE_POINTS[placeKey]:OVERTURE_VARIANT_PLACE_NATIVE_POINTS[placeKey]);
  const files=method==='overture-address'
    ?(ordinary?OVERTURE_ADDRESS_FILES:OVERTURE_VARIANT_ADDRESS_FILES)
    :(ordinary?OVERTURE_PLACE_FILES:OVERTURE_VARIANT_PLACE_FILES);
  if(!pin)throw Error('Overture native row is not in a replayed source catalog.');
  const file=files[pin[0]];
  if(!file||p.sourceFile!==file[0]||p.sourceFileSha256!==file[1]||p.sourceEtag!==file[2]
    ||p.sourceRowNumber!==pin[1]||p.sourceSha256!==pin[2]||p.countyFips!==pin[5]||p.coordinateReuseRows!==pin[6]
    ||!Array.isArray(p.coordinatesAsReported)||p.coordinatesAsReported.length!==2||p.coordinatesAsReported[0]!==pin[3]||p.coordinatesAsReported[1]!==pin[4]
    ||!Number.isSafeInteger(p.sourceRowNumber)||pin[1]<0||pin[1]>=file[3])throw Error('Overture point differs from its retained native source row.');
  const nativeAttribution=attribution(p.attribution);
  if(JSON.stringify(nativeAttribution.map(s=>ATTRIBUTION_FIELDS.map(k=>s[k])))!==JSON.stringify(pin[7]))throw Error('Overture attribution differs from the retained native record.');
  const result:OverturePrimaryPoint={
    nativeId:p.nativeId,sourceFile:file[0],sourceEtag:file[2],sourceFileSha256:file[1],sourceRowNumber:pin[1],sourceSha256:pin[2],
    sourceDigestScope:'canonical-native-record',sourceInventorySha256:source.inventory,release:'2026-11-18.0',countyFips:pin[5],
    precision:source.precision,sourceDate:null,collectionDate:'2026-11-26',coordinatesAsReported:[pin[3],pin[4]],
    attribution:nativeAttribution,coordinateReuseRows:pin[6],coordinateReuseDistinctAddresses:1,completeUSRowsAudited:source.rows,
  };
  if(method==='overture-place-address'){
    const place=pin as OverturePlaceNativePin;
    if(p.placeName!==place[8]||p.placeConfidence!==place[9]||p.operatingStatus!=='open'||place[10]!=='open'
       ||p.sourceAddressOrdinal!==place[11]||!Number.isSafeInteger(place[11])||place[11]<0
       ||!Number.isFinite(place[9])||place[9]<0.9||place[9]>1)throw Error('Native Places quality or address ordinal changed.');
    result.placeName=place[8];result.placeConfidence=place[9];result.operatingStatus='open';result.sourceAddressOrdinal=place[11];
  }
  return result;
}
