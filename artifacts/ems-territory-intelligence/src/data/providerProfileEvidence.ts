import { nycFireProcurement } from './nycFireProcurement';
import {departmentCouncilRecords} from './departmentCouncilRecords';
import fireBillingIdentities from './fireBillingIdentityMatches.json';
import { interstateProviderEvidence } from './interstateProviderEvidence';
import { centralFloridaEvidence } from './centralFloridaEvidence';
import { providerDocumentRecords } from './providerDocumentRecords';
import { municipalAedPurchases } from './providerAedPurchasingEvidence';
import { municipalBillingRecords } from './providerBillingEvidence';
import { expandedProviderRecords } from './providerSourceExpansion';
import { publicDepartmentLeadership } from './providerLeadership';

export type ProviderEvidenceSource = {
  excerpt?: string;
  label: string;
  date: string;
  url: string;
};

export type EquipmentCategory = 'aed' | 'monitor' | 'cpr' | 'ventilator' | 'supplies';
export type EquipmentStatus = 'In service reported' | 'Documented historically' | 'Proposed purchase' | 'Purchase approved' | 'Purchase documented' | 'Service agreement';

export type ProviderEquipmentEvidence = {
  category: EquipmentCategory;
  model?: string;
  manufacturer?: string;
  brand?: string;
  supplier?: string;
  approvedOn?: string;
  lastPurchasedOn?: string;
  paidOn?: string;
  owner?: string;
  maintainedBy?: string;
  acquiredOn?: string;
  warrantyEnds?: string;
  serviceEnds?: string;
  padsExpireOn?: string;
  batteriesExpireOn?: string;
  quantity?: number;
  status: EquipmentStatus;
  deployment?: string;
  details: string;
  source: ProviderEvidenceSource;
};

export type ProviderFundingEvidence = {
  title: string;
  amount?: number;
  status: 'Requested' | 'Approved' | 'Awarded' | 'Reported expenditure';
  fiscalYear?: number;
  localMatch?: number;
  spendBy?: string;
  purchasingVehicle?: string;
  basis: string;
  source: ProviderEvidenceSource;
};

export type DepartmentMetric = {
  label: string;
  value: number;
  format?: 'percent' | 'currency' | 'duration';
  context?: string;
  reportingPeriod?: string;
  comparison?: 'apparatus';
  denialPayer?: string;
  source: ProviderEvidenceSource;
};

export type ProviderAccountContext = {
  area: 'Purchasing' | 'Clinical workflow' | 'Capital planning';
  title: string;
  detail: string;
  source: ProviderEvidenceSource;
};

export type ProviderContact = {
  role: string;
  name?: string;
  phone?: string;
  email?: string;
  source: ProviderEvidenceSource;
};

export type ProviderStation = {
  number: string;
  name: string;
  address: string;
  category: 'Department' | 'County' | 'Shared' | 'Volunteer';
  apparatus?: string;
  contact?: ProviderContact;
  activity?: { period: string; emsCalls: number; primaryCalls: number; responses: number };
};

export type ProviderEvidence = {
  registryKey: string;
  registryName: string;
  combinedServices?: true;
  equipment?: ProviderEquipmentEvidence[];
  funding?: ProviderFundingEvidence[];
  operations?: DepartmentMetric[];
  quality?: DepartmentMetric[];
  billing?: DepartmentMetric[];
  billingDenials?: DepartmentMetric[];
  payerMix?: DepartmentMetric[];
  accountContext?: ProviderAccountContext[];
  contacts?: ProviderContact[];
  stationDirectory?: { source: ProviderEvidenceSource; visitContact?: ProviderContact; stations: ProviderStation[] };
  serviceAreas?: { countyFips: string; city: string; source: ProviderEvidenceSource }[];
  publicAwardRecipients?: string[];
  identitySources?: ProviderEvidenceSource[];
};

