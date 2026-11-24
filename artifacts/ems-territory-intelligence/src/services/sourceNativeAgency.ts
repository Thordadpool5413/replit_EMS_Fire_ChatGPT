import type {Agency,AgencyFactEvidence} from '../types';
import {getEmsJurisdictionSourceCoverage} from '../data/stateEmsSourceCoverage';
import {canCreateRegistryAccount,findRegistryAccountCandidates,findRegistryIdentityAccounts,registryAccountId,registryIdentityKey,type RegistryIdentity} from './registryAccountLink';

/** Create an account from an explicit public registry listing, never from a county model.
 * Legacy numeric properties are typed as number even when a source does not report them.
 * Use null at this boundary (not zero or a synthetic value); evidence-aware views and scores exclude them.
 */
export function createSourceNativeAgency(identity:RegistryIdentity,agencies:Agency[]):Agency{
 if(!canCreateRegistryAccount(identity))throw Error('This source listing does not support creating a provider account.');
 const jurisdiction=getEmsJurisdictionSourceCoverage(identity.stateCode);
 if(!jurisdiction||jurisdiction.level==='territory')throw Error('State is outside this account directory.');
 if(findRegistryIdentityAccounts(identity,agencies).length)throw Error('Source identity is already associated with a saved account.');
 if(findRegistryAccountCandidates(identity,agencies).length)throw Error('A possible existing account must be reviewed before creating a new account.');
 const id=registryAccountId(identity);
 if(agencies.some(a=>a.id===id))throw Error('This account ID is already in use.');
 const source={...identity,identifier:identity.identifier.trim(),name:identity.name.trim()};
 const fire=source.sourceName==='USFA NFDR'||source.sourceName==='NERIS';
 const evidence:AgencyFactEvidence={reviewed:false,sourceKind:'dataset',sourceName:source.sourceAuthority||source.sourceName,sourceUrl:source.sourceUrl,sourceRecordId:registryIdentityKey(source)!,reportingPeriod:source.sourceDate??undefined,geographicLevel:'agency',note:'Source-native registry listing. Identity only; operating relationship, activity, equipment and service coverage are not established.'};
 // Only retain county assignments explicitly established by the source directory; never infer from city or ZIP.
 const county=source.countyFips&&source.countyName?source.countyName:'';
 const agency={
  id,name:source.name,registryIdentity:source,fdid:source.sourceName==='USFA NFDR'?source.identifier:'',
  ...(source.sourceName==='NPPES'?{npiNumber:source.identifier,nppesOfficialName:source.name,nppesRegistryUrl:source.sourceUrl}:{}),
  ...(source.sourceName==='State EMS'&&source.identifierKind==='license'?{stateLicenseNumber:source.identifier}:{}),
  agencyType:fire?'Fire department (registry listing)':'EMS organization (registry listing)',providerCategory:fire?'FIRE':'EMS',
  jurisdictionLevel:'Local',state:jurisdiction.name,stateCode:source.stateCode,
  county,countyFips:county?source.countyFips:undefined,city:source.city??'',zipCode:source.postalCode??'',address:source.address??'',
  latitude:null,longitude:null,populationServed:null,responseAreaSqMiles:null,stationsCount:null,totalAmbulances:null,totalFireEngines:null,totalEMSStaff:null,
  annualCallVolume:null,annual911Transports:null,annualCardiacArrestCalls:null,bystanderCPRRate:null,utsteinSurvivalRate:null,
  gisData:{populationDensityPerSqMile:null,medianHouseholdIncome:null,seniorPopulationPct:null,povertyRate:null,avgTransportTimeMinutes:null,distanceToNearestCathLabMiles:null,traumaCenterLevel:'Not source-verified',publicAccessAedDeficitPct:null,highRiseBuildingDensity:'',annualTraumaIncidents:null,fiscalBudgetCycleQuarter:'',territoryClusterId:'',territoryClusterName:''},
  qualityMetrics:{nemsqaStemi12LeadAcquisitionPct:null,nemsqaChestCompressionFractionPct:null,nemsqaEtco2VentilationCompliancePct:null,nemsqaPediatricRespiratorySupportPct:null,nemsqaStrokeLkwDocumentedPct:null,nemsqaPainManagementEffectivePct:null,caresGoodNeurologicalSurvivalPct:null,ahaMissionLifelineTier:'',gadcsCostToChargeRatio:null,commercialUnderpaymentPerTrip:null},
  competitorContract:{vendor:'',contractEndDate:'',renewalWindowDays:null,annualServiceCostPerUnit:null,status:'Not reported',actionRecommendation:'Source required.'},
  cmsData:{medicareBilledAnnual:null,medicareAllowedAnnual:null,claimDenialRate:null,medicaidBilledAnnual:null,commercialPayerMixPct:null,gadcsReportingStatus:'',estimatedRecoverableRevenue:null},
  installedFleet:{defibBrand:'',defibUnitsCount:null,defibAgeYears:null,defibWarrantyStatus:'',mechanicalCPR:'',cprUnitsCount:null,transportVentilator:'',ventUnitsCount:null,epcrCadSoftware:'',billingSoftware:''},
  grantStatus:{afgAwarded:false,afgAwardAmount:null,afgFiscalYear:null,afgPurpose:'',saferGrantActive:false,fiscalYearEndMonth:''},
  zollOpportunity:{pulseIqScore:0,priorityTier:'Maintained Account',primaryTargetProduct:'',recommendedBundle:[],projectedPipelineValue:null,clinicalBenefitNarrative:'No clinical evidence recorded.',financialRoiNarrative:'Not calculated.',scoreRationale:'No agency-specific operational inputs.',scoreBreakdown:{clinicalAcuityPts:0,fleetObsolescencePts:0,cmsFinancialPts:0,demographicVulnerabilityPts:0,budgetGrantReadinessPts:0,softwareWhitespacePts:0},salesStage:'Target Lead',probabilityPct:0},
  keyContacts:[],fieldNotes:[],followUpTasks:[],lastContactDate:'',isBookmarked:false,inDayRoute:false,
  verificationSource:'Source-native registry listing',isVerifiedRecord:false,isFdidVerified:source.sourceName==='USFA NFDR',isOperationalDataVerified:false,operatingRelationship:'UNRESOLVED',registryEntityConfirmed:false,
  factEvidence:{departmentRegistry:evidence,...(source.address?{providerAddress:{...evidence,note:'Source-reported recorded address; not a service area.'}}:{})}
 };
 return agency as unknown as Agency;
}
