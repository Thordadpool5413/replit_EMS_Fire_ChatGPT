import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyStationSample,type StationSample} from './stationCompetitiveMap';
import type {Facility} from './departmentFacilities';
const facility=(id:string)=>({source:'NERIS',sourceRecordId:id,stateCode:'FL',coordinates:null} as Facility);
const sample:StationSample={agencyId:'ci',parentId:'FD1',facilities:[facility('S1'),facility('S2'),facility('S3')],observations:[{stationId:'S1',family:'monitors',maker:'zoll',observedOn:'2026-01-01'},{stationId:'S1',family:'cpr',maker:'stryker',observedOn:'2026-01-02'},{stationId:'S2',family:'monitors',maker:'unknown',observedOn:'2026-01-02'},{stationId:'S3',family:'monitors',maker:'philips',observedOn:'2024-01-01'}],withheldEvidence:0,checkedAt:'2026-02-01',sourceRetrievedAt:'2026-02-01'};
test('dated reviewed evidence is scoped by station, category and age, never inferred from missing data',()=>{
 const all=classifyStationSample([sample],'all',365,'2026-02-01');assert.deepEqual(all.counts,{zoll:0,competitor:0,mixed:1,unknown:2});assert.equal(all.mixedDepartments,1);
 const monitors=classifyStationSample([sample],'monitors',365,'2026-02-01');assert.deepEqual(monitors.counts,{zoll:1,competitor:0,mixed:0,unknown:2});assert.equal(monitors.rows.find(r=>r.facility.sourceRecordId==='S3')?.older,1);
 const duplicates=classifyStationSample([sample,{...sample,agencyId:'other',facilities:[facility('S1')]}],'all',365,'2026-02-01');assert.equal(duplicates.ambiguous,1);assert.equal(duplicates.rows.length,2);
});