const flaglerBudget = {
  label: 'Flagler County commission agenda, item 7e', date: '2026-06-15',
  url: 'https://www.flaglercounty.gov/files/assets/county/v/6/admin/documents/bocc-agenda-documents/2026-bocc-documents/updated-2026-06-15-bocc-regular-agenda-and-links.pdf',
};
const flaglerDeployment = {
  label: 'Flagler County AED replacement announcement', date: '2026-08-27',
  url: 'https://www.flaglercounty.gov/News-articles/2026-08-27-AEDs-replaced',
};
const flaglerAnnual = {
  label: 'Flagler County annual report, Fire Rescue', date: '2023',
  url: 'https://www.flaglercounty.gov/files/assets/county/v/1/admin/documents/transparency-dashboard/annual-report-2023.pdf#page=40',
};
const flaglerStudy = {
  label: 'Flagler County Fire Rescue station study', date: '2025-04-21',
  url: 'https://www.flaglercounty.gov/files/assets/county/v/1/admin/documents/bocc-agenda-documents/2025-bocc-documents/2025-04-21-bocc-workshop-agenda-and-backup-updated.pdf',
};
const flaglerLogistics = {
  label: 'Flagler County Fire Rescue Logistics Division', date: 'Undated department page',
  url: 'https://www.flaglercounty.gov/County-Services/Public-Safety/Flagler-County-Fire-Rescue/Logistics-Division',
};
const flaglerDirectory = {
  label: 'Flagler County Fire Rescue station and contact directory', date: 'Accessed Nov 26, 2026',
  url: 'https://www.flaglercounty.gov/County-Services/Public-Safety/Flagler-County-Fire-Rescue',
};
const flaglerChief = {
  label: 'Flagler County Fire Rescue release', date: '2026-08-27',
  url: 'https://www.flaglercounty.gov/News-articles/2026-08-27-AEDs-replaced',
};
const flaglerDeputy = {
  label: 'Flagler County deputy chief appointment', date: '2026-01-13',
  url: 'https://www.flaglercounty.gov/News-articles/2026-01-13-Deputy-Fire-Chief',
};
const coralChief = {
  label: 'Coral Springs fire department directory', date: 'Accessed Nov 26, 2026',
  url: 'https://www.coralsprings.gov/Government/Departments/Fire-Department',
};
const pembrokePurchase = {
  label: 'Pembroke Pines City Commission action 26-2757', date: '2026-08-05',
  url: 'https://ppines.legistar.com/LegislationDetail.aspx?FullText=1&GUID=AA3CD82E-5581-4F49-97B0-DC4FBCE8389C&ID=8156411',
};
const pembrokeStations = {
  label: 'Pembroke Pines Stations & Apparatus directory', date: 'Accessed Nov 26, 2026',
  url: 'https://www.ppines.com/241/Stations-Apparatus',
};
const orangeReport = {
  label: 'Orange County Fire Rescue department summary', date: 'FY2023',
  url: 'https://ocfl.net/Portals/0/Library/Emergency-Safety/docs/OCFRD_Summary_FY2023-CMcert.pdf',
};
const coralReport = {
  label: 'Coral Springs–Parkland Fire Department annual report', date: 'FY2025',
  url: 'https://www.coralsprings.gov/files/content/public/v/81/government/departments/fire-department/fd-annual-report-2025-final__20260114.pdf',
};
const newportAgenda = {
  label: 'Newport Beach City Council agenda, file 26-1985', date: '2026-03-24',
  url: 'https://newportbeach.legistar.com/LegislationDetail.aspx?G=40777422-16DC-4CA0-B6D7-28AC6D96FE42&GUID=27FD4F66-67B1-4751-B0BD-C8239A618588&ID=7954308&Options=&Search=',
};
const fortWorthAction = {
  label: 'Fort Worth City Council action M&C 26-0328', date: '2026-04-28',
  url: 'https://fortworthgov.legistar.com/LegislationDetail.aspx?G=5D78EE16-987A-40AB-8FB5-726D3DBA5713&GUID=26E7D403-C48E-490B-B464-8F378DB74303&ID=7989480&Options=&Search=',
};

const orangeProCare = {
  label: 'Orange County purchase order M115372', date: '2024-07-30',
  url: 'https://occompt.legistar.com/LegislationDetail.aspx?ID=6778218&GUID=01710062-CFE1-4FFB-BF99-0810E4074104',
};
const orangeNpi = {
  label: 'CMS NPPES billing organization and Fire Rescue trade name', date: 'Accessed Nov 27, 2026',
  url: 'https://npiregistry.cms.hhs.gov/api/?version=2.1&number=1033215348',
};
const coralPriorReport = {
  label: 'Coral Springs–Parkland annual report', date: 'FY2024',
  url: 'https://www.coralsprings.gov/files/content/public/v/79/government/departments/fire-department/annual-report-2024-final__20250226.pdf',
};
const jolietPurchase = {
  label: 'Joliet Public Safety Committee purchase recommendation', date: '2026-01-06',
  url: 'https://joliet.legistar.com/View.ashx?GUID=2D68D3C8-4C88-4515-B9A3-911162D21705&ID=1371128&M=PA',
};
const coralStationOffice = {
  label: 'Coral Springs Fire Administration', date: 'Accessed Nov 27, 2026',
  url: 'https://www.coralsprings.gov/Government/Departments/Fire-Department',
};
const coralPublicAeds = {
  label: 'City of Coral Springs public AED directory', date: 'Accessed Nov 27, 2026',
  url: 'https://www.coralsprings.gov/Government/Departments/Fire-Department/Public-Education/AEDs',
};
const coralGrants = {
  label: 'City of Coral Springs grant annual report', date: 'FY2026',
  url: 'https://www.coralsprings.gov/Government/Departments/Budget-Sustainability/Grant-Annual-Report',
};

