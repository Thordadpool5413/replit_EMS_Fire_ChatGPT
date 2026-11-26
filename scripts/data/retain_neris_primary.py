#!/usr/bin/env python3
"""Retain and replay NERIS primary-source recovery without network access."""
import argparse
import json
import pathlib
import zipfile

from backfill_provider_locations import ROOT, PUBLIC, sha, read_registry
from build_neris_station_map import BOUNDARY
from recover_neris_primary import (dump, load_departments, load_boundaries, load_primary,
                                 generate_candidates, SOURCE_SHA, INDEX_SHA, NATIONAL_SHA)

DEFAULT = ROOT/'scripts/data/evidence/primary-neris-rebuilt/2026-11-26'


def replay(inputs, report):
    entries, national = inputs['entries'], inputs['nationalRows']
    if len(entries) != 46791 or len({e['key'] for e in entries}) != 46791:
        raise ValueError('Retained primary identity membership changed')
    regenerated = generate_candidates(entries, load_departments(), national, load_boundaries())
    if dump(regenerated) != dump(report):
        raise ValueError('NERIS candidate replay differs from retained evidence')
    return regenerated


def stage(report_path, inputs_path, destination):
    report = json.loads(report_path.read_bytes())
    inputs = json.loads(inputs_path.read_bytes())
    _, national = read_registry()
    if dump(inputs) != dump({'entries': load_primary(), 'nationalRows': national}):
        raise ValueError('Retention input is not the original complete primary/native snapshot')
    replay(inputs, report)
    if destination.exists():
        raise ValueError('Evidence destination already exists')
    destination.mkdir(parents=True)
    members = {'inputs.json': dump(inputs), 'candidates.json': dump(report)}
    with zipfile.ZipFile(destination/'original.zip', 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, raw in members.items():
            info = zipfile.ZipInfo(name, date_time=(2026, 11, 26, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, raw)
    manifest = {'schemaVersion': 1, 'archiveSha256': sha((destination/'original.zip').read_bytes()),
                'sourceSha256': SOURCE_SHA, 'nerisIndexSha256': INDEX_SHA,
                'nationalRegistrySha256': NATIONAL_SHA,
                'boundarySha256': sha(BOUNDARY.read_bytes()),
                'members': {k: {'sha256': sha(v), 'bytes': len(v)} for k, v in members.items()},
                'candidateCount': len(report['candidates']),
                'legacyWithheld': sum(not r['accepted'] for r in report['legacyAudit']),
                'replay': 'python3 scripts/data/retain_neris_primary.py --verify',
                'limitations': report['limitations']}
    (destination/'manifest.json').write_bytes(dump(manifest))
    return manifest


def verify(destination):
    manifest = json.loads((destination/'manifest.json').read_bytes())
    raw = (destination/'original.zip').read_bytes()
    if sha(raw) != manifest['archiveSha256'] or manifest['sourceSha256'] != SOURCE_SHA or manifest['nerisIndexSha256'] != INDEX_SHA or manifest['nationalRegistrySha256'] != NATIONAL_SHA or sha(BOUNDARY.read_bytes()) != manifest['boundarySha256']:
        raise ValueError('Retained NERIS recovery provenance changed')
    with zipfile.ZipFile(destination/'original.zip') as archive:
        if set(archive.namelist()) != {'inputs.json', 'candidates.json'} or len(archive.namelist()) != 2:
            raise ValueError('Unexpected retained evidence members')
        data = {}
        for name in archive.namelist():
            raw = archive.read(name)
            if len(raw) != manifest['members'][name]['bytes'] or sha(raw) != manifest['members'][name]['sha256']:
                raise ValueError('Retained NERIS evidence member changed')
            data[name] = json.loads(raw)
    replay(data['inputs.json'], data['candidates.json'])
    if len(data['candidates.json']['candidates']) != manifest['candidateCount']:
        raise ValueError('Retained candidate count changed')
    return manifest


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--report', type=pathlib.Path)
    p.add_argument('--inputs', type=pathlib.Path)
    p.add_argument('--evidence', type=pathlib.Path, default=DEFAULT)
    p.add_argument('--verify', action='store_true')
    args = p.parse_args()
    if args.verify:
        result = verify(args.evidence)
    else:
        if not args.report or not args.inputs:
            p.error('Staging requires --report and --inputs')
        result = stage(args.report, args.inputs, args.evidence)
    print(json.dumps({'candidateCount': result['candidateCount'], 'legacyWithheld': result['legacyWithheld'], 'archiveSha256': result['archiveSha256'], 'fullReplay': 'passed'}))


if __name__ == '__main__':
    main()
