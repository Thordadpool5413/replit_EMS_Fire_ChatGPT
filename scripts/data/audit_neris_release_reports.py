#!/usr/bin/env python3
"""Run the production negative collector against replay-bound NERIS reports."""
import argparse
import ast
import collections
import copy
import json
import pathlib
from backfill_provider_locations import sha
from recover_neris_primary import dump
from primary_recovery_baseline import INDEX_SHA as BASELINE_INDEX_SHA
from neris_release_reports import PROFILES, combined_release_report, read_profile

def production_collector(path):
    # Compile only the exact production collector functions and their literal
    # reason inventories. This avoids importing unrelated publication modules.
    tree = ast.parse(path.read_text())
    names = {'_reason_set', '_qualified_rejection_records', 'collect_vetoes'}
    constants = {'QUALIFIED_REJECTIONS', 'IDENTITY_REJECTIONS'}
    selected = []
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in names:
            selected.append(node)
        elif isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id in constants for target in node.targets):
            selected.append(node)
    if len(selected) != len(names)+len(constants):
        raise ValueError('Production collector structure changed')
    scope = {'collections': collections, 'copy': copy, 'sha': sha, 'dump': dump,
             'BASELINE_INDEX_SHA': BASELINE_INDEX_SHA,
             'INTERPOLATED': {'tiger-address-range', 'census-address-range'}}
    exec(compile(ast.Module(body=selected, type_ignores=[]), str(path), 'exec'), scope)
    return scope['collect_vetoes']

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--builder-file', type=pathlib.Path, required=True)
    parser.add_argument('--profile', choices=PROFILES, action='append', required=True)
    parser.add_argument('--output', type=pathlib.Path, required=True)
    args = parser.parse_args()
    collect = production_collector(args.builder_file)
    checks = []
    for profile in args.profile:
        raw, targets, inputs, manifest, directory, member = read_profile(profile)
        bound = combined_release_report(profile)
        originals = {row['key']: row for row in inputs['entries']}
        batches = [{'sha256': sha(dump(targets)), 'targets': targets}] if targets else []
        try:
            collect(originals, [raw], batches)
            raw_error = None
        except ValueError as error:
            raw_error = str(error)
        vetoes = collect(originals, [bound], batches)
        checks.append({'profile': profile, 'rawReportSha256': sha(dump(raw)),
                       'derivedReportSha256': sha(dump(bound)), 'rawCollectorError': raw_error,
                       'boundCollector': 'passed', 'primaryIdentitiesWithVetoes': len(vetoes),
                       'qualifiedReasonCounts': dict(sorted(collections.Counter(
                           reason for rows in vetoes.values() for row in rows for reason in row['reasons']).items())),
                       'adapter': bound['releaseNegativeAdapter']})
    result = {'productionBuilderSha256': sha(args.builder_file.read_bytes()), 'checks': checks}
    args.output.parent.mkdir(parents=True, exist_ok=True); args.output.write_bytes(dump(result))
    print(json.dumps(result), flush=True)

if __name__ == '__main__':
    main()
