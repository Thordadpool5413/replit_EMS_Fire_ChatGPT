import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateNerisPrimarySiteEvidence,nerisIdentityName,type NerisPrimarySiteContext} from './nerisPrimarySiteContract';
import {selectNerisNativeAddress,validateNerisAddressComponent} from './nerisAddressComponent';

type Fixture={label:string;candidate:Record<string,any>;original:Record<string,any>;nationalRow:string[]};
const fixtures=JSON.parse(readFileSync(new URL('../../../../scripts/fixtures/neris-primary-site-examples.json',import.meta.url),'utf8')) as Fixture[];
const context=(f:Fixture):NerisPrimarySiteContext=>({key:f.original.key,name:f.original.name,state:f.original.state,source:f.original.source,sourceCounty:f.original.sourceCounty,countyFips:f.candidate.countyFips,address:f.candidate.address,match:f.candidate.match,originalAddress:f.original.address,nationalRow:f.nationalRow});

test('retained examples keep headquarters, sole station and native second-line roles explicit',()=>{
 for(const f of fixtures){
  assert.equal(validateNerisAddressComponent(f.candidate.match.point,f.candidate.match.sourceAddress),true,f.label);
  const proof=validateNerisPrimarySiteEvidence(f.candidate.primaryAddressEvidence,context(f));
  if(f.candidate.primaryAddressEvidence){
   assert.equal(proof?.siteRole,f.candidate.primaryAddressEvidence.siteRole);
   assert.equal(proof?.association,'inferred');
   assert.equal(proof?.endUserValidationRequired,true);
   assert.deepEqual(proof?.originalAddress,f.original.address);
  }else assert.equal(proof,undefined);
 }
});

test('native fields bind selected address and never hide a second physical address',()=>{
 const f=fixtures.find(x=>x.label==='headquarters-mailing-line2')!;
 const p=structuredClone(f.candidate.match.point);
 assert.equal(selectNerisNativeAddress(p.addressAsReported)?.hasPhysical,true);
 assert.equal(p.addressComponent.otherLineKind,'mailing-address');
 p.addressAsReported[1]='999 Different Street';
 assert.equal(selectNerisNativeAddress(p.addressAsReported)?.conflict,true);
 assert.equal(validateNerisAddressComponent(p,f.candidate.match.sourceAddress),false);
 const second=fixtures.find(x=>x.label==='headquarters-physical-line2')!;
 const changed=structuredClone(second.candidate.match.point);changed.addressComponent.sourceField='line1';
 assert.equal(validateNerisAddressComponent(changed,second.candidate.match.sourceAddress),false);
});

test('identity, original address, reciprocity, county and native coordinate mutations fail closed',()=>{
 const f=fixtures.find(x=>x.label==='headquarters-mailing-line2')!;
 const changes:Array<(proof:any)=>void>=[
  p=>{p.correlation.reciprocalPrimaryCount=2;},
  p=>{p.correlation.primaryName='Different Fire Department';},
  p=>{p.department.id='FD00000000';},
  p=>{p.originalAddress.street='999 Changed Street';},
  p=>{p.site.coordinatesAsReported[0]+=1;},
  p=>{p.siteRole='confirmed-headquarters';},
  p=>{p.endUserValidationRequired=false;},
 ];
 for(const change of changes){const proof=structuredClone(f.candidate.primaryAddressEvidence);change(proof);assert.throws(()=>validateNerisPrimarySiteEvidence(proof,context(f)));}
 assert.throws(()=>validateNerisPrimarySiteEvidence(f.candidate.primaryAddressEvidence,{...context(f),sourceCounty:'01001'}));
 const match=structuredClone(f.candidate.match);match.latitude+=1;
 assert.throws(()=>validateNerisPrimarySiteEvidence(f.candidate.primaryAddressEvidence,{...context(f),match}));
});

test('sole station requires a complete one-station relation and a nonphysical reported headquarters',()=>{
 const f=fixtures.find(x=>x.label==='sole-station')!;
 for(const field of ['reportedStationCount','observedStationCount']){
  const proof=structuredClone(f.candidate.primaryAddressEvidence);proof.department[field]=2;
  assert.throws(()=>validateNerisPrimarySiteEvidence(proof,context(f)));
 }
 const proof=structuredClone(f.candidate.primaryAddressEvidence);
 proof.department.addressAsReported[0]='123 Real Headquarters Road';
 assert.throws(()=>validateNerisPrimarySiteEvidence(proof,context(f)));
});

test('listing identity is bound to the independent native registry row',()=>{
 const f=fixtures.find(x=>x.label==='headquarters-mailing-line2')!;
 for(const column of [0,2,4,5,6,10]){
  const row=[...f.nationalRow];row[column]='Changed';
  assert.throws(()=>validateNerisPrimarySiteEvidence(f.candidate.primaryAddressEvidence,{...context(f),nationalRow:row}));
 }
 assert.notEqual(nerisIdentityName('North Springfield Fire Department'),nerisIdentityName('Springfield Fire Department'));
 assert.equal(nerisIdentityName('Springfield Vol. Fire Dept.'),'SPRINGFIELD VOLUNTEER FIRE DEPARTMENT');
});

test('API and frontend use identical native address-component rules',()=>{
 assert.equal(readFileSync(new URL('./nerisAddressComponent.ts',import.meta.url),'utf8'),readFileSync(new URL('../../../api-server/src/lib/nerisAddressComponent.ts',import.meta.url),'utf8'));
});
