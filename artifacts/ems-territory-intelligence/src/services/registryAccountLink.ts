import type { Agency, AgencySourceRecordAssociation } from '../types';
import type { SourceDirectoryRecord } from './nationalSourceDirectory';

export interface RegistryIdentity {
  sourceName:'USFA NFDR'|'NPPES'|'NERIS'|'State EMS'; identifier:string; stateCode:string;
  identifierKind?:'agency-code'|'license'; sourceAuthority?:string; serviceLevel?:string|null; deactivatedAt?:string; postalCode?:string; countyName?:string;
  name:string; city?:string; countyFips?:string; address?:string;
  headquartersState?:string;licenseIssuedAt?:string;licenseExpiresAt?:string;
  sourceUrl:string; sourceDate?:string|null; retrievedAt:string;
}
export function snapshotRegistryIdentity(row:SourceDirectoryRecord,sourceDate?:string):RegistryIdentity|undefined {
  const identifier=row[1]==='USFA'?row[0].split(':').slice(2).join(':'):row[0].slice('nppes:'.length);
  if(!identifier||row[1]==='USFA'&&/^location-/i.test(identifier))return undefined;
  return {sourceName:row[1]==='USFA'?'USFA NFDR':'NPPES',identifier,stateCode:row[3],name:row[2],city:row[4],countyFips:row[6],address:row[10],sourceUrl:row[1]==='USFA'?'https://apps.usfa.fema.gov/registry/search':row[11],postalCode:row[5],deactivatedAt:row[9]||undefined,sourceDate:sourceDate??null,retrievedAt:sourceDate&&/^\d{4}-\d{2}-\d{2}$/.test(sourceDate)?sourceDate:new Date().toISOString()};
}
export function registryIdentifierText(row: SourceDirectoryRecord): string {
  const identity=snapshotRegistryIdentity(row);
  if(row[1]==='USFA')return identity?'FDID '+identity.identifier+' ('+row[3]+')':'FDID not reported';
  return 'NPI '+row[0].slice('nppes:'.length);
}
export function findRegistryIdentityAccounts(identity:RegistryIdentity,agencies:Agency[]):Agency[]{
  const {identifier:id,stateCode:state,sourceName}=identity;
  const key=registryIdentityKey(identity);
  const national=sourceName==='NPPES'||sourceName==='NERIS';
  return agencies.filter(a=>(key&&a.registryIdentity&&registryIdentityKey(a.registryIdentity)===key)||((national||a.stateCode?.toUpperCase()===state)&&(a.sourceRecordAssociations??[]).some(s=>{
    if(s.decision!=='confirmed'||(!national&&s.sourceFields?.stateCode&&String(s.sourceFields.stateCode).toUpperCase()!==state))return false;
    if(sourceName==='NPPES')return /NPPES|NPI/i.test(s.sourceName)&&s.sourceRecordId===id;
    if(sourceName==='NERIS')return /^NERIS$/i.test(s.sourceName)&&s.sourceRecordId===id;
    if(sourceName==='State EMS')return s.sourceName==='State EMS'&&s.sourceRecordId===state+':'+id&&s.sourceFields?.identifierKind===identity.identifierKind;
    if(!/USFA|NFDR/i.test(s.sourceName))return false;
    const value=s.sourceRecordId.replace(/^usfa:/i,'');
    if(value.includes(':')&&value.split(':')[0].toUpperCase()!==state)return false;
    return value===id||value===state+':'+id||value===state+'-'+id||s.sourceFields?.fdid===id;
  })));
}
export function findLinkedRegistryAgency(row:SourceDirectoryRecord,agencies:Agency[]):Agency|undefined{
  const identity=snapshotRegistryIdentity(row);
  if(!identity)return undefined;
  const matches=findRegistryIdentityAccounts(identity,agencies);return matches.length===1?matches[0]:undefined;
}
/** Manual review only. Link identity evidence without mutating account ID or operational facts. */
export function createReviewedRegistryAssociation(identity:RegistryIdentity,agency:Agency,basis:string,agencies:Agency[]):AgencySourceRecordAssociation{
  if(agency.stateCode?.toUpperCase()!==identity.stateCode)throw Error('Account state does not match source record.');
  if(!basis.trim()||!identity.identifier||/^location-/i.test(identity.identifier))throw Error('A native identifier and match evidence are required.');
  if(findRegistryIdentityAccounts(identity,agencies).some(a=>a.id!==agency.id))throw Error('This source record is linked to another saved account. Review the conflict first.');
  if(agency.registryIdentity?.sourceName===identity.sourceName&&registryIdentityKey(agency.registryIdentity)!==registryIdentityKey(identity))throw Error('Account already has a different native identity in this registry.');
  if(agency.sourceRecordAssociations?.some(s=>s.decision==='confirmed'&&s.sourceName===identity.sourceName&&!findRegistryIdentityAccounts(identity,[{...agency,registryIdentity:undefined,sourceRecordAssociations:[s]}]).length))throw Error('Account already has a different confirmed identity in this registry. Review that association first.');
  const sourceRecordId=identity.sourceName==='USFA NFDR'||identity.sourceName==='State EMS'?identity.stateCode+':'+identity.identifier:identity.identifier;
  return {id:identity.sourceName+':'+sourceRecordId,sourceName:identity.sourceName,sourceRecordId,sourceUrl:identity.sourceUrl,decision:'confirmed',matchBasis:basis.trim(),sourceDate:identity.sourceDate,retrievedAt:identity.retrievedAt,decidedAt:new Date().toISOString(),sourceFields:{agencyName:identity.name,stateCode:identity.stateCode,city:identity.city??'',postalCode:identity.postalCode??'',countyFips:identity.countyFips??'',headquartersAddress:identity.address??'',...(identity.sourceName==='USFA NFDR'?{fdid:identity.identifier}:identity.sourceName==='NERIS'?{nerisId:identity.identifier}:identity.sourceName==='State EMS'?{stateAgencyId:identity.identifier,identifierKind:identity.identifierKind??'agency-code',...(identity.licenseIssuedAt?{licenseIssuedAt:identity.licenseIssuedAt}:{}),...(identity.licenseExpiresAt?{licenseExpiresAt:identity.licenseExpiresAt}:{}),...(identity.headquartersState?{headquartersState:identity.headquartersState}:{})}:{npi:identity.identifier})}};
}

