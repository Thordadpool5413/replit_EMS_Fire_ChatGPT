/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Agency } from '../types';
import { hasVerifiedProviderIdentity } from './providerIdentity';
import { validateNpiCheckDigit } from '../services/npiVerificationService';
import { findExactFemaAfgAward } from './femaAwardMatching';

export interface DataRegistrySource {
  id: string;
  name: string;
  acronym: string;
  sourceUrl: string;
  dataAsOf: string;
  governingBody: string;
  updateCadence: string;
  legalAuthority: string;
  schemaSpecification: string;
  primaryFieldsIngested: string[];
  verificationMethod: string;
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
  sourceRetrievedAt?: string;
  lineageReviewedOn?: string;
  sourceRecordStatus?: string;
  evidenceBasis?: string;
  evidenceScope?: 'FIELD_VERIFIED' | 'ORGANIZATION_IDENTITY_ONLY' | 'REGIONAL_BENCHMARK' | 'MODELED_ESTIMATE' | 'UNVERIFIED';
}

export const LINEAGE_REVIEWED_ON = '2026-10-30';

export const DATA_REGISTRY_SOURCES: DataRegistrySource[] = [
  {
    id: 'cms_part_b',
    name: 'CMS Ambulance Fee Schedule Public Use Files (AFS PUF)',
    acronym: 'CMS AFS PUF',
    sourceUrl: 'https://www.cms.gov/medicare/payment/fee-schedules/ambulance/ambulance-fee-schedule-public-use-files',
    dataAsOf: 'CY2026 fee schedule; not provider claims or denials',
    governingBody: 'Centers for Medicare & Medicaid Services (U.S. Dept of Health & Human Services)',
    updateCadence: 'Annual fee schedule publication; check the current release and reporting period',
    legalAuthority: 'Social Security Act § 1834(l) & 42 CFR § 414.610',
    schemaSpecification: 'Published ambulance fee schedule rates and geographic adjustments',
    primaryFieldsIngested: [
      'Published ambulance fee schedule payment rates by service and geography',
      'No provider-specific billed amounts, claim counts, or denial rates'
    ],
    verificationMethod: 'Public fee schedule reference only; it cannot verify an agency claim history or denial rate. Match the exact file, identifier, metric, and period for any separate claims record.'
  },
  {
    id: 'nemsis_v3',
    name: 'National Emergency Medical Services Information System (NEMSIS)',
    acronym: 'NEMSIS v3.5',
    sourceUrl: 'https://nemsis.org/using-ems-data/request-research-data',
    dataAsOf: '2025 public-release dataset; agency and state identifiers are removed',
    governingBody: 'NHTSA Office of EMS (U.S. Dept of Transportation) & Technical Assistance Center (TAC)',
    updateCadence: 'State reporting and national releases vary',
    legalAuthority: 'Highway Safety Act of 1966 (23 U.S.C. 403) & NHTSA Emergency Medical Services Mandate',
    schemaSpecification: 'NEMSIS v3.5 standard; research release is de-identified',
    primaryFieldsIngested: [
      'EMS data standard fields (availability varies by state)',
      'State-reported measures may not be available at agency level',
      'No live NEMSIS agency-level feed is implied by this listing'
    ],
    verificationMethod: 'The public research release is de-identified and cannot substantiate agency-specific totals; state submissions may be incomplete.'
  },
  {
    id: 'usfa_registry',
    name: 'U.S. Fire Administration National Fire Department Registry',
    acronym: 'USFA NFDR',
    sourceUrl: 'https://apps.usfa.fema.gov/registry/download',
    dataAsOf: 'Registry last updated 2026-06-11',
    governingBody: 'Federal Emergency Management Agency (DHS)',
    updateCadence: 'Registry updates; check current registry listing',
    legalAuthority: 'Federal Fire Prevention and Control Act of 1974 (Public Law 93-498)',
    schemaSpecification: 'USFA department registry fields and department master record',
    primaryFieldsIngested: [
      'Department FDID (5-Digit State-Unique Identifier)',
      'Department ID, name, addresses, county, department and organization type',
      'Number of stations and reported firefighter / non-firefighting personnel',
      'No ambulance or fire-engine inventory in the public download'
    ],
    verificationMethod: 'USFA registry listing; FDIDs are assigned by states and are not globally unique. Confirm each profile field against the department-specific record.'
  },
  {
    id: 'fema_afg',
    name: 'FEMA Assistance to Firefighters Grant (AFG) OpenFEMA Dataset',
    acronym: 'OpenFEMA AFG',
    sourceUrl: 'https://www.fema.gov/openfema-data-page/non-disaster-and-assistance-firefighter-grants-v1',
    dataAsOf: 'OpenFEMA last refresh 2026-06-04',
    governingBody: 'U.S. Department of Homeland Security (DHS) / FEMA Grant Programs Directorate',
    updateCadence: 'Annual dataset refresh; check FEMA metadata',
    legalAuthority: 'Assistance to Firefighters Grants program records published by FEMA',
    schemaSpecification: 'OpenFEMA AFG public record fields: awardNumber, fiscalYear, programName, stateCode, awardAmount, grantee',
    primaryFieldsIngested: [
      'AFG historical award number and program name',
      'Fiscal year, recipient name, vendor state, obligated award amount',
      'Award date as published in the dataset; no remaining-balance or SAFER fields',
      'Award matching is required before asserting department-level grant status',
      'No result from a search does not establish that an agency has no award'
    ],
    verificationMethod: 'Match recipient and award identifiers to the department and period. An award amount is not a remaining balance; no local match does not prove no award.'
  },
  {
    id: 'nppes_npi',
    name: 'CMS National Plan and Provider Enumeration System (NPPES)',
    acronym: 'NPPES NPI Registry',
    sourceUrl: 'https://npiregistry.cms.hhs.gov/api-page',
    dataAsOf: 'Read API reports daily NPPES data',
    governingBody: 'Centers for Medicare & Medicaid Services (HHS)',
    updateCadence: 'NPPES registry is updated; check the record timestamp',
    legalAuthority: 'HIPAA Administrative Simplification (45 CFR Part 162)',
    schemaSpecification: 'Public NPPES Type 1 / Type 2 provider enumeration records',
    primaryFieldsIngested: [
      'NPI, organization name, listed addresses, and taxonomy when present',
      'NPI issuance does not prove licensure or operational affiliation',
      'An NPI does not by itself prove active Medicare billing'
    ],
    verificationMethod: 'A returned row supports only identity fields in that row. It does not prove licensure, active operations, equipment, outcomes, or Medicare billing.'
  },
  {
    id: 'gpo_procurement',
    name: 'National Cooperative Procurement Contracts (Sourcewell, NPPGov, HGACBuy)',
    acronym: 'GPO Contracts',
    sourceUrl: 'https://www.sourcewell-mn.gov/cooperative-purchasing',
    dataAsOf: 'Contract-specific; check current contract documents',
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
  },
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
    agency.operatingRelationship !== 'UNRELATED_ENTITY' &&
    agency.operatingRelationship !== 'RELATIONSHIP_UNRESOLVED' &&
    agency.operatingRelationship !== 'UNRESOLVED';

  const hasVerifiedNpi = Boolean(
    hasVerifiedProviderIdentity(agency) &&
    !isUnrelatedOrIndividual &&
    isCorroboratedRelationship
  );

  const hasVerifiedLegalName = Boolean(hasVerifiedNpi && agency.nppesOfficialName);
  const hasVerifiedAddress = Boolean(
    hasVerifiedNpi &&
    agency.address &&
    agency.nppesVerifiedAddress &&
    agency.address === agency.nppesVerifiedAddress
  );
  const hasSpecificUsfaCitation = Boolean(
    agency.usfaRegistryUrl &&
    !/\/registry\/?$/i.test(agency.usfaRegistryUrl)
  );
  const hasVerifiedFdid = Boolean(agency.isFdidVerified && agency.fdid && hasSpecificUsfaCitation);
  const hasVerifiedOperations = Boolean(agency.isOperationalDataVerified && agency.operationsSourceDoc);
  
  const hasVerifiedEquipment = Boolean(
    agency.installedFleet?.isVerifiedEquipment &&
    agency.installedFleet?.procurementResolutionId &&
    agency.installedFleet?.procurementSourceDoc
  );
  const hasVerifiedFleetAge = Boolean(
    agency.installedFleet?.isVerifiedEquipment &&
    agency.installedFleet?.capitalAssetLedgerId &&
    agency.installedFleet?.capitalAssetLedgerDoc
  );
  const hasVerifiedWarranty = Boolean(
    agency.installedFleet?.isVerifiedWarranty && agency.installedFleet?.warrantyContractDoc
  );
  const hasVerifiedCPR = Boolean(hasVerifiedEquipment && agency.installedFleet?.mechanicalCPR);

  const hasVerifiedContractVendor = Boolean(
    agency.competitorContract?.isVerifiedContract &&
    agency.competitorContract?.contractNumber &&
    agency.competitorContract?.contractSourceDoc
  );
  const hasVerifiedContractEndDate = Boolean(
    agency.competitorContract?.isVerifiedContract &&
    agency.competitorContract?.contractEndDate &&
    agency.competitorContract?.contractSourceDoc
  );
  const hasVerifiedStemiRatio = Boolean(agency.qualityMetrics?.isNemsqaVerified && agency.qualityMetrics?.nemsqaSourceDoc);
  const hasVerifiedCmsBilled = Boolean(agency.cmsData?.isVerifiedCmsClaims && agency.cmsData?.claimsSourceDoc);
  const hasVerifiedCmsDenials = false;
  const matchedAfgAward = findExactFemaAfgAward(agency);
  const hasVerifiedAfgGrant = Boolean(matchedAfgAward);
  const hasVerifiedMaintenanceBurden = Boolean(
    agency.competitorContract?.isVerifiedContract &&
    agency.competitorContract?.annualServiceCostPerUnit &&
    agency.competitorContract?.contractSourceDoc
  );

  const hasVerifiedClinicalCalls = Boolean(agency.qualityMetrics?.isCaresVerified && agency.qualityMetrics?.caresSourceDoc);
  const hasVerifiedUtsteinSurvival = false;

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
      reportingPeriod: agency.nppesLastUpdated || 'Registry record date not available',
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
      fieldValue: agency.nppesOfficialName || agency.name,
      sourceRegistry: 'CMS National Plan and Provider Enumeration System (NPPES)',
      schemaIdentifier: 'NPI Legal Business Name (LBN)',
      verificationStatus: hasVerifiedLegalName ? 'Verified Official' : 'Unverified Baseline',
      sourceUrlOrCitation: agency.npiNumber ? `https://npiregistry.cms.hhs.gov/provider-view/${agency.npiNumber}` : undefined,
      reportingPeriod: agency.nppesLastUpdated || 'Registry record date not available',
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
      fieldValue: agency.address || 'Uncorroborated / Sourcing Required',
      sourceRegistry: 'CMS NPPES Practice Location Registry',
      schemaIdentifier: 'Primary Practice Location Address',
      verificationStatus: hasVerifiedAddress ? 'Verified Official' : 'Sourcing Required',
      sourceUrlOrCitation: agency.npiNumber ? `https://npiregistry.cms.hhs.gov/provider-view/${agency.npiNumber}` : undefined,
      reportingPeriod: agency.nppesLastUpdated || 'Registry record date not available',
      documentationQuote: hasVerifiedAddress
        ? `Headquarters physical address confirmed via NPPES provider registry: ${agency.nppesVerifiedAddress}.`
        : 'Physical practice location unverified; postal address confirmation required.',
      evidenceBasis: hasVerifiedAddress ? 'NPPES practice location corroborated with local municipal jurisdiction.' : 'Uncorroborated postal string.',
      evidenceScope: hasVerifiedAddress ? 'FIELD_VERIFIED' : 'UNVERIFIED',
      isFieldVerified: hasVerifiedAddress
    },
    {
      category: 'Operational Telemetry',
      fieldName: 'Department Identifier (FDID)',
      fieldValue: agency.fdid || 'Not Recorded / Sourcing Required',
      sourceRegistry: 'USFA National Fire Department Registry (ID only)',
      schemaIdentifier: 'NFIRS 5.0 State Agency Code',
      verificationStatus: hasVerifiedFdid ? 'Verified Official' : agency.fdid ? 'Cross-Referenced' : 'Sourcing Required',
      sourceUrlOrCitation: agency.usfaRegistryUrl,
      reportingPeriod: 'USFA registry update 2026-06-11; department record date unavailable',
      documentationQuote: agency.fdid
        ? (hasVerifiedFdid
            ? `USFA certified fire department / EMS agency identifier: ${agency.fdid}.`
            : `Uncorroborated state agency identifier: ${agency.fdid}; USFA registry lookup required.`)
        : 'State fire marshal or EMS division identifier not confirmed.',
      evidenceBasis: hasVerifiedFdid ? 'USFA Registry certified fire department record.' : 'Uncorroborated state ID string.',
      evidenceScope: hasVerifiedFdid ? 'FIELD_VERIFIED' : 'UNVERIFIED',
      isFieldVerified: hasVerifiedFdid
    },
    {
      category: 'Operational Telemetry',
      fieldName: 'Annual 911 Call Volume',
      fieldValue: `${agency.annualCallVolume.toLocaleString()} calls`,
      sourceRegistry: hasVerifiedOperations ? 'Agency operational report (record required)' : 'Unverified profile baseline / estimate',
      schemaIdentifier: 'RunLog.01 Annual Dispatch Volume',
      verificationStatus: hasVerifiedOperations ? 'Verified Official' : 'Model / Estimate',
      reportingPeriod: hasVerifiedOperations ? 'Attached record period not parsed' : 'Not reported / not available',
      documentationQuote: hasVerifiedOperations
        ? 'Source document attached; value has not been independently reconciled to another public dataset.'
        : 'Estimated annual 911 dispatch volume modeled from regional population density.',
      evidenceBasis: hasVerifiedOperations ? 'Agency operational source document attached.' : 'Demographic run-rate model projection.',
      evidenceScope: hasVerifiedOperations ? 'FIELD_VERIFIED' : 'MODELED_ESTIMATE',
      isFieldVerified: hasVerifiedOperations
    },
    {
      category: 'Operational Telemetry',
      fieldName: 'Annual 911 Emergency Transports',
      fieldValue: `${agency.annual911Transports.toLocaleString()} transports`,
      sourceRegistry: hasVerifiedOperations ? 'Agency EMS transport report (record required)' : 'Unverified profile baseline / estimate',
      schemaIdentifier: 'eResponse.07 Unit Dispatched / Transported',
      verificationStatus: hasVerifiedOperations ? 'Verified Official' : 'Model / Estimate',
      reportingPeriod: hasVerifiedOperations ? 'Attached record period not parsed' : 'Not reported / not available',
      documentationQuote: hasVerifiedOperations
        ? 'Source document attached; value has not been independently reconciled to another public dataset.'
        : 'Estimated emergency transport volume; verified ePCR run-log audit required.',
      evidenceBasis: hasVerifiedOperations ? 'Agency operational source document attached.' : 'Regional transport ratio projection.',
      evidenceScope: hasVerifiedOperations ? 'FIELD_VERIFIED' : 'MODELED_ESTIMATE',
      isFieldVerified: hasVerifiedOperations
    },
    {
      category: 'Operational Telemetry',
      fieldName: 'Apparatus Fleet Breakdown',
      fieldValue: `${agency.totalAmbulances} Ambulances · ${agency.totalFireEngines} Fire Engines`,
      sourceRegistry: hasVerifiedOperations ? 'Agency apparatus roster (record required)' : 'Unverified profile baseline / estimate',
      schemaIdentifier: 'NFIRS Apparatus Inventory Record',
      verificationStatus: hasVerifiedOperations ? 'Verified Official' : 'Model / Estimate',
      reportingPeriod: hasVerifiedOperations ? 'Attached record period not parsed' : 'Not reported / not available',
      documentationQuote: hasVerifiedOperations
        ? 'Audited apparatus and active vehicle count registered with county dispatch.'
        : 'Modeled apparatus allocation; frontline fleet inventory inspection required.',
      evidenceBasis: hasVerifiedOperations ? 'Audited county dispatch CAD unit roster.' : 'Station density projection model.',
      evidenceScope: hasVerifiedOperations ? 'FIELD_VERIFIED' : 'MODELED_ESTIMATE',
      isFieldVerified: hasVerifiedOperations
    },

    // 2. Installed Equipment Fleet
    {
      category: 'Installed Fleet',
      fieldName: 'Incumbent Defibrillator Monitor Brand',
      fieldValue: agency.installedFleet?.defibBrand || 'Unknown Monitor Fleet',
      sourceRegistry: hasVerifiedEquipment ? 'Municipal procurement record' : 'Unverified profile baseline / estimate',
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
      fieldValue: `${agency.installedFleet?.defibAgeYears ?? '—'} years old`,
      sourceRegistry: hasVerifiedFleetAge ? 'Municipal capital asset record' : 'Unverified profile baseline / estimate',
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
      fieldValue: agency.installedFleet?.defibWarrantyStatus || 'Unverified',
      sourceRegistry: hasVerifiedWarranty ? 'Manufacturer maintenance agreement' : 'Unverified profile baseline / estimate',
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
      fieldValue: agency.installedFleet?.mechanicalCPR || 'Not Reported',
      sourceRegistry: hasVerifiedCPR ? 'Agency procurement / equipment record' : 'Unverified profile baseline / estimate',
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
      fieldValue: agency.competitorContract?.vendor || 'Unknown Vendor',
      sourceRegistry: hasVerifiedContractVendor ? 'Municipal executed contract' : 'Unverified profile baseline / estimate',
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
      fieldValue: agency.competitorContract?.contractEndDate || 'Not Recorded',
      sourceRegistry: hasVerifiedContractEndDate ? 'Municipal executed contract' : 'Unverified profile baseline / estimate',
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
      fieldValue: agency.competitorContract?.annualServiceCostPerUnit
        ? `$${agency.competitorContract.annualServiceCostPerUnit.toLocaleString()} / unit / year`
        : '—',
      sourceRegistry: hasVerifiedMaintenanceBurden ? 'Municipal expenditure record' : 'Unverified profile baseline / estimate',
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
      fieldValue: `${calls.toLocaleString()} calls/yr`,
      sourceRegistry: hasVerifiedClinicalCalls ? 'Agency CARES report (record required)' : 'NEMSIS public research dataset / modeled estimate',
      schemaIdentifier: 'eDefib.01 Cardiac Resuscitation Event',
      verificationStatus: hasVerifiedClinicalCalls ? 'HIPAA De-Identified' : 'Model / Estimate',
      reportingPeriod: hasVerifiedClinicalCalls ? 'Attached CARES report period not parsed' : 'Not reported / not available',
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
      fieldValue: `${agency.utsteinSurvivalRate}%`,
      sourceRegistry: hasVerifiedUtsteinSurvival ? 'Agency CARES report (record required)' : 'Unverified profile baseline / estimate',
      schemaIdentifier: 'CARES Outcome Variable CPC 1 & 2',
      verificationStatus: hasVerifiedUtsteinSurvival ? 'HIPAA De-Identified' : 'Geographic Benchmark',
      reportingPeriod: hasVerifiedUtsteinSurvival ? 'Attached CARES report period not parsed' : 'Not reported / not available',
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
      fieldValue: `${Math.round(calls * 0.165)} activations / yr`,
      sourceRegistry: hasVerifiedStemiRatio ? 'Agency NEMSQA report (record required)' : 'Unverified profile baseline / estimate',
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
      fieldValue: agency.cmsData?.medicareBilledAnnual
        ? `$${(agency.cmsData.medicareBilledAnnual / 1000).toFixed(0)}K billed`
        : '—',
      sourceRegistry: hasVerifiedCmsBilled ? 'Agency claims source record' : 'CMS fee schedule reference / profile estimate',
      schemaIdentifier: 'Form CMS-1500 Fee-for-Service Census',
      verificationStatus: hasVerifiedCmsBilled ? 'Verified Official' : 'Model / Estimate',
      reportingPeriod: hasVerifiedCmsBilled ? (agency.cmsData?.cmsClaimPufYear || 'CMS Part B PUF CY2024') : 'Modeled Baseline',
      documentationQuote: hasVerifiedCmsBilled
        ? 'Ingested from CMS Part B Ground Ambulance Public Use File for primary NPI/MAC jurisdiction.'
        : 'Modeled billing volume; CMS Part B Provider Public Use File record not corroborated.',
      evidenceBasis: hasVerifiedCmsBilled ? 'Adjudicated CMS Part B claims fee-for-service file.' : 'Estimated billing census.',
      evidenceScope: hasVerifiedCmsBilled ? 'FIELD_VERIFIED' : 'MODELED_ESTIMATE',
      isFieldVerified: hasVerifiedCmsBilled
    },
    {
      category: 'CMS Claims & Reimbursement',
      fieldName: 'Medicare Claim Denial Rate',
      fieldValue: agency.cmsData?.claimDenialRate !== undefined && agency.cmsData?.claimDenialRate !== null
        ? `${agency.cmsData.claimDenialRate}%`
        : 'Not available',
      sourceRegistry: 'No public agency-level CMS denial source; profile value is unverified',
      schemaIdentifier: 'Claim Status Reason Code (CARC/RARC)',
      verificationStatus: 'Sourcing Required',
      reportingPeriod: 'No agency reporting period available',
      documentationQuote: hasVerifiedCmsDenials
        ? `Documented claim denial rate based on ${agency.cmsData?.topDenialReason || 'prior authorization / medical necessity'} exceptions.`
        : 'CMS ambulance fee schedule files publish payment rates, not agency-specific claim-denial rates. This profile value is not verified by CMS.',
      evidenceBasis: 'No public agency-specific denial record is attached.',
      evidenceScope: 'UNVERIFIED',
      isFieldVerified: false
    },
    {
      category: 'CMS Claims & Reimbursement',
      fieldName: 'Addressable Cash Recovery via Clean Claims',
      fieldValue: agency.cmsData?.estimatedRecoverableRevenue
        ? `$${(agency.cmsData.estimatedRecoverableRevenue / 1000).toFixed(0)}K recoverable (Projected)`
        : '—',
      sourceRegistry: 'Internal actuarial scenario model (not a source record)',
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
      fieldValue: `${agency.gisData?.avgTransportTimeMinutes ?? '—'} min (${agency.gisData?.distanceToNearestCathLabMiles ?? '—'} mi)`,
      sourceRegistry: 'Unverified GIS routing model; route-data version not recorded',
      schemaIdentifier: 'Isochrone Distance Calculation',
      verificationStatus: 'Model / Estimate',
      reportingPeriod: 'GIS Routing Engine Analysis',
      documentationQuote: 'Geospatially routed drive time estimate from department stations to primary receiving cardiac center.',
      evidenceBasis: 'Automated geospatial network routing; modeled drive time estimate.',
      evidenceScope: 'MODELED_ESTIMATE',
      isFieldVerified: false
    },

    // 7. Grants & Procurement
    {
      category: 'Grants & Procurement',
      fieldName: 'FEMA AFG Award Status',
      fieldValue: hasVerifiedAfgGrant
        ? `OpenFEMA record ${matchedAfgAward!.awardNumber} (award amount $${(matchedAfgAward!.federalShareAwarded ?? matchedAfgAward!.awardAmount).toLocaleString()})`
        : agency.grantStatus?.afgAwarded
          ? `Unverified profile claim ($${agency.grantStatus.afgAwardAmount.toLocaleString()})`
          : 'No matched award record linked to this profile',
      sourceRegistry: 'FEMA OpenFEMA Assistance to Firefighters Grants dataset',
      schemaIdentifier: 'awardNumber, fiscalYear, programName, grantee, stateCode, awardAmount',
      verificationStatus: hasVerifiedAfgGrant ? 'Legal Public Record' : 'Unverified Baseline',
      sourceUrlOrCitation: 'https://www.fema.gov/openfema-data-page/non-disaster-and-assistance-firefighter-grants-v1',
      reportingPeriod: hasVerifiedAfgGrant && (matchedAfgAward?.programYear ?? matchedAfgAward?.fiscalYear)
        ? `FY${matchedAfgAward.programYear ?? matchedAfgAward.fiscalYear}`
        : 'No matched recipient and award record; reporting period unverified',
      documentationQuote: hasVerifiedAfgGrant
        ? `OpenFEMA row ${matchedAfgAward!.awardNumber} matches the recipient and award details. The listed award amount is not a current remaining balance.`
        : agency.grantStatus?.afgAwarded
          ? 'The local profile claims an award, but no exact OpenFEMA match is attached; treat the claim as unverified.'
          : 'No exact OpenFEMA match is attached. This does not establish that the agency has never received an award.',
      evidenceBasis: hasVerifiedAfgGrant
        ? 'Unique exact match to a public OpenFEMA award record.'
        : 'No exact row-level match; absence is not evidence of no award.',
      evidenceScope: hasVerifiedAfgGrant ? 'FIELD_VERIFIED' : 'UNVERIFIED',
      isFieldVerified: hasVerifiedAfgGrant
    }
  ];

  const categorySourceLinks: Partial<Record<FieldLineageRecord['category'], string>> = {
    'Clinical & NEMSIS': 'https://nemsis.org/using-ems-data/request-research-data',
    'CMS Claims & Reimbursement': 'https://www.cms.gov/medicare/payment/fee-schedules/ambulance/ambulance-fee-schedule-public-use-files',
    'Grants & Procurement': 'https://www.fema.gov/openfema-data-page/non-disaster-and-assistance-firefighter-grants-v1'
  };
  for (const record of records) {
    if (!record.sourceUrlOrCitation && record.fieldName.includes('NPI')) {
      record.sourceUrlOrCitation = 'https://npiregistry.cms.hhs.gov/api-page';
    } else if (!record.sourceUrlOrCitation && record.fieldName.includes('FDID')) {
      record.sourceUrlOrCitation = 'https://apps.usfa.fema.gov/registry/download';
    } else {
      record.sourceUrlOrCitation ||= categorySourceLinks[record.category];
    }
    record.lineageReviewedOn = LINEAGE_REVIEWED_ON;
    record.sourceRetrievedAt ||= record.fieldName.includes('NPI') && hasVerifiedNpi
      ? agency.lastVerifiedAt || 'Retrieval timestamp not recorded'
      : record.isFieldVerified
        ? 'Source retrieval date not recorded'
        : 'Not retrieved for this agency';
    record.sourceRecordStatus = record.isFieldVerified
      ? 'Agency-specific evidence attached'
      : 'Public reference only; agency-specific source record not attached';
    record.reportingPeriod ||= 'Not reported / not available';
  }

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

  const applicableAuditedFields = records.length; // Exactly 22 fields
  const verifiedSupportedFields = records.filter(r => r.isFieldVerified).length;

  const evidenceCompletenessPct = Math.round((verifiedSupportedFields / applicableAuditedFields) * 100);
  const overallIntegrityScore = evidenceCompletenessPct;

  let integrityStatus: 'VERIFIED_CORROBORATED' | 'PARTIALLY_CORROBORATED' | 'INCOMPLETE_EVIDENCE' | 'UNASSESSED' = 'INCOMPLETE_EVIDENCE';
  let integrityStatusLabel = 'Incomplete Evidence / Sourcing Required';

  if (verifiedSupportedFields === 0) {
    integrityStatus = 'INCOMPLETE_EVIDENCE';
    integrityStatusLabel = 'Incomplete Evidence (0%)';
  } else if (verifiedSupportedFields < 15) {
    integrityStatus = 'PARTIALLY_CORROBORATED';
    integrityStatusLabel = hasVerifiedNpi
      ? `Identity Corroborated (${evidenceCompletenessPct}%) · Equipment & Contracts Unverified`
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
