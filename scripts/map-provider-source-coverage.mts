import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { providerEvidenceKey, findProviderEvidence, providerEvidenceNerisId, providerProfileEvidence } from '../artifacts/ems-territory-intelligence/src/data/providerProfileEvidence';
import { listingLocation, providerProfileCountyFips, parseSnapshotEntry, type LocationState } from '../artifacts/ems-territory-intelligence/src/services/nationalLocationSnapshot';
import { registryIdentityKey, snapshotRegistryIdentity } from '../artifacts/ems-territory-intelligence/src/services/registryAccountLink';
import type { SourceDirectoryRecord } from '../artifacts/ems-territory-intelligence/src/services/nationalSourceDirectory';
import { validateNerisShard } from '../artifacts/ems-territory-intelligence/src/services/nerisStationCatalog';
import { floridaCounty, validateFloridaRoster } from '../artifacts/ems-territory-intelligence/src/services/floridaEmsRoster';
import { parseProviderProfileRef, providerProfileHref } from '../artifacts/ems-territory-intelligence/src/navigation/providerProfileUrl';

const out = process.argv[2];
if (!out) throw Error('Supply an output directory.');
const registry = resolve('artifacts/ems-territory-intelligence/public/registry');
const read = (file: string) => JSON.parse(readFileSync(resolve(registry, file), 'utf8'));
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
function shard(file: string, checksum: string) {
  const bytes = readFileSync(resolve(registry, file));
  if (sha256(bytes) !== checksum) throw Error('Invalid snapshot checksum: ' + file);
  return JSON.parse(bytes.toString('utf8'));
}

const national = read('national/index.json');
const locationIndex = read('locations/index.json');
const neris = read('neris-stations/index.json');
const states = new Set<string>(neris.chunks.map((item: { state: string }) => item.state));
if (states.size !== 51) throw Error('Expected 50 states and DC.');
const counties = new Map<string, string>(Object.entries(national.countyNames));
const boundaries = JSON.parse(readFileSync(resolve(registry, '../data/us-counties-boundaries.json'), 'utf8'));
type Ring = [number, number][];
type Boundary = { id: string; properties: { STATE_CODE: string; BBOX: number[] }; geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: Ring[] | Ring[][] } };
const byBoundaryState = new Map([...states].map(state => [state,
  (boundaries.features as Boundary[]).filter(feature => feature.properties.STATE_CODE === state && counties.has(feature.id)),
]));
const prefixes = new Map([...byBoundaryState].flatMap(([state, shapes]) => shapes.map(shape => [shape.id.slice(0, 2), state] as const)));
function insideRing(x: number, y: number, ring: Ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [a, b] = ring[i];
    const [c, d] = ring[j];
    if ((b > y) !== (d > y) && x < (c - a) * (y - b) / (d - b) + a) inside = !inside;
  }
  return inside;
}
function countyAtHeadquarters(state: string, [y, x]: [number, number]) {
  const matches = (byBoundaryState.get(state) ?? []).filter(feature => {
    const [west, south, east, north] = feature.properties.BBOX;
    if (x < west || x > east || y < south || y > north) return false;
    const { type, coordinates } = feature.geometry;
    const polygons = type === 'Polygon' ? [coordinates as Ring[]] : coordinates as Ring[][];
    return polygons.some(([outer, ...holes]) => insideRing(x, y, outer) && !holes.some(ring => insideRing(x, y, ring)));
  });
  return matches.length === 1 ? matches[0].id : '';
}
const records: ReturnType<typeof audit>[] = [];
const stations: Record<string, unknown>[] = [];
const stationCounties = new Map<string, number>();

