#!/usr/bin/env python3
"""Full-source replay for strict native website-correlated NERIS sites."""
import argparse
import functools
import json
import pathlib
import zipfile
from backfill_provider_locations import ROOT, sha, digest_file, native_key
from recover_neris_primary import dump
from recover_neris_website_sites import METHOD, reproduce
from retain_usfa_native_source import EVIDENCE as USFA
from retain_neris_mailing_source import EVIDENCE as NERIS_MAILING
from retain_neris_mailing_sites import EVIDENCE as MAILING_IDENTITIES

EVIDENCE = ROOT/'scripts/data/evidence/primary-neris-website-sites/2026-11-26'


def dependencies():
    return {name: {'archiveSha256': digest_file(path/'original.zip'), 'manifestSha256': sha((path/'manifest.json').read_bytes())}
            for name, path in (('native-usfa', USFA), ('native-neris-mailing', NERIS_MAILING), ('mailing-identity-scope', MAILING_IDENTITIES))}


def stage(destination=EVIDENCE):
    report, inputs = reproduce()
    if destination.exists(): raise ValueError('Retained website site evidence already exists')
    destination.mkdir(parents=True)
    members = {'report.json': dump(report), 'inputs.json': dump(inputs), 'targets.json': dump(report['diagnosticTargets'])}
    with zipfile.ZipFile(destination/'original.zip', 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, raw in sorted(members.items()):
            info = zipfile.ZipInfo(name, date_time=(2026, 11, 26, 0, 0, 0)); info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, raw)
    manifest = {'schemaVersion': 1, 'method': METHOD, 'sourceDependencies': dependencies(),
                'archiveSha256': digest_file(destination/'original.zip'), 'archiveBytes': (destination/'original.zip').stat().st_size,
                'originalPrimaryIdentityCount': 46791, 'candidateCount': len(report['candidates']),
                'targetVariantCount': len(report['diagnosticTargets']), 'targetsSha256': sha(members['targets.json']),
                'lowerLocalityHeldCount': len(report['withheldLowerLocalityCorroboration']),
                'members': {name: {'sha256': sha(raw), 'bytes': len(raw)} for name, raw in members.items()},
                'limitations': report['limitations']}
    (destination/'manifest.json').write_bytes(dump(manifest)); (destination/'report.json').write_bytes(dump(report))
    (destination/'targets.json').write_bytes(members['targets.json'])
    return manifest


def read(destination=EVIDENCE):
    manifest = json.loads((destination/'manifest.json').read_bytes())
    if (manifest.get('method') != METHOD or manifest.get('originalPrimaryIdentityCount') != 46791 or
            dependencies() != manifest['sourceDependencies'] or digest_file(destination/'original.zip') != manifest['archiveSha256'] or
            (destination/'original.zip').stat().st_size != manifest['archiveBytes']):
        raise ValueError('Retained website source dependencies changed')
    expected = {'report.json', 'inputs.json', 'targets.json'}
    with zipfile.ZipFile(destination/'original.zip') as archive:
        if set(archive.namelist()) != expected or len(archive.namelist()) != len(expected) or set(manifest['members']) != expected:
            raise ValueError('Retained website source membership changed')
        data = {}
        for name in expected:
            if archive.getinfo(name).file_size != manifest['members'][name]['bytes'] or archive.getinfo(name).file_size > 100_000_000:
                raise ValueError('Retained website member size changed')
            raw = archive.read(name)
            if sha(raw) != manifest['members'][name]['sha256']: raise ValueError('Retained website member changed')
            data[name] = json.loads(raw)
    report, inputs = reproduce(); targets = report['diagnosticTargets']
    if (data != {'report.json': report, 'inputs.json': inputs, 'targets.json': targets} or
            len(report['candidates']) != manifest['candidateCount'] or len(targets) != manifest['targetVariantCount'] or
            sha(dump(targets)) != manifest['targetsSha256'] or
            len(report['withheldLowerLocalityCorroboration']) != manifest['lowerLocalityHeldCount'] or
            (destination/'report.json').read_bytes() != dump(report) or (destination/'targets.json').read_bytes() != dump(targets)):
        raise ValueError('Website full native identity/site/coordinate replay changed')
    return report, targets, inputs, manifest


def verify(destination=EVIDENCE): return read(destination)[3]


@functools.lru_cache(maxsize=1)
def validated_catalog(): return read()


@functools.lru_cache(maxsize=1)
def candidate_index():
    report, _, inputs, _ = validated_catalog(); candidates = {row['key']: row for row in report['candidates']}
    if len(candidates) != len(report['candidates']): raise ValueError('Duplicate website primary identity')
    return candidates, {row['key']: row for row in inputs['entries']}, {native_key(row): row for row in inputs['nationalRows'] if native_key(row)}


def validate_website_primary_entry(entry, national_row=None):
    try:
        candidates, originals, national = candidate_index(); key = entry['key']; candidate = candidates.get(key); original = originals.get(key)
        return bool(candidate and original and entry.get('status') == 'mapped' and
                    all(entry.get(field) == original.get(field) for field in ('key', 'name', 'source', 'sourceDate', 'state', 'sourceCounty')) and
                    all(entry.get(field) == candidate.get(field) for field in ('address', 'countyFips', 'match', 'primaryAddressEvidence')) and
                    (national_row is None or national_row == national.get(key)))
    except (ValueError, KeyError, TypeError, OSError, zipfile.BadZipFile): return False


def consensus_witnesses(entry):
    if not validate_website_primary_entry(entry): raise ValueError('Unvalidated website-correlated primary entry')
    from neris_profile_witnesses import native_witnesses
    return native_witnesses(entry['address'])


def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--evidence', type=pathlib.Path, default=EVIDENCE)
    parser.add_argument('--verify', action='store_true'); args = parser.parse_args()
    manifest = verify(args.evidence) if args.verify else stage(args.evidence)
    print(json.dumps({'candidateCount': manifest['candidateCount'], 'targetCount': manifest['targetVariantCount'],
                      'archiveSha256': manifest['archiveSha256'], 'lowerLocalityHeld': manifest['lowerLocalityHeldCount'],
                      'completeNativeSourceReplay': 'passed'}), flush=True)

if __name__ == '__main__':
    main()
