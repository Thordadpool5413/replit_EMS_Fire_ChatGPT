#!/usr/bin/env python3
"""Retain/replay NERIS site identities and every independent address-source audit."""
import argparse
import functools
import json
import pathlib
import tempfile
import zipfile

from backfill_provider_locations import ROOT, sha, digest_file, native_key
from recover_neris_primary import dump, load_departments
from retain_neris_primary import DEFAULT as PRIMARY_EVIDENCE, verify as verify_primary
from recover_neris_geocoded_sites import (load_target_inputs, generate, TARGET_SHA, METHOD,
                                       REQUIRED_SOURCES, SOURCE_METHODS)
from retain_federal_primary_points import evidence_directory, retained_files
from stage_usgs_primary import validate_inventory, match_inventory

EVIDENCE = ROOT/'scripts/data/evidence/primary-neris-geocoded-sites/2026-11-26'


def dependencies(nad_evidence=None):
    from stage_nad_primary import EVIDENCE as NAD_EVIDENCE
    result = {}
    for source in sorted(REQUIRED_SOURCES):
        directory = (nad_evidence or NAD_EVIDENCE) if source == 'nad' else evidence_directory(source)
        manifest = json.loads((directory/'manifest.json').read_bytes())
        result[source] = {'directory': str(directory.relative_to(ROOT)),
                          'archiveSha256': manifest['archiveSha256'],
                          'manifestSha256': sha((directory/'manifest.json').read_bytes())}
    return result


def replay_federal(source, report, targets, targets_sha=TARGET_SHA):
    evidence = evidence_directory(source)
    manifest = json.loads((evidence/'manifest.json').read_bytes())
    if manifest['source'] != source or digest_file(evidence/'original.zip') != manifest['archiveSha256']:
        raise ValueError('Independent federal source archive changed')
    with tempfile.TemporaryDirectory(prefix='atlas-neris-independent-') as temporary:
        root = pathlib.Path(temporary)
        with zipfile.ZipFile(evidence/'original.zip') as archive:
            names = archive.namelist()
            if len(names) != len(set(names)) or any(pathlib.PurePosixPath(n).is_absolute() or '..' in pathlib.PurePosixPath(n).parts for n in names):
                raise ValueError('Invalid retained independent source archive membership')
            inventory = json.loads(archive.read('source/inventory.json'))
            required = {'source/' + name for name in retained_files(root, inventory)}
            if not required <= set(names):
                raise ValueError('Incomplete retained independent source')
            for name in sorted(required):
                if archive.getinfo(name).file_size > 500_000_000:
                    raise ValueError('Oversized independent source member')
                archive.extract(name, root)
        directory = root/'source'
        validate_inventory(directory, inventory)
        if inventory['sourceSha256'] != manifest['sourceInventorySha256']:
            raise ValueError('Independent source inventory pin changed')
        replay = match_inventory(directory, inventory, targets, targets_sha)
        if report is not None and replay != report:
            raise ValueError('Frozen NERIS target geocodes do not replay from complete '+source+' evidence')
        return replay


def replay_nad(report, targets, evidence=None, diagnostic_count=1251, exact_targets=True):
    from stage_nad_primary import verify, EVIDENCE as NAD_EVIDENCE
    evidence = evidence or NAD_EVIDENCE
    verify(evidence)
    with zipfile.ZipFile(evidence/'original.zip') as archive:
        native_report = json.loads(archive.read('report.json'))
        inputs = json.loads(archive.read('inputs.json'))
    if native_report != report:
        raise ValueError('NAD report differs from complete retained native-row/reuse replay')
    source_targets = {e['key']: e for e in inputs['entries'] if e.get('originalPrimaryKey')}
    target_keys = {t['key'] for t in targets}
    if (len(source_targets) != diagnostic_count or report.get('additionalDiagnosticTargets') != diagnostic_count or
            not target_keys <= set(source_targets) or exact_targets and set(source_targets) != target_keys or
            any(source_targets[t['key']] != t for t in targets)):
        raise ValueError('Independent NAD native-point targets changed')


