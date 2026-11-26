#!/usr/bin/env python3
"""Reciprocally bind complete native mailing identities to reported NERIS sites."""
import argparse
import collections
import copy
import json
import pathlib
import re
import zipfile

from backfill_provider_locations import native_key, sha
from address_normalization import physical_address, normalize_street, normalized_city, source_street_line
from recover_neris_primary import (dump, load_departments, load_boundaries, identity_key,
    native_address, source_objects, direct_selection, site_selection, distance,
    SOURCE_SHA, INDEX_SHA, NATIONAL_SHA)
from retain_neris_primary import DEFAULT as CORE_EVIDENCE
from retain_neris_mailing_source import SOURCE as MAILING_SHA, source_catalog
from stage_neris_mailing_supplement import PHYSICAL_FIELDS, MAILING_FIELDS

METHOD = 'neris-department-mailing-site-correlation'
GEOCODED_METHOD = 'neris-department-mailing-geocoded-site-correlation'


def mailing_street(value):
    if not isinstance(value, str):
        return ''
    value = re.sub(r'\bP\s*\.?\s*O\s*\.?\s*BOX\b', 'PO BOX', value, flags=re.I)
    value = re.sub(r'\bPOST OFFICE BOX\b', 'PO BOX', value, flags=re.I)
    return normalize_street(source_street_line(value))


def source_inputs():
    with zipfile.ZipFile(CORE_EVIDENCE/'original.zip') as archive:
        return tuple(json.loads(archive.read(name)) for name in ('inputs.json', 'candidates.json'))


def identity_indices(inputs, supplement):
    source_local = collections.defaultdict(set)
    source_street = collections.defaultdict(set)
    primary_local = collections.defaultdict(set)
    primary_street = collections.defaultdict(set)
    originals = {row['key']: row for row in inputs['entries']}
    national = {}
    attributes = {}
    for feature in supplement['features']:
        a = feature['attributes']; oid = a['OBJECTID']; attributes[oid] = a
        for fields in (PHYSICAL_FIELDS, MAILING_FIELDS):
            raw = [a[field] for field in fields]
            key = identity_key(a['name'], raw[2], raw[3], raw[4])
            if not key:
                continue
            source_local[key].add(oid)
            for line in raw[:2]:
                street = mailing_street(line)
                if street:
                    source_street[(key, street)].add(oid)
    for row in inputs['nationalRows']:
        if row[1] != 'USFA':
            continue
        native = native_key(row)
        if native:
            national[native] = row
        key = identity_key(row[2], row[4], row[3], row[5])
        if not key:
            continue
        primary_local[key].add(native or row[0])
        entry = originals.get(native)
        a = entry.get('address') if entry else None
        if a and a['state'] == key[2] and a['zip'] == key[3] and normalized_city(a['city']) == key[1]:
            street = mailing_street(a['street'])
            if street:
                primary_street[(key, street)].add(native)
    return {'sourceLocal': source_local, 'sourceStreet': source_street, 'primaryLocal': primary_local,
            'primaryStreet': primary_street, 'national': national, 'attributes': attributes}


def correlate(entry, indices, departments_by_oid):
    row = indices['national'].get(entry['key'])
    if not row or row[2] != entry['name'] or row[3] != entry['state'] or row[6] != entry.get('sourceCounty', ''):
        return None
    identity = identity_key(row[2], row[4], row[3], row[5])
    if not identity:
        return None
    original = entry.get('address')
    street = mailing_street(original['street']) if original else ''
    options = []
    if street and original['state'] == identity[2] and original['zip'] == identity[3] and normalized_city(original['city']) == identity[1]:
        sources = indices['sourceStreet'].get((identity, street), set())
        if len(sources) == 1 and indices['primaryStreet'].get((identity, street)) == {entry['key']}:
            options.append((next(iter(sources)), 'normalized-complete-name-mailing-street-city-state-zip', street))
    sources = indices['sourceLocal'].get(identity, set())
    if len(sources) == 1 and indices['primaryLocal'].get(identity) == {entry['key']}:
        options.append((next(iter(sources)), 'normalized-complete-name-mailing-city-state-zip', None))
    for oid, basis, matched_street in options:
        department = departments_by_oid.get(oid)
        if not department:
            continue
        attrs = indices['attributes'][oid]
        raw = [attrs[field] for field in MAILING_FIELDS]
        if identity_key(attrs['name'], raw[2], raw[3], raw[4]) != identity:
            continue
        matching_lines = [i for i in (0, 1) if matched_street and mailing_street(raw[i]) == matched_street]
        if matched_street and not matching_lines:
            continue
        correlation = {'nameBasis': basis, 'primaryKey': entry['key'], 'primaryName': row[2],
                       'primaryCity': row[4], 'primaryPostalCode': row[5], 'normalizedName': identity[0],
                       'normalizedCity': identity[1], 'state': identity[2], 'zip': identity[3],
                       'reciprocalSourceCount': 1, 'reciprocalPrimaryCount': 1,
                       'localityRole': 'native-mailing', 'sourceIdentityInventoryCount': 30700,
                       'primaryIdentityInventoryCount': 27117, 'sourceAlternatives': ['physical', 'mailing'],
                       'nativeMailingAddressAsReported': raw,
                       'nativeMailingField': MAILING_FIELDS[matching_lines[0]] if matching_lines else None,
                       'normalizedMailingStreet': matched_street}
        return department, correlation
    return None


