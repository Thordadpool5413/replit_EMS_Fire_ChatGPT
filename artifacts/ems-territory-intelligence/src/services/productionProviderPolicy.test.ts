import test from 'node:test';
import assert from 'node:assert/strict';
import type {Agency} from '../types';
import {activeProviderRecords,isLegacyProviderRecord} from '../utils/providerRecordTrust';
import {readFileSync} from 'node:fs';
import {fieldValidationState,type FactReviewEntry} from './factReviewStore';
test('production directory initializes without importing legacy provider fixtures or calling generators',()=>{
 const db=readFileSync(new URL('./nationalProviderDatabase.ts',import.meta.url),'utf8');
 const engine=readFileSync(new URL('./territoryIntelligenceEngine.ts',import.meta.url),'utf8');
 assert.doesNotMatch(db,/INITIAL_AGENCIES|registerAgency\(|generateAgency\(/);
 assert.doesNotMatch(engine,/synthesizeAgency\(|generateAgency\(/);
});
test('legacy origin remains quarantined after synchronization and source linking',()=>{
 const real={id:'registry-NPI-1234567893',verificationSource:'Source-native registry listing',stateCode:'FL',agencyType:'EMS',city:'Example',county:'Brevard County',countyFips:'12009'} as Agency;
 const seed={...real,id:'zoll-agency-fl-old',dataProvenanceTier:'firestore_cloud_synced'} as Agency;
 const modeled={...real,id:'fire-fl-12009-example',dataProvenanceTier:'firestore_cloud_synced'} as Agency;
 assert.equal(isLegacyProviderRecord(seed),true);assert.equal(isLegacyProviderRecord(modeled),true);
 assert.deepEqual(activeProviderRecords([seed,real,modeled]),[real]);
});
test('confirmation belongs only to an explicit current value and source revision',()=>{
 const src={sourceName:'Official directory',sourceUrl:'https://example.gov/agency',sourceKind:'dataset',sourceRecordId:'42',reportingPeriod:'2026'};
 const r={id:'r',agencyId:'a',fieldId:'identity.address',action:'confirm',originalValue:'123 Main',previousValue:'123 Main',reviewer:'Reviewer',method:'Agency call',note:'Confirmed street with agency',reviewedAt:'2026-11-24T00:00:00Z',sourceName:src.sourceName,sourceUrl:src.sourceUrl,sourceKind:src.sourceKind,sourceRecordId:src.sourceRecordId,sourcePeriod:src.reportingPeriod} as FactReviewEntry;
 assert.equal(fieldValidationState('123 Main','123 Main',[],src),'End-user validation required');
 assert.equal(fieldValidationState('123 Main','123 Main',[r],src),'User confirmed this value');
 assert.equal(fieldValidationState('123 Main','123 Main',[r],{...src,reportingPeriod:'2027'}),'Source or value changed; review required');
 assert.equal(fieldValidationState('123 Main','456 Main',[r],src),'Source or value changed; review required');
 assert.equal(fieldValidationState('123 Main','123 Main',[{...r,note:''}],src),'End-user validation required');
 assert.equal(fieldValidationState('123 Main','123 Main',[{...r,action:'flag'}],src),'Discrepancy flagged');
 assert.equal(fieldValidationState('Not reported','Not reported',[],undefined),'Not reported');
});
