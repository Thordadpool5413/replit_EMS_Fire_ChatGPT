import test from 'node:test';
import assert from 'node:assert/strict';
import type {Agency} from '../types';
import type {Facility} from './departmentFacilities';
import type {StationSample} from './stationCompetitiveMap';
import {buildStationOpportunityQueue} from './stationOpportunityQueue';
const a={id:'a',name:'Fixture A',stateCode:'FL',registryIdentity:{sourceName:'NERIS',identifier:'FD12345678',stateCode:'FL'}} as Agency;
const b={...a,id:'b',name:'Fixture B',registryIdentity:{...a.registryIdentity!,identifier:'FD98765432'}} as Agency;
const sample=(agency:Agency,station:string,withEvidence=false):StationSample=>({agencyId:agency.id,parentId:agency.registryIdentity!.identifier,facilities:[{source:'NERIS',sourceRecordId:station,stateCode:'FL',coordinates:null} as Facility],observations:withEvidence?[{stationId:station,family:'monitors',maker:'stryker',observedOn:'2026-01-01'}]:[],withheldEvidence:0,checkedAt:'2026-02-01',sourceRetrievedAt:'2026-02-01'});
test('research queue separates unknown stations from dated competitor observations and never predicts a replacement date',()=>{
 const rows=buildStationOpportunityQueue([a,b],[sample(a,'S1'),sample(b,'S2',true)],[],'monitors',365,'2026-02-01').rows;
 assert.equal(rows[0].agency.id,'b');assert.equal(rows[0].priority,'equipment-check');assert.equal(rows[0].deadline,undefined);assert.equal(rows[1].priority,'research-gap');assert.equal(rows[1].unknown,1);assert.equal(rows[0].documentsAvailable,false);
 assert.equal(buildStationOpportunityQueue([a,b],[sample(a,'S1'),sample(b,'S1',true)],[],'all',365,'2026-02-01').duplicateStations,1);
 assert.equal(buildStationOpportunityQueue([a,b],[sample(a,'S1'),{...sample(b,'S2'),parentId:sample(a,'S1').parentId}],[],'all',365,'2026-02-01').withheld,2);
});
