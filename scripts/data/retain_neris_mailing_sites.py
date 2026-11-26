#!/usr/bin/env python3
"""Retain and exactly replay complete native mailing identity/site associations."""
import argparse
import functools
import json
import pathlib
import zipfile
from backfill_provider_locations import ROOT, sha, digest_file, native_key
from recover_neris_primary import dump, load_departments, load_boundaries
from recover_neris_mailing_sites import METHOD, generate, source_inputs
from retain_neris_primary import DEFAULT as CORE, verify as verify_core
from retain_neris_mailing_source import EVIDENCE as MAIL_SOURCE, SOURCE as MAILING_SHA, source_catalog

EVIDENCE = ROOT/'scripts/data/evidence/primary-neris-mailing-sites/2026-11-26'
PIN = ROOT/'scripts/fixtures/neris-mailing-target-edition.json'


def target_edition():
    value = json.loads(PIN.read_bytes())
    if value.get('schemaVersion') != 1 or value.get('mailingSourceSha256') != MAILING_SHA:
        raise ValueError('Mailing target edition is not bound to the retained complete source')
    return value


def dependencies():
    return {label: {'archiveSha256': digest_file(path/'original.zip'),
                    'manifestSha256': sha((path/'manifest.json').read_bytes())}
            for label, path in (('nativeCore', CORE), ('nativeMailing', MAIL_SOURCE))}


def reproduce():
    verify_core(CORE)
    supplement, _ = source_catalog()
    inputs, core = source_inputs()
    report, targets = generate(inputs, core, load_departments(), supplement, load_boundaries())
    return inputs, report, targets


