#!/usr/bin/env python3
"""Explain retained NERIS geocode decisions without changing eligibility."""
import argparse
import collections
import itertools
import json
import pathlib
import zipfile
from backfill_provider_locations import sha
from recover_neris_primary import dump, distance
from recover_neris_geocoded_sites import collect_observations, native_index, matching_records, load_departments

def maximum(points):
    return round(max((distance([a['latitude'], a['longitude']], [b['latitude'], b['longitude']])
                      for a, b in itertools.combinations(points, 2)), default=0), 3)

def summarize(directory):
    manifest = json.loads((directory/'manifest.json').read_bytes())
    with zipfile.ZipFile(directory/'original.zip') as archive:
        report_raw = archive.read('candidates.json')
        if sha(report_raw) != manifest['members']['candidates.json']['sha256']:
            raise ValueError('Retained geocode report digest changed')
        report = json.loads(report_raw)
        targets = json.loads(archive.read('inputs/targets.json'))
        sources = {source: json.loads(archive.read('reports/'+source+'.json'))
                   for source in report['requiredSources']}
    target_index = {target['key']: target for target in targets}
    n = len(targets)+(609 if 'overture' in sources else 0)
    observed, _, _ = collect_observations(targets, sources, report['targetVariantsSha256'], n)
    native = native_index(load_departments())
    outcomes = collections.Counter()
    veto_classes = collections.Counter()
    examples = collections.defaultdict(list)
    native_selected_issues = collections.Counter()
    for target in targets:
        native_id = target['primaryAddressEvidence']['site']['id']
        native_selected_issues.update(record['withheldReason'] or 'qualified-native-point'
            for record, _ in matching_records(target, native) if record['object']['id'] == native_id)
    for row in report['withheld']:
        key = row['key']
        for conflict in row.get('sourceConflicts', []):
            veto_classes.update(conflict['source']+':'+reason for reason in conflict.get('reasons', []))
        endpoints = row.get('allQualifiedNativeEndpoints', [])
        separate = [point for point in endpoints if point['method'] != 'neris-reported-address']
        native_points = [point for point in endpoints if point['method'] == 'neris-reported-address']
        separate_disagrees = len({point['countyFips'] for point in separate}) > 1 or maximum(separate) > 75
        group = row['reason']
        if endpoints:
            group += ':separate-source-disagreement' if separate_disagrees else ':native-versus-separate-disagreement'
        outcomes[group] += 1
        if len(examples[group]) < 8:
            target = target_index[key]
            examples[group].append({
                'key': key, 'targetAddress': target['address'], 'sourceCounty': target.get('sourceCounty'),
                'nativeSite': target['primaryAddressEvidence']['site'],
                'sourceConflicts': row.get('sourceConflicts', []),
                'qualifiedIndependentSources': [point['source'] for point in observed.get(key, [])],
                'independentSelectedPoints': [
                    {'source': point['source'], 'coordinates': [point['match']['latitude'], point['match']['longitude']],
                     'sourceAddress': point['match'].get('sourceAddress'), 'countyFips': point['countyFips']}
                    for point in observed.get(key, [])],
                'allQualifiedNativeEndpoints': endpoints,
                'maximumSeparateSourceDistanceMeters': maximum(separate),
                'maximumAllEndpointDistanceMeters': maximum(endpoints),
                'qualifiedNerisEndpointCount': len(native_points)})
    return {
        'schemaVersion': 1, 'method': report['method'], 'reportSha256': sha(report_raw),
        'archiveSha256': manifest['archiveSha256'], 'targetSha256': report['targetVariantsSha256'],
        'targetCount': len(targets), 'candidateCount': len(report['candidates']),
        'sourceReports': report['sourceReports'], 'selectionOutcomes': report['outcomes'],
        'withheldReasonClasses': dict(sorted(outcomes.items())),
        'qualifiedSourceVetoClasses': dict(sorted(veto_classes.items())),
        'selectedNativeSitePointIssues': dict(sorted(native_selected_issues.items())),
        'candidatePrimaryKeys': [row['key'] for row in report['candidates']],
        'examples': dict(examples),
        'limitations': 'Diagnostic explanation only. No eligibility decision or source precision is changed.'}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--evidence', type=pathlib.Path, required=True)
    parser.add_argument('--output', type=pathlib.Path, required=True)
    args = parser.parse_args()
    result = summarize(args.evidence)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(dump(result))
    print(json.dumps({key: value for key, value in result.items() if key not in ('examples', 'candidatePrimaryKeys')}), flush=True)

if __name__ == '__main__':
    main()
