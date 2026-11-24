import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateFloridaRoster,floridaCounty,floridaRegistryIdentity} from './floridaEmsRoster';
import {registryIdentityKey,canCreateRegistryAccount,findRegistryAccountCandidates} from './registryAccountLink';
import {createSourceNativeAgency} from './sourceNativeAgency';
const data=validateFloridaRoster(JSON.parse(readFileSync(new URL('../../public/registry/state-ems/FL.json',import.meta.url),'utf8')));
test('Florida report matches its printed 347 license listings, 332 Florida addresses, 15 outside Florida',()=>{
 assert.equal(data.publishedTotal,347);assert.equal(data.records.length,347);assert.equal(new Set(data.records.map(r=>r.identifier)).size,347);
 assert.equal(data.records.filter(r=>r.headquartersState==='FL').length,332);
 assert.equal(data.records.filter(r=>r.headquartersState!=='FL').length,15);
 assert.equal(data.sourceDate,'2026-11-24');assert.equal(data.extractionNotes.length,1);
 assert.throws(()=>validateFloridaRoster({...data,records:data.records.slice(1)}),/count/);
 assert.throws(()=>validateFloridaRoster({...data,records:[data.records[0],...data.records.slice(0,-1)]}),/duplicate/);
 assert.ok(data.records.every(r=>!('phone' in r)&&!('email' in r)&&!('chiefName' in r)));
});
test('Florida license identity preserves namespace, source address county, and separate license dates',()=>{
 const row=data.records.find(r=>r.identifier==='101')!;
 const counties=new Map([['12001','Alachua County'],['12005','Bay County'],['13001','Alachua County']]);
 const identity=floridaRegistryIdentity(data,row,counties)!;
 assert.equal(registryIdentityKey(identity),'STATE-EMS:FL:license:101');
 assert.deepEqual(floridaCounty(row,counties),{countyFips:'12001',countyName:'Alachua County'});
 assert.equal(floridaCounty(row,new Map([['13001','Alachua County']])),undefined);
 const account=createSourceNativeAgency(identity,[]);
 assert.equal(account.stateLicenseNumber,'101');assert.equal(account.fdid,'');assert.equal(account.countyFips,'12001');assert.equal(account.registryIdentity?.licenseExpiresAt,row.expiresAt);assert.equal(account.competitorContract.contractEndDate,'');
 assert.equal(findRegistryAccountCandidates(identity,[{...account,id:'legacy',registryIdentity:undefined}]).length,1);
 assert.equal(canCreateRegistryAccount({...identity,licenseExpiresAt:'2000-01-01'}),false);
 assert.equal(floridaRegistryIdentity(data,data.records.find(r=>r.headquartersState!=='FL')!,counties),undefined);
});
