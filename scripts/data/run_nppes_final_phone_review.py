#!/usr/bin/env python3
"""Generate phone-site proofs only from an exactly pinned, fully reviewed donor."""
import argparse
import copy
import json
import pathlib
import re
import subprocess
import zipfile
from backfill_provider_locations import ROOT, sha, digest_file
from recover_nppes_native_primary import dump
from primary_recovery_baseline import load_primary_baseline
from recover_nppes_phone_sites import (EVIDENCE, DONOR_MEMBERS, retain, verify,
                                       release_files, usable, validate_final_phone_parent)

REVIEW_DIRECTORY = 'scripts/data/evidence/primary-review-combined-nonphone/2026-11-26'
REQUIRED_FILES = {'candidate.zip', 'backend-report.json', 'source-replay.json',
                  'coverage-summary.json', 'candidate-frontend-report.json', 'manifest.json'}
HIFLD_ARCHIVE_SHA = '18810f8d0a4abb224d1351b6baf9a2a01ef571e7d11c1bacd4fc84af9928b65c'
HIFLD_REPORT_SHA = 'c37e280dbae79d60db66d0f983195da9f1feeb01f17b8f0f659bbbbc1a0d904b'

def read_pins(path):
    value = json.loads(path.read_bytes())
    if value.get('schemaVersion') != 1 or value.get('enabled') is not True:
        raise ValueError('The exact final non-phone donor review has not been frozen')
    if value.get('identityProfile') != 'native-dba-reference':
        raise ValueError('The final phone profile must retain complete native Type 3 reference evidence')
    if not re.fullmatch('[0-9a-f]{40}', value.get('sourceCommit', '')):
        raise ValueError('An exact coherent donor-review commit is required')
    if value.get('evidenceDirectory') != REVIEW_DIRECTORY:
        raise ValueError('Unexpected final non-phone review directory')
    pins = value.get('sha256', {})
    if set(pins) != REQUIRED_FILES or any(not re.fullmatch('[0-9a-f]{64}', v) for v in pins.values()):
        raise ValueError('All six exact reviewed donor files require SHA256 pins')
    if not re.fullmatch('[0-9a-f]{64}', value.get('candidateIndexSha256', '')):
        raise ValueError('The exact reviewed donor index requires a SHA256 pin')
    return value

