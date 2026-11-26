import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {unzipSync} from 'fflate';
import {validatePrimaryAddressEvidence,primaryAssociationLocality,type PrimaryAddressEvidence} from './primaryAddressEvidence';
import {parseSnapshotEntry,listingLocation,enrichRegistryRow,snapshotMapRows,snapshotSourceUrl,primaryAssociationLabel,type LocationState} from './nationalLocationSnapshot';
import {validateAddressMatch,addressMatchLabel,isPhysicalStreet} from './providerLocationContract';
import {validateAddressMatch as validateApiAddressMatch} from '../../../api-server/src/lib/providerLocationContract';
import type {SourceDirectoryRecord} from './nationalSourceDirectory';

const read=(name:string)=>JSON.parse(readFileSync(new URL('../../../../scripts/'+name,import.meta.url),'utf8'));
const grid=read('fixtures/neris-retained-grid-examples.json');
const mailing=read('fixtures/neris-retained-mailing-examples.json');
const cms=read('fixtures/nppes-primary-component-examples.json');
const counties=Object.fromEntries(read('fixtures/census-2026-county-identities.json').counties.map((row:{GEOID:string;NAME:string})=>[row.GEOID,row.NAME]));
const baseline=unzipSync(readFileSync(new URL('../../../../scripts/data/evidence/primary-recovery-baseline/2026-11-26.zip',import.meta.url)));
const baselineIndex=JSON.parse(new TextDecoder().decode(baseline['index.json']));
const originals=new Map<string,Record<string,any>>();
for(const chunk of baselineIndex.chunks){
 for(const entry of JSON.parse(new TextDecoder().decode(baseline[chunk.file])))originals.set(entry.key,entry);
}
function entry(original:Record<string,any>,candidate:Record<string,any>){
 return {...original,status:'mapped',address:candidate.address,countyFips:candidate.countyFips,match:candidate.match,
  ...(candidate.primaryAddressEvidence?{primaryAddressEvidence:candidate.primaryAddressEvidence}:{})};
}
function stateFor(value:unknown,state:string):LocationState{
 const parsed=parseSnapshotEntry(value,state,counties);
 return {generatedAt:'2026-11-26T00:00:00Z',entries:new Map([[parsed.key,parsed]]),nppesProcessed:true};
}

test('native CMS components survive the actual parser and blank-street national listing with source-native labels',()=>{
 assert(cms.length>0);
 for(const example of cms){
  const context=example.context,proof=example.evidence;
  const original=originals.get(context.key);assert(original);
  const raw=entry(original,{...context,primaryAddressEvidence:proof});
  const state=stateFor(raw,context.state),parsed=state.entries.get(context.key)!;
  assert.deepEqual(validatePrimaryAddressEvidence(proof,context),proof);
  const row=context.nationalRow as SourceDirectoryRecord;
  assert.equal(row[10],'','Fixture must cover the monthly street missing from the national directory');
  const listed=listingLocation(row,state);
  assert.equal(listed.status,'mapped');assert.deepEqual(listed.address,context.address);
  assert.deepEqual(listed.primaryAddressEvidence,proof);
  assert.strictEqual(enrichRegistryRow(row,state),row);
  assert.match(primaryAssociationLabel(parsed.primaryAddressEvidence!),/CMS registered primary practice/);
  assert.doesNotMatch(primaryAssociationLabel(parsed.primaryAddressEvidence!),/inferred/i);
  assert.equal(snapshotSourceUrl(parsed),proof.sourceUrl);
  assert.deepEqual(primaryAssociationLocality(parsed.primaryAddressEvidence!),{city:proof.primaryAddressAsReported.city,zip:proof.primaryAddressAsReported.postalCode.slice(0,5)});
  assert.equal(snapshotMapRows(state,{county:'all',city:'all',category:'ems'}).length,1);
  const wrong=[...row] as SourceDirectoryRecord;wrong[2]+=' UNBOUND';
  assert.equal(listingLocation(wrong,state).status,'review');
  const changed=structuredClone(raw);changed.primaryAddressEvidence.selectedField=proof.selectedField==='line1'?'line2':'line1';
  assert.throws(()=>parseSnapshotEntry(changed,context.state,counties));
 }
});

