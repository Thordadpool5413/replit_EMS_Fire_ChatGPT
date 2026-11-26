/** Verify the actual frontend parsers, directory binding, and map filters. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {isDeepStrictEqual} from 'node:util';
import {parseSnapshotEntry,listingLocation,snapshotMapRows,enrichRegistryRow} from '../artifacts/ems-territory-intelligence/src/services/nationalLocationSnapshot.ts';
import {registryIdentityKey,snapshotRegistryIdentity} from '../artifacts/ems-territory-intelligence/src/services/registryAccountLink.ts';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(path.join(root,'artifacts/ems-territory-intelligence/package.json'));
const {unzipSync}=require('fflate');
const directory=path.resolve(process.argv[2]??'');
if(!process.argv[2])throw Error('Provide the separately built candidate directory.');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const publicRoot=path.join(root,'artifacts/ems-territory-intelligence/public/registry');
const baselineZip=unzipSync(fs.readFileSync(path.join(root,'scripts/data/evidence/primary-recovery-baseline/2026-11-26.zip')));
assert.equal(hash(baselineZip['index.json']),'e1f59b47e7d6931714b2defcfd02acefc4013d3dd793ed2081a27df6a3bd0a48','Original denominator snapshot changed');
const baselineIndex=JSON.parse(Buffer.from(baselineZip['index.json']).toString('utf8'));
const originals=new Map();
for(const chunk of baselineIndex.chunks){
 assert.equal(hash(baselineZip[chunk.file]),chunk.sha256);
 for(const row of JSON.parse(Buffer.from(baselineZip[chunk.file]).toString('utf8')))originals.set(row.key,row);
}
assert.equal(originals.size,46791);
const nerisZip=unzipSync(fs.readFileSync(path.join(root,'scripts/data/evidence/primary-neris-rebuilt/2026-11-26/original.zip')));
const nerisReport=JSON.parse(Buffer.from(nerisZip['candidates.json']).toString('utf8'));
const auditedWithheld=new Set(nerisReport.legacyAudit.filter(r=>!r.accepted).map(r=>r.key));
const counties=Object.fromEntries(read(path.join(root,'scripts/fixtures/census-2026-county-identities.json')).counties.map(c=>[c.GEOID,c.NAME]));
const nationalIndex=read(path.join(publicRoot,'national/index.json'));
const index=read(path.join(directory,'index.json'));
assert.equal(index.chunks.length,51);
assert.equal(new Set(index.chunks.map(c=>c.state)).size,51);
const states=new Map(),seen=new Set(),methods={},sources={},failures=[];
let rawMapped=0,usableMapped=0,nationalListingsChecked=0,inferredSites=0;
for(const chunk of index.chunks){
 assert.equal(chunk.file,chunk.state+'.json');
 assert.equal(chunk.registrySha256,nationalIndex.chunks.find(c=>c.state===chunk.state)?.sha256);
 const bytes=fs.readFileSync(path.join(directory,chunk.file));assert.equal(hash(bytes),chunk.sha256);
 assert(bytes.toString('utf8').length<=8_000_000,'Location shard exceeds the frontend loader limit');
 const rows=JSON.parse(bytes);assert.equal(rows.length,chunk.count);
 const entries=new Map();
 for(const raw of rows){
  assert(!seen.has(raw.key));seen.add(raw.key);
  const original=originals.get(raw.key);assert(original,'New source identity entered the denominator');
  for(const field of ['key','name','state','source','sourceDate','sourceCounty'])assert.deepEqual(raw[field],original[field],field+' changed for '+raw.key);
  if(!isDeepStrictEqual(raw.address,original.address))assert.deepEqual(raw.primaryAddressEvidence?.originalAddress,original.address,'Changed address lacks the original native address');
  if(original.status==='mapped'&&!auditedWithheld.has(raw.key)){
   assert.equal(raw.status,'mapped');assert.equal(raw.match.latitude,original.match.latitude);assert.equal(raw.match.longitude,original.match.longitude);
  }
  const entry=parseSnapshotEntry(raw,chunk.state,counties);entries.set(entry.key,entry);
  if(entry.status==='mapped')rawMapped++;
  if(entry.primaryAddressEvidence)inferredSites++;
 }
 const state={generatedAt:index.generatedAt,entries,nppesProcessed:index.nppesArchive.status==='processed'};
 const mapRows=snapshotMapRows(state,{county:'all',city:'all',category:'all'});
 for(const e of mapRows){usableMapped++;methods[e.match.method]=(methods[e.match.method]??0)+1;sources[e.source]=(sources[e.source]??0)+1;}
 states.set(chunk.state,state);
}
assert.equal(seen.size,46791);assert.deepEqual(new Set(originals.keys()),seen);
for(const chunk of nationalIndex.chunks){
 if(!states.has(chunk.state))continue;
 const bytes=fs.readFileSync(path.join(publicRoot,'national',chunk.file));assert.equal(hash(bytes),chunk.sha256);
 const state=states.get(chunk.state);
 for(const raw of JSON.parse(bytes)){
  const identity=snapshotRegistryIdentity(raw),key=identity&&registryIdentityKey(identity),entry=key&&state.entries.get(key);
  if(!entry)continue;
  const usable=entry.status==='mapped'&&entry.match&&(!entry.sourceCounty||entry.sourceCounty===entry.countyFips);
  const location=listingLocation(raw,state);
  if(usable){
   nationalListingsChecked++;
   if(location.status!=='mapped'||!location.match)failures.push({key:entry.key,kind:'raw-listing',status:location.status});
   const enriched=listingLocation(enrichRegistryRow(raw,state),state);
   if(enriched.status!=='mapped'||!enriched.match)failures.push({key:entry.key,kind:'enriched-listing',status:enriched.status});
  }else if(location.status==='mapped'&&location.match)failures.push({key:entry.key,kind:'withheld-point-reintroduced'});
 }
}
assert.deepEqual(failures,[],'Some usable points do not survive the actual listing guards');
assert.equal(index.primaryCoverageTarget.usableMapped,usableMapped,'Backend and actual frontend coverage disagree');
const report={totalPrimarySourceRecords:seen.size,rawMapped,usableMapped,usableCoveragePct:Number((100*usableMapped/seen.size).toFixed(4)),requiredMapped:44452,remainingToTarget:Math.max(0,44452-usableMapped),targetMet:usableMapped>=44452,nationalListingsChecked,inferredSites,bySource:sources,byMethod:methods,frontendContract:'passed'};
fs.writeFileSync(path.join(path.dirname(directory),path.basename(directory)+'-frontend-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(process.argv.includes('--require-target')&&!report.targetMet)process.exitCode=2;
