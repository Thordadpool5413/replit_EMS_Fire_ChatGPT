import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {validateOverturePrimaryPoint} from './overturePrimaryPointContract';
const examples=JSON.parse(readFileSync(new URL('../../../../scripts/fixtures/overture-primary-variant-point-examples.json',import.meta.url),'utf8'));
test('separate native target point pins bind exact retained source records',()=>{
  assert.ok(examples.length>0);
  for(const example of examples)assert.deepEqual(validateOverturePrimaryPoint(example.point,example.method),example.point);
});
test('native variant point mutations fail',()=>{
  for(const example of examples){
    const point=structuredClone(example.point);point.sourceRowNumber++;
    assert.throws(()=>validateOverturePrimaryPoint(point,example.method));
    const changed=structuredClone(example.point);changed.coordinatesAsReported[1]+=0.0001;
    assert.throws(()=>validateOverturePrimaryPoint(changed,example.method));
  }
});
