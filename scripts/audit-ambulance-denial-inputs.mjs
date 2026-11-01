import { readFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';

// Audits bundled inputs, not user-entered browser data or private billing systems.
const dataRoot = new URL('../artifacts/ems-territory-intelligence/src/data/', import.meta.url);
const sourceDefinitions = [
  ['nationalAgenciesData.ts', 'claimDenialRate'],
  ['allStatesAgenciesData.ts', 'claimDenialRate'],
  ['nationalZipCityRegistry.ts', 'medicareDenialRate'],
];
const sourceFiles = await Promise.all(sourceDefinitions.map(async ([file, field]) => {
  const text = await readFile(new URL(file, dataRoot), 'utf8');
  const values = [...text.matchAll(new RegExp(`\\b${field}\\s*:\\s*(\\d+(?:\\.\\d+)?)`, 'g'))];
  return {
    file,
    scalarField: field,
    numericLiteralOccurrences: values.length,
    deniedCountFieldOccurrences: [...text.matchAll(/\bmedicareDeniedClaimCount\b/g)].length,
    adjudicatedCountFieldOccurrences: [...text.matchAll(/\bmedicareAdjudicatedClaimCount\b/g)].length,
  };
}));

const countyRecords = JSON.parse(gunzipSync(
  await readFile(new URL('all-counties-database.json.gz', dataRoot)),
).toString('utf8'));
if (!Array.isArray(countyRecords)) throw new Error('Expected an array of county records.');

function hasUsableCounts(record) {
  const denied = record.medicareDeniedClaimCount;
  const adjudicated = record.medicareAdjudicatedClaimCount;
  return Number.isSafeInteger(denied) && Number.isSafeInteger(adjudicated) &&
    denied >= 0 && adjudicated > 0 && denied <= adjudicated;
}

const byStateFips = new Map();
for (const record of countyRecords) {
  const fips = String(record.countyFips ?? '');
  if (!/^\d{5}$/.test(fips)) throw new Error(`Invalid county FIPS in bundled reference: ${fips}`);
  const stateFips = fips.slice(0, 2);
  const summary = byStateFips.get(stateFips) ?? { stateFips, countyRecords: 0, recordsWithUsableClaimCounts: 0 };
  summary.countyRecords += 1;
  if (hasUsableCounts(record)) summary.recordsWithUsableClaimCounts += 1;
  byStateFips.set(stateFips, summary);
}

console.log(JSON.stringify({
  scope: 'Bundled source files only; excludes browser imports, Firestore records, and private billing systems.',
  scalarCaveat: 'Literal occurrences are not unique provider counts, source-backed rates, or current runtime values.',
  sourceFiles,
  nationwide: {
    countyRecords: countyRecords.length,
    recordsWithUsableClaimCounts: countyRecords.filter(hasUsableCounts).length,
  },
  states: [...byStateFips.values()].sort((a, b) => a.stateFips.localeCompare(b.stateFips)),
  conclusion: 'Percentages without matching claim denominators and pickup-county attribution cannot produce complete county/state claim rates.',
}, null, 2));
