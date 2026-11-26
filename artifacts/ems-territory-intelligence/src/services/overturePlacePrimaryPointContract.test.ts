import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {validateOverturePrimaryPoint} from './overturePrimaryPointContract';

const filename=new URL('../../../../scripts/fixtures/overture-place-primary-point-examples.json',import.meta.url);
const examples=fs.existsSync(filename)?JSON.parse(fs.readFileSync(filename,'utf8')):[];
test('replayed native Places examples retain all exact source fields',()=>{
  assert.ok(examples.length>0,'Generate the retained Places examples before this release test.');
  for(const example of examples)assert.deepEqual(validateOverturePrimaryPoint(example.point,'overture-place-address'),example.point);
});
test('native Places coordinates, existence score, status, ordinal and attribution cannot drift',()=>{
  assert.ok(examples.length>0);
  for(const field of ['placeName','placeConfidence','operatingStatus','sourceAddressOrdinal','sourceRowNumber','sourceSha256','countyFips']){
    const point=structuredClone(examples[0].point);
    point[field]=typeof point[field]==='number'?point[field]+1:'changed';
    assert.throws(()=>validateOverturePrimaryPoint(point,'overture-place-address'));
  }
  const point=structuredClone(examples[0].point);point.coordinatesAsReported[0]+=0.00001;
  assert.throws(()=>validateOverturePrimaryPoint(point,'overture-place-address'));
});
test('Places must not accept an unknown native source identity',()=>{
  assert.throws(()=>validateOverturePrimaryPoint({...examples[0]?.point,nativeId:'unretained'},'overture-place-address'));
});
