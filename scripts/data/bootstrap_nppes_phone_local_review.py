#!/usr/bin/env python3
"""Build non-phone and final phone reviews in one process, with local-only data.

The normal source validators still execute. Reusing the same Python process
preserves their immutable verified catalogs across the ordinary code paths.
Only LocalReview's closed aggregate schema is suitable for external output.
"""
import argparse
import contextlib
import pathlib
import sys
import traceback

from backfill_provider_locations import ROOT, digest_file
from run_nppes_phone_local_review import LocalReview, PNPM, canonical, code_state, run_command


def component_contract_checks(private):
    """Exercise generated component pins and actual frontend/API source contracts."""
    compiled = private/'source-contracts'
    source_before = code_state()
    roots = ('artifacts/ems-territory-intelligence/src/services', 'artifacts/api-server/src/lib')
    names = ('nppesPrimaryComponentsContract.ts', 'federalCityPointContract.ts', 'tigerPrimaryPointContract.ts')
    compile_receipt = run_command(PNPM+[
        'exec', 'tsc', '--module', 'commonjs', '--moduleResolution', 'node',
        '--target', 'ES2022', '--strict', '--skipLibCheck', '--resolveJsonModule', '--esModuleInterop',
        '--outDir', str(compiled), *[root+'/'+name for root in roots for name in names],
    ], private/'component-contract-compile.log')
    mutations = run_command(['node', 'scripts/test-native-source-contracts.cjs', str(compiled)],
                            private/'component-contract-mutations.log')
    if code_state() != source_before:
        raise ValueError('Native component code or finite bindings changed during checks')
    receipt = {'compile': compile_receipt, 'actualProofMutations': mutations,
               'codeStateSha256': source_before}
    path = private/'component-finite-checks.json'
    path.write_bytes(canonical(receipt))
    return digest_file(path)


def paths(nonphone, output, aggregate):
    base = (ROOT/'generated-artifacts').resolve()
    values = [nonphone.resolve(), output.resolve(), aggregate.resolve()]
    if any(base not in value.parents for value in values):
        raise ValueError('All review paths must remain inside local generated-artifacts')
    first, second, summary = values
    if first == second or first in second.parents or second in first.parents:
        raise ValueError('Use separate non-phone and final review directories')
    if (summary.suffix != '.json' or first in summary.parents or second in summary.parents
        or summary == first or summary == second or summary.exists()):
        raise ValueError('Use a new aggregate JSON beside the private review directories')
    if any(value.exists() and any(value.iterdir()) for value in (first, second)):
        raise ValueError('Both review directories must be new or empty')
    return first, second, summary


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--nonphone-output', type=pathlib.Path, required=True)
    parser.add_argument('--output', type=pathlib.Path, required=True)
    parser.add_argument('--aggregate-output', type=pathlib.Path, required=True)
    parser.add_argument('--prepare-qualified-profile', action='store_true')
    parser.add_argument('--require-target', action='store_true')
    args = parser.parse_args()
    nonphone, output, aggregate = paths(args.nonphone_output, args.output, args.aggregate_output)
    bootstrap_private = output.with_name(output.name+'-bootstrap-private')
    if bootstrap_private.exists():
        raise ValueError('Use a new private bootstrap directory')
    bootstrap_private.mkdir(parents=True)
    bootstrap_log = bootstrap_private/'review.log'
    review = LocalReview(nonphone, output, aggregate)
    try:
        print('Local bootstrap: validating source profiles and building non-phone candidate', flush=True)
        with bootstrap_log.open('w') as log:
            with contextlib.redirect_stdout(log), contextlib.redirect_stderr(log):
                try:
                    if args.prepare_qualified_profile:
                        from review_nppes_component_qualification import main as prepare
                        prepare()
                    from run_combined_primary_review import main as combine
                    old_argv = sys.argv
                    try:
                        sys.argv = ['run_combined_primary_review.py', '--output', str(nonphone)]
                        combine()
                    finally:
                        sys.argv = old_argv
                    # These finite fixtures are generated locally from the same
                    # fully replayed corrected component catalog, before UI use.
                    from build_nppes_component_contract import build
                    build(extended=True)
                    review.result['hashes']['componentFiniteChecksSha256'] = component_contract_checks(bootstrap_private)
                except BaseException:
                    traceback.print_exc(file=log)
                    raise
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
