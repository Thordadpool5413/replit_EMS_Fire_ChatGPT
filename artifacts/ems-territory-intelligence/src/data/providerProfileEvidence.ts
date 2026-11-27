export type ProviderEvidenceSource = {
  label: string;
  date: string;
  url: string;
};

export type EquipmentCategory = 'aed' | 'monitor' | 'cpr' | 'ventilator' | 'supplies';
export type EquipmentStatus = 'In service reported' | 'Documented historically' | 'Proposed purchase' | 'Service agreement';

export type ProviderEquipmentEvidence = {
  category: EquipmentCategory;
  model?: string;
  manufacturer?: string;
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

type DepartmentMetric = {
  label: string;
  value: number;
  format?: 'percent' | 'currency';
  source: ProviderEvidenceSource;
};

export type ProviderEvidence = {
  registryKey: string;
  registryName: string;
  equipment?: ProviderEquipmentEvidence[];
  funding?: ProviderFundingEvidence[];
  operations?: DepartmentMetric[];
};

const flaglerBudget = {
  label: 'Flagler County commission agenda, item 7e', date: '2026-06-15',
  url: 'https://www.flaglercounty.gov/files/assets/county/v/6/admin/documents/bocc-agenda-documents/2026-bocc-documents/updated-2026-06-15-bocc-regular-agenda-and-links.pdf',
};
const flaglerDeployment = {
  label: 'Flagler County AED replacement announcement', date: '2026-08-27',
  url: 'https://www.flaglercounty.gov/News-articles/2026-08-27-AEDs-replaced',
};
const orangeReport = {
  label: 'Orange County Fire Rescue department summary', date: 'FY2023',
  url: 'https://www.ocfl.net/Portals/0/Library/Emergency-Safety/docs/OCFRD_Summary_FY2023.pdf',
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
    registryKey: 'FDID:FL:61091', registryName: 'Flagler County Fire Rescue',
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
  },
  {
    registryKey: 'FDID:FL:07252', registryName: 'Orange County Fire Rescue Department',
    operations: [
      { label: 'Fire stations', value: 44, source: orangeReport },
      { label: 'EMS calls', value: 114775, source: orangeReport },
      { label: 'EMS transports', value: 78756, source: orangeReport },
      { label: 'ALS rescue units', value: 45, source: orangeReport },
      { label: 'ALS engines and quints', value: 43, source: orangeReport },
      { label: 'Sworn personnel', value: 1298, source: orangeReport },
      { label: 'Total personnel', value: 1554, source: orangeReport },
      { label: 'Unit responses', value: 287995, source: orangeReport },
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
    registryKey: 'FDID:FL:10151', registryName: 'Coral Springs-Parkland Fire Department',
    operations: [
      { label: 'Cardiac arrests', value: 100, source: coralReport },
      { label: 'Return of spontaneous circulation', value: 30, format: 'percent', source: coralReport },
      { label: 'Stroke alerts', value: 243, source: coralReport },
      { label: 'STEMI alerts', value: 39, source: coralReport },
      { label: 'Trauma alerts', value: 420, source: coralReport },
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
    registryKey: 'FDID:TX:WB901', registryName: 'Fort Worth Fire Department',
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

export function findProviderEvidence(registryKey: string | undefined, registryName: string): ProviderEvidence | undefined {
  return providerProfileEvidence.find((entry) => entry.registryKey === registryKey && entry.registryName === registryName);
}
