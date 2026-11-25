// Execute the production county hierarchy and provider router against the actual
// bundled assets. Only Vite's asset-URL loading is replaced for the Node runner;
// no agency, county, boundary or registry records are mocked.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {mkdtemp,rm} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
const app=path.join(root,'artifacts/ems-territory-intelligence');
const req=createRequire(path.join(app,'package.json'));
const {build}=createRequire(req.resolve('vite'))('esbuild');
const data=gunzipSync(fs.readFileSync(path.join(app,'src/data/all-counties-database.json.gz'))).toString();
const temp=await mkdtemp(path.join(os.tmpdir(),'county-routing-'));
try {
 const source=`
import assert from 'node:assert/strict';
import fs from 'node:fs';
const storage=new Map();globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
const boundaryText=fs.readFileSync(${JSON.stringify(path.join(app,'public/data/us-counties-boundaries.json.gz.txt'))},'utf8');
globalThis.fetch=async url=>{assert(String(url).endsWith('data/us-counties-boundaries.json.gz.txt'));return new Response(boundaryText);};
const {territoryEngine}=await import(${JSON.stringify(path.join(app,'src/services/territoryIntelligenceEngine.ts'))});
const {nationalProviderDb}=await import(${JSON.stringify(path.join(app,'src/services/nationalProviderDatabase.ts'))});
const {countyBoundaryHierarchy}=await import(${JSON.stringify(path.join(app,'src/services/countyBoundaryHierarchyService.ts'))});
const {canonicalizeAgencyCounty}=await import(${JSON.stringify(path.join(app,'src/utils/countyIdentity.ts'))});
const hierarchy=countyBoundaryHierarchy.getHierarchy();assert.equal(hierarchy.totalCounties,3144);assert.equal(hierarchy.totalStates,51);
let projected=0;
for(const state of hierarchy.statesList){
 const loaded=await countyBoundaryHierarchy.fetchStateCountyBoundaries(state.stateCode);
 assert.equal(loaded.length,territoryEngine.getCountiesForState(state.stateCode).length,state.stateCode);
 assert(loaded.every(c=>c.geometry),state.stateCode+' missing geometry');
 const {projectedCounties:polygons}=countyBoundaryHierarchy.projectStateCountiesToSvg(state.stateCode);
 assert.equal(polygons.length,loaded.length,state.stateCode+' projection count');
 assert(polygons.every(p=>p.svgPath&&!/NaN|Infinity/.test(p.svgPath)),state.stateCode+' invalid projection');projected+=polygons.length;
}
assert.equal(projected,3144);
const ct=nationalProviderDb.getProviders({state:'CT',county:'Capitol Planning Region'});assert.equal(ct.length,0,'Legacy illustrative profiles must not appear as saved agency records');
const hartford=canonicalizeAgencyCounty({stateCode:'CT',city:'Hartford',county:'Hartford County',countyFips:'09003'});assert.equal(hartford.county,'Capitol Planning Region');assert.equal(hartford.countyFips,'09110');
const newYork=canonicalizeAgencyCounty({stateCode:'NY',county:'New York (Manhattan) County',countyFips:'36061'});assert.equal(newYork.county,'New York County');assert.equal(newYork.countyFips,'36061');
assert.equal(territoryEngine.resolveOrSynthesizeAgency('CT','Hartford County','Unknown Town'),undefined,'Legacy county must not select a first region');
assert.equal(territoryEngine.resolveOrSynthesizeAgency('CT','Western Connecticut Planning Region','Danbury'),undefined,'Missing regional metrics must not create synthetic operational inputs');
assert(!nationalProviderDb.getInitialBaselineAgencies().some(a=>a.stateCode==='CT'&&a.verificationSource?.includes('Geographic prospect generator')));
assert.equal(territoryEngine.getCountyRecord('AK','Anchorage Borough')?.countyName,'Anchorage Municipality');
const {lookupZipCode,NATIONAL_ZIP_CITY_REGISTRY}=await import(${JSON.stringify(path.join(app,'src/data/nationalZipCityRegistry.ts'))});
assert.equal(lookupZipCode('06199'),undefined,'Unknown ZIP must not choose the first county');
const ctLocations=NATIONAL_ZIP_CITY_REGISTRY.filter(r=>r.stateCode==='CT');assert(ctLocations.length>0);
for(const location of ctLocations){const region=canonicalizeAgencyCounty({stateCode:'CT',city:location.city,county:location.county,countyFips:location.fipsCounty});assert(/^091[1-9]0$/.test(region.countyFips),'ZIP '+location.zipCode+' did not resolve through its exact town to a current region');}
console.log(JSON.stringify({status:'PASS',states:51,projectedCounties:projected,connecticutProfiles:ct.length,connecticutZipLocations:ctLocations.length,newYorkCanonicalCounty:newYork.county,legacyCountyFallback:'unresolved',networkRequests:'none'}));
`;
 await build({stdin:{contents:source,resolveDir:app,loader:'ts'},bundle:true,platform:'node',format:'esm',outfile:path.join(temp,'check.mjs'),define:{'import.meta.env.BASE_URL':JSON.stringify('/')},plugins:[{name:'bundled-county-bytes',setup(b){b.onLoad({filter:/allCountiesDatabase\.ts$/},()=>({contents:'export const ALL_NATIONWIDE_COUNTIES = '+data+';',loader:'ts'}));}}]});
 const result=spawnSync(process.execPath,[path.join(temp,'check.mjs')],{stdio:'inherit'});process.exitCode=result.status??1;
}finally{await rm(temp,{recursive:true,force:true});}
