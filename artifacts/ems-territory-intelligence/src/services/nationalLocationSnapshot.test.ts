import test from 'node:test';
import assert from 'node:assert/strict';
import {parseSnapshotEntry,enrichRegistryRow,snapshotMapRows,listingLocation,type LocationState} from './nationalLocationSnapshot';
import type {SourceDirectoryRecord} from './nationalSourceDirectory';
const e={key:'NPI:1234567893',name:'Example EMS',state:'FL',source:'NPPES',sourceDate:'2026-11-09 monthly release',address:{street:'123 Main Street',city:'Example',state:'FL',zip:'32901'},status:'mapped',match:{latitude:28.1,longitude:-80.6,matchedAddress:'123 MAIN ST, EXAMPLE, FL, 32901',method:'census-address-range'},sourceCounty:'',countyFips:'12009'};
const row:SourceDirectoryRecord=['nppes:1234567893','NPPES','Example EMS','FL','Example','32901','','','unassigned','','','https://npiregistry.cms.hhs.gov/provider-view/1234567893'];
test('snapshot binds coordinates to a matching street, and rejects malformed or unmapped coordinates',()=>{
 const p=parseSnapshotEntry(e,'FL',{'12009':'Brevard County'});assert.equal(p.countyName,'Brevard County');
 assert.throws(()=>parseSnapshotEntry({...e,match:{...e.match,matchedAddress:'456 MAIN ST, EXAMPLE, FL, 32901'}},'FL',{'12009':'Brevard County'}));
 assert.throws(()=>parseSnapshotEntry({...e,status:'no-match'},'FL',{'12009':'Brevard County'}));
 assert.throws(()=>parseSnapshotEntry(e,'GA',{'12009':'Brevard County'}));
});
test('registry display gets the exact NPI address and county, without rewriting source rows',()=>{
 const p=parseSnapshotEntry(e,'FL',{'12009':'Brevard County'});
 const state:LocationState={generatedAt:'2026-11-24T00:00:00Z',entries:new Map([[p.key,p]]),nppesProcessed:true};
 const enriched=enrichRegistryRow(row,state);assert.equal(enriched[10],'123 Main Street');assert.equal(enriched[6],'12009');assert.equal(enriched[8],'census-address-range');assert.equal(row[10],'');
 const wrong=[...row] as SourceDirectoryRecord;wrong[2]='Different name';assert.equal(enrichRegistryRow(wrong,state)[10],'');
 assert.equal(snapshotMapRows(state,{county:'Brevard',city:'all',category:'ems'}).length,1);
 assert.equal(snapshotMapRows(state,{county:'all',city:'all',category:'fire'}).length,0);
 const different=[...row] as SourceDirectoryRecord;different[10]='456 Main Street';assert.equal(enrichRegistryRow(different,state)[10],'456 Main Street');
});

test('every directory listing receives a location outcome; no missing-ID or conflicting record gets a pin',()=>{
 const p=parseSnapshotEntry(e,'FL',{'12009':'Brevard County'});
 const state:LocationState={generatedAt:'2026-11-24T00:00:00Z',entries:new Map([[p.key,p]]),nppesProcessed:true};
 assert.equal(listingLocation(row,state).status,'mapped');
 const noZip=[...row] as SourceDirectoryRecord;noZip[5]='';noZip[10]='123 Main Street';assert.equal(listingLocation(noZip,state).address?.zip,'32901');
 const wrongZip=[...noZip] as SourceDirectoryRecord;wrongZip[5]='32902';assert.equal(listingLocation(wrongZip,state).status,'review');
 const wrongCounty=[...row] as SourceDirectoryRecord;wrongCounty[6]='12011';assert.equal(listingLocation(wrongCounty,state).match,null);
 const historic=[...row] as SourceDirectoryRecord;historic[9]='2025-01-01';assert.equal(listingLocation(historic,state).status,'historical');
 const noId:SourceDirectoryRecord=['usfa:FL:location-0123456789abcdef0123','USFA','Example Fire','FL','Example','32901','','','unassigned','','123 Main Street',''];
 assert.equal(listingLocation(noId,state).status,'missing-identity');assert.equal(listingLocation(noId,state).match,null);assert.ok(listingLocation(noId,state).address);
 assert.equal(listingLocation(row,undefined).status,'source-missing');
});
