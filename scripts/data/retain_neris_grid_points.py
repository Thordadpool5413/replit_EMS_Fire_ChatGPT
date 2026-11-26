#!/usr/bin/env python3
"""Retain exact native grid addresses and replay complete source reuse/geometry."""
import argparse
import collections
import functools
import json
import pathlib
import zipfile
from backfill_provider_locations import ROOT, sha, digest_file, native_key
from address_normalization import normalize_street, source_street_line
from recover_neris_primary import dump, load_departments, load_boundaries, make_match
from recover_neris_mailing_sites import source_inputs
from recover_neris_grid_points import PROFILE, generate, source_records, select
from retain_neris_primary import DEFAULT as CORE, verify as verify_core

EVIDENCE = ROOT/'scripts/data/evidence/primary-neris-grid-points/2026-11-26'


def reproduce():
    verify_core(CORE)
    inputs, core = source_inputs()
    return generate(inputs, core, load_departments(), load_boundaries()), inputs


def stage(destination=EVIDENCE):
    report, inputs = reproduce()
    if destination.exists(): raise ValueError('Retained grid source profile already exists')
    destination.mkdir(parents=True)
    members = {'candidates.json': dump(report), 'inputs.json': dump(inputs)}
    with zipfile.ZipFile(destination/'original.zip', 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, raw in sorted(members.items()):
            info = zipfile.ZipInfo(name, date_time=(2026, 11, 26, 0, 0, 0)); info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, raw)
    manifest = {'schemaVersion': 1, 'profile': PROFILE, 'archiveSha256': digest_file(destination/'original.zip'),
                'archiveBytes': (destination/'original.zip').stat().st_size, 'coreArchiveSha256': digest_file(CORE/'original.zip'),
                'candidateCount': len(report['candidates']), 'completeNativeObjectCount': report['completeNativeObjectCount'],
                'members': {name: {'sha256': sha(raw), 'bytes': len(raw)} for name, raw in members.items()},
                'limitations': report['limitations']}
    (destination/'manifest.json').write_bytes(dump(manifest)); (destination/'report.json').write_bytes(dump(report))
    return manifest


def read(destination=EVIDENCE):
    manifest = json.loads((destination/'manifest.json').read_bytes())
    if (manifest.get('profile') != PROFILE or digest_file(destination/'original.zip') != manifest['archiveSha256'] or
            (destination/'original.zip').stat().st_size != manifest['archiveBytes'] or digest_file(CORE/'original.zip') != manifest['coreArchiveSha256']):
        raise ValueError('Native grid source edition changed')
    names = {'candidates.json', 'inputs.json'}
    with zipfile.ZipFile(destination/'original.zip') as archive:
        if set(archive.namelist()) != names or len(archive.namelist()) != len(names) or set(manifest['members']) != names:
            raise ValueError('Native grid archive membership changed')
        data = {}
        for name in names:
            if archive.getinfo(name).file_size != manifest['members'][name]['bytes'] or archive.getinfo(name).file_size > 100_000_000:
                raise ValueError('Native grid member size changed')
            raw = archive.read(name)
            if sha(raw) != manifest['members'][name]['sha256']: raise ValueError('Native grid member changed')
            data[name] = json.loads(raw)
    report, inputs = reproduce()
    if (data != {'candidates.json': report, 'inputs.json': inputs} or len(report['candidates']) != manifest['candidateCount'] or
            report['completeNativeObjectCount'] != manifest['completeNativeObjectCount'] or
            (destination/'report.json').read_bytes() != dump(report)):
        raise ValueError('Native grid address/point source replay changed')
    return report, inputs, manifest


def verify(destination=EVIDENCE): return read(destination)[2]


@functools.lru_cache(maxsize=1)
def validated_catalog(): return read()


@functools.lru_cache(maxsize=1)
def candidate_index():
    report, inputs, _ = validated_catalog()
    candidates = {row['key']: row for row in report['candidates']}
    if len(candidates) != len(report['candidates']): raise ValueError('Duplicate grid primary identity')
    return candidates, {row['key']: row for row in inputs['entries']}, {native_key(row): row for row in inputs['nationalRows'] if native_key(row)}


def validate_grid_candidate(candidate, original, national_row=None):
    try:
        candidates, originals, national = candidate_index(); key = original['key']
        return candidate == candidates.get(key) and original == originals.get(key) and (national_row is None or national_row == national.get(key))
    except (ValueError, KeyError, TypeError, OSError, zipfile.BadZipFile): return False


def validate_grid_primary_entry(entry, national_row=None):
    try:
        candidates, originals, national = candidate_index(); key = entry['key']; c = candidates.get(key); old = originals.get(key)
        return bool(c and old and entry.get('status') == 'mapped' and not entry.get('primaryAddressEvidence') and
                    all(entry.get(field) == old.get(field) for field in ('key', 'name', 'source', 'sourceDate', 'state', 'sourceCounty', 'address')) and
                    all(entry.get(field) == c.get(field) for field in ('countyFips', 'match')) and
                    (national_row is None or national_row == national.get(key)))
    except (ValueError, KeyError, TypeError, OSError, zipfile.BadZipFile): return False


@functools.lru_cache(maxsize=1)
def witness_index():
    records, _ = source_records(load_departments(), load_boundaries()); index = collections.defaultdict(list)
    for record in records:
        address = record['address']
        if record['addressComponent']:
            index[(address['state'], normalize_street(source_street_line(address['street'])), address['zip'])].append(record)
    return index


def consensus_witnesses(entry):
    if not validate_grid_primary_entry(entry): raise ValueError('Unvalidated native grid entry')
    candidate, reason, records = select(entry, witness_index())
    if not candidate: raise ValueError('Grid entry lost its complete native cluster')
    return [{'match': {**make_match(record, 'normalized-street-city-state-zip'), 'sourceAddressProfile': PROFILE},
             'countyFips': record['countyFips'], 'nativeId': record['object']['id'], 'targetAddress': entry['address']}
            for record in records]


def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--evidence', type=pathlib.Path, default=EVIDENCE)
    parser.add_argument('--verify', action='store_true'); args = parser.parse_args()
    manifest = verify(args.evidence) if args.verify else stage(args.evidence)
    print(json.dumps({'candidateCount': manifest['candidateCount'], 'archiveSha256': manifest['archiveSha256'],
                      'completeNativeObjectCount': manifest['completeNativeObjectCount'], 'fullNativeReplay': 'passed'}), flush=True)

if __name__ == '__main__':
    main()
