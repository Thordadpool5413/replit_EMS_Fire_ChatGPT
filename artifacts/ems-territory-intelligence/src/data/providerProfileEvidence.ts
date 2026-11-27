export type ProviderEvidenceSource = {
  label: string;
  date: string;
  url: string;
};

export type EquipmentCategory = 'aed' | 'monitor' | 'cpr' | 'ventilator' | 'supplies';
export type EquipmentStatus = 'In service reported' | 'Documented historically' | 'Proposed purchase' | 'Purchase approved' | 'Service agreement';

export type ProviderEquipmentEvidence = {
  category: EquipmentCategory;
  model?: string;
  manufacturer?: string;
  supplier?: string;
  approvedOn?: string;
  lastPurchasedOn?: string;
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
};

export type ProviderEvidence = {
  registryKey: string;
  registryName: string;
  combinedServices?: true;
  equipment?: ProviderEquipmentEvidence[];
  funding?: ProviderFundingEvidence[];
  operations?: DepartmentMetric[];
  quality?: DepartmentMetric[];
  accountContext?: ProviderAccountContext[];
  contacts?: ProviderContact[];
  stationDirectory?: { source: ProviderEvidenceSource; visitContact?: ProviderContact; stations: ProviderStation[] };
  publicAwardRecipients?: string[];
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

/** Attach only to the exact public identity. Name-only or city-only records are ineligible. */
export const providerProfileEvidence = [
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
        title: 'Department expenditures', amount: 266284891, status: 'Reported expenditure',
        basis: 'Total department expenditure for FY2023. Equipment allocation or available funds were not specified by this figure.',
        source: orangeReport,
      },
    ],
  },
  {
    registryKey: 'FDID:FL:10151', registryName: 'Coral Springs-Parkland Fire Department', combinedServices: true,
    publicAwardRecipients: ['City of Coral Springs', 'Coral Springs, City of'],
    contacts: [
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
      { label: 'Cardiac arrests', value: 100, source: coralReport },
      { label: 'Return of spontaneous circulation (ROSC)', value: 30, format: 'percent', context: 'Reported alongside 100 cardiac arrests. ROSC and survival to hospital discharge are different measures.', source: coralReport },
      { label: 'Mean EMS response time', value: 311, format: 'duration', source: coralReport },
      { label: 'Emergency EMS responses within 8 minutes', value: 96.7, format: 'percent', source: coralReport },
      { label: 'Continuous quality improvement reviews', value: 910, source: coralReport },
      { label: 'Stroke alerts', value: 243, source: coralReport },
      { label: 'STEMI alerts', value: 39, source: coralReport },
      { label: 'Trauma alerts', value: 420, source: coralReport },
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
] satisfies ProviderEvidence[];

// Identity bridges grounded in the state roster and matching published headquarters.
const registryEvidenceMatches = new Map([
  ['STATE-EMS:FL:license:1801', { name: 'Flagler County Fire Rescue', fdid: 'FDID:FL:61091' }],
  ['STATE-EMS:FL:license:4807', { name: 'Orange County Fire Rescue Department', fdid: 'FDID:FL:07252' }],
  ['STATE-EMS:FL:license:621', { name: 'Pembroke Pines Fire Rescue', fdid: 'FDID:FL:10082' }],
  ['NERIS:FD12035253', { name: 'Flagler County Fire Rescue', fdid: 'FDID:FL:61091' }],
  ['NERIS:FD12011524', { name: 'Pembroke Pines Fire Rescue', fdid: 'FDID:FL:10082' }],
]);

export function findProviderEvidence(registryKey: string | undefined, registryName: string): ProviderEvidence | undefined {
  const exactIdentity = registryEvidenceMatches.get(registryKey ?? '');
  const key = exactIdentity?.name === registryName ? exactIdentity.fdid : registryKey;
  return providerProfileEvidence.find(entry => entry.registryKey === key && entry.registryName === registryName);
}

export function providerEvidenceNerisId(evidence?: ProviderEvidence) {
  for (const [key, value] of registryEvidenceMatches) {
    if (key.startsWith('NERIS:') && value.fdid === evidence?.registryKey && value.name === evidence.registryName) return key.slice(6);
  }
  return undefined;
}
