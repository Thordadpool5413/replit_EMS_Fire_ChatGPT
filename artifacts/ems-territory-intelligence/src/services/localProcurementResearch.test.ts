import test from 'node:test';
import assert from 'node:assert/strict';
import {STATE_PORTALS,reconcileLocalProcurement,sampleLocalProcurement,type LocalRow,type LocalSample} from './localProcurementResearch';
test('portal catalog contains eight states and HTTPS official navigation links',()=>{
 assert.equal(new Set(STATE_PORTALS.map(p=>p.state)).size,8);
 assert.equal(new Set(STATE_PORTALS.map(p=>p.url)).size,STATE_PORTALS.length);
 assert.ok(STATE_PORTALS.every(p=>new URL(p.url).protocol==='https:'));
});
test('native duplicates collapse; revisions and different sources remain distinct',()=>{
 const r:LocalRow={source:'chicago-contracts',id:'fixture',organization:null,title:'Fixture',kind:'contract-row',date:'2026-01-01',deadline:null,vendor:null,amount:10,amountNote:'Fixture',url:'https://example.gov/fixture',recordNumber:'CI'};
 const s:LocalSample={started:0,scopes:[{source:r.source,status:'retrieved',pages:1,sourceRows:3,withheld:0,rows:[r,r,{...r,id:'revision'}]}]};
 assert.equal(reconcileLocalProcurement(s).rows.length,2);
 s.scopes[0].rows.push({...r,amount:20});assert.equal(reconcileLocalProcurement(s).conflicts,1);assert.equal(reconcileLocalProcurement(s).rows.length,1);
});
test('upstream outage remains unavailable',async()=>{
 const fail=async()=>{throw Error('CI fixture');};
 const s=await sampleLocalProcurement('cardiac',90,['nyc-city-record','chicago-contracts'],new AbortController().signal,()=>{}, {nyc:fail,chicago:fail});
 assert.ok(s.scopes.every(x=>x.status==='unavailable'));
});
