#!/usr/bin/env python3
"""Measure final phone associations locally; export only a closed aggregate schema.

All candidate shards, source records, finite proof bindings, reports and logs stay
in this checkout. This module does not commit, push, upload, or send provider
records. The caller may export only the explicitly requested aggregate JSON.
"""
import argparse
import collections
import contextlib
import hashlib
import json
import math
import pathlib
import re
import secrets
import subprocess
import sys
import traceback
import unittest
from unittest import mock
import zipfile

from backfill_provider_locations import ROOT, sha, digest_file

PNPM = ['corepack', 'pnpm@10.34.9']
TOTAL = 46791
REQUIRED = 44452
PHONE_METHOD = 'nppes-usfa-primary-site-correlation'
METHODS = {
    'census-address-range', 'nad-address-point', 'ohio-lbrs-address-point',
    'ny-sam-address-point', 'regional-address-point', 'neris-reported-address',
    'usgs-structure-address', 'hifld-ems-address', 'hifld-fire-address',
    'overture-address', 'overture-place-address', 'tiger-address-range',
}
SOURCES = {'USFA', 'NPPES', 'State EMS'}
PHASES = (
    'nonphone_input_binding', 'nonphone_app_checks', 'phone_native_replay',
    'phone_finite_contract_checks', 'final_source_combine', 'final_app_checks',
    'final_parent_and_aggregate_checks',
    'unsent_residual_preparation',
)
HASH_FIELDS = {
    'sourceCommit', 'initialCodeStateSha256', 'nonphoneIndexSha256',
    'nonphoneBackendSha256', 'nonphoneSourceReplaySha256',
    'nonphoneChecksSha256', 'phoneArchiveSha256', 'phoneReportSha256',
    'phoneFiniteChecksSha256', 'finalIndexSha256', 'finalBackendSha256',
    'finalSourceReplaySha256', 'finalChecksSha256', 'finalCodeStateSha256',
    'residualSummarySha256', 'unsentRequestSha256', 'unsentRequestManifestSha256',
    'unsentRequestBindingsSha256', 'componentFiniteChecksSha256',
}
METRIC_FIELDS = {
    'totalPrimarySourceRecords', 'rawMapped', 'usableMapped',
    'usableCoveragePct', 'targetPct', 'requiredMapped', 'remainingToTarget',
    'targetMet', 'countyConflictsWithheld', 'bySource', 'byMethod',
}
PHONE_FIELDS = {
    'identityPairCount', 'generatedCandidateCount', 'withheldCandidateCount',
    'finalUsablePhoneCount', 'candidateAlreadyUsableNonphoneCount',
    'netUsableDifference', 'withheldReasonCounts', 'selectedByCoordinateMethod',
}
WITHHELD_REASONS = {
    'final-nonphone-usfa-parent-not-usable',
    'nppes-original-source-county-conflict',
}
RESIDUAL_FIELDS = {
    'unusablePrimaryCount', 'remainingToTarget', 'originalPhysicalAddressCount',
    'originalGridAddressCount', 'retainedCountyHolds', 'requestPrepared',
    'requestSent', 'uniqueOriginalAddressRequests', 'originalPrimaryRecordsRepresented',
    'requestBytes',
}


def canonical(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':'))+'\n').encode()


def integer(value, low=0, high=TOTAL):
    return type(value) is int and low <= value <= high


def bounded_counts(value, allowed):
    return (isinstance(value, dict) and set(value) <= allowed
            and all(integer(count) for count in value.values()))


def aggregate_metric(value):
    """Select and validate only fixed numeric/source/method aggregate fields."""
    result = {key: value[key] for key in METRIC_FIELDS}
    for key in METRIC_FIELDS-{'usableCoveragePct', 'targetMet', 'bySource', 'byMethod'}:
        if not integer(result[key]):
            raise ValueError('Invalid aggregate metric count')
    if (result['totalPrimarySourceRecords'] != TOTAL or result['requiredMapped'] != REQUIRED
        or result['targetPct'] != 95 or not isinstance(result['targetMet'], bool)
        or result['usableMapped'] > result['rawMapped']
        or result['targetMet'] != (result['usableMapped'] >= REQUIRED)
        or result['remainingToTarget'] != max(0, REQUIRED-result['usableMapped'])
        or type(result['usableCoveragePct']) not in (int, float)
        or not math.isfinite(result['usableCoveragePct'])
        or result['usableCoveragePct'] != round(100*result['usableMapped']/TOTAL, 4)
        or not bounded_counts(result['bySource'], SOURCES)
        or set(result['bySource']) != SOURCES
        or sum(result['bySource'].values()) != result['usableMapped']
        or not bounded_counts(result['byMethod'], METHODS)
        or sum(result['byMethod'].values()) != result['usableMapped']):
        raise ValueError('Aggregate metric is not bound to the fixed denominator')
    return result


