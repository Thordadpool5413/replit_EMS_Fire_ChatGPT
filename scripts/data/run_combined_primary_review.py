#!/usr/bin/env python3
"""Replay every required profile, then build one fixed-denominator candidate.

Raw source reports and exact target batches are preserved without modification.
Replay-derived NERIS negative-evidence adapters retain their separate raw and
release report hashes. No missing source is silently skipped. Phone associations are added only after
their donor proof was built from this exact complete non-phone candidate.
"""
import argparse
import importlib
import json
import pathlib
import sys
import zipfile
from backfill_provider_locations import ROOT, sha, digest_file
from build_primary_mapping_release import dump

EVIDENCE = ROOT/'scripts/data/evidence'
DATE = '2026-11-26'
# label, evidence directory, report member, verifier module/function/arguments,
# veto-only flag, and exact target members.
PROFILES = [
    ('neris', 'primary-neris-rebuilt', 'candidates.json',
     'recover_neris_primary', 'validated_catalog', (), False, ()),
    ('usgs', 'primary-usgs-all', 'primary-candidates.json',
     'retain_federal_primary_points', 'candidate_index', ('usgs',), False, ()),
    ('ems', 'primary-hifld', 'primary-candidates.json',
     'retain_federal_primary_points', 'candidate_index', ('hifld-ems',), False, ()),
    ('fire', 'primary-hifld-fire', 'primary-candidates.json',
     'retain_federal_primary_points', 'candidate_index', ('hifld-fire',), False, ()),
    ('nad-original', 'primary-nad-rebuilt', 'report.json',
     'stage_nad_primary', 'verify', ('@evidence',), False, ()),
    ('nad-extended', 'primary-nad-extended', 'report.json',
     'stage_nad_primary', 'verify', ('@evidence',), True, ()),
    ('overture-address', 'primary-overture-addresses', 'primary-address-candidates.json',
     'retain_overture_primary_addresses', 'validated_evidence', (), False, ('targets.json',)),
    ('overture-place', 'primary-overture-places', 'primary-place-address-candidates.json',
     'retain_overture_primary_places', 'validated_evidence', (), False, ('targets.json',)),
    ('overture-native-address', 'primary-overture-native-variants', 'address-report.json',
     'retain_overture_primary_variants', 'validated_evidence', (), True, ('cms-targets.json', 'neris-targets.json')),
    ('overture-native-place', 'primary-overture-native-variants', 'places-report.json',
     'retain_overture_primary_variants', 'validated_evidence', (), True, ()),
    ('federal-city', 'primary-federal-city-fallback', 'report.json',
     'retain_federal_city_points', 'validated_catalog', (), False, ()),
    ('tiger', 'primary-tiger-native', 'report.json',
     'retain_tiger_primary', 'validated_catalog', (), False, ()),
    ('cms-components', 'primary-nppes-components-extended', 'report.json',
     'recover_nppes_primary_components_extended', 'runtime_indexes', (), False, ()),
    ('neris-mailing', 'primary-neris-mailing-sites', 'candidates.json',
     'retain_neris_mailing_sites', 'candidate_index', (), False, ('targets.json',)),
    ('neris-geocoded', 'primary-neris-geocoded-sites', 'candidates.json',
     'retain_neris_geocoded_sites', 'candidate_index', (), False, ('inputs/targets.json',)),
    ('neris-mailing-geocoded', 'primary-neris-mailing-geocoded-sites', 'candidates.json',
     'retain_neris_mailing_geocoded_sites', 'candidate_index', (), False, ('inputs/targets.json',)),
    ('neris-range', 'primary-neris-range-sites', 'report.json',
     'retain_neris_range_sites', 'candidate_index', ('core',), False, ('targets.json',)),
    ('neris-mailing-range', 'primary-neris-mailing-range-sites', 'report.json',
     'retain_neris_range_sites', 'candidate_index', ('mailing',), False, ('targets.json',)),
    ('neris-grid', 'primary-neris-grid-points', 'candidates.json',
     'retain_neris_grid_points', 'candidate_index', (), False, ()),
    ('neris-website', 'primary-neris-website-sites', 'report.json',
     'retain_neris_website_sites', 'candidate_index', (), False, ('targets.json',)),
]
PHONE = ('phone-sites', 'primary-nppes-phone-sites', 'report.json',
         'recover_nppes_phone_sites', 'runtime_indexes', (), False, ())
NERIS_ADAPTER_PROFILES = {
    'neris-mailing': 'mailing', 'neris-geocoded': 'core-geocoded',
    'neris-mailing-geocoded': 'mailing-geocoded', 'neris-range': 'range',
    'neris-mailing-range': 'mailing-range', 'neris-grid': 'grid',
    'neris-website': 'website',
}
NESTED_NEGATIVES = {
    'neris-geocoded': ('usgs', 'hifld-ems', 'hifld-fire', 'nad'),
    'neris-mailing-geocoded': ('usgs', 'hifld-ems', 'hifld-fire', 'nad', 'overture'),
}


def required_profiles(include_phone=False):
    return PROFILES+([PHONE] if include_phone else [])


