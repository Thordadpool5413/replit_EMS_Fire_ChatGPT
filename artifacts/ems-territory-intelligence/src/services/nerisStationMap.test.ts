import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateNerisMapShard,filterNerisMap,groupNerisMap} from './nerisStationMap';
const read=async(path:string)=>JSON.parse(await readFile(new URL('../../public/registry/'+path,import.meta.url),'utf8'));
test('national station discovery uses actual retained source, geographic state and bounded grouping',async()=>{
 const i=await read('neris-station-map/index.json'),m=await read('national/index.json');
 const chunks=await Promise.all(i.chunks.map(async(c:any)=>validateNerisMapShard(await read('neris-station-map/'+c.file),c,m.countyNames)));
 const rows=chunks.flat();assert.equal(rows.length,65970);assert.equal(new Set(rows.map(r=>r.id)).size,65970);
 assert.equal(rows.filter(r=>r.coordinates).length,65967);assert.equal(groupNerisMap(rows).length,61743);
 const cross=rows.find(r=>r.address[3]!==r.parentState&&r.countyFips);assert.ok(cross);
 const data={state:cross.address[3],rows:chunks[i.chunks.findIndex((c:any)=>c.state===cross.address[3])],countyNames:m.countyNames,retrievedAt:i.retrievedAt};
 const scope={state:cross.address[3],county:cross.countyFips!,city:'all',category:'fire' as const,query:cross.id};
 assert.ok(filterNerisMap(data,scope).some(r=>r.id===cross.id));
 assert.equal(filterNerisMap(data,{...scope,state:cross.parentState}).length,0);
 assert.equal(filterNerisMap(data,{...scope,category:'ems'}).length,0);
 assert.equal(filterNerisMap(data,{...scope,county:'not-a-county'}).length,0);
 const c=i.chunks[0];assert.throws(()=>validateNerisMapShard(chunks[0].slice(1),c,m.countyNames));
});
