import test from 'node:test';
import assert from 'node:assert/strict';
import type {Agency} from '../types';
import {createIntelligenceFact} from './documentedIntelligence';
import {buildIntelligenceCoverage,type CoverageInput} from './intelligenceCoverage';
const now=Date.parse('2026-11-24T12:00:00Z');
const a={id:'registry-FDID-FL-12345',name:'Fixture Fire',stateCode:'FL',registryIdentity:{sourceName:'USFA NFDR',identifier:'12345',stateCode:'FL',name:'Fixture Fire',sourceUrl:'https://apps.usfa.fema.gov/registry/search',retrievedAt:'2026-11-20'}} as Agency;
const input:CoverageInput={location:{address:false,mapped:false,detail:'Not established'},documentStatus:'not-checked',stationStatus:'not-checked',authorityStatus:'not-checked'};
test('empty or populated legacy fields do not earn coverage; missing private sources stay unchecked',()=>{
 const b={...a,address:'123 Fixture Street',headquartersPhone:'555-0100'} as Agency;
 const r=buildIntelligenceCoverage(b,[b],input,now);assert.equal(r.documented,0);assert.equal(r.reviewed,0);assert.equal(r.total,8);assert.equal(r.items.find(i=>i.domain==='authority')?.status,'not-checked');
});
test('source-backed local observations and geography earn evidence not review',()=>{
 const f=createIntelligenceFact(a,{kind:'installed-monitor',value:'ZOLL X Series',sourceName:'Fixture City',sourceRecordId:'inventory',sourceUrl:'https://example.gov/inventory',documentDate:'2026-11-01'},'f1',now);
 const b={...a,sourceFacts:[f]};const r=buildIntelligenceCoverage(b,[b],{...input,location:{address:true,mapped:true,detail:'Source match'}},now);
 assert.equal(r.documented,4);assert.equal(r.reviewed,0);assert.equal(r.percent,50);
 const c=buildIntelligenceCoverage(b,[b,{...b,id:'duplicate'}],input,now);assert.equal(c.documented,0);
});
test('authority completeness gate and station sample completeness prevent inflated coverage',()=>{
 const c=buildIntelligenceCoverage(a,[a],{...input,authorityStatus:'checked',authority:{complete:true,recentReviewed:1}},now);
 assert.equal(c.reviewed,2);assert.equal(c.documented,2);
 const d=buildIntelligenceCoverage(a,[a],{...input,authorityStatus:'checked',authority:{complete:false,recentReviewed:1}},now);assert.equal(d.reviewed,0);
 const e=buildIntelligenceCoverage(a,[a],{...input,location:{address:true,mapped:false,detail:'Street only'}},now);assert.equal(e.documented,0);assert.equal(e.items[0].status,'partial');
});
