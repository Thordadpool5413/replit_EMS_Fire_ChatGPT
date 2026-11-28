import type { CountyPracticeLocation } from '../src/services/countyPracticeLocations';
import { loadAllMonthlySecondaryRows } from '../src/services/nppesMonthlySecondary';
import { joinMonthlyGeocodes, loadAllMonthlyGeocodeRows } from '../src/services/nppesMonthlyGeocode';
import { addressText } from '../src/services/providerLocationContract';
import { countDepartment, emptyCoverage, type Coverage } from '../src/services/departmentCoverage';
import { departmentAwards } from './departmentAwards';
import { loadNerisMapState } from '../src/services/nerisStationMap';
import { loadDepartmentBrief } from '../src/services/departmentBrief';
import { historicSites, matchHistoricStations } from './stationHistory';
import { archivedContacts } from './archivedContacts';
import assert from 'node:assert/strict';
import { gunzipSync } from 'node:zlib';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  departmentProfile,
  isCombinedDepartment,
  profileSourceKey,
} from '../src/services/departmentIdentity';
import {
  parseProviderProfileRef,
  providerProfileHref,
  type ProviderProfileRef,
} from '../src/navigation/providerProfileUrl';
import {
  loadSourceDirectoryManifest,
  loadSourceDirectoryState,
} from '../src/services/nationalSourceDirectory';
import { loadNationalLocationState } from '../src/services/nationalLocationSnapshot';
import { loadNerisStateCatalog } from '../src/services/nerisStationCatalog';
import { loadFloridaRoster, floridaServiceName } from '../src/services/floridaEmsRoster';
import { loadOhioRoster } from '../src/services/stateEmsRoster';
import { loadTexasReviewRoster } from '../src/services/texasEmsReviewRoster';
import { loadWestchesterCatalog } from '../src/services/westchesterEmsReview';
import {
  loadPublicProviderProfile,
  type PublicProviderProfile,
} from '../src/services/publicProviderProfile';
import type { DirectoryProvider } from '../src/services/providerCatalog';
import { findProviderEvidenceByConfirmedKeys } from '../src/data/providerProfileEvidence';
import { loadUsfaProfileOperations } from '../src/services/usfaProfileOperations';

const root = fileURLToPath(new URL('../public/', import.meta.url));
// Exercise exactly the same identity, location, checksum and roster loaders as a browser,
// using the assets being shipped in this build. A broken route fails the build.
const generatedFiles = new Map<string, string>();
globalThis.fetch = async (input) => {
  const url = new URL(String(input), 'https://build.local');
  assert.equal(url.origin, 'https://build.local');
  const generated = generatedFiles.get(url.pathname);
  if (generated !== undefined) return new Response(generated);
  const file = path.resolve(root, '.' + url.pathname);
  assert.ok(file.startsWith(root));
  try {
    return new Response(await readFile(file));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return new Response(null, { status: 404 });
    throw err;
  }
};

async function publishSnapshot(name: string, payload: string) {
  generatedFiles.set('/data/providers/' + name, payload);
  if (process.argv[2]) await writeFile(path.join(process.argv[2], name), payload);
}
const readArchive = async (filename: string) =>
  gunzipSync(await readFile(new URL('./data/' + filename + '.json.gz', import.meta.url))).toString();
