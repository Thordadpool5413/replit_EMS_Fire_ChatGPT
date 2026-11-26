const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const output=process.argv[2];
if(!output)throw Error('Compiled contract directory is required');
function fixture(name){return JSON.parse(fs.readFileSync(path.join('scripts/fixtures',name),'utf8'));}
function clone(value){return JSON.parse(JSON.stringify(value));}
for(const root of ['ems-territory-intelligence/src/services','api-server/src/lib']){
 const city=require(path.join(output,root,'federalCityPointContract.js'));
 let cityCount=0;
 for(const example of fixture('federal-city-point-examples.json')){
  const result=city.validateFederalCityFallbackMatch(example.match,example.address);
  assert.equal(result.sourceAddressProfile,'exact-street-city-state-native-postal-difference');
  for(const mutation of [
   value=>{value.latitude+=0.0001;},
   value=>{value.sourceAddress.zip='00000';},
   value=>{delete value.sourceAddressProfile;},
   value=>{value.point.objectId+=1;}
  ]){
   const changed=clone(example.match);mutation(changed);
   assert.throws(()=>city.validateFederalCityFallbackMatch(changed,example.address));
  }
  assert.throws(()=>city.validateFederalCityFallbackMatch(example.match,{...example.address,city:'Other'}));
  cityCount++;
 }
 const cms=require(path.join(output,root,'nppesPrimaryComponentsContract.js'));
 let cmsCount=0;
 for(const example of fixture('nppes-primary-component-examples.json')){
  assert.deepEqual(cms.validateNppesPrimaryAddressEvidence(example.evidence,example.context),example.evidence);
  for(const mutation of [
   value=>{value.npi='0000000000';},
   value=>{value.primaryAddressAsReported.line1='10 Wrong Road';},
   value=>{value.originalAddress.street='10 Wrong Road';},
   value=>{value.sourceRowNumber+=1;},
   value=>{value.nativeRecordSha256='0'.repeat(64);}
  ]){
   const changed=clone(example.evidence);mutation(changed);
   assert.throws(()=>cms.validateNppesPrimaryAddressEvidence(changed,example.context));
  }
  for(const mutation of [
   value=>{value.name='Different ambulance';},
   value=>{value.match.latitude+=0.0001;},
   value=>{value.nationalRow[2]='Different national organization';},
   value=>{value.address.street='20 Wrong Road';}
  ]){
   const changed=clone(example.context);mutation(changed);
   assert.throws(()=>cms.validateNppesPrimaryAddressEvidence(example.evidence,changed));
  }
  cmsCount++;
 }
 let tigerCount=0;
 const tigerFixture='scripts/fixtures/tiger-primary-point-examples.json';
 if(fs.existsSync(tigerFixture)){
  const tiger=require(path.join(output,root,'tigerPrimaryPointContract.js'));
  for(const example of fixture('tiger-primary-point-examples.json')){
   const coordinates=[example.match.latitude,example.match.longitude];
   assert.deepEqual(tiger.validateTigerPrimaryPoint(example.match.point,example.address,coordinates),example.match.point);
   for(const mutation of [
    value=>{value.tlid+=1;},
    value=>{value.interpolationFraction+=0.001;},
    value=>{value.sourceRowNumber+=1;},
    value=>{value.fromHouseNumber='0';},
    value=>{value.coordinatesComputed[0]+=0.0001;}
   ]){
    const changed=clone(example.match.point);mutation(changed);
    assert.throws(()=>tiger.validateTigerPrimaryPoint(changed,example.address,coordinates));
   }
   assert.throws(()=>tiger.validateTigerPrimaryPoint(example.match.point,example.address,[coordinates[0]+0.0001,coordinates[1]]));
   assert.throws(()=>tiger.validateTigerPrimaryPoint(example.match.point,{...example.address,zip:'00000'},coordinates));
   tigerCount++;
  }
 }
 assert.ok(cityCount>0&&cmsCount>0);
 console.log(root,{cityExamples:cityCount,nativeComponentExamples:cmsCount,tigerExamples:tigerCount,mutationsRejected:true});
}
