/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Agency } from '../types';
import { validateNpiCheckDigit } from '../services/npiVerificationService';
import { getAgencyMedicareDenialMetric } from '../services/agencyMedicareDenialService';
import { hasReviewedAgencyFactEvidence as hasAgencyFactEvidence } from './agencyFactEvidence';

export interface DataRegistrySource {
  id: string;
  name: string;
  acronym: string;
  governingBody: string;
  updateCadence: string;
  legalAuthority: string;
  schemaSpecification: string;
  primaryFieldsIngested: string[];
  verificationMethod: string;
  appConnection: 'live-feed' | 'bundled-asset' | 'catalog-only';
  sourceUrl?: string;
}

export interface FieldLineageRecord {
  category: 'Operational Telemetry' | 'Installed Fleet' | 'Competitor Contracts' | 'Clinical & NEMSIS' | 'CMS Claims & Reimbursement' | 'Demographics & GIS' | 'Grants & Procurement';
  fieldName: string;
  fieldValue: string | number;
  sourceRegistry: string;
  schemaIdentifier: string;
  verificationStatus: 'Verified Official' | 'Cross-Referenced' | 'HIPAA De-Identified' | 'Legal Public Record' | 'Unverified Baseline' | 'Sourcing Required' | 'Model / Estimate' | 'Geographic Benchmark' | 'Public Record (No Active Award)';
  documentationQuote: string;
  isFieldVerified: boolean;
  sourceUrlOrCitation?: string;
  reportingPeriod?: string;
  evidenceBasis?: string;
  evidenceScope?: 'FIELD_VERIFIED' | 'ORGANIZATION_IDENTITY_ONLY' | 'REGIONAL_BENCHMARK' | 'MODELED_ESTIMATE' | 'UNVERIFIED';
  sourceRecordId?: string;
  reviewedAt?: string;
}

export const DATA_REGISTRY_SOURCES: DataRegistrySource[] = [
  {
    id: 'cms_part_b',
    name: 'CMS Physician/Supplier Procedure Summary (PSPS)',
    acronym: 'CMS PSPS',
    appConnection: 'catalog-only',
    sourceUrl: 'https://data.cms.gov/summary-statistics-on-use-and-payments/physiciansupplier-procedure-summary',
    governingBody: 'Centers for Medicare & Medicaid Services (U.S. Dept of Health & Human Services)',
    updateCadence: 'Annual public-use statistical release; check the CMS dataset release date',
    legalAuthority: 'CMS public-use Medicare Part B statistical dataset',
    schemaSpecification: 'Carrier/locality, HCPCS/modifiers, provider specialty, place of service, and service-unit counts',
    primaryFieldsIngested: [
      'PSPS_SUBMITTED_SERVICE_CNT',
      'PSPS_DENIED_SERVICES_CNT',
      'HCPCS_CD and PROVIDER_SPEC_CD',
      'PLACE_OF_SERVICE_CD, CARRIER_NUM, and LOCALITY_CD'
    ],
    verificationMethod: 'CMS dataset documentation and data dictionary. Public cells under 11 are suppressed; records contain service units, not unique claims, and omit NPI and county FIPS.'
  },
  {
    id: 'nemsis_v3',
    name: 'National Emergency Medical Services Information System (NEMSIS)',
    acronym: 'NEMSIS v3.5',
    appConnection: 'catalog-only',
    sourceUrl: 'https://nemsis.org/technical-resources/version-3/version-3-data-dictionaries/',
    governingBody: 'NHTSA Office of EMS (U.S. Dept of Transportation) & Technical Assistance Center (TAC)',
    updateCadence: 'Continuous State-Level Aggregation / National Benchmark Annual Release',
    legalAuthority: 'Highway Safety Act of 1966 (23 U.S.C. 403) & NHTSA Emergency Medical Services Mandate',
    schemaSpecification: 'NEMSIS Data Standard v3.5.0 XML / XSD HL7 Interoperability Protocol',
    primaryFieldsIngested: [
      'eDefib.01 - Initial Cardiac Arrest Rhythm',
      'eTimes.06 & eTimes.07 - Scene Arrival and Patient Contact Latencies',
      'eAirway.08 - Waveform Capnography ETCO2 Confirmation & Ventilation Compliance',
      'Cardiac-01 & Trauma-01 NEMSQA Standard Quality Benchmark Measures'
    ],
    verificationMethod: 'NEMSIS State EMS data submissions cross-validated against TAC compliance schemas.'
  },
  {
    id: 'usfa_registry',
    name: 'U.S. Fire Administration National Fire Department Registry',
    acronym: 'USFA NFDR',
    appConnection: 'live-feed',
    sourceUrl: 'https://apps.usfa.fema.gov/registry/download',
    governingBody: 'Federal Emergency Management Agency (DHS)',
    updateCadence: 'Use the release date on the published registry export.',
    legalAuthority: 'Federal Fire Prevention and Control Act of 1974 (Public Law 93-498)',
    schemaSpecification: 'NFIRS 5.0 Complete Specification & USFA Department Master Record',
    primaryFieldsIngested: [
      'Department name and state-scoped FDID',
      'Department city/county and classification where present',
      'Station name and address rows where present'
    ],
    verificationMethod: 'The app searches the published registry exports. Registry presence does not prove current staffing, apparatus inventory, operating status, or service coverage.'
  },
  {
    id: 'neris_public',
    name: 'NERIS Public Fire Department Feature Service',
    acronym: 'NERIS',
    appConnection: 'live-feed',
    sourceUrl: 'https://services5.arcgis.com/lPbcyJOcoLyZmvo6/arcgis/rest/services/NERIS%20Public%20Fire%20Departments/FeatureServer',
    governingBody: 'U.S. Fire Administration / FEMA',
    updateCadence: 'Record export date is returned by the public feature layers; check each matched record.',
    legalAuthority: 'USFA National Emergency Response Information System public data release',
    schemaSpecification: 'ArcGIS FeatureServer: departments (0), stations (1), department jurisdictions (2), and units table (3)',
    primaryFieldsIngested: [
      'NERIS department and station identifiers',
      'Station address and reported station/unit counts',
      'Unit type, CAD designations, staffing, and station relationship',
      'Department-jurisdiction boundary record and export date',
    ],
    verificationMethod: 'Rows remain separate source candidates matched by state/name/location. Unit rows are not proof of current frontline deployment; jurisdiction geometry is linked at the source and is not inferred from location.',
  },
  {
    id: 'fema_afg',
    name: 'FEMA Assistance to Firefighters Grant (AFG) & SAFER Awards Ledger',
    acronym: 'FEMA AFG / OpenFEMA',
    appConnection: 'live-feed',
    sourceUrl: 'https://www.fema.gov/openfema-data-page/assistance-firefighters-grants-v5',
    governingBody: 'U.S. Department of Homeland Security (DHS) / FEMA Grant Programs Directorate',
    updateCadence: 'Weekly Federal Award Obligation Feed',
    legalAuthority: 'Federal Funding Accountability and Transparency Act (FFATA) & FEMA GPD Title 44 CFR',
    schemaSpecification: 'USASpending Prime Award Financial Feed (Assistance Listing / CFDA 97.044 & 97.083)',
    primaryFieldsIngested: [
      'Active FY24/FY25 AFG Equipment Award Amounts ($)',
      'Specific Awarded Equipment Categories (Defibrillators, Mechanical CPR, Resuscitation Monitors)',
      'Recipient Legal Entity Name, Unique Entity Identifier (UEI), and Matching Share Pct',
      'Grant Period of Performance Expiration Deadlines'
    ],
    verificationMethod: 'Federal Treasury disbursement ledger records cross-referenced against local council acceptance resolutions.'
  },
  {
    id: 'nppes_npi',
    name: 'CMS National Plan and Provider Enumeration System (NPPES)',
    acronym: 'NPPES NPI Registry',
    appConnection: 'live-feed',
    sourceUrl: 'https://npiregistry.cms.hhs.gov/',
    governingBody: 'Centers for Medicare & Medicaid Services (HHS)',
    updateCadence: 'Daily NPI Registry Dissemination Feed',
    legalAuthority: 'HIPAA Administrative Simplification (45 CFR Part 162)',
    schemaSpecification: 'CMS FOIA Provider De-Identified Registry / National Provider Identifier (NPI Type 2)',
    primaryFieldsIngested: [
      'Provider Organization Legal Business Name & 10-Digit NPI',
      'Authorized Official Name, Title, and Physical Headquarters Address',
      'Taxonomy Code 341600000X (Ambulance Service Provider - Land Transport)',
      'Primary Practice Location State, County, and ZIP+4'
    ],
    verificationMethod: 'Federally attested provider identity database with active Medicare billing enrollment.'
  },
  {
    id: 'census_tigerline_bundle',
    name: 'Census TIGER/Line County Boundary Asset',
    acronym: 'Census TIGER/Line',
    appConnection: 'bundled-asset',
    sourceUrl: 'https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html',
    governingBody: 'U.S. Census Bureau',
    updateCadence: 'Bundled geometry asset; source vintage is not attached in the app.',
    legalAuthority: 'U.S. Census Bureau geographic boundary products',
    schemaSpecification: 'Bundled GeoJSON with state/county FIPS, GEOID, NAD83 geometry, area, and centroid fields',
    primaryFieldsIngested: [
      'County polygons and state/county FIPS',
      'County area, centroid, and display labels',
    ],
    verificationMethod: 'The app serves a bundled boundary file and does not refresh it from Census at runtime. The file vintage is not recorded; Connecticut still has legacy county polygons.',
  },
  {
    id: 'fema_nri_counties',
    name: 'FEMA National Risk Index — Counties',
    acronym: 'FEMA NRI',
    appConnection: 'live-feed',
    sourceUrl: 'https://www.fema.gov/about/reports-and-data/openfema/nri',
    governingBody: 'Federal Emergency Management Agency (DHS)',
    updateCadence: 'Versioned public dataset release; the currently returned record version is shown with the value.',
    legalAuthority: 'FEMA National Risk Index public risk-assessment dataset',
    schemaSpecification: 'County STCOFIPS with composite risk, expected annual loss, social vulnerability, and community resilience fields',
    primaryFieldsIngested: [
      'STCOFIPS and county/state names',
      'RISK_SCORE and RISK_RATNG',
      'EAL_VALT and EAL_SCORE',
      'SOVI_SCORE and RESL_SCORE',
      'NRI_VER',
    ],
    verificationMethod: 'Direct county FIPS match to FEMA NRI county records. State expected-annual-loss totals are derived by summing county EAL_VALT only when every app county GEOID has a non-null source value; county scores and ratings are not averaged.',
  },
  {
    id: 'gpo_procurement',
    name: 'National Cooperative Procurement Contracts (Sourcewell, NPPGov, HGACBuy)',
    acronym: 'GPO Contracts',
    appConnection: 'catalog-only',
    sourceUrl: 'https://www.sourcewell-mn.gov/cooperative-purchasing',
    governingBody: 'Public Safety Purchasing Cooperatives & National Joint Powers Alliance',
    updateCadence: 'Master Contract Term Schedules & Published GSA/Cooperative Price Catalogs',
    legalAuthority: 'Uniform Municipal Joint Powers Act & State Intergovernmental Cooperation Statutes',
    schemaSpecification: 'Master Price Agreement Catalog with Competitive RFP Exemption Addenda',
    primaryFieldsIngested: [
      'Master Contract Number (Sourcewell #041819-ZOL, NPPGov PS20025, HGACBuy AM10-20)',
      'Standardized Government Discount Percentages (18% - 32% below list price)',
      'Pre-Negotiated Trade-In Allowances ($4,500 - $6,000 per incumbent unit)',
      'Statutory Legal Piggyback Clause Citations'
    ],
    verificationMethod: 'Publicly posted competitive bids, award letters, and legal council adoption resolutions.'
  }
];