const nfirs = JSON.parse(await readArchive('nfirs-2024')) as Record<string, Record<string, [number, number]>>;
const emergencyServiceCodes = new Set(['A0427', 'A0429', 'A0430', 'A0431', 'A0433']);
const cmsAmbulanceOperators = new Map<string, string[]>();
for (let digit = 0; digit < 10; digit++) {
  const name = 'medicare-2024-' + digit;
  const data = await readArchive(name);
  await publishSnapshot(name + '.json', data);
  const edition = JSON.parse(data) as { providers: Record<string, [string, string, string, string, [string, string, number, number | null][]]> };
  for (const [npi, [, , state, providerType, rows]] of Object.entries(edition.providers)) {
    if (providerType !== 'Ambulance Service Provider') continue;
    if (!rows.some(([code, , , units]) => emergencyServiceCodes.has(code) && units !== null && units > 0)) continue;
    const operators = cmsAmbulanceOperators.get(state) ?? [];
    operators.push(npi);
    cmsAmbulanceOperators.set(state, operators);
  }
}
const zctaCounty = JSON.parse(await readArchive('single-county-zcta')) as Record<string, string>;
const censusCounties = JSON.parse(await readFile(new URL('../../../scripts/fixtures/census-2026-county-identities.json', import.meta.url), 'utf8')) as {
  counties: { GEOID: string; USPS: string }[];
};
const censusCountyState = new Map(censusCounties.counties.map(({ GEOID, USPS }) => [GEOID, USPS]));
const manifest = await loadSourceDirectoryManifest();
const [secondaryRows, allPracticeGeocodes] = await Promise.all([
  loadAllMonthlySecondaryRows(),
  loadAllMonthlyGeocodeRows(),
]);
function groupByNpi<T extends { parentNpi: string }>(rows: T[]) {
  const result = new Map<string, T[]>();
  for (const row of rows) {
    const values = result.get(row.parentNpi) ?? [];
    values.push(row);
    result.set(row.parentNpi, values);
  }
  return result;
}
const practicesByNpi = groupByNpi(secondaryRows);
const coordinatesByNpi = groupByNpi(allPracticeGeocodes);
const countyPracticeLocations = new Map<string, CountyPracticeLocation[]>();
const linkedPracticeRows = new Set<string>();
const allContacts = await archivedContacts();
const siteArchive = await historicSites();
const counts = {
  renderableBriefs: 0,
  equipment: 0,
  quality: 0,
  funding: 0,
  medicaid: 0,
  medicare: 0,
  nfirs: 0,
  historicStationRecords: 0,
  historicStationPhones: 0,
  withPublishedPhone: 0,
  states: 0,
  sourceRoutes: 0,
  profiles: 0,
  countyAssigned: 0,
  countyFromZcta: 0,
  noCountyDirectory: 0,
  secondaryPracticeRows: 0,
  secondaryPracticeCountyRows: 0,
  secondaryPracticeProfiles: 0,
  mappedLocations: 0,
  staffing: 0,
  agencyEvidence: 0,
};
const counties = new Set<string>();
type Member = { ref: ProviderProfileRef; profile: PublicProviderProfile };
for (const state of Object.keys(manifest.byState).sort()) {
  await publishSnapshot('ambulance-operators-' + state + '.json', JSON.stringify(cmsAmbulanceOperators.get(state) ?? []));
  const [registry, neris, locations] = await Promise.all([
    loadSourceDirectoryState(state),
    loadNerisStateCatalog(state),
    loadNationalLocationState(state),
  ]);
  assert.ok(locations, 'Location edition failed validation for ' + state);
  const refs: ProviderProfileRef[] = [];
  const add = (source: ProviderProfileRef['source'], ids: string[]) =>
    refs.push(...ids.map((id) => ({ source, id, state })));
  add(
    'registry',
    registry.map((r) => r[0]),
  );
  add(
    'neris',
    neris.departments.map((r) => r.id),
  );
  if (state === 'FL')
    add(
      'state-ems',
      (await loadFloridaRoster()).records
        .filter((r) => r.headquartersState === state && floridaServiceName(r))
        .map((r) => r.identifier),
    );
  if (state === 'OH')
    add(
      'state-ems',
      (await loadOhioRoster()).records.map((r) => r.identifier),
    );
  if (state === 'TX')
    add(
      'regional-ems',
      (await loadTexasReviewRoster()).records.map((r) => r.sourceKey),
    );
  if (state === 'NY')
    add(
      'regional-ems',
      (await loadWestchesterCatalog()).records.map((r) => r.reviewKey),
    );
  const byAccount = new Map<string, Member[]>();
  for (const ref of refs) {
    const canonical = departmentProfile(ref);
    const url = providerProfileHref(ref);
    const parsed = parseProviderProfileRef(new URLSearchParams(url.slice(1)).get('profile')!);
    assert.deepEqual(parsed, canonical, 'Unreachable route ' + url);
    const profile = await loadPublicProviderProfile(ref);
    assert.ok(
      profile?.name && profile.stateCode === state && profile.identifier && profile.source.name,
      'No source detail for ' + url,
    );
    const siblings = byAccount.get(url) ?? [];
    siblings.push({ ref, profile });
    byAccount.set(url, siblings);
  }
  const byParent = new Map<string, Map<string, { county: string; city: string; basis: string }>>();
  const stationMap = await loadNerisMapState(state);
  for (const station of stationMap.rows) {
    if (station.parentNameConflict || !station.countyFips) continue;
    const key = profileSourceKey(departmentProfile({ state, source: 'neris', id: station.parentId }));
    const places = byParent.get(key) ?? new Map();
    const city = station.address[2] || '';
    places.set(station.countyFips + '/' + city.toLowerCase(), {
      county: station.countyFips,
      city,
      basis: 'Reported station',
    });
    byParent.set(key, places);
  }
  const rows: DirectoryProvider[] = [];
  const contacts: Record<string, NonNullable<ReturnType<typeof allContacts.get>>> = {};
  for (const [url, members] of byAccount) {
    const ref = departmentProfile(members[0].ref);
    const main = members.find((m) => m.ref.source === ref.source && m.ref.id === ref.id);
    assert.ok(main, 'Missing canonical account ' + url);
    const p = main.profile,
      key = profileSourceKey(ref);
    let linkedPractices = 0;
    for (const member of members) {
      if (!member.ref.id.startsWith('nppes:')) continue;
      const npi = member.ref.id.slice(6);
      const sourceRows = practicesByNpi.get(npi) ?? [];
      const geocodes = joinMonthlyGeocodes(npi, sourceRows, coordinatesByNpi.get(npi) ?? []);
      const indexedRows = new Map(geocodes.map((row) => [row.sourceKey, row]));
      for (const row of sourceRows) {
        assert.equal(row.parentState, state, 'NPPES location edition parent state mismatch');
        assert.ok(!linkedPracticeRows.has(row.sourceKey), 'Duplicate NPPES parent location link');
        linkedPracticeRows.add(row.sourceKey);
        linkedPractices++;
        const county = indexedRows.get(row.sourceKey)?.censusCountyAsReported;
        if (!county || !manifest.countyNames[county] || censusCountyState.get(county) !== row.address.state) continue;
        const locations = countyPracticeLocations.get(county) ?? [];
        locations.push({
          key: row.sourceKey, record: ref, name: p.name, npi: npi,
          address: addressText(row.address), city: row.address.city, reportingPeriod: row.parentSourceDate,
        });
        countyPracticeLocations.set(county, locations);
        counts.secondaryPracticeCountyRows++;
      }
    }
    counts.secondaryPracticeRows += linkedPractices;
    if (linkedPractices) counts.secondaryPracticeProfiles++;
    const evidence = findProviderEvidenceByConfirmedKeys([key]);
    let hasPhone = false;
    for (const m of members) {
      const sourceKey = profileSourceKey(m.ref),
        info = allContacts.get(sourceKey);
      if (info && info.state === state) {
        contacts[sourceKey] = info;
        hasPhone ||= !!info.phone;
      }
    }
    if (hasPhone) counts.withPublishedPhone++;
    const associatedCounties = new Set(
      members.flatMap((m) => (m.profile.countyFips ? [m.profile.countyFips] : [])),
    );
    const recordedCounty =
      p.countyFips ||
      (!p.withholdGeography && associatedCounties.size === 1 ? [...associatedCounties][0] : '');
    const zip = p.zip?.trim().match(/^(\d{5})(?:[- ]?\d{4})?$/)?.[1];
    const zipCounty = zip && !recordedCounty && !p.withholdGeography && !associatedCounties.size
      ? zctaCounty[zip] : undefined;
    const statisticalCounty = zipCounty && censusCountyState.get(zipCounty) === state && manifest.countyNames[zipCounty]
      ? zipCounty : '';
    const county = recordedCounty || statisticalCounty;
    if (statisticalCounty) counts.countyFromZcta++;
    const site =
      !p.withholdGeography &&
      (p.coordinates
        ? p
        : members.find((m) => m.profile.coordinates && county && m.profile.countyFips === county)?.profile);
    const alias = new Set<string>();
    for (const m of members) {
      if (m.profile.name !== p.name) alias.add(m.profile.name);
      if (m.ref.id !== ref.id) alias.add(m.ref.id);
      for (const field of m.profile.registryFields ?? [])
        if (
          ['Registered name', 'Other organization name', 'Operating name'].includes(field.label) &&
          field.value !== p.name
        )
          alias.add(field.value);
    }
    const fire = p.kind === 'Fire department' || /\bfire\b/i.test(p.name);
    const ems =
      members.some((m) => m.profile.kind === 'EMS organization') ||
      /\b(?:EMS|emergency medical services)\b/i.test(p.name);
    const kind =
      isCombinedDepartment(key) || evidence?.combinedServices || (fire && ems)
        ? 'combined'
        : fire
          ? 'fire'
          : 'ems';
    if (county) {
      assert.ok(manifest.countyNames[county], 'Unknown county ' + county);
      counties.add(county);
      counts.countyAssigned++;
    }
    if (site?.coordinates) counts.mappedLocations++;
    if (evidence) counts.agencyEvidence++;
    if (
      key.startsWith('FDID:') &&
      (await loadUsfaProfileOperations(state, key))?.metrics.some((m) => /firefighters/.test(m.label))
    )
      counts.staffing++;
    const places = byParent.get(key) ?? new Map();
    for (const m of members)
      if (m.profile.countyFips) {
        const city = m.profile.city ?? '';
        places.set(m.profile.countyFips + '/' + city.toLowerCase(), {
          county: m.profile.countyFips,
          city,
          basis: 'Registry address',
        });
      }
    for (const area of evidence?.serviceAreas ?? []) {
      assert.equal(censusCountyState.get(area.countyFips), state, 'Service area jurisdiction mismatch for ' + key);
      places.set(area.countyFips + '/' + area.city.toLowerCase(), {
        county: area.countyFips, city: area.city, basis: 'Documented fire and EMS service agreement',
      });
    }
    if (!county && !places.size) counts.noCountyDirectory++;
    places.delete(county + '/' + (p.city ?? '').toLowerCase());
    for (const place of places.values()) counties.add(place.county);
    rows.push({
      ...(places.size ? { otherPlaces: [...places.values()] } : {}),
      ref,
      name: p.name,
      city: p.city ?? '',
      zip: p.zip ?? '',
      county,
      ...(statisticalCounty ? { countyBasis: 'Census 2020 ZIP area' } : {}),
      kind,
      ...(p.address ? { address: p.address } : {}),
      ...(site?.coordinates
        ? {
            point: [site.coordinates.latitude, site.coordinates.longitude] as [number, number],
            pointBasis: site.locationLabel || site.source.name,
            pointAddress: site.address,
          }
        : {}),
      ...(alias.size ? { aliases: [...alias] } : {}),
    });
  }
  const stationHistory = matchHistoricStations(
    state,
    siteArchive.get(state) ?? [],
    neris.departments,
    new Map(rows.map((row) => [profileSourceKey(row.ref), row.name])),
  );
  for (const sites of Object.values(stationHistory)) {
    counts.historicStationRecords += sites.length;
    counts.historicStationPhones += sites.filter((s) => s.phone).length;
  }
  rows.sort((a, b) => a.name.localeCompare(b.name, 'en-US') || a.ref.id.localeCompare(b.ref.id));
  if (process.argv[2]) {
    await writeFile(path.join(process.argv[2], state + '.json'), JSON.stringify(rows));
    await writeFile(
      path.join(process.argv[2], 'stations-' + state + '.json'),
      JSON.stringify(stationHistory),
    );
    await writeFile(path.join(process.argv[2], 'contacts-' + state + '.json'), JSON.stringify(contacts));
  }
  const awards = departmentAwards(state,rows,manifest.countyNames);
  const awardFile = 'awards-'+state+'.json';
  const payload = JSON.stringify(awards);
  generatedFiles.set('/data/providers/'+awardFile,payload);
  if(process.argv[2]) await writeFile(path.join(process.argv[2],awardFile),payload);
  console.log('Department award matches',state,JSON.stringify(awards.counters),Object.keys(awards.byProvider).length);
  generatedFiles.set('/data/providers/contacts-' + state + '.json', JSON.stringify(contacts));
  await publishSnapshot('nfirs-' + state + '.json', JSON.stringify(nfirs[state] ?? {}));
  const coverage: Record<string, Coverage> = Object.fromEntries(
    [[state, state] as const, ...censusCountyState].flatMap(([area, jurisdiction]) =>
      jurisdiction === state && (area === state || manifest.countyNames[area]) ? [[area, emptyCoverage()]] : []),
  );
  for (const row of rows) {
    const brief = await loadDepartmentBrief(row.ref);
    assert.deepEqual(brief.unavailable, [], 'Incomplete brief on ' + row.ref.id);
    assert.ok(
      brief.records.length && brief.facts.some((r) => r.kind === 'identity'),
      'Empty profile ' + row.ref.id,
    );
    assert.equal(brief.facts.filter((fact) => fact.label.startsWith('NFIRS ')).length, brief.publicActivity.length);
    assert.ok(
      brief.facts.every((f) => f.label && f.value && f.source),
      'Unsourced profile fact ' + row.ref.id,
    );
    for (const kind of ['equipment', 'funding', 'quality'] as const) {
      if (brief.evidence?.[kind]?.length) {
        assert.equal(brief.facts.filter((f) => f.kind === kind).length, brief.evidence[kind].length);
        counts[kind]++;
      }
    }
    const medicaid=brief.payments.some(p=>p.years && Object.keys(p.years).length>0);
    if (medicaid) counts.medicaid++;
    const medicare = brief.medicare.some(Boolean);
    const incidents = brief.publicActivity.length > 0;
    if (medicare) counts.medicare++;
    if (incidents) counts.nfirs++;
    if (!row.county && !row.otherPlaces?.length) coverage[state].unassigned++;
    for(const area of new Set([state,row.county,...(row.otherPlaces??[]).map(p=>p.county)].filter(Boolean)))
      coverage[area]=countDepartment(coverage[area],brief.evidence,medicaid,medicare,incidents);
    counts.renderableBriefs++;
  }
  if(process.argv[2]) await writeFile(path.join(process.argv[2],'coverage-'+state+'.json'),JSON.stringify(coverage));
  generatedFiles.delete('/data/providers/contacts-' + state + '.json');
  counts.states++;
  counts.sourceRoutes += refs.length;
  counts.profiles += rows.length;
}
for (const state of Object.keys(manifest.byState)) {
  const locations = Object.fromEntries(
    [...countyPracticeLocations].filter(([county]) => censusCountyState.get(county) === state),
  );
  await publishSnapshot('practices-' + state + '.json', JSON.stringify(locations));
}
console.log('Validated department directory', JSON.stringify({ ...counts, counties: counties.size }));
