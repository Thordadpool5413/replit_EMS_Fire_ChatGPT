import type { ProviderEvidence } from './providerProfileEvidence';

const aedAward = {
  label: 'NYC City Record · FDNY EMS Technical Services · PIN 05726W0030001',
  date: '2025-12-26',
  url: 'https://a856-cityrecord.nyc.gov/RequestDetail/20251218027',
};
const zollAward = {
  label: 'NYC City Record · FDNY · PIN 05726S0005001',
  date: '2026-06-16',
  url: 'https://a856-cityrecord.nyc.gov/RequestDetail/20260610056',
};
const strykerAward = {
  label: 'NYC City Record · DCAS award for FDNY · PIN 85726B0014001',
  date: '2026-10-15',
  url: 'https://a856-cityrecord.nyc.gov/RequestDetail/20261008007',
};
const fleetNotice = {
  label: 'NYC City Record · FDNY Fleet Maintenance · PIN 05727Y0677',
  date: '2026-11-19',
  url: 'https://a856-cityrecord.nyc.gov/RequestDetail/20261112022',
};

export const nycFireProcurement = {
  equipment: [
    {
      category: 'aed', manufacturer: 'Stryker / Physio-Control', model: 'LIFEPAK CR2',
      supplier: 'Wingglee, LLC', quantity: 66, status: 'Purchase documented',
      deployment: 'Ordered by FDNY EMS Technical Services',
      details: 'The published award identifies 66 bundles ordered, part 99512-001261. The exact order, delivery and payment dates and the number currently in service were not published in this notice.',
      source: aedAward,
    },
    {
      category: 'ventilator', manufacturer: 'ZOLL', supplier: 'ZOLL Medical Corporation',
      status: 'Service agreement', deployment: 'FDNY Rescue Paramedics',
      details: 'The published sole-source award covers repairs for the existing portable ventilator fleet. The notice gives approximately 731 as the numeric inventory figure at the time and does not specify a model or acquisition date.',
      source: zollAward,
    },
  ],
  funding: [
    {
      title: 'Brand-specific Stryker equipment catalog contract',
      status: 'Awarded', amount: 76561530, purchasingVehicle: '85726B0014001',
      basis: 'DCAS names FDNY as sponsor and Howmedica Osteonics Corp as the vendor. The published amount is for a five-year requirements contract with a possible one-year renewal. Individual orders and payments are unspecified.',
      source: strykerAward,
    },
    {
      title: 'LIFEPAK CR2 AED bundle order', status: 'Awarded', amount: 122991, purchasingVehicle: '05726W0030001',
      basis: 'The published amount covers 66 AED bundles awarded to Wingglee, LLC.',
      source: aedAward,
    },
    {
      title: 'ZOLL portable ventilator repair agreement', status: 'Awarded', amount: 43355, purchasingVehicle: '05726S0005001',
      basis: 'The award names ZOLL Medical Corporation as the sole-source service provider.',
      source: zollAward,
    },
    {
      title: 'First aid kits, AEDs and replenishment service', status: 'Requested', purchasingVehicle: '05727Y0677',
      basis: 'FDNY Fleet Maintenance published an intent to negotiate with RediCare LLC for supplies and monthly inventory service. The notice records a November 30, 2026, 2:00 p.m. local response deadline.',
      source: fleetNotice,
    },
  ],
} satisfies Pick<ProviderEvidence, 'equipment' | 'funding'>;
