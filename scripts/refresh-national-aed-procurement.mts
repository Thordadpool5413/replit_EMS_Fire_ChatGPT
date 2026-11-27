import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { FEDERAL_ENDPOINT, FEDERAL_STATES } from '../artifacts/api-server/src/lib/federalDiscoveryContract';
import { federalRequest, normalizeFederalDiscovery } from '../artifacts/api-server/src/lib/federalSpendingDiscovery';

const root = 'artifacts/ems-territory-intelligence/public';
const output = process.argv[2] ?? root + '/data/national-aed-procurement.json';
const rawDir = process.argv[3];
const manifest = JSON.parse(await readFile(root + '/data/national-public-aed-coverage.json', 'utf8'));
const boundaries = JSON.parse(await readFile(root + '/data/us-counties-boundaries.json', 'utf8'));
const stateFips = new Map<string, string>(boundaries.features.map((f: { id: string; properties: { STATE_CODE: string } }) => [f.properties.STATE_CODE, f.id.slice(0, 2)]));
const now = Date.now();
const fromYear = new Date(now).getUTCFullYear() - 2;

async function acquire(state: string) {
  const q = { state, fromYear, page: 1, topic: 'defibrillator' as const };
  try {
    let payload;
    if (rawDir) {
      payload = JSON.parse(await readFile(resolve(rawDir, state + '.json'), 'utf8'));
    } else {
      const response = await fetch(FEDERAL_ENDPOINT, {
        method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(federalRequest(q, now)), signal: AbortSignal.timeout(18_000),
      });
      if (!response.ok) throw Error('USAspending HTTP ' + response.status);
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > 1_000_000) throw Error('USAspending page exceeds size limit.');
      payload = JSON.parse(new TextDecoder().decode(bytes));
    }
    const page = normalizeFederalDiscovery(payload, q, now);
    const countyCodes = new Map<string, Set<string>>();
    for (const row of payload.results) {
      const location = row?.['Recipient Location'];
      if (location?.state_code !== state || location?.location_country_code !== 'USA') continue;
      const code = location?.county_code;
      const county = typeof code === 'string' && /^\d{3}$/.test(code) ? stateFips.get(state) + code : '';
      const values = countyCodes.get(row.generated_internal_id) ?? new Set<string>();
      values.add(Object.hasOwn(manifest.byCounty, county) ? county : '');
      countyCodes.set(row.generated_internal_id, values);
    }
    const awards = page.candidates.map(({ id, recipient, description, startDate, awardAmount }) => {
      const values = countyCodes.get(id);
      const county = values?.size === 1 ? [...values][0] : '';
      return { id, recipient, description, startDate, awardAmount, county };
    });
    return { status: page.nextPage || page.warnings || page.withheld ? 'partial' : 'queried', awards, sourceRows: page.sourceRows };
  } catch (error) {
    console.warn(state, error instanceof Error ? error.message : 'Unavailable');
    return { status: 'unavailable', awards: [], sourceRows: 0 };
  }
}

const byState: Record<string, Awaited<ReturnType<typeof acquire>>> = {};
for (let i = 0; i < FEDERAL_STATES.length; i += 5) {
  const batch = FEDERAL_STATES.slice(i, i + 5);
  const results = await Promise.all(batch.map(acquire));
  batch.forEach((state, index) => { byState[state] = results[index]; });
}
const unavailable = Object.values(byState).filter(state => state.status === 'unavailable').length;
if (unavailable) throw Error(unavailable + ' state scopes unavailable. Preserve the existing complete set of state queries.');
const snapshot = { schemaVersion: 1, source: 'USAspending', throughDate: new Date(now).toISOString().slice(0, 10), fromYear, byState };
await writeFile(output, JSON.stringify(snapshot) + '\n');
const awards = Object.values(byState).flatMap(state => state.awards);
console.log(JSON.stringify({ states: FEDERAL_STATES.length, candidates: awards.length,
  countiesWithCandidates: new Set(awards.map(row => row.county).filter(Boolean)).size,
  candidatesWithoutCounty: awards.filter(row => !row.county).length,
  partialStates: Object.values(byState).filter(state => state.status === 'partial').length }));
