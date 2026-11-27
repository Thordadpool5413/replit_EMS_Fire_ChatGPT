import { hasProviderServiceName } from './providerServiceName';
import type {RegistryIdentity} from './registryAccountLink';

export const FLORIDA_EMS_ROSTER_URL='https://www.floridahealth.gov/wp-content/uploads/2025/08/ems-providers.pdf';
export const FLORIDA_EMS_LICENSE_TYPES=['AIR/I','AIR/IR','AIR/IP','AIR/P','ALS/T','ALS/N','BLS/T','BLS/N'] as const;
export type FloridaEmsLicenseType=typeof FLORIDA_EMS_LICENSE_TYPES[number];
export interface FloridaEmsLicense{
 identifier:string;name:string;city:string;headquartersState:string;postalCode:string;county:string;address:string;serviceLevel:FloridaEmsLicenseType;issuedAt:string;expiresAt:string;
}
export interface FloridaEmsRoster{
 schemaVersion:1;stateCode:'FL';identifierKind:'license';sourceName:string;sourceUrl:string;sourceDate:string;retrievedAt:string;scope:string;publishedTotal:number;
 extractionNotes:{identifier:string;field:string;note:string}[];records:FloridaEmsLicense[];
}
export function isIsoDate(value:unknown):value is string{
 return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
}
export function validateFloridaRoster(value:unknown):FloridaEmsRoster{
 const data=value as FloridaEmsRoster;
 if(!data||data.schemaVersion!==1||data.stateCode!=='FL'||data.identifierKind!=='license'||data.sourceUrl!==FLORIDA_EMS_ROSTER_URL||!data.sourceName?.trim()||!data.scope?.trim()||!isIsoDate(data.sourceDate)||!isIsoDate(data.retrievedAt)||data.sourceDate>data.retrievedAt||!Number.isInteger(data.publishedTotal)||data.publishedTotal<300||!Array.isArray(data.records)||data.records.length!==data.publishedTotal||!Array.isArray(data.extractionNotes))throw Error('Florida roster metadata or published count is invalid.');
 const ids=new Set<string>();
 for(const row of data.records){
  if(!row||typeof row.identifier!=='string'||!/^\d{1,12}$/.test(row.identifier)||ids.has(row.identifier)||typeof row.name!=='string'||!row.name.trim()||!(/^[A-Z]{2}$/.test(row.headquartersState))||!['city','county','address','postalCode'].every(k=>typeof row[k as keyof FloridaEmsLicense]==='string')||!FLORIDA_EMS_LICENSE_TYPES.includes(row.serviceLevel)||!isIsoDate(row.issuedAt)||!isIsoDate(row.expiresAt)||row.issuedAt>row.expiresAt||row.issuedAt>data.sourceDate||row.headquartersState!=='FL'&&!!row.county)throw Error('Invalid or duplicate Florida license row.');
  ids.add(row.identifier);
 }
 if(data.extractionNotes.some(n=>!n||!ids.has(n.identifier)||typeof n.field!=='string'||typeof n.note!=='string'))throw Error('Invalid roster extraction notes.');
 return data;
}
let pending:Promise<FloridaEmsRoster>|undefined;
export function loadFloridaRoster():Promise<FloridaEmsRoster>{
 if(!pending)pending=fetch((import.meta.env?.BASE_URL??'/')+'registry/state-ems/FL.json',{signal:AbortSignal.timeout(30000)}).then(async r=>{if(!r.ok)throw Error('Florida license roster unavailable.');return validateFloridaRoster(await r.json());}).catch(e=>{pending=undefined;throw e;});
 return pending;
}
const countyKey=(name:string)=>name.trim().toLowerCase().replace(/\s+county$/,'').replace(/[^a-z0-9]/g,'');
/** Match an explicitly reported Florida county, not ZIP, city, provider name or service area. */
export function floridaCounty(row:FloridaEmsLicense,countyNames:ReadonlyMap<string,string>){
 if(row.headquartersState!=='FL'||!row.county.trim())return undefined;
 const matches=[...countyNames].filter(([id,name])=>/^12\d{3}$/.test(id)&&countyKey(name)===countyKey(row.county));
 return matches.length===1?{countyFips:matches[0][0],countyName:matches[0][1]}:undefined;
}
/** A license may name both the parent and its operating service. */
export function floridaServiceName(row: FloridaEmsLicense): string | undefined {
 const tradeName = row.name.split(/\s+d\.?b\.?a\.?\s+/i)[1]?.trim();
 if (tradeName && !/\b(?:hospitals?|clinics?|holdings|medical center)\b/i.test(tradeName)) return tradeName;
 if (hasProviderServiceName(row.name)) return row.name;
 if (row.serviceLevel.startsWith('AIR/')) {
  const program = row.name.split(',')[0].trim();
  if (/\b(?:shandscair|life flight|air care|bayflite|aeromed)\b/i.test(program)) return program;
 }
 return undefined;
}
export function floridaRegistryIdentity(roster:FloridaEmsRoster,row:FloridaEmsLicense,countyNames:ReadonlyMap<string,string>):RegistryIdentity|undefined{
 // Out-of-state Florida licensees are browse-only until licensing jurisdiction and location are separate.
 if(row.headquartersState!=='FL')return undefined;
 return {sourceName:'State EMS',sourceAuthority:roster.sourceName,identifierKind:'license',identifier:row.identifier,stateCode:'FL',name:floridaServiceName(row) ?? row.name,city:row.city,headquartersState:row.headquartersState,postalCode:row.postalCode,address:row.address,...floridaCounty(row,countyNames),sourceUrl:roster.sourceUrl,sourceDate:roster.sourceDate,retrievedAt:roster.retrievedAt,serviceLevel:row.serviceLevel,licenseIssuedAt:row.issuedAt,licenseExpiresAt:row.expiresAt};
}
