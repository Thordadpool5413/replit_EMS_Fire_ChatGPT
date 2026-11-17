import test from 'node:test';
import assert from 'node:assert/strict';
import {equipmentComposition,EQUIPMENT_STATE_BASE_COLOR} from './equipmentComposition';
import {emptyCoverage,EQUIPMENT_COVERAGE_STYLES,buildEquipmentGeography} from './equipmentGeography';
import type {Agency} from '../types';
test('exclusive profile segments sum to the full denominator without counting mixed agencies twice',()=>{
 const coverage={...emptyCoverage(),total:100,zoll:10,competitor:20,mixed:5,unknown:15,notReported:50,reported:50};
 const mix=equipmentComposition(coverage);
 assert.equal(mix.segments.reduce((n,s)=>n+s.count,0),100);
 assert.equal(mix.segments.reduce((n,s)=>n+s.fraction,0),1);
 assert.equal(mix.segments.find(s=>s.key==='mixed')?.fraction,0.05);
 assert.equal(mix.recognized,35);assert.equal(mix.reported,50);
 for(const s of mix.segments)assert.equal(s.color,EQUIPMENT_COVERAGE_STYLES[s.key].color,'bar colors and legend colors share the same constants');
 assert(![EQUIPMENT_COVERAGE_STYLES.zoll.color,EQUIPMENT_COVERAGE_STYLES.competitor.color,EQUIPMENT_COVERAGE_STYLES.mixed.color].includes(EQUIPMENT_STATE_BASE_COLOR as never));
});
test('one competitor record among 100 profiles takes one percent, retaining missing equipment',()=>{
 const mix=equipmentComposition({...emptyCoverage(),total:100,competitor:1,reported:1,notReported:99});
 assert.equal(mix.segments.find(s=>s.key==='competitor')?.fraction,0.01);
 assert.equal(mix.segments.find(s=>s.key==='notReported')?.fraction,0.99);
 assert(equipmentComposition().segments.every(s=>s.fraction===0&&Number.isFinite(s.offset)));
});
test('vendor filtering changes matches without changing composition denominator; planning prospects do not inflate evidence',()=>{
 const records=[
  {id:'z',stateCode:'FL',county:'Bay',countyFips:'12005',installedFleet:{defibBrand:'ZOLL X Series'}},
  {id:'c',stateCode:'FL',county:'Bay',countyFips:'12005',installedFleet:{defibBrand:'LIFEPAK 15'}},
  {id:'p',stateCode:'FL',county:'Bay',countyFips:'12005',verificationSource:'Geographic prospect generator',installedFleet:{defibBrand:'Planning target'}},
  {id:'u',stateCode:'FL',county:'Bay',countyFips:'12005'},
 ] as Agency[];
 const states=[{code:'FL',state:'Florida'}],counties=[{stateCode:'FL',countyFips:'12005',countyName:'Bay County'}];
 const a=buildEquipmentGeography(records,states,counties,{presence:'all',family:'monitors'});
 const b=buildEquipmentGeography(records,states,counties,{presence:'competitor',family:'monitors',vendor:'stryker'});
 assert.equal(a.byState.FL.total,3);assert.equal(a.excludedPlanningRecords,1);
 assert.equal(a.byState.FL.matched,3);assert.equal(b.byState.FL.matched,1);
 assert.deepEqual(equipmentComposition(a.byState.FL),equipmentComposition(b.byState.FL));
});

test('verified planning-origin identities remain eligible without fabricating equipment',()=>{
 const record={id:'verified',stateCode:'FL',county:'Bay',countyFips:'12005',isVerifiedRecord:true,verificationSource:'Geographic prospect generator'} as Agency;
 const result=buildEquipmentGeography([record],[{code:'FL',state:'Florida'}],[{stateCode:'FL',countyFips:'12005',countyName:'Bay County'}],{presence:'all',family:'all'});
 assert.equal(result.excludedPlanningRecords,0);assert.equal(result.byState.FL.total,1);assert.equal(result.byState.FL.notReported,1);
});
