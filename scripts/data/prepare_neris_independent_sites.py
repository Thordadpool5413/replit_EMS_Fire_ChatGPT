#!/usr/bin/env python3
"""Freeze identity-proven native site addresses for independent local geocoding.

These synthetic keys are diagnostic variants, never additional primary records.
No returned target is mapped or publication eligible by this script.
"""
import argparse
import collections
import copy
import json
import pathlib
import zipfile

from backfill_provider_locations import native_key, sha
from address_normalization import physical_address
from recover_neris_primary import (dump, identity_key, load_departments, native_address,
                                 SOURCE_SHA, INDEX_SHA, NATIONAL_SHA)
from retain_neris_primary import DEFAULT


def prepare(inputs, approved, departments, only_original_keys=None):
    native_index = collections.defaultdict(list)
    primary_index = collections.defaultdict(list)
    national_by_key = {}
    for d in departments:
        key = identity_key(d['name'], d['address'][2], d['state'], d['address'][4])
        if key:
            native_index[key].append(d)
    for row in inputs['nationalRows']:
        if row[1] != 'USFA':
            continue
        key = identity_key(row[2], row[4], row[3], row[5])
        if key:
            primary_index[key].append(native_key(row) or row[0])
        if native_key(row):
            national_by_key[native_key(row)] = row
    accepted = {c['key'] for c in approved['candidates']}
    withheld_legacy = {r['key'] for r in approved['legacyAudit'] if not r['accepted']}
    targets = []
    counts = collections.Counter()
    for e in sorted(inputs['entries'], key=lambda value: value['key']):
        if only_original_keys is not None and e['key'] not in only_original_keys:
            continue
        if e['source'] != 'USFA' or e['key'] in accepted or e['status'] in ('historical', 'review') or e['status'] == 'mapped' and e['key'] not in withheld_legacy:
            continue
        row = national_by_key.get(e['key'])
        if not row or row[2] != e['name']:
            continue
        identity = identity_key(row[2], row[4], row[3], row[5])
        if not identity or primary_index[identity] != [e['key']] or len(native_index[identity]) != 1:
            continue
        d = native_index[identity][0]
        a, component, conflict = native_address(d['address'])
        if conflict:
            counts['ambiguous-native-headquarters-lines'] += 1
            continue
        obj, kind, role, suffix = d, 'department', 'reported-headquarters', '@NERIS-HQ'
        if component is None:
            if d['reportedStationCount'] != 1 or len(d['stations']) != 1:
                continue
            obj, kind, role, suffix = d['stations'][0], 'station', 'sole-reported-station', '@NERIS-SOLE'
            if obj['parentId'] != d['id'] or obj.get('parentNameConflict'):
                continue
            a, component, conflict = native_address(obj['address'])
        if conflict or not component or not physical_address(a) or a['state'] != e['state']:
            continue
        correlation = {'nameBasis': 'normalized-complete-name-city-state-zip',
                       'primaryKey': e['key'], 'primaryName': row[2],
                       'primaryCity': row[4], 'primaryPostalCode': row[5],
                       'normalizedName': identity[0], 'normalizedCity': identity[1],
                       'state': identity[2], 'zip': identity[3],
                       'reciprocalSourceCount': 1, 'reciprocalPrimaryCount': 1}
        proof = {'method': 'neris-department-geocoded-site-correlation', 'association': 'inferred',
                 'endUserValidationRequired': True, 'siteRole': role,
                 'diagnosticOnly': True, 'originalAddress': copy.deepcopy(e.get('address')),
                 'originalStatus': e['status'], 'originalMappingWithheld': e['key'] in withheld_legacy,
                 'sourceSha256': SOURCE_SHA, 'nerisIndexSha256': INDEX_SHA,
                 'nationalRegistrySha256': NATIONAL_SHA, 'correlation': correlation,
                 'department': {'id': d['id'], 'objectId': d['oid'], 'name': d['name'], 'state': d['state'],
                                'addressAsReported': copy.deepcopy(d['address']),
                                'coordinatesAsReported': copy.deepcopy(d['coordinates']),
                                'reportedStationCount': d['reportedStationCount'],
                                'observedStationCount': len(d['stations'])},
                 'site': {'id': obj['id'], 'objectId': obj['oid'], 'sourceKind': kind,
                          'coordinatesAsReported': copy.deepcopy(obj['coordinates']),
                          'addressAsReported': copy.deepcopy(obj['address']),
                          'addressComponent': component}}
        targets.append({'key': e['key'] + suffix, 'originalPrimaryKey': e['key'],
                        'name': e['name'], 'source': e['source'], 'state': e['state'],
                        'sourceDate': e['sourceDate'], 'sourceCounty': e.get('sourceCounty', ''),
                        'address': a, 'status': 'no-match', 'match': None, 'countyFips': '',
                        'primaryAddressEvidence': proof})
        counts[role] += 1
        counts['previously-mapped-legacy-withheld' if e['key'] in withheld_legacy else 'unresolved-original-primary'] += 1
    if len(targets) != len({r['key'] for r in targets}) or len(targets) != len({r['originalPrimaryKey'] for r in targets}):
        raise ValueError('Duplicate synthetic primary-site variant')
    return targets, dict(sorted(counts.items()))



