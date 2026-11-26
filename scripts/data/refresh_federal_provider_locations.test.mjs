import test from 'node:test';
import assert from 'node:assert/strict';
import {selectBatch,compareSource,refresh} from './refresh_federal_provider_locations.mjs';
const npi='1003006180',a={street:'123 MAIN ST',city:'EXAMPLE',state:'NV',zip:'89081'};
const target={npi,name:'Example Ambulance, Inc.',registryState:'NV',snapshotAddress:a,snapshotStatus:'no-match'};
const row=(address,kind='primary-practice')=>({kind,address});
const evidence={npi,status:'source-reported',organizationName:'EXAMPLE AMBULANCE INC',rows:[row({...a,state:'AZ',zip:'85001'}),row(a,'secondary-practice'),row(a,'mailing')]};
test('deterministic bounded rotation does not require state grouping',()=>{
 const targets=[{...target,npi:'3'},{...target,npi:'1'},{...target,npi:'2'}];
 assert.deepEqual(selectBatch(targets,2,0).targets.map(x=>x.npi),['1','2']);
 assert.equal(selectBatch(targets,2,1).nextOffset,0);assert.equal(selectBatch(targets,2,2).offset,0);
 assert.equal(selectBatch(targets,2,0,1).offset,1);
 assert.throws(()=>selectBatch(targets,129,0));
});
test('retain changed federal addresses across states; no identity or station assignment',async()=>{
 assert.equal(compareSource(target,evidence).status,'primary-changed-review');
 assert.equal(compareSource(target,{...evidence,organizationName:'Other'}).status,'name-difference-review');
 assert.throws(()=>compareSource(target,{...evidence,npi:'wrong'}));
 const m={latitude:33,longitude:-112,method:'census-address-range',matchedAddress:'123 MAIN ST, EXAMPLE, AZ, 85001'};
 const result=await refresh({targets:[target]},{load:async()=>evidence,geocode:async(address)=>{assert.equal(address.state,'AZ');return m;},delay:async()=>{}});
 assert.equal(result.approximateMatches,1);assert.equal(result.secondaryAddressRows,1);assert.equal(result.newMapped,0);assert.equal(result.rows[0].publicationEligible,false);
 const different=await refresh({targets:[target]},{load:async()=>({...evidence,organizationName:'Other'}),geocode:async()=>{throw Error('Must not query');},delay:async()=>{}});
 assert.equal(different.geocodeAttempts,0);assert.equal(different.rows[0].status,'name-difference-review');
 const unavailable=await refresh({targets:[target]},{load:async()=>{throw Error('Unavailable');},delay:async()=>{}});
 assert.equal(unavailable.counts['source-unavailable'],1);assert.equal(unavailable.rows[0].evidence,null);
});
