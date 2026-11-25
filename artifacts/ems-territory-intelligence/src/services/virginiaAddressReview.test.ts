import test from 'node:test';
import assert from 'node:assert/strict';
import data from '../data/virginiaAddressReview.json';
import {virginiaAddressReviewCandidate,virginiaReviewSourceLink} from './virginiaAddressReview';
import type {SnapshotLocation} from './nationalLocationSnapshot';
test('review candidates match the exact source record and snapshot, never substitute a different address or accepted pin',()=>{
 assert.equal(data.candidates.length,4);
 for(const c of data.candidates){
  const entry:SnapshotLocation={key:c.sourceKey,name:c.registryName,state:'VA',source:c.sourceKey.startsWith('FDID:')?'USFA':'NPPES',sourceDate:c.registrySourceDate,address:c.registryAddress,status:'no-match',match:null,sourceCounty:c.registryCounty,countyFips:''};
  const check=(e:SnapshotLocation=entry,generatedAt=data.snapshotGeneratedAt,county:string|undefined=undefined)=>virginiaAddressReviewCandidate(e,generatedAt,c.registryAddress,county);
  assert.equal(check()?.objectId,c.objectId);
  assert.equal(check({...entry,status:'review'}),undefined);
  assert.equal(check({...entry,status:'mapped'}),undefined);
  assert.equal(check({...entry,name:'Different source organization'}),undefined);
  assert.equal(check({...entry,sourceDate:'Other release'}),undefined);
  assert.equal(check(entry,'Different snapshot'),undefined);
  assert.equal(check(entry,data.snapshotGeneratedAt,'51000'),undefined);
  assert.equal(virginiaAddressReviewCandidate(entry,data.snapshotGeneratedAt,{...c.registryAddress,street:c.registryAddress.street+' Suite 8'},undefined),undefined);
  assert.equal(entry.match,null);
  const url=new URL(virginiaReviewSourceLink(c));
  assert.equal(url.hostname,'dsfmportal.dcr.virginia.gov');assert.equal(url.searchParams.get('objectIds'),String(c.objectId));
 }
});