def aggregate_phone(value):
    if set(value) != PHONE_FIELDS:
        raise ValueError('Unsupported phone aggregate payload')
    for key in PHONE_FIELDS-{'netUsableDifference', 'withheldReasonCounts', 'selectedByCoordinateMethod'}:
        if not integer(value[key]):
            raise ValueError('Invalid phone aggregate count')
    if (not integer(value['netUsableDifference'], -TOTAL, TOTAL)
        or not bounded_counts(value['withheldReasonCounts'], WITHHELD_REASONS)
        or not bounded_counts(value['selectedByCoordinateMethod'], METHODS)):
        raise ValueError('Unsupported phone aggregate count label')
    return value


def aggregate_residual(value):
    if (set(value) != RESIDUAL_FIELDS or value['requestSent'] is not False
        or not isinstance(value['requestPrepared'], bool)
        or not integer(value['requestBytes'], 0, 100000000)
        or any(not integer(value[key]) for key in RESIDUAL_FIELDS-{'requestSent', 'requestPrepared', 'requestBytes'})
        or value['uniqueOriginalAddressRequests'] > 10000):
        raise ValueError('Unsupported unsent residual aggregate payload')
    return value


def validate_aggregate(value):
    """Reject every unrecognized field/value before any exportable JSON write."""
    fields = {'schemaVersion', 'executionScope', 'publicationEligible',
              'containsProviderRecords', 'status', 'phaseOutcomes', 'hashes',
              'nonphone', 'final', 'phone', 'residual', 'failureCode'}
    if (set(value) != fields or value['schemaVersion'] != 1
        or value['executionScope'] != 'same-runner-local'
        or value['publicationEligible'] is not False
        or value['containsProviderRecords'] is not False
        or value['status'] not in ('running', 'passed', 'target-not-met', 'failed')
        or set(value['phaseOutcomes']) != set(PHASES)
        or any(v not in ('not-run', 'passed', 'failed') for v in value['phaseOutcomes'].values())
        or set(value['hashes'])-HASH_FIELDS):
        raise ValueError('Aggregate output contains an unsupported field')
    for key, digest in value['hashes'].items():
        size = 40 if key == 'sourceCommit' else 64
        if not isinstance(digest, str) or not re.fullmatch('[0-9a-f]{'+str(size)+'}', digest):
            raise ValueError('Invalid aggregate hash')
    for key in ('nonphone', 'final'):
        metric = value[key]
        if metric is not None and (set(metric) != METRIC_FIELDS or aggregate_metric(metric) != metric):
            raise ValueError('Unsupported aggregate metric payload')
    phone = value['phone']
    if phone is not None:
        aggregate_phone(phone)
    if value['residual'] is not None:
        aggregate_residual(value['residual'])
    if value['failureCode'] not in {None, 'initialization-failed', *[p+'-failed' for p in PHASES]}:
        raise ValueError('Failure details must remain in local logs')
    if value['status'] in ('passed', 'target-not-met'):
        if (any(v != 'passed' for v in value['phaseOutcomes'].values())
            or value['final'] is None or value['phone'] is None or value['residual'] is None
            or value['failureCode'] is not None
            or (value['status'] == 'passed') != value['final']['targetMet']):
            raise ValueError('Aggregate success is not bound to all completed checks')
    return value


def code_state():
    """Bind actual local code/configuration, including newly generated pins."""
    paths = {pathlib.Path(__file__).resolve()}
    for directory in (ROOT/'scripts', ROOT/'artifacts/ems-territory-intelligence/src',
                      ROOT/'artifacts/api-server/src', ROOT/'lib', ROOT/'packages'):
        for path in directory.rglob('*'):
            if (path.is_file() and path.suffix in {'.py', '.ts', '.tsx', '.mjs', '.cjs', '.js', '.json'}
                and 'node_modules' not in path.parts and 'evidence' not in path.parts):
                paths.add(path)
    for path in (ROOT/'package.json', ROOT/'pnpm-lock.yaml', ROOT/'pnpm-workspace.yaml',
                 ROOT/'scripts/package.json', ROOT/'artifacts/ems-territory-intelligence/package.json',
                 ROOT/'artifacts/api-server/package.json'):
        if path.is_file():
            paths.add(path)
    digest = hashlib.sha256()
    for path in sorted(paths):
        digest.update(str(path.relative_to(ROOT)).encode()+b'\0')
        digest.update(bytes.fromhex(digest_file(path)))
    return digest.hexdigest()