/** Attach only to the exact public identity. Name-only or city-only records are ineligible. */
const cocoaDirectory = {label:'City of Cocoa fire department directory', date:'Accessed 2026-11-27', url:'https://www.cocoafl.gov/m/directory/department?did=6'};
const cocoaActivity = {label:'City of Cocoa annual statistics', date:'2021', url:'https://www.cocoafl.gov/1716/Annual-Statistics'};
const canaveralContacts = {label:'Canaveral Fire Rescue staff directory',date:'Accessed 2026-11-27',url:'https://www.ccvfd.org/contact.html'};
const canaveralBudget = {label:'City of Cape Canaveral adopted budget',date:'FY2024–25',url:'https://cms3.revize.com/revize/capecanaveralfl/document_center/Documents/Administration%20Financial%20Services/FY2024-2025%20FINAL%20ADOPTED%20BUDGET.pdf'};
export const providerProfileEvidence = [
  {registryKey:'FDID:FL:19011',registryName:'Canaveral Fire/Rescue',combinedServices:true,
    identitySources:[canaveralBudget],operations:[{label:'Stations in the city budget',value:3,reportingPeriod:'FY2024–25',context:'One city station and two port stations.',source:canaveralBudget}],
    contacts:[{role:'Fire Chief',name:'Chris Quinn',phone:'321-783-4424 ext. 202',source:canaveralContacts},
      {role:'Deputy Chief',name:'Jeff Crawley',phone:'321-783-4424 ext. 203',source:canaveralContacts},
      {role:'Assistant Fire Chief / Fire Marshal',name:'Derek Yossifon',phone:'321-783-4777 ext. 303',source:canaveralContacts},
      {role:'Chief of Training',name:'Chris Connell',phone:'321-783-4424 ext. 205',source:canaveralContacts}]},

  {
    registryKey:'FDID:FL:19052', registryName:'Cocoa Fire Department', combinedServices:true,
    operations:[
      {label:'Calls for service',value:5920,reportingPeriod:'Calendar 2021',source:cocoaActivity},
      {label:'Medical incidents',value:3966,reportingPeriod:'Calendar 2021',source:cocoaActivity},
      {label:'Fire incidents',value:1954,reportingPeriod:'Calendar 2021',source:cocoaActivity},
    ],
    contacts:[
      {role:'Fire Chief',name:'Jonathan Lamm',phone:'321-639-7610',source:cocoaDirectory},
      {role:'Assistant Fire Chief',name:'Roderick Moore',email:'rmoore@cocoafl.gov',source:cocoaDirectory},
    ],
    stationDirectory:{source:cocoaDirectory,stations:[
      {number:'1',name:'Fire Station 1',category:'Department',address:'1740 Dixon Blvd, Cocoa, FL 32922',contact:{role:'Station phone',phone:'321-639-7605',source:cocoaDirectory}},
      {number:'2',name:'Fire Station 2',category:'Department',address:'300 Brunson Blvd, Cocoa, FL 32922',contact:{role:'Station phone',phone:'321-433-8655',source:cocoaDirectory}},
      {number:'3',name:'Fire Station 3',category:'Department',address:'3505 SR 524, Cocoa, FL 32926',contact:{role:'Station phone',phone:'321-433-8682',source:cocoaDirectory}},
    ]},
  },
  {
    registryKey: 'FDID:FL:61091', registryName: 'Flagler County Fire Rescue', combinedServices: true,
    publicAwardRecipients: ['Flagler County', 'County of Flagler'],
    contacts: [
      { role: 'Fire Rescue Chief', name: 'Michael Tucker', source: flaglerChief },
      { role: 'Deputy Chief', name: 'Daniel VanDeusen', source: flaglerDeputy },
      { role: 'Reports and records', phone: '386-313-4444', email: 'firefeedback@flaglercounty.gov', source: flaglerDirectory },
      { role: 'Fire Prevention', phone: '386-313-4258', email: 'firemarshal@flaglercounty.gov', source: flaglerDirectory },
      { role: 'Community paramedic', phone: '386-313-4260', source: flaglerDirectory },
      { role: 'Training Division', phone: '386-313-4262', source: flaglerDirectory },
      { role: 'Ambulance billing', name: 'Digitech', phone: '855-437-7656', source: flaglerDirectory },
    ],
    stationDirectory: {
      source: flaglerDirectory,
      visitContact: { role: 'Main county line for station visits', phone: '386-313-4000', source: flaglerDirectory },
      stations: [
        { number: '40', name: 'Hammock', address: '5593 North Oceanshore Boulevard, Palm Coast, FL', category: 'County', apparatus: 'Engine and rescue' },
        { number: '50', name: 'Bunnell', address: '160 Old Moody Boulevard, Bunnell, FL', category: 'County', apparatus: 'Tender, woods unit and rescue' },
        { number: '51', name: 'Espanola', address: '3055 County Road 13, Bunnell, FL', category: 'County', apparatus: 'Tender and rescue' },
        { number: '52', name: 'Flagler Executive Airport', address: '130 Airport Road, Palm Coast, FL', category: 'County', apparatus: 'Engine and rescue' },
        { number: '57', name: 'St. Johns Park', address: '89 East County Road 2006, Bunnell, FL', category: 'County', apparatus: 'Engine and rescue' },
        { number: '11', name: 'Flagler Beach', address: '320 South Flagler Avenue, Flagler Beach, FL', category: 'Shared', apparatus: 'County Rescue 45' },
        { number: '16', name: 'Halifax Plantation', address: '3935 Old Dixie Highway, Ormond Beach, FL', category: 'Shared', apparatus: 'Shared with Volusia County' },
        { number: '21', name: 'Palm Coast', address: '9 Corporate Drive, Palm Coast, FL', category: 'Shared', apparatus: 'County Rescue 41' },
        { number: '22', name: 'Palm Coast', address: '307 Palm Coast Parkway NE, Palm Coast, FL', category: 'Shared', apparatus: 'County Rescue 42' },
        { number: '24', name: 'Palm Coast', address: '1505 Palm Harbor Parkway, Palm Coast, FL', category: 'Shared', apparatus: 'County Rescue 44' },
        { number: '25', name: 'Palm Coast', address: '1250 Belle Terre Parkway, Palm Coast, FL', category: 'Shared', apparatus: 'County Rescue 55' },
        { number: '53', name: 'Korona', address: '5820 US Highway 1 South, Bunnell, FL', category: 'Volunteer' },
        { number: '58', name: 'Rima Ridge', address: '500 Rodeo Road, Ormond Beach, FL', category: 'Volunteer' },
      ],
    },
    equipment: [
      {
        category: 'aed', status: 'In service reported',
        deployment: 'County public-access AED program', owner: 'Flagler County', maintainedBy: 'Flagler County Fire Rescue',
        details: 'The county reported replacing older AEDs with units compatible with cardiac monitors carried on Fire Rescue ambulances and engines. Installed model and quantity were not stated in the announcement.',
        source: flaglerDeployment,
      },
      {
        category: 'aed', quantity: 22, status: 'Proposed purchase',
        deployment: 'County public buildings and parks',
        details: 'June replacement request. This quantity applies to the request.',
        source: flaglerBudget,
      },
      {
        category: 'monitor', quantity: 15, status: 'Documented historically',
        deployment: 'Department cardiac monitor replacement',
        details: 'The 2023 county annual report records replacement of all 15 monitors. The current fleet, manufacturer, model and warranty remain unconfirmed.',
        source: flaglerAnnual,
      },
      {
        category: 'supplies', quantity: 4, status: 'Proposed purchase',
        deployment: 'County public-access AED program',
        details: 'Locked cabinets requested with the AED replacements.',
        source: flaglerBudget,
      },
    ],
    funding: [
      {
        title: 'Countywide AED and cabinet replacement', amount: 46268, status: 'Requested',
        basis: 'Proposed transfer from General Fund reserves for 22 AEDs and four cabinets.',
        source: flaglerBudget,
      },
    ],
    operations: [
      { label: 'Rescue and EMS incidents', value: 14138, source: flaglerAnnual },
      { label: 'Total incidents', value: 18946, source: flaglerAnnual },
      { label: 'Fire incidents', value: 220, source: flaglerAnnual },
      { label: 'Firefighters', value: 105, source: flaglerStudy },
      { label: 'Administrative personnel', value: 9, source: flaglerStudy },
      { label: 'ALS rescue units', value: 9, source: flaglerStudy },
      { label: 'Facilities used for service', value: 13, context: 'Includes five facilities operated by municipalities.', source: flaglerStudy },
    ],
    quality: [
      { label: '90th percentile first-unit emergency response', value: 635, format: 'duration', reportingPeriod: '2023', context: '2023 incident data. Time includes dispatch handling, turnout and travel as reported in Table 3.', source: flaglerStudy },
      { label: '90th percentile first-unit turnout', value: 127, format: 'duration', reportingPeriod: '2023', context: '2023 incident data. All incidents, Table 3.', source: flaglerStudy },
    ],
    accountContext: [
      { area: 'Purchasing', title: 'Logistics Division', detail: 'Handles equipment and supply purchasing, contract negotiation and budget management with department leadership.', source: flaglerLogistics },
      { area: 'Clinical workflow', title: 'AED-to-monitor compatibility', detail: 'The county says its replacement public-access AEDs are compatible with monitors carried on ambulances and engines. Ask which devices and accessories were selected.', source: flaglerDeployment },
      { area: 'Clinical workflow', title: 'ESO incident and EMS records', detail: 'The station study identifies ESO as the department’s records system. Confirm the current documentation and event-review workflow before discussing integration.', source: flaglerStudy },
    ],
  },
  {
    registryKey: 'FDID:FL:07252', registryName: 'Orange County Fire Rescue Department', combinedServices: true,
    identitySources: [orangeNpi],
    publicAwardRecipients: ['Orange County Board of County Commissioners', 'Orange County, Florida', 'County of Orange'],
    equipment: [{
      category: 'monitor', manufacturer: 'Stryker', model: 'LIFEPAK 15', quantity: 137, owner: 'Orange County Fire Rescue Department',
      supplier: 'Stryker Medical', status: 'Service agreement', approvedOn: '2024-07-30', serviceEnds: '2025-07-30',
      details: 'The county reported 137 department-owned units in its July 2024 staff memo and authorized extended warranty, repairs and preventive maintenance. The count belongs to that historical inventory snapshot.',
      source: orangeProCare,
    }, {
      category: 'monitor', manufacturer: 'Physio-Control', model: 'LIFEPAK (specific model not stated)', quantity: 58,
      supplier: 'Physio-Control, Inc.', status: 'Purchase approved', approvedOn: '2011-09-20',
      details: 'The board approved purchase order M54222 for 58 cardiac defibrillators and related equipment in a $1,618,621.50 package.',
      source: { label: 'Orange County Fire Rescue procurement history, purchase order M54222', date: '2011-09-20',
        url: 'https://www.occompt.com/DocumentCenter/View/25659/2013-03-12-Administrative-Services-Consent-Item-08' },
    }],
    contacts: [{
      role: 'Fire Rescue technical services contact on 2024 purchase order', name: 'John Westmoreland', phone: '407-836-9178', source: orangeProCare,
    }],
    operations: [
      { label: 'Fire stations', value: 44, source: orangeReport },
      { label: 'EMS calls', value: 114775, source: orangeReport },
      { label: 'EMS transports', value: 78756, source: orangeReport },
      { label: 'ALS rescue units', comparison: 'apparatus', value: 45, source: orangeReport },
      { label: 'ALS engines and quints', comparison: 'apparatus', value: 43, source: orangeReport },
      { label: 'ALS medic units', comparison: 'apparatus', value: 8, source: orangeReport },
      { label: 'Sworn personnel', value: 1298, source: orangeReport },
      { label: 'Total personnel', value: 1554, source: orangeReport },
      { label: 'Unit responses', value: 287995, source: orangeReport },
    ],
    quality: [
      { label: 'Mean first-unit response', value: 458, format: 'duration', context: 'Countywide as reported by the department.', source: orangeReport },
      { label: 'Urban first-unit response', value: 454, format: 'duration', context: 'Average in the urban service area.', source: orangeReport },
      { label: 'Rural first-unit response', value: 536, format: 'duration', context: 'Average in the rural service area.', source: orangeReport },
    ],
    funding: [
      {
        title: 'LIFEPAK 15 warranty and maintenance purchase order', amount: 309775.42, status: 'Approved',
        basis: 'Purchase order M115372, Stryker Medical. Historical service coverage August 2024 through July 2025.',
        purchasingVehicle: 'M115372', source: orangeProCare,
      },
      {
        title: 'Department expenditures', amount: 266284891, status: 'Reported expenditure',
        basis: 'Total department expenditure for FY2023. Equipment allocation or available funds were not specified by this figure.',
        source: orangeReport,
      },
    ],
  },
  {
    registryKey: 'FDID:FL:10151', registryName: 'Coral Springs-Parkland Fire Department', combinedServices: true,
    stationDirectory: {
      source: coralReport,
      visitContact: { role: 'Fire Administration office', phone: '954-344-5934', email: 'CSFD@coralsprings.gov', source: coralStationOffice },
      stations: [
        { number: '43', name: 'Coral Springs', address: '4550 Rock Island Road, Coral Springs, FL 33065', category: 'Department', apparatus: 'R43, E43, DST43 and BC43 listed in the annual report.',
          activity: { period: 'FY2025', emsCalls: 2026, primaryCalls: 2994, responses: 4583 } },
        { number: '64', name: 'Coral Springs', address: '600 Ramblewood Drive, Coral Springs, FL 33071', category: 'Department',
          activity: { period: 'FY2025', emsCalls: 1657, primaryCalls: 2420, responses: 3572 } },
        { number: '71', name: 'Coral Springs', address: '11800 NW 41st Street, Coral Springs, FL 33065', category: 'Department',
          activity: { period: 'FY2025', emsCalls: 1834, primaryCalls: 2580, responses: 4024 } },
        { number: '80', name: 'Coral Springs', address: '2825 Coral Springs Drive, Coral Springs, FL 33065', category: 'Department', apparatus: 'Primary rescue, aerial units, dive boat and command support reported.',
          activity: { period: 'FY2025', emsCalls: 2331, primaryCalls: 3523, responses: 5387 } },
        { number: '95', name: 'Coral Springs', address: '300 Coral Ridge Drive, Coral Springs, FL 33071', category: 'Department',
          activity: { period: 'FY2025', emsCalls: 1129, primaryCalls: 1671, responses: 2652 } },
        { number: '42', name: 'Parkland', address: '6500 Parkside Drive, Parkland, FL 33067', category: 'Department', apparatus: 'Engine and rescue.',
          activity: { period: 'FY2025', emsCalls: 906, primaryCalls: 1382, responses: 2151 } },
        { number: '97', name: 'Parkland', address: '6650 N. University Drive, Parkland, FL 33067', category: 'Department', apparatus: 'ALS transport rescue and 3,000-gallon tender.',
          activity: { period: 'FY2025', emsCalls: 1129, primaryCalls: 1253, responses: 1469 } },
        { number: '109', name: 'Parkland', address: '11601 Hillsboro Boulevard, Parkland, FL 33076', category: 'Department', apparatus: 'ALS suppression and ALS transport rescue.',
          activity: { period: 'FY2025', emsCalls: 641, primaryCalls: 1087, responses: 1702 } },
      ],
    },
    publicAwardRecipients: ['City of Coral Springs', 'Coral Springs, City of'],
    equipment: [{
      category: 'aed', status: 'In service reported', deployment: 'City public-access program',
      details: 'The city identifies ten parks and public facilities with AEDs, including City Hall, Cypress Park and Mullins Park. The source lists locations and an AED program contact.',
      source: coralPublicAeds,
    }],
    contacts: [
      { role: 'Public AED program', email: 'dchavez@coralsprings.gov', source: coralPublicAeds },
      { role: 'Fire Chief', name: 'John Whalen', source: coralChief },
      { role: 'EMS Battalion Chief', name: 'Patrick Staab', source: coralReport },
      { role: 'Division Chief', name: 'John Barry', source: coralReport },
      { role: 'Medical Director', name: 'Dr. Peter Antevy', source: coralReport },
    ],
    operations: [
      { label: 'Total incidents', value: 17077, source: coralReport },
      { label: 'EMS calls', value: 11656, source: coralReport },
      { label: 'EMS transports', value: 9284, source: coralReport },
    ],
    quality: [
      { label: 'Cardiac arrests', value: 100, reportingPeriod: 'FY2025', source: coralReport },
      { label: 'Cardiac arrests', value: 73, reportingPeriod: 'FY2024', source: coralPriorReport },
      { label: 'Return of spontaneous circulation (ROSC)', value: 30, format: 'percent', reportingPeriod: 'FY2025', context: 'Reported alongside 100 cardiac arrests. ROSC and survival to hospital discharge are different measures.', source: coralReport },
      { label: 'Return of spontaneous circulation (ROSC)', value: 34, format: 'percent', reportingPeriod: 'FY2024', context: 'Reported alongside 73 cardiac arrests.', source: coralPriorReport },
      { label: 'Mean EMS response time', value: 311, format: 'duration', source: coralReport },
      { label: 'Emergency EMS responses within 8 minutes', value: 96.7, format: 'percent', source: coralReport },
      { label: 'Continuous quality improvement reviews', value: 910, source: coralReport },
      { label: 'Stroke alerts', value: 243, source: coralReport },
      { label: 'STEMI alerts', value: 39, source: coralReport },
      { label: 'Trauma alerts', value: 420, source: coralReport },
    ],
    funding: [
      { title: 'FEMA Assistance to Firefighters Grant', amount: 90909, status: 'Awarded', fiscalYear: 2026, basis: 'City FY2026 report lists health, wellness, and training for firefighters as the award purpose.', source: coralGrants },
      { title: 'FEMA SAFER staffing grant', amount: 2670793, status: 'Awarded', fiscalYear: 2026, basis: 'City FY2026 report lists funding to hire 12 firefighters.', source: coralGrants },
    ],
    accountContext: [
      { area: 'Clinical workflow', title: 'CARES and case review', detail: 'The EMS Division reports CARES participation with hospital partners. The EMS battalion chief oversees QA/QI, protocols and EMS equipment.', source: coralReport },
    ],
  },
  {
    registryKey: 'FDID:FL:10082', registryName: 'Pembroke Pines Fire Rescue', combinedServices: true,
    publicAwardRecipients: ['City of Pembroke Pines', 'Pembroke Pines, City of'],
    contacts: [{ role: 'Fire Rescue office', phone: '954-499-9600', source: pembrokeStations }],
    stationDirectory: {
      source: pembrokeStations,
      visitContact: { role: 'Fire Rescue office for station visits', phone: '954-499-9600', source: pembrokeStations },
      stations: [
        { number: '33', name: 'Pembroke Pines', address: '600 SW 72nd Avenue, Pembroke Pines, FL 33023', category: 'Department', apparatus: 'Engine 33, Rescue 33, Crash/TSU 33' },
        { number: '69', name: 'Pembroke Pines', address: '9500 Pines Boulevard Building B, Pembroke Pines, FL 33024', category: 'Department', apparatus: 'Battalion 69, Engine 69, Platform 69, Rescue 69, Rescue 269' },
        { number: '89', name: 'Pembroke Pines', address: '13000 SW Pines Boulevard, Pembroke Pines, FL 33027', category: 'Department', apparatus: 'Engine 89, Rescue 89, Rescue 289' },
        { number: '99', name: 'Pembroke Pines', address: '16999 Pines Boulevard, Pembroke Pines, FL 33028', category: 'Department', apparatus: 'Battalion 99, Engine 99, Platform 99, Rescue 99' },
        { number: '79', name: 'Pembroke Pines', address: '19900 Pines Boulevard, Pembroke Pines, FL 33029', category: 'Department', apparatus: 'Engine 79, Rescue 79' },
        { number: '101', name: 'Pembroke Pines', address: '6057 SW 198 Terrace, Pembroke Pines, FL 33332', category: 'Department', apparatus: 'Engine 101, Rescue 101' },
      ],
    },
    equipment: [
      {
        category: 'monitor', manufacturer: 'Stryker', supplier: 'Stryker Sales, LLC', model: 'LIFEPAK 35',
        quantity: 21, status: 'Purchase approved', approvedOn: '2026-08-05',
        details: 'Commission authorized the purchase. The record does not state an executed purchase or delivery date.',
        source: pembrokePurchase,
      },
      {
        category: 'monitor', manufacturer: 'Stryker', model: 'LIFEPAK 15 V1',
        quantity: 16, status: 'Documented historically',
        details: 'The approved package included a $24,000 trade-in credit for 16 existing units. Completion was not reported.',
        source: pembrokePurchase,
      },
    ],
    funding: [
      {
        title: 'Monitor/defibrillator purchase and accessories', amount: 1072958.05, status: 'Approved',
        basis: 'Not-to-exceed authorization including a $24,000 trade-in credit.',
        purchasingVehicle: 'City Commission item 26-2757 · sole source', source: pembrokePurchase,
      },
    ],
  },
  {
    registryKey: 'FDID:CA:30055', registryName: 'Newport Beach Fire Department',
    equipment: [
      {
        category: 'monitor', model: 'ZOLL Zenix', quantity: 24, status: 'Proposed purchase',
        details: 'Replacement monitor/defibrillators listed in the council staff recommendation.', source: newportAgenda,
      },
      {
        category: 'cpr', model: 'ZOLL AutoPulse NXT', quantity: 11, status: 'Proposed purchase',
        details: 'Mechanical CPR devices listed in the same recommendation, with components and warranties.',
        source: newportAgenda,
      },
    ],
    funding: [
      {
        title: 'Monitor and mechanical CPR replacement', amount: 1774636.53, status: 'Requested',
        basis: 'Proposed appropriation from the Fire Department equipment fund.', purchasingVehicle: 'NPPGov contract PS 25850',
        source: newportAgenda,
      },
    ],
  },
  {
    registryKey: 'FDID:TX:WB901', registryName: 'Fort Worth Fire Department', combinedServices: true,
    equipment: [
      {
        category: 'monitor', manufacturer: 'ZOLL', status: 'Service agreement',
        deployment: 'Fire Department and Emergency Medical Services',
        details: 'Council approved an amendment for preventive maintenance and repair. Model and deployed quantity were not stated in the action summary.',
        source: fortWorthAction,
      },
    ],
    funding: [
      {
        title: 'Cardiac monitor preventive maintenance and repair', amount: 350000, status: 'Approved',
        basis: 'Annual contract amount after a $150,000 increase for Fire and EMS service coverage.',
        source: fortWorthAction,
      },
    ],
  },
  {
    registryKey: 'FDID:IL:CS931', registryName: 'Chicago Fire Department', combinedServices: true,
    funding: [{
      title: 'ZOLL defibrillator and AED contract 243444', amount: 10000000, status: 'Awarded',
      basis: 'Chicago’s contract register lists a ceiling through December 19, 2028. The ceiling does not identify quantities purchased or amounts paid.',
      purchasingVehicle: '243444',
      source: { label: 'Chicago vendor and contract register, contract 243444', date: '2023-12-21',
        url: 'https://webapps1.chicago.gov/vcsearch/city/contracts/243444' },
    }],
    publicAwardRecipients: ['City of Chicago', 'Chicago, City of'],
  },
  {
    registryKey: 'FDID:NY:31000', registryName: 'Fire Department City of New York (FDNY)', combinedServices: true,
    ...nycFireProcurement,
    publicAwardRecipients: ['City of New York', 'New York City'],
  },
  ...publicDepartmentLeadership,
  {
    registryKey: 'FDID:IL:WG221', registryName: 'Joliet Fire Department',
    equipment: [
      { category: 'aed', manufacturer: 'Stryker / Physio-Control', model: 'LIFEPAK 1000', supplier: 'Stryker Medical',
        quantity: 3, status: 'Proposed purchase', details: 'The Public Safety Committee recommended the purchase under memo TMP-9340. Final purchase and deployment remain unreported in this source.', source: jolietPurchase },
      { category: 'monitor', manufacturer: 'Stryker', model: 'LIFEPAK 35', supplier: 'Stryker Medical',
        quantity: 1, status: 'Proposed purchase', details: 'Included in the same Public Safety Committee recommendation as the three AEDs.', source: jolietPurchase },
    ],
    funding: [{
      title: 'LIFEPAK monitor and AED purchase recommendation', amount: 59847.12, status: 'Requested',
      basis: 'Combined proposal amount for one monitor and three AEDs.', purchasingVehicle: 'TMP-9340', source: jolietPurchase,
    }],
  },
  ...departmentCouncilRecords,
  ...expandedProviderRecords,
  ...municipalBillingRecords,
  ...providerDocumentRecords,
  ...centralFloridaEvidence,
  ...interstateProviderEvidence,
  ...municipalAedPurchases,
] satisfies ProviderEvidence[];

