import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateOhioRoster,ohioRegistryIdentity} from './stateEmsRoster';
import {createSourceNativeAgency} from './sourceNativeAgency';
import {registryAccountId,registryIdentityKey,canCreateRegistryAccount,createReviewedRegistryAssociation,findRegistryIdentityAccounts,type RegistryIdentity} from './registryAccountLink';
import {canBulkHydrateAgency,agencyIdentifierLabel} from '../utils/providerRecordTrust';
import {hasAgencyFactEvidence} from '../data/agencyFactEvidence';
import {calculateScore} from '../utils/pulseIqScoring';
import {applyAgencyMutation} from './agencyMutation';
import {auditLoadedProviderIdentities} from './providerIdentityAudit';
import type {SyncOutboxItem} from '../types';
const roster=validateOhioRoster(JSON.parse(readFileSync(new URL('../../public/registry/state-ems/OH.json',import.meta.url),'utf8')));
const eligible=roster.records.find(r=>r.serviceLevel==='Paramedic')!;
const identity=ohioRegistryIdentity(roster,eligible);
const account=createSourceNativeAgency(identity,[]);
test('bundled Ohio source has all 1520 distinct original agency codes',()=>{
 assert.equal(roster.records.length,1520);assert.equal(new Set(roster.records.map(r=>r.identifier)).size,1520);assert.equal(roster.sourceDate,'2026-05-05');
 assert.throws(()=>validateOhioRoster({...roster,records:[...roster.records,roster.records[0]]}),/duplicate/);
});
test('native account preserves exact code and does not manufacture operational or geographic data',()=>{
 assert.equal(account.id,registryAccountId(identity));assert.equal(account.fdid,'');assert.equal(account.npiNumber,undefined);assert.equal(account.stateLicenseNumber,undefined);
 assert.equal(account.county,'');assert.equal(account.latitude,null);assert.equal(account.annualCallVolume,null);assert.equal(account.installedFleet.defibUnitsCount,null);assert.equal(account.competitorContract.contractEndDate,'');assert.equal(account.isOperationalDataVerified,false);
 assert.equal(hasAgencyFactEvidence(account,'departmentRegistry'),true);assert.equal(hasAgencyFactEvidence(account,'defibrillatorBiomedicalFleet'),false);assert.equal(hasAgencyFactEvidence(account,'maintenanceContracts'),false);assert.equal(calculateScore(account),0);
 assert.equal(agencyIdentifierLabel(account),'State agency code '+identity.identifier);assert.equal(canBulkHydrateAgency(account),true);assert.equal(canBulkHydrateAgency({...account,id:'legacy'}),false);
});
test('namespaces, checksum, and source scope prevent false account creation',()=>{
 const fire:RegistryIdentity={...identity,sourceName:'USFA NFDR',identifier:'00123',sourceUrl:'https://apps.usfa.fema.gov/registry/search'};
 assert.equal(registryIdentityKey(fire),'FDID:OH:00123');assert.notEqual(registryIdentityKey(fire),registryIdentityKey({...fire,stateCode:'PA'}));
 assert.equal(canCreateRegistryAccount({...fire,identifier:'OH-FD-12345'}),false);assert.equal(canCreateRegistryAccount({...identity,serviceLevel:'None'}),false);
 const npi:RegistryIdentity={...identity,sourceName:'NPPES',identifier:'1234567893',sourceUrl:'https://npiregistry.cms.hhs.gov/provider-view/1234567893'};
 assert.equal(canCreateRegistryAccount(npi),true);assert.equal(canCreateRegistryAccount({...npi,identifier:'1234567890'}),false);
 assert.equal(registryIdentityKey(npi),registryIdentityKey({...npi,stateCode:'PA'}));assert.equal(canCreateRegistryAccount({...npi,deactivatedAt:'2025-01-01'}),false);
 assert.throws(()=>createSourceNativeAgency(identity,[account]),/already/);
 assert.throws(()=>createSourceNativeAgency(identity,[{...account,id:'legacy',registryIdentity:undefined}]),/possible existing/);
});
test('manual state agency association matches the original namespace and does not become a license',()=>{
 const legacy={...account,id:'legacy',registryIdentity:undefined};
 const association=createReviewedRegistryAssociation(identity,legacy,'Reviewed source listing',[]);
 const linked={...legacy,sourceRecordAssociations:[association]};
 assert.equal(findRegistryIdentityAccounts(identity,[linked]).length,1);
 assert.equal(agencyIdentifierLabel(linked),'State agency code '+identity.identifier);
 assert.doesNotThrow(()=>createReviewedRegistryAssociation(identity,linked,'Rechecked',[]));
});
test('creation replay preserves a more recent account and rejects a different identity',()=>{
 const item={actionType:'CREATE_AGENCY',payload:{agency:account}} as SyncOutboxItem;
 const existing={...account,isBookmarked:true};
 assert.equal(applyAgencyMutation(existing,item,true).isBookmarked,true);
 assert.throws(()=>applyAgencyMutation({...existing,registryIdentity:{...identity,identifier:'DIFFERENT'}},item,true),/already exists/);
});
test('loaded identity audit flags review candidates without including private fields',()=>{
 const copy={...account,id:'legacy',keyContacts:[{name:'PRIVATE CONTACT'}] as typeof account.keyContacts};
 const audit=auditLoadedProviderIdentities([account,copy]);
 assert.equal(audit.totals.loaded,2);assert.equal(audit.identifierConflicts.length,1);
 assert.equal(JSON.stringify(audit).includes('PRIVATE CONTACT'),false);
});
