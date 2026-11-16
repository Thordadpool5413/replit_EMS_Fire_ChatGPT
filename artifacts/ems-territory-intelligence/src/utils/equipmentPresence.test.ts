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
