#!/usr/bin/env python3
"""Recover primary records from the complete retained NERIS source inventory.

All matching is local. Direct address evidence and inferred department-site
associations are separate proof types. No station becomes a new primary record.
"""
import argparse
import collections
import copy
import json
import math
import pathlib
import re
import unicodedata
import functools
import zipfile

from address_normalization import normalize_street, source_street_line, physical_address, normalized_city
from backfill_provider_locations import ROOT, PUBLIC, STATES, sha, read_registry, native_key
from build_neris_station_map import BOUNDARY, geometry_index, county_for

DATE = '2026-11-26'
SOURCE_SHA = '1ec2a427cbc5ea1949ff731527de3c701ed9592bc4fa83fe796a54defa18880b'
INDEX_SHA = '6047f5d0471a12dba0b3079d68deebb5399d87925f7546186267af193aef3b38'
NATIONAL_SHA = '6d828632d3933a2815e497bfa189ae4af75e9b847911903b94bc4f0966b748ca'
ASSOCIATION_METHOD = 'neris-department-site-correlation'
SOURCE = PUBLIC / 'neris-stations'
LOCATIONS = PUBLIC / 'locations'


def dump(value):
    return (json.dumps(value, sort_keys=True, ensure_ascii=True, separators=(',', ':'), allow_nan=False) + '\n').encode()


def source_zip(value):
    text = str(value or '').strip()
    return text[:5] if re.fullmatch(r'\d{5}(?:[- ]?\d{4})?', text) else ''


def source_address(parts):
    return native_address(parts)[0]


def native_address(parts):
    """Select a native physical line explicitly, retaining both raw source lines.

    Joining a physical street and a PO box would hide the reported HQ address.
    Conversely, two different physical lines are not interchangeable locations.
    """
    base = {'city': str(parts[2] or '').strip(), 'state': parts[3], 'zip': source_zip(parts[4])}
    lines = [str(x or '').strip() for x in parts[:2]]
    physical = [numbered_source_address({**base, 'street': line}) for line in lines]
    if not any(physical):
        return {**base, 'street': ', '.join(line for line in lines if line)}, None, False
    selected = 0 if physical[0] else 1
    other = 1 - selected
    conflict = all(physical) and normalize_street(source_street_line(lines[0])) != normalize_street(source_street_line(lines[1]))
    if not lines[other]:
        kind = 'empty'
    elif physical[other]:
        kind = 'distinct-physical-address' if conflict else 'duplicate-physical-address'
    elif re.search(r'\b(?:P\s*\.?\s*O\s*\.?\s*BOX|POST OFFICE BOX|PMB|PRIVATE MAILBOX)\b', lines[other], re.I):
        kind = 'mailing-address'
    elif re.fullmatch(r'(?:STE|SUITE|UNIT|APT|APARTMENT|FL|FLOOR|RM|ROOM|BLDG|BUILDING|DEPT|DEPARTMENT|#)\s+[A-Z0-9-]+', lines[other], re.I):
        kind = 'secondary-designator'
    else:
        kind = 'nonphysical-text'
    component = {'sourceField': 'line'+str(selected+1),
                 'rule': 'native-physical-line'+str(selected+1), 'otherLineKind': kind}
    return {**base, 'street': lines[selected]}, component, conflict


def numbered_source_address(address):
    # Native missing ZIP is allowed only as explicitly city-based evidence.
    # The target primary address must always have its original valid ZIP.
    return bool(address and address['state'] in STATES and
                physical_address({**address, 'zip': address['zip'] or '00000',
                                  'city': address['city'] or 'SOURCE CITY NOT REPORTED'}))


def valid_point(point):
    return (isinstance(point, list) and len(point) == 2 and
            all(type(x) in (int, float) and math.isfinite(x) for x in point) and
            abs(point[0]) <= 90 and abs(point[1]) <= 180 and any(point))


