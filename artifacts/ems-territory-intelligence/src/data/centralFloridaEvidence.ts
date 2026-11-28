import type { ProviderEvidence } from './providerProfileEvidence';

const osceolaCapitalPlan = {
  label: 'Osceola County FY2027–31 capital improvement plan, resolution 26-145R',
  date: 'FY2027–31 plan',
  url: 'https://www.osceola.org/files/assets/county/v/3/government/budget-and-financial/budget-documents/2027/resolution-26-145r-fy27-31-cip_accessible.pdf',
};
const brevardBilling = {
  label: 'Brevard County Fire Rescue finance and administrative services',
  date: 'Retrieved November 27, 2026',
  url: 'https://www.brevardfl.gov/FireRescue/FinanceAndAdministrativeServices',
};
const brevardBudget = {
  label: 'Brevard County FY2026–27 proposed budget, Fire Rescue EMS actuals',
  date: 'FY2024–25 actual',
  url: 'https://www.brevardfl.gov/docs/default-source/budget/fy-2026-2027/fiscal-year-2026-27-proposed-budget.pdf',
};
const brevardPerformance = {
  ...brevardBudget,
  label: 'Brevard County FY2026–27 proposed budget, Fire Rescue performance measures, p. 97',
};
const brevardPriorPerformance = {
  label: 'Brevard County FY2025–26 adopted budget, Fire Rescue performance measures, p. 167',
  date: 'FY2023–24 actual',
  url: 'https://www.brevardfl.gov/docs/default-source/budget/fy-2025-2026/fiscal-year-2025-2026-adopted-budget.pdf',
};
const brevardStrykerApproval = {
  label: 'Brevard County commissioners, approved file 7981',
  date: '2025-05-20',
  url: 'https://brevardfl.legistar.com/LegislationDetail.aspx?GUID=9F254495-784C-45CB-99E8-095777FDD297&ID=7398381',
};
const brevardLucasRequest = {
  label: 'Brevard County FY2018–19 adopted Fire Rescue budget',
  date: 'FY2018–19',
  url: 'https://www.brevardfl.gov/docs/default-source/budget/fy-2018-2019/departments-2019/2018-2019-fire-rescue-department-adopted.pdf',
};
const melbourneBeachAeds = {
  label: 'Town of Melbourne Beach · The Beachcomber, p. 26',
  date: '2020-10-12',
  url: 'https://fliphtml5.com/bhgkk/zbdi/Beachcomber,_October_2020/26/',
};
const brevardService = {
  label: 'Brevard County commissioners, file 2074',
  date: '2020-09-15',
  url: 'https://brevardfl.legistar.com/LegislationDetail.aspx?GUID=A2860721-29E9-43E2-AAE0-0A3F770060B6&ID=4637207&Options=&Search=',
};
const malabarQuote = {
  label: 'Malabar Town Council item 4.c and Stryker quote 10247281',
  date: '2022-04-18',
  url: 'https://www.townofmalabar.org/sites/g/files/vyhlif4656/f/agendas/4.18_rtcm_agenda.pdf',
};
const malabarExpenditure = {
  label: 'Malabar Town Council packet, project 22-07',
  date: '2023-02-06',
  url: 'https://www.townofmalabar.org/sites/g/files/vyhlif4656/f/agendas/rtcm_2.6_agenda_0.pdf',
};
const palmBayGrant = {
  label: 'Brevard County grant award letter to Palm Bay Fire',
  date: '2021-04-05',
  url: 'https://swagit-attachments.granicus.com/uploads/video/agenda_file/120534/5-6_PalmBayCC.pdf',
};

