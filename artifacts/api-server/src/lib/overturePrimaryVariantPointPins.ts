/** Separate variant pins remain empty until native target/source replay succeeds. */
import type {OvertureFilePin,OvertureAddressNativePin} from './overturePrimaryPointPins';
import type {OverturePlaceNativePin} from './overturePlacePrimaryPointPins';
export const OVERTURE_VARIANT_PLACE_SOURCE_INVENTORY:string='';
export const OVERTURE_VARIANT_ADDRESS_FILES:ReadonlyArray<OvertureFilePin>=[];
export const OVERTURE_VARIANT_ADDRESS_NATIVE_POINTS:Readonly<Record<string,OvertureAddressNativePin>>={};
export const OVERTURE_VARIANT_PLACE_FILES:ReadonlyArray<OvertureFilePin>=[];
export const OVERTURE_VARIANT_PLACE_NATIVE_POINTS:Readonly<Record<string,OverturePlaceNativePin>>={};
