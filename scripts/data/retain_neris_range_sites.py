#!/usr/bin/env python3
"""Retained complete point-audit and native range proofs for NERIS sites."""
import argparse
import copy
import functools
import json
import pathlib
import zipfile
from backfill_provider_locations import ROOT, sha, digest_file, native_key
from recover_neris_primary import dump
from recover_neris_range_sites import CORE_METHOD, MAILING_METHOD, point_audits, generate

def evidence_directory(family):
    if family not in ('core', 'mailing'): raise ValueError('Unknown range profile')
    name = 'primary-neris-range-sites' if family == 'core' else 'primary-neris-mailing-range-sites'
    return ROOT/'scripts/data/evidence'/name/'2026-11-26'


def reproduce(family):
    from retain_tiger_primary import validated_catalog
    tiger, _, _ = validated_catalog()
    targets, inputs, reports, points, directory = point_audits(family)
    report = generate(family, targets, inputs, reports, points, tiger)
    return report, targets, inputs, directory


def dependencies(family, point_directory):
    from retain_tiger_primary import EVIDENCE as TIGER_EVIDENCE
    return {source: {'archiveSha256': digest_file(path/'original.zip'), 'manifestSha256': sha((path/'manifest.json').read_bytes())}
            for source, path in (('complete-point-audits', point_directory), ('complete-native-address-ranges', TIGER_EVIDENCE))}


def stage(family, destination=None):
    destination = destination or evidence_directory(family)
    report, targets, inputs, points = reproduce(family)
    if destination.exists(): raise ValueError('Retained NERIS range profile already exists')
    destination.mkdir(parents=True)
    members = {'report.json': dump(report), 'targets.json': dump(targets), 'inputs.json': dump(inputs)}
    with zipfile.ZipFile(destination/'original.zip', 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, raw in sorted(members.items()):
            info = zipfile.ZipInfo(name, date_time=(2026, 11, 26, 0, 0, 0)); info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, raw)
    manifest = {'schemaVersion': 2, 'family': family, 'method': report['method'],
                'archiveSha256': digest_file(destination/'original.zip'), 'archiveBytes': (destination/'original.zip').stat().st_size,
                'sourceDependencies': dependencies(family, points), 'candidateCount': len(report['candidates']),
                'targetsSha256': sha(dump(targets)), 'targetVariantCount': len(targets),
                'members': {name: {'sha256': sha(raw), 'bytes': len(raw)} for name, raw in members.items()},
                'limitations': report['limitations']}
    (destination/'manifest.json').write_bytes(dump(manifest)); (destination/'report.json').write_bytes(dump(report))
    return manifest


def read(family, destination=None):
    destination = destination or evidence_directory(family)
    manifest = json.loads((destination/'manifest.json').read_bytes())
    if (manifest.get('family') != family or manifest.get('method') != (CORE_METHOD if family == 'core' else MAILING_METHOD) or
            digest_file(destination/'original.zip') != manifest['archiveSha256'] or
            (destination/'original.zip').stat().st_size != manifest['archiveBytes']):
        raise ValueError('Retained NERIS range edition changed')
    required = {'report.json', 'targets.json', 'inputs.json'}
    with zipfile.ZipFile(destination/'original.zip') as archive:
        if set(archive.namelist()) != required or len(archive.namelist()) != len(required) or set(manifest['members']) != required:
            raise ValueError('Retained NERIS range archive membership changed')
        data = {}
        for name in sorted(required):
            if archive.getinfo(name).file_size != manifest['members'][name]['bytes'] or archive.getinfo(name).file_size > 100_000_000:
                raise ValueError('Retained NERIS range member size changed')
            raw = archive.read(name)
            if sha(raw) != manifest['members'][name]['sha256']: raise ValueError('Retained NERIS range member changed')
            data[name] = json.loads(raw)
    report, targets, inputs, points = reproduce(family)
    if (data != {'report.json': report, 'targets.json': targets, 'inputs.json': inputs} or
            dependencies(family, points) != manifest['sourceDependencies'] or
            sha(dump(targets)) != manifest['targetsSha256'] or len(targets) != manifest['targetVariantCount'] or
            len(report['candidates']) != manifest['candidateCount'] or (destination/'report.json').read_bytes() != dump(report)):
        raise ValueError('Retained NERIS range native identity/point audit/geometry does not replay')
    return report, targets, inputs, manifest


def verify(family='core', destination=None): return read(family, destination)[3]


@functools.lru_cache(maxsize=2)
def validated_catalog(family='core'): return read(family)


@functools.lru_cache(maxsize=2)
def candidate_index(family='core'):
    report, _, inputs, _ = validated_catalog(family)
    candidates = {row['key']: row for row in report['candidates']}
    if len(candidates) != len(report['candidates']): raise ValueError('Duplicate NERIS range primary identity')
    return candidates, {row['key']: row for row in inputs['entries']}, {native_key(row): row for row in inputs['nationalRows'] if native_key(row)}


def validate_range_primary_entry(entry, national_row=None):
    try:
        method = (entry.get('primaryAddressEvidence') or {}).get('method')
        if method not in (CORE_METHOD, MAILING_METHOD): return False
        family = 'core' if method == CORE_METHOD else 'mailing'
        candidates, originals, national = candidate_index(family); key = entry['key']; c = candidates.get(key); old = originals.get(key)
        return bool(c and old and entry.get('status') == 'mapped' and
                    all(entry.get(field) == old.get(field) for field in ('key', 'name', 'source', 'sourceDate', 'state', 'sourceCounty')) and
                    all(entry.get(field) == c.get(field) for field in ('address', 'countyFips', 'match', 'primaryAddressEvidence')) and
                    (national_row is None or national_row == national.get(key)))
    except (ValueError, KeyError, TypeError, OSError, zipfile.BadZipFile): return False


def consensus_witnesses(entry):
    if not validate_range_primary_entry(entry): raise ValueError('Unvalidated NERIS range entry')
    from retain_tiger_primary import validated_catalog, tiger_diagnostic_range_witnesses
    report, _, _ = validated_catalog()
    proof = entry['primaryAddressEvidence']; family = 'core' if proof['method'] == CORE_METHOD else 'mailing'
    scope = 'neris-native' if family == 'core' else 'additional-native'
    key = proof['rangeGeocoding']['targetKey']
    matches = [row for row in report['diagnosticCandidates'] if row['scope'] == scope and row['key'] == key]
    if len(matches) != 1: raise ValueError('Missing exact retained range candidate')
    witnesses = tiger_diagnostic_range_witnesses(matches[0])
    if not witnesses: raise ValueError('No native address-range geometry witnesses')
    return [{'match': copy.deepcopy(row.get('match', row)), 'targetAddress': entry['address'], 'countyFips': entry['countyFips']} for row in witnesses]


def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--family', choices=('core', 'mailing'), default='core')
    parser.add_argument('--evidence', type=pathlib.Path); parser.add_argument('--verify', action='store_true'); args = parser.parse_args()
    manifest = verify(args.family, args.evidence) if args.verify else stage(args.family, args.evidence)
    print(json.dumps({'family': args.family, 'candidateCount': manifest['candidateCount'],
                      'archiveSha256': manifest['archiveSha256'], 'completeNativeReplay': 'passed'}), flush=True)

if __name__ == '__main__':
    main()