def extract_review(pins, destination):
    actual_commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    if actual_commit != pins['sourceCommit']:
        raise ValueError('The source checkout differs from the exact donor-review commit')
    directory = ROOT / REVIEW_DIRECTORY
    files = {}
    for name, expected in pins['sha256'].items():
        raw = (directory / name).read_bytes()
        if sha(raw) != expected:
            raise ValueError('Reviewed donor input changed: ' + name)
        files[name] = raw
    manifest = json.loads(files['manifest.json'])
    backend = json.loads(files['backend-report.json'])
    source_replay = json.loads(files['source-replay.json'])
    coverage = json.loads(files['coverage-summary.json'])
    frontend = json.loads(files['candidate-frontend-report.json'])
    if (manifest.get('scope') != 'combined-nonphone'
        or manifest.get('originalPrimaryCount') != 46791
        or manifest.get('requiredUsablePrimaryCount') != 44452
        or manifest.get('archiveSha256') != sha(files['candidate.zip'])
        or manifest.get('archiveBytes') != len(files['candidate.zip'])
        or manifest.get('actualFrontendPassed') is not True
        or manifest.get('fullTypecheckPassed') is not True
        or manifest.get('publicationEligible') is not False):
        raise ValueError('The complete donor review did not pass the actual app and type checks')
    for name in REQUIRED_FILES - {'manifest.json', 'candidate.zip'}:
        if manifest.get('files', {}).get(name) != {'sha256': sha(files[name]), 'bytes': len(files[name])}:
            raise ValueError('Reviewed manifest lost its exact result binding: ' + name)
    if (coverage.get('includePhoneSites') is not False
        or coverage.get('actualFrontendPassed') is not True
        or coverage.get('fullTypecheckPassed') is not True
        or coverage.get('backendReportSha256') != sha(files['backend-report.json'])
        or coverage.get('sourceReplaySha256') != sha(files['source-replay.json'])
        or coverage.get('after') != backend.get('after')
        or frontend.get('frontendContract') != 'passed'):
        raise ValueError('Donor coverage, source replay, frontend and backend records disagree')
    for field in ('totalPrimarySourceRecords', 'usableMapped', 'rawMapped', 'requiredMapped', 'targetMet'):
        if frontend.get(field) != backend['after'].get(field):
            raise ValueError('Actual app and backend donor metrics differ: ' + field)
    from run_combined_primary_review import PROFILES
    expected = {row[0]: row for row in PROFILES}
    receipts = source_replay.get('profiles', [])
    if (source_replay.get('includePhoneSites') is not False
        or source_replay.get('originalPrimaryCount') != 46791
        or source_replay.get('requiredUsablePrimaryCount') != 44452
        or source_replay.get('requiredProfileCount') != len(expected)
        or len(receipts) != len(expected)
        or {row.get('profile') for row in receipts} != set(expected)):
        raise ValueError('The complete required non-phone profile inventory changed')
    for receipt in receipts:
        profile = expected[receipt['profile']]
        expected_directory = 'scripts/data/evidence/' + profile[1] + '/2026-11-26'
        source_directory = ROOT / expected_directory
        if (receipt.get('nativeReplay') != 'passed'
            or receipt.get('evidenceDirectory') != expected_directory
            or receipt.get('reportMember') != profile[2]
            or receipt.get('manifestSha256') != digest_file(source_directory / 'manifest.json')
            or receipt.get('archiveSha256') != digest_file(source_directory / 'original.zip')):
            raise ValueError('Donor review source receipt changed: ' + receipt['profile'])
        with zipfile.ZipFile(source_directory / 'original.zip') as source_archive:
            if sha(source_archive.read(profile[2])) != receipt['rawReportSha256']:
                raise ValueError('Donor native report changed: ' + receipt['profile'])
    if destination.exists() and any(destination.iterdir()):
        raise ValueError('Use an empty temporary donor directory')
    destination.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(directory / 'candidate.zip') as archive:
        if set(archive.namelist()) != DONOR_MEMBERS or len(archive.namelist()) != len(DONOR_MEMBERS):
            raise ValueError('The donor archive must contain exactly the original 52 top-level files')
        for name in sorted(DONOR_MEMBERS):
            raw = archive.read(name)
            if name == 'index.json' and sha(raw) != pins['candidateIndexSha256']:
                raise ValueError('The donor index differs from the exact reviewed index')
            (destination / name).write_bytes(raw)
    return directory, files, coverage