def stage(report_path, targets_path, destination=EVIDENCE, pin_targets=False):
    inputs, replay, targets = reproduce()
    report = json.loads(report_path.read_bytes())
    raw_targets = targets_path.read_bytes()
    if report != replay or raw_targets != dump(targets):
        raise ValueError('Mailing site report/targets differ from complete native identity replay')
    actual = {'schemaVersion': 1, 'mailingSourceSha256': MAILING_SHA,
              'targetSha256': sha(raw_targets), 'targetCount': len(targets),
              'nativeCandidateCount': len(report['candidates']),
              'originalPrimaryIdentityCount': 46791,
              'previousReconstructionTargetSha256': '34cd7806097f75cc39fea55e0386c7cc69c6268fc551a8e11674e21cd4fc6a13'}
    if pin_targets:
        PIN.write_bytes(dump(actual))
    if target_edition() != actual:
        raise ValueError('Mailing target scope changed; explicit reviewed edition pin is required')
    if destination.exists():
        raise ValueError('Retained mailing identity destination already exists')
    destination.mkdir(parents=True)
    members = {'inputs.json': dump(inputs), 'candidates.json': dump(report), 'targets.json': raw_targets}
    with zipfile.ZipFile(destination/'original.zip', 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, raw in sorted(members.items()):
            info = zipfile.ZipInfo(name, date_time=(2026, 11, 26, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, raw)
    manifest = {'schemaVersion': 1, 'method': METHOD, 'mailingSourceSha256': MAILING_SHA,
                'archiveSha256': digest_file(destination/'original.zip'),
                'archiveBytes': (destination/'original.zip').stat().st_size,
                'targetEdition': actual, 'sourceDependencies': dependencies(),
                'candidateCount': len(report['candidates']), 'targetVariantCount': len(targets),
                'coreIdentityConflictCount': len(report['coreIdentityConflicts']),
                'members': {name: {'sha256': sha(raw), 'bytes': len(raw)} for name, raw in members.items()},
                'limitations': report['limitations']}
    (destination/'manifest.json').write_bytes(dump(manifest))
    (destination/'targets.json').write_bytes(raw_targets)
    (destination/'report.json').write_bytes(dump(report))
    return manifest


def read(destination=EVIDENCE):
    manifest = json.loads((destination/'manifest.json').read_bytes())
    if (manifest.get('method') != METHOD or manifest.get('mailingSourceSha256') != MAILING_SHA or
            manifest.get('targetEdition') != target_edition() or manifest.get('sourceDependencies') != dependencies() or
            digest_file(destination/'original.zip') != manifest.get('archiveSha256') or
            (destination/'original.zip').stat().st_size != manifest.get('archiveBytes')):
        raise ValueError('Mailing site provenance or source dependencies changed')
    with zipfile.ZipFile(destination/'original.zip') as archive:
        required = {'inputs.json', 'candidates.json', 'targets.json'}
        if set(archive.namelist()) != required or len(archive.namelist()) != len(required) or set(manifest['members']) != required:
            raise ValueError('Mailing site archive membership changed')
        data = {}
        for name in sorted(required):
            if archive.getinfo(name).file_size != manifest['members'][name]['bytes'] or archive.getinfo(name).file_size > 100_000_000:
                raise ValueError('Mailing site member size changed')
            raw = archive.read(name)
            if sha(raw) != manifest['members'][name]['sha256']:
                raise ValueError('Mailing site member changed')
            data[name] = json.loads(raw)
    inputs, report, targets = reproduce()
    if data != {'inputs.json': inputs, 'candidates.json': report, 'targets.json': targets}:
        raise ValueError('Mailing reciprocal identity/native site selection does not replay')
    edition = target_edition()
    if (sha(dump(targets)) != edition['targetSha256'] or len(targets) != edition['targetCount'] or
            len(report['candidates']) != edition['nativeCandidateCount'] or len(report['candidates']) != manifest['candidateCount'] or
            len(targets) != manifest['targetVariantCount'] or len(report['coreIdentityConflicts']) != manifest['coreIdentityConflictCount'] or
            (destination/'targets.json').read_bytes() != dump(targets) or
            (destination/'report.json').read_bytes() != dump(report)):
        raise ValueError('Mailing targets or native candidate count changed')
    return report, targets, inputs, manifest


def verify(destination=EVIDENCE):
    return read(destination)[3]


@functools.lru_cache(maxsize=1)
def validated_catalog():
    return read()


@functools.lru_cache(maxsize=1)
def candidate_index():
    report, _, inputs, _ = validated_catalog()
    candidates = {row['key']: row for row in report['candidates']}
    originals = {row['key']: row for row in inputs['entries']}
    national = {native_key(row): row for row in inputs['nationalRows'] if native_key(row)}
    if len(candidates) != len(report['candidates']):
        raise ValueError('Duplicate mailing primary identity')
    return candidates, originals, national


def validate_mailing_candidate(candidate, original, national_row=None):
    try:
        candidates, originals, national = candidate_index()
        key = original['key']
        return candidate == candidates.get(key) and original == originals.get(key) and (national_row is None or national_row == national.get(key))
    except (ValueError, KeyError, TypeError, OSError, zipfile.BadZipFile):
        return False


def validate_mailing_primary_entry(entry, national_row=None):
    try:
        candidates, originals, national = candidate_index()
        key = entry['key']; candidate = candidates.get(key); original = originals.get(key)
        return bool(candidate and original and entry.get('status') == 'mapped' and
                    all(entry.get(field) == original.get(field) for field in ('key', 'name', 'source', 'sourceDate', 'state', 'sourceCounty')) and
                    all(entry.get(field) == candidate.get(field) for field in ('address', 'countyFips', 'match', 'primaryAddressEvidence')) and
                    (national_row is None or national_row == national.get(key)))
    except (ValueError, KeyError, TypeError, OSError, zipfile.BadZipFile):
        return False


def consensus_witnesses(entry):
    if not validate_mailing_primary_entry(entry):
        raise ValueError('Unvalidated mailing primary entry')
    from neris_profile_witnesses import native_witnesses
    return native_witnesses(entry['address'])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--report', type=pathlib.Path)
    parser.add_argument('--targets', type=pathlib.Path)
    parser.add_argument('--evidence', type=pathlib.Path, default=EVIDENCE)
    parser.add_argument('--verify', action='store_true')
    parser.add_argument('--pin-targets', action='store_true')
    args = parser.parse_args()
    if args.verify:
        manifest = verify(args.evidence)
    else:
        if not args.report or not args.targets:
            parser.error('Full report and frozen target bytes are required')
        manifest = stage(args.report, args.targets, args.evidence, args.pin_targets)
    print(json.dumps({'candidateCount': manifest['candidateCount'], 'targetCount': manifest['targetVariantCount'],
                      'targetSha256': manifest['targetEdition']['targetSha256'], 'archiveSha256': manifest['archiveSha256'],
                      'fullNativeReplay': 'passed'}), flush=True)


if __name__ == '__main__':
    main()