test('NERIS mailing associations preserve their original identity locality and reported physical site separately',()=>{
 assert(mailing.length>0);
 let differingLocality=false;
 for(const example of mailing){
  const raw=entry(example.original,example.candidate),state=stateFor(raw,raw.state),parsed=state.entries.get(raw.key)!;
  const row=example.nationalRow as SourceDirectoryRecord,proof=parsed.primaryAddressEvidence!;
  const listed=listingLocation(row,state);
  assert.equal(listed.status,'mapped');assert.deepEqual(listed.address,example.candidate.address);
  assert.strictEqual(enrichRegistryRow(row,state),row);
  assert.equal(proof.association,'inferred');assert.match(primaryAssociationLabel(proof),/^Inferred association/);
  assert.equal(new URL(snapshotSourceUrl(parsed)).hostname,'services5.arcgis.com');
  assert.deepEqual(primaryAssociationLocality(proof),{city:example.candidate.primaryAddressEvidence.correlation.primaryCity,zip:example.candidate.primaryAddressEvidence.correlation.zip});
  differingLocality ||= proof.originalAddress?.city!==listed.address?.city || proof.originalAddress?.zip!==listed.address?.zip;
  const changed=structuredClone(raw);changed.primaryAddressEvidence.mailingSourceSha256='a'.repeat(64);
  assert.throws(()=>parseSnapshotEntry(changed,raw.state,counties));
 }
 assert(differingLocality,'Fixtures must exercise a mailing locality that differs from the selected physical site');
});

test('retained grid points pass both contracts and listing guards without weakening ordinary street rules',()=>{
 assert(grid.length>0);
 for(const example of grid){
  const candidate=example.candidate,raw=entry(example.original,candidate);
  assert.equal(isPhysicalStreet(candidate.address.street),false);
  assert.deepEqual(validateAddressMatch(candidate.match,candidate.address),candidate.match);
  assert.deepEqual(validateApiAddressMatch(candidate.match,candidate.address),candidate.match);
  assert.match(addressMatchLabel(candidate.match),/native grid address/);
  const state=stateFor(raw,raw.state);
  assert.equal(listingLocation(example.nationalRow,state).status,'mapped');
  assert.equal(snapshotMapRows(state,{county:'all',city:'all',category:'all'}).length,1);
  const changes=[
   (m:any)=>{delete m.sourceAddressProfile;},
   (m:any)=>{m.point.nativeId='FD00000000';},
   (m:any)=>{m.latitude+=0.0001;m.point.coordinatesAsReported[0]=m.latitude;},
   (m:any)=>{m.point.addressComponent.rule='native-physical-line1';},
  ];
  for(const change of changes){const match=structuredClone(candidate.match);change(match);assert.throws(()=>validateAddressMatch(match,candidate.address));assert.throws(()=>validateApiAddressMatch(match,candidate.address));}
  assert.throws(()=>validateAddressMatch(candidate.match,{...candidate.address,street:'N99999 Different Road'}));
  const held={...raw,status:'not-eligible',match:null,countyFips:''};
  assert.equal(listingLocation(example.nationalRow,stateFor(held,held.state)).status,'not-eligible');
 }
});

test('all explicit proof methods reject missing native binding instead of becoming generic associations',()=>{
 const context=cms[0].context;
 const methods=['neris-department-site-correlation','neris-department-geocoded-site-correlation',
  'neris-department-mailing-site-correlation','neris-department-mailing-geocoded-site-correlation',
  'neris-department-range-site-correlation','neris-department-mailing-range-site-correlation',
  'neris-department-website-site-correlation','nppes-primary-address-components','nppes-usfa-primary-site-correlation'];
 for(const method of methods)assert.throws(()=>validatePrimaryAddressEvidence({method},context));
 assert.throws(()=>validatePrimaryAddressEvidence({method:'unreviewed-site-association'},context));
 assert.equal(validatePrimaryAddressEvidence(undefined,context),undefined);
});

test('phone association labels preserve the correlated USFA role without claiming a NERIS station',()=>{
 const proof={method:'nppes-usfa-primary-site-correlation',association:'inferred',siteRole:'correlated-usfa-primary-site',
  originalAddress:null,correlation:{cmsNativeRecord:{primaryAddress:{city:'Example',postalCode:'123456789'}}}} as unknown as PrimaryAddressEvidence;
 assert.equal(primaryAssociationLabel(proof),'Inferred association with USFA primary site · end-user validation required');
 assert.deepEqual(primaryAssociationLocality(proof),{city:'Example',zip:'12345'});
});
