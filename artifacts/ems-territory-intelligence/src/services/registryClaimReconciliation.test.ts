import test from 'node:test';
import assert from 'node:assert/strict';
import type {Agency} from '../types';
import {createReviewedRegistryAssociation,confirmedRegistryKey,findRegistryIdentityAccounts,findRegistryAccountCandidates,registryClaims,type RegistryIdentity} from './registryAccountLink';
import {eligiblePriorityAccounts} from './reviewedAccountPriorities';
import {auditLoadedProviderIdentities} from './providerIdentityAudit';
const identity:RegistryIdentity={sourceName:'USFA NFDR',identifier:'00123',stateCode:'FL',name:'Fixture',sourceUrl:'https://apps.usfa.fema.gov/registry/search',retrievedAt:'2026-11-25'};
const a={id:'a',name:'Fixture',stateCode:'FL',city:'Town',registryIdentity:identity} as Agency;
const b={id:'b',name:'Other',stateCode:'FL',city:'Other'} as Agency;
const association=createReviewedRegistryAssociation(identity,b,'Fixture review',[]);
test('exact record and field agreement is required, malformed claims remain duplicate review candidates',()=>{
 assert.equal(confirmedRegistryKey(association,'FL'),'FDID:FL:00123');
 assert.equal(findRegistryIdentityAccounts(identity,[{...b,sourceRecordAssociations:[association]}]).length,1);
 for(const s of [{...association,sourceRecordId:'FL:00999'},{...association,sourceUrl:'https://example.org'},{...association,sourceFields:{...association.sourceFields,stateCode:'GA'}},{...association,sourceFields:{...association.sourceFields,fdid:'00999'}}]){
  const candidate={...b,sourceRecordAssociations:[s]};
  assert.equal(findRegistryIdentityAccounts(identity,[candidate]).length,0);
  assert.equal(findRegistryAccountCandidates(identity,[candidate]).length,1);
  assert.throws(()=>createReviewedRegistryAssociation(identity,a,'Fixture review',[candidate]));
 }
});
test('a reviewed claim on another account blocks loaded-account command eligibility without merging',()=>{
 const duplicate={...b,sourceRecordAssociations:[association]};
 assert.equal(eligiblePriorityAccounts([a,duplicate]).length,0);
 assert.equal(eligiblePriorityAccounts([a,{...duplicate,stateCode:'GA',sourceRecordAssociations:[]}]).length,1);
 const other=createReviewedRegistryAssociation({...identity,identifier:'00999'},b,'Fixture review',[]);
 const conflicted={...a,sourceRecordAssociations:[other]};
 assert.deepEqual(registryClaims(conflicted).conflicts,[['FDID:FL:00123','FDID:FL:00999']]);
 assert.equal(eligiblePriorityAccounts([conflicted]).length,0);
 assert.equal(auditLoadedProviderIdentities([conflicted]).conflictingSourceClaims.length,1);
 assert.equal(auditLoadedProviderIdentities([{...a,sourceRecordAssociations:[{...association,sourceUrl:'https://example.org'}]}]).invalidReviewedClaims.length,1);
});
