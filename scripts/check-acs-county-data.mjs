import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { buildAcsStateRollups } from '../artifacts/ems-territory-intelligence/src/data/acsCountyRollups.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../artifacts/ems-territory-intelligence/src/data');
const readGzipJson = (path) => JSON.parse(gunzipSync(readFileSync(path)).toString('utf8'));
const counties = readGzipJson(resolve(root, 'all-counties-database.json.gz'));
const acs = readGzipJson(resolve(root, 'acs-county-metrics-2024.json.gz'));
const countyFips = counties.map((county) => String(county.countyFips).padStart(5, '0'));
const acsFips = acs.counties.map((county) => county.countyFips);

assert.equal(counties.length, 3144, 'app geography must contain 3,144 county-equivalents');
assert.equal(new Set(countyFips).size, 3144, 'app county FIPS values must be unique');
assert.equal(acs.counties.length, 3144, 'Census file must include 3,144 county-equivalents');
assert.equal(new Set(acsFips).size, 3144, 'Census county FIPS values must be unique');
assert.deepEqual([...acsFips].sort(), [...countyFips].sort(), 'Census and app county FIPS sets must match exactly');
assert.equal(new Set(counties.map((county) => county.stateCode)).size, 51, 'geography must cover 50 states and DC');
assert.equal(acs.counties.filter((county) => county.countyFips.startsWith('09')).length, 9, 'Connecticut must use its nine current planning regions');

for (const county of counties) {
  const fips = String(county.countyFips).padStart(5, '0');
  assert.equal(String(county.stateFips).padStart(2, '0'), fips.slice(0, 2), `state FIPS must match ${fips}`);
}

const availableCounts = Object.fromEntries(
  ['population', 'population65Plus', 'povertyUniverse', 'populationBelowPoverty', 'medianHouseholdIncome']
    .map((key) => [key, acs.counties.filter((county) => Number.isFinite(county[key]) && county[key] >= 0).length]),
);
for (const key of ['population', 'population65Plus', 'povertyUniverse', 'populationBelowPoverty']) {
  assert.equal(availableCounts[key], 3144, `${key} must be reported for all county-equivalents`);
}
assert.ok(
  availableCounts.medianHouseholdIncome > 0 && availableCounts.medianHouseholdIncome <= 3144,
  'income must retain Census missingness instead of inventing values',
);
assert.equal(acs.source.reportingPeriod, '2020–2024');
assert.match(acs.source.sourceUrl, /^https:\/\/www\.census\.gov\//);

const stateCodes = [...new Set(counties.map((county) => county.stateCode))].sort();
const stateRollups = buildAcsStateRollups(
  counties.map((county) => ({
    countyFips: String(county.countyFips).padStart(5, '0'),
    stateCode: county.stateCode,
  })),
  acs.counties,
  stateCodes,
);
for (const stateCode of stateCodes) {
  const rollup = stateRollups[stateCode];
  assert.ok(rollup.population.complete, `${stateCode} population sum must have complete county coverage`);
  assert.ok(rollup.population65PlusShare.complete, `${stateCode} age-65+ share must have complete county coverage`);
  assert.ok(rollup.povertyRate.complete, `${stateCode} poverty rate must have complete county coverage`);
  assert.ok(rollup.population65PlusShare.value >= 0 && rollup.population65PlusShare.value <= 100);
  assert.ok(rollup.povertyRate.value >= 0 && rollup.povertyRate.value <= 100);
}
const incompleteIncomeStates = stateCodes.filter((stateCode) => !stateRollups[stateCode].medianCountyHouseholdIncome.complete);
assert.equal(
  stateCodes.reduce((total, stateCode) => total + stateRollups[stateCode].countyCount, 0),
  3144,
  'state rollups must use each county-equivalent exactly once',
);
console.log(
  `ACS county data checks passed: 3,144 FIPS rows across ${stateCodes.length} states/DC; ` +
  `income estimates present for ${availableCounts.medianHouseholdIncome}; income remains incomplete in ${incompleteIncomeStates.length} state(s).`,
);
