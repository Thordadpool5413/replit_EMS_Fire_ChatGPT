#!/usr/bin/env python3
"""Acquire complete public USGS/HIFLD point inventories and match primary addresses locally.

Only source-defined, complete public inventories are requested. Provider records
are never transmitted. Historical facility points establish an address location,
not a current headquarters, and never change the source-native identity/address.
"""
import argparse
import collections
import concurrent.futures
import copy
import datetime
import hashlib
import json
import math
import pathlib
import re
import time
import urllib.parse
import urllib.request
import urllib.error

from backfill_provider_locations import PUBLIC, ROOT, STATES, sha, zip5
from build_neris_station_map import BOUNDARY, geometry_index, county_for

FEMA = 'https://services.arcgis.com/XG15cJAlne2vxtgt/ArcGIS/rest/services/Critical_Infrastructure_Map_Service/FeatureServer/'
SOURCES = {
    'usgs': {
        'url': 'https://carto-wfs.nationalmap.gov/arcgis/rest/services/structures/MapServer/0',
        'method': 'usgs-structure-address', 'expectedCount': 386823,
        'label': 'USGS National Map Structures', 'zipField': 'ZIPCODE',
        'nativeIdField': 'PERMANENT_IDENTIFIER',
    },
    'hifld-ems': {
        'url': FEMA + '14', 'method': 'hifld-ems-address',
        'expectedCount': 42812, 'label': 'FEMA-hosted HIFLD EMS stations',
        'zipField': 'ZIP', 'nativeIdField': 'ID',
    },
    'hifld-fire': {
        'url': FEMA + '12', 'method': 'hifld-fire-address',
        'expectedCount': 53087, 'label': 'FEMA-hosted HIFLD fire stations',
        'zipField': 'ZIP', 'nativeIdField': 'ID',
    },
}


def dump(value):
    return (json.dumps(value, sort_keys=True, ensure_ascii=True,
                       separators=(',', ':'), allow_nan=False) + '\n').encode()


def attrs(feature):
    raw = feature.get('attributes')
    if not isinstance(raw, dict):
        raise ValueError('Missing native attributes')
    result = {k.upper(): v for k, v in raw.items()}
    if len(result) != len(raw):
        raise ValueError('Ambiguous native attribute casing')
    return result


def get_public(url, params):
    full = url + '?' + urllib.parse.urlencode(params)
    error = None
    for attempt in range(5):
        try:
            request = urllib.request.Request(full, headers={'User-Agent': 'ATLAS public-source provenance recovery'})
            with urllib.request.urlopen(request, timeout=90) as response:
                raw = response.read(30_000_001)
            if len(raw) > 30_000_000:
                raise ValueError('Unexpectedly large source response')
            data = json.loads(raw)
            if 'error' in data:
                raise ValueError('Source query error: ' + str(data['error']))
            return raw
        except (OSError, ValueError) as exc:
            error = exc
            if isinstance(exc, urllib.error.HTTPError) and exc.code in (400, 401, 403, 404, 414):
                break
            if attempt < 4:
                time.sleep(min(2 ** attempt, 10))
    raise RuntimeError('Public source request failed: ' + full) from error


def write_atomic(path, raw):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + '.partial')
    temp.write_bytes(raw)
    temp.replace(path)


def source_id_inventory(raw, expected):
    data = json.loads(raw)
    ids = data.get('objectIds')
    if (not isinstance(ids, list) or len(ids) != expected or
            any(type(v) is not int or v <= 0 for v in ids) or len(set(ids)) != len(ids)):
        raise ValueError('Incomplete or duplicate source-native ID inventory')
    return sorted(ids)


def validate_page(raw, expected_ids):
    data = json.loads(raw)
    if data.get('error') or data.get('exceededTransferLimit'):
        raise ValueError('Truncated or failed source page')
    if data.get('geometryType') != 'esriGeometryPoint':
        raise ValueError('Unexpected source geometry type')
    sr = data.get('spatialReference') or {}
    if sr.get('latestWkid', sr.get('wkid')) != 4326:
        raise ValueError('Source page is not WGS84')
    features = data.get('features')
    if not isinstance(features, list):
        raise ValueError('Missing source features')
    ids = [attrs(f).get('OBJECTID') for f in features]
    if sorted(ids) != sorted(expected_ids) or len(set(ids)) != len(ids):
        raise ValueError('Source page does not reconcile to exact native IDs')
    return features


