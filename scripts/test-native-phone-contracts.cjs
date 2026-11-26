const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const output=process.argv[2];
if(!output)throw Error('Compiled contract directory is required');
const examples=JSON.parse(fs.readFileSync('scripts/fixtures/nppes-phone-site-examples.json','utf8'));
const clone=value=>JSON.parse(JSON.stringify(value));
let checks=0;
for(const root of ['ems-territory-intelligence/src/services','api-server/src/lib']){
 const contract=require(path.join(output,root,'nppesPhoneSiteContract.js'));
 assert.equal(contract.validateNppesPhoneSiteEvidence(undefined,{}),undefined);
 for(const example of examples){
  assert.deepEqual(contract.validateNppesPhoneSiteEvidence(example.evidence,example.context),example.evidence);
  for(const change of [
   value=>{value.identityProfile='unretained';},
   value=>{value.identityPairSha256='0'.repeat(64);},
   value=>{value.donorReleaseIndexSha256='0'.repeat(64);},
   value=>{value.donor.entry.status='no-match';},
   value=>{value.donor.entry.match.latitude+=0.0001;},
   value=>{value.correlation.phone='0000000000';},
   value=>{value.correlation.nameBasis.cmsNativeName='Different native organization';},
   value=>{value.association='source-native';},
   value=>{value.siteRole='headquarters';},
   value=>{value.endUserValidationRequired=false;}
  ]){
   const altered=clone(example.evidence);change(altered);
   assert.throws(()=>contract.validateNppesPhoneSiteEvidence(altered,example.context));checks++;
  }
  for(const change of [
   value=>{value.key='NPI:0000000000';},
   value=>{value.name='Different original organization';},
   value=>{value.match.latitude+=0.0001;},
   value=>{value.address.street='20 Wrong Road';},
   value=>{value.originalAddress={street:'99 Wrong Road',city:'Wrong',state:value.state,zip:'00000'};},
   value=>{value.nationalRow[2]='Different national row';},
  ]){
   const altered=clone(example.context);change(altered);
   assert.throws(()=>contract.validateNppesPhoneSiteEvidence(example.evidence,altered));checks++;
  }
  const donor=example.evidence.donor.entry;
  assert.deepEqual(example.context.match,donor.match);
  assert.deepEqual(example.context.address,donor.address);
  if(donor.match.method==='census-address-range'){
   assert.equal(example.context.match.point,undefined);
   assert.equal(example.context.match.sourceAddress,undefined);
  }
 }
 console.log(root,{actualDonorExamples:examples.length,finiteNativeProofMutationsRejected:true});
}
console.log({mutationChecks:checks,phoneExamples:examples.length});
