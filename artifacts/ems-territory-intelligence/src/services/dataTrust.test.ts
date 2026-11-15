import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateOperatingRelationship, queryOfficialNppesByNpi, computeCmsNpiCheckDigit, type NpiRegistryEntity } from './npiVerificationService';
import { hasAgencyFactData } from '../data/agencyFactEvidence';
import type { Agency } from '../types';
test('name equality or containment is only a candidate operating relationship',()=>{
 const entity={legalEntityName:'County EMS',enumerationType:'NPI-2',isOrganization:true,isIndividual:false,practiceLocationAddress:{state:'FL'}} as NpiRegistryEntity;
 assert.equal(evaluateOperatingRelationship(entity,'County EMS','Town','FL').relationship,'POSSIBLE_RELATED_ENTITY');
 assert.equal(evaluateOperatingRelationship(entity,'County EMS Authority','Town','FL').relationship,'POSSIBLE_RELATED_ENTITY');
 assert.equal(evaluateOperatingRelationship(entity,'County EMS','Town','TX').relationship,'UNRELATED_ENTITY');
});
test('individual NPI lookups use backend and distinguish errors from empty records',async()=>{
 const original=globalThis.fetch; const npi='123456789'+computeCmsNpiCheckDigit('123456789');
 try {
 globalThis.fetch=async(input)=>{assert.equal(input,`/api/ems-registry/npi/${npi}`);return new Response(JSON.stringify({Errors:[{description:'bad request'}]}));};
 assert.equal((await queryOfficialNppesByNpi(npi)).status,'SOURCE_UNAVAILABLE');
 globalThis.fetch=async()=>new Response(JSON.stringify({result_count:0,results:[]}));
 assert.equal((await queryOfficialNppesByNpi(npi)).status,'NOT_FOUND');
 }finally{globalThis.fetch=original;}
});
test('generated equipment is not promoted to fact data by mere presence',()=>{
 const agency={verificationSource:'Geographic prospect generator',installedFleet:{defibBrand:'Illustrative',defibUnitsCount:7},factEvidence:{}} as Agency;
 assert.equal(hasAgencyFactData(agency,'defibrillatorBiomedicalFleet'),false);
});
