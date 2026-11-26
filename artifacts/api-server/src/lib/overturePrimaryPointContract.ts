import {OVERTURE_ADDRESS_FILES,OVERTURE_ADDRESS_NATIVE_POINTS} from './overturePrimaryPointPins';

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
    inventory:'',precision:'reported-place-point',rows:0,enabled:false,
  },
} as const;
export const isOverturePointMethod=(value:unknown):value is OverturePointMethod=>value==='overture-address';
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

/** Preserve approximate native points; release-scoped IDs do not establish an agency identity. */
export function validateOverturePrimaryPoint(value:unknown,method:OverturePointMethod):OverturePrimaryPoint{
  if(!isOverturePointMethod(method))throw Error('Overture source release has not passed its complete-source review.');
  const p=value,source=OVERTURE_POINT_SOURCES[method];
  if(!object(p)||typeof p.nativeId!=='string'||!Object.hasOwn(OVERTURE_ADDRESS_NATIVE_POINTS,p.nativeId)
    ||p.sourceInventorySha256!==source.inventory||p.release!=='2026-11-18.0'||p.sourceDate!==null||p.collectionDate!=='2026-11-26'
    ||p.sourceDigestScope!=='canonical-native-record'||p.precision!==source.precision
    ||p.completeUSRowsAudited!==source.rows||p.coordinateReuseDistinctAddresses!==1
    ||!hash(p.sourceSha256)||!hash(p.sourceFileSha256))throw Error('Invalid retained Overture point provenance.');
  const pin=OVERTURE_ADDRESS_NATIVE_POINTS[p.nativeId],file=OVERTURE_ADDRESS_FILES[pin[0]];
  if(!file||p.sourceFile!==file[0]||p.sourceFileSha256!==file[1]||p.sourceEtag!==file[2]
    ||p.sourceRowNumber!==pin[1]||p.sourceSha256!==pin[2]||p.countyFips!==pin[5]||p.coordinateReuseRows!==pin[6]
    ||!Array.isArray(p.coordinatesAsReported)||p.coordinatesAsReported.length!==2||p.coordinatesAsReported[0]!==pin[3]||p.coordinatesAsReported[1]!==pin[4]
    ||!Number.isSafeInteger(p.sourceRowNumber)||pin[1]<0||pin[1]>=file[3])throw Error('Overture point is not bound to its retained native source row.');
  const nativeAttribution=attribution(p.attribution);
  if(JSON.stringify(nativeAttribution.map(s=>ATTRIBUTION_FIELDS.map(k=>s[k])))!==JSON.stringify(pin[7]))throw Error('Overture attribution differs from the retained native record.');
  return {
    nativeId:p.nativeId,sourceFile:file[0],sourceEtag:file[2],sourceFileSha256:file[1],sourceRowNumber:pin[1],sourceSha256:pin[2],
    sourceDigestScope:'canonical-native-record',sourceInventorySha256:source.inventory,release:'2026-11-18.0',countyFips:pin[5],
    precision:'reported-address-point',sourceDate:null,collectionDate:'2026-11-26',coordinatesAsReported:[pin[3],pin[4]],
    attribution:nativeAttribution,coordinateReuseRows:pin[6],coordinateReuseDistinctAddresses:1,completeUSRowsAudited:source.rows,
  };
}
