import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalizeAgencyCounty,normalizeCountyName,matchesAgencyCounty} from './countyIdentity';
import {buildEquipmentGeography} from './equipmentGeography';
import type {Agency} from '../types';
const agency=(county:string,extra={})=>({stateCode:'CT',county,city:'Hartford',installedFleet:{defibBrand:'ZOLL X Series'},...extra}) as Agency;
test('New York borough aliases and Alaska county-equivalent labels resolve while preserving original values',()=>{
 const ny=canonicalizeAgencyCounty(agency('New York (Manhattan) County',{stateCode:'NY',city:'New York'}));
 assert.equal(ny.county,'New York County');assert.equal(ny.countyFips,'36061');assert.equal(ny.sourceCountyName,'New York (Manhattan) County');
 assert(matchesAgencyCounty(ny,'New York (Manhattan) County'));
 const ak=canonicalizeAgencyCounty(agency('Anchorage Borough',{stateCode:'AK',city:'Anchorage'}));assert.equal(ak.county,'Anchorage Municipality');
 assert.notEqual(normalizeCountyName('Richmond city'),normalizeCountyName('Richmond County'));
});
test('Connecticut maps an exact recorded town and compatible legacy county to its current region',()=>{
 const original=agency('Hartford County',{countyFips:'09003',isVerifiedRecord:false});const current=canonicalizeAgencyCounty(original);
 assert.equal(current.county,'Capitol Planning Region');assert.equal(current.countyFips,'09110');assert.equal(current.sourceCountyFips,'09003');assert.equal(current.sourceCountyName,'Hartford County');assert.equal(current.countyLocationBasis,'town-crosswalk');assert.equal(current.isVerifiedRecord,false);
 assert.equal(original.countyFips,'09003');assert.deepEqual(canonicalizeAgencyCounty(current),current);
 assert(matchesAgencyCounty(original,'Capitol Planning Region'));
});
test('legacy county alone, unknown towns, conflicting towns and wrong-state IDs never select an arbitrary region',()=>{
 for(const a of [agency('Hartford County',{city:''}),agency('Hartford County',{city:'Metro'}),agency('Fairfield County',{countyFips:'09001'}),agency('Hartford County',{countyFips:'48001'}),agency('New York County',{stateCode:'NY',countyFips:'48001'})])assert.equal(canonicalizeAgencyCounty(a),a);
});
test('county equipment rollups and geography filtering use the same resolved location',()=>{
 const counties=[{stateCode:'CT',countyFips:'09110',countyName:'Capitol Planning Region'}];
 const results=buildEquipmentGeography([agency('Hartford County',{countyFips:'09003'})],[{code:'CT',state:'Connecticut'}],counties,{presence:'zoll',family:'monitors'});
 assert.equal(results.byCounty['09110'].matched,1);assert.equal(results.unassignedCounty,0);assert.equal(results.conflictingCounty,0);assert.equal(results.byState.CT.matched,1);
});
