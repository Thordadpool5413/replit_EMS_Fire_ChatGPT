import type {NerisPrimarySiteContext,NerisSiteIdentityEvidence} from './nerisPrimarySiteContract';
import {validateRetainedNerisEvidence,type NerisRetainedBindings} from './nerisRetainedProfileContract';
import pins from './nerisWebsiteSitePins.json';

export const NERIS_WEBSITE_SITE_METHOD='neris-department-website-site-correlation' as const;
export type NerisWebsiteSiteEvidence=Omit<NerisSiteIdentityEvidence,'method'|'correlation'>&{
 method:typeof NERIS_WEBSITE_SITE_METHOD;mailingSourceSha256:string;usfaNativeSourceSha256:string;
 correlation:Record<string,unknown>&{nameBasis:'normalized-complete-name-unique-website-city-state-zip';
  primaryKey:string;primaryName:string;primaryCity:string;primaryPostalCode:string;normalizedName:string;normalizedCity:string;
  state:string;zip:string;reciprocalSourceCount:1;reciprocalPrimaryCount:1;websiteBasis:'canonical-url'|'exact-host';
  canonicalHost:string;nativeUsfaWebsiteAsReported:string;nativeNerisWebsiteAsReported:string;
  nativeUsfaSourceRowNumber:number;nativeUsfaRecordSha256:string;websiteOwnershipChecked:false};
};
export function validateNerisWebsiteSiteEvidence(value:unknown,ctx:NerisPrimarySiteContext):NerisWebsiteSiteEvidence|undefined {
 return validateRetainedNerisEvidence<NerisWebsiteSiteEvidence>(value,ctx,NERIS_WEBSITE_SITE_METHOD,pins as NerisRetainedBindings);
}
