import type { ProviderEvidence } from './providerProfileEvidence';

const cambriaFinance = {
  label: 'Cambria Community Healthcare District finance report', date: '2024-09-24',
  url: 'https://cambriahealth.specialdistrict.org/files/fca6a82ca/Board%2BAgenda%2BPacket%2BSept%2B24%2C%2B2024.pdf',
};
const cambriaAsset = {
  label: 'Cambria audited financial statements, note 7', date: 'FY ended June 30, 2023',
  url: 'https://cambriahealth.specialdistrict.org/files/28c9280df/Board%2BAgenda%2BPacket%2B%2BApril%2B23%2C%2B2024.pdf',
};
const normalReport = {
  label: 'Normal Town Council staff report, item E', date: '2023-03-20',
  url: 'https://www.normalil.gov/Archive/ViewFile/Item/4597',
};
const normalVote = {
  label: 'Normal Town Council minutes, resolution 6075', date: '2023-03-20',
  url: 'https://www.normalil.gov/ArchiveCenter/ViewFile/Item/4635',
};
const muskegon = {
  label: 'Muskegon City Commission minutes, 2021-95 item D', date: '2021-10-26',
  url: 'https://www.muskegon-mi.gov/documents/view/3/3781',
};
const santeeVote = {
  label: 'Santee Council minutes, resolution 129-2025', date: '2025-10-22',
  url: 'https://www.cityofsanteeca.gov/departments/city-clerk/document-central/city-clerk/council-agendas/2025/11-12-2025-agenda-packet.pdf',
};
const santeeStaff = {
  label: 'Santee Fire staff report and cooperative purchase proposal', date: '2025-10-22',
  url: 'https://www.cityofsanteeca.gov/departments/city-clerk/document-central/city-clerk/council-agendas/2025/10-22-2025-agenda-packet.pdf',
};

export const providerDocumentRecords: ProviderEvidence[] = [
  {
    registryKey: 'NPI:1710983929', registryName: 'CAMBRIA COMMUNITY HEALTHCARE DISTRICT',
    equipment: [{ category: 'monitor', manufacturer: 'ZOLL', model: 'X Series Manual Monitor/Defibrillator', quantity: 4,
      status: 'Service agreement', details: 'The audited statements record a June 30, 2020 lease for four units. This was a right-to-use asset at June 30, 2023.',
      supplier: 'ZOLL Medical Corporation', source: cambriaAsset }],
    billing: [{ label: 'Net ambulance billing', value: 94868, format: 'currency', reportingPeriod: 'August 2024', source: cambriaFinance }],
    billingDenials: [
      { label: 'BlueCross denied claims reported', denialPayer: 'BlueCross', value: 13, reportingPeriod: 'August 2024',
        context: 'All 13 claims were corrected and resubmitted. A same-period BlueCross adjudicated denominator was not reported.', source: cambriaFinance },
      { label: 'Previously denied BlueCross claims paid', value: 6, reportingPeriod: 'As of September 15, 2024', source: cambriaFinance },
      { label: 'Previously denied BlueCross claims pending payment processing', value: 3, reportingPeriod: 'As of September 15, 2024', source: cambriaFinance },
      { label: 'Previously denied BlueCross claims in review', value: 4, reportingPeriod: 'As of September 15, 2024', source: cambriaFinance },
    ],
  },
  {
    registryKey: 'FDID:IL:MK332', registryName: 'Normal Fire Department', combinedServices: true,
    equipment: [
      { category: 'monitor', manufacturer: 'ZOLL', owner: 'Town of Normal', quantity: 7, lastPurchasedOn: '2016',
        status: 'In service reported', deployment: 'Ambulances and paramedic-staffed engines',
        details: 'The March 2023 staff report says seven cardiac monitor/defibrillators purchased in 2016 were in service at the time. Treat this as a dated inventory.', source: normalReport },
      { category: 'aed', manufacturer: 'ZOLL', status: 'In service reported', deployment: 'Other response vehicles',
        details: 'The March 2023 report describes ZOLL AEDs on other department response vehicles. It does not give their models or counts.', source: normalReport },
      { category: 'monitor', manufacturer: 'ZOLL', quantity: 8, status: 'Purchase approved', approvedOn: '2023-03-20',
        supplier: 'ZOLL Medical Corporation', details: 'Council authorized $371,256.20 for eight units under the NPP Public Safety contract.', source: normalVote },
    ],
  },
  {
    registryKey: 'FDID:MI:06110', registryName: 'City of Muskegon Fire Department',
    equipment: [
      { category: 'aed', status: 'In service reported', details: 'In the 2021 minutes, two AED models were in use. Six units had batteries the department could no longer procure. Model names and total fleet size were not stated.', source: muskegon },
      { category: 'aed', manufacturer: 'ZOLL', supplier: 'ZOLL Medical Corporation', quantity: 8, status: 'Purchase approved',
        approvedOn: '2021-10-26', details: 'The approved consent agenda authorized the $26,088 replacement purchase.', source: muskegon },
    ],
  },
  {
    registryKey: 'FDID:CA:37150', registryName: 'Santee Fire Department', combinedServices: true,
    equipment: [
      { category: 'monitor', manufacturer: 'ZOLL', status: 'In service reported',
        details: 'Fire staff described a multi-year transition to ZOLL equipment as the standard for Santee and Lakeside. The report does not give a department fleet count.', source: santeeStaff },
      { category: 'monitor', manufacturer: 'ZOLL', model: 'X Series', quantity: 1, supplier: 'ZOLL Medical Corporation',
        status: 'Purchase approved', approvedOn: '2025-10-22',
        details: 'Council adopted resolution 129-2025 for one monitor/defibrillator and related accessories, with a $52,008.86 limit in the proposal.', source: santeeVote },
    ],
  },
];
