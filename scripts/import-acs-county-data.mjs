import { readFileSync, writeFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

const projectRoot = resolve('artifacts/ems-territory-intelligence');
const outputPath = resolve(projectRoot, 'src/data/acs-county-metrics-2024.json.gz');
const tableBase =
  'https://www2.census.gov/programs-surveys/acs/summary_file/2024/table-based-SF/data/5YRData';
const appCountyPath = resolve(projectRoot, 'src/data/all-counties-database.json.gz');
const source = {
  name: 'U.S. Census Bureau, 2020–2024 American Community Survey 5-Year Estimates',
  vintage: '2024 ACS 5-year',
  reportingPeriod: '2020–2024',
  releaseDate: '2026-01-29',
  sourceUrl: 'https://www.census.gov/data/developers/data-sets/acs-5year/2024.html',
  tables: {
    populationAndAge: 'https://data.census.gov/table/ACSDT5Y2024.B01001',
    poverty: 'https://data.census.gov/table/ACSDT5Y2024.B17001',
    householdIncome: 'https://data.census.gov/table/ACSDT5Y2024.B19013',
  },
};

const packedCountyData = gunzipSync(readFileSync(appCountyPath));
const appCounties = JSON.parse(packedCountyData.toString('utf8'));
const expectedFips = new Set(appCounties.map((county) => String(county.countyFips).padStart(5, '0')));
if (expectedFips.size !== 3144 || appCounties.length !== 3144) {
  throw new Error(`Expected 3,144 unique app county-equivalents; found ${expectedFips.size}.`);
}
for (const county of appCounties) {
  const fips = String(county.countyFips).padStart(5, '0');
  if (String(county.stateFips).padStart(2, '0') !== fips.slice(0, 2)) {
    throw new Error(`App county FIPS ${fips} conflicts with its state FIPS.`);
  }
}

const byFips = new Map([...expectedFips].map((countyFips) => [countyFips, { countyFips }]));
const validEstimate = (raw) => {
  if (!raw || raw.startsWith('-')) return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
};
const fipsFromGeoId = (raw) => {
  const match = /^0500000US(\d{5})$/.exec(raw);
  return match?.[1] ?? null;
};

async function readCountyTable(table, fields, applyRow) {
  const url = `${tableBase}/acsdt5y2024-${table.toLowerCase()}.dat`;
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Census bulk table ${table} could not be downloaded (${response.status}).`);
  }

  const decoder = new TextDecoder();
  let remainder = '';
  let headerIndexes = null;
  const seen = new Set();

  const processLine = (line) => {
    if (!line) return;
    const columns = line.split('|');
    if (!headerIndexes) {
      headerIndexes = new Map(columns.map((name, index) => [name, index]));
      for (const field of fields) {
        if (!headerIndexes.has(field)) {
          throw new Error(`Census table ${table} is missing expected field ${field}.`);
        }
      }
      return;
    }

    const fips = fipsFromGeoId(columns[headerIndexes.get('GEO_ID')] ?? '');
    if (!fips) return;
    if (!byFips.has(fips)) return;
    if (seen.has(fips)) throw new Error(`Census table ${table} repeats county FIPS ${fips}.`);
    seen.add(fips);
    const values = Object.fromEntries(
      fields.map((field) => [field, validEstimate(columns[headerIndexes.get(field)] ?? '')]),
    );
    applyRow(byFips.get(fips), values);
  };

  const reader = response.body.getReader();
  while (true) {
    const { value, done } = await reader.read();
    remainder += decoder.decode(value, { stream: !done });
    const lines = remainder.split(/\r?\n/);
    remainder = lines.pop() ?? '';
    lines.forEach(processLine);
    if (done) break;
  }
  processLine(remainder);

  if (!headerIndexes) throw new Error(`Census table ${table} was empty.`);
  if (seen.size !== expectedFips.size) {
    const missing = [...expectedFips].filter((fips) => !seen.has(fips)).slice(0, 10);
    throw new Error(
      `Census table ${table} matched ${seen.size}/${expectedFips.size} county-equivalents. Missing: ${missing.join(', ')}.`,
    );
  }
  console.log(`${table}: matched ${seen.size.toLocaleString()} county-equivalents.`);
}

const ageFields = [
  'B01001_E001',
  ...Array.from({ length: 6 }, (_, index) => `B01001_E${String(index + 20).padStart(3, '0')}`),
  ...Array.from({ length: 6 }, (_, index) => `B01001_E${String(index + 44).padStart(3, '0')}`),
];

await readCountyTable('B01001', ageFields, (county, values) => {
  county.population = values.B01001_E001;
  const olderAdultFields = ageFields.slice(1);
  county.population65Plus =
    olderAdultFields.every((field) => values[field] != null)
      ? olderAdultFields.reduce((total, field) => total + values[field], 0)
      : null;
});

await readCountyTable('B17001', ['B17001_E001', 'B17001_E002'], (county, values) => {
  county.povertyUniverse = values.B17001_E001;
  county.populationBelowPoverty = values.B17001_E002;
});

await readCountyTable('B19013', ['B19013_E001'], (county, values) => {
  county.medianHouseholdIncome = values.B19013_E001;
});

const counties = [...byFips.values()].sort((a, b) => a.countyFips.localeCompare(b.countyFips));
const payload = JSON.stringify({ source, counties });
writeFileSync(outputPath, gzipSync(Buffer.from(payload), { level: 9 }));
console.log(
  `Wrote ${counties.length.toLocaleString()} county-equivalent records (${statSync(outputPath).size.toLocaleString()} compressed bytes).`,
);
