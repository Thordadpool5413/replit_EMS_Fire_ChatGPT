/** No recovered Places release is enabled until complete-source replay generates this file. */
import type {OvertureFilePin} from './overturePrimaryPointPins';
export type OverturePlaceNativePin=readonly [file:number,row:number,sha256:string,latitude:number,longitude:number,county:string,reuseRows:number,attribution:ReadonlyArray<ReadonlyArray<unknown>>,name:string,confidence:number,status:'open',addressOrdinal:number];
export const OVERTURE_PLACE_SOURCE_INVENTORY:string='';
export const OVERTURE_PLACE_FILES:ReadonlyArray<OvertureFilePin>=[];
export const OVERTURE_PLACE_NATIVE_POINTS:Readonly<Record<string,OverturePlaceNativePin>>={};
