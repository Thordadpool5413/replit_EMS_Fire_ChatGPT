import test from 'node:test';import assert from 'node:assert/strict';import type{Agency}from'../types';import{buildEquipmentGeography,equipmentCoverageColor,EQUIPMENT_COVERAGE_STYLES,emptyCoverage}from'./equipmentGeography';
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
test('bundled agency records reconcile county-to-state totals with unresolved records explicitly accounted for',async()=>{
 const {COMPREHENSIVE_NATIONWIDE_AGENCIES}=await import('../data/nationalAgenciesData');
 const {ALL_50_STATES_ADDITIONAL_AGENCIES}=await import('../data/allStatesAgenciesData');
 const INITIAL_AGENCIES=[...COMPREHENSIVE_NATIONWIDE_AGENCIES,...ALL_50_STATES_ADDITIONAL_AGENCIES];
 const {readFileSync}=await import('node:fs');const {gunzipSync}=await import('node:zlib');
 const all=JSON.parse(gunzipSync(readFileSync(new URL('../data/all-counties-database.json.gz',import.meta.url))).toString()) as Array<{stateCode:string;stateName:string;countyFips:string;countyName:string}>;
 const allStates=[...new Map(all.map(c=>[c.stateCode,{code:c.stateCode,state:c.stateName}])).values()];
 for(const family of ['all','monitors','cpr','ventilators','software'] as const){
  const result=buildEquipmentGeography(INITIAL_AGENCIES,allStates,all,{presence:'zoll',family});
  const stateTotal=Object.values(result.byState).reduce((sum,c)=>sum+c.total,0);
  const countyTotal=Object.values(result.byCounty).reduce((sum,c)=>sum+c.total,0);
  assert.equal(stateTotal+result.unassignedState,INITIAL_AGENCIES.length);
  assert.equal(countyTotal+result.unassignedCounty,stateTotal);
  for(const summary of Object.values(result.byState))assert.equal(summary.zoll+summary.competitor+summary.mixed+summary.unknown,summary.total);
  const countyMatched=Object.values(result.byCounty).reduce((sum,c)=>sum+c.matched,0);
  const stateMatched=Object.values(result.byState).reduce((sum,c)=>sum+c.matched,0);
  assert(stateMatched>=countyMatched);
  assert(stateMatched-countyMatched<=result.unassignedCounty);
 }
});
test('state rollups sum county records and expose county-level equipment coverage separately',()=>{
 const records=[
  agency('1','FL','Bay','ZOLL X Series','12005'),
  agency('2','FL','Bay','LIFEPAK 15','12005'),
  agency('3','FL','Missing County','Acme monitor'),
 ];
 const result=buildEquipmentGeography(records,states,counties,{presence:'zoll',family:'monitors'});
 const state=result.byState.FL;
 assert.equal(state.total,3);
 assert.equal(state.countyCount,1);
 assert.equal(state.countiesWithAgencyRecords,1);
 assert.equal(state.countiesWithRecognizedEquipment,1);
 assert.equal(state.zoll,1);
 assert.equal(state.competitor,1);
 assert.equal(state.unrecognized,1);
 assert.equal(result.unassignedCounty,1);
 assert.equal(state.total,state.zoll+state.competitor+state.mixed+state.unknown);
});
test('equipment map categories use distinct colors and distinguish unmatched from unreported areas',()=>{
 const filter={presence:'zoll' as const,family:'all' as const};
 const zoll={...emptyCoverage(),total:1,zoll:1,matched:1};
 const competitor={...emptyCoverage(),total:1,competitor:1};
 const mixed={...emptyCoverage(),total:2,zoll:1,competitor:1};
 const unknown={...emptyCoverage(),total:1,unknown:1,unreported:1};
 assert.equal(equipmentCoverageColor(zoll,filter),EQUIPMENT_COVERAGE_STYLES.zoll.color);
 assert.equal(equipmentCoverageColor(competitor,filter),EQUIPMENT_COVERAGE_STYLES.noMatch.color);
 assert.equal(equipmentCoverageColor(mixed,filter),EQUIPMENT_COVERAGE_STYLES.mixed.color);
 assert.equal(equipmentCoverageColor(unknown,filter),EQUIPMENT_COVERAGE_STYLES.unknown.color);
 assert.equal(equipmentCoverageColor(undefined,filter),EQUIPMENT_COVERAGE_STYLES.noRecords.color);
 assert.equal(equipmentCoverageColor(mixed,{presence:'mixed',family:'all'}),EQUIPMENT_COVERAGE_STYLES.noMatch.color,'separate ZOLL and competitor agencies are not an agency-level mixed match');
 assert.equal(new Set(Object.values(EQUIPMENT_COVERAGE_STYLES).map(style=>style.color)).size,Object.keys(EQUIPMENT_COVERAGE_STYLES).length);
});
