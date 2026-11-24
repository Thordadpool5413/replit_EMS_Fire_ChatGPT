import assert from 'node:assert/strict';
import test from 'node:test';
import type { Agency } from '../types';
import { agencyIdentifierLabel, isGeographicProspect, isGeneratedFdid, withoutGeneratedFdid, withoutUnsubstantiatedProspectContract } from './providerRecordTrust';
import { hasAgencyContractEvidence, hasAgencyFactData } from '../data/agencyFactEvidence';
import { findLinkedRegistryAgency, registryIdentifierText } from '../services/registryAccountLink';
import type { SourceDirectoryRecord } from '../services/nationalSourceDirectory';
const agency = {id:'fire-va-51001-chincoteague',stateCode:'VA',agencyType:'Volunteer Fire',fdid:'VA-FD-51001-CHI',isFdidVerified:true,verificationSource:'Federal CMS NPI Registry',competitorContract:{contractEndDate:'2028-03-28',vendor:'Synthetic'},fieldNotes:[{id:'keep'}],factEvidence:{},installedFleet:{defibBrand:'Illustrative'}} as unknown as Agency;
test('known geographic identity survives a verification label change; generated ID is quarantined',()=>{
 assert.equal(isGeographicProspect(agency),true);assert.equal(isGeneratedFdid(agency.fdid,agency),true);assert.equal(agencyIdentifierLabel(agency),'FDID not reported');
 const cleaned=withoutGeneratedFdid(agency);assert.equal(cleaned.fdid,'');assert.equal(cleaned.isFdidVerified,false);assert.deepEqual(cleaned.fieldNotes,agency.fieldNotes);
 assert.equal(isGeneratedFdid('VA-00103',agency),false);assert.equal(agencyIdentifierLabel({...cleaned,fdid:'00103',isFdidVerified:true}),'FDID 00103');
});
test('fallback generator and old contract never become facts when cloud synced',()=>{
 const legacy={...agency,id:'territory-va-fire-abc123',fdid:'VA-51001',verificationSource:'Firestore Cloud Synced'};
 assert.equal(isGeographicProspect(legacy),true);assert.equal(isGeneratedFdid(legacy.fdid,legacy),true);assert.equal(hasAgencyFactData(legacy,'defibrillatorBiomedicalFleet'),false);assert.equal(hasAgencyContractEvidence(legacy),false);
 const safe=withoutUnsubstantiatedProspectContract(legacy,false);assert.equal(safe.competitorContract.contractEndDate,'');assert.equal(legacy.competitorContract.contractEndDate,'2028-03-28');assert.deepEqual(safe.fieldNotes,legacy.fieldNotes);
});
test('registry namespaces preserve leading zeroes and link only uniquely confirmed associations',()=>{
 const row=['usfa:VA:00103','USFA','Chincoteague Volunteer Fire Company','VA','Chincoteague','23336','51001','Accomack','source-county','','5052 Deep Hole RD',''] as SourceDirectoryRecord;
 assert.equal(registryIdentifierText(row),'FDID 00103 (VA)');assert.equal(findLinkedRegistryAgency(row,[agency]),undefined);
 const linked={...agency,sourceRecordAssociations:[{sourceName:'USFA NFDR',sourceRecordId:'00103',decision:'confirmed',sourceFields:{fdid:'00103'}}]} as unknown as Agency;
 assert.equal(findLinkedRegistryAgency(row,[linked]),linked);assert.equal(findLinkedRegistryAgency(row,[linked,{...linked,id:'another'}]),undefined);assert.equal(findLinkedRegistryAgency(row,[{...linked,stateCode:'TX'}]),undefined);
});
test('mapped contract evidence requires valid date and does not allow a modeled logic source',()=>{
 const mapped={...agency,factEvidence:{maintenanceContracts:{sourceName:'Town procurement',sourceRecordId:'contract-7',sourceUrl:'https://example.gov/contracts/7',sourceKind:'link',reviewed:false}}} as Agency;
 assert.equal(hasAgencyContractEvidence(mapped),true);
 assert.equal(hasAgencyContractEvidence({...mapped,factEvidence:{maintenanceContracts:{...mapped.factEvidence!.maintenanceContracts!,sourceKind:'logic',note:'estimate'}}}),false);
 assert.equal(hasAgencyContractEvidence({...mapped,competitorContract:{...mapped.competitorContract,contractEndDate:''}}),false);
});