def review_binding(directory, include_phone):
    from recover_nppes_phone_sites import DONOR_MEMBERS, release_files
    from run_combined_primary_review import required_profiles, NERIS_ADAPTER_PROFILES, NESTED_NEGATIVES
    candidate = directory/'candidate'
    if {p.name for p in candidate.iterdir()} != DONOR_MEMBERS:
        raise ValueError('Candidate must contain exactly the original 52 files')
    files, index, entries = release_files(candidate)
    backend_raw = (directory/'backend-report.json').read_bytes()
    replay_raw = (directory/'source-replay.json').read_bytes()
    backend, replay = json.loads(backend_raw), json.loads(replay_raw)
    from build_primary_mapping_release import metric
    if backend['after'] != metric(entries):
        raise ValueError('Candidate differs from its actual backend metrics')
    expected = {row[0]: row for row in required_profiles(include_phone)}
    receipts = replay.get('profiles', [])
    if (replay.get('includePhoneSites') is not include_phone
        or replay.get('originalPrimaryCount') != TOTAL
        or replay.get('requiredUsablePrimaryCount') != REQUIRED
        or replay.get('requiredProfileCount') != len(expected)
        or len(receipts) != len(expected)
        or {row.get('profile') for row in receipts} != set(expected)):
        raise ValueError('Complete native profile receipt inventory changed')
    expected_reports, expected_targets = {}, []
    for receipt in receipts:
        profile = expected[receipt['profile']]
        relative = 'scripts/data/evidence/'+profile[1]+'/2026-11-26'
        evidence = ROOT/relative
        if (receipt.get('nativeReplay') != 'passed'
            or receipt.get('evidenceDirectory') != relative
            or receipt.get('reportMember') != profile[2]
            or receipt.get('manifestSha256') != digest_file(evidence/'manifest.json')
            or receipt.get('archiveSha256') != digest_file(evidence/'original.zip')
            or receipt.get('reportSha256') != digest_file(directory/'reports'/(receipt['profile']+'.json'))
            or receipt.get('rawReportSha256') != digest_file(directory/'raw-reports'/(receipt['profile']+'.json'))):
            raise ValueError('Complete native profile receipt lost its exact source binding')
        with zipfile.ZipFile(evidence/'original.zip') as archive:
            if sha(archive.read(profile[2])) != receipt['rawReportSha256']:
                raise ValueError('Complete native source report changed')
            for number, member in enumerate(profile[7]):
                expected_targets.append({'file': receipt['profile']+'-'+str(number)+'.json',
                                         'sha256': sha(archive.read(member))})
            for source in NESTED_NEGATIVES.get(receipt['profile'], ()):
                name = receipt['profile']+'-'+source+'-veto.json'
                digest = sha(archive.read('reports/'+source+'.json'))
                if digest_file(directory/'reports'/name) != digest:
                    raise ValueError('Complete nested native negative evidence changed')
                expected_reports[name] = {'file': name, 'sha256': digest, 'vetoOnly': True}
        report_name = receipt['profile']+'.json'
        expected_reports[report_name] = {'file': report_name, 'sha256': receipt['reportSha256'],
                                        'vetoOnly': profile[6]}
        adapter = receipt.get('negativeEvidenceAdapter')
        if receipt['profile'] in NERIS_ADAPTER_PROFILES:
            expected_adapter = {'module': 'neris_release_reports',
                                'profile': NERIS_ADAPTER_PROFILES[receipt['profile']],
                                'codeSha256': digest_file(ROOT/'scripts/data/neris_release_reports.py')}
            if adapter != expected_adapter:
                raise ValueError('Native negative-evidence adapter changed')
        elif adapter is not None:
            raise ValueError('Unexpected native negative-evidence adapter')
    supplied_reports = backend.get('sourceReports', [])
    if (len(supplied_reports) != len(expected_reports)
        or {row.get('file') for row in supplied_reports} != set(expected_reports)
        or any(row != expected_reports[row['file']] for row in supplied_reports)
        or index.get('primaryMappingRecovery', {}).get('sourceReports') != supplied_reports):
        raise ValueError('Backend release lost its complete positive and negative report inventory')
    if replay.get('targetBatches') != expected_targets:
        raise ValueError('Source replay lost an exact source-native target batch')
    for target in replay.get('targetBatches', []):
        name = target.get('file', '')
        if pathlib.PurePath(name).name != name or digest_file(directory/'targets'/name) != target['sha256']:
            raise ValueError('Exact native target batch changed')
    binding = {'indexSha256': sha(files['index.json']), 'backendSha256': sha(backend_raw),
               'sourceReplaySha256': sha(replay_raw),
               'files': {name: sha(raw) for name, raw in files.items()}}
    return binding, backend, entries


