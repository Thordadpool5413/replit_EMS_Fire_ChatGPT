import test from 'node:test';import assert from 'node:assert/strict';import type{Agency}from'../types';import{buildEquipmentGeography,equipmentCoverageColor}from'./equipmentGeography';
const states=[{code:'FL',state:'Florida'},{code:'TX',state:'Texas'},{code:'AK',state:'Alaska'}];
const counties=[{stateCode:'FL',countyFips:'12005',countyName:'Bay County'},{stateCode:'TX',countyFips:'48001',countyName:'Anderson County'},{stateCode:'AK',countyFips:'02013',countyName:'Aleutians East Borough'}];
const agency=(id:string,stateCode:string,county:string,defibBrand:string,countyFips?:string)=>({id,stateCode,county,countyFips,installedFleet:{defibBrand}} as Agency);
test('all supplied states/counties are indexed, including empty areas; names resolve within their state',()=>{
 const result=buildEquipmentGeography([agency('1','Florida','Bay','ZOLL X Series'),agency('2','TX','Anderson','LIFEPAK 15'),agency('3','FL','Bay','Unknown')],states,counties,{presence:'zoll',family:'all'});
 assert.equal(Object.keys(result.byState).length,3);assert.equal(Object.keys(result.byCounty).length,3);
 assert.equal(result.byState.FL.matched,1);assert.equal(result.byCounty['12005'].unknown,1);assert.equal(result.byCounty['48001'].competitor,1);
 assert.equal(result.byCounty['02013'].total,0);
 assert.notEqual(equipmentCoverageColor(result.byState.FL,{presence:'zoll',family:'all'}),equipmentCoverageColor(result.byState.TX,{presence:'zoll',family:'all'}));
});
test('wrong-state FIPS and ambiguous/unresolved counties never get silently assigned',()=>{
 const result=buildEquipmentGeography([agency('1','FL','Bay','ZOLL','48001'),agency('2','FL','Not a county','Philips'),agency('3','ZZ','Bay','ZOLL')],states,counties,{presence:'competitor',family:'all'});
 assert.equal(result.conflictingCounty,1);assert.equal(result.unassignedCounty,2);assert.equal(result.unassignedState,1);assert.equal(result.byCounty['12005'].total,0);
});
test('every bundled state and county can be indexed and matched by its exact FIPS',async()=>{
 const {readFileSync}=await import('node:fs');const {gunzipSync}=await import('node:zlib');
 const all=JSON.parse(gunzipSync(readFileSync(new URL('../data/all-counties-database.json.gz',import.meta.url))).toString()) as Array<{stateCode:string;stateName:string;countyFips:string;countyName:string}>;
 const allStates=[...new Map(all.map(c=>[c.stateCode,{code:c.stateCode,state:c.stateName}])).values()];
 const records=all.map(c=>agency(c.countyFips,c.stateCode,c.countyName,'ZOLL X Series',c.countyFips));
 const result=buildEquipmentGeography(records,allStates,all,{presence:'zoll',family:'monitors'});
 assert(allStates.length>=51);assert(all.length>3000);
 assert.equal(result.unassignedState,0);assert.equal(result.unassignedCounty,0);assert.equal(result.conflictingCounty,0);
 for(const c of all)assert(result.byCounty[c.countyFips].matched>=1,c.countyFips);
});