def distance(a, b):
    y1, x1 = map(math.radians, a)
    y2, x2 = map(math.radians, b)
    h = math.sin((y2-y1)/2)**2 + math.cos(y1)*math.cos(y2)*math.sin((x2-x1)/2)**2
    return 12742000 * math.asin(min(1, math.sqrt(h)))


def identity_name(value):
    """Normalize complete names, without deleting jurisdiction/mission tokens."""
    text = unicodedata.normalize('NFKC', str(value or '')).upper().replace('&', ' AND ')
    words = re.sub(r'[^A-Z0-9]+', ' ', text).split()
    aliases = {'DEPT': 'DEPARTMENT', 'DEPTS': 'DEPARTMENTS', 'VOL': 'VOLUNTEER',
               'VFD': 'VOLUNTEER FIRE DEPARTMENT', 'FD': 'FIRE DEPARTMENT',
               'CO': 'COMPANY', 'DIST': 'DISTRICT', 'TWP': 'TOWNSHIP',
               'ASSN': 'ASSOCIATION', 'INCORPORATED': 'INC'}
    return ' '.join(aliases.get(word, word) for word in words)


def identity_key(name, city, state, postal):
    n = identity_name(name)
    c = normalized_city(city or '')
    z = source_zip(postal)
    generic = {'FIRE', 'DEPARTMENT', 'VOLUNTEER', 'COMPANY', 'DISTRICT', 'AND',
               'RESCUE', 'EMS', 'EMERGENCY', 'MEDICAL', 'SERVICE', 'SERVICES',
               'INC', 'ASSOCIATION', 'THE', 'PROTECTION', 'COMMUNITY'}
    return (n, c, state, z) if n and c and z and state in STATES and set(n.split())-generic else None


def load_departments():
    raw = (SOURCE/'index.json').read_bytes()
    idx = json.loads(raw)
    if sha(raw) != INDEX_SHA or idx['sourceSha256'] != SOURCE_SHA:
        raise ValueError('NERIS source edition changed')
    rows = []
    for chunk in idx['chunks']:
        data = (SOURCE/chunk['file']).read_bytes()
        part = json.loads(data)
        if sha(data) != chunk['sha256'] or len(part) != chunk['departmentCount'] or sum(len(d['stations']) for d in part) != chunk['stationCount']:
            raise ValueError('NERIS complete source inventory changed')
        rows.extend(part)
    if len(rows) != 30672 or sum(len(d['stations']) for d in rows) != 65970:
        raise ValueError('Incomplete nationwide NERIS inventory')
    ids = [d['id'] for d in rows] + [s['id'] for d in rows for s in d['stations']]
    if len(ids) != len(set(ids)):
        raise ValueError('Duplicate native NERIS identity')
    return rows


def load_primary():
    idx = json.loads((LOCATIONS/'index.json').read_bytes())
    rows = []
    for chunk in idx['chunks']:
        data = (LOCATIONS/chunk['file']).read_bytes()
        if sha(data) != chunk['sha256']:
            raise ValueError('Primary source snapshot changed')
        rows.extend(json.loads(data))
    if len(rows) != 46791 or len({r['key'] for r in rows}) != 46791:
        raise ValueError('Original primary denominator changed')
    return rows


