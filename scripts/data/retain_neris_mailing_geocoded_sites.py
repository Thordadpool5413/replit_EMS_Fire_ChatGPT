#!/usr/bin/env python3
"""Replay and retain five-source native NERIS mailing-site locations."""
import argparse
import functools
import json
import pathlib
import zipfile
from backfill_provider_locations import ROOT, sha, digest_file, native_key
from recover_neris_primary import dump
from recover_neris_mailing_geocoded_sites import METHOD, REQUIRED_SOURCES, NAD_EVIDENCE, load_targets, overture_report, generate
from retain_neris_mailing_sites import EVIDENCE as MAILING_EVIDENCE, target_edition
from retain_neris_geocoded_sites import dependencies as point_dependencies, replay_federal, replay_nad

EVIDENCE = ROOT/'scripts/data/evidence/primary-neris-mailing-geocoded-sites/2026-11-26'


def dependencies():
    from retain_overture_primary_variants import EVIDENCE as PLACES_EVIDENCE
    result = point_dependencies(NAD_EVIDENCE)
    for source, directory in (('mailing-identities', MAILING_EVIDENCE), ('overture', PLACES_EVIDENCE)):
        result[source] = {'directory': str(directory.relative_to(ROOT)),
                          'archiveSha256': digest_file(directory/'original.zip'),
                          'manifestSha256': sha((directory/'manifest.json').read_bytes())}
    return result


def acquire_reports(targets, edition):
    reports = {source: replay_federal(source, None, targets, edition['targetSha256'])
               for source in sorted(REQUIRED_SOURCES - {'nad', 'overture'})}
    with zipfile.ZipFile(NAD_EVIDENCE/'original.zip') as archive:
        reports['nad'] = json.loads(archive.read('report.json'))
    replay_nad(reports['nad'], targets, NAD_EVIDENCE, len(targets)+609, exact_targets=False)
    reports['overture'] = overture_report(targets, edition['targetSha256'])
    return reports


def replay(reports, expected=None):
    targets, inputs, edition = load_targets()
    if set(reports) != REQUIRED_SOURCES:
        raise ValueError('Every one of the five source audits is required')
    for source in sorted(REQUIRED_SOURCES):
        if source == 'nad':
            replay_nad(reports[source], targets, NAD_EVIDENCE, len(targets)+609, exact_targets=False)
        elif source == 'overture':
            if reports[source] != overture_report(targets, edition['targetSha256']):
                raise ValueError('Complete positive and negative Places audit changed')
        else:
            replay_federal(source, reports[source], targets, edition['targetSha256'])
    result = generate(targets, inputs, reports)
    if not result['completeRequiredSources'] or expected is not None and result != expected:
        raise ValueError('Five-source native identity/endpoint consensus does not replay')
    return result, targets, inputs


def stage(destination=EVIDENCE):
    targets, _, edition = load_targets()
    reports = acquire_reports(targets, edition)
    result, targets, inputs = replay(reports)
    if destination.exists():
        raise ValueError('Retained five-source mailing profile already exists')
    destination.mkdir(parents=True)
    members = {'inputs/targets.json': dump(targets), 'inputs/originals.json': dump(inputs),
               'candidates.json': dump(result), **{'reports/'+source+'.json': dump(report) for source, report in reports.items()}}
    with zipfile.ZipFile(destination/'original.zip', 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, raw in sorted(members.items()):
            info = zipfile.ZipInfo(name, date_time=(2026, 11, 26, 0, 0, 0)); info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, raw)
    manifest = {'schemaVersion': 2, 'method': METHOD, 'originalPrimaryIdentityCount': 46791,
                'targetEdition': edition, 'sourceDependencies': dependencies(),
                'archiveSha256': digest_file(destination/'original.zip'), 'archiveBytes': (destination/'original.zip').stat().st_size,
                'candidateCount': len(result['candidates']), 'withheldCount': len(result['withheld']),
                'members': {name: {'sha256': sha(raw), 'bytes': len(raw)} for name, raw in members.items()},
                'requiredSources': sorted(REQUIRED_SOURCES), 'limitations': result['limitations']}
    (destination/'manifest.json').write_bytes(dump(manifest)); (destination/'report.json').write_bytes(dump(result))
    return manifest