def run_command(command, log):
    with log.open('wb') as stream:
        result = subprocess.run(command, cwd=ROOT, stdout=stream, stderr=subprocess.STDOUT, check=False)
    if result.returncode:
        raise RuntimeError('A required local command failed; details stay in the local log')
    return {'exitCode': 0, 'outcome': 'passed', 'command': command,
            'logSha256': digest_file(log)}


def run_app_checks(directory, private, label, include_phone, session):
    before, backend, _ = review_binding(directory, include_phone)
    source_before = code_state()
    frontend = run_command(PNPM+['--filter', '@workspace/scripts', 'exec', 'node', '--import', 'tsx',
                           '../scripts/check-primary-map-consumption.mjs', str(directory/'candidate')],
                           private/(label+'-frontend.log'))
    frontend_path = directory/'candidate-frontend-report.json'
    parsed = json.loads(frontend_path.read_bytes())
    if parsed.get('frontendContract') != 'passed':
        raise ValueError('Actual application location consumption did not pass')
    for field in ('totalPrimarySourceRecords', 'usableMapped', 'rawMapped', 'requiredMapped', 'targetMet'):
        if parsed.get(field) != backend['after'].get(field):
            raise ValueError('Actual application and backend metrics differ')
    types = run_command(PNPM+['run', 'typecheck'], private/(label+'-typecheck.log'))
    after, _, _ = review_binding(directory, include_phone)
    if before != after or code_state() != source_before:
        raise ValueError('Inputs or code changed during actual app/typecheck validation')
    receipt = {'schemaVersion': 1, 'session': session, 'includePhoneSites': include_phone,
               'binding': before, 'codeStateSha256': source_before,
               'frontendReportSha256': digest_file(frontend_path),
               'frontend': frontend, 'typecheck': types}
    path = private/(label+'-checks.json')
    path.write_bytes(canonical(receipt))
    coverage_path = directory/'coverage-summary.json'
    coverage = json.loads(coverage_path.read_bytes())
    if coverage.get('after') != backend['after'] or coverage.get('includePhoneSites') is not include_phone:
        raise ValueError('Local coverage summary lost its complete backend binding')
    coverage.update(actualFrontendPassed=True, fullTypecheckPassed=True,
                    publicationEligible=False, actualFrontend=parsed,
                    localValidationReceiptSha256=digest_file(path))
    coverage_path.write_bytes(canonical(coverage))
    return receipt, digest_file(path)


def require_check_receipt(receipt, binding, session, include_phone):
    if (receipt.get('session') != session or receipt.get('binding') != binding
        or receipt.get('includePhoneSites') is not include_phone
        or receipt.get('codeStateSha256') != code_state()
        or any(receipt.get(key, {}).get('exitCode') != 0
               or receipt.get(key, {}).get('outcome') != 'passed'
               for key in ('frontend', 'typecheck'))):
        raise ValueError('Successful checks do not bind this exact same-runner candidate')


