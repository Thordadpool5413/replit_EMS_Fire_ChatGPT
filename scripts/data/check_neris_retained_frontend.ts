import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const path=process.argv[2];if(!path)throw Error('A fully replayed retained validation input is required.');
const profiles=JSON.parse(readFileSync(path,'utf8')) as Array<{profile:string;records:Array<{key:string;payload:any;nationalRow:string[]}>}>;
const modules:Record<string,[string,string]>={
 'core-geocoded':['nerisGeocodedSiteContract.ts','validateNerisGeocodedSiteEvidence'],
 mailing:['nerisMailingSiteContract.ts','validateNerisMailingSiteEvidence'],
 'mailing-geocoded':['nerisMailingGeocodedSiteContract.ts','validateNerisMailingGeocodedSiteEvidence'],
 range:['nerisRangeSiteContract.ts','validateNerisRangeSiteEvidence'],
 'mailing-range':['nerisRangeSiteContract.ts','validateNerisRangeSiteEvidence'],
 website:['nerisWebsiteSiteContract.ts','validateNerisWebsiteSiteEvidence'],
 grid:['nerisGridAddressContract.ts','validateNerisGridAddressMatch'],
};
for(const profile of profiles){
 const [filename,functionName]=modules[profile.profile];
 const imported=await import(new URL('../../artifacts/ems-territory-intelligence/src/services/'+filename,import.meta.url).href);
 const validate=imported[functionName];let checked=0;
 for(const record of profile.records){
  const payload=record.payload;
  if(profile.profile==='grid'){
   assert.deepEqual(validate(payload.match,payload.address),payload.match);
   const changed=structuredClone(payload.match);changed.latitude+=0.000001;
   assert.throws(()=>validate(changed,payload.address));
   assert.throws(()=>validate(payload.match,{...payload.address,street:payload.address.street+' changed'}));
  }else{
   const {primaryAddressEvidence:proof,...context}=payload;context.nationalRow=record.nationalRow;
   assert.deepEqual(validate(proof,context),proof);
   const changed=structuredClone(proof);changed.site.objectId+=1;
   assert.throws(()=>validate(changed,context));
   assert.throws(()=>validate(proof,{...context,originalAddress:context.originalAddress?{...context.originalAddress,street:context.originalAddress.street+' changed'}:{street:'1 Different St',city:'Other',state:context.state,zip:'00000'}}));
   const native=[...record.nationalRow];native[2]+=' changed';
   assert.throws(()=>validate(proof,{...context,nationalRow:native}));
  }
  checked++;
 }
 console.log(JSON.stringify({profile:profile.profile,actualFrontendBindingsChecked:checked,nativeIdentityAndCoordinateMutationChecks:'passed'}));
}
