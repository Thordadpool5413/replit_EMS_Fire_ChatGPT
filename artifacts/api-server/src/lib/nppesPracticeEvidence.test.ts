import test from 'node:test';
import assert from 'node:assert/strict';
import {parseNppesPracticeEvidence,fetchNppesPracticeEvidence} from './nppesPracticeEvidence';
const npi='1003006180';
const address={country_code:'US',address_1:'123 Main St',city:'Example',state:'NV',postal_code:'890811234'};
const row={number:npi,enumeration_type:'NPI-2',basic:{organization_name:'Fixture Ambulance',status:'A',last_updated:'2026-03-19'},taxonomies:[{code:'341600000X'}],addresses:[{...address,address_purpose:'LOCATION'},{...address,address_purpose:'MAILING',address_1:'PO BOX 123',state:'CA',postal_code:'90074'}],practiceLocations:[{...address,address_1:'456 Second St',state:'AZ',postal_code:'85001'},{...address,address_2:'STE 2'},{...address},{...address,address_1:'456 Second St',state:'AZ',postal_code:'85001',address_purpose:'MAILING'}]};
const payload=(r:unknown)=>({result_count:1,results:[r]});
test('separates primary secondary and mailing rows, preserves cross-state and units',()=>{
 const result=parseNppesPracticeEvidence(payload(row),npi);
 assert.deepEqual(result.rows.map(r=>[r.kind,r.address.state,r.physicalStreet]),[['primary-practice','NV',true],['mailing','CA',false],['secondary-practice','AZ',true],['secondary-practice','NV',true]]);
 assert.equal(result.withheldAddressCount,2);assert.equal(result.secondaryCollection,'reported');
 assert.ok(result.rows.every(x=>!x.stationIdentityEstablished&&x.endUserValidationRequired));
 assert.equal(result.publicationEligible,false);
 assert.equal(parseNppesPracticeEvidence(payload({...row,practiceLocations:undefined}),npi).secondaryCollection,'not-returned');
});
test('rejects inconsistent identity, noneligible enumeration and ambiguous primary address',()=>{
 assert.throws(()=>parseNppesPracticeEvidence(payload({...row,number:'1234567893'}),npi));
 assert.equal(parseNppesPracticeEvidence(payload({...row,enumeration_type:'NPI-1'}),npi).status,'not-eligible');
 assert.equal(parseNppesPracticeEvidence(payload({...row,basic:{...row.basic,status:'D'}}),npi).status,'not-eligible');
 assert.equal(parseNppesPracticeEvidence(payload({...row,addresses:[row.addresses[0],row.addresses[0]]}),npi).rows.some(x=>x.kind==='primary-practice'),false);
 assert.equal(parseNppesPracticeEvidence({result_count:0,results:[]},npi).status,'no-record');
});
test('bounded exact federal API query contains no state filter',async()=>{
 const result=await fetchNppesPracticeEvidence(npi,async(input)=>{
  const u=new URL(String(input));assert.equal(u.hostname,'npiregistry.cms.hhs.gov');assert.equal(u.searchParams.get('number'),npi);assert.equal(u.searchParams.has('state'),false);
  return new Response(JSON.stringify(payload(row)),{headers:{'content-type':'application/json'}});
 });
 assert.equal(result.rows.length,4);
});