function audit(ref: string, name: string, key: string | undefined, county: string, countyBasis: string, sourceStatus: string) {
  const profile = parseProviderProfileRef(ref);
  if (!profile) throw Error('Invalid profile route: ' + ref);
  const evidence = findProviderEvidence(key, name);
  const aeds = evidence?.equipment?.filter(row => row.category === 'aed') ?? [];
  const inService = aeds.filter(row => row.status === 'In service reported');
  const scopedModelCount = inService.some(row => row.manufacturer && row.model && row.quantity !== undefined);
  const direct = evidence?.stationDirectory?.stations.filter(row => row.contact?.phone || row.contact?.email) ?? [];
  const sources = [...new Set([
    ...aeds.map(row => row.source.url),
    ...(evidence?.stationDirectory ? [evidence.stationDirectory.source.url] : []),
    ...(evidence?.billing?.map(row => row.source.url) ?? []),
    ...(evidence?.payerMix?.map(row => row.source.url) ?? []),
    ...(evidence?.billingDenials?.map(row => row.source.url) ?? []),
    ...(evidence?.quality?.map(row => row.source.url) ?? []),
  ])];
  return {
    state: profile.state, county_fips: counties.has(county) ? county : '', county_name: counties.get(county) ?? '',
    county_basis: countyBasis, provider: name, registry_key: key ?? '',
    linked_evidence_key: evidence ? providerEvidenceKey(key, name) ?? '' : '',
    profile_route: '/' + providerProfileHref(profile), source_status: sourceStatus,
    aed_inventory: scopedModelCount ? 'In-service report with model and count' : inService.length ? 'In-service report, incomplete inventory' : aeds.length ? 'Dated AED evidence only' : 'No AED evidence in audited sources',
    aed_brand_model: [...new Set(aeds.map(row => [row.manufacturer, row.model].filter(Boolean).join(' ')).filter(Boolean))].join(' | '),
    aed_evidence_as_reported: aeds.map(row => [
      row.status, [row.manufacturer, row.model].filter(Boolean).join(' '),
      row.quantity !== undefined ? String(row.quantity) + ' units in source scope' : '',
      row.deployment ?? '', row.supplier ?? '', row.source.date,
    ].filter(Boolean).join(' · ')).join(' | '),
    documented_aed_purchase_dates: aeds.flatMap(row => row.lastPurchasedOn ? [row.lastPurchasedOn] : []).sort().join(' | '),
    documented_aed_approval_dates: aeds.flatMap(row => row.approvedOn ? [row.approvedOn] : []).sort().join(' | '),
    documented_aed_payment_dates: aeds.flatMap(row => row.paidOn ? [row.paidOn] : []).sort().join(' | '),
    documented_aed_acquisition_dates: aeds.flatMap(row => row.acquiredOn ? [row.acquiredOn] : []).sort().join(' | '),
    direct_station_contact_count: direct.length,
    direct_station_contacts: direct.map(row => row.number + ': ' + [row.contact?.phone, row.contact?.email].filter(Boolean).join(' ')).join(' | '),
    station_directory_count: evidence?.stationDirectory?.stations.length ?? '',
    department_visit_contact: evidence?.stationDirectory?.visitContact?.phone ?? '',
    provider_denials: evidence?.billingDenials?.length ? 'Public department figures with limited cohort' : 'No provider denials in audited sources',
    payer_breakdown: evidence?.payerMix?.length ? 'Published payer breakdown' : 'No payer breakdown in audited sources',
    department_transport_billing: evidence?.billing?.length ? 'Published program totals' : 'No program totals in audited sources',
    department_quality: evidence?.quality?.length ? 'Published measures in profile' : 'No quality report in audited sources',
    original_sources: sources.join(' | '),
  };
}

for (const chunk of national.chunks) {
  const state = chunk.state;
  if (!states.has(state)) continue;
  const rows = shard('national/' + chunk.file, chunk.sha256) as SourceDirectoryRecord[];
  if (rows.length !== chunk.count) throw Error('Invalid registry count: ' + state);
  const item = locationIndex.chunks.find((entry: { state: string }) => entry.state === state);
  let locations: LocationState | undefined;
  if (item) {
    if (item.registrySha256 !== chunk.sha256) throw Error('Location snapshot differs from registry: ' + state);
    const raw = shard('locations/' + item.file, item.sha256) as unknown[];
    if (raw.length !== item.count) throw Error('Invalid location count: ' + state);
    const entries = raw.map(entry => parseSnapshotEntry(entry, state, national.countyNames));
    locations = { generatedAt: locationIndex.generatedAt, entries: new Map(entries.map(entry => [entry.key, entry])), nppesProcessed: false };
  }
  for (const row of rows) {
    const loc = listingLocation(row, locations);
    const county = providerProfileCountyFips(row, locations, loc);
    if (county) prefixes.set(county.slice(0, 2), state);
    const identity = snapshotRegistryIdentity(row);
    records.push(audit(state + '/registry/' + row[0], row[2], identity && registryIdentityKey(identity), county,
      county ? 'App county assignment' : 'Unresolved', loc.status));
  }
}
if (records.length !== national.statesAndDcRecords) throw Error('Unexpected national listing count.');

