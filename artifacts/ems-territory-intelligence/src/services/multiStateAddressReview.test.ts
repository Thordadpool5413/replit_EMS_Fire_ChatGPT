import test from 'node:test';
import assert from 'node:assert/strict';
import data from '../data/multiStateAddressReview.json';
import {multiStateAddressReviewCandidate} from './multiStateAddressReview';
import type {SnapshotLocation} from './nationalLocationSnapshot';
test('all acquired source records bind to their exact snapshot, not a verified pin',()=>{
 assert.equal(data.candidates.length,68);
 assert.equal(new Set(data.candidates.map(c=>c.sourceKey)).size,68);
 assert.deepEqual(Object.fromEntries(['MN','WI','MI'].map(s=>[s,data.candidates.filter(c=>c.state===s).length])),{MN:26,WI:41,MI:1});
 for(const c of data.candidates){
  const entry:SnapshotLocation={key:c.sourceKey,name:c.registryName,state:c.state,source:c.sourceKey.startsWith('FDID:')?'USFA':'NPPES',sourceDate:c.registrySourceDate,address:c.registryAddress,status:c.registryStatus as SnapshotLocation['status'],match:null,sourceCounty:c.registryCounty,countyFips:''};
  const get=(e=entry,generatedAt=data.snapshotGeneratedAt,county?:string)=>multiStateAddressReviewCandidate(e,generatedAt,c.registryAddress,county);
  const v=get();assert.equal(v?.objectId,c.objectId);assert.equal(v?.endUserValidationRequired,true);assert.equal(v?.countyVerified,c.state!=='MI');
  assert.equal(new URL(v!.sourceUrl).searchParams.get('objectIds'),String(c.objectId));
  assert.equal(v?.sharedSourcePoint,data.candidates.some(x=>x.state===c.state&&x.objectId===c.objectId&&x.sourceKey!==c.sourceKey));
  assert.equal(get({...entry,status:'mapped'}),undefined);assert.equal(get({...entry,name:'Changed'}),undefined);
  assert.equal(get(entry,'stale'),undefined);assert.equal(get(entry,data.snapshotGeneratedAt,'99999'),undefined);
  assert.equal(multiStateAddressReviewCandidate(entry,data.snapshotGeneratedAt,{...c.registryAddress,street:'Different street'},undefined),undefined);
  assert.equal(entry.match,null);assert.equal('latitude' in v!,false);
 }
});
