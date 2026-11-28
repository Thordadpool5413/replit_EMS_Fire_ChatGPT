import type { ProviderEvidence } from './providerProfileEvidence';

const lauderhill = {
  label: 'Lauderhill City Commission · adopted resolution 24R-12-298',
  date: '2024-12-09',
  excerpt: 'TWELVE (12) LIFEPAK 35 CARDIAC MONITORS/DEFIBRILLATORS FROM STRYKER CORPORATION',
  url: 'https://lauderhill-fl.legistar.com/LegislationDetail.aspx?GUID=9E2451A9-FC61-4165-AEEE-189C4D4921AD&ID=7041862',
};
const westbrook = {
  label: 'Westbrook City Council · item 2025-9, packet page 8',
  date: '2025-01-06',
  excerpt: 'one on each rescue unit and one on Engine 3 and the other on Ladder 4',
  url: 'https://www.westbrookmaine.gov/AgendaCenter/ViewFile/ArchivedAgenda/_01062025-828#page=8',
};
const gainesville = {
  label: 'Gainesville Fire Rescue · 2024 annual report',
  date: '2024',
  excerpt: 'ROSC in Field to Emergency Dept 16/79',
  url: 'https://www.gainesvillefl.gov/files/assets/public/v/1/fire-rescue/documents/gfr-annual-report-2024.pdf',
};
const dover = {
  label: 'City of Dover · FY2026 Fire and Rescue budget presentation',
  date: 'FY2026 presentation',
  url: 'https://www.dover.nh.gov/Assets/government/open-government/budget-revealed/FY2026-documents/citycouncil-documents/FY2026%20Budget%20Presentation%2C%20Fire%20and%20Rescue.pdf',
};

const marysville = {
  label: 'Marysville Fire District · budget workshop, Ambulance Transports slide',
  date: '2025-10-30',
  url: 'https://www.marysvillefiredistrict.org/files/a2ca0dfdf/10-30-25%2BMFD%2BBudget%2BWorkshop%2BPacket.pdf',
};
export const departmentCouncilRecords: ProviderEvidence[] = [
  {
    registryKey: 'FDID:TX:AA403',
    registryName: 'Elmwood Volunteer Fire Department, Inc.',
    funding: [
      {
        title: 'Vehicle extrication cutter and spreader',
        amount: 13900,
        status: 'Awarded',
        fiscalYear: 2017,
        basis: 'Texas A&M Forest Service reports the department used the cost-share grant to replace 15-year-old rescue tools.',
        source: {
          label: 'Texas A&M Forest Service · Elmwood rescue tools grant',
          date: '2017-05-30',
          url: 'https://tfsweb.tamu.edu/elmwood-vfd-receives-grant-to-update-rescue-tools/',
        },
      },
    ],
    operations: [
      {
        label: 'Freightliner water tender added to the fleet',
        value: 1,
        reportingPeriod: '2019',
        context: 'The department took delivery of a 2019 Freightliner through a Texas A&M Forest Service cost-share grant. The current fleet count and grant amount were not reported by this source.',
        source: {
          label: 'Texas A&M Forest Service · Elmwood water tender delivery',
          date: '2019',
          url: 'https://tfsweb.tamu.edu/elmwood-volunteer-fire-department-readies-for-fire-season-with-new-tender/',
        },
      },
    ],
  },
  {
    registryKey: 'FDID:FL:10062',
    registryName: 'Lauderhill Fire-Rescue',
    equipment: [
      {
        category: 'monitor',
        model: 'LIFEPAK 35',
        manufacturer: 'Stryker',
        supplier: 'Stryker Corporation',
        quantity: 12,
        status: 'Purchase approved',
        approvedOn: '2024-12-09',
        details:
          'Commission-approved sole-source lease-purchase for the fire department with seven years of ProCare service. Service commencement and delivery dates were not specified.',
        source: lauderhill,
      },
    ],
    funding: [
      {
        title: 'Monitor lease-purchase and service ceiling',
        amount: 822594.32,
        status: 'Approved',
        purchasingVehicle: 'Resolution 24R-12-298',
        basis: 'Maximum authorized for twelve monitors and the service plan combined.',
        source: lauderhill,
      },
    ],
  },
  {
    registryKey: 'FDID:ME:C0260',
    registryName: 'Westbrook Fire & Rescue Department',
    equipment: [
      {
        category: 'monitor',
        manufacturer: 'ZOLL',
        quantity: 6,
        status: 'Documented historically',
        deployment: 'Rescue units, Engine 3 and Ladder 4',
        details:
          'The January 2025 packet reports one monitor on each rescue unit and one on each of the two named fire apparatus.',
        source: westbrook,
      },
      {
        category: 'monitor',
        manufacturer: 'ZOLL',
        supplier: 'ZOLL Medical Corporation',
        quantity: 2,
        status: 'Proposed purchase',
        details:
          'First-reading proposal for two replacement monitors with an $8,500 trade-in allowance for one replaced unit.',
        source: westbrook,
      },
    ],
    funding: [
      {
        title: 'Replacement cardiac monitors',
        amount: 87017.92,
        status: 'Requested',
        fiscalYear: 2025,
        basis:
          'Combined proposed price after the trade-in allowance, with funding identified in the FY2025 capital improvement plan.',
        source: westbrook,
      },
    ],
  },
  {
    registryKey: 'FDID:FL:11012',
    registryName: 'Gainesville Fire Rescue',
    quality: [
      {
        label: 'Field ROSC sustained to the emergency department',
        value: 20,
        format: 'percent',
        reportingPeriod: '2024',
        context: '16 of 79 cardiac arrests. The department reported 20% after rounding.',
        source: gainesville,
      },
    ],
  },
  {
    registryKey: 'FDID:WA:31M08',
    registryName: 'Marysville Fire District',
    payerMix: [
      {
        label: 'Medicare and Medicaid combined',
        value: 76,
        format: 'percent',
        context:
          'Share of ambulance transports in the workshop payer-mix chart. Sample size and measurement period unspecified.',
        source: marysville,
      },
      {
        label: 'Commercial',
        value: 19,
        format: 'percent',
        context: 'Share of transports using the district’s payer classification.',
        source: marysville,
      },
      {
        label: 'Private',
        value: 5,
        format: 'percent',
        context: 'Share of transports using the district’s payer classification.',
        source: marysville,
      },
    ],
  },
  {
    registryKey: 'FDID:NH:80230',
    registryName: 'Dover Fire & Rescue Service',
    billing: [
      {
        label: 'Ambulance revenue collection rate',
        value: 77,
        format: 'percent',
        reportingPeriod: '2024',
        context:
          'Department-reported revenue collections. The presentation does not give a payer-specific claim denial count.',
        source: dover,
      },
    ],
  },
];
