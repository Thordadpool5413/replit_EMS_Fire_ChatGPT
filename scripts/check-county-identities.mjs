import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
const root=new URL('../',import.meta.url),app=new URL('artifacts/ems-territory-intelligence/',root);
const read=p=>JSON.parse(fs.readFileSync(new URL(p,app),'utf8'));
const reference=JSON.parse(fs.readFileSync(new URL('scripts/fixtures/census-2026-county-identities.json',root),'utf8')).counties;
const counties=JSON.parse(gunzipSync(fs.readFileSync(new URL('src/data/all-counties-database.json.gz',app))));
const boundaries=read('public/data/us-counties-boundaries.json');
const compressed=JSON.parse(gunzipSync(Buffer.from(fs.readFileSync(new URL('public/data/us-counties-boundaries.json.gz.txt',app),'utf8').trim(),'base64')));
assert.deepEqual(compressed,boundaries,'The public map transport must match the canonical geometry asset');
const byId=new Map(counties.map(c=>[c.countyFips,c]));const polygons=new Map(boundaries.features.map(f=>[f.id,f]));
assert.equal(counties.length,3144);assert.equal(byId.size,3144);assert.equal(boundaries.features.length,3144);assert.equal(polygons.size,3144);
const byState={};
for(const official of reference){
 const c=byId.get(official.GEOID),f=polygons.get(official.GEOID);
 assert(c,`${official.GEOID} missing from county catalog`);assert(f,`${official.GEOID} missing polygon`);
 assert.equal(c.countyName,official.NAME,`${official.GEOID} catalog label`);
 assert.equal(f.properties.COUNTY_NAME,official.NAME,`${official.GEOID} polygon label`);
 assert.equal(c.stateCode,official.USPS);assert.equal(f.properties.STATE_CODE,official.USPS);
 assert.equal(f.properties.GEOID,c.countyFips);assert.equal(f.properties.COUNTY,c.countyFips.slice(2));
 assert(['Polygon','MultiPolygon'].includes(f.geometry.type));
 const groups=f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates;
 for(const group of groups)for(const ring of group){assert(ring.length>=4);assert.deepEqual(ring[0],ring.at(-1));for(const [x,y] of ring)assert(Number.isFinite(x)&&Number.isFinite(y)&&Math.abs(x)<=180&&Math.abs(y)<=90);}
 byState[c.stateCode]=(byState[c.stateCode]??0)+1;
}
assert.equal(Object.keys(byState).length,51);assert.equal(byState.CT,9);assert.equal(byState.IL,102);assert.equal(byState.AK,30);assert(!byId.has('17205'));
assert.equal(counties.filter(c=>c.stateCode==='CT').reduce((n,c)=>n+c.cityRecords.length,0),169);
for(const c of counties.filter(c=>c.stateCode==='CT')){assert.equal(c.population,null);assert.equal(c.annualEmergencyTransports,null);assert.equal(c.activeEmsAgencies,null);}
assert.equal(read('src/data/ct-legacy-counties.json').length,8);
console.log(JSON.stringify({status:'PASS',states:51,counties:3144,polygons:3144,connecticutTowns:169,byState}));
