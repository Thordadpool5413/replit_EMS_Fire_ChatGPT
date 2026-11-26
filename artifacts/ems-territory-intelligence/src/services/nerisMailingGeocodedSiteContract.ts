import type {NerisPrimarySiteContext} from './nerisPrimarySiteContract';
import type {NerisMailingSiteEvidence} from './nerisMailingSiteContract';
import {validateRetainedNerisEvidence,type NerisRetainedBindings} from './nerisRetainedProfileContract';
import pins from './nerisMailingGeocodedSitePins.json';

export const NERIS_MAILING_GEOCODED_SITE_METHOD='neris-department-mailing-geocoded-site-correlation' as const;
export type NerisMailingGeocodedSiteEvidence=Omit<NerisMailingSiteEvidence,'method'>&{
 method:typeof NERIS_MAILING_GEOCODED_SITE_METHOD;
 geocoding:{targetKey:string;targetsSha256:string;selectionBasis:'separate-public-source-exact-native-site-address';
  nativeCoordinatesUsed:false;maximumIndependentSeparationMeters:75;auditedSources:string[];
  sourceReportDigests:Record<string,string>;selectedCoordinates:[number,number];
  sourceObservations:unknown[];nativeNerisObservations:unknown[];allQualifiedNativeEndpoints:unknown[]};
};
export function validateNerisMailingGeocodedSiteEvidence(value:unknown,ctx:NerisPrimarySiteContext):NerisMailingGeocodedSiteEvidence|undefined {
 return validateRetainedNerisEvidence<NerisMailingGeocodedSiteEvidence>(value,ctx,NERIS_MAILING_GEOCODED_SITE_METHOD,pins as NerisRetainedBindings);
}