// Identity bridges grounded in the state roster and matching published headquarters.
const registryEvidenceMatches = new Map([
  ['STATE-EMS:FL:license:518', { name: 'City Of Cocoa/Cocoa Fire Department', fdid: 'FDID:FL:19052' }],
  ['NERIS:FD12009983', { name: 'Cocoa Fire Department', fdid: 'FDID:FL:19052' }],
  ['NERIS:FD25015329', { name: 'Easthampton Fire Department', fdid: 'FDID:MA:15087' }],
  ['NERIS:FD27017449', { name: 'Cloquet Area Fire District', fdid: 'FDID:MN:09305' }],
  ['NPI:1871748681', { name: 'CLOQUET AREA FIRE DISTRICT', fdid: 'FDID:MN:09305' }],
  ['NERIS:FD27049785', { name: 'Red Wing Fire Department', fdid: 'FDID:MN:25306' }],
  ['NERIS:FD27051083', { name: 'Ashby Fire Department', fdid: 'FDID:MN:26101' }],
  ['NERIS:FD27137766', { name: 'Hibbing Fire Department', fdid: 'FDID:MN:69230' }],
  ['STATE-EMS:FL:license:1801', { name: 'Flagler County Fire Rescue', fdid: 'FDID:FL:61091' }],
  ['STATE-EMS:FL:license:4807', { name: 'Orange County Fire Rescue Department', fdid: 'FDID:FL:07252' }],
  ['STATE-EMS:FL:license:633', { name: 'Coral Springs Fire Department, City Of', fdid: 'FDID:FL:10151' }],
  ['NPI:1033215348', { name: 'ORANGE COUNTY BOARD OF COUNTY COMMISSIONERS', fdid: 'FDID:FL:07252' }],
  ['STATE-EMS:FL:license:621', { name: 'Pembroke Pines Fire Rescue', fdid: 'FDID:FL:10082' }],
  ['NERIS:FD12035253', { name: 'Flagler County Fire Rescue', fdid: 'FDID:FL:61091' }],
  ['NERIS:FD12011279', { name: 'Coral Springs-Parkland Fire Department', fdid: 'FDID:FL:10151' }],
  ['NERIS:FD12095275', { name: 'Orange County Fire Rescue Department', fdid: 'FDID:FL:07252' }],
  ['NERIS:FD12095614', { name: 'Orlando Fire Department', fdid: 'FDID:FL:07212' }],
  ['NERIS:FD17031754', { name: 'Chicago Fire Department', fdid: 'FDID:IL:CS931' }],
  ['NERIS:FD36047901', { name: 'Fire Department City Of New York (FDNY)', fdid: 'FDID:NY:31000' }],
  ['NERIS:FD19153927', { name: 'Ankeny Fire Department', fdid: 'FDID:IA:77003' }],
  ['NERIS:FD13097928', { name: 'Douglas County Fire Department', fdid: 'FDID:GA:04801' }],
  ['NERIS:FD44003188', { name: 'Warwick Fire Department', fdid: 'FDID:RI:03500' }],
  ['NERIS:FD12097921', { name: 'Osceola County Department Of Fire Rescue And Ems', fdid: 'FDID:FL:26032' }],
  ['NERIS:FD12009171', { name: 'Brevard County Fire Rescue', fdid: 'FDID:FL:19182' }],
  ['NERIS:FD12009679', { name: 'Malabar Fire Department', fdid: 'FDID:FL:19111' }],
  ['NERIS:FD12009413', { name: 'Palm Bay Fire Rescue', fdid: 'FDID:FL:19042' }],
  ['NERIS:FD17113730', { name: 'Normal Fire Department', fdid: 'FDID:IL:MK332' }],
  ['NERIS:FD26121215', { name: 'City Of Muskegon Fire Department', fdid: 'FDID:MI:06110' }],
  ['NERIS:FD06073172', { name: 'Santee Fire Department', fdid: 'FDID:CA:37150' }],
  ['NERIS:FD51550625', { name: 'Chesapeake Fire Department', fdid: 'FDID:VA:55000' }],
  ['NERIS:FD53033044', { name: 'City Of Bothell Fire Department', fdid: 'FDID:WA:17M04' }],
  ['NERIS:FD48135893', { name: 'Odessa Fire Department', fdid: 'FDID:TX:DZ704' }],
  ['NERIS:FD47145029', { name: 'City Of Kingston Fire Department', fdid: 'FDID:TN:73133' }],
  ['NERIS:FD04013303', { name: 'Mesa Fire and Medical Department', fdid: 'FDID:AZ:08183' }],
  ['NERIS:FD13215263', { name: 'Columbus Department Of Fire and EMS', fdid: 'FDID:GA:10601' }],
  ['NERIS:FD45053870', { name: 'Jasper County Fire & Rescue', fdid: 'FDID:SC:27203' }],
  ['NERIS:FD25013823', { name: 'Wilbraham Fire Department', fdid: 'FDID:MA:13339' }],
  ['NERIS:FD17043548', { name: 'Naperville Fire Department', fdid: 'FDID:IL:DD132' }],
  ['NERIS:FD06001800', { name: 'City Of Alameda Fire Department', fdid: 'FDID:CA:01005' }],
  ['NERIS:FD29183681', { name: 'Saint Charles Fire Department', fdid: 'FDID:MO:09203' }],
  ['NERIS:FD17089896', { name: 'Elgin Fire Department', fdid: 'FDID:IL:KA191' }],
  ['NERIS:FD44005667', { name: 'Middletown Fire Department', fdid: 'FDID:RI:01900' }],
  ['NERIS:FD17097770', { name: 'Waukegan Fire Department', fdid: 'FDID:IL:LA401' }],
  ['NERIS:FD12086690', { name: 'Miami Beach Fire Department', fdid: 'FDID:FL:01012' }],
  ['NERIS:FD12005957', { name: 'Lynn Haven Fire Rescue', fdid: 'FDID:FL:23022' }],
  ['NERIS:FD25023950', { name: 'Carver Fire Department', fdid: 'FDID:MA:23052' }],
  ['NERIS:FD06029084', { name: 'California City Fire Department', fdid: 'FDID:CA:15065' }],
  ['NERIS:FD51600329', { name: 'Fairfax County Fire and Rescue Department', fdid: 'FDID:VA:05900' }],
  ['NERIS:FD08013133', { name: 'Lafayette Fire Department', fdid: 'FDID:CO:01354' }],
  ['NERIS:FD12011524', { name: 'Pembroke Pines Fire Rescue', fdid: 'FDID:FL:10082' }],
]);