def acquire(source, directory, workers=4):
    spec = SOURCES[source]
    directory.mkdir(parents=True, exist_ok=True)
    existing_inventory = directory / 'inventory.json'
    if existing_inventory.exists():
        inventory = json.loads(existing_inventory.read_bytes())
        validate_inventory(directory, inventory)
        return inventory
    metadata_path = directory / 'metadata.json'
    ids_path = directory / 'ids.json'
    count_path = directory / 'count.json'
    for path, endpoint, params in [
        (metadata_path, spec['url'], {'f': 'json'}),
        (count_path, spec['url'] + '/query', {'f': 'json', 'where': '1=1', 'returnCountOnly': 'true'}),
        (ids_path, spec['url'] + '/query', {'f': 'json', 'where': '1=1', 'returnIdsOnly': 'true'}),
    ]:
        if not path.exists():
            write_atomic(path, get_public(endpoint, params))
    metadata = json.loads(metadata_path.read_bytes())
    count = json.loads(count_path.read_bytes()).get('count')
    if count != spec['expectedCount']:
        raise ValueError(f'Unexpected {source} edition count: {count}')
    ids = source_id_inventory(ids_path.read_bytes(), count)
    batch_size = min(int(metadata.get('maxRecordCount', 1000)), 1000)
    batches = [(i // batch_size, ids[i:i + batch_size]) for i in range(0, len(ids), batch_size)]

    def page(task):
        number, batch = task
        name = f'pages/{number:05d}.json'
        path = directory / name
        # Native source ID ranges keep GET URLs short. The returned set must
        # still exactly equal the separately retained full-ID inventory slice.
        params = {'f': 'json', 'where': f'OBJECTID >= {batch[0]} AND OBJECTID <= {batch[-1]}',
                  'outFields': '*', 'returnGeometry': 'true', 'outSR': '4326',
                  'orderByFields': 'OBJECTID ASC', 'resultRecordCount': str(batch_size)}
        raw = path.read_bytes() if path.exists() else get_public(spec['url'] + '/query', params)
        validate_page(raw, batch)
        if not path.exists():
            write_atomic(path, raw)
        return {'file': name, 'sha256': sha(raw), 'count': len(batch),
                'firstObjectId': batch[0], 'lastObjectId': batch[-1]}

    pages = []
    pool = concurrent.futures.ThreadPoolExecutor(max_workers=workers)
    futures = [pool.submit(page, batch) for batch in batches]
    try:
        for future in concurrent.futures.as_completed(futures):
            pages.append(future.result())
            if len(pages) % 20 == 0 or len(pages) == len(batches):
                print(source, 'acquired', len(pages), '/', len(batches), 'pages', flush=True)
    except BaseException:
        pool.shutdown(wait=False, cancel_futures=True)
        raise
    else:
        pool.shutdown(wait=True)
    pages.sort(key=lambda value: value['file'])
    final_ids = get_public(spec['url'] + '/query', {'f': 'json', 'where': '1=1', 'returnIdsOnly': 'true'})
    if source_id_inventory(final_ids, count) != ids:
        raise ValueError('Source inventory changed during acquisition')
    write_atomic(directory / 'ids-after.json', final_ids)
    files = []
    for name in ['metadata.json', 'count.json', 'ids.json', 'ids-after.json']:
        raw = (directory / name).read_bytes()
        files.append({'file': name, 'sha256': sha(raw), 'bytes': len(raw)})
    inventory = {'schemaVersion': 1, 'source': source, 'sourceUrl': spec['url'],
                 'collectionDate': datetime.datetime.now(datetime.timezone.utc).date().isoformat(),
                 'queryScope': 'complete public source inventory, where=1=1; no provider payload',
                 'sourceCount': count, 'batchSize': batch_size, 'files': files,
                 'pages': pages, 'sourceSha256': sha(dump({'sourceUrl': spec['url'], 'files': files, 'pages': pages}))}
    write_atomic(existing_inventory, dump(inventory))
    validate_inventory(directory, inventory)
    return inventory


def validate_inventory(directory, inventory):
    source = inventory.get('source')
    if source not in SOURCES or inventory.get('sourceUrl') != SOURCES[source]['url']:
        raise ValueError('Unrecognized federal source')
    if inventory.get('sourceCount') != SOURCES[source]['expectedCount']:
        raise ValueError('Incomplete federal source edition')
    content_hash = sha(dump({k: inventory[k] for k in ('sourceUrl', 'files', 'pages')}))
    if content_hash != inventory.get('sourceSha256'):
        raise ValueError('Inventory digest mismatch')
    for item in inventory['files']:
        raw = (directory / item['file']).read_bytes()
        if sha(raw) != item['sha256'] or len(raw) != item['bytes']:
            raise ValueError('Inventory supporting file changed: ' + item['file'])
    count = inventory['sourceCount']
    ids = source_id_inventory((directory / 'ids.json').read_bytes(), count)
    if source_id_inventory((directory / 'ids-after.json').read_bytes(), count) != ids:
        raise ValueError('Acquisition inventory was unstable')
    if json.loads((directory / 'count.json').read_bytes()).get('count') != count:
        raise ValueError('Native source count mismatch')
    seen = []
    for i, page in enumerate(inventory['pages']):
        if page['file'] != f'pages/{i:05d}.json':
            raise ValueError('Source page order or membership changed')
        raw = (directory / page['file']).read_bytes()
        batch = ids[i * inventory['batchSize']:(i + 1) * inventory['batchSize']]
        if (sha(raw) != page['sha256'] or len(batch) != page['count'] or
                batch[0] != page['firstObjectId'] or batch[-1] != page['lastObjectId']):
            raise ValueError('Source page inventory mismatch')
        seen.extend(attrs(f)['OBJECTID'] for f in validate_page(raw, batch))
    if sorted(seen) != ids:
        raise ValueError('Source pages do not cover complete source inventory')
    return inventory


def records(directory, inventory):
    for page in inventory['pages']:
        raw = (directory / page['file']).read_bytes()
        if sha(raw) != page['sha256']:
            raise ValueError('Source page bytes changed during matching')
        for feature in json.loads(raw)['features']:
            yield feature, page


def text_field(value):
    return value.strip() if isinstance(value, str) else ''


def source_address(feature, source):
    a = attrs(feature)
    return {'street': text_field(a.get('ADDRESS')), 'city': text_field(a.get('CITY')),
            'state': text_field(a.get('STATE')), 'zip': zip5(text_field(a.get(SOURCES[source]['zipField'])))}


def valid_point(feature):
    p = feature.get('geometry') or {}
    x, y = p.get('x'), p.get('y')
    return (type(x) in (int, float) and type(y) in (int, float) and math.isfinite(x) and
            math.isfinite(y) and -180 <= x <= 180 and -90 <= y <= 90 and bool(x or y))


def coordinate_key(feature):
    p = feature['geometry']
    return round(p['x'], 7), round(p['y'], 7)


def coordinate_address_signature(a):
    """Audit reuse even when another native row lacks a matchable ZIP/city."""
    from address_normalization import normalize_street, source_street_line
    street = normalize_street(source_street_line(a.get('street')))
    if not street or street in {'UNKNOWN', 'NOT AVAILABLE', 'NO ADDRESS', 'UNAVAILABLE'}:
        return None
    return a.get('state', ''), street


def address_key(a, include_city=True):
    from address_normalization import normalize_street, normalized_city, source_street_line, physical_address
    # A source's absent city is preserved. Numbered street + exact state and
    # source-reported ZIP may support the explicit postal matching basis.
    check = dict(a, city=a.get('city') or 'LOCALITY NOT REPORTED') if isinstance(a, dict) else a
    if not physical_address(check):
        return None
    key = a['state'], a['zip'], normalize_street(source_street_line(a['street']))
    return (*key, normalized_city(a['city'])) if include_city else key


def placement(feature, source):
    a = attrs(feature)
    if source == 'usgs':
        return {1: 'structure-centroid', 2: 'entrance-or-egress'}.get(a.get('POINTLOCATIONTYPE'))
    return {'ONENTITY': 'on-entity', 'BLOCKFACE': 'blockface'}.get(a.get('GEOPREC'))


def distance_m(a, b):
    lat1, lon1 = map(math.radians, (a['latitude'], a['longitude']))
    lat2, lon2 = map(math.radians, (b['latitude'], b['longitude']))
    h = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin((lon2-lon1)/2)**2
    return 12742000 * math.asin(min(1, math.sqrt(h)))


def source_date(value):
    if type(value) not in (int, float) or not math.isfinite(value):
        return None
    try:
        return datetime.datetime.fromtimestamp(value / 1000, datetime.timezone.utc).date().isoformat()
    except (ValueError, OSError, OverflowError):
        return None


def make_match(feature, page, inventory, county):
    from address_normalization import source_street_line
    source = inventory['source']
    a = attrs(feature)
    address = source_address(feature, source)
    raw_date = a.get('LOADDATE') if source == 'usgs' else a.get('GEODATE')
    point = {'objectId': a['OBJECTID'], 'nativeId': a.get(SOURCES[source]['nativeIdField']),
             'sourceSha256': page['sha256'], 'sourceFile': page['file'],
             'sourceInventorySha256': inventory['sourceSha256'],
             'sourceUrl': SOURCES[source]['url'], 'sourceDate': source_date(raw_date),
             'sourceTimestamp': raw_date, 'collectionDate': inventory['collectionDate'],
             'countyFips': county, 'precision': placement(feature, source),
             'addressRole': 'source-address-location'}
    if source == 'usgs':
        point.update(featureCode=a.get('FCODE'), pointLocationType=a.get('POINTLOCATIONTYPE'),
                     sourceFeatureId=a.get('SOURCE_FEATUREID'), sourceDatasetId=a.get('SOURCE_DATASETID'),
                     sourceOriginator=a.get('SOURCE_ORIGINATOR'), sourceDescription=a.get('SOURCE_DATADESC'))
    else:
        point.update(geoPrecision=a.get('GEOPREC'), sourceCountyFips=a.get('FIPS'),
                     contactDate=source_date(a.get('CONTDATE')), contactTimestamp=a.get('CONTDATE'),
                     historicalFacilityEvidence=True)
    return {'method': SOURCES[source]['method'], 'latitude': feature['geometry']['y'],
            'longitude': feature['geometry']['x'], 'sourceAddress': address,
            'matchedAddress': ', '.join([source_street_line(address['street']), address['city'], address['state'], address['zip']]),
            'matchBasis': 'normalized-street-city-state-zip', 'point': point}


def load_locations(directory):
    raw = (directory / 'index.json').read_bytes()
    index = json.loads(raw)
    rows = []
    for chunk in index['chunks']:
        part = (directory / chunk['file']).read_bytes()
        if sha(part) != chunk['sha256']:
            raise ValueError('Primary source location shard digest mismatch')
        content = json.loads(part)
        if len(content) != chunk['count']:
            raise ValueError('Primary source location shard count mismatch')
        rows.extend(content)
    if len(rows) != 46791 or len({e['key'] for e in rows}) != 46791:
        raise ValueError('Fixed primary denominator changed')
    return rows, sha(raw)


def match_inventory(directory, inventory, entries, baseline_hash):
    source = inventory['source']
    desired = collections.defaultdict(list)
    for entry in entries:
        if entry['status'] not in ('no-match', 'unavailable', 'pending', 'not-eligible'):
            continue
        key = address_key(entry.get('address'), include_city=False)
        if key:
            desired[key].append(entry)
    source_counts = collections.Counter()
    potential = collections.defaultdict(list)
    selected_coords = set()
    for feature, page in records(directory, inventory):
        source_counts['completeRowsScanned'] += 1
        a = source_address(feature, source)
        key = address_key(a, include_city=False)
        if key not in desired:
            continue
        source_counts['exactAddressSourceRows'] += 1
        if not valid_point(feature) or not placement(feature, source):
            source_counts['unsupportedPointOrPrecision'] += 1
            continue
        selected_coords.add(coordinate_key(feature))
        potential[key].append((feature, page))
    # A second complete pass examines every source row at candidate coordinates,
    # including different states, cities, ZIP codes, categories and precisions.
    coordinate_addresses = collections.defaultdict(set)
    for feature, page in records(directory, inventory):
        source_counts['coordinateAuditRowsScanned'] += 1
        if valid_point(feature) and coordinate_key(feature) in selected_coords:
            a = source_address(feature, source)
            key = coordinate_address_signature(a)
            if key:
                coordinate_addresses[coordinate_key(feature)].add(key)
    if source_counts['completeRowsScanned'] != inventory['sourceCount'] or source_counts['coordinateAuditRowsScanned'] != inventory['sourceCount']:
        raise ValueError('Incomplete global source audit')
    identities = {c['GEOID']: c['USPS'] for c in json.loads((ROOT / 'scripts/fixtures/census-2026-county-identities.json').read_bytes())['counties'] if c['USPS'] in STATES}
    boundaries = geometry_index(json.loads(BOUNDARY.read_bytes()), identities)
    outcomes = collections.Counter()
    candidates = []
    rejected = []
    for key, targets in sorted(desired.items()):
        raw_candidates = potential.get(key, [])
        if not raw_candidates:
            outcomes['noExactSourceAddress'] += len(targets)
            continue
        valid = []
        vetoes = set()
        for feature, page in raw_candidates:
            if len(coordinate_addresses[coordinate_key(feature)]) != 1:
                vetoes.add('source-coordinate-shared-across-distinct-addresses')
                continue
            p = feature['geometry']
            county, basis = county_for([p['y'], p['x']], boundaries[key[0]])
            if not county:
                vetoes.add('source-point-county-not-resolved')
                continue
            a = attrs(feature)
            if source != 'usgs' and a.get('FIPS') != county:
                vetoes.add('native-source-county-disagreement')
                continue
            valid.append(make_match(feature, page, inventory, county))
        # Conflicting observations are not discarded to cherry-pick a passing
        # point at the same source address.
        if vetoes:
            for target in targets:
                outcomes['sourceEvidenceConflict'] += 1
                rejected.append({'key': target['key'], 'reasons': sorted(vetoes)})
            continue
        if not valid:
            outcomes['noUsablePoint'] += len(targets)
            continue
        valid.sort(key=lambda m: (m['point']['precision'] == 'blockface', m['point']['objectId']))
        chosen = valid[0]
        if (len({m['point']['countyFips'] for m in valid}) != 1 or
                any(distance_m(chosen, m) > 75 for m in valid)):
            for target in targets:
                outcomes['sourceCoordinateDisagreement'] += 1
                rejected.append({'key': target['key'], 'reasons': ['independent-source-rows-disagree']})
            continue
        for target in targets:
            county = chosen['point']['countyFips']
            if target.get('sourceCounty') and target['sourceCounty'] != county:
                outcomes['primarySourceCountyDisagreement'] += 1
                continue
            match = copy.deepcopy(chosen)
            if address_key(target['address']) != address_key(chosen['sourceAddress']):
                match['matchBasis'] = 'normalized-street-state-zip'
            candidates.append({'key': target['key'], 'source': target['source'], 'state': target['state'],
                               'originalAddress': copy.deepcopy(target['address']), 'address': copy.deepcopy(target['address']),
                               'originalStatus': target['status'], 'countyFips': county, 'match': match,
                               'corroboratingObjectIds': [m['point']['objectId'] for m in valid]})
            outcomes['accepted'] += 1
    candidates.sort(key=lambda e: e['key'])
    return {'schemaVersion': 1, 'source': source, 'sourceUrl': SOURCES[source]['url'],
            'sourceSha256': inventory['sourceSha256'], 'baselineIndexSha256': baseline_hash,
            'boundarySha256': sha(BOUNDARY.read_bytes()), 'sourceStats': dict(sorted(source_counts.items())),
            'outcomes': dict(sorted(outcomes.items())), 'candidates': candidates,
            'rejected': sorted(rejected, key=lambda e: e['key'])}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', choices=sorted(SOURCES), default='usgs')
    parser.add_argument('--directory', type=pathlib.Path, required=True)
    parser.add_argument('--locations', type=pathlib.Path, default=PUBLIC / 'locations')
    parser.add_argument('--report', type=pathlib.Path)
    parser.add_argument('--workers', type=int, default=4)
    parser.add_argument('--acquire-only', action='store_true')
    parser.add_argument('--offline', action='store_true')
    args = parser.parse_args()
    if not 1 <= args.workers <= 8:
        parser.error('--workers must be between 1 and 8')
    inventory = (validate_inventory(args.directory, json.loads((args.directory / 'inventory.json').read_bytes()))
                 if args.offline else acquire(args.source, args.directory, args.workers))
    if args.acquire_only:
        print(json.dumps({'source': args.source, 'count': inventory['sourceCount'], 'sha256': inventory['sourceSha256']}))
        return
    if not args.report:
        parser.error('--report is required unless --acquire-only')
    entries, baseline = load_locations(args.locations)
    report = match_inventory(args.directory, inventory, entries, baseline)
    write_atomic(args.report, dump(report))
    print(json.dumps({k: report[k] for k in ('source', 'sourceSha256', 'sourceStats', 'outcomes')}), flush=True)


if __name__ == '__main__':
    main()