def source_objects(departments, boundaries):
    """Index every native object before selecting targets or checking uniqueness."""
    raw_objects = []
    reuse = collections.defaultdict(set)
    reuse_postal = collections.defaultdict(lambda: collections.defaultdict(set))
    stats = collections.Counter()
    for department in departments:
        for obj, kind in [(department, 'department')] + [(s, 'station') for s in department['stations']]:
            if kind == 'station' and obj['parentId'] != department['id']:
                raise ValueError('Native station parent changed')
            a, component, component_conflict = native_address(obj['address'])
            point = obj['coordinates']
            numbered = numbered_source_address(a)
            if numbered and valid_point(point):
                # City aliases within one known ZIP can describe the same
                # building. Different known ZIPs remain conflicting locality
                # evidence even when house/street text is identical.
                signature = (a['state'], normalize_street(source_street_line(a['street'])))
                reuse[tuple(point)].add(signature)
                if a['zip']:
                    reuse_postal[tuple(point)][signature].add(a['zip'])
            raw_objects.append((obj, kind, department, a, point, numbered, component, component_conflict))
    result = []
    coordinates = {}
    for obj, kind, department, a, point, numbered, component, component_conflict in raw_objects:
        reason = None
        if component_conflict:
            reason = 'conflicting-native-address-lines'
        elif not numbered:
            reason = 'nonphysical-source-address'
        elif not valid_point(point):
            reason = 'no-source-coordinate'
        elif len(reuse[tuple(point)]) != 1 or any(len(zips) > 1 for zips in reuse_postal[tuple(point)].values()):
            reason = 'coordinate-reused-across-distinct-addresses'
        elif kind == 'station' and obj.get('parentNameConflict'):
            reason = 'native-parent-name-conflict'
        county = None
        if not reason:
            cache_key = (a['state'], *point)
            if cache_key not in coordinates:
                coordinates[cache_key] = county_for(point, boundaries[a['state']])
            county, basis = coordinates[cache_key]
            if not county:
                reason = basis
        stats[reason or 'eligible-native-address-point'] += 1
        result.append({'object': obj, 'kind': kind, 'department': department,
                       'address': a, 'coordinates': point, 'countyFips': county,
                       'addressComponent': component, 'withheldReason': reason})
    return result, dict(sorted(stats.items()))


def address_basis(target, source):
    if not physical_address(target) or not numbered_source_address(source):
        return None
    if target['state'] != source['state'] or normalize_street(source_street_line(target['street'])) != normalize_street(source_street_line(source['street'])):
        return None
    city = normalized_city(target['city']) == normalized_city(source['city'])
    postal = target['zip'] == source['zip'] and bool(source['zip'])
    if city and postal:
        return 'normalized-street-city-state-zip'
    if postal:
        return 'normalized-street-state-zip'
    if city:
        return 'normalized-street-city-state'
    return None


def make_match(record, basis):
    obj, address = record['object'], record['address']
    return {'latitude': record['coordinates'][0], 'longitude': record['coordinates'][1],
            'matchedAddress': ', '.join((source_street_line(address['street']), address['city'], address['state'], address['zip'])),
            'method': 'neris-reported-address', 'matchBasis': basis,
            'sourceAddress': copy.deepcopy(address),
            'point': {'objectId': obj['oid'], 'nativeId': obj['id'],
                      'parentId': record['department']['id'], 'sourceKind': record['kind'],
                      'sourceDate': DATE, 'sourceSha256': SOURCE_SHA,
                      'countyFips': record['countyFips'],
                      'coordinatesAsReported': copy.deepcopy(record['coordinates']),
                      'addressAsReported': copy.deepcopy(obj['address']),
                      'addressComponent': copy.deepcopy(record['addressComponent'])}}


def matching_records(entry, index):
    a = entry.get('address')
    if not physical_address(a):
        return []
    key = (a['state'], normalize_street(source_street_line(a['street'])))
    matches = [(r, address_basis(a, r['address'])) for r in index.get(key, [])]
    matches = [(r, basis) for r, basis in matches if basis]
    # A postal city may encompass multiple streets with the same name in
    # different ZIPs. Exact source ZIP is the stronger locality evidence. Its
    # invalid rows remain in this pool and cannot be escaped by city fallback.
    postal_matches = [(r, basis) for r, basis in matches if basis != 'normalized-street-city-state']
    if postal_matches:
        matches = postal_matches
    return matches


