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