def diagnostic_target(entry, department, correlation, reason, withheld_legacy):
    address, component, conflict = native_address(department['address'])
    obj, kind, role, suffix = department, 'department', 'reported-headquarters', '@NERIS-MAILING-HQ'
    if conflict:
        return None
    if component is None:
        if department['reportedStationCount'] != 1 or len(department['stations']) != 1:
            return None
        obj = department['stations'][0]
        if obj['parentId'] != department['id'] or obj.get('parentNameConflict'):
            return None
        kind, role, suffix = 'station', 'sole-reported-station', '@NERIS-MAILING-SOLE'
        address, component, conflict = native_address(obj['address'])
    if conflict or not component or not physical_address(address) or address['state'] != entry['state']:
        return None
    proof = {'method': GEOCODED_METHOD, 'association': 'inferred', 'endUserValidationRequired': True,
             'siteRole': role, 'diagnosticOnly': True, 'originalAddress': copy.deepcopy(entry.get('address')),
             'originalStatus': entry['status'], 'originalMappingWithheld': entry['key'] in withheld_legacy,
             'sourceSha256': SOURCE_SHA, 'nerisIndexSha256': INDEX_SHA, 'nationalRegistrySha256': NATIONAL_SHA,
             'mailingSourceSha256': MAILING_SHA, 'correlation': copy.deepcopy(correlation),
             'nativeSiteWithheldReason': reason,
             'department': {'id': department['id'], 'objectId': department['oid'], 'name': department['name'],
                            'state': department['state'], 'addressAsReported': copy.deepcopy(department['address']),
                            'coordinatesAsReported': copy.deepcopy(department['coordinates']),
                            'reportedStationCount': department['reportedStationCount'], 'observedStationCount': len(department['stations'])},
             'site': {'id': obj['id'], 'objectId': obj['oid'], 'sourceKind': kind,
                      'coordinatesAsReported': copy.deepcopy(obj['coordinates']),
                      'addressAsReported': copy.deepcopy(obj['address']), 'addressComponent': component}}
    return {'key': entry['key']+suffix, 'originalPrimaryKey': entry['key'], 'name': entry['name'],
            'source': entry['source'], 'state': entry['state'], 'sourceDate': entry['sourceDate'],
            'sourceCounty': entry.get('sourceCounty', ''), 'address': address, 'status': 'no-match',
            'match': None, 'countyFips': '', 'primaryAddressEvidence': proof}


