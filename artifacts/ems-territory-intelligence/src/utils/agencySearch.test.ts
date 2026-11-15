import test from 'node:test';
import assert from 'node:assert/strict';
import type { Agency } from '../types';
import { agencySearchScore } from './agencySearch';
const agency={name:'Saint Johns Fire Department',alternateNames:['SJFD'],city:'Saint Johns',state:'Florida',stateCode:'FL',keyContacts:[]} as unknown as Agency;
test('agency search handles abbreviations, punctuation, aliases and word order',()=>{
 for(const q of ['St. Johns FD','FD Johns','SJFD','saint johns fire department']) assert.ok(agencySearchScore(agency,q)>0,q);
 assert.equal(agencySearchScore(agency,'TX'),0);assert.equal(agencySearchScore(agency,'jo'),0);
 assert.equal(agencySearchScore(agency,'unrelated'),0);
 assert.ok(agencySearchScore(agency,'SJFD')>agencySearchScore(agency,'Johns'));
});
test('EMS abbreviations expand to whole words',()=>{
 const ems={...agency,name:'Brevard Emergency Medical Services',alternateNames:[]};
 assert.ok(agencySearchScore(ems,'EMS Brevard')>0);
 assert.equal(agencySearchScore(ems,'fire Brevard'),0);
});
test('provider categories are searchable without making short fragments broad matches',()=>{
 const ems={...agency,name:'Brevard County Rescue',agencyType:'EMS Provider',providerCategory:'EMS',alternateNames:[]};
 assert.ok(agencySearchScore(ems,'EMS')>0);
 assert.equal(agencySearchScore(ems,'em'),0);
 assert.equal(agencySearchScore(ems,'TX'),0);
});
