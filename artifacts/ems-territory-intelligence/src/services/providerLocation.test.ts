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

test('source street can display without a ZIP but no ZIP is invented',()=>{
 const b={...a,registryIdentity:{...a.registryIdentity!,postalCode:undefined}};const loc=recordedProviderLocation(b,[b]);assert.ok(loc);assert.equal(loc.address.zip,'');assert.match(decodeURIComponent(locationDirections(loc)),/123 Main Street, Example, FL/);
});

test('official full-address source link is parsed without repeating its city or state',()=>{
 const b={...a,id:'saved-fire',registryIdentity:undefined,sourceRecordAssociations:[{id:'USFA NFDR:FL:F123',sourceName:'USFA NFDR',sourceRecordId:'FL:F123',sourceUrl:'https://apps.usfa.fema.gov/registry/search',decision:'confirmed',sourceFields:{fdid:'F123',agencyName:a.name,stateCode:'FL',city:'Example',headquartersAddress:'123 Main Street, Suite 2, Example, FL, 32901'}}]} as Agency;
 const loc=recordedProviderLocation(b,[b]);assert.ok(loc);assert.equal(loc.address.street,'123 Main Street, Suite 2');assert.equal(loc.address.zip,'32901');
 const wrong={...b,sourceRecordAssociations:[{...b.sourceRecordAssociations![0],sourceRecordId:'FL:OTHER'}]} as Agency;assert.equal(recordedProviderLocation(wrong,[wrong]),undefined);
});
test('a complete matching source address is preferred over a duplicate link that omitted ZIP',()=>{
 const b={...a,sourceRecordAssociations:[{id:'USFA NFDR:FL:F123',sourceName:'USFA NFDR',sourceRecordId:'FL:F123',sourceUrl:'https://apps.usfa.fema.gov/registry/search',decision:'confirmed',sourceFields:{fdid:'F123',agencyName:a.name,stateCode:'FL',city:'Example',headquartersAddress:'123 Main Street'}}]} as Agency;
 assert.equal(recordedProviderLocation(b,[b])?.address.zip,'32901');
 const conflict={...b,sourceRecordAssociations:[{...b.sourceRecordAssociations![0],sourceFields:{...b.sourceRecordAssociations![0].sourceFields,postalCode:'32902'}}]} as Agency;
 assert.equal(recordedProviderLocation(conflict,[conflict]),undefined);
});
