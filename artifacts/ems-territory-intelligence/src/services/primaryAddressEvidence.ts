import {validateNerisPrimarySiteEvidence,NERIS_PRIMARY_SITE_METHOD,type NerisPrimarySiteEvidence,type NerisPrimarySiteContext} from './nerisPrimarySiteContract';
import {validateNerisGeocodedSiteEvidence,NERIS_GEOCODED_SITE_METHOD,type NerisGeocodedSiteEvidence} from './nerisGeocodedSiteContract';
import {validateNerisMailingSiteEvidence,NERIS_MAILING_SITE_METHOD,type NerisMailingSiteEvidence} from './nerisMailingSiteContract';
import {validateNerisMailingGeocodedSiteEvidence,NERIS_MAILING_GEOCODED_SITE_METHOD,type NerisMailingGeocodedSiteEvidence} from './nerisMailingGeocodedSiteContract';
import {validateNerisRangeSiteEvidence,NERIS_RANGE_SITE_METHOD,NERIS_MAILING_RANGE_SITE_METHOD,type NerisRangeSiteEvidence} from './nerisRangeSiteContract';
import {validateNerisWebsiteSiteEvidence,NERIS_WEBSITE_SITE_METHOD,type NerisWebsiteSiteEvidence} from './nerisWebsiteSiteContract';
import {validateNppesPrimaryAddressEvidence,NPPES_PRIMARY_COMPONENTS_METHOD,type NppesPrimaryComponentsEvidence} from './nppesPrimaryComponentsContract';
import {validateNppesPhoneSiteEvidence,NPPES_PHONE_SITE_METHOD,type NppesPhoneSiteEvidence} from './nppesPhoneSiteContract';

export type PrimaryAddressEvidence=NerisPrimarySiteEvidence|NerisGeocodedSiteEvidence|NerisMailingSiteEvidence|
 NerisMailingGeocodedSiteEvidence|NerisRangeSiteEvidence|NerisWebsiteSiteEvidence|
 NppesPrimaryComponentsEvidence|NppesPhoneSiteEvidence;

export function validatePrimaryAddressEvidence(value:unknown,context:NerisPrimarySiteContext):PrimaryAddressEvidence|undefined{
 if(value===undefined)return undefined;
 if(!value||typeof value!=='object'||Array.isArray(value)||!('method' in value))throw Error('Missing primary address evidence method.');
 switch(value.method){
  case NERIS_PRIMARY_SITE_METHOD:return validateNerisPrimarySiteEvidence(value,context);
  case NERIS_GEOCODED_SITE_METHOD:return validateNerisGeocodedSiteEvidence(value,context);
  case NERIS_MAILING_SITE_METHOD:return validateNerisMailingSiteEvidence(value,context);
  case NERIS_MAILING_GEOCODED_SITE_METHOD:return validateNerisMailingGeocodedSiteEvidence(value,context);
  case NERIS_RANGE_SITE_METHOD:
  case NERIS_MAILING_RANGE_SITE_METHOD:return validateNerisRangeSiteEvidence(value,context);
  case NERIS_WEBSITE_SITE_METHOD:return validateNerisWebsiteSiteEvidence(value,context);
  case NPPES_PRIMARY_COMPONENTS_METHOD:return validateNppesPrimaryAddressEvidence(value,context);
  case NPPES_PHONE_SITE_METHOD:return validateNppesPhoneSiteEvidence(value,context);
  default:throw Error('Unsupported primary address association.');
 }
}

const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const locality=(city:unknown,zip:unknown):{city:string;zip:string}|undefined=>
 typeof city==='string'&&!!city.trim()&&typeof zip==='string'&&/^\d{5}(?:-?\d{4})?$/.test(zip)?{city,zip:zip.slice(0,5)}:undefined;

/** Source identity locality stays separate from the displayed correlated site. */
export function primaryAssociationLocality(proof:PrimaryAddressEvidence):{city:string;zip:string}|undefined{
 if(proof.method===NPPES_PRIMARY_COMPONENTS_METHOD){
  return locality(proof.primaryAddressAsReported.city,proof.primaryAddressAsReported.postalCode);
 }
 if(proof.method===NPPES_PHONE_SITE_METHOD){
  const original=proof.originalAddress;
  if(original){const known=locality(original.city,original.zip);if(known)return known;}
  const native=proof.correlation.cmsNativeRecord;
  const address=record(native)&&record(native.primaryAddress)?native.primaryAddress:undefined;
  return address?locality(address.city,address.postalCode):undefined;
 }
 return locality(proof.correlation.primaryCity,proof.correlation.zip);
}