def generate(inputs, core, departments, supplement, boundaries):
    entries = inputs['entries']
    if len(entries) != 46791 or len({e['key'] for e in entries}) != 46791 or len(supplement['features']) != 30700:
        raise ValueError('Complete primary/native identity denominator changed')
    if sum(e['source'] == 'USFA' for e in entries) != 27117:
        raise ValueError('Complete USFA primary identity inventory changed')
    indices = identity_indices(inputs, supplement)
    department_index = {d['oid']: d for d in departments}
    records, stats = source_objects(departments, boundaries)
    objects = {r['object']['id']: r for r in records}
    index = collections.defaultdict(list)
    for record in records:
        a = record['address']
        if record['addressComponent']:
            index[(a['state'], normalize_street(source_street_line(a['street'])))].append(record)
    accepted = {c['key'] for c in core['candidates']}
    accepted.update(r['key'] for r in core['legacyAudit'] if r['accepted'])
    withheld_legacy = {r['key'] for r in core['legacyAudit'] if not r['accepted']}
    core_conflicts = []
    for c in core['candidates']:
        proof = c.get('primaryAddressEvidence')
        if not proof:
            continue
        identity = identity_key(proof['correlation']['primaryName'], proof['correlation']['primaryCity'],
                                proof['correlation']['state'], proof['correlation']['primaryPostalCode'])
        actual = indices['sourceLocal'].get(identity, set())
        if actual != {proof['department']['objectId']}:
            core_conflicts.append({'key': c['key'], 'originalPrimaryKey': c['key'], 'targetAddress': c['address'],
                                   'reason': 'additional-native-mailing-identity-ambiguity', 'nativeObjectIds': sorted(actual)})
    candidates, targets, rejected, outcomes = [], [], [], collections.Counter()
    for entry in sorted(entries, key=lambda value: value['key']):
        if (entry['source'] != 'USFA' or entry['key'] in accepted or entry['status'] in ('historical', 'review') or
                entry['status'] == 'mapped' and entry['key'] not in withheld_legacy):
            continue
        pair = correlate(entry, indices, department_index)
        if pair is None:
            outcomes['no-reciprocal-mailing-identity'] += 1
            continue
        department, correlation = pair
        candidate, reason = site_selection(entry, department, objects, correlation)
        if candidate:
            support, support_reason = direct_selection({**entry, 'address': candidate['address']}, index)
            selected = [candidate['match']['latitude'], candidate['match']['longitude']]
            if not support or any(distance(selected, objects[native]['coordinates']) > 75 for native in support['corroboratingNativeIds']):
                candidate, reason = None, 'site-address-'+(support_reason or 'native-coordinate-disagreement')
        if candidate:
            candidate.update(source=entry['source'], state=entry['state'], originalStatus=entry['status'])
            proof = candidate['primaryAddressEvidence']
            proof.update(method=METHOD, mailingSourceSha256=MAILING_SHA, originalMappingWithheld=entry['key'] in withheld_legacy)
            candidates.append(candidate)
            outcomes[proof['siteRole']] += 1
            continue
        target = diagnostic_target(entry, department, correlation, reason, withheld_legacy)
        if target:
            targets.append(target)
            outcomes['independent-physical-site-target'] += 1
        else:
            outcomes['no-unambiguous-physical-site'] += 1
        rejected.append({'key': entry['key'], 'reason': reason, 'nativeDepartmentId': department['id']})
    consensus_vetoes = [{'originalPrimaryKey': row['key'], 'targetAddress': row['targetAddress'],
                         'source': 'neris-mailing-identity', 'reasons': [row['reason']]}
                        for row in core_conflicts]
    target_by_key = {target['originalPrimaryKey']: target for target in targets}
    for rejection in rejected:
        target = target_by_key.get(rejection['key'])
        reason = rejection['reason'] or ''
        if target and any(token in reason for token in ('county-disagreement', 'coordinate-disagreement', 'coordinate-reused', 'conflicting-native-address')):
            consensus_vetoes.append({'originalPrimaryKey': target['originalPrimaryKey'],
                                     'targetAddress': target['address'], 'source': 'neris',
                                     'reasons': [reason]})
    targets.sort(key=lambda row: row['key'])
    if len(targets) != len({row['originalPrimaryKey'] for row in targets}):
        raise ValueError('Duplicate primary identity in mailing target variants')
    report = {'schemaVersion': 1, 'method': METHOD, 'originalPrimaryIdentityCount': 46791,
              'mailingSourceSha256': MAILING_SHA, 'sourceSha256': SOURCE_SHA, 'nerisIndexSha256': INDEX_SHA,
              'nativeDepartmentCount': len(departments), 'completeMailingSourceCount': 30700,
              'targetVariantCount': len(targets), 'targetsSha256': sha(dump(targets)), 'candidates': candidates,
              'coreIdentityConflicts': core_conflicts, 'consensusVetoes': consensus_vetoes, 'rejected': rejected, 'sourceStats': stats,
              'outcomes': dict(sorted(outcomes.items())),
              'limitations': 'Mailing fields establish only a reciprocal inferred department identity. Coordinates come from the selected actual reported physical HQ or sole station. Complete physical and mailing alternatives participate in uniqueness. No operating status or building accuracy is certified.'}
    return report, targets


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=pathlib.Path, required=True)
    parser.add_argument('--targets', type=pathlib.Path, required=True)
    args = parser.parse_args()
    inputs, core = source_inputs()
    supplement, _ = source_catalog()
    report, targets = generate(inputs, core, load_departments(), supplement, load_boundaries())
    for path, value in ((args.output, report), (args.targets, targets)):
        path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(dump(value))
    print(json.dumps({'candidateCount': len(report['candidates']), 'targetCount': len(targets),
                      'targetsSha256': sha(dump(targets)), 'coreIdentityConflicts': len(report['coreIdentityConflicts'])}), flush=True)


if __name__ == '__main__':
    main()
