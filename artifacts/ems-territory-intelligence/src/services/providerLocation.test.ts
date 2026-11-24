import test from 'node:test';
import assert from 'node:assert/strict';
import type {Agency} from '../types';
import {recordedProviderLocation,locationDirections,canResearchProviderLocation} from './providerLocation';
const a={id:'registry-FDID-FL-F123',name:'Example Fire Department',stateCode:'FL',city:'Example',zipCode:'32901',address:'',registryIdentity:{sourceName:'USFA NFDR',identifier:'F123',stateCode:'FL',name:'Example Fire Department',city:'Example',postalCode:'32901',address:'123 Main Street',sourceUrl:'https://apps.usfa.fema.gov/registry/search',retrievedAt:'2026-11-17'}} as Agency;
test('registry street address is available even when saved address is blank; directions use full street',()=>{
 const loc=recordedProviderLocation(a,[a]);assert.ok(loc);assert.equal(loc.address.street,'123 Main Street');assert.match(decodeURIComponent(locationDirections(loc)),/123 Main Street, Example, FL 32901/);
});
test('duplicate source identities and flagged addresses are withheld; modeled addresses cannot be promoted',()=>{
 assert.equal(recordedProviderLocation(a,[a,{...a,id:'duplicate'}]),undefined);
 assert.equal(recordedProviderLocation({...a,_factReviews:[{fieldId:'identity.address',action:'flag'}]} as Agency,[a]),undefined);
 const generated={...a,id:'fire-fl-12009',registryIdentity:undefined,address:'123 Main Street'};assert.equal(canResearchProviderLocation(generated,[generated]),false);
});