ORIGINAL_TARGET_SHA = 'cb4c896b00f7ca2a1710a57a142f94e67b0e4463871e217ae9b1a8eeafe7744a'
ORIGINAL_SCOPE = pathlib.Path(__file__).resolve().parents[1]/'fixtures/neris-independent-original-batch.json'


def prepare_original_batch(inputs, approved, departments):
    """Reproduce the first source-audited batch without later audit additions."""
    scope = json.loads(ORIGINAL_SCOPE.read_bytes())
    excluded = {row['key'] for row in scope['excludedLaterAuditAdditions']}
    if (scope.get('batch') != 'original-1251' or scope.get('targetCount') != 1251 or
            scope.get('targetSha256') != ORIGINAL_TARGET_SHA or
            excluded != {'FDID:MN:70108', 'FDID:MO:04809', 'FDID:NC:00901'}):
        raise ValueError('Frozen original NERIS batch scope changed')
    if len(inputs['entries']) != 46791 or len({e['key'] for e in inputs['entries']}) != 46791:
        raise ValueError('Original primary identity inventory changed')
    keys = {entry['key'] for entry in inputs['entries']} - excluded
    targets, counts = prepare(inputs, approved, departments, only_original_keys=keys)
    if (len(targets) != 1251 or len({row['originalPrimaryKey'] for row in targets}) != 1251 or
            sha(dump(targets)) != ORIGINAL_TARGET_SHA):
        raise ValueError('Frozen original 1251 native site targets do not reproduce exactly')
    return targets, counts


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--batch', choices=('original-1251', 'current-audit'), default='original-1251')
    p.add_argument('--output', type=pathlib.Path, required=True)
    p.add_argument('--report', type=pathlib.Path, required=True)
    args = p.parse_args()
    with zipfile.ZipFile(DEFAULT/'original.zip') as archive:
        inputs = json.loads(archive.read('inputs.json'))
        approved = json.loads(archive.read('candidates.json'))
    maker = prepare_original_batch if args.batch == 'original-1251' else prepare
    targets, counts = maker(inputs, approved, load_departments())
    data = dump(targets)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(data)
    report = {'schemaVersion': 1, 'batch': args.batch, 'diagnosticOnly': True, 'publicationEligible': False,
              'originalPrimaryIdentityCount': 46791, 'targetVariantCount': len(targets),
              'distinctOriginalPrimaryTargetCount': len({t['originalPrimaryKey'] for t in targets}),
              'targetFileSha256': sha(data), 'sourceSha256': SOURCE_SHA,
              'nerisIndexSha256': INDEX_SHA, 'nationalRegistrySha256': NATIONAL_SHA,
              'retainedCandidateArchiveSha256': sha((DEFAULT/'original.zip').read_bytes()),
              'counts': counts, 'newMapped': 0,
              'limitations': 'Independent coordinate candidates must pass source-specific evidence and conflict review before any inferred primary-site mapping can be published.'}
    args.report.write_bytes(dump(report))
    print(json.dumps(report), flush=True)


if __name__ == '__main__':
    main()