def prepare(output, include_phone=False):
    profiles = required_profiles(include_phone)
    missing = [str(EVIDENCE/directory/DATE/name)
               for _, directory, *_ in profiles
               for name in ('manifest.json', 'original.zip')
               if not (EVIDENCE/directory/DATE/name).is_file()]
    if missing:
        raise ValueError('Required retained evidence is incomplete: '+', '.join(missing))
    reports_dir = output/'reports'
    targets_dir = output/'targets'
    raw_reports_dir = output/'raw-reports'
    reports_dir.mkdir(parents=True, exist_ok=True)
    targets_dir.mkdir(parents=True, exist_ok=True)
    raw_reports_dir.mkdir(parents=True, exist_ok=True)
    source_paths, veto_paths, target_paths, receipts = [], [], [], []
    verified = set()
    core_path = None
    for label, directory, member, module, function, arguments, veto_only, targets in profiles:
        evidence = EVIDENCE/directory/DATE
        identity = (module, function, arguments)
        if identity not in verified or '@evidence' in arguments:
            print('Replay required native profile:', label, flush=True)
            args = [evidence if arg == '@evidence' else arg for arg in arguments]
            getattr(importlib.import_module(module), function)(*args)
            verified.add(identity)
        manifest_raw = (evidence/'manifest.json').read_bytes()
        manifest = json.loads(manifest_raw)
        archive_sha = digest_file(evidence/'original.zip')
        if archive_sha != manifest['archiveSha256']:
            raise ValueError('Retained archive differs from its verified manifest: '+label)
        with zipfile.ZipFile(evidence/'original.zip') as archive:
            raw = archive.read(member)
            report = json.loads(raw)
            if not isinstance(report.get('candidates'), list):
                raise ValueError('Complete source report has no candidate list: '+label)
            (raw_reports_dir/(label+'.json')).write_bytes(raw)
            release_raw = raw
            adapter = None
            if label in NERIS_ADAPTER_PROFILES:
                from neris_release_reports import combined_release_report
                derived = combined_release_report(NERIS_ADAPTER_PROFILES[label])
                if dump(derived['candidates']) != dump(report['candidates']):
                    raise ValueError('Negative-evidence adapter changed source candidates: '+label)
                release_raw = dump(derived)
                adapter = {
                    'module': 'neris_release_reports',
                    'profile': NERIS_ADAPTER_PROFILES[label],
                    'codeSha256': sha((ROOT/'scripts/data/neris_release_reports.py').read_bytes()),
                }
            path = reports_dir/(label+'.json')
            path.write_bytes(release_raw)
            if label == 'neris':
                core_path = path
            elif veto_only:
                veto_paths.append(path)
            else:
                source_paths.append(path)
            for number, target in enumerate(targets):
                target_raw = archive.read(target)
                target_value = json.loads(target_raw)
                rows = target_value.get('targets') if isinstance(target_value, dict) else target_value
                if not isinstance(rows, list) or any(not isinstance(row, dict) or not row.get('key') for row in rows):
                    raise ValueError('Invalid exact target batch: '+label+' '+target)
                target_path = targets_dir/(label+'-'+str(number)+'.json')
                target_path.write_bytes(target_raw)
                target_paths.append(target_path)
            # These full reports carry negative evidence even for targets that
            # produced no final associated candidate.
            for source in NESTED_NEGATIVES.get(label, ()):
                nested_raw = archive.read('reports/'+source+'.json')
                nested_path = reports_dir/(label+'-'+source+'-veto.json')
                nested_path.write_bytes(nested_raw)
                veto_paths.append(nested_path)
            receipts.append({
                'profile': label, 'evidenceDirectory': str(evidence.relative_to(ROOT)),
                'archiveSha256': archive_sha, 'manifestSha256': sha(manifest_raw),
                'reportMember': member, 'rawReportSha256': sha(raw),
                'reportSha256': sha(release_raw), 'negativeEvidenceAdapter': adapter,
                'candidateCount': len(report['candidates']), 'vetoOnly': veto_only,
                'nativeReplay': 'passed',
            })
    receipt = {'schemaVersion': 1, 'originalPrimaryCount': 46791,
               'requiredUsablePrimaryCount': 44452, 'includePhoneSites': include_phone,
               'requiredProfileCount': len(profiles), 'profiles': receipts,
               'targetBatches': [{'file': path.name, 'sha256': sha(path.read_bytes())}
                                 for path in target_paths]}
    (output/'source-replay.json').write_bytes(dump(receipt))
    return core_path, source_paths, veto_paths, target_paths


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=pathlib.Path, required=True)
    parser.add_argument('--include-phone', action='store_true')
    parser.add_argument('--require-target', action='store_true')
    args = parser.parse_args()
    output = args.output.resolve()
    if output.exists() and any(output.iterdir()):
        raise ValueError('Use a new empty combined review directory')
    output.mkdir(parents=True, exist_ok=True)
    core, sources, vetoes, targets = prepare(output, args.include_phone)
    from build_primary_mapping_release import main as build
    argv = ['build_primary_mapping_release.py', '--output', str(output/'candidate'),
            '--report', str(output/'backend-report.json'), '--neris-report', str(core)]
    for name, paths in (('--source-report', sources), ('--veto-report', vetoes), ('--target-file', targets)):
        for path in paths:
            argv.extend((name, str(path)))
    if args.require_target:
        argv.append('--require-target')
    old_argv = sys.argv
    try:
        sys.argv = argv
        build()
    finally:
        sys.argv = old_argv
    result = json.loads((output/'backend-report.json').read_bytes())
    summary = {
        'schemaVersion': 1, 'before': result['before'], 'after': result['after'],
        'includePhoneSites': args.include_phone,
        'originalPrimaryCount': 46791, 'requiredUsablePrimaryCount': 44452,
        'qualifiedSourceConflictCount': len(result['qualifiedSourceConflicts']),
        'selectedNewMappingCount': len(result['selected']),
        'stalePhoneDonorsWithheld': len(result['stalePhoneDonorsWithheld']),
        'backendReportSha256': sha((output/'backend-report.json').read_bytes()),
        'sourceReplaySha256': sha((output/'source-replay.json').read_bytes()),
        'actualFrontendPassed': False,
        'publicationEligible': False,
    }
    (output/'coverage-summary.json').write_bytes(dump(summary))


if __name__ == '__main__':
    main()
