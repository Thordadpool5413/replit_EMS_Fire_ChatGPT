#!/usr/bin/env python3
"""Exact native WI/MI directional grid addresses, without changing house tokens."""
import argparse
import collections
import copy
import json
import pathlib
import re
from backfill_provider_locations import sha
from address_normalization import normalize_street, normalized_city, source_street_line
from recover_neris_primary import (dump, load_departments, load_boundaries, numbered_source_address,
    source_zip, valid_point, distance, county_for, make_match, SOURCE_SHA, INDEX_SHA)
from recover_neris_mailing_sites import source_inputs

PROFILE = 'wi-mi-directional-grid-house-number'
GRID = re.compile(r'^[NSEW][0-9]+(?:[NSEW][0-9]+)?\s+\S', re.I)


def is_grid_address(address):
    return bool(isinstance(address, dict) and address.get('state') in ('WI', 'MI') and
                isinstance(address.get('street'), str) and GRID.match(address['street'].strip()) and
                isinstance(address.get('city'), str) and address['city'].strip() and
                isinstance(address.get('zip'), str) and re.fullmatch(r'\d{5}', address['zip']))


def admissible(address):
    if numbered_source_address(address):
        return True
    return is_grid_address({**address, 'city': address['city'] or 'SOURCE CITY NOT REPORTED',
                            'zip': address['zip'] or '00000'})


def native_component(parts):
    base = {'city': str(parts[2] or '').strip(), 'state': parts[3], 'zip': source_zip(parts[4])}
    lines = [str(value or '').strip() for value in parts[:2]]
    physical = [admissible({**base, 'street': line}) for line in lines]
    if not any(physical):
        return {**base, 'street': ', '.join(line for line in lines if line)}, None, False
    selected = 0 if physical[0] else 1; other = 1-selected
    conflict = all(physical) and normalize_street(source_street_line(lines[0])) != normalize_street(source_street_line(lines[1]))
    if not lines[other]: kind = 'empty'
    elif physical[other]: kind = 'distinct-physical-address' if conflict else 'duplicate-physical-address'
    elif re.search(r'\b(?:P\s*\.?\s*O\s*\.?\s*BOX|POST OFFICE BOX|PMB|PRIVATE MAILBOX)\b', lines[other], re.I): kind = 'mailing-address'
    elif re.fullmatch(r'(?:STE|SUITE|UNIT|APT|APARTMENT|FL|FLOOR|RM|ROOM|BLDG|BUILDING|DEPT|DEPARTMENT|#)\s+[A-Z0-9-]+', lines[other], re.I): kind = 'secondary-designator'
    else: kind = 'nonphysical-text'
    component = {'sourceField': 'line'+str(selected+1), 'rule': 'native-grid-line'+str(selected+1), 'otherLineKind': kind}
    return {**base, 'street': lines[selected]}, component, conflict


def source_records(departments, boundaries):
    raw = []; reuse = collections.defaultdict(set); postal = collections.defaultdict(lambda: collections.defaultdict(set))
    for department in departments:
        for obj, kind in [(department, 'department')] + [(station, 'station') for station in department['stations']]:
            if kind == 'station' and obj['parentId'] != department['id']:
                raise ValueError('Native station parent changed')
            address, component, conflict = native_component(obj['address'])
            point = obj['coordinates']
            if valid_point(point):
                for line in obj['address'][:2]:
                    candidate = {**address, 'street': str(line or '').strip()}
                    if admissible(candidate):
                        signature = (candidate['state'], normalize_street(source_street_line(candidate['street'])))
                        reuse[tuple(point)].add(signature)
                        if candidate['zip']: postal[tuple(point)][signature].add(candidate['zip'])
            raw.append((obj, kind, department, address, point, component, conflict))
    result = []; counties = {}; counts = collections.Counter()
    for obj, kind, department, address, point, component, conflict in raw:
        issue = None; county = None
        if conflict: issue = 'conflicting-native-address-lines'
        elif not component: issue = 'nonphysical-source-address'
        elif not valid_point(point): issue = 'no-source-coordinate'
        elif len(reuse[tuple(point)]) != 1 or any(len(values) > 1 for values in postal[tuple(point)].values()): issue = 'coordinate-reused-across-distinct-addresses'
        elif kind == 'station' and obj.get('parentNameConflict'): issue = 'native-parent-name-conflict'
        if issue is None:
            key = (address['state'], *point)
            if key not in counties: counties[key] = county_for(point, boundaries[address['state']])
            county, basis = counties[key]
            if not county: issue = basis
        counts[issue or 'eligible-native-point'] += 1
        result.append({'object': obj, 'kind': kind, 'department': department, 'address': address,
                       'coordinates': point, 'addressComponent': component, 'countyFips': county, 'withheldReason': issue})
    return result, dict(sorted(counts.items()))


