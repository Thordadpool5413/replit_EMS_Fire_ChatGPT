import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isOverturePointMethod,validateOverturePrimaryPoint,OVERTURE_POINT_SOURCES,type OverturePrimaryPoint} from './overturePrimaryPointContract';

type Example={label:string;method:'overture-address';point:OverturePrimaryPoint;latitude:number;longitude:number};
const fixtures=JSON.parse(readFileSync(new URL('../../../../scripts/fixtures/overture-primary-point-examples.json',import.meta.url),'utf8')) as Example[];

test('actual retained points preserve native coordinates, attribution and approximate precision',()=>{
  for(const f of fixtures){
    const point=validateOverturePrimaryPoint(f.point,f.method);
    assert.deepEqual(point,f.point,f.label);
    assert.deepEqual(point.coordinatesAsReported,[f.latitude,f.longitude]);
    assert.equal(point.precision,'reported-address-point');
    assert.equal(point.sourceDate,null);
  }
  assert.equal(isOverturePointMethod('overture-address'),true);
  assert.equal(isOverturePointMethod('overture-place-address'),false);
  assert.equal(OVERTURE_POINT_SOURCES['overture-place-address'].enabled,false);
});

test('source row, file, inventory, native coordinate and precision mutations fail closed',()=>{
  const changes:Array<(p:any)=>void>=[
    p=>{p.nativeId='00000000-0000-4000-8000-000000000000';},
    p=>{p.sourceFile=p.sourceFile.replace('part-','../part-');},
    p=>{p.sourceEtag='different-object';},
    p=>{p.sourceFileSha256='a'.repeat(64);},
    p=>{p.sourceSha256='a'.repeat(64);},
    p=>{p.sourceInventorySha256='a'.repeat(64);},
    p=>{p.sourceRowNumber+=1;},
    p=>{p.countyFips='01001';},
    p=>{p.coordinatesAsReported[0]+=0.0001;},
    p=>{p.sourceDigestScope='full-parquet-file';},
    p=>{p.precision='rooftop';},
    p=>{p.sourceDate='2026-11-18';},
    p=>{p.coordinateReuseDistinctAddresses=2;},
    p=>{p.completeUSRowsAudited-=1;},
  ];
  for(const change of changes){const point=structuredClone(fixtures[0].point);change(point);assert.throws(()=>validateOverturePrimaryPoint(point,'overture-address'));}
});

test('native source attribution is not replaced by a wrapper or inferred license',()=>{
  const changes:Array<(p:any)=>void>=[
    p=>{p.attribution[0].provider='usdot';},
    p=>{p.attribution[0].license='CC-BY-NC-4.0';},
    p=>{p.attribution[0].license='CC0-1.0';},
    p=>{p.attribution[0].record_id='another-source-record';},
    p=>{p.attribution[0].update_time='2026-11-26T00:00:00Z';},
    p=>{delete p.attribution[0].confidence;},
  ];
  for(const change of changes){const point=structuredClone(fixtures[0].point);change(point);assert.throws(()=>validateOverturePrimaryPoint(point,'overture-address'));}
});

test('API and frontend retain identical native point contracts and source row pins',()=>{
  for(const name of ['overturePrimaryPointContract.ts','overturePrimaryPointPins.ts']){
    assert.equal(readFileSync(new URL('./'+name,import.meta.url),'utf8'),readFileSync(new URL('../../../api-server/src/lib/'+name,import.meta.url),'utf8'));
  }
});
