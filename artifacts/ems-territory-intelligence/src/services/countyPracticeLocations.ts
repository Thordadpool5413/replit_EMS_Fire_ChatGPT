import type { ProviderProfileRef } from '../navigation/providerProfileUrl';

export type CountyPracticeLocation = {
  key: string;
  record: ProviderProfileRef;
  name: string;
  npi: string;
  address: string;
  city: string;
  reportingPeriod: string;
  countyBasis?: 'Census street-range match' | 'Census 2020 ZIP area';
};

export async function loadCountyPracticeLocations(state: string) {
  if (!/^[A-Z]{2}$/.test(state)) throw Error('Invalid state');
  const response = await fetch((import.meta.env?.BASE_URL ?? '/') + 'data/providers/practices-' + state + '.json');
  if (!response.ok) throw Error('Practice address records unavailable');
  return await response.json() as Record<string, CountyPracticeLocation[]>;
}
