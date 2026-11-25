import test from 'node:test';import assert from 'node:assert/strict';import type {Agency} from '../types';import {buildAgencyIdentityIndex} from './agencyIdentityIndex';
const agency=(id:string,stateCode='FL')=>({id,name:id,stateCode,fdid:'123',npiNumber:'1234567890',sourceRecordAssociations:[]}) as unknown as Agency;
test('identifiers are state-scoped and shared identifiers never merge agencies',()=>{
 const a=agency('a'),b=agency('b','TX');const index=buildAgencyIdentityIndex([a,b]);assert.equal(index.conflicts.length,1);assert.equal(index.conflicts[0].key,'NPI:1234567890');assert.equal(index.links.length,4);assert.equal(a.id,'a');
});
test('generated IDs are excluded and rejected associations stay excluded',()=>{
 const a={...agency('a'),verificationSource:'Geographic prospect generator'};assert.equal(buildAgencyIdentityIndex([a]).links.length,0);
 const b={...a,sourceRecordAssociations:[{id:'x',sourceName:'NPPES',sourceRecordId:'1234567890',decision:'confirmed',matchBasis:'Agency confirmed billing entity',decidedAt:'2026-11-15',sourceUrl:'https://example.org'}]} as Agency;
 assert.equal(buildAgencyIdentityIndex([b]).links[0].reviewedAt,'2026-11-15');
 assert.equal(buildAgencyIdentityIndex([{...b,sourceRecordAssociations:b.sourceRecordAssociations!.map(s=>({...s,decision:'rejected'}))}]).links.length,0);
});

test('recorded state license collides with source-native license but not another state or agency code',()=>{
 const recorded={...agency('recorded'),npiNumber:undefined,fdid:undefined,stateLicenseNumber:'00123'};
 const native={...agency('native'),npiNumber:undefined,fdid:undefined,registryIdentity:{sourceName:'State EMS',identifier:'00123',identifierKind:'license',stateCode:'FL',name:'Fixture',sourceUrl:'https://www.floridahealth.gov/',retrievedAt:'2026-11-25'}} as Agency;
 const different={...native,id:'different',stateCode:'TX',registryIdentity:{...native.registryIdentity!,stateCode:'TX'}};
 const code={...native,id:'code',registryIdentity:{...native.registryIdentity!,identifierKind:'agency-code' as const}};
 assert.deepEqual(buildAgencyIdentityIndex([recorded,native,different,code]).conflicts.map(c=>c.key),['STATE-EMS:FL:license:00123']);
});
