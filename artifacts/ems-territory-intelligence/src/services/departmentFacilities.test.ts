import test from 'node:test';
import assert from 'node:assert/strict';
import type {Agency} from '../types';
import {facilityParents,facilityDirections,stationMapBounds,validateFacilityResult,facilityCoverage,type Facility,type FacilityResult} from './departmentFacilities';
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

test('facility coverage preserves cross-state rows and withholds ambiguous payloads',()=>{
 const parent={source:'NERIS' as const,stateCode:'FL',identifier:'FD12345678'};
 const f:Facility={source:'NERIS',sourceRecordId:'ST123456789012',name:'Fixture',address:'123 Main St',city:'Example',stateCode:'GA',postalCode:'30001',coordinates:{latitude:33,longitude:-84},sourceUrl:"https://services5.arcgis.com/example/FeatureServer/1/query?where="+encodeURIComponent("neris_id='ST123456789012'"),exportDate:null,endUserValidationRequired:true};
 const result:FacilityResult={parent,facilities:[f],withheld:0,reportedStationCount:2,retrievedAt:'2026-11-25T12:00:00Z',warning:null};
 assert.equal(validateFacilityResult(result,parent),result);
 assert.deepEqual(facilityCoverage(result),{rows:1,withStreet:1,withPoint:1,crossState:1,missingNativeId:0,reported:2,partial:false,countMismatch:true});
 assert.equal(facilityCoverage({...result,withheld:1}).partial,true);
 for(const bad of [{...result,parent:{...parent,identifier:'OTHER'}},{...result,facilities:[f,f]},{...result,facilities:[{...f,sourceUrl:'https://other.example'}]},{...result,facilities:[{...f,coordinates:{latitude:0,longitude:0}}]},{...result,facilities:[{...f,endUserValidationRequired:false}]}])assert.throws(()=>validateFacilityResult(bad,parent));
 assert.equal(facilityDirections({...f,address:'123 Private Mailbox 4'}),undefined);
 assert.equal(facilityDirections({...f,address:'123 Main St, Other, GA 30001'}),undefined);
});
