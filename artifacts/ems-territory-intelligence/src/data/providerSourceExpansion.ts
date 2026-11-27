import type { ProviderEvidence, ProviderEvidenceSource, ProviderStation } from './providerProfileEvidence';

const source = (label: string, date: string, url: string): ProviderEvidenceSource => ({ label, date, url });
const waukegan = source('City of Waukegan fire station directory', 'Accessed Nov 27, 2026', 'https://www.waukeganil.gov/m/faq?cat=24');
const miamiBeach = source('City of Miami Beach fire station directory', 'Accessed Nov 27, 2026', 'https://www.miamibeachfl.gov/city-hall/fire/fire-rescue/');
const lynnHaven = source('City of Lynn Haven station and apparatus directory', 'Accessed Nov 27, 2026', 'https://www.cityoflynnhaven.gov/569/Our-Stations');
const carver = source('Town of Carver administrator update', '2025-02', 'https://www.carverma.gov/sites/g/files/vyhlif4221/f/news/2025_february_final_rs.pdf');
const cache = source('Cache County Council budget carryover packet, PO 28957', '2022-04-26', 'https://www.cachecounty.gov/assets/meetings/countycouncil/2022/Media/04-26-2022%20MEDIA%20PACKET.pdf');
const californiaCity = source('California City paid check register, check 202400591', '2024-11-07', 'https://www.californiacity-ca.gov/CC/images/11_12_2024_AGENDA.pdf');
const fairfaxQuality = source('Fairfax County FY2025 Adopted Budget, fire and rescue performance', 'CY2023', 'https://www.fairfaxcounty.gov/budget/sites/budget/files/Assets/documents/fy2025/adopted/volume1/92.pdf');
const fairfaxBilling = source('Fairfax County FY2026 Adopted Budget, EMS transport billing performance', 'FY2026 budget', 'https://www.fairfaxcounty.gov/budget/sites/budget/files/Assets/documents/fy2026/adopted/pm/92_pm.pdf');
const lafayette = source('Lafayette Fire Department annual report', 'CY2025', 'https://www.lafayetteco.gov/DocumentCenter/View/46439/2025-Annual-Report-v33?bidId=');

function directStations(name: string, jurisdiction: string, rows: [string, string, string][], citation: ProviderEvidenceSource): ProviderStation[] {
  return rows.map(([number, street, phone]) => ({
    number, name, address: street + ', ' + jurisdiction, category: 'Department',
    contact: { role: 'Published station phone', phone, source: citation },
  }));
}

