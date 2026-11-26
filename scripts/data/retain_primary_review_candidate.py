#!/usr/bin/env python3
"""Retain a measured combined candidate without publishing live location shards."""
import argparse
import json
import pathlib
import shutil
import zipfile
from backfill_provider_locations import ROOT, sha
from build_primary_mapping_release import dump


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input', type=pathlib.Path, required=True)
    parser.add_argument('--stage', choices=('combined-nonphone', 'combined'), required=True)
    parser.add_argument('--frontend-passed', action='store_true')
    parser.add_argument('--typecheck-passed', action='store_true')
    args = parser.parse_args()
    source = args.input
    destination = ROOT/'scripts/data/evidence'/('primary-review-'+args.stage)/'2026-11-26'
    destination.mkdir(parents=True, exist_ok=True)
    backend = json.loads((source/'backend-report.json').read_bytes())
    summary = json.loads((source/'coverage-summary.json').read_bytes())
    frontend_path = source/'candidate-frontend-report.json'
    frontend = json.loads(frontend_path.read_bytes()) if frontend_path.is_file() else None
    passed = bool(args.frontend_passed and frontend and frontend.get('frontendContract') == 'passed')
    if passed and any(frontend[field] != backend['after'][field]
                      for field in ('totalPrimarySourceRecords', 'usableMapped', 'rawMapped', 'requiredMapped', 'targetMet')):
        raise ValueError('Frontend and backend review metrics differ')
    eligible = bool(args.stage == 'combined' and passed and args.typecheck_passed and backend['after']['targetMet'])
    summary.update(actualFrontendPassed=passed, fullTypecheckPassed=args.typecheck_passed,
                   publicationEligible=eligible)
    if frontend:
        summary['actualFrontend'] = frontend
    (source/'coverage-summary.json').write_bytes(dump(summary))
    for name in ('backend-report.json', 'source-replay.json', 'coverage-summary.json', 'candidate-frontend-report.json'):
        path = source/name
        if path.is_file():
            shutil.copyfile(path, destination/name)
    with zipfile.ZipFile(destination/'candidate.zip', 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for path in sorted((source/'candidate').glob('*.json')):
            info = zipfile.ZipInfo(path.name, date_time=(2026, 11, 26, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, path.read_bytes())
    archive_bytes = (destination/'candidate.zip').read_bytes()
    manifest = {
        'schemaVersion': 1, 'scope': args.stage, 'originalPrimaryCount': 46791,
        'requiredUsablePrimaryCount': 44452, 'archiveSha256': sha(archive_bytes),
        'archiveBytes': len(archive_bytes), 'actualFrontendPassed': passed,
        'fullTypecheckPassed': args.typecheck_passed, 'targetMet': backend['after']['targetMet'],
        'publicationEligible': eligible,
        'files': {path.name: {'sha256': sha(path.read_bytes()), 'bytes': path.stat().st_size}
                  for path in sorted(destination.glob('*.json')) if path.name != 'manifest.json'},
    }
    (destination/'manifest.json').write_bytes(dump(manifest))
    print(json.dumps(summary), flush=True)


if __name__ == '__main__':
    main()
