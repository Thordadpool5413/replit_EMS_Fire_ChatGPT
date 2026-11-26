import test from 'node:test';
import assert from 'node:assert/strict';
import {cmsAmbulanceUrl,fetchCmsAmbulanceEvidence} from './cmsAmbulanceEvidence';
const npi='1003006180';
const fixture={Rndrng_NPI:npi,Rndrng_Prvdr_Last_Org_Name:'Fixture Ambulance',Rndrng_Prvdr_Ent_Cd:'O',Rndrng_Prvdr_City:'Example',Rndrng_Prvdr_State_Abrvtn:'NV',Rndrng_Prvdr_Type:'Ambulance Service Provider',HCPCS_Cd:'A0429',HCPCS_Desc:'Emergency transport',Place_Of_Srvc:'F',Tot_Benes:'12',Tot_Srvcs:'19',Tot_Bene_Day_Srvcs:'18',Avg_Sbmtd_Chrg:'120.25',Avg_Mdcr_Alowd_Amt:'75.5',Avg_Mdcr_Pymt_Amt:'60.4'};
const response=(data:unknown)=>new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}});
test('exact national NPI lookup does not require or filter by state or state licensing',async()=>{
 const u=cmsAmbulanceUrl(npi);assert.equal(u.hostname,'data.cms.gov');assert.equal(u.searchParams.get('filter[Rndrng_NPI]'),npi);assert.equal(u.searchParams.has('filter[Rndrng_Prvdr_State_Abrvtn]'),false);
 const report=await fetchCmsAmbulanceEvidence(npi,async()=>response([fixture,{...fixture,HCPCS_Cd:'A0425',Tot_Srvcs:'19.75',Avg_Mdcr_Pymt_Amt:''},{...fixture,HCPCS_Cd:'99213'},{...fixture,HCPCS_Cd:'A0428',Rndrng_Prvdr_Ent_Cd:'I',Rndrng_Prvdr_Last_Org_Name:'Excluded person'}]));
 assert.equal(report.rows.length,2);assert.equal(report.rows[1].services,19.75);assert.equal(report.rows[1].averageMedicarePayment,null);
 assert.equal(report.denialRateAvailable,false);assert.equal(report.totalClaimCountAvailable,false);assert.equal(report.operatingRelationshipEstablished,false);
 assert.equal(report.endUserValidationRequired,true);assert.ok(!JSON.stringify(report).includes('Excluded person'));
});
test('withhold cross-NPI, schema errors and duplicates; empty is not zero claims',async()=>{
 for(const rows of [[{...fixture,Rndrng_NPI:'1234567890'}],[fixture,fixture],[{...fixture,Tot_Benes:'NaN'}],[{...fixture,Avg_Mdcr_Pymt_Amt:undefined}]]){
  await assert.rejects(fetchCmsAmbulanceEvidence(npi,async()=>response(rows)));
 }
 const empty=await fetchCmsAmbulanceEvidence(npi,async()=>response([]));assert.equal(empty.status,'no-published-rows');assert.deepEqual(empty.rows,[]);
 await assert.rejects(fetchCmsAmbulanceEvidence(npi,async()=>new Response('',{status:503})));
});