class LocalReview:
    def __init__(self, nonphone, output, aggregate):
        self.nonphone, self.output, self.aggregate_path = nonphone, output, aggregate
        self.private = output/'private'
        self.phase_name = None
        self.result = {'schemaVersion': 1, 'executionScope': 'same-runner-local',
                       'publicationEligible': False, 'containsProviderRecords': False,
                       'status': 'running', 'phaseOutcomes': {p: 'not-run' for p in PHASES},
                       'hashes': {}, 'nonphone': None, 'final': None, 'phone': None,
                       'residual': None,
                       'failureCode': None}

    @contextlib.contextmanager
    def phase(self, name):
        if name not in PHASES:
            raise ValueError('Unsupported local review phase')
        self.phase_name = name
        print('Local review phase:', name, flush=True)
        with (self.private/(name+'.log')).open('w') as log:
            with contextlib.redirect_stdout(log), contextlib.redirect_stderr(log):
                try:
                    yield
                except BaseException:
                    self.result['phaseOutcomes'][name] = 'failed'
                    traceback.print_exc(file=log)
                    raise
        self.result['phaseOutcomes'][name] = 'passed'

    def run(self):
        if self.output.exists() and any(self.output.iterdir()):
            raise ValueError('Use a new empty local review output directory')
        self.private.mkdir(parents=True, exist_ok=True)
        session = secrets.token_hex(32)
        hashes = self.result['hashes']
        hashes['sourceCommit'] = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
        hashes['initialCodeStateSha256'] = code_state()
        with self.phase('nonphone_input_binding'):
            binding, backend, nonphone_entries = review_binding(self.nonphone, False)
            self.result['nonphone'] = aggregate_metric(backend['after'])
            hashes.update(nonphoneIndexSha256=binding['indexSha256'],
                          nonphoneBackendSha256=binding['backendSha256'],
                          nonphoneSourceReplaySha256=binding['sourceReplaySha256'])
        with self.phase('nonphone_app_checks'):
            receipt, hashes['nonphoneChecksSha256'] = run_app_checks(self.nonphone, self.private, 'nonphone', False, session)
        with self.phase('phone_native_replay'):
            actual_binding, _, _ = review_binding(self.nonphone, False)
            require_check_receipt(receipt, actual_binding, session, False)
            from recover_nppes_phone_sites import retain, verify, runtime_indexes, validate_final_phone_parent
            phone_report, phone_manifest = retain(self.nonphone/'candidate', self.nonphone/'backend-report.json',
                                                  identity_profile='native-dba-reference')
            replay, replay_manifest = verify()
            if replay != phone_report or replay_manifest != phone_manifest:
                raise ValueError('Local retained donor and native phone replay differ')
            nonphone_by_key = {entry['key']: entry for entry in nonphone_entries}
            if any(not validate_final_phone_parent(c, nonphone_by_key) for c in phone_report['candidates']):
                raise ValueError('Generated association lost its exact usable donor')
            runtime_indexes.cache_clear()
            from build_nppes_phone_contract import build
            build()
            hashes.update(phoneArchiveSha256=phone_manifest['archiveSha256'],
                          phoneReportSha256=phone_manifest['reportSha256'])
        with self.phase('phone_finite_contract_checks'):
            compiled = self.private/'phone-contracts'
            compile_receipt = run_command(PNPM+['exec', 'tsc', '--module', 'commonjs', '--moduleResolution', 'node',
                '--target', 'ES2022', '--strict', '--skipLibCheck', '--resolveJsonModule', '--esModuleInterop',
                '--outDir', str(compiled),
                'artifacts/ems-territory-intelligence/src/services/nppesPhoneSiteContract.ts',
                'artifacts/api-server/src/lib/nppesPhoneSiteContract.ts'], self.private/'phone-contract-compile.log')
            mutation_receipt = run_command(['node', 'scripts/test-native-phone-contracts.cjs', str(compiled)],
                                           self.private/'phone-contract-mutations.log')
            finite_receipt = {'compile': compile_receipt, 'actualProofMutations': mutation_receipt,
                              'phoneArchiveSha256': phone_manifest['archiveSha256']}
            (self.private/'phone-finite-checks.json').write_bytes(canonical(finite_receipt))
            hashes['phoneFiniteChecksSha256'] = digest_file(self.private/'phone-finite-checks.json')
        final_directory = self.output/'final'
        with self.phase('final_source_combine'):
            from run_combined_primary_review import main as combine
            old_argv = sys.argv
            try:
                sys.argv = ['run_combined_primary_review.py', '--output', str(final_directory), '--include-phone']
                combine()
            finally:
                sys.argv = old_argv
            final_binding, final_backend, final_entries = review_binding(final_directory, True)
            self.result['final'] = aggregate_metric(final_backend['after'])
            hashes.update(finalIndexSha256=final_binding['indexSha256'],
                          finalBackendSha256=final_binding['backendSha256'],
                          finalSourceReplaySha256=final_binding['sourceReplaySha256'])
        with self.phase('final_app_checks'):
            final_receipt, hashes['finalChecksSha256'] = run_app_checks(final_directory, self.private, 'final', True, session)
        with self.phase('final_parent_and_aggregate_checks'):
            actual_final_binding, _, final_entries = review_binding(final_directory, True)
            require_check_receipt(final_receipt, actual_final_binding, session, True)
            from recover_nppes_phone_sites import usable, validate_nppes_phone_primary_entry
            final_by_key = {entry['key']: entry for entry in final_entries}
            selected = [entry for entry in final_entries if usable(entry)
                        and (entry.get('primaryAddressEvidence') or {}).get('method') == PHONE_METHOD]
            national = runtime_indexes()[2]
            if any(not validate_final_phone_parent(entry, final_by_key)
                   or entry['key'] not in national
                   or not validate_nppes_phone_primary_entry(entry, national[entry['key']]) for entry in selected):
                raise ValueError('A final phone entry lost its native proof or exact final parent')
            self.result['phone'] = aggregate_phone({
                'identityPairCount': phone_report['candidateIdentityPairs'],
                'generatedCandidateCount': len(phone_report['candidates']),
                'withheldCandidateCount': len(phone_report['withheld']),
                'finalUsablePhoneCount': len(selected),
                'candidateAlreadyUsableNonphoneCount': sum(usable(nonphone_by_key[c['key']]) for c in phone_report['candidates']),
                'netUsableDifference': self.result['final']['usableMapped']-self.result['nonphone']['usableMapped'],
                'withheldReasonCounts': dict(sorted(collections.Counter(row['reason'] for row in phone_report['withheld']).items())),
                'selectedByCoordinateMethod': dict(sorted(collections.Counter(entry['match']['method'] for entry in selected).items())),
            })
            hashes['finalCodeStateSha256'] = code_state()
        with self.phase('unsent_residual_preparation'):
            from prepare_primary_residual import prepare
            residual = prepare(final_directory)
            self.result['residual'] = aggregate_residual({
                'unusablePrimaryCount': residual['unusablePrimaryCount'],
                'remainingToTarget': residual['remainingToTarget'],
                'originalPhysicalAddressCount': residual['originalPhysicalAddressCount'],
                'originalGridAddressCount': residual['originalGridAddressCount'],
                'retainedCountyHolds': residual['retainedCountyHolds'],
                'requestPrepared': residual['requestPrepared'], 'requestSent': False,
                'uniqueOriginalAddressRequests': residual.get('uniqueOriginalAddressRequests', 0),
                'originalPrimaryRecordsRepresented': residual.get('originalPrimaryRecordsRepresented', 0),
                'requestBytes': residual.get('requestBytes', 0),
            })
            hashes['residualSummarySha256'] = digest_file(final_directory/'residual-summary.json')
            if residual['requestPrepared']:
                manifest_path = final_directory/'census-address-request-manifest.json'
                request_manifest = json.loads(manifest_path.read_bytes())
                request_path = final_directory/'census-address-request.csv'
                if (request_manifest.get('status') != 'prepared-not-sent'
                    or request_manifest.get('authorizationRequired') is not True
                    or request_manifest.get('donorCandidateIndexSha256') != hashes['finalIndexSha256']
                    or request_manifest.get('backendReportSha256') != hashes['finalBackendSha256']
                    or request_manifest.get('sha256') != digest_file(request_path)):
                    raise ValueError('Unsent request lost its exact local candidate binding')
                hashes.update(unsentRequestSha256=digest_file(request_path),
                              unsentRequestManifestSha256=digest_file(manifest_path),
                              unsentRequestBindingsSha256=digest_file(final_directory/'census-address-request-bindings.json'))
        self.result['status'] = 'passed' if self.result['final']['targetMet'] else 'target-not-met'
        return self.result

    def write_aggregate(self):
        validate_aggregate(self.result)
        self.aggregate_path.parent.mkdir(parents=True, exist_ok=True)
        self.aggregate_path.write_bytes(canonical(self.result))
        # Deliberately no provider records, arbitrary messages, paths or raw logs.
        print(json.dumps(self.result, sort_keys=True), flush=True)