def replay_all(targets, inputs, reports, expected):
    if set(reports) != REQUIRED_SOURCES or not expected.get('completeRequiredSources'):
        raise ValueError('Every required independent source must be audited before publication')
    verify_primary(PRIMARY_EVIDENCE)
    from prepare_neris_independent_sites import prepare_original_batch
    with zipfile.ZipFile(PRIMARY_EVIDENCE/'original.zip') as archive:
        core = json.loads(archive.read('candidates.json'))
    reproduced, _ = prepare_original_batch(inputs, core, load_departments())
    if reproduced != targets:
        raise ValueError('Frozen NERIS target scope or reciprocal identity does not replay')
    for source in sorted(REQUIRED_SOURCES):
        if source == 'nad':
            replay_nad(reports[source], targets)
        else:
            replay_federal(source, reports[source], targets)
    result = generate(targets, inputs, reports, load_departments())
    if result != expected:
        raise ValueError('Independent NERIS site selection/identity/coordinate consensus does not replay')
    return result


def stage(target_path, report_paths, result_path, destination):
    targets, inputs = load_target_inputs(target_path)
    reports = {source: json.loads(path.read_bytes()) for source, path in report_paths.items()}
    result = json.loads(result_path.read_bytes())
    replay_all(targets, inputs, reports, result)
    members = {'inputs/targets.json': dump(targets), 'inputs/originals.json': dump(inputs),
               'candidates.json': dump(result)}
    members.update({'reports/'+source+'.json': dump(report) for source, report in reports.items()})
    if destination.exists():
        raise ValueError('New independently geocoded NERIS evidence destination already exists')
    destination.mkdir(parents=True)
    with zipfile.ZipFile(destination/'original.zip', 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in sorted(members.items()):
            info = zipfile.ZipInfo(name, date_time=(2026, 11, 26, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, data)
    manifest = {'schemaVersion': 1, 'method': METHOD, 'archiveSha256': digest_file(destination/'original.zip'),
                'archiveBytes': (destination/'original.zip').stat().st_size,
                'targetsSha256': TARGET_SHA, 'targetVariantCount': len(targets),
                'originalPrimaryCount': 46791, 'candidateCount': len(result['candidates']),
                'coreNerisArchiveSha256': digest_file(PRIMARY_EVIDENCE/'original.zip'),
                'sourceDependencies': dependencies(),
                'members': {name: {'sha256': sha(data), 'bytes': len(data)} for name, data in members.items()},
                'limitations': result['limitations']}
    (destination/'manifest.json').write_bytes(dump(manifest))
    return manifest


def verify(destination=EVIDENCE):
    manifest = json.loads((destination/'manifest.json').read_bytes())
    if manifest.get('method') != METHOD or manifest.get('targetsSha256') != TARGET_SHA or manifest.get('originalPrimaryCount') != 46791 or digest_file(destination/'original.zip') != manifest['archiveSha256'] or (destination/'original.zip').stat().st_size != manifest['archiveBytes'] or digest_file(PRIMARY_EVIDENCE/'original.zip') != manifest['coreNerisArchiveSha256'] or dependencies() != manifest['sourceDependencies']:
        raise ValueError('Independent NERIS evidence edition or dependency changed')
    with zipfile.ZipFile(destination/'original.zip') as archive:
        names = archive.namelist()
        expected_names = {'inputs/targets.json', 'inputs/originals.json', 'candidates.json'} | {'reports/'+s+'.json' for s in REQUIRED_SOURCES}
        if set(names) != expected_names or len(names) != len(expected_names):
            raise ValueError('Independent NERIS evidence membership changed')
        data = {}
        for name in sorted(names):
            raw = archive.read(name)
            if len(raw) != manifest['members'][name]['bytes'] or sha(raw) != manifest['members'][name]['sha256']:
                raise ValueError('Retained independent NERIS source report changed')
            data[name] = json.loads(raw)
    targets, inputs, result = data['inputs/targets.json'], data['inputs/originals.json'], data['candidates.json']
    if sha(dump(targets)) != TARGET_SHA or len(targets) != manifest['targetVariantCount']:
        raise ValueError('Frozen NERIS address variants changed')
    with zipfile.ZipFile(PRIMARY_EVIDENCE/'original.zip') as archive:
        if inputs != json.loads(archive.read('inputs.json')):
            raise ValueError('Original primary identities differ from the source-bound core snapshot')
    replay_all(targets, inputs, {s: data['reports/'+s+'.json'] for s in REQUIRED_SOURCES}, result)
    if len(result['candidates']) != manifest['candidateCount']:
        raise ValueError('Independently geocoded primary count changed')
    return manifest


@functools.lru_cache(maxsize=1)
def candidate_index():
    verify()
    with zipfile.ZipFile(EVIDENCE/'original.zip') as archive:
        report = json.loads(archive.read('candidates.json'))
        inputs = json.loads(archive.read('inputs/originals.json'))
    candidates = {c['key']: c for c in report['candidates']}
    if len(candidates) != len(report['candidates']):
        raise ValueError('Duplicate independently geocoded primary identity')
    return candidates, {e['key']: e for e in inputs['entries']}, {native_key(r): r for r in inputs['nationalRows'] if native_key(r)}


def validate_geocoded_candidate(candidate, original_entry, national_row=None):
    try:
        candidates, originals, national = candidate_index()
        key = original_entry['key']
        return candidate == candidates.get(key) and original_entry == originals.get(key) and (national_row is None or national_row == national.get(key))
    except (ValueError, KeyError, TypeError, OSError, zipfile.BadZipFile):
        return False


def validate_geocoded_primary_entry(entry, national_row=None):
    try:
        candidates, originals, national = candidate_index()
        candidate = candidates.get(entry['key'])
        original = originals.get(entry['key'])
        return bool(candidate and original and entry.get('status') == 'mapped' and
                    all(entry.get(k) == original.get(k) for k in ('key', 'name', 'source', 'sourceDate', 'state', 'sourceCounty')) and
                    all(entry.get(k) == candidate.get(k) for k in ('address', 'countyFips', 'match', 'primaryAddressEvidence')) and
                    (national_row is None or national_row == national.get(entry['key'])))
    except (ValueError, KeyError, TypeError, OSError, zipfile.BadZipFile):
        return False


def consensus_witnesses(entry):
    if not validate_geocoded_primary_entry(entry):
        raise ValueError('Unvalidated independently geocoded NERIS primary entry')
    from neris_profile_witnesses import native_witnesses
    observed = entry['primaryAddressEvidence']['geocoding']['sourceObservations']
    return [{'match': row['match'], 'targetAddress': entry['address'], 'countyFips': row['countyFips']} for row in observed] + native_witnesses(entry['address'])


def stage_from_retained_sources(destination=EVIDENCE):
    target_path = ROOT/'scripts/data/evidence/primary-neris-original-site-targets/2026-11-26/targets.json'
    targets, inputs = load_target_inputs(target_path)
    reports = {source: replay_federal(source, None, targets) for source in sorted(REQUIRED_SOURCES - {'nad'})}
    from stage_nad_primary import EVIDENCE as NAD_EVIDENCE
    with zipfile.ZipFile(NAD_EVIDENCE/'original.zip') as archive:
        reports['nad'] = json.loads(archive.read('report.json'))
    replay_nad(reports['nad'], targets)
    result = generate(targets, inputs, reports, load_departments())
    with tempfile.TemporaryDirectory(prefix='atlas-neris-core-geocodes-') as temporary:
        root = pathlib.Path(temporary); paths = {}
        for source, report in reports.items():
            paths[source] = root/(source+'.json'); paths[source].write_bytes(dump(report))
        result_path = root/'report.json'; result_path.write_bytes(dump(result))
        return stage(target_path, paths, result_path, destination)


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--targets', type=pathlib.Path)
    p.add_argument('--report', type=pathlib.Path)
    p.add_argument('--usgs-report', type=pathlib.Path)
    p.add_argument('--hifld-ems-report', type=pathlib.Path)
    p.add_argument('--hifld-fire-report', type=pathlib.Path)
    p.add_argument('--nad-report', type=pathlib.Path)
    p.add_argument('--evidence', type=pathlib.Path, default=EVIDENCE)
    p.add_argument('--verify', action='store_true')
    p.add_argument('--retained-sources', action='store_true')
    args = p.parse_args()
    if args.verify:
        manifest = verify(args.evidence)
    elif args.retained_sources:
        manifest = stage_from_retained_sources(args.evidence)
    else:
        paths = {s: getattr(args, s.replace('-', '_')+'_report') for s in REQUIRED_SOURCES}
        if not args.targets or not args.report or not all(paths.values()):
            p.error('All four independent source reports, frozen targets and candidate report are required')
        manifest = stage(args.targets, paths, args.report, args.evidence)
    print(json.dumps({'candidateCount': manifest['candidateCount'], 'archiveSha256': manifest['archiveSha256'], 'fullSourceReplay': 'passed'}), flush=True)


if __name__ == '__main__':
    main()
