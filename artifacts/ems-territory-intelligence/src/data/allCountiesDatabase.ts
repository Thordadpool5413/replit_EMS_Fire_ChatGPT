/* PACKED_GEO_DATA_V1 */
import type { CountyHealthRecord } from '../types';
import { gunzipSync, strFromU8 } from 'fflate';
import compressedCountyDataUrl from './all-counties-database.json.gz?url';

export interface CityBoundaryRecord {
  name: string;
  zipCode: string;
  latitude: number;
  longitude: number;
  isCountySeat: boolean;
}

export interface ComprehensiveCountyRecord extends CountyHealthRecord {
  rawName: string;
  stateFips: string;
  centroidLat: number;
  centroidLng: number;
  bbox: [number, number, number, number];
  landAreaSqMiles: number;
  cities: string[];
  cityRecords?: CityBoundaryRecord[];
}

const response = await fetch(compressedCountyDataUrl);
if (!response.ok) {
  throw new Error(`Unable to load the county dataset (${response.status})`);
}

const compressedCountyData = new Uint8Array(await response.arrayBuffer());
const countyJsonBytes =
  compressedCountyData[0] === 0x1f && compressedCountyData[1] === 0x8b
    ? gunzipSync(compressedCountyData)
    : compressedCountyData;
export const ALL_NATIONWIDE_COUNTIES: ComprehensiveCountyRecord[] = JSON.parse(
  strFromU8(countyJsonBytes)
);
