import test from 'node:test';
import assert from 'node:assert/strict';
import type {Agency} from '../types';
import {profileCmsLookupNpi,parseCmsServiceEvidence} from './cmsAmbulanceEvidence';
test('valid recorded NPI can be queried without a state verification record',()=>{
 const a={id:'test',stateCode:'NY',npiNumber:'1003006180'} as Agency;
 assert.equal(profileCmsLookupNpi(a).npi,'1003006180');
 assert.equal(profileCmsLookupNpi({...a,npiNumber:'1234567890'}).npi,null);
 assert.throws(()=>parseCmsServiceEvidence({npi:a.npiNumber,rows:[]},a.npiNumber!));
});

test('unrelated state registry errors cannot gate the federal NPI lookup',()=>{
 const stateClaim={id:'state-legacy',sourceName:'State EMS',decision:'confirmed',sourceRecordId:'NY:0012',sourceUrl:'https://example.invalid',sourceFields:{stateCode:'NY'},matchBasis:'Legacy source',decidedAt:'2026-11-25T00:00:00Z'};
 const a={id:'test',stateCode:'NY',npiNumber:'1003006180',sourceRecordAssociations:[stateClaim]} as unknown as Agency;
 assert.equal(profileCmsLookupNpi(a).npi,'1003006180');
 const conflict={...stateClaim,id:'npi-legacy',sourceName:'NPPES'};
 assert.equal(profileCmsLookupNpi({...a,sourceRecordAssociations:[conflict]} as unknown as Agency).npi,null);
});