class AggregateGuards(unittest.TestCase):
    def sample(self):
        return LocalReview(pathlib.Path('/not-read'), pathlib.Path('/not-written'), pathlib.Path('/not-written')).result

    def test_record_payload_is_rejected(self):
        value = self.sample()
        value['candidateRecords'] = [{'key': 'NPI:sentinel'}]
        with self.assertRaises(ValueError):
            validate_aggregate(value)

    def test_failure_message_cannot_export_records(self):
        value = self.sample()
        value['failureCode'] = 'Provider address sentinel'
        with self.assertRaises(ValueError):
            validate_aggregate(value)

    def test_hash_slot_cannot_export_record(self):
        value = self.sample()
        value['hashes']['phoneReportSha256'] = 'provider-phone-sentinel'
        with self.assertRaises(ValueError):
            validate_aggregate(value)

    def test_unrun_check_cannot_claim_success(self):
        value = self.sample()
        value['status'] = 'passed'
        with self.assertRaises(ValueError):
            validate_aggregate(value)

    def test_fixed_denominator_rejects_metric_inflation(self):
        metric = {'totalPrimarySourceRecords': TOTAL-1, 'rawMapped': 0, 'usableMapped': 0,
                  'usableCoveragePct': 0.0, 'targetPct': 95, 'requiredMapped': REQUIRED,
                  'remainingToTarget': REQUIRED, 'targetMet': False, 'countyConflictsWithheld': 0,
                  'bySource': {s: 0 for s in SOURCES}, 'byMethod': {}}
        with self.assertRaises(ValueError):
            aggregate_metric(metric)

    def test_closed_labels_reject_record_in_count_key(self):
        self.assertFalse(bounded_counts({'NPI:sentinel': 1}, METHODS))

    def test_changed_candidate_cannot_reuse_successful_receipts(self):
        receipt = {'session': 'local-session', 'binding': {'indexSha256': 'a'*64},
                   'includePhoneSites': False, 'codeStateSha256': 'c'*64,
                   'frontend': {'exitCode': 0, 'outcome': 'passed'},
                   'typecheck': {'exitCode': 0, 'outcome': 'passed'}}
        with mock.patch(__name__+'.code_state', return_value='c'*64):
            with self.assertRaises(ValueError):
                require_check_receipt(receipt, {'indexSha256': 'b'*64}, 'local-session', False)

    def test_failed_typecheck_cannot_supply_donor_receipt(self):
        binding = {'indexSha256': 'a'*64}
        receipt = {'session': 'local-session', 'binding': binding,
                   'includePhoneSites': False, 'codeStateSha256': 'c'*64,
                   'frontend': {'exitCode': 0, 'outcome': 'passed'},
                   'typecheck': {'exitCode': 1, 'outcome': 'passed'}}
        with mock.patch(__name__+'.code_state', return_value='c'*64):
            with self.assertRaises(ValueError):
                require_check_receipt(receipt, binding, 'local-session', False)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--nonphone', type=pathlib.Path)
    parser.add_argument('--output', type=pathlib.Path)
    parser.add_argument('--aggregate-output', type=pathlib.Path)
    parser.add_argument('--require-target', action='store_true')
    parser.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    if args.self_test:
        result = unittest.TextTestRunner().run(unittest.defaultTestLoader.loadTestsFromTestCase(AggregateGuards))
        raise SystemExit(0 if result.wasSuccessful() else 1)
    if not args.nonphone or not args.output or not args.aggregate_output:
        parser.error('--nonphone, --output and --aggregate-output are required')
    nonphone, output, aggregate = args.nonphone.resolve(), args.output.resolve(), args.aggregate_output.resolve()
    if output == nonphone or output in nonphone.parents or nonphone in output.parents:
        parser.error('Use separate non-phone and local final-review directories')
    # An aggregate destination must never overwrite a candidate, evidence or code input.
    if (aggregate.suffix != '.json' or aggregate.exists()
        or aggregate == nonphone or nonphone in aggregate.parents
        or output in aggregate.parents
        or ROOT/'scripts' in aggregate.parents or ROOT/'artifacts' in aggregate.parents):
        parser.error('Use a new aggregate JSON path outside source, evidence and non-phone inputs')
    review = LocalReview(nonphone, output, aggregate)
    try:
        review.run()
    except (Exception, SystemExit):
        review.result['status'] = 'failed'
        review.result['failureCode'] = (review.phase_name or 'initialization')+'-failed'
        if review.private.is_dir():
            with (review.private/'failure.log').open('w') as log:
                traceback.print_exc(file=log)
        review.write_aggregate()
        raise SystemExit(1)
    review.write_aggregate()
    if args.require_target and not review.result['final']['targetMet']:
        raise SystemExit(2)


if __name__ == '__main__':
    main()
