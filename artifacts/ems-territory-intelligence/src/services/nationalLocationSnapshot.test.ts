import test from 'node:test';
import assert from 'node:assert/strict';
import {applyOfficialAddressEvidence,snapshotSourceUrl,parseSnapshotEntry,enrichRegistryRow,snapshotMapRows,listingLocation,type LocationState} from './nationalLocationSnapshot';
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

test('USDOT NAD point retains authority, placement, release and county; conflicting or missing metadata fail closed',()=>{
 const nad={...e,match:{...e.match,method:'nad-address-point',point:{objectId:42,release:'2026-09-30',authority:'Example county GIS',placement:'Structure - Rooftop',countyFips:'12009'}}};
 const p=parseSnapshotEntry(nad,'FL',{'12009':'Brevard County'});assert.equal(p.match?.method,'nad-address-point');
 if(p.match?.method==='nad-address-point')assert.equal(p.match.point.objectId,42);
 assert.throws(()=>parseSnapshotEntry({...nad,match:{...nad.match,point:{...nad.match.point,countyFips:'12011'}}},'FL',{'12009':'Brevard County'}));
 assert.throws(()=>parseSnapshotEntry({...nad,match:{...nad.match,point:{...nad.match.point,placement:'Linear Geocode'}}},'FL',{'12009':'Brevard County'}));
});

test('official source recovery fills only exact missing fire identities, with distinct attribution and no invented pin',()=>{
 const raw=parseSnapshotEntry({key:'FDID:NY:15033',name:'Farnham Volunteer Fire Department',state:'NY',source:'USFA',sourceDate:'2026-11-24',address:null,status:'source-missing',match:null,sourceCounty:'36029',countyFips:''},'NY',{});
 const p=applyOfficialAddressEvidence(raw);
 assert.equal(p.address?.street,'526 Commercial St');assert.equal(p.status,'pending');assert.equal(p.match,null);assert.equal(raw.address,null);
 assert.equal(snapshotSourceUrl(p),'https://www3.erie.gov/fire/fire-departmentsems-agencies');
 assert.equal(applyOfficialAddressEvidence({...raw,name:'Different department'}).address,null);
 assert.equal(applyOfficialAddressEvidence({...raw,sourceCounty:'36031'}).address,null);
 assert.equal(applyOfficialAddressEvidence({...raw,status:'historical'}).address,null);
 assert.equal(applyOfficialAddressEvidence({...raw,address:{street:'100 Other Street',city:'Farnham',state:'NY',zip:'14061'}}).address?.street,'100 Other Street');
 const row:SourceDirectoryRecord=['usfa:NY:15033','USFA','Farnham Volunteer Fire Department','NY','Farnham','14061','36029','Erie','source-county','','',''];
 const state:LocationState={generatedAt:'2026-11-24T00:00:00Z',entries:new Map([[p.key,p]]),nppesProcessed:true};
 assert.equal(enrichRegistryRow(row,state)[10],'');
 assert.equal(listingLocation(row,state).officialAddressEvidence?.authority,'Erie County Fire Safety');
 assert.equal(listingLocation(row,state).address?.street,'526 Commercial St');assert.equal(listingLocation(row,state).match,null);
 assert.equal(snapshotMapRows(state,{county:'all',city:'all',category:'fire'}).length,0);
 const wrong=[...row] as SourceDirectoryRecord;wrong[6]='36031';assert.equal(listingLocation(wrong,state).status,'review');
});

test('Ohio LBRS points preserve official source attribution and refuse out-of-state or mismatched county coordinates',()=>{
 const oh={...e,state:'OH',address:{street:'29 W Third ST',city:'Manchester',state:'OH',zip:'45144'},countyFips:'39001',match:{latitude:38.7,longitude:-83.6,matchedAddress:'29 W THIRD STREET, MANCHESTER, OH, 45144',method:'ohio-lbrs-address-point',point:{objectId:7,sourceDate:'2025-06-24',countyFips:'39001'}}};
 assert.equal(parseSnapshotEntry(oh,'OH',{'39001':'Adams County'}).match?.method,'ohio-lbrs-address-point');
 assert.throws(()=>parseSnapshotEntry({...oh,match:{...oh.match,longitude:-90}},'OH',{'39001':'Adams County'}));
 assert.throws(()=>parseSnapshotEntry({...oh,match:{...oh.match,point:{...oh.match.point,countyFips:'39015'}}},'OH',{'39001':'Adams County'}));
});
