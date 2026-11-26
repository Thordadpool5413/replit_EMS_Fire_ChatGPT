import type {NerisPrimarySiteContext,NerisSiteIdentityEvidence} from './nerisPrimarySiteContract';
import {validateRetainedNerisEvidence,type NerisRetainedBindings} from './nerisRetainedProfileContract';
import corePins from './nerisRangeSitePins.json';
import mailingPins from './nerisMailingRangeSitePins.json';

export const NERIS_RANGE_SITE_METHOD='neris-department-range-site-correlation' as const;
export const NERIS_MAILING_RANGE_SITE_METHOD='neris-department-mailing-range-site-correlation' as const;
export type NerisRangeSiteEvidence=Omit<NerisSiteIdentityEvidence,'method'|'correlation'>&{
 method:typeof NERIS_RANGE_SITE_METHOD|typeof NERIS_MAILING_RANGE_SITE_METHOD;correlation:Record<string,unknown>;
 mailingSourceSha256?:string;
 rangeGeocoding:{targetKey:string;targetsSha256:string;precision:'address-range';geometryRole:'interpolated-road-location';
  nativeCoordinatesUsed:false;selectionBasis:'native-site-address-matched-to-complete-public-address-ranges';
  pointSourceSelection:'no-qualified-point-and-no-qualified-source-conflict';auditedPointSources:string[];
  selectedCoordinates:[number,number];sourceRange:unknown;nativeNerisObservations:unknown[];
  qualifiedPointObservationCount:0;qualifiedNativeNerisPointCount:0;qualifiedPointSourceConflictCount:0;
  pointSourceReportDigests:Record<string,string>;rangeSourceReportSha256:string};
};
export function validateNerisRangeSiteEvidence(value:unknown,ctx:NerisPrimarySiteContext):NerisRangeSiteEvidence|undefined {
 if(value===undefined)return undefined;
 const method=value!==null&&typeof value==='object'&&!Array.isArray(value)?(value as Record<string,unknown>).method:undefined;
 if(method!==NERIS_RANGE_SITE_METHOD&&method!==NERIS_MAILING_RANGE_SITE_METHOD)throw Error('Invalid NERIS range-site method.');
 return validateRetainedNerisEvidence<NerisRangeSiteEvidence>(value,ctx,method,(method===NERIS_RANGE_SITE_METHOD?corePins:mailingPins) as NerisRetainedBindings);
}
