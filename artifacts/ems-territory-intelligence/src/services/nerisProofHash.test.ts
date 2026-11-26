import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {nerisSha256,canonicalNerisJson,nerisProofDigest} from './nerisProofHash';
import {retainedNerisPayload,validateRetainedNerisEvidence} from './nerisRetainedProfileContract';

test('synchronous proof digest agrees with native SHA-256 across Unicode and block boundaries',()=>{
 for(const value of ['', 'abc', 'Station É 🚒', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), 'x'.repeat(1000)])
  assert.equal(nerisSha256(value),createHash('sha256').update(value).digest('hex'));
 assert.equal(nerisSha256('abc'),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
test('canonical proofs ignore object key order while preserving values, array order and exact native numbers',()=>{
 assert.equal(nerisProofDigest({b:2,a:1}),nerisProofDigest({a:1,b:2}));
 assert.equal(canonicalNerisJson({b:undefined,a:1}),'{"a":1}');
 assert.notEqual(nerisProofDigest({nativeIds:['A','B']}),nerisProofDigest({nativeIds:['B','A']}));
 assert.notEqual(nerisProofDigest({latitude:32.5}),nerisProofDigest({latitude:32.500000001}));
});
test('finite proof binding includes original identity, selected point and independently loaded national row',()=>{
 const proof={method:'test-native-proof',sourceSha256:'x',reciprocalSourceCount:1};
 const ctx={key:'FDID:WI:1',name:'Native Fire Department',state:'WI',source:'USFA',sourceCounty:'55101',
  countyFips:'55101',address:{street:'1 Main St',city:'Example',state:'WI',zip:'53001'},match:{latitude:43,longitude:-88},
  originalAddress:{street:'PO BOX 7',city:'Example',state:'WI',zip:'53001'},nationalRow:['exact','native','row']};
 const pins={schemaVersion:1,method:proof.method,sourceArchiveSha256:'a'.repeat(64),candidateCount:1,
  bindings:{[ctx.key]:{proof:nerisProofDigest(retainedNerisPayload(proof,ctx)),national:nerisProofDigest(ctx.nationalRow)}}};
 assert.deepEqual(validateRetainedNerisEvidence(proof,ctx,proof.method,pins),proof);
 for(const changed of [{...ctx,name:'Other Department'},{...ctx,sourceCounty:'55001'},{...ctx,match:{latitude:43.0001,longitude:-88}},
  {...ctx,nationalRow:['changed','native','row']},{...ctx,originalAddress:{...ctx.originalAddress,street:'PO BOX 8'}}])
  assert.throws(()=>validateRetainedNerisEvidence(proof,changed,proof.method,pins));
 assert.throws(()=>validateRetainedNerisEvidence({...proof,reciprocalSourceCount:2},ctx,proof.method,pins));
});
