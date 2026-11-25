import test from 'node:test';
import assert from 'node:assert/strict';
import type {Agency} from '../types';
import {facilityParents,facilityDirections,stationMapBounds,type Facility} from './departmentFacilities';
test('only exact native or reviewed parent identities permit station lookup',()=>{
 const base={stateCode:'FL',fdid:'12345',name:'Fixture'} as Agency;
 assert.deepEqual(facilityParents(base),[]);
 const direct={...base,registryIdentity:{sourceName:'USFA NFDR',identifier:'12345',stateCode:'FL',name:'Fixture',sourceUrl:'https://apps.usfa.fema.gov/registry/search',retrievedAt:'2026-11-25'}} as Agency;
 assert.deepEqual(facilityParents(direct),[{source:'USFA NFDR',stateCode:'FL',identifier:'12345'}]);
 assert.deepEqual(facilityParents({...direct,registryIdentity:{...direct.registryIdentity!,stateCode:'GA'}}),[]);
});
test('directions require a source street and never use unreviewed point geometry',()=>{
 const f={address:'123 Main St',city:'Example',stateCode:'FL',postalCode:'33602',coordinates:{latitude:1,longitude:2}} as Facility;
 assert.match(facilityDirections(f)!,/123%20Main%20St/);assert.equal(facilityDirections({...f,address:'PO Box 123'}),undefined);assert.equal(facilityDirections({...f,postalCode:null}),undefined);
});

test('station map bounds use literal coordinates without a global Google Maps constructor',()=>{
 assert.equal(stationMapBounds([]),undefined);
 assert.deepEqual(stationMapBounds([{lat:27,lng:-82},{lat:29,lng:-80}]),{south:27,west:-82,north:29,east:-80});
 assert.deepEqual(stationMapBounds([{lat:27,lng:-82}]),{south:27,west:-82,north:27,east:-82});
 assert.equal(stationMapBounds([{lat:NaN,lng:-82}]),undefined);
 assert.equal(stationMapBounds([{lat:91,lng:-82}]),undefined);
});