def direct_selection(entry, index):
    a = entry.get('address')
    if not physical_address(a):
        return None, 'original-address-not-physical'
    matches = matching_records(entry, index)
    if not matches:
        return None, 'no-matching-source-address'
    # Retain every matching source row for conflict checks, including invalid
    # rows. A source with reused coordinates cannot be rescued by choosing it.
    eligible = [(r, basis) for r, basis in matches if not r['withheldReason']]
    if not eligible:
        return None, 'all-native-address-evidence-withheld'
    counties = {r['countyFips'] for r, _ in eligible}
    if len(counties) != 1 or entry.get('sourceCounty') and entry['sourceCounty'] not in counties:
        return None, 'source-county-disagreement'
    order = {'normalized-street-city-state-zip': 0, 'normalized-street-state-zip': 1, 'normalized-street-city-state': 2}
    eligible.sort(key=lambda pair: (order[pair[1]], pair[0]['kind'] != 'department', pair[0]['object']['id']))
    selected, basis = eligible[0]
    if any(distance(selected['coordinates'], r['coordinates']) > 75 for r, _ in eligible[1:]):
        return None, 'native-address-coordinate-disagreement'
    return {'key': entry['key'], 'originalAddress': copy.deepcopy(a), 'address': copy.deepcopy(a),
            'countyFips': selected['countyFips'], 'match': make_match(selected, basis),
            'corroboratingNativeIds': sorted(r['object']['id'] for r, _ in eligible)}, None


def site_selection(entry, department, objects, correlation):
    headquarters = objects[department['id']]
    role = 'reported-headquarters'
    if numbered_source_address(headquarters['address']):
        selected = headquarters
    else:
        if department['reportedStationCount'] != 1 or len(department['stations']) != 1:
            return None, 'no-physical-hq-or-sole-station'
        selected = objects[department['stations'][0]['id']]
        role = 'sole-reported-station'
    if selected['withheldReason']:
        return None, 'site-' + selected['withheldReason']
    a = selected['address']
    if not physical_address(a) or a['state'] != entry['state']:
        return None, 'site-not-physical-in-source-state'
    if entry.get('sourceCounty') and entry['sourceCounty'] != selected['countyFips']:
        return None, 'site-source-county-disagreement'
    # An available physical headquarters is the reported primary site. A
    # station is never substituted just because its coordinate looks better.
    proof = {'method': ASSOCIATION_METHOD, 'association': 'inferred',
             'endUserValidationRequired': True, 'siteRole': role,
             'originalAddress': copy.deepcopy(entry.get('address')),
             'originalStatus': entry['status'], 'sourceSha256': SOURCE_SHA,
             'nerisIndexSha256': INDEX_SHA, 'nationalRegistrySha256': NATIONAL_SHA,
             'correlation': correlation,
             'department': {'id': department['id'], 'objectId': department['oid'],
                            'name': department['name'], 'state': department['state'],
                            'addressAsReported': copy.deepcopy(department['address']),
                            'coordinatesAsReported': copy.deepcopy(department['coordinates']),
                            'reportedStationCount': department['reportedStationCount'],
                            'observedStationCount': len(department['stations'])},
             'site': {'id': selected['object']['id'], 'objectId': selected['object']['oid'],
                      'sourceKind': selected['kind'],
                      'coordinatesAsReported': copy.deepcopy(selected['coordinates']),
                      'addressAsReported': copy.deepcopy(selected['object']['address'])}}
    return {'key': entry['key'], 'originalAddress': copy.deepcopy(entry.get('address')),
            'address': copy.deepcopy(a), 'countyFips': selected['countyFips'],
            'match': make_match(selected, 'normalized-street-city-state-zip'),
            'primaryAddressEvidence': proof}, None