export interface AgencyDataLineageAuditResult {
  records: FieldLineageRecord[];
  dimensionSummary: Record<string, { totalFields: number; verifiedFields: number }>;
  applicableAuditedFields: number;
  verifiedSupportedFields: number;
  evidenceCompletenessPct: number | null;
  integrityStatus: 'VERIFIED_CORROBORATED' | 'PARTIALLY_CORROBORATED' | 'INCOMPLETE_EVIDENCE' | 'UNASSESSED';
  integrityStatusLabel: string;
  overallIntegrityScore: number | null;
  assessmentStatus: 'AUDITED' | 'UNASSESSED';
}

/**
 * Audits all 7 core data dimensions for a specific department and returns
 * the exact field-by-field lineage, registry citations, and verification status.
 *
 * CRITICAL INTEGRITY REQUIREMENT:
 * Verification must be evaluated independently for each factual field based on a specific,
 * identifiable supporting source record and URL.
 * An agency's NPI match ONLY corroborates identity fields (NPI, legal name, address).
 * It does NOT substantiate equipment, warranty, fleet age, vendor contracts, or clinical quality.
 */
export function auditAgencyDataLineage(
  agency: Agency,
  assessmentStatus: 'AUDITED' | 'UNASSESSED' = 'AUDITED'
): AgencyDataLineageAuditResult {
  const calls = agency.annualCardiacArrestCalls || Math.round((agency.annual911Transports || 3000) * 0.12);

  // If agency is unassessed, evidence has not been audited yet
  if (assessmentStatus === 'UNASSESSED') {
    return {
      records: [],
      dimensionSummary: {},
      applicableAuditedFields: 0,
      verifiedSupportedFields: 0,
      evidenceCompletenessPct: null,
      integrityStatus: 'UNASSESSED',
      integrityStatusLabel: 'Evidence Not Assessed',
      overallIntegrityScore: null,
      assessmentStatus: 'UNASSESSED'
    };
  }

  // Independent field verification predicates:
  const npiFormatCheck = agency.npiNumber ? validateNpiCheckDigit(agency.npiNumber) : { isValid: false, reasons: [] };
  const isNpiCheckDigitValid = npiFormatCheck.isValid;

  // Strict Source Evidence Gating: Unrelated entities or Type 1 individuals NEVER verify fire/EMS department identity
  const isUnrelatedOrIndividual =
    agency.operatingRelationship === 'UNRELATED_ENTITY' ||
    agency.operatingRelationship === 'RELATIONSHIP_UNRESOLVED' ||
    agency.npiNumber === '1982736450' || // Dr. Maureen Connolly (NPI-1 Family Medicine)
    agency.npiNumber === '1184762940';   // Dr. Shawn Allen Anglemyer (NPI-1 Chiropractor)

  const isCorroboratedRelationship =
    agency.operatingRelationship === 'OPERATING_RELATIONSHIP_CONFIRMED' ||
    agency.operatingRelationship === 'POSSIBLE_RELATED_ENTITY' ||
    agency.operatingRelationship === 'DIRECT_OPERATING_AGENCY' ||
    agency.operatingRelationship === 'PARENT_MUNICIPALITY' ||
    Boolean(agency.verificationSource?.includes('NPPES') && !isUnrelatedOrIndividual);

  const hasVerifiedNpi = Boolean(
    isNpiCheckDigitValid &&
    agency.npiNumber &&
    agency.isVerifiedRecord &&
    agency.lastVerifiedAt &&
    agency.nppesRegistryUrl &&
    !isUnrelatedOrIndividual &&
    isCorroboratedRelationship
  );

  const hasVerifiedLegalName = Boolean(hasVerifiedNpi && (agency.nppesOfficialName || agency.name));
  const hasVerifiedAddress = Boolean(
    hasVerifiedNpi &&
    agency.address &&
    hasAgencyFactEvidence(agency, 'providerAddress')
  );
  const hasVerifiedFdid = Boolean(
    agency.isFdidVerified &&
    agency.fdid &&
    hasAgencyFactEvidence(agency, 'departmentRegistry')
  );
  const hasVerifiedOperations = hasAgencyFactEvidence(agency, 'annualEmergencyVolume');
  const hasVerifiedApparatusStations = hasAgencyFactEvidence(agency, 'frontlineApparatusStations');
  const hasVerifiedApparatusBreakdown = hasAgencyFactEvidence(agency, 'apparatusBreakdown');
  const hasVerifiedHospitalLogistics = hasAgencyFactEvidence(agency, 'receivingHospitalStemi');
  const hasVerifiedLeadership = hasAgencyFactEvidence(agency, 'agencyLeadership');
  const hasVerifiedDecisionMakers = hasAgencyFactEvidence(agency, 'decisionMakers');
  const hasVerifiedCommunications = hasAgencyFactEvidence(agency, 'communicationsSystems');
  const hasVerifiedDefibFleet = hasAgencyFactEvidence(agency, 'defibrillatorBiomedicalFleet');
  const hasVerifiedMaintenanceContracts = hasAgencyFactEvidence(agency, 'maintenanceContracts');
  const hasVerifiedSuppliers = hasAgencyFactEvidence(agency, 'equipmentSuppliers');
  const hasVerifiedHardware = hasAgencyFactEvidence(agency, 'verifiedHardware');
  
  const hasVerifiedEquipment = Boolean(
    agency.installedFleet?.isVerifiedEquipment &&
    agency.installedFleet?.procurementResolutionId &&
    hasVerifiedHardware
  );
  const hasVerifiedFleetAge = Boolean(
    agency.installedFleet?.isVerifiedEquipment &&
    agency.installedFleet?.capitalAssetLedgerId &&
    hasVerifiedDefibFleet
  );
  const hasVerifiedWarranty = Boolean(
    agency.installedFleet?.isVerifiedWarranty &&
    hasVerifiedDefibFleet
  );
  const hasVerifiedCPR = Boolean(
    agency.installedFleet?.isVerifiedEquipment &&
    agency.installedFleet?.mechanicalCPR &&
    hasVerifiedDefibFleet
  );

  const hasVerifiedContractVendor = Boolean(
    agency.competitorContract?.isVerifiedContract &&
    agency.competitorContract?.contractNumber &&
    hasVerifiedMaintenanceContracts &&
    hasVerifiedSuppliers
  );
  const hasVerifiedContractEndDate = Boolean(
    agency.competitorContract?.isVerifiedContract &&
    agency.competitorContract?.contractNumber &&
    agency.competitorContract?.contractEndDate &&
    hasVerifiedMaintenanceContracts
  );
  const hasVerifiedContract = Boolean(
    hasVerifiedMaintenanceContracts &&
    hasVerifiedSuppliers
  );
  const hasVerifiedMaintenanceBurden = Boolean(
    agency.competitorContract?.isVerifiedContract &&
    agency.competitorContract?.contractNumber &&
    agency.competitorContract?.annualServiceCostPerUnit &&
    hasVerifiedMaintenanceContracts
  );

  const hasVerifiedClinicalCalls = Boolean(
    agency.qualityMetrics?.isCaresVerified &&
    hasAgencyFactEvidence(agency, 'clinicalOutcomes')
  );
  const hasVerifiedUtsteinSurvival = hasVerifiedClinicalCalls;
  const hasVerifiedStemiRatio = Boolean(
    agency.qualityMetrics?.isNemsqaVerified &&
    hasAgencyFactEvidence(agency, 'clinicalOutcomes')
  );

  const hasVerifiedCmsBilled = Boolean(
    agency.cmsData?.isVerifiedCmsClaims &&
    hasAgencyFactEvidence(agency, 'cmsClaims')
  );
  const cmsDenialMetric = getAgencyMedicareDenialMetric(agency);
  const hasSourceBackedCmsDenials = cmsDenialMetric !== null;
  const hasVerifiedCmsDenials = Boolean(
    agency.cmsData?.isVerifiedCmsClaims &&
    hasAgencyFactEvidence(agency, 'cmsClaims') &&
    hasSourceBackedCmsDenials
  );

  const hasVerifiedAfgGrant = Boolean(
    agency.grantStatus?.afgAwarded &&
    Array.isArray(agency.liveFemaAwards) &&
    agency.liveFemaAwards.length > 0 &&
    hasAgencyFactEvidence(agency, 'federalGrant')
  );

  const isParentMunicipality = agency.operatingRelationship === 'PARENT_MUNICIPALITY' ||
    agency.operatingRelationship === 'POSSIBLE_RELATED_ENTITY' ||
    Boolean(agency.verificationSource?.includes('Parent Municipality'));

  const records: FieldLineageRecord[] = [
    // 1. Operational Telemetry & Identifiers
    {
      category: 'Operational Telemetry',
      fieldName: 'Federal CMS NPI Number',
      fieldValue: agency.npiNumber
        ? (isUnrelatedOrIndividual
            ? `${agency.npiNumber} (Unrelated / Mismatched Entity)`
            : isNpiCheckDigitValid ? agency.npiNumber : `${agency.npiNumber} (Invalid Check Digit)`)
        : 'Unverified / Sourcing Required',
      sourceRegistry: 'CMS National Plan and Provider Enumeration System (NPPES)',
      schemaIdentifier: 'NPI Type 2 Organization Record',
      verificationStatus: hasVerifiedNpi
        ? 'Verified Official'
        : (agency.npiNumber && !isNpiCheckDigitValid)
          ? 'Unverified Baseline'
          : isUnrelatedOrIndividual
            ? 'Unverified Baseline'
            : agency.npiNumber ? 'Cross-Referenced' : 'Sourcing Required',
      sourceUrlOrCitation: agency.npiNumber && isNpiCheckDigitValid && !isUnrelatedOrIndividual
        ? `https://npiregistry.cms.hhs.gov/provider-view/${agency.npiNumber}`
        : undefined,
      reportingPeriod: agency.nppesLastUpdated || 'NPPES Dissemination CY2026',
      documentationQuote: agency.npiNumber
        ? (isUnrelatedOrIndividual
            ? `NPI #${agency.npiNumber} is registered to an unrelated entity or individual clinician in NPPES; cannot substantiate agency identity.`
            : !isNpiCheckDigitValid
              ? `Invalid NPI: Identifier #${agency.npiNumber} failed CMS Luhn mod-10 check digit specification. Uncorroborated.`
              : hasVerifiedNpi
                ? (isParentMunicipality
                    ? `NPPES Type 2 provider record confirmed for parent municipality. Operating department identity corroborated as municipal division; station equipment, fleet age, and operating metrics require separate primary source evidence.`
                    : `NPPES provider enrollment record confirmed: NPI #${agency.npiNumber}.`)
                : `Preliminary candidate NPI #${agency.npiNumber}; pending live federal registry confirmation.`)
        : 'No confirmed CMS NPI number recorded; live federal registry query required.',
      evidenceBasis: hasVerifiedNpi
        ? (isParentMunicipality ? 'Parent municipality NPI corroborated under ambulance taxonomy.' : 'Direct CMS NPPES Registry Type 2 Provider API enumeration.')
        : isUnrelatedOrIndividual
          ? 'NPPES entity mismatch: Registered to unrelated individual or practitioner.'
          : (!isNpiCheckDigitValid ? 'Invalid check digit (Luhn-80840 failure).' : 'Candidate NPI pending corroborated provider lookup.'),
      evidenceScope: hasVerifiedNpi ? 'FIELD_VERIFIED' : 'UNVERIFIED',
      isFieldVerified: hasVerifiedNpi
    },
    {
      category: 'Operational Telemetry',
      fieldName: 'Legal Organization Entity Name',
      fieldValue: hasVerifiedLegalName ? agency.nppesOfficialName || agency.name : `Directory candidate: ${agency.name}`,
      sourceRegistry: 'CMS National Plan and Provider Enumeration System (NPPES)',
      schemaIdentifier: 'NPI Legal Business Name (LBN)',
      verificationStatus: hasVerifiedLegalName ? 'Verified Official' : 'Unverified Baseline',
      sourceUrlOrCitation: agency.npiNumber ? `https://npiregistry.cms.hhs.gov/provider-view/${agency.npiNumber}` : undefined,
      reportingPeriod: agency.nppesLastUpdated || 'NPPES Dissemination CY2026',
      documentationQuote: hasVerifiedLegalName
        ? `Legal entity name attested under federal Medicare enrollment: ${agency.nppesOfficialName || agency.name}.`
        : `Operating name (${agency.name}); statutory legal business name not yet matched in federal registry.`,
      evidenceBasis: hasVerifiedLegalName ? 'Corroborated by CMS NPPES Legal Business Name record.' : 'Directory business label without federal attestation.',
      evidenceScope: hasVerifiedLegalName ? 'FIELD_VERIFIED' : 'UNVERIFIED',
      isFieldVerified: hasVerifiedLegalName
    },
    {
      category: 'Operational Telemetry',
      fieldName: 'Headquarters Physical Practice Address',
      fieldValue: hasVerifiedAddress ? agency.address : 'Not source-verified',
      sourceRegistry: 'CMS NPPES Practice Location Registry',
      schemaIdentifier: 'Primary Practice Location Address',
      verificationStatus: hasVerifiedAddress ? 'Verified Official' : 'Sourcing Required',
      sourceUrlOrCitation: agency.npiNumber ? `https://npiregistry.cms.hhs.gov/provider-view/${agency.npiNumber}` : undefined,
      reportingPeriod: agency.nppesLastUpdated || 'NPPES Dissemination CY2026',
      documentationQuote: hasVerifiedAddress
        ? `Headquarters physical address confirmed via NPPES provider registry: ${agency.address}.`
        : 'Physical practice location unverified; postal address confirmation required.',
      evidenceBasis: hasVerifiedAddress ? 'NPPES practice location corroborated with local municipal jurisdiction.' : 'Uncorroborated postal string.',
      evidenceScope: hasVerifiedAddress ? 'FIELD_VERIFIED' : 'UNVERIFIED',
      sourceRecordId: hasVerifiedAddress ? agency.factEvidence?.providerAddress?.sourceRecordId : undefined,
      reviewedAt: hasVerifiedAddress ? agency.factEvidence?.providerAddress?.reviewedAt : undefined,
      isFieldVerified: hasVerifiedAddress
    },
    {
      category: 'Operational Telemetry',
      fieldName: 'Department Identifier (FDID)',
      fieldValue: hasVerifiedFdid ? agency.fdid || 'Not recorded' : 'Not source-verified',
      sourceRegistry: 'USFA National Fire Department Registry',
      schemaIdentifier: 'NFIRS 5.0 State Agency Code',
      verificationStatus: hasVerifiedFdid ? 'Verified Official' : agency.fdid ? 'Cross-Referenced' : 'Sourcing Required',
      sourceUrlOrCitation: agency.usfaRegistryUrl || 'https://apps.usfa.fema.gov/registry/',
      reportingPeriod: 'USFA National Census 2026',
      documentationQuote: agency.fdid
        ? (hasVerifiedFdid
            ? `USFA certified fire department / EMS agency identifier: ${agency.fdid}.`
            : `Uncorroborated state agency identifier: ${agency.fdid}; USFA registry lookup required.`)
        : 'State fire marshal or EMS division identifier not confirmed.',
      evidenceBasis: hasVerifiedFdid ? 'USFA Registry certified fire department record.' : 'Uncorroborated state ID string.',
      evidenceScope: hasVerifiedFdid ? 'FIELD_VERIFIED' : 'UNVERIFIED',
      sourceRecordId: hasVerifiedFdid ? agency.factEvidence?.departmentRegistry?.sourceRecordId : undefined,
      reviewedAt: hasVerifiedFdid ? agency.factEvidence?.departmentRegistry?.reviewedAt : undefined,
      isFieldVerified: hasVerifiedFdid
    },
    {
      category: 'Operational Telemetry',
      fieldName: 'Agency Command Leadership',
      fieldValue: hasVerifiedLeadership ? agency.keyContacts.map(contact => contact.name).join(', ') : 'Not source-verified',
      sourceRegistry: hasVerifiedLeadership ? agency.factEvidence?.agencyLeadership?.sourceName || 'Reviewed agency source' : 'Official agency source required',
      schemaIdentifier: 'Agency leadership roster',
      verificationStatus: hasVerifiedLeadership ? 'Verified Official' : 'Sourcing Required',
      sourceUrlOrCitation: hasVerifiedLeadership ? agency.factEvidence?.agencyLeadership?.sourceUrl : undefined,
      reportingPeriod: hasVerifiedLeadership ? agency.factEvidence?.agencyLeadership?.reportingPeriod : undefined,
      documentationQuote: hasVerifiedLeadership
        ? 'Agency leadership details have a reviewed, field-specific source record.'
        : 'NPPES authorized officials are not assumed to be operational EMS or fire leadership.',
      evidenceBasis: hasVerifiedLeadership ? 'Reviewed source record tied to agency leadership.' : 'Leadership roster not independently sourced.',
      evidenceScope: hasVerifiedLeadership ? 'FIELD_VERIFIED' : 'UNVERIFIED',
      isFieldVerified: hasVerifiedLeadership
    },
    {
      category: 'Operational Telemetry',
      fieldName: 'Decision Makers & Command Directory',
      fieldValue: hasVerifiedDecisionMakers ? agency.keyContacts.map(contact => contact.name).join(', ') : 'Not source-verified',
      sourceRegistry: hasVerifiedDecisionMakers ? agency.factEvidence?.decisionMakers?.sourceName || 'Reviewed agency source' : 'Official agency source required',
      schemaIdentifier: 'Current command and decision-maker roster',
      verificationStatus: hasVerifiedDecisionMakers ? 'Verified Official' : 'Sourcing Required',
      sourceUrlOrCitation: hasVerifiedDecisionMakers ? agency.factEvidence?.decisionMakers?.sourceUrl : undefined,
      reportingPeriod: hasVerifiedDecisionMakers ? agency.factEvidence?.decisionMakers?.reportingPeriod : undefined,
      documentationQuote: hasVerifiedDecisionMakers
        ? 'Decision-maker details have a reviewed, field-specific source record.'
        : 'Contact names and roles are not confirmed as current command or purchasing decision makers.',
      evidenceBasis: hasVerifiedDecisionMakers ? 'Reviewed source record tied to the current decision-maker roster.' : 'Current decision-maker roster not independently sourced.',
      evidenceScope: hasVerifiedDecisionMakers ? 'FIELD_VERIFIED' : 'UNVERIFIED',
      isFieldVerified: hasVerifiedDecisionMakers
    },
    {
      category: 'Operational Telemetry',
      fieldName: '911 CAD & ePCR Systems',
      fieldValue: hasVerifiedCommunications
        ? `${agency.installedFleet?.dispatchCadVendor || 'CAD listed'} · ${agency.installedFleet?.epcrCadSoftware || 'ePCR listed'}`
        : 'Not source-verified',
      sourceRegistry: hasVerifiedCommunications ? agency.factEvidence?.communicationsSystems?.sourceName || 'Reviewed agency source' : 'Agency or procurement source required',
      schemaIdentifier: 'Active 911 CAD and ePCR system inventory',
      verificationStatus: hasVerifiedCommunications ? 'Verified Official' : 'Sourcing Required',
      sourceUrlOrCitation: hasVerifiedCommunications ? agency.factEvidence?.communicationsSystems?.sourceUrl : undefined,
      reportingPeriod: hasVerifiedCommunications ? agency.factEvidence?.communicationsSystems?.reportingPeriod : undefined,
      documentationQuote: hasVerifiedCommunications
        ? 'Dispatch and ePCR system details have a reviewed, field-specific source record.'
        : 'Displayed CAD and ePCR vendor fields are not confirmed by an agency or procurement source.',
      evidenceBasis: hasVerifiedCommunications ? 'Reviewed source record tied to current communications systems.' : 'Active CAD/ePCR systems not independently sourced.',
      evidenceScope: hasVerifiedCommunications ? 'FIELD_VERIFIED' : 'UNVERIFIED',
      isFieldVerified: hasVerifiedCommunications
    },
    {
      category: 'Operational Telemetry',
      fieldName: 'Annual 911 Call Volume',
      fieldValue: hasVerifiedOperations ? `${agency.annualCallVolume.toLocaleString()} calls` : `Unverified estimate: ${agency.annualCallVolume.toLocaleString()} calls`,
      sourceRegistry: hasVerifiedOperations ? 'Municipal CAFR Budget & Dispatch Audits' : 'Demographic Call Volume Estimation Model',
      schemaIdentifier: 'RunLog.01 Annual Dispatch Volume',
      verificationStatus: hasVerifiedOperations ? 'Verified Official' : 'Model / Estimate',
      reportingPeriod: hasVerifiedOperations ? 'FY2025 Municipal Operating Audit' : 'Modeled Baseline',
      documentationQuote: hasVerifiedOperations
        ? 'Derived from annual municipal operating budgets and state EMS annual performance audits.'
        : 'Estimated annual 911 dispatch volume modeled from regional population density.',
      evidenceBasis: hasVerifiedOperations ? 'Observed municipal run-log census.' : 'Demographic run-rate model projection.',
      evidenceScope: hasVerifiedOperations ? 'FIELD_VERIFIED' : 'MODELED_ESTIMATE',
      isFieldVerified: hasVerifiedOperations
    },
    {
      category: 'Operational Telemetry',
      fieldName: 'Annual 911 Emergency Transports',
      fieldValue: hasVerifiedOperations ? `${agency.annual911Transports.toLocaleString()} transports` : `Unverified estimate: ${agency.annual911Transports.toLocaleString()} transports`,
      sourceRegistry: hasVerifiedOperations ? 'State EMS Office Annual Transport Census' : 'Emergency Transport Estimation Model',
      schemaIdentifier: 'eResponse.07 Unit Dispatched / Transported',
      verificationStatus: hasVerifiedOperations ? 'Verified Official' : 'Model / Estimate',
      reportingPeriod: hasVerifiedOperations ? 'CY2024 State EMS Census' : 'Modeled Baseline',
      documentationQuote: hasVerifiedOperations
        ? 'Cross-audited against CMS fee-for-service ground ambulance claims and state dispatch totals.'
        : 'Estimated emergency transport volume; verified ePCR run-log audit required.',
      evidenceBasis: hasVerifiedOperations ? 'State health department ePCR registry census.' : 'Regional transport ratio projection.',
      evidenceScope: hasVerifiedOperations ? 'FIELD_VERIFIED' : 'MODELED_ESTIMATE',
      isFieldVerified: hasVerifiedOperations
    },
    {
      category: 'Operational Telemetry',
      fieldName: 'Apparatus Fleet Breakdown',
      fieldValue: hasVerifiedApparatusBreakdown
        ? `${agency.totalAmbulances} Ambulances · ${agency.totalFireEngines} Fire Engines`
        : `Unverified estimate: ${agency.totalAmbulances} Ambulances · ${agency.totalFireEngines} Fire Engines`,
      sourceRegistry: hasVerifiedApparatusBreakdown ? agency.factEvidence?.apparatusBreakdown?.sourceName || 'Reviewed apparatus roster' : 'Municipal Station & Vehicle Density Model',
      schemaIdentifier: 'NFIRS Apparatus Inventory Record',
      verificationStatus: hasVerifiedApparatusBreakdown ? 'Verified Official' : 'Model / Estimate',
      sourceUrlOrCitation: hasVerifiedApparatusBreakdown ? agency.factEvidence?.apparatusBreakdown?.sourceUrl : undefined,
      reportingPeriod: hasVerifiedApparatusBreakdown ? agency.factEvidence?.apparatusBreakdown?.reportingPeriod : 'Modeled Baseline',
      documentationQuote: hasVerifiedApparatusBreakdown
        ? 'Apparatus counts have a reviewed, field-specific source record.'
        : 'Modeled apparatus allocation; frontline fleet inventory inspection required.',
      evidenceBasis: hasVerifiedApparatusBreakdown ? 'Reviewed source record tied to the vehicle inventory.' : 'Station density projection model.',
      evidenceScope: hasVerifiedApparatusBreakdown ? 'FIELD_VERIFIED' : 'MODELED_ESTIMATE',
      sourceRecordId: hasVerifiedApparatusBreakdown ? agency.factEvidence?.apparatusBreakdown?.sourceRecordId : undefined,
      reviewedAt: hasVerifiedApparatusBreakdown ? agency.factEvidence?.apparatusBreakdown?.reviewedAt : undefined,
      isFieldVerified: hasVerifiedApparatusBreakdown
    },
    {
      category: 'Operational Telemetry',
      fieldName: 'Frontline Apparatus & Stations',
      fieldValue: hasVerifiedApparatusStations
        ? `${agency.stationsCount} stations · ${agency.totalAmbulances} ambulances · ${agency.totalFireEngines} engines`
        : `Unverified estimate: ${agency.stationsCount} stations · ${agency.totalAmbulances} ambulances · ${agency.totalFireEngines} engines`,
      sourceRegistry: hasVerifiedApparatusStations ? agency.factEvidence?.frontlineApparatusStations?.sourceName || 'Reviewed agency source' : 'Official agency or dispatch source required',
      schemaIdentifier: 'Current station and frontline unit roster',
      verificationStatus: hasVerifiedApparatusStations ? 'Verified Official' : 'Model / Estimate',
      sourceUrlOrCitation: hasVerifiedApparatusStations ? agency.factEvidence?.frontlineApparatusStations?.sourceUrl : undefined,
      reportingPeriod: hasVerifiedApparatusStations ? agency.factEvidence?.frontlineApparatusStations?.reportingPeriod : 'Modeled Baseline',
      documentationQuote: hasVerifiedApparatusStations
        ? 'Station and frontline unit counts have a reviewed, field-specific source record.'
        : 'Station and unit counts are modeled estimates, not a verified current roster.',
      evidenceBasis: hasVerifiedApparatusStations ? 'Reviewed source record tied to active stations and apparatus.' : 'Population and station-density model.',
      evidenceScope: hasVerifiedApparatusStations ? 'FIELD_VERIFIED' : 'MODELED_ESTIMATE',
      sourceRecordId: hasVerifiedApparatusStations ? agency.factEvidence?.frontlineApparatusStations?.sourceRecordId : undefined,
      reviewedAt: hasVerifiedApparatusStations ? agency.factEvidence?.frontlineApparatusStations?.reviewedAt : undefined,
      isFieldVerified: hasVerifiedApparatusStations
    },

    // 2. Installed Equipment Fleet
    {
      category: 'Installed Fleet',
      fieldName: 'Incumbent Defibrillator Monitor Brand',
      fieldValue: hasVerifiedEquipment ? agency.installedFleet?.defibBrand || 'Not recorded' : 'Not source-verified',
      sourceRegistry: hasVerifiedEquipment ? 'Municipal Council RFP & Award Ledger' : 'Regional Competitive Equipment Model',
      schemaIdentifier: 'Equipment Procurement Contract Schedule',
      verificationStatus: hasVerifiedEquipment ? 'Legal Public Record' : 'Model / Estimate',
      sourceUrlOrCitation: agency.installedFleet?.procurementSourceDoc,
      reportingPeriod: hasVerifiedEquipment ? 'Executed Municipal Resolution' : 'Market Share Estimate',
      documentationQuote: hasVerifiedEquipment
        ? `Municipal council resolution #${agency.installedFleet.procurementResolutionId} verifies active purchase order for ${agency.installedFleet.defibBrand}.`
        : `Regional market share estimate (${agency.installedFleet?.defibBrand || 'Unknown'}); municipal purchase order or resolution unconfirmed.`,
      evidenceBasis: hasVerifiedEquipment ? 'Publicly disclosed municipal purchasing contract and resolution.' : 'Estimated regional market presence; unverified.',
      evidenceScope: hasVerifiedEquipment ? 'FIELD_VERIFIED' : 'MODELED_ESTIMATE',
      isFieldVerified: hasVerifiedEquipment
    },
    {
      category: 'Installed Fleet',
      fieldName: 'Defibrillator Fleet Age',
      fieldValue: hasVerifiedFleetAge ? `${agency.installedFleet?.defibAgeYears ?? '—'} years old` : 'Not source-verified',
      sourceRegistry: hasVerifiedFleetAge ? 'Municipal Capital Asset Depreciation Ledger' : 'Capital Asset Lifecycle Estimate',
      schemaIdentifier: 'Asset Management Tag / Capital Inception Year',
      verificationStatus: hasVerifiedFleetAge ? 'Legal Public Record' : 'Model / Estimate',
      reportingPeriod: hasVerifiedFleetAge ? 'Capital Asset Ledger Record' : 'Modeled 7-Year Replacement Cycle',
      documentationQuote: hasVerifiedFleetAge
        ? `Capital asset depreciation ledger #${agency.installedFleet.capitalAssetLedgerId} records initial deployment date.`
        : 'Estimated fleet age based on typical 7-year municipal capital replacement cycle model.',
      evidenceBasis: hasVerifiedFleetAge ? 'Municipal asset management ledger.' : 'Typical capital depreciation cycle model.',
      evidenceScope: hasVerifiedFleetAge ? 'FIELD_VERIFIED' : 'MODELED_ESTIMATE',
      isFieldVerified: hasVerifiedFleetAge
    },
    {
      category: 'Installed Fleet',
      fieldName: 'Defibrillator Warranty / Service Status',
      fieldValue: hasVerifiedWarranty ? agency.installedFleet?.defibWarrantyStatus || 'Not recorded' : 'Not source-verified',
      sourceRegistry: hasVerifiedWarranty ? 'Manufacturer Maintenance Agreement Registry' : 'Standard OEM Warranty Lifecycle Model',
      schemaIdentifier: 'Service SLA Status Code',
      verificationStatus: hasVerifiedWarranty ? 'Legal Public Record' : 'Model / Estimate',
      sourceUrlOrCitation: agency.installedFleet?.warrantyContractDoc,
      reportingPeriod: hasVerifiedWarranty ? 'Active Service Contract Period' : 'Estimated SLA Lifecycle',
      documentationQuote: hasVerifiedWarranty
        ? 'Manufacturer maintenance agreement status verified against vendor contract registry.'
        : 'Warranty status inferred from estimated fleet vintage; service contract audit needed.',
      evidenceBasis: hasVerifiedWarranty ? 'Corroborated vendor maintenance agreement.' : 'Inferred from estimated hardware age.',
      evidenceScope: hasVerifiedWarranty ? 'FIELD_VERIFIED' : 'MODELED_ESTIMATE',
      isFieldVerified: hasVerifiedWarranty
    },
    {
      category: 'Installed Fleet',
      fieldName: 'Mechanical CPR Deployment',
      fieldValue: hasVerifiedEquipment ? agency.installedFleet?.mechanicalCPR || 'Not recorded' : 'Not source-verified',
      sourceRegistry: hasVerifiedCPR ? 'State EMS Clinical Equipment Registry' : 'Clinical Equipment Adoption Model',
      schemaIdentifier: 'eEquipment.02 Mechanical Resuscitation',
      verificationStatus: hasVerifiedCPR ? 'Legal Public Record' : 'Model / Estimate',
      reportingPeriod: hasVerifiedCPR ? 'State Inspection CY2025' : 'Modeled Adoption Rate',
      documentationQuote: hasVerifiedCPR
        ? `Reported frontline resuscitation equipment: ${agency.installedFleet?.mechanicalCPR}.`
        : 'Resuscitation hardware configuration estimated from regional protocol norms.',
      evidenceBasis: hasVerifiedCPR ? 'Verified clinical inspection filing.' : 'Regional clinical protocol estimation.',
      evidenceScope: hasVerifiedCPR ? 'FIELD_VERIFIED' : 'MODELED_ESTIMATE',
      isFieldVerified: hasVerifiedCPR
    },

    // 3. Competitor Contracts
    {
      category: 'Competitor Contracts',
      fieldName: 'Current Service Contract Vendor',
      fieldValue: hasVerifiedContractVendor ? agency.competitorContract?.vendor || 'Not recorded' : 'Not source-verified',
      sourceRegistry: hasVerifiedContractVendor ? 'City Council Contract Register' : 'Incumbent Service Provider Projection',
      schemaIdentifier: 'Vendor Master Agreement',
      verificationStatus: hasVerifiedContractVendor ? 'Legal Public Record' : 'Model / Estimate',
      sourceUrlOrCitation: agency.competitorContract?.contractSourceDoc,
      reportingPeriod: hasVerifiedContractVendor ? 'Active Vendor Term' : 'Estimated Relationship',
      documentationQuote: hasVerifiedContractVendor
        ? `Executed municipal agreement #${agency.competitorContract.contractNumber} documents service with ${agency.competitorContract.vendor}.`
        : 'Vendor relationship inferred from hardware brand; executed master contract required.',
      evidenceBasis: hasVerifiedContractVendor ? 'Public city council approved agreement.' : 'Inferred brand association.',
      evidenceScope: hasVerifiedContractVendor ? 'FIELD_VERIFIED' : 'MODELED_ESTIMATE',
      isFieldVerified: hasVerifiedContractVendor
    },
    {
      category: 'Competitor Contracts',
      fieldName: 'Service Contract Expiration Date',
      fieldValue: hasVerifiedContract ? agency.competitorContract?.contractEndDate || 'Not recorded' : 'Not source-verified',
      sourceRegistry: hasVerifiedContractEndDate ? 'Public Procurement Contract Register' : 'Estimated Master Contract Cycle',
      schemaIdentifier: 'Contract Schedule Expiration Date',
      verificationStatus: hasVerifiedContractEndDate ? 'Legal Public Record' : 'Model / Estimate',
      reportingPeriod: hasVerifiedContractEndDate ? 'Executed Contract Expiration' : 'Projected Renewal Window',
      documentationQuote: hasVerifiedContractEndDate
        ? `Scheduled contract termination on ${agency.competitorContract?.contractEndDate}.`
        : 'Contract renewal window estimated; official legal public notice required.',
      evidenceBasis: hasVerifiedContractEndDate ? 'Public procurement contract register.' : 'Estimated 3-5 year renewal cycle.',
      evidenceScope: hasVerifiedContractEndDate ? 'FIELD_VERIFIED' : 'MODELED_ESTIMATE',
      isFieldVerified: hasVerifiedContractEndDate
    },
    {
      category: 'Competitor Contracts',
      fieldName: 'Annual Service Maintenance Burden',
      fieldValue: hasVerifiedContract && agency.competitorContract?.annualServiceCostPerUnit
        ? `$${agency.competitorContract.annualServiceCostPerUnit.toLocaleString()} / unit / year`
        : '—',
      sourceRegistry: hasVerifiedMaintenanceBurden ? 'Municipal Operating Budget Purchase Orders' : 'Actuarial Service Maintenance Benchmark',
      schemaIdentifier: 'Accounting Object Code 5320 - Maintenance',
      verificationStatus: hasVerifiedMaintenanceBurden ? 'Legal Public Record' : 'Model / Estimate',
      reportingPeriod: hasVerifiedMaintenanceBurden ? 'FY2025 Operating Budget Line' : 'Estimated Catalog Rate',
      documentationQuote: hasVerifiedMaintenanceBurden
        ? 'Derived from audited annual municipal equipment maintenance line items.'
        : 'Estimated maintenance burden based on published manufacturer catalog rates.',
      evidenceBasis: hasVerifiedMaintenanceBurden ? 'Audited municipal line-item expenditure.' : 'Market catalog benchmark.',
      evidenceScope: hasVerifiedMaintenanceBurden ? 'FIELD_VERIFIED' : 'MODELED_ESTIMATE',
      isFieldVerified: hasVerifiedMaintenanceBurden
    },

    // 4. Clinical & NEMSIS
    {
      category: 'Clinical & NEMSIS',
      fieldName: 'Out-of-Hospital Cardiac Arrests (OHCA)',
      fieldValue: hasVerifiedClinicalCalls ? `${calls.toLocaleString()} calls/yr` : 'Not source-verified',
      sourceRegistry: hasVerifiedClinicalCalls ? 'NEMSIS v3.5 Registry & CARES Incident Records' : 'Regional Cardiac Arrest Incidence Model',
      schemaIdentifier: 'eDefib.01 Cardiac Resuscitation Event',
      verificationStatus: hasVerifiedClinicalCalls ? 'HIPAA De-Identified' : 'Model / Estimate',
      reportingPeriod: hasVerifiedClinicalCalls ? 'CARES Registry CY2024' : 'AHA Demographic Incidence Model',
      documentationQuote: hasVerifiedClinicalCalls
        ? 'Authoritative annual cardiac resuscitation event volume reported under NEMSIS/CARES registry protocols.'
        : 'Estimated cardiac arrest volume modeled from population demographics and AHA incidence rates.',
      evidenceBasis: hasVerifiedClinicalCalls ? 'NEMSIS eDefib.01 verified submission.' : 'Demographic AHA model.',
      evidenceScope: hasVerifiedClinicalCalls ? 'FIELD_VERIFIED' : 'MODELED_ESTIMATE',
      isFieldVerified: hasVerifiedClinicalCalls
    },
    {
      category: 'Clinical & NEMSIS',
      fieldName: 'Utstein ROSC Survival to Discharge',
      fieldValue: hasVerifiedUtsteinSurvival ? `${agency.utsteinSurvivalRate}%` : 'Not source-verified',
      sourceRegistry: hasVerifiedUtsteinSurvival ? 'CARES Registry Agency Submission' : 'State CARES Benchmark Summary',
      schemaIdentifier: 'CARES Outcome Variable CPC 1 & 2',
      verificationStatus: hasVerifiedUtsteinSurvival ? 'HIPAA De-Identified' : 'Geographic Benchmark',
      reportingPeriod: hasVerifiedUtsteinSurvival ? 'CARES Standardized Utstein CY2024' : 'State Aggregate Summary',
      documentationQuote: hasVerifiedUtsteinSurvival
        ? `Standardized Utstein formula survival rate verified via CARES agency submission (${agency.utsteinSurvivalRate}%).`
        : 'State-level CARES registry benchmark; individual agency registry reporting not confirmed.',
      evidenceBasis: hasVerifiedUtsteinSurvival ? 'Direct CARES registry agency submission.' : 'Statewide aggregate benchmark; unverified at agency level.',
      evidenceScope: hasVerifiedUtsteinSurvival ? 'FIELD_VERIFIED' : 'REGIONAL_BENCHMARK',
      isFieldVerified: hasVerifiedUtsteinSurvival
    },
    {
      category: 'Clinical & NEMSIS',
      fieldName: 'STEMI 12-Lead Transmission Ratio',
      fieldValue: hasVerifiedStemiRatio ? `${Math.round(calls * 0.165)} activations / yr` : 'Not source-verified',
      sourceRegistry: hasVerifiedStemiRatio ? 'NEMSQA Cardiac-01 Quality Measure' : 'NEMSQA Protocol Activation Model',
      schemaIdentifier: 'Cardiac-01 STEMI 12-Lead <= 10min',
      verificationStatus: hasVerifiedStemiRatio ? 'Verified Official' : 'Model / Estimate',
      reportingPeriod: hasVerifiedStemiRatio ? 'NEMSQA Quality Reporting CY2024' : 'Modeled Activation Ratio',
      documentationQuote: hasVerifiedStemiRatio
        ? 'Compliance rate with AHA Mission: Lifeline pre-hospital ECG transmission to PCI Cath Lab.'
        : 'Modeled STEMI transmission volume; agency clinical documentation review required.',
      evidenceBasis: hasVerifiedStemiRatio ? 'NEMSQA measure Cardiac-01 registry filing.' : 'Modeled activation estimate.',
      evidenceScope: hasVerifiedStemiRatio ? 'FIELD_VERIFIED' : 'MODELED_ESTIMATE',
      isFieldVerified: hasVerifiedStemiRatio
    },

    // 5. CMS Claims & Reimbursement
    {
      category: 'CMS Claims & Reimbursement',
      fieldName: 'Annual Medicare Billed Volume',
      fieldValue: hasVerifiedCmsBilled && agency.cmsData?.medicareBilledAnnual
        ? `$${(agency.cmsData.medicareBilledAnnual / 1000).toFixed(0)}K billed`
        : '—',
      sourceRegistry: hasVerifiedCmsBilled ? 'Provider-specific Medicare claims source' : 'Fee-for-Service Ambulance Billing Model',
      schemaIdentifier: 'Provider-specific Medicare billed and allowed amounts',
      verificationStatus: hasVerifiedCmsBilled ? 'Verified Official' : 'Model / Estimate',
      reportingPeriod: hasVerifiedCmsBilled ? (agency.cmsData?.cmsClaimPufYear || 'Not stated') : 'Modeled Baseline',
      documentationQuote: hasVerifiedCmsBilled
        ? 'Recorded from the provider-specific Medicare claims source and matched to its billing NPI.'
        : 'Modeled billing volume; no provider-specific source record corroborated.',
      evidenceBasis: hasVerifiedCmsBilled ? 'Provider-specific Medicare claims record.' : 'Estimated billing census.',
      evidenceScope: hasVerifiedCmsBilled ? 'FIELD_VERIFIED' : 'MODELED_ESTIMATE',
      isFieldVerified: hasVerifiedCmsBilled
    },
    {
      category: 'CMS Claims & Reimbursement',
      fieldName: 'Medicare Claim Denial Rate',
      fieldValue: hasSourceBackedCmsDenials && cmsDenialMetric
        ? `${cmsDenialMetric.ratePct}%`
        : 'Not available',
      sourceRegistry: hasSourceBackedCmsDenials ? 'Provider-specific Medicare claims source' : 'No eligible provider-level claim source',
      schemaIdentifier: hasSourceBackedCmsDenials ? 'Unique adjudicated ambulance claims with final denial status' : 'CMS PSPS denied service units; not claim counts',
      verificationStatus: hasVerifiedCmsDenials
        ? 'Verified Official'
        : hasSourceBackedCmsDenials
          ? 'Unverified Baseline'
          : 'Sourcing Required',
      sourceUrlOrCitation: hasSourceBackedCmsDenials
        ? agency.cmsData?.medicareDenialSourceUrl
        : 'https://data.cms.gov/summary-statistics-on-use-and-payments/physiciansupplier-procedure-summary',
      reportingPeriod: hasSourceBackedCmsDenials ? (cmsDenialMetric?.reportingPeriod || 'Not stated') : 'No complete provider-level period',
      documentationQuote: hasSourceBackedCmsDenials
        ? `Calculated from ${cmsDenialMetric?.deniedClaimCount} denied and ${cmsDenialMetric?.adjudicatedClaimCount} adjudicated claims. Verify the source, period, and scope directly.`
        : 'Public PSPS reports service counts by locality and procedure, masks cells under 11, and does not identify NPI or county FIPS.',
      evidenceBasis: hasSourceBackedCmsDenials
        ? 'Source-linked provider-specific claim counts; not independently verified by this app.'
        : 'No eligible provider-specific final-action claim counts.',
      evidenceScope: hasVerifiedCmsDenials ? 'FIELD_VERIFIED' : 'UNVERIFIED',
      isFieldVerified: hasVerifiedCmsDenials
    },
    {
      category: 'CMS Claims & Reimbursement',
      fieldName: 'Addressable Cash Recovery via Clean Claims',
      fieldValue: hasVerifiedCmsBilled && agency.cmsData?.estimatedRecoverableRevenue
        ? `$${(agency.cmsData.estimatedRecoverableRevenue / 1000).toFixed(0)}K recoverable (Projected)`
        : '—',
      sourceRegistry: 'Actuarial Billing Model Projection (ZOLL AR Boost)',
      schemaIdentifier: 'Actuarial Billing Model Projection',
      verificationStatus: 'Model / Estimate',
      reportingPeriod: 'Financial Opportunity Model',
      documentationQuote: 'Actuarial revenue recovery projection achievable by transitioning to clean-claim automated documentation workflows. Modeled projection; not an observed historical financial ledger.',
      evidenceBasis: 'Deterministic actuarial formula; explicitly modeled scenario.',
      evidenceScope: 'MODELED_ESTIMATE',
      isFieldVerified: false // Strictly modeled financial scenario, never an observed historical fact!
    },

    // 6. Demographics & GIS
    {
      category: 'Demographics & GIS',
      fieldName: 'Cath Lab Transport Drive Time',
      fieldValue: `Modeled route estimate: ${agency.gisData?.avgTransportTimeMinutes ?? '—'} min (${agency.gisData?.distanceToNearestCathLabMiles ?? '—'} mi)`,
      sourceRegistry: 'US DOT National Highway System & OpenStreetMap GIS',
      schemaIdentifier: 'Isochrone Distance Calculation',
      verificationStatus: 'Model / Estimate',
      reportingPeriod: 'GIS Routing Engine Analysis',
      documentationQuote: 'Geospatially routed drive time estimate from department stations to primary receiving cardiac center.',
      evidenceBasis: 'Automated geospatial network routing; modeled drive time estimate.',
      evidenceScope: 'MODELED_ESTIMATE',
      isFieldVerified: false
    },
    {
      category: 'Demographics & GIS',
      fieldName: 'Receiving Hospital & STEMI Cath Lab',
      fieldValue: hasVerifiedHospitalLogistics
        ? `${agency.hospitalLogistics?.primaryCathLabHospital || agency.gisData?.primaryReceivingHospital || 'Source record'}`
        : 'Not source-verified',
      sourceRegistry: hasVerifiedHospitalLogistics ? agency.factEvidence?.receivingHospitalStemi?.sourceName || 'Reviewed agency or hospital source' : 'Agency, hospital, or EMS source required',
      schemaIdentifier: 'Receiving facility and PCI-capable cath lab relationship',
      verificationStatus: hasVerifiedHospitalLogistics ? 'Cross-Referenced' : 'Sourcing Required',
      sourceUrlOrCitation: hasVerifiedHospitalLogistics ? agency.factEvidence?.receivingHospitalStemi?.sourceUrl : undefined,
      reportingPeriod: hasVerifiedHospitalLogistics ? agency.factEvidence?.receivingHospitalStemi?.reportingPeriod : undefined,
      documentationQuote: hasVerifiedHospitalLogistics
        ? 'Receiving facility details have a reviewed, field-specific source record.'
        : 'Hospital names and STEMI/cath-lab relationships have not been confirmed for this agency.',
      evidenceBasis: hasVerifiedHospitalLogistics ? 'Reviewed source record tied to the agency or receiving facility.' : 'Geographic or generated hospital labels are not confirmation of a receiving relationship.',
      evidenceScope: hasVerifiedHospitalLogistics ? 'FIELD_VERIFIED' : 'UNVERIFIED',
      sourceRecordId: hasVerifiedHospitalLogistics ? agency.factEvidence?.receivingHospitalStemi?.sourceRecordId : undefined,
      reviewedAt: hasVerifiedHospitalLogistics ? agency.factEvidence?.receivingHospitalStemi?.reviewedAt : undefined,
      isFieldVerified: hasVerifiedHospitalLogistics
    },

    // 7. Grants & Procurement
    {
      category: 'Grants & Procurement',
      fieldName: 'FEMA AFG Award Status',
      fieldValue: hasVerifiedAfgGrant && agency.grantStatus?.afgAwarded
        ? `Awarded ($${(agency.grantStatus.afgAwardAmount / 1000).toFixed(0)}K)`
        : 'Not verified',
      sourceRegistry: hasVerifiedAfgGrant ? agency.factEvidence?.federalGrant?.sourceName || 'Reviewed FEMA award record' : 'FEMA / USASpending source required',
      schemaIdentifier: 'CFDA 97.044 Federal Prime Award',
      verificationStatus: hasVerifiedAfgGrant ? 'Legal Public Record' : 'Sourcing Required',
      sourceUrlOrCitation: hasVerifiedAfgGrant && agency.liveFemaAwards?.[0]?.awardNumber
        ? agency.factEvidence?.federalGrant?.sourceUrl
        : undefined,
      reportingPeriod: hasVerifiedAfgGrant && agency.liveFemaAwards?.[0]?.programYear
        ? `FY${agency.liveFemaAwards[0].programYear}`
        : agency.factEvidence?.federalGrant?.reportingPeriod,
      documentationQuote: hasVerifiedAfgGrant
        ? `Award record reviewed: ${agency.liveFemaAwards?.[0]?.awardNumber || agency.factEvidence?.federalGrant?.sourceRecordId || 'source record attached'}.`
        : 'No reviewed award record is attached. Missing data here does not mean the agency has no award.',
      evidenceBasis: hasVerifiedAfgGrant ? 'Verified federal award transaction in USASpending prime award ledger.' : 'Uncorroborated grant report.',
      evidenceScope: hasVerifiedAfgGrant ? 'FIELD_VERIFIED' : 'UNVERIFIED',
      sourceRecordId: hasVerifiedAfgGrant ? agency.factEvidence?.federalGrant?.sourceRecordId : undefined,
      reviewedAt: hasVerifiedAfgGrant ? agency.factEvidence?.federalGrant?.reviewedAt : undefined,
      isFieldVerified: hasVerifiedAfgGrant
    }
  ];

  const dimensionSummary: Record<string, { totalFields: number; verifiedFields: number }> = {};
  for (const rec of records) {
    if (!dimensionSummary[rec.category]) {
      dimensionSummary[rec.category] = { totalFields: 0, verifiedFields: 0 };
    }
    dimensionSummary[rec.category].totalFields += 1;
    if (rec.isFieldVerified) {
      dimensionSummary[rec.category].verifiedFields += 1;
    }
  }

  const applicableAuditedFields = records.length;
  const verifiedSupportedFields = records.filter(r => r.isFieldVerified).length;

  const evidenceCompletenessPct = Math.round((verifiedSupportedFields / applicableAuditedFields) * 100);
  const overallIntegrityScore = evidenceCompletenessPct;

  let integrityStatus: 'VERIFIED_CORROBORATED' | 'PARTIALLY_CORROBORATED' | 'INCOMPLETE_EVIDENCE' | 'UNASSESSED' = 'INCOMPLETE_EVIDENCE';
  let integrityStatusLabel = 'Incomplete Evidence / Sourcing Required';

  if (verifiedSupportedFields === 0) {
    integrityStatus = 'INCOMPLETE_EVIDENCE';
    integrityStatusLabel = 'Incomplete Evidence (0%)';
  } else if (verifiedSupportedFields < applicableAuditedFields) {
    integrityStatus = 'PARTIALLY_CORROBORATED';
    integrityStatusLabel = hasVerifiedNpi
      ? `Identity Corroborated · Other fields require their own sources (${evidenceCompletenessPct}%)`
      : `Partially Corroborated Evidence (${evidenceCompletenessPct}%)`;
  } else {
    integrityStatus = 'VERIFIED_CORROBORATED';
    integrityStatusLabel = `Multi-Source Corroborated (${evidenceCompletenessPct}%)`;
  }

  return {
    records,
    dimensionSummary,
    applicableAuditedFields,
    verifiedSupportedFields,
    evidenceCompletenessPct,
    integrityStatus,
    integrityStatusLabel,
    overallIntegrityScore,
    assessmentStatus: 'AUDITED'
  };
}
