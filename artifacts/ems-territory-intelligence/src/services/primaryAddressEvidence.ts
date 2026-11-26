import {validateNerisPrimarySiteEvidence,NERIS_PRIMARY_SITE_METHOD,type NerisPrimarySiteEvidence,type NerisPrimarySiteContext} from './nerisPrimarySiteContract';
import {validateNerisGeocodedSiteEvidence,NERIS_GEOCODED_SITE_METHOD,type NerisGeocodedSiteEvidence} from './nerisGeocodedSiteContract';

export type PrimaryAddressEvidence=NerisPrimarySiteEvidence|NerisGeocodedSiteEvidence;
export function validatePrimaryAddressEvidence(value:unknown,context:NerisPrimarySiteContext):PrimaryAddressEvidence|undefined{
 if(value===undefined)return undefined;
 if(!value||typeof value!=='object'||!('method' in value))throw Error('Missing primary address evidence method.');
 if(value.method===NERIS_PRIMARY_SITE_METHOD)return validateNerisPrimarySiteEvidence(value,context);
 if(value.method===NERIS_GEOCODED_SITE_METHOD)return validateNerisGeocodedSiteEvidence(value,context);
 throw Error('Unsupported primary address association.');
}
