import { gunzipSync, strFromU8 } from 'fflate';
import acsCountyDataUrl from './acs-county-metrics-2024.json.gz?url';
import type { AcsCountyMetricRecord } from './acsCountyRollups';

interface AcsCountyDataset {
  source: {
    name: string;
    vintage: string;
    reportingPeriod: string;
    releaseDate: string;
    sourceUrl: string;
    tables: {
      populationAndAge: string;
      poverty: string;
      householdIncome: string;
    };
  };
  counties: AcsCountyMetricRecord[];
}

const response = await fetch(acsCountyDataUrl);
if (!response.ok) {
  throw new Error(`Unable to load the ACS county dataset (${response.status}).`);
}
const compressedData = new Uint8Array(await response.arrayBuffer());
const jsonBytes =
  compressedData[0] === 0x1f && compressedData[1] === 0x8b
    ? gunzipSync(compressedData)
    : compressedData;
const dataset = JSON.parse(strFromU8(jsonBytes)) as AcsCountyDataset;

export const ACS_COUNTY_SOURCE = dataset.source;
export const ACS_COUNTY_METRICS: readonly AcsCountyMetricRecord[] = dataset.counties;
export const ACS_COUNTY_METRICS_BY_FIPS = new Map(
  dataset.counties.map((row) => [row.countyFips, row] as const),
);
