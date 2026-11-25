import type {Agency} from '../types';
import {buildAgencyIdentityIndex} from './agencyIdentityIndex';
import {isGeographicProspect,isGeneratedFdid,canBulkHydrateAgency} from '../utils/providerRecordTrust';
import {registryIdentityKey,registryClaims,canCreateRegistryAccount} from './registryAccountLink';
const normalized=(value:string|undefined)=>(value??'').normalize('NFKC').toLowerCase().replace(/[^a-z0-9]+/g,'');
export function auditLoadedProviderIdentities(agencies:Agency[],createdAt=new Date().toISOString()){
 const index=buildAgencyIdentityIndex(agencies);
 const claims=agencies.map(a=>({agency:a,...registryClaims(a)}));
 const nameGroups=new Map<string,{id:string;name:string;stateCode:string;city:string}[]>();
 const ids=new Map<string,number>();
 for(const a of agencies){
  ids.set(a.id,(ids.get(a.id)??0)+1);
  if(!a.stateCode||!normalized(a.name)||!normalized(a.city))continue;
  const key=[a.stateCode.toUpperCase(),normalized(a.city),normalized(a.name)].join(':');
  const rows=nameGroups.get(key)??[];
  rows.push({id:a.id,name:a.name,stateCode:a.stateCode,city:a.city});nameGroups.set(key,rows);
 }
 return {schemaVersion:1,createdAt,scope:'Currently loaded workspace accounts only; not a production database census. No changes made.',
 totals:{loaded:agencies.length,sourceNative:agencies.filter(a=>a.registryIdentity&&registryIdentityKey(a.registryIdentity)).length,generatedProspects:agencies.filter(isGeographicProspect).length,unlinked:index.unlinked,eligibleForExplicitBulkSync:agencies.filter(canBulkHydrateAgency).length},
 duplicateAccountIds:[...ids].filter(([,n])=>n>1).map(([id,count])=>({id,count})),
 identifierConflicts:index.conflicts.map(c=>({key:c.key,accounts:c.items.map(i=>({id:i.agencyId,name:i.agencyName,basis:i.basis}))})),
 possibleNameDuplicates:[...nameGroups.values()].filter(rows=>new Set(rows.map(r=>r.id)).size>1),
 remainingSyntheticFdid:agencies.filter(a=>isGeneratedFdid(a.fdid,a)).map(a=>({id:a.id,name:a.name,fdid:a.fdid})),
 invalidNativeIdentities:agencies.filter(a=>a.registryIdentity&&(!canCreateRegistryAccount(a.registryIdentity)||a.registryIdentity.stateCode!==a.stateCode)).map(a=>({id:a.id,name:a.name})),
 conflictingSourceClaims:claims.filter(c=>c.conflicts.length).map(c=>({id:c.agency.id,name:c.agency.name,keys:c.conflicts})),
 invalidReviewedClaims:claims.filter(c=>c.invalid.length).map(c=>({id:c.agency.id,name:c.agency.name,associationIds:c.invalid}))};
}
