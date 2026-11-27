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

function payerShares(
  rows: [string, number][], reportingPeriod: string, source: ProviderEvidenceSource, context: string,
): DepartmentMetric[] {
  return rows.map(([label, value]) => ({ label, value, format: 'percent', reportingPeriod, source, context }));
}

export const municipalBillingRecords: ProviderEvidence[] = [
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
];
