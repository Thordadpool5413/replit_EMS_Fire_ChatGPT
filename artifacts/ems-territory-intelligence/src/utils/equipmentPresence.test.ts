import test from 'node:test';import assert from 'node:assert/strict';
import type {Agency} from '../types';
import {equipmentPresence,matchesEquipmentFilter,parseEquipmentFilter} from './equipmentPresence';
const make=(fleet:Record<string,string>,extra:Record<string,unknown>={})=>({installedFleet:fleet,...extra}) as unknown as Agency;
test('recorded ZOLL, competitors and mixed installations are classified per product category',()=>{
 const agency=make({defibBrand:'Stryker LIFEPAK 15',mechanicalCPR:'ZOLL AutoPulse',transportVentilator:'Hamilton T1',epcrCadSoftware:'ZOLL RescueNet'});
 assert.equal(equipmentPresence(agency),'mixed');
 assert.equal(equipmentPresence(agency,'monitors'),'competitor');
 assert.equal(equipmentPresence(agency,'cpr'),'zoll');
 assert.equal(equipmentPresence(agency,'software'),'zoll');
 assert(matchesEquipmentFilter(agency,{presence:'zoll',family:'all'}));
 assert(matchesEquipmentFilter(agency,{presence:'competitor',family:'all'}));
 assert(!matchesEquipmentFilter(agency,{presence:'mixed',family:'monitors'}));
});
test('missing, unrecognized, negative and planned equipment never implies competitor ownership',()=>{
 for(const value of ['', 'None / Manual Only','Unknown','Paper','Other brand','No ZOLL devices','Considering ZOLL X Series']) assert.equal(equipmentPresence(make({defibBrand:value})),'unknown',value);
 assert.equal(equipmentPresence(make({}, {zollOpportunity:{primaryTargetProduct:'X Series Advanced',recommendedBundle:['ZOLL AutoPulse']}})),'unknown');
});
test('generated installations are excluded without mapped equipment evidence',()=>{
 const agency=make({defibBrand:'ZOLL X Series'},{verificationSource:'Geographic prospect generator'});
 assert.equal(equipmentPresence(agency),'unknown');
});
test('bad saved filter values recover to safe defaults',()=>{
 assert.deepEqual(parseEquipmentFilter(null),{presence:'all',family:'all'});
 assert.deepEqual(parseEquipmentFilter({presence:'zoll',family:'wrong'}),{presence:'zoll',family:'all'});
});
test('named competitor filters recognize product aliases and remain category-specific',()=>{
 const agency=make({defibBrand:'LIFEPAK 15',mechanicalCPR:'LUCAS 3',transportVentilator:'Hamilton T1',epcrCadSoftware:'ESO Solutions'});
 assert(matchesEquipmentFilter(agency,{presence:'competitor',family:'monitors',vendor:'stryker'}));
 assert(matchesEquipmentFilter(agency,{presence:'competitor',family:'ventilators',vendor:'hamilton'}));
 assert(!matchesEquipmentFilter(agency,{presence:'competitor',family:'monitors',vendor:'hamilton'}));
 assert(matchesEquipmentFilter(agency,{presence:'competitor',family:'software',vendor:'eso'}));
 assert.deepEqual(parseEquipmentFilter({presence:'competitor',family:'all',vendor:'bad'}),{presence:'competitor',family:'all'});
 assert.deepEqual(parseEquipmentFilter({presence:'all',family:'all',vendor:'stryker'}),{presence:'all',family:'all'});
});
test('vendor marker styles use distinct labels and letters for all ownership states',async()=>{
 const {equipmentMapStyle,EQUIPMENT_MAP_STYLES}=await import('./equipmentPresence');
 assert.equal(equipmentMapStyle(make({defibBrand:'ZOLL X Series'})).glyph,'Z');
 assert.equal(equipmentMapStyle(make({defibBrand:'LIFEPAK 15'})).glyph,'C');
 assert.equal(equipmentMapStyle(make({defibBrand:'LIFEPAK 15',mechanicalCPR:'AutoPulse'})).glyph,'M');
 assert.equal(equipmentMapStyle(make({})).glyph,'?');
 assert.equal(new Set(Object.values(EQUIPMENT_MAP_STYLES).map(s=>s.glyph)).size,4);
});
test('vendor breakdown geography excludes other states and normalizes county suffixes',async()=>{
 const {equipmentGeographyScope}=await import('./equipmentPresence');
 const agencies=[make({defibBrand:'ZOLL'}, {stateCode:'FL',county:'Bay County',city:'Town',agencyType:'EMS',id:'1'}),make({defibBrand:'Philips'}, {stateCode:'TX',county:'Bay',city:'Town',agencyType:'EMS',id:'2'}),make({defibBrand:'LIFEPAK'}, {stateCode:'FL',county:'Bay',city:'Town',agencyType:'Fire Department',id:'3'})];
 assert.deepEqual(equipmentGeographyScope(agencies,{state:'FL',county:'Bay',category:'ems'}).map(a=>a.id),['1']);
 assert.deepEqual(equipmentGeographyScope(agencies,{state:'FL',county:'Bay County',category:'fire'}).map(a=>a.id),['3']);
 assert.equal(equipmentGeographyScope(agencies,{state:'all'}).length,3);
});
test('alternate fleet fields participate in every product category without duplicate match rows',async()=>{
 const {getRecordedVendorMatches}=await import('./equipmentPresence');
 const agency=make({defibBrand:'ZOLL X Series'},{fleet:{currentDefibVendor:'ZOLL X Series',currentCprDevice:'LUCAS 3',currentVentilator:'Hamilton T1',currentEpcrVendor:'ImageTrend Elite',currentCadVendor:'Motorola'}});
 assert.equal(equipmentPresence(agency,'monitors'),'zoll');
 assert.equal(equipmentPresence(agency,'cpr'),'competitor');
 assert.equal(equipmentPresence(agency,'ventilators'),'competitor');
 assert(matchesEquipmentFilter(agency,{presence:'competitor',family:'software',vendor:'imagetrend'}));
 assert(matchesEquipmentFilter(agency,{presence:'competitor',family:'software',vendor:'motorola'}));
 assert.equal(getRecordedVendorMatches(agency,'monitors').length,1);
 assert.equal(equipmentPresence(make({}, {fleet:{currentDefibVendor:'ZOLL'},verificationSource:'Geographic prospect generator'})),'unknown');
});
