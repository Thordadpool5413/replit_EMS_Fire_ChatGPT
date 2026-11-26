import {NAD_NATIVE_POINTS} from './nadPrimaryPointPins';

export const NAD_NATIVE_ARCHIVE_SHA='efac5c350b4fefc9412b601e54f4a26e740049b251a6f9136ea5cc0f86a4ca83';
export const NAD_NATIVE_PLACEMENTS=['Structure - Rooftop','Structure - Entrance','Structure - Interior','Structure - Interior Unit Location','Property Access Point','Site Placement','Parcel - Centroid','Parcel - Other/Manual Placement','Unknown','Other'] as const;
export type NativeNadPoint={objectId:number;release:'2026-09-30';dataset:'bulk-r24';authority:string;placement:typeof NAD_NATIVE_PLACEMENTS[number];countyFips:string;sourceArchiveSha256:typeof NAD_NATIVE_ARCHIVE_SHA;sourceRowNumber:number;nativeRecordSha256:string;sourceCityField:'Post_City'|'Inc_Muni';sourceCountyName:string;lifecycle:''|'Active';addressClass:'Numbered Thoroughfare Address';coordinatesAsReported:[number,number]};
type SourceAddress={street:string;city:string;state:string;zip:string};
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);

/** Unknown placement remains explicit and is permitted only by the full-source native proof. */
export function validateNativeNadPoint(value:unknown,address:SourceAddress):NativeNadPoint{
 const p=value;
 if(!object(p)||typeof p.objectId!=='number'||!Number.isSafeInteger(p.objectId)||!Object.hasOwn(NAD_NATIVE_POINTS,String(p.objectId))||p.release!=='2026-09-30'||p.dataset!=='bulk-r24'||p.sourceArchiveSha256!==NAD_NATIVE_ARCHIVE_SHA)throw Error('Unretained native NAD point.');
 const pin=NAD_NATIVE_POINTS[String(p.objectId)];
 if(p.sourceRowNumber!==pin[0]||p.nativeRecordSha256!==pin[1]||p.authority!==pin[4]||p.placement!==pin[5]||p.countyFips!==pin[6]||p.sourceCountyName!==pin[7]||p.lifecycle!==pin[8]||p.addressClass!=='Numbered Thoroughfare Address'||!['','Active'].includes(String(p.lifecycle))||!NAD_NATIVE_PLACEMENTS.includes(p.placement as NativeNadPoint['placement'])||!(p.sourceCityField==='Post_City'||p.sourceCityField==='Inc_Muni')||!Array.isArray(p.coordinatesAsReported)||p.coordinatesAsReported.length!==2||p.coordinatesAsReported[0]!==pin[2]||p.coordinatesAsReported[1]!==pin[3])throw Error('NAD point differs from its retained native row.');
 if(address.street!==pin[9]||address.state!==pin[10]||address.zip!==pin[11]||address.city!==pin[p.sourceCityField==='Post_City'?12:13])throw Error('NAD source address differs from the retained native address.');
 return {objectId:p.objectId,release:'2026-09-30',dataset:'bulk-r24',authority:pin[4],placement:pin[5] as NativeNadPoint['placement'],countyFips:pin[6],sourceArchiveSha256:NAD_NATIVE_ARCHIVE_SHA,sourceRowNumber:pin[0],nativeRecordSha256:pin[1],sourceCityField:p.sourceCityField,sourceCountyName:pin[7],lifecycle:pin[8] as NativeNadPoint['lifecycle'],addressClass:'Numbered Thoroughfare Address',coordinatesAsReported:[pin[2],pin[3]]};
}