def historical_overlap(path, entries, output, pins):
    if digest_file(path) != HIFLD_ARCHIVE_SHA:
        raise ValueError('Historical HIFLD diagnostic archive changed')
    with zipfile.ZipFile(path) as archive:
        if archive.namelist() != ['report.json']:
            raise ValueError('Historical HIFLD diagnostic membership changed')
        raw = archive.read('report.json')
    if sha(raw) != HIFLD_REPORT_SHA:
        raise ValueError('Historical HIFLD diagnostic report changed')
    diagnostic = json.loads(raw)
    original = {entry['key']: entry for entry in load_primary_baseline()[1]}
    actual = {entry['key']: entry for entry in entries}
    groups = []
    for group in diagnostic['qualifiedSiteGroups']:
        old = original[group['key']]
        if (any(group.get(k) != old.get(k) for k in ('key', 'name', 'source', 'state', 'sourceCounty', 'sourceDate'))
            or group['originalAddress'] != old['address'] or group['originalStatus'] != old['status']):
            raise ValueError('Historical diagnostic changed an original identity')
        donor = actual[group['key']]
        groups.append({**copy.deepcopy(group),
                       'finalNonphoneUsable': usable(donor),
                       'finalNonphoneEntry': copy.deepcopy(donor)})
    mapped = [row['key'] for row in groups if row['finalNonphoneUsable']]
    unresolved = [row['key'] for row in groups if not row['finalNonphoneUsable']]
    result = {'schemaVersion': 1, 'diagnosticOnly': True,
              'historicalReportSha256': HIFLD_REPORT_SHA, 'historicalArchiveSha256': HIFLD_ARCHIVE_SHA,
              'donorReviewCommit': pins['sourceCommit'],
              'donorIndexSha256': pins['candidateIndexSha256'],
              'qualifiedHistoricalGroups': len(groups),
              'alreadyUsableInFinalNonphoneCount': len(mapped), 'alreadyUsableInFinalNonphoneKeys': mapped,
              'unresolvedInFinalNonphoneCount': len(unresolved), 'unresolvedInFinalNonphoneKeys': unresolved,
              'groups': groups,
              'qualification': 'Current independent organization/site evidence at the same physical address is required before any primary-site association. Historical phone matches alone do not establish current occupancy.'}
    (output / 'historical-hifld-overlap.json').write_bytes(dump(result))
    compact = {key: value for key, value in result.items() if key != 'groups'}
    compact['groups'] = [{'key': row['key'], 'name': row['name'],
                         'finalNonphoneUsable': row['finalNonphoneUsable'],
                         'contactDates': sorted({str(obs['nativeContactDate']) for obs in row['sourceObservations']}),
                         'precisions': sorted({obs['match']['point']['precision'] for obs in row['sourceObservations']})}
                        for row in groups]
    (output / 'historical-hifld-overlap-summary.json').write_bytes(dump(compact))
    return compact

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--pins', type=pathlib.Path, required=True)
    parser.add_argument('--donor-output', type=pathlib.Path, required=True)
    parser.add_argument('--historical-hifld-archive', type=pathlib.Path)
    args = parser.parse_args()
    pins = read_pins(args.pins)
    directory, reviewed_files, coverage = extract_review(pins, args.donor_output)
    print('Replaying every donor entry against immutable identity and source evidence', flush=True)
    report, manifest = retain(args.donor_output, directory / 'backend-report.json',
                              identity_profile=pins['identityProfile'])
    replay, replay_manifest = verify()
    if report != replay or manifest != replay_manifest:
        raise ValueError('Independent retained phone-site derivation changed')
    _, _, entries = release_files(args.donor_output)
    final_by_key = {entry['key']: entry for entry in entries}
    if any(not validate_final_phone_parent(candidate, final_by_key) for candidate in report['candidates']):
        raise ValueError('A generated phone proof does not bind the exact final usable parent')
    from build_nppes_phone_contract import build as build_contract
    build_contract()
    receipt = {'schemaVersion': 1, 'identityProfile': pins['identityProfile'],
               'donorReview': copy.deepcopy(pins),
               'phoneArchiveSha256': manifest['archiveSha256'],
               'phoneReportSha256': manifest['reportSha256'],
               'candidateCount': len(report['candidates']),
               'withheldCount': len(report['withheld']),
               'exactFinalParentBindings': 'passed',
               'completeRetainedDonorReplay': 'passed',
               'donorActualFrontendPassed': coverage['actualFrontendPassed'],
               'donorFullTypecheckPassed': coverage['fullTypecheckPassed'],
               'phoneFiniteContractTest': 'separate required workflow step',
               'publication': 'Candidate associations only; the final combined release still requires full source, frontend, parent-equality and exact coverage gates.'}
    (EVIDENCE / 'review-inputs.json').write_bytes(dump(pins))
    (EVIDENCE / 'retention-receipt.json').write_bytes(dump(receipt))
    if args.historical_hifld_archive:
        historical_overlap(args.historical_hifld_archive, entries, EVIDENCE, pins)
    print(json.dumps(receipt), flush=True)

if __name__ == '__main__':
    main()