def select(entry, index):
    address = entry.get('address')
    if not is_grid_address(address): return None, 'original-address-outside-grid-profile', []
    key = (address['state'], normalize_street(source_street_line(address['street'])), address['zip'])
    matches = index.get(key, [])
    if not matches: return None, 'no-native-grid-address', []
    eligible = [record for record in matches if not record['withheldReason']]
    if any(record['withheldReason'] in ('coordinate-reused-across-distinct-addresses', 'conflicting-native-address-lines') for record in matches):
        return None, 'native-grid-coordinate-or-address-conflict', eligible
    if not eligible: return None, 'no-qualified-native-grid-point', []
    if len({record['countyFips'] for record in eligible}) != 1 or entry.get('sourceCounty') and any(record['countyFips'] != entry['sourceCounty'] for record in eligible):
        return None, 'native-grid-source-county-disagreement', eligible
    if any(distance(left['coordinates'], right['coordinates']) > 75 for i, left in enumerate(eligible) for right in eligible[i+1:]):
        return None, 'native-grid-coordinate-disagreement', eligible
    exact_city = [record for record in eligible if normalized_city(record['address']['city']) == normalized_city(address['city'])]
    if not exact_city: return None, 'no-exact-native-grid-city', eligible
    exact_city.sort(key=lambda row: (row['kind'] != 'department', row['object']['id']))
    selected = exact_city[0]
    match = make_match(selected, 'normalized-street-city-state-zip')
    match['sourceAddressProfile'] = PROFILE
    return {'key': entry['key'], 'source': entry['source'], 'state': entry['state'],
            'originalAddress': copy.deepcopy(address), 'address': copy.deepcopy(address), 'originalStatus': entry['status'],
            'countyFips': selected['countyFips'], 'match': match,
            'corroboratingNativeIds': sorted(record['object']['id'] for record in eligible)}, None, eligible


def generate(inputs, core, departments, boundaries):
    entries = inputs['entries']
    if len(entries) != 46791 or len({entry['key'] for entry in entries}) != 46791:
        raise ValueError('Original primary identity denominator changed')
    records, source_stats = source_records(departments, boundaries)
    index = collections.defaultdict(list)
    for record in records:
        address = record['address']
        if record['addressComponent']:
            index[(address['state'], normalize_street(source_street_line(address['street'])), address['zip'])].append(record)
    withheld_legacy = {row['key'] for row in core['legacyAudit'] if not row['accepted']}
    candidates, rejected, vetoes = [], [], []; eligible_count = 0
    for entry in sorted(entries, key=lambda row: row['key']):
        if not is_grid_address(entry.get('address')) or entry['status'] in ('historical', 'review') or entry['status'] == 'mapped' and entry['key'] not in withheld_legacy:
            continue
        eligible_count += 1
        candidate, reason, points = select(entry, index)
        if candidate:
            candidates.append(candidate); continue
        rejection = {'key': entry['key'], 'reason': reason, 'targetAddress': entry['address'],
                     'qualifiedNativePoints': [make_match(record, 'normalized-street-city-state-zip') for record in points]}
        rejected.append(rejection)
        if reason in ('native-grid-coordinate-or-address-conflict', 'native-grid-source-county-disagreement', 'native-grid-coordinate-disagreement'):
            vetoes.append({'originalPrimaryKey': entry['key'], 'targetAddress': entry['address'], 'source': 'neris-grid', 'reasons': [reason]})
    return {'schemaVersion': 1, 'profile': PROFILE, 'sourceSha256': SOURCE_SHA, 'nerisIndexSha256': INDEX_SHA,
            'originalPrimaryIdentityCount': 46791, 'eligibleOriginalGridAddresses': eligible_count,
            'completeNativeObjectCount': len(records), 'sourceStats': source_stats,
            'candidates': candidates, 'rejected': rejected, 'consensusVetoes': vetoes,
            'limitations': 'Exact unchanged WI/MI directional grid house tokens with native city/state/ZIP and source-reported coordinates. All numeric and grid native source addresses participate in coordinate reuse. No operational status or rooftop accuracy is certified.'}


def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--output', type=pathlib.Path, required=True); args = parser.parse_args()
    inputs, core = source_inputs(); report = generate(inputs, core, load_departments(), load_boundaries())
    args.output.parent.mkdir(parents=True, exist_ok=True); args.output.write_bytes(dump(report))
    print(json.dumps({'candidateCount': len(report['candidates']), 'eligibleOriginalGridAddresses': report['eligibleOriginalGridAddresses'],
                      'completeNativeObjectCount': report['completeNativeObjectCount']}), flush=True)

if __name__ == '__main__':
    main()
