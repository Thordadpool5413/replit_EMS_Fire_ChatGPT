import type { DepartmentMetric, ProviderEvidence, ProviderEvidenceSource } from './providerProfileEvidence';

const naperville = {
  label: 'Naperville City Council fire billing report 26-0613', date: '2026-05-19',
  url: 'https://naperville.legistar.com/ViewReport.ashx?Extra=WithText&GID=682&GUID=D35006D7-4748-4CE3-ACFD-6D42B9E6275F&ID=8027168&M=R&N=Master&Title=Legislation+Details+%28With+Text%29',
};
const alameda = {
  label: 'Alameda Fire Department standards-of-cover study, figure 81', date: 'CY2022',
  url: 'https://www.alamedaca.gov/files/sharedassets/public/v/1/fire/fire/annual-reports/alameda-crasocstudy-final.pdf',
};
const stCharles = {
  label: 'City of Saint Charles ambulance billing RFP 4747, addendum 1', date: '2024',
  url: 'https://stcharlescitymo.gov/DocumentCenter/View/13250/4747-Addendum-1?bidId=',
};

const columbus = {
  label: 'Columbus Consolidated Government RFP 24-0004, section II', date: 'FY2023',
  url: 'https://www.columbusga.gov/Portals/finance/bid-opportunities-resources/rfp24-0004.pdf',
};
const jasper = {
  label: 'Jasper County ambulance billing RFP 2024-22, addendum 1', date: '2024',
  url: 'https://www.jaspercountysc.gov/media/jyafnc1i/bid-notice-addendum-1-rfp-ambulance-billing.pdf',
};
const wilbraham = {
  label: 'Wilbraham ambulance billing RFP, addendum 1', date: '2025-06-27',
  url: 'https://www.wilbraham-ma.gov/DocumentCenter/View/6650/Ambulance-Billing-Addendum-1-062725',
};
const cencal = {
  label: 'CenCal Fire and EMS Authority RFP 25-01, table 1', date: '2025-07-21',
  url: 'https://cencal.specialdistrict.org/files/e3717080f/CENCAL%2BRFP%2BPacket%2B25-01%2B-%2BAmbulance%2BBilling.pdf',
};

const chesapeake = {
  label: 'City of Chesapeake EMS Billing Program Performance Audit, finding 5d', date: 'FY2023 audit',
  url: 'https://www.cityofchesapeake.net/DocumentCenter/View/12025/EMS-Audit-Report---133-PDF',
};

function payerShares(
  rows: [string, number][], reportingPeriod: string, source: ProviderEvidenceSource, context: string,
): DepartmentMetric[] {
  return rows.map(([label, value]) => ({ label, value, format: 'percent', reportingPeriod, source, context }));
}

