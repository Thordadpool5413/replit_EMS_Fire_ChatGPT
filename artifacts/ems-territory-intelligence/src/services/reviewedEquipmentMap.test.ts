import assert from 'node:assert/strict';
import test from 'node:test';
import type { Agency } from '../types';
import type { ReviewedRadarResult,ReviewedEquipmentObservation } from './sharedOpportunityRadar';
import {buildReviewedEquipmentGeography,classifyReviewedEquipment,reviewedCountyFips,reviewedMapAccounts} from './reviewedEquipmentMap';
const counties=[{countyFips:'12009',countyName:'Brevard County',stateCode:'FL'},{countyFips:'12095',countyName:'Orange County',stateCode:'FL'},{countyFips:'13001',countyName:'Appling County',stateCode:'GA'}];
const account=(id:string,fips?:string):Agency=>({id:'registry-FDID-FL-'+id,name:'Example '+id,stateCode:'FL',countyFips:fips,registryIdentity:{sourceName:'USFA NFDR',identifier:id,stateCode:'FL',countyFips:fips}} as Agency);
const obs=(vendorId:string,family:ReviewedEquipmentObservation['family']='monitors')=>({vendorId,vendorName:vendorId,family} as ReviewedEquipmentObservation);
const review=(...equipment:ReviewedEquipmentObservation[]):ReviewedRadarResult=>({complete:true,checked:equipment.length,approved:equipment.length,withheld:0,signals:[],equipment});
test('reviewed maker classification is category-specific and distinguishes unavailable from unknown',()=>{
 assert.equal(classifyReviewedEquipment(review(obs('zoll'),obs('stryker','cpr')),'all').presence,'mixed');
 assert.equal(classifyReviewedEquipment(review(obs('zoll'),obs('stryker','cpr')),'monitors').presence,'zoll');
 assert.equal(classifyReviewedEquipment(review(obs('zoll'),obs('stryker','cpr')),'ventilators').presence,'unknown');
 assert.equal(classifyReviewedEquipment(undefined,'all').presence,'unavailable');
 assert.equal(classifyReviewedEquipment({...review(obs('zoll')),complete:false},'all').presence,'unavailable');
});
test('county assignment requires explicit consistent native FIPS and same state',()=>{
 const a=account('123','12009');
 assert.equal(reviewedCountyFips(a,counties),'12009');
 assert.equal(reviewedCountyFips({...a,countyFips:'12095'},counties),undefined);
 assert.equal(reviewedCountyFips(account('123','13001'),counties),undefined);
 assert.equal(reviewedCountyFips({...a,registryIdentity:{...a.registryIdentity!,headquartersState:'GA'}},counties),undefined);
 assert.equal(reviewedCountyFips({...account('123'),county:'Brevard County'},counties),undefined);
 assert.equal(reviewedCountyFips({...a,registryIdentity:undefined},counties),undefined);
});
test('county both-makers means two observations in the sample, not necessarily one mixed fleet',()=>{
 const result=buildReviewedEquipmentGeography([{agency:account('123','12009'),review:review(obs('zoll'))},{agency:account('456','12009'),review:review(obs('stryker'))},{agency:account('789','12095'),reason:'Offline'}],'FL','all',counties);
 assert.equal(result.byCounty['12009'].presence,'mixed');
 assert.equal(result.byCounty['12009'].mixed,0);
 assert.equal(result.byCounty['12009'].sampled,2);
 assert.equal(result.byCounty['12095'].presence,'unavailable');
 assert.equal(result.totals.unknown,0);assert.equal(result.sampled,3);
});
test('unmapped accounts remain in sample counts, never guessed into a county; duplicates are withheld',()=>{
 const a=account('123','12009'),b=account('456');
 const r=buildReviewedEquipmentGeography([{agency:a,review:review(obs('zoll'))},{agency:{...a,id:'duplicate'},review:review(obs('stryker'))},{agency:b,review:review()}],'FL','all',counties);
 assert.equal(r.duplicateOrInvalid,2);assert.equal(r.sampled,1);assert.equal(r.unassigned,1);assert.equal(Object.keys(r.byCounty).length,0);assert.equal(r.totals.unknown,1);
 assert.equal(reviewedMapAccounts([a,{...a,id:'duplicate'},b]).length,1);
 assert.equal(reviewedMapAccounts([a,{...b,id:a.id}]).length,0);
});
