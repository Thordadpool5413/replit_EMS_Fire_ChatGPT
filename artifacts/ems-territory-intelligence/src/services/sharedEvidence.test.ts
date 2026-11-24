import assert from 'node:assert/strict';
import test from 'node:test';
import type { Agency } from '../types';
import { createIntelligenceFact } from './documentedIntelligence';
import { readSharedEvidence, sameSharedEvidence, shareableAgencies, sharedAgencyKey, toSharedEvidence, validWorkspaceId } from './sharedEvidence';
const now = Date.parse('2026-11-24T12:00:00Z');
const agency = { id:'registry-FDID-FL-12345', name:'Example Fire', stateCode:'FL', registryIdentity:{ sourceName:'USFA NFDR', identifier:'12345', stateCode:'FL' } } as Agency;
const fact = createIntelligenceFact(agency,{kind:'installed-monitor',value:'ZOLL X Series',sourceName:'Example city',sourceRecordId:'inventory-1',sourceUrl:'https://example.gov/inventory.pdf',documentDate:'2026-11-01',note:'private note'},'fact-1',now);
test('shares only whitelisted document fields; excludes private notes and account data',()=>{
 const row=toSharedEvidence(agency,fact,now);
 assert.equal(row.agencyKey,'FDID:FL:12345');
 assert.equal(row.value,'ZOLL X Series');
 assert.equal(Object.hasOwn(row,'note'),false);
 assert.equal(Object.hasOwn(row,'geographicId'),false);
 assert.deepEqual(readSharedEvidence(row,row.agencyKey,row.factId,now),row);
});
test('rejects legacy, cross-state and duplicate registry identities',()=>{
 assert.equal(sharedAgencyKey({...agency,registryIdentity:undefined}),undefined);
 assert.equal(sharedAgencyKey({...agency,stateCode:'GA'}),undefined);
 assert.equal(shareableAgencies([agency,{...agency,id:'duplicate'}]).length,0);
 assert.deepEqual(shareableAgencies([agency]),[agency]);
});
test('rejects malformed payloads, mismatched paths and invalid source semantics',()=>{
 const row=toSharedEvidence(agency,fact,now);
 for(const r of [{...row,sourceUrl:'javascript:alert(1)'},{...row,value:'proposed ZOLL'},{...row,documentDate:'2026-02-31'},{...row,enteredAt:'2027-01-01'},{...row,stateCode:'GA'},{...row,kind:'unknown'},{...row,dueDate:'2027-01-01'}])
  assert.equal(readSharedEvidence(r,row.agencyKey,row.factId,now),undefined);
 assert.equal(readSharedEvidence(row,row.agencyKey,'other-id',now),undefined);
 assert.equal(readSharedEvidence(row,'FDID:FL:12346',row.factId,now),undefined);
 assert.throws(()=>toSharedEvidence(agency,{...fact,geographicId:'other'},now));
 assert.throws(()=>toSharedEvidence(agency,{...fact,intelligence:undefined},now));
});
test('idempotence comparison rejects a different value or source',()=>{
 const row=toSharedEvidence(agency,fact,now);
 assert.equal(sameSharedEvidence(row,{...row}),true);
 assert.equal(sameSharedEvidence(row,{...row,value:'Other device'}),false);
 assert.equal(sameSharedEvidence(row,{...row,sourceRecordId:'another'}),false);
 assert.equal(validWorkspaceId('atlas-team'),true);
 assert.equal(validWorkspaceId('../other'),false);
});