def generate_candidates(entries, departments, national_rows, boundaries):
    source, source_stats = source_objects(departments, boundaries)
    index = collections.defaultdict(list)
    by_id = {}
    for row in source:
        by_id[row['object']['id']] = row
        if numbered_source_address(row['address']):
            index[(row['address']['state'], normalize_street(source_street_line(row['address']['street'])))].append(row)
    native_identity = collections.defaultdict(list)
    primary_identity = collections.defaultdict(list)
    national_by_key = {}
    for row in national_rows:
        if row[1] != 'USFA' or not native_key(row):
            continue
        national_by_key[native_key(row)] = row
        key = identity_key(row[2], row[4], row[3], row[5])
        if key:
            primary_identity[key].append(native_key(row))
    for department in departments:
        key = identity_key(department['name'], department['address'][2], department['state'], department['address'][4])
        if key:
            native_identity[key].append(department)
    outcomes = collections.Counter()
    candidates, legacy_audit, coordinate_conflicts = [], [], []
    def record_conflict(entry, reason):
        if reason not in ('native-address-coordinate-disagreement', 'legacy-point-disagrees-with-native-address'):
            return
        matches = [(r, basis) for r, basis in matching_records(entry, index) if not r['withheldReason']]
        coordinate_conflicts.append({'key': entry['key'], 'originalAddress': copy.deepcopy(entry['address']),
                                    'reason': reason, 'nativePoints': [make_match(r, basis) for r, basis in sorted(matches, key=lambda pair: pair[0]['object']['id'])]})
    for entry in sorted(entries, key=lambda value: value['key']):
        original_method = (entry.get('match') or {}).get('method')
        if entry['status'] == 'mapped':
            if original_method == 'neris-reported-address':
                candidate, reason = direct_selection(entry, index)
                original_point = [entry['match']['latitude'], entry['match']['longitude']]
                if candidate and (candidate['countyFips'] != entry['countyFips'] or distance(original_point, [candidate['match']['latitude'], candidate['match']['longitude']]) > 75):
                    candidate, reason = None, 'legacy-point-disagrees-with-native-address'
                legacy_audit.append({'key': entry['key'], 'accepted': bool(candidate),
                                     'reason': reason, 'candidate': candidate})
                if not candidate:
                    record_conflict(entry, reason)
            continue
        if entry['status'] in ('historical', 'review'):
            continue
        candidate, reason = direct_selection(entry, index)
        if candidate:
            candidates.append(candidate)
            outcomes['direct-address'] += 1
            continue
        outcomes['direct-' + reason] += 1
        original_reason = reason
        native = national_by_key.get(entry['key'])
        if not native or entry['source'] != 'USFA' or native[2] != entry['name']:
            record_conflict(entry, original_reason)
            continue
        key = identity_key(native[2], native[4], native[3], native[5])
        departments_for_key = native_identity.get(key, [])
        if not key or len(departments_for_key) != 1 or primary_identity[key] != [entry['key']]:
            outcomes['association-no-reciprocal-unique-identity'] += 1
            record_conflict(entry, original_reason)
            continue
        department = departments_for_key[0]
        correlation = {'nameBasis': 'normalized-complete-name-city-state-zip',
                       'primaryKey': entry['key'], 'primaryName': native[2],
                       'primaryCity': native[4], 'primaryPostalCode': native[5],
                       'normalizedName': key[0], 'normalizedCity': key[1],
                       'state': key[2], 'zip': key[3],
                       'reciprocalSourceCount': 1, 'reciprocalPrimaryCount': 1}
        candidate, reason = site_selection(entry, department, by_id, correlation)
        if candidate:
            site_entry = {**entry, 'address': candidate['address']}
            support, support_reason = direct_selection(site_entry, index)
            selected_point = [candidate['match']['latitude'], candidate['match']['longitude']]
            if not support or any(distance(selected_point, by_id[native_id]['coordinates']) > 75 for native_id in support['corroboratingNativeIds']):
                candidate = None
                reason = 'site-address-' + (support_reason or 'native-coordinate-disagreement')
        if candidate:
            candidates.append(candidate)
            outcomes[candidate['primaryAddressEvidence']['siteRole']] += 1
        else:
            outcomes[reason] += 1
            record_conflict(entry, original_reason)
    return {'schemaVersion': 1, 'sourceSha256': SOURCE_SHA, 'nerisIndexSha256': INDEX_SHA,
            'nationalRegistrySha256': NATIONAL_SHA, 'originalPrimaryCount': len(entries),
            'nativeDepartmentCount': len(departments),
            'nativeStationCount': sum(len(d['stations']) for d in departments),
            'sourceStats': source_stats, 'outcomes': dict(sorted(outcomes.items())),
            'candidates': candidates, 'legacyAudit': legacy_audit,
            'originalAddressCoordinateConflicts': coordinate_conflicts,
            'limitations': 'NERIS coordinates are reported source points; inferred department-site associations require end-user validation. No operational status or rooftop accuracy is certified.'}


