#!/usr/bin/env python3
"""Retain the complete public NERIS physical/mailing field edition for replay."""
import argparse
import functools
import json
import pathlib
import zipfile

from backfill_provider_locations import ROOT, sha, digest_file
from recover_neris_primary import dump, SOURCE_SHA, INDEX_SHA
from stage_neris_mailing_supplement import FIELDS, validate_bound_departments
from stage_neris_national_stations import ITEM

PIN = ROOT/'scripts/fixtures/neris-mailing-source-edition.json'
SOURCE = json.loads(PIN.read_bytes())['sourceSha256']
EVIDENCE = ROOT/'scripts/data/evidence/neris-department-mailing/2026-11-26'
MEMBERS = ('neris-mailing-supplement.json', 'metadata-before.json', 'metadata-after.json',
           'object-ids-before.json', 'object-ids-after.json')


def validate(data, expected_sha=None):
    raw = data['neris-mailing-supplement.json']
    if sha(raw) != (expected_sha or SOURCE):
        raise ValueError('Public NERIS physical/mailing source edition changed')
    source = json.loads(raw)
    before, after = [json.loads(data['metadata-'+stage+'.json']) for stage in ('before', 'after')]
    first, last = [json.loads(data['object-ids-'+stage+'.json']) for stage in ('before', 'after')]
    if (source.get('sourceItemId') != ITEM or source.get('originalNerisSourceSha256') != SOURCE_SHA or
            source.get('originalNerisIndexSha256') != INDEX_SHA or source.get('sourceCount') != 30700 or
            source.get('boundOriginalDepartmentCount') != 30672 or source.get('sourceMetadata') != before or
            before.get('serviceItemId') != ITEM or before.get('editingInfo') != after.get('editingInfo') or
            before['fields'] != after['fields'] or first != last or first != source.get('sourceObjectIds') or
            len(first) != 30700 or len(set(first)) != 30700 or first != sorted(first) or
            any(type(v) is not int or v <= 0 for v in first)):
        raise ValueError('Incomplete or changing public NERIS mailing inventory')
    features = source['features']
    if (len(features) != len(first) or [f['attributes']['OBJECTID'] for f in features] != first or
            any(set(f['attributes']) != set(FIELDS) for f in features)):
        raise ValueError('Public NERIS mailing native record membership changed')
    bound = validate_bound_departments(features, before)
    return source, bound


def stage(directory, destination=EVIDENCE):
    data = {name: (directory/name).read_bytes() for name in MEMBERS}
    source, bound = validate(data)
    if destination.exists():
        raise ValueError('Retained NERIS mailing source already exists')
    destination.mkdir(parents=True)
    with zipfile.ZipFile(destination/'original.zip', 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, raw in sorted(data.items()):
            info = zipfile.ZipInfo(name, date_time=(2026, 11, 26, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, raw)
    manifest = {'schemaVersion': 1, 'sourceSha256': SOURCE,
                'sourceUrl': source['sourceUrl'], 'sourceItemId': ITEM,
                'sourceCount': 30700, 'boundOriginalDepartmentCount': len(bound),
                'originalNerisSourceSha256': SOURCE_SHA, 'originalNerisIndexSha256': INDEX_SHA,
                'archiveSha256': digest_file(destination/'original.zip'),
                'archiveBytes': (destination/'original.zip').stat().st_size,
                'members': {name: {'sha256': sha(raw), 'bytes': len(raw)} for name, raw in data.items()},
                'limitations': 'Complete public physical/mailing field inventory. Native identity, physical address, station count, export date and raw coordinates exactly match the pinned original department edition. Mailing fields identify mailing roles and are not physical geocodes.'}
    (destination/'manifest.json').write_bytes(dump(manifest))
    return manifest


def read(destination=EVIDENCE):
    manifest = json.loads((destination/'manifest.json').read_bytes())
    if (manifest.get('sourceSha256') != SOURCE or manifest.get('sourceCount') != 30700 or
            manifest.get('boundOriginalDepartmentCount') != 30672 or manifest.get('originalNerisSourceSha256') != SOURCE_SHA or
            manifest.get('originalNerisIndexSha256') != INDEX_SHA or digest_file(destination/'original.zip') != manifest['archiveSha256'] or
            (destination/'original.zip').stat().st_size != manifest['archiveBytes']):
        raise ValueError('Retained NERIS mailing provenance changed')
    with zipfile.ZipFile(destination/'original.zip') as archive:
        if len(archive.namelist()) != len(MEMBERS) or set(archive.namelist()) != set(MEMBERS) or set(manifest['members']) != set(MEMBERS):
            raise ValueError('Retained NERIS mailing archive membership changed')
        data = {}
        for name in MEMBERS:
            if archive.getinfo(name).file_size != manifest['members'][name]['bytes'] or archive.getinfo(name).file_size > 100_000_000:
                raise ValueError('Unexpected retained NERIS mailing member size')
            raw = archive.read(name)
            if sha(raw) != manifest['members'][name]['sha256']:
                raise ValueError('Retained NERIS mailing member changed')
            data[name] = raw
    return validate(data)


@functools.lru_cache(maxsize=1)
def source_catalog():
    return read()


def main():
    global SOURCE
    parser = argparse.ArgumentParser()
    parser.add_argument('--directory', type=pathlib.Path)
    parser.add_argument('--evidence', type=pathlib.Path, default=EVIDENCE)
    parser.add_argument('--verify', action='store_true')
    parser.add_argument('--pin-edition', action='store_true', help='After complete native binding, save the actual newly acquired source hash on this review branch')
    args = parser.parse_args()
    if args.verify:
        source, bound = read(args.evidence)
        print(json.dumps({'sourceSha256': SOURCE, 'completeSourceRows': len(source['features']), 'boundOriginalDepartments': len(bound), 'replay': 'passed'}))
    else:
        if not args.directory:
            parser.error('Staging requires the complete acquired source directory')
        if args.pin_edition:
            data = {name: (args.directory/name).read_bytes() for name in MEMBERS}
            actual = sha(data['neris-mailing-supplement.json'])
            validate(data, actual)
            PIN.write_bytes(dump({'schemaVersion': 1, 'sourceSha256': actual, 'sourceCount': 30700,
                                  'boundOriginalDepartmentCount': 30672, 'originalNerisSourceSha256': SOURCE_SHA,
                                  'previousReconstructionSourceSha256': '5a13fee2362d08e2c0119eebdc14bca7732b2597208d73296fe2b9883b30ba6c'}))
            SOURCE = actual
        print(json.dumps(stage(args.directory, args.evidence)))


if __name__ == '__main__':
    main()