export function providerEvidenceKey(registryKey: string | undefined, registryName: string) {
  const linked = registryEvidenceMatches.get(registryKey ?? '');
  return linked && linked.name.toLowerCase() === registryName.toLowerCase() ? linked.fdid : registryKey;
}

export function findProviderEvidence(registryKey: string | undefined, registryName: string): ProviderEvidence | undefined {
  const key = providerEvidenceKey(registryKey, registryName);
  return providerProfileEvidence.find(entry => entry.registryKey === key &&
    (key !== registryKey || entry.registryName.toLowerCase() === registryName.toLowerCase()));
}

export function findProviderEvidenceByConfirmedKeys(keys: string[]): ProviderEvidence | undefined {
  const identities = new Set(keys.map(key => registryEvidenceMatches.get(key)?.fdid ?? key));
  const matches = providerProfileEvidence.filter(entry => identities.has(entry.registryKey));
  return matches.length === 1 ? matches[0] : undefined;
}

function linkedSourceId(evidence: ProviderEvidence | undefined, prefix: string) {
  if (!evidence) return undefined;
  for (const [key, value] of registryEvidenceMatches) {
    if (key.startsWith(prefix) && value.fdid === evidence.registryKey) return key.slice(prefix.length);
  }
  return undefined;
}

export const providerEvidenceNerisId = (evidence?: ProviderEvidence) => linkedSourceId(evidence, 'NERIS:');
export const providerEvidenceNpi = (evidence?: ProviderEvidence) => linkedSourceId(evidence, 'NPI:');
export const providerEvidenceFloridaLicense = (evidence?: ProviderEvidence) => linkedSourceId(evidence, 'STATE-EMS:FL:license:');

const billingByFire: Readonly<Record<string, string>> = fireBillingIdentities;
const fireByBilling = new Map(Object.entries(billingByFire).map(([fire, npi]) => [npi, fire]));

export function linkedBillingOrganization(key?: string, evidence?: ProviderEvidence) {
  return providerEvidenceNpi(evidence) ?? billingByFire[evidence?.registryKey ?? key ?? ''];
}

export function linkedFireDepartment(key?: string, evidence?: ProviderEvidence) {
  if (evidence?.registryKey.startsWith('FDID:')) return evidence.registryKey;
  return key?.startsWith('NPI:') ? fireByBilling.get(key.slice(4)) : undefined;
}
