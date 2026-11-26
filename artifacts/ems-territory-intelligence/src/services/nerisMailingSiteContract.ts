import type {NerisPrimarySiteContext,NerisSiteIdentityEvidence} from './nerisPrimarySiteContract';
import {validateRetainedNerisEvidence,type NerisRetainedBindings} from './nerisRetainedProfileContract';
import pins from './nerisMailingSitePins.json';

export const NERIS_MAILING_SITE_METHOD='neris-department-mailing-site-correlation' as const;
export type NerisMailingSiteEvidence=Omit<NerisSiteIdentityEvidence,'method'|'correlation'>&{
 method:typeof NERIS_MAILING_SITE_METHOD;mailingSourceSha256:string;
 correlation:{nameBasis:'normalized-complete-name-mailing-street-city-state-zip'|'normalized-complete-name-mailing-city-state-zip';
  primaryKey:string;primaryName:string;primaryCity:string;primaryPostalCode:string;normalizedName:string;normalizedCity:string;
  state:string;zip:string;reciprocalSourceCount:1;reciprocalPrimaryCount:1;localityRole:'native-mailing';
  sourceIdentityInventoryCount:number;primaryIdentityInventoryCount:number;sourceAlternatives:['physical','mailing'];
  nativeMailingAddressAsReported:[unknown,unknown,unknown,unknown,unknown];nativeMailingField:string|null;normalizedMailingStreet:string|null};
};
export function validateNerisMailingSiteEvidence(value:unknown,ctx:NerisPrimarySiteContext):NerisMailingSiteEvidence|undefined {
 return validateRetainedNerisEvidence<NerisMailingSiteEvidence>(value,ctx,NERIS_MAILING_SITE_METHOD,pins as NerisRetainedBindings);
}