export const expandedProviderRecords: ProviderEvidence[] = [
  {
    registryKey: 'FDID:IL:LA401', registryName: 'Waukegan Fire Department', combinedServices: true,
    stationDirectory: {
      source: waukegan,
      stations: directStations('Waukegan Fire Department', 'Waukegan, IL', [
        ['1', '1101 Belvidere Road', '847-249-5410'],
        ['2', '4505 McGaw Road', '847-599-2964'],
        ['3', '216 N. Lewis Avenue', '847-599-2684'],
        ['4', '825 Golf Road', '847-599-2681'],
        ['5', '3221 N. Green Bay Road', '847-596-5490'],
      ], waukegan),
    },
  },
  {
    registryKey: 'FDID:FL:01012', registryName: 'Miami Beach Fire Department', combinedServices: true,
    stationDirectory: {
      source: miamiBeach,
      stations: directStations('Miami Beach Fire Department', 'Miami Beach, FL', [
        ['1', '1051 Jefferson Avenue', '305-673-7135'],
        ['2', '2300 Pine Tree Drive', '305-673-7171'],
        ['3', '5303 Collins Avenue', '305-673-7179'],
        ['4', '6880 Indian Creek Drive', '305-673-7136'],
      ], miamiBeach),
    },
  },
  {
    registryKey: 'FDID:FL:23022', registryName: 'Lynn Haven Fire & Emergency Services',
    stationDirectory: {
      source: lynnHaven,
      visitContact: { role: 'Department line listed for both stations', phone: '850-265-7335', source: lynnHaven },
      stations: [
        { number: '1', name: 'Fire Administration', address: '1412 Pennsylvania Avenue, Lynn Haven, FL 32444', category: 'Department',
          apparatus: '2025 Sutphen engine, 2020 Rosenbauer aerial, 2015 Ford F450 rescue vehicle, 2023 Chevrolet battalion chief vehicle' },
        { number: '2', name: 'Lynn Haven Fire & Emergency Services', address: '1200 Mosley Drive, Lynn Haven, FL 32444', category: 'Department' },
      ],
    },
  },
  {
    registryKey: 'FDID:MA:23052', registryName: 'Carver Fire Department',
    equipment: [{
      category: 'aed', model: 'LIFEPAK 1000', manufacturer: 'Physio-Control / Stryker', quantity: 4,
      status: 'Documented historically', deployment: 'Fire department allocation', acquiredOn: '2024-01-24',
      details: 'The town reported distributing four of eleven acquired LIFEPAK 1000 AEDs to the fire department on this date. The remaining LIFEPAK 1000 units were allocated to police and EMS.',
      source: carver,
    }],
    funding: [{
      title: 'Townwide public safety AED project', status: 'Reported expenditure', amount: 43657.42,
      basis: 'Opiate settlement funds. Amount covers the full town project including other departments and a separate public-access AED.',
      source: carver,
    }],
  },
  {
    registryKey: 'FDID:UT:05002', registryName: 'Cache County Fire District',
    equipment: [{
      category: 'aed', manufacturer: 'ZOLL', model: 'AED Plus', supplier: 'ZOLL Medical',
      lastPurchasedOn: '2022', status: 'Purchase documented',
      details: 'County budget records state that the Fire purchase order was placed in 2021 and the AED was received and paid for in 2022. The source specifies the year.',
      source: cache,
    }],
  },
  {
    registryKey: 'FDID:CA:15065', registryName: 'California City Fire Department', combinedServices: true,
    equipment: [{
      category: 'aed', manufacturer: 'ZOLL', model: 'AED Pro', supplier: 'ZOLL Medical Corporation',
      paidOn: '2024-11-07', status: 'Purchase documented',
      details: 'City EMS medical account lists the AED Pro and pads on paid invoice 4070072, dated October 18, 2024. The source gives the check date and combined amount.',
      source: californiaCity,
    }],
    funding: [{
      title: 'AED Pro and accessories payment', amount: 3592.87, status: 'Reported expenditure',
      basis: 'Check 202400591 includes the AED Pro and related supplies.', purchasingVehicle: 'Invoice 4070072', source: californiaCity,
    }],
  },
  {
    registryKey: 'FDID:VA:05900', registryName: 'Fairfax County Fire and Rescue Department', combinedServices: true,
    quality: [
      { label: 'Cardiac arrest resuscitation attempts', value: 605, reportingPeriod: 'CY2023', source: fairfaxQuality },
      { label: 'Utstein survival to hospital discharge', value: 45.9, format: 'percent', reportingPeriod: 'CY2023',
        context: '28 of 61 patients in the reported Utstein cohort. All 28 survivors had CPC 1 or 2 at discharge.', source: fairfaxQuality },
      { label: 'Sustained return of spontaneous circulation', value: 35, reportingPeriod: 'CY2023',
        context: 'Count among the 61 patients in the reported Utstein cohort.', source: fairfaxQuality },
    ],
    billing: [
      { label: 'Actual transport revenue billing', value: 23000000, format: 'currency', reportingPeriod: 'FY2023', context: 'Department program figure. Payer split unpublished.', source: fairfaxBilling },
      { label: 'Actual transport revenue billing', value: 16500000, format: 'currency', reportingPeriod: 'FY2024', context: 'Department program figure. Payer split unpublished.', source: fairfaxBilling },
      { label: 'Transport bills processed', value: 59334, reportingPeriod: 'FY2023', source: fairfaxBilling },
      { label: 'Transport bills processed', value: 43011, reportingPeriod: 'FY2024', source: fairfaxBilling },
    ],
  },
  {
    registryKey: 'FDID:CO:01354', registryName: 'Lafayette Fire Department', combinedServices: true,
    quality: [{
      label: 'Cardiac arrest survival to hospital discharge', value: 31, format: 'percent', reportingPeriod: 'CY2025',
      context: 'Reported for cardiac arrest patients treated and transported by Lafayette Fire. The report gives the rate without a case count.', source: lafayette,
    }],
    operations: [{
      label: 'EMS share of total department responses', value: 71, format: 'percent', reportingPeriod: 'CY2025', source: lafayette,
    }],
  },
];