export const municipalBillingRecords: ProviderEvidence[] = [
  {
    registryKey: 'FDID:VA:55000', registryName: 'Chesapeake Fire Department', combinedServices: true,
    billingDenials: [
      { label: 'Denied claims in city audit', value: 7022, reportingPeriod: 'Snapshot on May 6, 2022', source: chesapeake,
        context: 'City EMS billing audit snapshot. The finding does not provide an adjudicated denominator or payer-specific count.' },
      { label: 'Outstanding denied charges', value: 889717, format: 'currency',
        reportingPeriod: 'Snapshot on May 6, 2022', source: chesapeake },
    ],
  },
  {
    registryKey: 'FDID:IL:DD132', registryName: 'Naperville Fire Department', combinedServices: true,
    billing: [
      ...[[2023, 7583795], [2024, 8060713], [2025, 6365279]].map(([year, value]) => ({
        label: 'Annual revenue reported by Fire Department', value, format: 'currency' as const,
        reportingPeriod: String(year), source: naperville,
      })),
      { label: 'Billed across all payers', value: 862408, format: 'currency', reportingPeriod: '2026 in-house pilot',
        context: 'Pilot handled about 20% of billable EMS calls. Amount is billed.', source: naperville },
      { label: 'EMS billing revenue collected', value: 463165, format: 'currency', reportingPeriod: '2026 in-house pilot',
        context: 'Published pilot collections for EMS billing.', source: naperville },
    ],
    billingDenials: [
      { label: 'Claims administered', value: 316, reportingPeriod: '2026 in-house pilot', source: naperville },
      { label: 'Claims with initial denial', value: 47, reportingPeriod: '2026 in-house pilot',
        context: '47 of 316 administered claims in the reported pilot. No Medicare-specific breakdown was published.', source: naperville },
      { label: 'Claims denied after intervention', value: 0, reportingPeriod: '2026 in-house pilot',
        context: 'Reported after intervention in the pilot. Department-wide counts are not stated by this figure.', source: naperville },
    ],
  },
  {
    registryKey: 'FDID:CA:01005', registryName: 'City of Alameda Fire Department', combinedServices: true,
    billing: [
      { label: 'Transport gross charges', value: 13371490, format: 'currency', reportingPeriod: 'CY2022', source: alameda },
      { label: 'Transport payments', value: 3743921, format: 'currency', reportingPeriod: 'CY2022', source: alameda },
      { label: 'Transport trips', value: 4363, reportingPeriod: 'CY2022', source: alameda },
    ],
    payerMix: payerShares([['Medicare', 55], ['Medicaid', 24], ['Insurance', 16], ['Bill patient', 5]], 'CY2022', alameda,
      'Share of transport trips in Figure 81.'),
  },
  {
    registryKey: 'FDID:MO:09203', registryName: 'City of Saint Charles Fire Department', combinedServices: true,
    payerMix: [
      ...payerShares([['Medicare', 21.2], ['Medicaid', 7.8], ['Commercial insurance', 56.7], ['Self-pay', 13.8]],
        '2022', stCharles, 'Share of billed charges as reported in the RFP addendum. Only four payer groups were published.'),
      ...payerShares([['Medicare', 20.5], ['Medicaid', 6.2], ['Commercial insurance', 60.7], ['Self-pay', 12.2]],
        '2023', stCharles, 'Share of billed charges as reported in the RFP addendum. Only four payer groups were published.'),
    ],
  },
  {
    registryKey: 'FDID:GA:10601', registryName: 'Columbus Department of Fire and EMS', combinedServices: true,
    billing: [
      { label: 'Claims processed', value: 9886, reportingPeriod: 'FY2023', source: columbus },
      { label: 'Collections', value: 2803418.90, format: 'currency', reportingPeriod: 'FY2023', source: columbus },
    ],
    payerMix: payerShares([['Medicare', 53.86], ['Medicaid', 20.71], ['Primary', 19.91], ['Private pay', 5.52]],
      'FY2023', columbus, 'Payer labels and percentages as published. The table does not explicitly state its denominator.'),
  },
  {
    registryKey: 'FDID:SC:27203', registryName: 'Jasper County Fire & Rescue', combinedServices: true,
    payerMix: payerShares([['Medicare', 26], ['Medicaid', 15], ['Commercial insurance', 10], ['Self-pay', 49]],
      'Two recent years reported in the 2024 RFP', jasper, 'Share of billed charges. The answer gives one set of percentages and does not specify the year boundaries.'),
  },
  {
    registryKey: 'FDID:MA:13339', registryName: 'Wilbraham Fire Department', combinedServices: true,
    payerMix: payerShares([['Com Electronic', 40], ['Commercial', 7], ['DPA Electronic', 3], ['MDC Electronic', 46], ['Patient', 4]],
      'As published June 2025', wilbraham, 'Payer remit mix. The separate billed category percentages total 137% in the source and require clarification.'),
  },
  {
    registryKey: 'NPI:1184586828', registryName: 'CENCAL FIRE AND EMS AUTHORITY',
    billing: [{ label: 'Total payer records', value: 69853, reportingPeriod: '2024, Zones X & Y', source: cencal }],
    payerMix: payerShares([
      ['Medicare', 20], ['Medicare HMO', 12], ["Contracted government Medicare HMO", 9],
      ['Medicaid', 3], ['Medicaid HMO', 28], ['Contracted government Medicaid HMO', 1],
      ['Non-contracted insurance & HMO', 8], ['Facility / institution contract', 3], ['Contracted insurance & HMO', 2],
      ['Veterans Administration', 0], ['Private pay', 12],
    ], '2024, Zones X & Y', cencal, 'Rounded percentages as printed in the authority’s RFP. The Veterans Administration row also reports 284 records.'),
  },
];
