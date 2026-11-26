import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeStreet,sourceStreetLine,matchesSourceAddress} from './addressNormalization';
import {validateAddressMatch} from './providerLocationContract';

test('official full-word abbreviations preserve house numbers and route authorities',()=>{
 assert.equal(normalizeStreet('123 North Main Street'),'123 N MAIN ST');
 assert.notEqual(normalizeStreet('123 State Route 6'),normalizeStreet('123 US Route 6'));
 assert.notEqual(normalizeStreet('123 1st Street'),normalizeStreet('123 First Street'));
 assert.notEqual(normalizeStreet('123 Main Street'),normalizeStreet('124 Main Street'));
 assert.equal(sourceStreetLine('123 Main St, Suite 204'),'123 Main St');
 assert.equal(sourceStreetLine('123 Main FLOOR ROAD'),'123 Main FLOOR ROAD');
});
test('explicit locality basis never fills or rewrites the source address',()=>{
 const address={street:'820 Glacier AVE',city:'Juneau',state:'AK',zip:'99801'};
 const sourceAddress={...address,street:'820 Glacier Ave',city:'Different postal name'};
 const point={objectId:19512,nativeId:'FD02110222',parentId:'FD02110222',sourceKind:'department',sourceDate:'2026-11-26',sourceSha256:'1ec2a427cbc5ea1949ff731527de3c701ed9592bc4fa83fe796a54defa18880b',countyFips:'02110',addressAsReported:['820 Glacier Ave',null,'Different postal name','AK','99801'],addressComponent:{sourceField:'line1',rule:'native-physical-line1',otherLineKind:'empty'},coordinatesAsReported:[58.301070000000045,-134.42168999999996]};
 const raw={latitude:58.301070000000045,longitude:-134.42168999999996,method:'neris-reported-address',point,sourceAddress,matchBasis:'normalized-street-state-zip',matchedAddress:'820 Glacier Ave, Different postal name, AK, 99801'};
 const parsed=validateAddressMatch(raw,address);
 assert.equal(parsed?.sourceAddress?.city,sourceAddress.city);
 assert.throws(()=>validateAddressMatch({...raw,matchBasis:'normalized-street-city-state-zip'},address));
 assert.throws(()=>validateAddressMatch({...raw,sourceAddress:{...sourceAddress,street:'821 Glacier Ave'}},address));
 assert.throws(()=>validateAddressMatch({...raw,sourceAddress:{...sourceAddress,zip:'99802'}},address));
 assert.throws(()=>validateAddressMatch({...raw,matchedAddress:'820 Glacier Ave, Juneau, AK, 99801'},address));
 assert.equal(matchesSourceAddress({...address,zip:''},sourceAddress,'normalized-street-city-state'),false);
});
