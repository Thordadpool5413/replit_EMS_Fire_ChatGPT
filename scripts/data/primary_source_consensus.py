"""Expand retained address candidates to every qualified native endpoint.

Selectors are allowed to choose a display point. Combined-source consensus must
still inspect the endpoints that supported that selector, not just its winner.
"""
import collections
import copy
import functools
import importlib
import json
import math
import zipfile
from backfill_provider_locations import ROOT
from address_normalization import normalize_street, source_street_line

FEDERAL = {'usgs-structure-address': 'usgs', 'hifld-ems-address': 'hifld-ems',
           'hifld-fire-address': 'hifld-fire'}
INTERPOLATED = {'tiger-address-range', 'census-address-range'}


def _simple(match, county=None, native_id=None):
    latitude, longitude = match.get('latitude'), match.get('longitude')
    county = county or match.get('point', {}).get('countyFips')
    if not all(type(v) in (int, float) and math.isfinite(v) for v in (latitude, longitude)) or not isinstance(county, str) or len(county) != 5:
        raise ValueError('Consensus witness lacks a valid coordinate/county')
    return {'method': match['method'], 'latitude': latitude, 'longitude': longitude,
            'countyFips': county, 'nativeId': native_id}


@functools.lru_cache(maxsize=1)
def _boundaries():
    from recover_neris_primary import load_boundaries
    return load_boundaries()


@functools.lru_cache(maxsize=200000)
def _county(state, latitude, longitude):
    from build_neris_station_map import county_for
    return county_for([latitude, longitude], _boundaries()[state])[0]


@functools.lru_cache(maxsize=3)
def _federal_native(source):
    from retain_federal_primary_points import evidence_directory, verify
    from stage_usgs_primary import attrs, source_address, address_key, valid_point, placement
    evidence = evidence_directory(source)
    verify(evidence)
    by_address = collections.defaultdict(list)
    with zipfile.ZipFile(evidence/'original.zip') as archive:
        inventory = json.loads(archive.read('source/inventory.json'))
        for page in inventory['pages']:
            for feature in json.loads(archive.read('source/'+page['file']))['features']:
                address = source_address(feature, source)
                key = address_key(address, include_city=False)
                if not key or not valid_point(feature) or not placement(feature, source):
                    continue
                native = attrs(feature)
                by_address[key].append({'objectId': native['OBJECTID'], 'address': address,
                                        'latitude': feature['geometry']['y'],
                                        'longitude': feature['geometry']['x']})
    return by_address


def federal_witnesses(match, target_address):
    from stage_usgs_primary import address_key
    source = FEDERAL[match['method']]
    native = _federal_native(source).get(address_key(match['sourceAddress'], include_city=False), [])
    selected = [row for row in native if row['objectId'] == match['point']['objectId']]
    if len(selected) != 1 or any(selected[0][key] != match[key] for key in ('latitude', 'longitude')):
        raise ValueError('Selected federal endpoint differs from the complete retained source')
    points = []
    for row in native:
        county = _county(row['address']['state'], row['latitude'], row['longitude'])
        if not county:
            raise ValueError('Accepted federal source cluster contains an unresolved native county')
        points.append(_simple({**match, 'latitude': row['latitude'], 'longitude': row['longitude']},
                              county, str(row['objectId'])))
    return points


@functools.lru_cache(maxsize=1)
def _nad_native():
    from stage_nad_primary import EVIDENCE, verify, native_signature
    paths = [EVIDENCE, ROOT/'scripts/data/evidence/primary-nad-extended/2026-11-26']
    bindings = {}
    records = {}
    for evidence in paths:
        if not evidence.exists():
            continue
        verify(evidence)
        with zipfile.ZipFile(evidence/'original.zip') as archive:
            report = json.loads(archive.read('report.json'))
            for candidate in report['candidates']+report['diagnosticCandidates']:
                bindings[json.dumps([candidate['address'], candidate['match']], sort_keys=True)] = candidate
            for record in json.loads(archive.read('native-matches.json')):
                key = record['native']['OID_']
                if key in records and records[key] != record:
                    raise ValueError('NAD profiles disagree about a native source row')
                records[key] = record
    by_address = collections.defaultdict(list)
    for record in records.values():
        by_address[native_signature(record['native'])].append(record)
    return bindings, by_address


def nad_witnesses(match, target_address):
    from stage_nad_primary import locality, native_point
    bindings, by_address = _nad_native()
    candidate = bindings.get(json.dumps([target_address, match], sort_keys=True))
    if not candidate:
        raise ValueError('NAD consensus target is absent from the retained candidate catalogs')
    key = (target_address['state'], normalize_street(source_street_line(target_address['street'])))
    rows = [(row, locality(target_address, row['native'])) for row in by_address.get(key, [])]
    rows = [(row, local) for row, local in rows if local]
    exact_postal = [(row, local) for row, local in rows if local[0] != 'normalized-street-city-state']
    rows = exact_postal or rows
    points = []
    for row, _ in rows:
        coordinates = native_point(row['native'])
        if not coordinates:
            raise ValueError('Accepted NAD cluster contains an invalid native coordinate')
        county = _county(target_address['state'], *coordinates)
        if not county:
            raise ValueError('Accepted NAD cluster contains an unresolved county')
        points.append(_simple({**match, 'latitude': coordinates[0], 'longitude': coordinates[1]},
                              county, row['native']['OID_']))
    if not points:
        raise ValueError('NAD selector has no native endpoint witnesses')
    return points


