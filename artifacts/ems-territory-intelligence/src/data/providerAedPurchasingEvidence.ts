import type { ProviderEvidence } from './providerProfileEvidence';

const bothell = { label: 'Bothell City Council agenda bill 26-012', date: '2026-02-03',
  url: 'https://www.bothellwa.gov/AgendaCenter/ViewFile/Agenda/_02032026-1258' };
const odessa = { label: 'Odessa City Council approved resolution 2025R-40', date: '2025-04-08',
  url: 'https://www.odessa-tx.gov/AgendaCenter/ViewFile/Minutes/_04082025-822' };
const mesa = { label: 'Mesa City Council approved item 4-c', date: '2025-03-17',
  url: 'https://apps.mesaaz.gov/meetingarchive/ArchiveDocuments/ClerkDetailedMinutes/March%2017%2C%202025%20RGL.pdf' };
const kingston = { label: 'City of Kingston grant announcement', date: '2025-02-11',
  url: 'https://kingstontn.gov/firehouse-subs-grant-to-increase-lifesaving-capabilities/' };

export const municipalAedPurchases: ProviderEvidence[] = [
  {
    registryKey: 'FDID:WA:17M04', registryName: 'City of Bothell Fire Department', combinedServices: true,
    equipment: [
      { category: 'aed', manufacturer: 'Philips', model: 'HeartStart FR3', quantity: 11, lastPurchasedOn: '2014',
        status: 'Purchase documented', details: 'Council purchase history identifies the 2014 AED purchase.', source: bothell },
      { category: 'monitor', manufacturer: 'Stryker', model: 'LIFEPAK 15', supplier: 'Stryker Sales, LLC',
        quantity: 11, status: 'Purchase documented', lastPurchasedOn: 'September 2025',
        details: 'Fire administration signed a purchase order. The later council packet describes a $184,013.10 contract. The exact order day and delivery are unstated.', source: bothell },
    ],
  },
  {
    registryKey: 'FDID:TX:DZ704', registryName: 'Odessa Fire Department', combinedServices: true,
    equipment: [
      { category: 'aed', quantity: 13, status: 'Purchase approved', approvedOn: '2025-04-08',
        deployment: 'Ambulance and fire truck equipment replacement',
        details: 'Council approved a $431,680.80 package with 11 ZOLL monitors and 13 AEDs. The minutes do not separately name the AED make or model.', source: odessa },
      { category: 'monitor', manufacturer: 'ZOLL', quantity: 11, status: 'Purchase approved', approvedOn: '2025-04-08',
        details: 'Council approved these monitors as part of the AED and monitor replacement package.', source: odessa },
    ],
  },
  {
    registryKey: 'FDID:AZ:08183', registryName: 'Mesa Fire and Medical Department', combinedServices: true,
    equipment: [
      { category: 'aed', supplier: 'ZOLL Medical Corporation', status: 'Purchase approved', approvedOn: '2025-03-17',
        deployment: 'City-building AED program',
        details: 'Approved three-year equipment and service contract with two renewal options. Contract includes AEDs, monitors, ventilators and accessories.', source: mesa },
      { category: 'monitor', manufacturer: 'ZOLL', model: 'X Series Advanced', supplier: 'ZOLL Medical Corporation',
        status: 'Purchase approved', approvedOn: '2025-03-17', details: 'Approved contract includes additional heart monitors and continued support.', source: mesa },
    ],
  },
  {
    registryKey: 'FDID:TN:73133', registryName: 'City of Kingston Fire Department',
    equipment: [{ category: 'aed', manufacturer: 'ZOLL', quantity: 6,
      status: 'Proposed purchase', details: 'The grant announcement identifies six planned AED purchases and related pads and accessories.', source: kingston }],
    funding: [{ title: 'Firehouse Subs Public Safety Foundation grant', amount: 11412, status: 'Awarded', fiscalYear: 2025,
      basis: 'Grant for six AEDs and associated adult and pediatric pads and accessories.', source: kingston }],
  },
];