@functools.lru_cache(maxsize=1)
def validated_catalog():
    """Replay once against complete retained source inventories, then bind by key."""
    from retain_neris_primary import DEFAULT, verify
    verify(DEFAULT)
    with zipfile.ZipFile(DEFAULT/'original.zip') as archive:
        inputs = json.loads(archive.read('inputs.json'))
        report = json.loads(archive.read('candidates.json'))
    candidates = {c['key']: c for c in report['candidates']}
    candidates.update({r['key']: r['candidate'] for r in report['legacyAudit'] if r['accepted']})
    originals = {r['key']: r for r in inputs['entries']}
    national = {native_key(r): r for r in inputs['nationalRows'] if native_key(r)}
    return candidates, originals, national


def validate_candidate(candidate, original_entry, national_row=None):
    """Validate exact proof, coordinates, source fields and original identity."""
    try:
        candidates, originals, national = validated_catalog()
        key = original_entry['key']
        return (candidate == candidates.get(key) and original_entry == originals.get(key) and
                (national_row is None or national_row == national.get(key)))
    except (ValueError, KeyError, TypeError, OSError, zipfile.BadZipFile):
        return False


def validate_primary_evidence(proof, entry, national_row=None):
    """Bind an applied association to the retained source-validated candidate."""
    try:
        candidates, originals, national = validated_catalog()
        candidate = candidates.get(entry['key'])
        original = originals.get(entry['key'])
        return bool(candidate and original and candidate.get('primaryAddressEvidence') == proof and
                    all(entry.get(k) == original.get(k) for k in ('key', 'name', 'state', 'source', 'sourceCounty')) and
                    all(entry.get(k) == candidate.get(k) for k in ('address', 'countyFips', 'match')) and
                    (national_row is None or national_row == national.get(entry['key'])))
    except (ValueError, KeyError, TypeError, OSError, zipfile.BadZipFile):
        return False


def load_boundaries():
    identities = {c['GEOID']: c['USPS'] for c in json.loads((ROOT/'scripts/fixtures/census-2026-county-identities.json').read_bytes())['counties'] if c['USPS'] in STATES}
    return geometry_index(json.loads(BOUNDARY.read_bytes()), identities)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=pathlib.Path, required=True)
    parser.add_argument('--inputs', type=pathlib.Path)
    args = parser.parse_args()
    entries = load_primary()
    if sha((PUBLIC/'national/index.json').read_bytes()) != NATIONAL_SHA:
        raise ValueError('National native identity snapshot changed')
    _, national = read_registry()
    report = generate_candidates(entries, load_departments(), national, load_boundaries())
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(dump(report))
    if args.inputs:
        args.inputs.parent.mkdir(parents=True, exist_ok=True)
        args.inputs.write_bytes(dump({'entries': entries, 'nationalRows': national}))
    print(json.dumps({'candidateCount': len(report['candidates']), 'outcomes': report['outcomes'],
                      'legacyAccepted': sum(r['accepted'] for r in report['legacyAudit']),
                      'legacyWithheld': sum(not r['accepted'] for r in report['legacyAudit']),
                      'sourceStats': report['sourceStats']}), flush=True)


if __name__ == '__main__':
    main()