const linkedCounties = new Map(records.filter(row => row.registry_key && row.county_fips).map(row => [row.registry_key, row.county_fips]));
for (const chunk of neris.chunks) {
  for (const row of validateNerisShard(shard('neris-stations/' + chunk.file, chunk.sha256), chunk)) {
    const key = 'NERIS:' + row.id;
    const linked = providerEvidenceKey(key, row.name);
    const known = linked ? linkedCounties.get(linked) : undefined;
    const spatial = row.coordinates ? countyAtHeadquarters(row.state, row.coordinates) : '';
    const conflict = Boolean(known && spatial && known !== spatial);
    const county = conflict ? '' : spatial || known || '';
    records.push(audit(row.state + '/neris/' + row.id, row.name, key, county,
      conflict ? 'Cross-registry and spatial counties disagree' : spatial ? 'NERIS headquarters point in generalized county boundary'
        : known ? 'Documented cross-registry county' : 'Department county unresolved', 'NERIS source listing'));
    for (const station of row.stations) {
      const stationCounty = station.coordinates ? countyAtHeadquarters(station.address[3], station.coordinates) : '';
      if (stationCounty) stationCounties.set(stationCounty, (stationCounties.get(stationCounty) ?? 0) + 1);
      stations.push({
        department_state: row.state, station_address_state: station.address[3], station_county_fips: stationCounty,
        county_basis: stationCounty ? 'Station point in generalized county boundary' : 'Unresolved',
        department: row.name, neris_department_id: row.id, neris_station_id: station.id,
        station: station.name ?? '', address: station.address.filter(Boolean).join(', '),
        recorded_latitude: station.coordinates?.[0] ?? '', recorded_longitude: station.coordinates?.[1] ?? '',
        relationship_flag: station.parentNameConflict ? 'Parent name conflict' : station.sharedPoint ? 'Shared source point' : '',
        contact_lookup: '/' + providerProfileHref({ state: row.state, source: 'neris', id: row.id }) + '#stations',
      });
    }
  }
}

if (stations.length !== neris.summary.eligibleStations ||
  new Set(stations.map(row => row.neris_station_id)).size !== stations.length) {
  throw Error('Unexpected national station record count.');
}
const florida = validateFloridaRoster(read('state-ems/FL.json'));
for (const row of florida.records.filter(row => row.headquartersState === 'FL')) {
  const county = floridaCounty(row, counties)?.countyFips ?? '';
  records.push(audit('FL/state-ems/' + row.identifier, row.name, 'STATE-EMS:FL:license:' + row.identifier,
    county, county ? 'Florida roster headquarters county' : 'Unresolved', 'State license listing'));
}
for (const row of read('state-ems/OH.json').records) {
  if (!parseProviderProfileRef('OH/state-ems/' + row.identifier)) continue;
  records.push(audit('OH/state-ems/' + row.identifier, row.name, 'STATE-EMS:OH:agency-code:' + row.identifier, '', 'Unresolved', 'State agency listing'));
}
for (const [state, file, field] of [['TX', 'TX-review.json', 'sourceKey'], ['NY', 'NY-westchester-review.json', 'reviewKey']]) {
  for (const row of read('state-ems-review/' + file).records) {
    records.push(audit(state + '/regional-ems/' + row[field], row.name, row[field], '', 'Unresolved', 'Regional source listing'));
  }
}

