import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),dir=new URL('artifacts/ems-territory-intelligence/public/registry/national/',root);
const index=JSON.parse(fs.readFileSync(new URL('index.json',dir),'utf8'));
const counties=JSON.parse(fs.readFileSync(new URL('scripts/fixtures/census-2026-county-identities.json',root),'utf8')).counties;
const byCounty=new Map(counties.map(c=>[c.GEOID,c]));const records=[];const ids=new Set();
for(const chunk of index.chunks){
 const bytes=fs.readFileSync(new URL(chunk.file,dir));assert.equal(createHash('sha256').update(bytes).digest('hex'),chunk.sha256);
 const part=JSON.parse(bytes);assert.equal(part.length,chunk.count);
 for(const r of part){assert.equal(r.length,12);assert(r.every(v=>typeof v==='string'));assert.equal(r[3],chunk.state);assert(!ids.has(r[0]),r[0]);ids.add(r[0]);
  assert(['USFA','NPPES'].includes(r[1]));assert(r[0].startsWith(r[1].toLowerCase()+':'));assert(r[2]);
  if(r[6]){assert.equal(byCounty.get(r[6])?.USPS,r[3],r[0]);assert(['source-county','official-town-crosswalk'].includes(r[8]));}
  else assert.equal(r[8],'unassigned');
  if(r[1]==='NPPES'){assert.equal(r[6],'','Bundled NPPES rows contain no county and must not be assigned using postal city/ZIP');assert.match(r[11],/^https:\/\/npiregistry.cms.hhs.gov\/provider-view\/\d{10}$/);}
  records.push(r);
 }
}
assert.equal(records.length,index.totalRecords);assert.equal(Object.keys(index.byState).length,51);
assert.equal(records.filter(r=>r[1]==='USFA').length,27117);assert.equal(records.filter(r=>r[1]==='NPPES').length,20554);
for(const [state,expected] of Object.entries(index.byState)){
 const rows=records.filter(r=>r[3]===state);
 assert(expected.usfa>0&&expected.nppes>0,`${state} missing registry`);
 assert.equal(rows.length,expected.usfa+expected.nppes);assert.equal(rows.filter(r=>r[1]==='USFA').length,expected.usfa);assert.equal(rows.filter(r=>r[1]==='NPPES').length,expected.nppes);
 assert.equal(rows.filter(r=>r[6]).length,expected.assigned);assert.equal(rows.filter(r=>!r[6]).length,expected.unassigned);
 assert.equal(new Set(rows.map(r=>r[6]).filter(Boolean)).size,expected.countiesWithRecords);
 assert.equal(counties.filter(c=>c.USPS===state).length,expected.countyCount);
}
assert.equal(new Set(records.map(r=>r[6]).filter(Boolean)).size,index.countiesWithRecords);
assert.equal(records.filter(r=>!r[6]).length,index.unassignedRecords);
assert.equal(Object.values(index.byState).reduce((n,s)=>n+s.usfa+s.nppes,0),index.statesAndDcRecords);
assert.equal(index.statesAndDcRecords+index.otherJurisdictionRecords,index.totalRecords);
console.log(JSON.stringify({status:'PASS',records:records.length,states:51,usfa:27117,nppes:20554,statesAndDc:index.statesAndDcRecords,countiesWithRecords:index.countiesWithRecords,countyGaps:3144-index.countiesWithRecords,unassigned:index.unassignedRecords}));
