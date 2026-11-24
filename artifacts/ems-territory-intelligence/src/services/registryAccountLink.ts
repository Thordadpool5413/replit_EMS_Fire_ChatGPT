import type { Agency, AgencySourceRecordAssociation } from '../types';
import type { SourceDirectoryRecord } from './nationalSourceDirectory';

export interface RegistryIdentity {
  sourceName:'USFA NFDR'|'NPPES'|'NERIS'; identifier:string; stateCode:string;
  name:string; city?:string; countyFips?:string; address?:string;
  sourceUrl:string; sourceDate?:string|null; retrievedAt:string;
}
export function snapshotRegistryIdentity(row:SourceDirectoryRecord,sourceDate?:string):RegistryIdentity|undefined {
  const identifier=row[1]==='USFA'?row[0].split(':').slice(2).join(':'):row[0].slice('nppes:'.length);
  if(!identifier||row[1]==='USFA'&&/^location-/i.test(identifier))return undefined;
  return {sourceName:row[1]==='USFA'?'USFA NFDR':'NPPES',identifier,stateCode:row[3],name:row[2],city:row[4],countyFips:row[6],address:row[10],sourceUrl:row[1]==='USFA'?'https://apps.usfa.fema.gov/registry/search':row[11],sourceDate:sourceDate??null,retrievedAt:sourceDate&&/^\d{4}-\d{2}-\d{2}$/.test(sourceDate)?sourceDate:new Date().toISOString()};
}
export function registryIdentifierText(row: SourceDirectoryRecord): string {
  const identity=snapshotRegistryIdentity(row);
  if(row[1]==='USFA')return identity?'FDID '+identity.identifier+' ('+row[3]+')':'FDID not reported';
  return 'NPI '+row[0].slice('nppes:'.length);
}
export function findRegistryIdentityAccounts(identity:RegistryIdentity,agencies:Agency[]):Agency[]{
  const {identifier:id,stateCode:state,sourceName}=identity;
  return agencies.filter(a=>a.stateCode?.toUpperCase()===state&&(a.sourceRecordAssociations??[]).some(s=>{
    if(s.decision!=='confirmed'||s.sourceFields?.stateCode&&String(s.sourceFields.stateCode).toUpperCase()!==state)return false;
    if(sourceName==='NPPES')return /NPPES|NPI/i.test(s.sourceName)&&s.sourceRecordId===id;
    if(sourceName==='NERIS')return /^NERIS$/i.test(s.sourceName)&&s.sourceRecordId===id;
    if(!/USFA|NFDR/i.test(s.sourceName))return false;
    const value=s.sourceRecordId.replace(/^usfa:/i,'');
    if(value.includes(':')&&value.split(':')[0].toUpperCase()!==state)return false;
    return value===id||value===state+':'+id||value===state+'-'+id||s.sourceFields?.fdid===id;
  }));
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
  if(agency.sourceRecordAssociations?.some(s=>s.decision==='confirmed'&&s.sourceName===identity.sourceName&&s.sourceRecordId!==(identity.sourceName==='USFA NFDR'?identity.stateCode+':'+identity.identifier:identity.identifier)&&!(identity.sourceName==='USFA NFDR'&&[identity.identifier,'usfa:'+identity.stateCode+':'+identity.identifier,identity.stateCode+'-'+identity.identifier].includes(s.sourceRecordId))))throw Error('Account already has a different confirmed identity in this registry. Review that association first.');
  const sourceRecordId=identity.sourceName==='USFA NFDR'?identity.stateCode+':'+identity.identifier:identity.identifier;
  return {id:identity.sourceName+':'+sourceRecordId,sourceName:identity.sourceName,sourceRecordId,sourceUrl:identity.sourceUrl,decision:'confirmed',matchBasis:basis.trim(),sourceDate:identity.sourceDate,retrievedAt:identity.retrievedAt,decidedAt:new Date().toISOString(),sourceFields:{agencyName:identity.name,stateCode:identity.stateCode,city:identity.city??'',countyFips:identity.countyFips??'',headquartersAddress:identity.address??'',...(identity.sourceName==='USFA NFDR'?{fdid:identity.identifier}:identity.sourceName==='NERIS'?{nerisId:identity.identifier}:{npi:identity.identifier})}};
}