/** Source namespace and record grain: NPI and NERIS are national, FDID and state EMS codes are state-scoped. */
export function registryIdentityKey(identity:RegistryIdentity):string|undefined{
 const id=identity.identifier?.trim().toUpperCase(),state=identity.stateCode?.toUpperCase();
 if(!id||!state||!/^[-A-Z0-9.]{1,80}$/.test(id)||/^LOCATION-/i.test(id)||!(/^[A-Z]{2}$/.test(state)))return undefined;
 if(identity.sourceName==='NPPES')return /^\d{10}$/.test(id)?'NPI:'+id:undefined;
 if(identity.sourceName==='NERIS')return 'NERIS:'+id;
 if(identity.sourceName==='USFA NFDR')return /^(?:[A-Z]{2}-(?:FD|EMS)-\d{5})/i.test(id)?undefined:'FDID:'+state+':'+id;
 if(identity.sourceName==='State EMS'&&['agency-code','license'].includes(identity.identifierKind??''))return 'STATE-EMS:'+state+':'+identity.identifierKind+':'+id;
 return undefined;
}
export function registryAccountId(identity:RegistryIdentity):string{
 const key=registryIdentityKey(identity);if(!key)throw Error('Invalid native registry identifier.');
 return 'registry-'+key.replaceAll(':','-');
}
export function registryIdentityLabel(identity:RegistryIdentity):string{
 return (identity.sourceName==='NPPES'?'NPI':identity.sourceName==='NERIS'?'NERIS ID':identity.sourceName==='USFA NFDR'?'FDID':identity.identifierKind==='license'?'State EMS license':'State agency code')+' '+identity.identifier;
}
function validNpiChecksum(value:string):boolean {
 const digits='80840'+value;
 return /^\d{10}$/.test(value)&&[...digits].reverse().reduce((sum,d,i)=>{const n=Number(d)*(i%2?2:1);return sum+(n>9?n-9:n)},0)%10===0;
}
export function canCreateRegistryAccount(identity:RegistryIdentity):boolean{
 if(!registryIdentityKey(identity)||!identity.name?.trim()||identity.deactivatedAt)return false;
 if(identity.sourceName==='State EMS'&&identity.stateCode==='OH'&&!['Paramedic','AEMT','EMT','EMR'].includes(identity.serviceLevel??''))return false;
 try {
  const u=new URL(identity.sourceUrl);if(u.protocol!=='https:'||u.username||u.password)return false;
  if(identity.sourceName==='USFA NFDR')return u.hostname==='apps.usfa.fema.gov';
  if(identity.sourceName==='NPPES')return u.hostname==='npiregistry.cms.hhs.gov'&&validNpiChecksum(identity.identifier);
  if(identity.sourceName==='NERIS')return u.hostname==='www.usfa.fema.gov'||u.hostname==='services5.arcgis.com';
  if(identity.stateCode==='FL')return identity.identifierKind==='license'&&/^\d{1,12}$/.test(identity.identifier)&&identity.headquartersState==='FL'&&u.href==='https://www.floridahealth.gov/wp-content/uploads/2025/08/ems-providers.pdf'&&['AIR/I','AIR/IR','AIR/IP','AIR/P','ALS/T','ALS/N','BLS/T','BLS/N'].includes(identity.serviceLevel??'')&&[identity.licenseIssuedAt,identity.licenseExpiresAt,identity.sourceDate].every(d=>typeof d==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&Number.isFinite(Date.parse(d))&&new Date(d).toISOString().slice(0,10)===d)&&identity.licenseIssuedAt!<=identity.sourceDate!&&identity.licenseExpiresAt!>=identity.sourceDate!;
  return identity.stateCode==='OH'&&identity.identifierKind==='agency-code'&&u.hostname==='ems.ohio.gov';
 }catch{return false}
}
export function findRegistryAccountCandidates(identity:RegistryIdentity,agencies:Agency[]):Agency[]{
 const norm=(v:string|undefined)=>(v??'').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g,'');
 const name=norm(identity.name),city=norm(identity.city),id=identity.identifier.toUpperCase();
 return agencies.filter(a=>{
  if(identity.sourceName==='NPPES'&&a.npiNumber===id)return true;
  if(a.stateCode?.toUpperCase()!==identity.stateCode)return false;
  if(identity.sourceName==='USFA NFDR'&&a.fdid?.toUpperCase()===id)return true;
  if(identity.sourceName==='State EMS'&&identity.identifierKind==='license'&&a.stateLicenseNumber?.toUpperCase()===id)return true;
  return !!name&&norm(a.name)===name&&(!city||!norm(a.city)||norm(a.city)===city);
 });
}