@functools.lru_cache(maxsize=1)
def _neris_native():
    from recover_neris_primary import load_departments, source_objects
    records, _ = source_objects(load_departments(), _boundaries())
    index = collections.defaultdict(list)
    for record in records:
        address = record['address']
        if record['addressComponent']:
            index[(address['state'], normalize_street(source_street_line(address['street'])))].append(record)
    return index


def neris_witnesses(match, target_address):
    from recover_neris_primary import matching_records, make_match
    records = [(row, basis) for row, basis in matching_records({'address': target_address}, _neris_native())
               if not row['withheldReason']]
    if not any(row['object']['id'] == match['point']['nativeId'] and
               row['coordinates'] == [match['latitude'], match['longitude']] for row, _ in records):
        raise ValueError('Selected NERIS endpoint is not in its complete native address cluster')
    return [_simple(make_match(row, basis), row['countyFips'], row['object']['id'])
            for row, basis in records]


def native_neris_vetoes(address, source_county=''):
    """Expose qualified negative native evidence for the queried physical site."""
    from recover_neris_primary import matching_records, distance
    matches = matching_records({'address': address}, _neris_native())
    reasons = {row['withheldReason'] for row, _ in matches
               if row['withheldReason'] == 'coordinate-reused-across-distinct-addresses'}
    qualified = [row for row, _ in matches if not row['withheldReason']]
    if len({row['countyFips'] for row in qualified}) > 1 or source_county and any(row['countyFips'] != source_county for row in qualified):
        reasons.add('source-county-disagreement')
    if any(distance(left['coordinates'], right['coordinates']) > 75
           for i, left in enumerate(qualified) for right in qualified[i+1:]):
        reasons.add('native-address-coordinate-disagreement')
    return sorted(reasons)


def point_witnesses(match, target_address):
    method = match['method']
    if method in FEDERAL:
        return federal_witnesses(match, target_address)
    if method == 'nad-address-point' and match.get('point', {}).get('sourceArchiveSha256'):
        return nad_witnesses(match, target_address)
    if method == 'neris-reported-address':
        return neris_witnesses(match, target_address)
    if method in ('overture-address', 'overture-place-address'):
        module = importlib.import_module('retain_overture_primary_addresses' if method == 'overture-address' else 'retain_overture_primary_places')
        rows = module.overture_coordinate_witnesses_for_match(match, target_address)
        points = []
        for row in rows:
            latitude, longitude = row['coordinatesAsReported']
            county = _county(target_address['state'], latitude, longitude)
            if not county:
                raise ValueError('Accepted Overture native endpoint has an unresolved county')
            points.append(_simple({**match, 'latitude': latitude, 'longitude': longitude}, county, row['nativeId']))
        if not points:
            raise ValueError('Overture selector has no complete native endpoint witnesses')
        return points
    return [_simple(match)]


PROFILE_WITNESSES = {
    'neris-department-geocoded-site-correlation': ('retain_neris_geocoded_sites', 'consensus_witnesses'),
    'neris-department-mailing-site-correlation': ('retain_neris_mailing_sites', 'consensus_witnesses'),
    'neris-department-mailing-geocoded-site-correlation': ('retain_neris_mailing_geocoded_sites', 'consensus_witnesses'),
    'neris-department-range-site-correlation': ('retain_neris_range_sites', 'consensus_witnesses'),
    'neris-department-mailing-range-site-correlation': ('retain_neris_range_sites', 'consensus_witnesses'),
    'neris-department-website-site-correlation': ('retain_neris_website_sites', 'consensus_witnesses'),
    'nppes-primary-address-components': ('recover_nppes_primary_components_extended', 'primary_component_witnesses'),
}


def entry_witnesses(entry):
    proof = entry.get('primaryAddressEvidence') or {}
    method = proof.get('method')
    if method == 'nppes-usfa-primary-site-correlation':
        return entry_witnesses(proof['donor']['entry'])
    profile = entry['match'].get('sourceAddressProfile')
    if profile == 'wi-mi-directional-grid-house-number':
        from retain_neris_grid_points import consensus_witnesses
        # The grid profile expands its own endpoints because ordinary numeric
        # street guards deliberately do not accept its native house syntax.
        rows = consensus_witnesses(entry)
        return [_simple(row.get('match', row), row.get('countyFips', entry['countyFips']),
                        row.get('nativeId')) for row in rows]
    if profile == 'exact-street-city-state-native-postal-difference' and not proof:
        from retain_federal_city_points import federal_city_witnesses
        rows = federal_city_witnesses(entry)
    elif method in PROFILE_WITNESSES:
        module, function = PROFILE_WITNESSES[method]
        rows = getattr(importlib.import_module(module), function)(entry)
    else:
        rows = [entry['match']]
    points = []
    for row in rows:
        match = row.get('match', row)
        address = row.get('targetAddress', entry['address'])
        # Old Census and state address-point donors have already been validated
        # as the exact final USFA parent, including the original county guard.
        if match['method'] not in FEDERAL and match['method'] not in (
                'nad-address-point', 'neris-reported-address', 'overture-address',
                'overture-place-address'):
            points.append(_simple(match, row.get('countyFips', entry['countyFips'])))
        else:
            points.extend(point_witnesses(match, address))
    unique = {json.dumps(point, sort_keys=True): point for point in points}
    if not unique:
        raise ValueError('Accepted primary candidate has no native consensus witnesses')
    return copy.deepcopy(list(unique.values()))
