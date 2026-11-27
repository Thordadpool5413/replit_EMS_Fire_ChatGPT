import minnesotaGrants from './minnesotaAmbulanceGrants.json';
import type { DepartmentMetric, ProviderEvidence } from './providerProfileEvidence';

const ankenySource = {
  label: 'Ankeny Fire Department ambulance billing RFP, section 26', date: '2024',
  url: 'https://www.ankenyiowa.gov/DocumentCenter/View/3176/Ankeny-Fire-Department-Ambulance-Billing-RFP-2024',
};
const douglasSource = {
  label: 'Douglas County EMS billing and collection RFP 21-012', date: 'FY2020 data',
  url: 'https://www.douglascountyga.gov/DocumentCenter/View/5835/21-012-Solicitation-Documents',
};
const warwickSource = {
  label: 'Warwick Fire LIFEPAK 1000 purchase request and supplier quote', date: '2025-05-29',
  url: 'https://www.warwickri.gov/sites/g/files/vyhlif12206/f/agendas/bid_package_06-16-2025.pdf',
};
const ouraySource = {
  label: 'Ouray County EMS equipment grant announcement', date: '2026-05-13',
  url: 'https://www.ouraycountyco.gov/m/newsflash/Archive/Item/945?arcId=1340',
};

const ankenyPayers = [
  ['Iowa Total Care Medicaid', 6, 7, 6], ['Molina Healthcare of Iowa', 0, 0, 2],
  ['Iowa Department of Human Services Medicaid', 1, 0, 0], ['Wellpoint Medicaid', 7, 9, 6],
  ['Medicare', 32, 33, 30], ['Private insurance', 52, 50, 55], ['Self-pay', 2, 1, 1],
] as const;

export const minnesotaGrantSource = {
  label: 'Minnesota Office of EMS operating deficit grant progress report, Table 1', date: '2026-02-15',
  url: 'https://mn.gov/oems/assets/Ambulance%20Operating%20Deficit%20Grant%20Program%202025%20Progress%20Report_tcm1221-725125.pdf',
};

export const interstateProviderEvidence: ProviderEvidence[] = [
  ...minnesotaGrants.flatMap((grant): ProviderEvidence[] => grant.registryKey && grant.registryName ? [{
    registryKey: grant.registryKey, registryName: grant.registryName,
    funding: [{ title: 'Ambulance Operating Deficit Grant', status: 'Awarded', fiscalYear: 2026,
      amount: grant.amount, basis: grant.purpose + '. The state reported $0 spent as of its February progress report.', source: minnesotaGrantSource }],
  }] : []),
  {
    registryKey: 'FDID:MA:15087', registryName: 'Easthampton Fire Department',
    funding: [{ title: 'FEMA grant for EMS cardiac monitors', status: 'Awarded', amount: 200000,
      basis: 'The department announced federal funding to purchase cardiac monitors.',
      source: { label: 'City of Easthampton grant announcement', date: '2026-09-29', url: 'https://www.easthamptonma.gov/m/newsflash/home/detail/718' } }],
  },
  {
    registryKey: 'FDID:IA:77003', registryName: 'Ankeny Fire Department', combinedServices: true,
    billing: [3990873, 4176358, 4479471].map((value, index): DepartmentMetric => ({
      label: 'Billed for ambulance services', value, format: 'currency', reportingPeriod: String(2021 + index), source: ankenySource,
    })),
    payerMix: ankenyPayers.flatMap(([label, ...values]) => values.map((value, index): DepartmentMetric => ({
      label, value, format: 'percent', reportingPeriod: String(2021 + index), source: ankenySource,
      context: 'City’s published billing payer mix. Values are preserved as reported.',
    }))),
  },
  {
    registryKey: 'FDID:GA:04801', registryName: 'Douglas County Fire Department', combinedServices: true,
    billing: [
      { label: 'EMS claims processed', value: 10896, reportingPeriod: 'FY2020', source: douglasSource },
      { label: 'EMS collections', value: 2473606.26, format: 'currency', reportingPeriod: 'FY2020', source: douglasSource },
    ],
    payerMix: ([['Medicare', 23.88], ['Medicaid', 16.15], ['Commercial insurance', 5.81], ['Private pay', 22.21]] as const)
      .map(([label, value]) => ({
        label, value, format: 'percent', reportingPeriod: 'FY2020', source: douglasSource,
        context: 'The four published categories do not account for the full payer mix. The solicitation does not specify the denominator.',
      })),
  },
  {
    registryKey: 'FDID:RI:03500', registryName: 'Warwick Fire Department',
    equipment: [
      { category: 'aed', manufacturer: 'Stryker', model: 'LIFEPAK 1000', status: 'In service reported',
        details: 'The fire department reports this model in use in its May 2025 procurement memo. No inventory count was stated.', source: warwickSource },
      { category: 'aed', manufacturer: 'Stryker', model: 'LIFEPAK 1000', supplier: 'Stryker Sales Corporation', quantity: 2,
        status: 'Proposed purchase', deployment: 'Frontline fire apparatus',
        details: 'The request contains a $6,018.98 spending limit for two additional AEDs under Rhode Island MPA-370.', source: warwickSource },
    ],
  },
  {
    registryKey: 'NPI:1457336489', registryName: 'COUNTY OF OURAY',
    equipment: [
      { category: 'monitor', manufacturer: 'Stryker', model: 'LIFEPAK 15', status: 'In service reported',
        deployment: 'Primary ambulances', details: 'The May 2026 county announcement records this model in use on the primary ambulances at the time.',
        source: ouraySource },
      { category: 'monitor', manufacturer: 'Stryker', model: 'LIFEPAK 35', quantity: 3, status: 'Proposed purchase',
        details: 'The county identifies these units in its grant-funded acquisition plan.', source: ouraySource },
      { category: 'cpr', manufacturer: 'Stryker', model: 'LUCAS', quantity: 2, status: 'Proposed purchase',
        details: 'The county identifies these devices in its grant-funded acquisition plan.', source: ouraySource },
    ],
    funding: [{ title: 'Colorado Emergency Medical and Trauma Services Provider Grant', status: 'Awarded',
      basis: 'The county announced grant funding for three LIFEPAK 35 monitors and two LUCAS devices. Amount and completion date were not published.',
      source: ouraySource }],
  },
];