def read(destination=EVIDENCE):
    manifest = json.loads((destination/'manifest.json').read_bytes())
    if (manifest.get('method') != METHOD or manifest.get('targetEdition') != target_edition() or
            manifest.get('sourceDependencies') != dependencies() or manifest.get('originalPrimaryIdentityCount') != 46791 or
            manifest.get('requiredSources') != sorted(REQUIRED_SOURCES) or
            digest_file(destination/'original.zip') != manifest['archiveSha256'] or
            (destination/'original.zip').stat().st_size != manifest['archiveBytes']):
        raise ValueError('Five-source mailing profile source/scope edition changed')
    expected_names = {'inputs/targets.json', 'inputs/originals.json', 'candidates.json'} | {'reports/'+s+'.json' for s in REQUIRED_SOURCES}
    with zipfile.ZipFile(destination/'original.zip') as archive:
        if set(archive.namelist()) != expected_names or len(archive.namelist()) != len(expected_names) or set(manifest['members']) != expected_names:
            raise ValueError('Five-source mailing archive membership changed')
        data = {}
        for name in sorted(expected_names):
            if archive.getinfo(name).file_size != manifest['members'][name]['bytes'] or archive.getinfo(name).file_size > 100_000_000:
                raise ValueError('Five-source mailing member size changed')
            raw = archive.read(name)
            if sha(raw) != manifest['members'][name]['sha256']:
                raise ValueError('Five-source mailing member changed')
            data[name] = json.loads(raw)
    result, targets, inputs = replay({s: data['reports/'+s+'.json'] for s in REQUIRED_SOURCES}, data['candidates.json'])
    if (targets != data['inputs/targets.json'] or inputs != data['inputs/originals.json'] or
            len(result['candidates']) != manifest['candidateCount'] or len(result['withheld']) != manifest['withheldCount'] or
            (destination/'report.json').read_bytes() != dump(result)):
        raise ValueError('Five-source mailing proof/input binding changed')
    return result, targets, inputs, manifest


def verify(destination=EVIDENCE):
    return read(destination)[3]


@functools.lru_cache(maxsize=1)
def validated_catalog():
    return read()


@functools.lru_cache(maxsize=1)
def candidate_index():
    report, _, inputs, _ = validated_catalog()
    candidates = {row['key']: row for row in report['candidates']}
    if len(candidates) != len(report['candidates']):
        raise ValueError('Duplicate five-source mailing primary identity')
    return candidates, {row['key']: row for row in inputs['entries']}, {native_key(row): row for row in inputs['nationalRows'] if native_key(row)}


def validate_mailing_geocoded_primary_entry(entry, national_row=None):
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
    if not validate_mailing_geocoded_primary_entry(entry):
        raise ValueError('Unvalidated five-source mailing primary entry')
    from neris_profile_witnesses import native_witnesses
    rows = [{'match': row['match'], 'targetAddress': entry['address'], 'countyFips': row['countyFips']}
            for row in entry['primaryAddressEvidence']['geocoding']['sourceObservations']]
    return rows + native_witnesses(entry['address'])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--evidence', type=pathlib.Path, default=EVIDENCE)
    parser.add_argument('--verify', action='store_true')
    args = parser.parse_args()
    manifest = verify(args.evidence) if args.verify else stage(args.evidence)
    print(json.dumps({'candidateCount': manifest['candidateCount'], 'withheldCount': manifest['withheldCount'],
                      'archiveSha256': manifest['archiveSha256'], 'fullFiveSourceReplay': 'passed'}), flush=True)


if __name__ == '__main__':
    main()