export const centralFloridaEvidence: ProviderEvidence[] = [
  {
    registryKey: 'FDID:FL:26032', registryName: 'Osceola County Department of Fire Rescue and EMS', combinedServices: true,
    funding: [{
      title: 'LIFEPAK cardiac monitors, FY2029 capital plan', amount: 4995329, status: 'Approved', fiscalYear: 2029,
      basis: 'The adopted FY2027–31 capital improvement plan shows project 2123 under countywide Fire Capital Fund 331. The projected amount is in FY2029. The plan does not identify a specific model, unit count, purchase order, or payment.',
      source: osceolaCapitalPlan,
    }],
  },
  {
    registryKey: 'FDID:FL:19182', registryName: 'Brevard County Fire Rescue', combinedServices: true,
    equipment: [
      { category: 'monitor', manufacturer: 'Stryker', model: 'LIFEPAK 15', status: 'Documented historically',
        details: 'Malabar Fire’s April 2022 staff report identifies LIFEPAK 15 as the preferred monitor used by Brevard County Fire Rescue transport units and reports county use since 2016. Current counts and ownership are not stated.', source: malabarQuote },
      { category: 'monitor', manufacturer: 'Stryker', supplier: 'Stryker Sales Corporation', approvedOn: '2020-09-15',
        serviceEnds: '2020-12-31', status: 'Service agreement',
        details: 'County commissioners approved a three-month extension of technical service and support for the department’s LIFEPAK monitors.', source: brevardService },
      { category: 'cpr', model: 'LUCAS', quantity: 53, status: 'Proposed purchase',
        details: 'Historic grant application requested funding for 53 devices. The budget does not establish that they were awarded or purchased.', source: brevardLucasRequest },
    ],
    funding: [
      {
        title: 'Stryker stretcher and power-load systems', status: 'Approved', amount: 397667.78,
        basis: 'County commissioners approved six Stryker power-load systems and six stretchers for Fire Rescue. The approval does not give a delivery or payment date.',
        source: brevardStrykerApproval,
      },
      {
        title: 'Assistance to Firefighters Grant application for 53 LUCAS devices', status: 'Requested',
        basis: 'The adopted budget describes an application for mechanical CPR devices. An award amount is not reported here.',
        source: brevardLucasRequest,
      },
    ],
    operations: [
      { label: 'EMS transports', value: 52830, reportingPeriod: 'FY2024–25', source: brevardPerformance },
      { label: 'Calls with emergency response', value: 102409, reportingPeriod: 'FY2024–25', source: brevardPerformance },
      { label: 'EMS emergency responses excluding cancelled calls', value: 78114, reportingPeriod: 'FY2024–25', source: brevardPerformance },
      { label: 'EMS transports', value: 52807, reportingPeriod: 'FY2023–24', source: brevardPriorPerformance },
      { label: 'Calls with emergency response', value: 96114, reportingPeriod: 'FY2023–24', source: brevardPriorPerformance },
    ],
    quality: [
      {
        label: 'Cardiac arrest patients achieving return of spontaneous circulation (ROSC)',
        value: 173, reportingPeriod: 'FY2024–25', source: brevardPerformance,
        context: 'Department-reported count. The budget table gives no denominator or survival-to-discharge outcome.',
      },
      {
        label: 'Cardiac arrest patients achieving return of spontaneous circulation (ROSC)',
        value: 285, reportingPeriod: 'FY2023–24', source: brevardPriorPerformance,
        context: 'Department-reported count. The budget table gives no denominator or survival-to-discharge outcome.',
      },
    ],
    billing: [{
      label: 'EMS charges-for-services revenue', value: 24149375, format: 'currency', reportingPeriod: 'FY2024–25',
      context: 'Actual column in the FY2026–27 proposed budget. EMS program revenue category, with no payer-level breakdown.',
      source: brevardBudget,
    }],
    accountContext: [{
      area: 'Capital planning', title: 'Ambulance billing vendor',
      detail: 'The department’s finance page identifies EMS Management and Consultants (EMS|MC) as its third-party EMS billing vendor.',
      source: brevardBilling,
    }],
  },
  {
    registryKey: 'FDID:FL:19112', registryName: 'Melbourne Beach Volunteer Fire Department',
    equipment: [{
      category: 'aed', brand: 'LIFEPAK', quantity: 4, status: 'Documented historically',
      deployment: 'The department reported placing an AED on every apparatus at the time.',
      details: 'The town newsletter reported that four new LIFEPAK-brand AEDs were acquired through the Brevard County Fire Rescue EMS grant. The exact model, vendor, payment date and current count are not reported there.',
      source: melbourneBeachAeds,
    }],
    funding: [{
      title: 'Four apparatus AEDs through the Brevard County Fire Rescue EMS Grant',
      status: 'Awarded', fiscalYear: 2020,
      basis: 'The town newsletter identifies the county and Florida EMS grant as the funding source. It does not state the amount.',
      source: melbourneBeachAeds,
    }],
  },
  {
    registryKey: 'FDID:FL:19111', registryName: 'Malabar Fire Department',
    equipment: [{
      category: 'monitor', manufacturer: 'Stryker', model: 'LIFEPAK 15 V4', supplier: 'Stryker Medical', quantity: 1,
      status: 'Purchase documented',
      details: 'The April 2022 packet identifies one monitor in the quoted package. Malabar’s February 2023 report lists the associated project at 100% and reports $38,412.94 expended. The exact purchase or payment date is not specified.',
      source: malabarQuote,
    }],
    funding: [{
      title: 'LIFEPAK 15 project expenditure', status: 'Reported expenditure', amount: 38412.94,
      basis: 'Project 22-07 shows the full amount expended in the February 2023 report. The procurement packet identifies State and Local Fiscal Recovery Funds.',
      source: malabarExpenditure,
    }],
  },
  {
    registryKey: 'FDID:FL:19042', registryName: 'Palm Bay Fire Rescue',
    equipment: [{
      category: 'monitor', model: 'LIFEPAK 15', manufacturer: 'Stryker', quantity: 1, status: 'Proposed purchase',
      details: 'Brevard County’s grant letter identifies a single LIFEPAK 15 system intended for Palm Bay and requires proof of purchase for reimbursement.', source: palmBayGrant,
    }],
    funding: [{
      title: 'Brevard County LIFEPAK 15 grant award', status: 'Awarded', amount: 21700, fiscalYear: 2021,
      basis: 'County grant letter approved 70% of Palm Bay’s $31,000 request, with reimbursement subject to documentation.',
      source: palmBayGrant,
    }],
  },
];
