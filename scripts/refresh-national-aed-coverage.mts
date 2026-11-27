import { readFile, writeFile } from 'node:fs/promises';
import { createSourceCoverageGeography } from './lib/sourceCoverageGeography.mts';

const endpoints = [
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];
const query = '[out:json][timeout:70];area["ISO3166-1"="US"]["admin_level"="2"]->.usa;nwr["emergency"="defibrillator"]["access"!~"^(private|no)$"](area.usa);out center;';
const root = 'artifacts/ems-territory-intelligence/public';
const output = process.argv[2] ?? root + '/data/national-public-aed-coverage.json';
const rawFile = process.argv[3];

async function loadSnapshot() {
  if (rawFile) return JSON.parse(await readFile(rawFile, 'utf8'));
  for (const [index, endpoint] of endpoints.entries()) {
    try {
      const params = new URLSearchParams({ data: query });
      const response = await fetch(index === 0 ? endpoint + '?' + params : endpoint, {
        ...(index === 0 ? {} : { method: 'POST', body: params }),
        headers: { Accept: 'application/json', 'User-Agent': 'Nick EMS Fire Territory Intelligence public AED geography refresh' },
        signal: AbortSignal.timeout(85_000),
      });
      if (!response.ok) throw Error('HTTP ' + response.status);
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > 10_000_000) throw Error('Response exceeds size limit.');
      const payload = JSON.parse(new TextDecoder().decode(bytes));
      const timestamp = Date.parse(payload.osm3s?.timestamp_osm_base);
      if (payload.remark || !Array.isArray(payload.elements) || payload.elements.length < 500 ||
        !Number.isFinite(timestamp) || Date.now() - timestamp > 14 * 86_400_000) {
        throw Error('Incomplete or stale source response.');
      }
      return payload;
    } catch (error) {
      console.warn(endpoint, error instanceof Error ? error.message : 'Unavailable');
    }
  }
  throw Error('No complete recent public Overpass result. Preserve the previous snapshot.');
}

const [source, boundaries, directory, neris] = await Promise.all([
  loadSnapshot(),
  readFile(root + '/data/us-counties-boundaries.json', 'utf8').then(JSON.parse),
  readFile(root + '/registry/national/index.json', 'utf8').then(JSON.parse),
  readFile(root + '/registry/neris-stations/index.json', 'utf8').then(JSON.parse),
]);
const sourceDate = source.osm3s?.timestamp_osm_base;
const sourceTime = typeof sourceDate === 'string' ? Date.parse(sourceDate) : NaN;
if (!Array.isArray(source.elements) || source.elements.length < 500 || source.remark ||
  !Number.isFinite(sourceTime) || sourceTime > Date.now() + 86_400_000) {
  throw Error('Missing or partial nationwide AED extract.');
}
const states: string[] = [...new Set<string>(neris.chunks.map((row: { state: string }) => row.state))].sort();
if (states.length !== 51) throw Error('Incomplete state directory.');
const counties = new Map<string, string>(Object.entries(directory.countyNames));
const { countyAtPoint, prefixes } = createSourceCoverageGeography(boundaries.features, counties, states);
const byCounty: Record<string, number> = Object.fromEntries([...counties.keys()].filter(id => prefixes.has(id.slice(0, 2))).map(id => [id, 0]));
const byState: Record<string, number> = Object.fromEntries(states.map(state => [state, 0]));
const seen = new Set<string>();
let unassigned = 0;

for (const row of source.elements) {
  if (!row || !['node', 'way', 'relation'].includes(row.type) || !Number.isSafeInteger(row.id) || row.id <= 0 ||
    row.tags?.emergency !== 'defibrillator' || ['private', 'no'].includes(row.tags?.access)) continue;
  const key = row.type + ':' + row.id;
  if (seen.has(key)) continue;
  seen.add(key);
  const { lat, lon } = row.type === 'node' ? row : row.center ?? {};
  const county = Number.isFinite(lat) && Number.isFinite(lon) ? countyAtPoint([lat, lon]) : '';
  const state = prefixes.get(county.slice(0, 2));
  if (!Object.hasOwn(byCounty, county) || !state) {
    unassigned++;
    continue;
  }
  byCounty[county]++;
  byState[state]++;
}

if (seen.size < 500 || unassigned > 0.15 * seen.size) throw Error('Extract failed the geographic coverage check.');
const snapshot = { schemaVersion: 1, source: 'OpenStreetMap', sourceDate, sourceRows: seen.size, unassigned, byState, byCounty };
await writeFile(output, JSON.stringify(snapshot) + '\n');
console.log(JSON.stringify({ sourceDate, locations: seen.size, unassigned, states: states.length, counties: Object.keys(byCounty).length, countiesWithRecords: Object.values(byCounty).filter(Boolean).length }));
