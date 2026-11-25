import test from 'node:test';
import assert from 'node:assert/strict';
import {searchPublicProviders} from './publicProviderSearch';
import type {SourceDirectoryManifest,SourceDirectoryRecord} from './nationalSourceDirectory';
const fl=['usfa:FL:001','USFA','Example Fire','FL','Example','32901','12009','Brevard','source-county','','123 Main St','https://apps.usfa.fema.gov/registry/search'] as SourceDirectoryRecord;
const oh=['usfa:OH:002','USFA','Example Fire','OH','Example','43001','39001','Adams','source-county','','456 Main St','https://apps.usfa.fema.gov/registry/search'] as SourceDirectoryRecord;
const manifest={byState:{FL:{},OH:{}},countyNames:{'12009':'Brevard','39001':'Adams'}} as unknown as SourceDirectoryManifest;
const scope={state:'all',countyFips:'',city:'',zip:'',category:'fire' as const,query:'Example Fire'};
test('public search works without saved accounts or a cloud connection',async()=>{
 const result=await searchPublicProviders(manifest,scope,undefined,{loadState:async state=>state==='FL'?[fl]:[oh],loadLocations:async()=>undefined});
 assert.equal(result.records.length,2);assert.equal(result.statesSearched,2);assert.deepEqual(result.failedStates,[]);
});
test('failed state is not represented as a successful empty search',async()=>{
 const result=await searchPublicProviders(manifest,scope,undefined,{loadState:async state=>{if(state==='OH')throw Error('unavailable');return [fl];},loadLocations:async()=>undefined});
 assert.deepEqual(result.records,[fl]);assert.deepEqual(result.failedStates,['OH']);assert.equal(result.statesSearched,1);
});
test('state and county remain exact and unavailable locations remain explicit',async()=>{
 const result=await searchPublicProviders(manifest,{...scope,state:'FL',countyFips:'12009',city:'Example',zip:'32901'},undefined,{loadState:async()=>[fl],loadLocations:async()=>undefined});
 assert.equal(result.records.length,1);assert.equal(result.locationUnavailable,true);
 await assert.rejects(searchPublicProviders(manifest,{...scope,countyFips:'12009'}));
});