if (new Set(records.map(row => row.profile_route)).size !== records.length) throw Error('Duplicate profile route.');
const counts = () => ({ listing_rows: 0, county_assigned: 0, in_service_model_count: 0, in_service_partial: 0, dated_aed_only: 0,
  with_purchase_date: 0, with_payment_date: 0, with_direct_station_contact: 0, with_transport_billing: 0, with_payer_breakdown: 0, with_denials: 0, with_quality: 0 });
type Counts = ReturnType<typeof counts>;
function count(item: Counts, row: (typeof records)[number]) {
  item.listing_rows++;
  item.county_assigned += Number(Boolean(row.county_fips));
  item.in_service_model_count += Number(row.aed_inventory === 'In-service report with model and count');
  item.in_service_partial += Number(row.aed_inventory === 'In-service report, incomplete inventory');
  item.dated_aed_only += Number(row.aed_inventory === 'Dated AED evidence only');
  item.with_purchase_date += Number(Boolean(row.documented_aed_purchase_dates));
  item.with_payment_date += Number(Boolean(row.documented_aed_payment_dates));
  item.with_direct_station_contact += Number(row.direct_station_contact_count > 0);
  item.with_transport_billing += Number(row.department_transport_billing === 'Published program totals');
  item.with_payer_breakdown += Number(row.payer_breakdown === 'Published payer breakdown');
  item.with_denials += Number(row.provider_denials === 'Public department figures with limited cohort');
  item.with_quality += Number(row.department_quality === 'Published measures in profile');
}
const byState = new Map([...states].sort().map(state => [state, counts()]));
const byCounty = new Map([...counties].filter(([id]) => prefixes.has(id.slice(0, 2))).sort().map(([id]) => [id, counts()]));
const total = counts();
for (const row of records) {
  count(total, row);
  count(byState.get(row.state)!, row);
  if (row.county_fips) count(byCounty.get(row.county_fips)!, row);
}

function writeCsv(file: string, rows: Record<string, unknown>[]) {
  const columns = Object.keys(rows[0]);
  function cell(value: unknown) {
    const text = String(value ?? '');
    const safe = /^[=+\-@\t\r\n]/.test(text) ? "'" + text : text;
    return '"' + safe.replaceAll('"', '""') + '"';
  }
  writeFileSync(resolve(out, file), '\uFEFF' + [columns.join(','), ...rows.map(row => columns.map(key => cell(row[key])).join(','))].join('\r\n') + '\r\n');
}

mkdirSync(out, { recursive: true });
writeCsv('provider-source-coverage.csv', records.sort((a, b) => a.state.localeCompare(b.state) || a.county_fips.localeCompare(b.county_fips) || a.provider.localeCompare(b.provider)));
writeCsv('neris-station-coverage.csv', stations);
const contacts = providerProfileEvidence.flatMap(evidence =>
  (evidence.stationDirectory?.stations ?? []).flatMap(station => station.contact?.phone || station.contact?.email ? [{
    provider: evidence.registryName, registry_key: evidence.registryKey, neris_department_id: providerEvidenceNerisId(evidence) ?? '',
    station_number: station.number, station_address: station.address, phone: station.contact.phone ?? '',
    email: station.contact.email ?? '', source_date: station.contact.source.date, source: station.contact.source.url,
  }] : []));
if (contacts.length) writeCsv('published-station-contacts.csv', contacts);
writeCsv('state-coverage.csv', [...byState].map(([state, value]) => ({ state, ...value })));
writeCsv('county-coverage.csv', [...byCounty].map(([county_fips, value]) => ({ state: prefixes.get(county_fips.slice(0, 2)), county_fips, county: counties.get(county_fips), neris_station_rows: stationCounties.get(county_fips) ?? 0, ...value })));
writeFileSync(resolve(out, 'summary.json'), JSON.stringify({ ...total, states: byState.size, counties: byCounty.size, distinct_mapped_station_contacts: contacts.length, neris_station_rows: stations.length, neris_station_rows_with_county: [...stationCounties.values()].reduce((a, b) => a + b, 0), revision: process.env.PROVIDER_COVERAGE_REVISION ?? null }, null, 2) + '\n');
console.log(total);
