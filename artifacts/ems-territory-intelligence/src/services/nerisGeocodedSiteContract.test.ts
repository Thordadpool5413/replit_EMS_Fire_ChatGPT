import assert from 'node:assert/strict';
import test from 'node:test';
import fixtures from '../../../../scripts/fixtures/neris-retained-core-geocoded-examples.json';
import {validateNerisGeocodedSiteEvidence} from './nerisGeocodedSiteContract';
import type {NerisPrimarySiteContext} from './nerisPrimarySiteContract';

function retainedExample(){
 const value=structuredClone(fixtures[0]);
 assert.ok(value,'An actual fully replayed core geocoded candidate is required.');
 const {candidate,original,nationalRow}=value;
 const ctx={key:original.key,name:original.name,state:original.state,source:original.source,
  sourceCounty:original.sourceCounty,countyFips:candidate.countyFips,address:candidate.address,
  match:candidate.match,originalAddress:original.address,nationalRow} as NerisPrimarySiteContext;
 return {proof:candidate.primaryAddressEvidence,ctx};
}
test('accepts the actual retained native identity and complete source endpoint proof',()=>{
 const {proof,ctx}=retainedExample();
 assert.deepEqual(validateNerisGeocodedSiteEvidence(proof,ctx),proof);
 assert.equal(validateNerisGeocodedSiteEvidence(undefined,ctx),undefined);
});
test('rejects a fabricated but well-formed source report digest',()=>{
 const {proof,ctx}=retainedExample();
 proof.geocoding.sourceReportDigests.usgs='f'.repeat(64);
 assert.throws(()=>validateNerisGeocodedSiteEvidence(proof,ctx));
});
test('rejects changed nonselected consensus endpoint evidence',()=>{
 const {proof,ctx}=retainedExample();
 const endpoint=proof.geocoding.allQualifiedNativeEndpoints[0];assert.ok(endpoint);endpoint.latitude+=0.000001;
 assert.throws(()=>validateNerisGeocodedSiteEvidence(proof,ctx));
});
test('rejects changed original national identity and reported native object',()=>{
 const {proof,ctx}=retainedExample();
 const row=[...ctx.nationalRow!];row[2]=String(row[2])+' changed';
 assert.throws(()=>validateNerisGeocodedSiteEvidence(proof,{...ctx,nationalRow:row}));
 proof.site.objectId+=1;
 assert.throws(()=>validateNerisGeocodedSiteEvidence(proof,ctx));
});
test('rejects changed selected coordinate and original mailing address',()=>{
 const {proof,ctx}=retainedExample();
 const changed=structuredClone(ctx.match) as {latitude:number};changed.latitude+=0.000001;
 assert.throws(()=>validateNerisGeocodedSiteEvidence(proof,{...ctx,match:changed}));
 assert.throws(()=>validateNerisGeocodedSiteEvidence(proof,{...ctx,originalAddress:{
  ...ctx.originalAddress!,street:'999 Different Street'}}));
});
