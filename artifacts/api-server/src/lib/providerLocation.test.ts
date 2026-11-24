import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseNppesLocation,parseCensusLocation} from './providerLocation';
import {validNpi,parseStreetAddress,isPhysicalStreet,matchedStreet} from './providerLocationContract';
const npi='1234567893',address={street:'123 Main Street',city:'Example',state:'FL',zip:'32901'};
const row={number:npi,enumeration_type:'NPI-2',basic:{organization_name:'Example EMS',status:'A',last_updated:'2026-11-01'},taxonomies:[{code:'341600000X'}],addresses:[{address_purpose:'MAILING',country_code:'US',address_1:'PO BOX 12',city:'Other',state:'FL',postal_code:'32901'},{address_purpose:'LOCATION',country_code:'US',address_1:'123 Main Street',city:'Example',state:'FL',postal_code:'329011234'}]};
test('exact active organization NPI practice location only, never mailing or individual',()=>{
 assert.equal(validNpi(npi),true);assert.deepEqual(parseNppesLocation({result_count:1,results:[row]},npi)?.address,address);
 for(const r of [{...row,number:'1111111111'},{...row,enumeration_type:'NPI-1'},{...row,basic:{...row.basic,status:'D'}},{...row,addresses:[row.addresses[0]]},{...row,taxonomies:[{code:'123'}]}])assert.equal(parseNppesLocation({result_count:1,results:[r]},npi),null);
 assert.throws(()=>parseNppesLocation({result_count:2,results:[row,row]},npi));
});
test('only unique matching structure street city state ZIP produces an approximate point',()=>{
 const m={coordinates:{x:-80.6,y:28.1},matchedAddress:'123 MAIN ST, EXAMPLE, FL, 32901'};
 assert.equal(parseCensusLocation({result:{addressMatches:[m]}},address)?.method,'census-address-range');
 for(const match of [[],[m,m],[{...m,matchedAddress:'124 MAIN ST, EXAMPLE, FL, 32901'}],[{...m,matchedAddress:'123 MAIN ST, EXAMPLE, GA, 32901'}]])assert.equal(parseCensusLocation({result:{addressMatches:match}},address),null);
 assert.equal(isPhysicalStreet('PO BOX 123'),false);assert.equal(isPhysicalStreet('123 Main ST'),true);
 assert.equal(matchedStreet({...address,street:'123 Main Street, Suite 4'},m.matchedAddress),true);
 assert.equal(parseStreetAddress({...address,zip:'32901-1234'})?.zip,'32901');
 assert.equal(readFileSync(new URL('./providerLocationContract.ts',import.meta.url),'utf8'),readFileSync(new URL('../../../ems-territory-intelligence/src/services/providerLocationContract.ts',import.meta.url),'utf8'));
});
