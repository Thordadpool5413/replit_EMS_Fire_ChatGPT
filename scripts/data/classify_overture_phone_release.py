#!/usr/bin/env python3
"""Private, read-only overlap and retained-conflict audit for Places diagnostics.

This consumes a completed source scan and an already-built exact release. It
does not create mapped candidates, alter public files, or publish record data.
Every record-level result remains in the explicitly supplied local work path.
"""
import argparse
import collections
import copy
import hashlib
import importlib
import json
import pathlib
import sys


def digest(raw):
    return hashlib.sha256(raw).hexdigest()


def dump(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':'),
                       ensure_ascii=True, allow_nan=False)+'\n').encode()


def read(path):
    raw = path.read_bytes()
    return json.loads(raw), digest(raw)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--diagnostic', type=pathlib.Path, required=True)
    parser.add_argument('--release', type=pathlib.Path, required=True,
                        help='Combined review directory containing candidate and backend-report.json')
    parser.add_argument('--root', type=pathlib.Path, required=True,
                        help='Exact root checkout used to build the release')
    parser.add_argument('--output', type=pathlib.Path, required=True)
    args = parser.parse_args()
    sys.path.insert(0, str(args.root.resolve()/'scripts/data'))
    baseline_module = importlib.import_module('primary_recovery_baseline')
    builder = importlib.import_module('build_primary_mapping_release')
    consensus = importlib.import_module('primary_source_consensus')
    neris = importlib.import_module('recover_neris_primary')

    diagnostic, diagnostic_sha = read(args.diagnostic)
    scope = diagnostic['summary']
    if not all(scope.get(field) is True for field in (
            'fullPlacesPhoneScanComplete', 'completeUSCoordinateReuseAudit',
            'nativeSourceAddressEndpointAuditComplete')):
        raise ValueError('A partial source scan cannot establish this opportunity')
    if (scope['completeGlobalPlacesFiles'] != 16 or
            scope['completeGlobalPlacesRowsScanned'] != 90295748 or
            scope['completeUSAddressBearingPlacesRows'] != 18806080):
        raise ValueError('Unexpected fixed Places source scope')
    _, baseline_rows, baseline_sha = baseline_module.load_primary_baseline()
    originals = {row['key']: row for row in baseline_rows}
    if diagnostic['inputReceipt']['baselineIndexSha256'] != baseline_sha:
        raise ValueError('Source diagnostic uses a different original baseline')

    index, index_sha = read(args.release/'candidate/index.json')
    final_rows = []
    for chunk in index['chunks']:
        rows, actual = read(args.release/'candidate'/chunk['file'])
        if actual != chunk['sha256']:
            raise ValueError('Release shard changed')
        final_rows.extend(rows)
    final = {row['key']: row for row in final_rows}
    if len(final_rows) != 46791 or set(final) != set(originals):
        raise ValueError('The exact original release identity set changed')
    for key, row in final.items():
        if any(row[field] != originals[key][field] for field in
               ('key', 'name', 'source', 'state', 'sourceDate', 'sourceCounty')):
            raise ValueError('Release changed original identity metadata')
    backend, backend_sha = read(args.release/'backend-report.json')
    if backend['baselineIndexSha256'] != baseline_sha or builder.metric(final_rows) != backend['after']:
        raise ValueError('Release metric/baseline differs from its exact backend report')
    replay, replay_sha = read(args.release/'source-replay.json')
    reports = []
    report_pins = []
    for source in backend['sourceReports']:
        value, actual = read(args.release/'reports'/source['file'])
        if actual != source['sha256']:
            raise ValueError('Qualified native source report changed')
        value['_vetoOnly'] = source['vetoOnly']
        reports.append(value)
        report_pins.append(source)
    batches = []
    for target in replay['targetBatches']:
        value, actual = read(args.release/'targets'/target['file'])
        if actual != target['sha256']:
            raise ValueError('Native negative-evidence target scope changed')
        rows = value['targets'] if isinstance(value, dict) else value
        batches.append({'sha256': actual, 'targets': rows})
    vetoes = builder.collect_vetoes(originals, reports, batches)
    accepted = collections.defaultdict(list)
    for report in reports:
        if report['_vetoOnly']:
            continue
        for candidate in report['candidates']:
            key = candidate['key']
            if key not in originals:
                raise ValueError('Accepted release source contains a synthetic primary identity')
            accepted[key].append(candidate)

    clean = [row for row in diagnostic['observations'] if not row['exclusions']]
    diagnosed = []
    for observation in clean:
        key = observation['key']
        if observation['originalPrimary'] != originals[key]:
            raise ValueError('Diagnostic altered the exact original primary binding')
        result = {'key': key, 'observation': copy.deepcopy(observation),
                  'exactReleaseEntry': copy.deepcopy(final[key]),
                  'alreadyUsable': bool(builder.usable(final[key]))}
        if result['alreadyUsable']:
            diagnosed.append(result)
            continue
        address = observation['sourceAddress']
        # A precise reported point does not inherit an approximate range veto.
        # Association-only negatives remain visible; this diagnostic does not
        # decide whether a future inferred-site contract may resolve them.
        negative = [copy.deepcopy(row) for row in vetoes.get(key, [])
                    if builder.same_site_address(address, row['targetAddress'])
                    and row['precision'] != 'range']
        native_vetoes = builder.native_neris_vetoes(address, originals[key].get('sourceCounty', ''))
        points = []
        for point in observation['sourceAddressNativeEndpoints']:
            points.append({'method': 'overture-place-address',
                           'latitude': point['coordinatesAsReported'][0],
                           'longitude': point['coordinatesAsReported'][1],
                           'countyFips': point['countyFips'], 'nativeId': point['nativeId']})
        # Every point from an accepted retained profile at this exact site is
        # expanded through the same native endpoint API as the central builder.
        retained_options = []
        for candidate in accepted.get(key, []):
            if (candidate['match']['method'] in consensus.INTERPOLATED or
                    not builder.same_site_address(address, candidate['address'])):
                continue
            entry = builder.apply_candidate(originals[key], candidate)
            points.extend(consensus.entry_witnesses(entry))
            retained_options.append(copy.deepcopy(candidate))
        # Historical contact age cannot establish current occupancy, but a
        # qualified same-address native geometry is still conflicting evidence
        # if it disagrees. Expand every source endpoint, not just its display
        # point, and retain the original dates in the attached observation.
        for historical in observation['historicalHifldObservations']:
            match = historical['match']
            if match['method'] not in consensus.INTERPOLATED:
                points.extend(consensus.point_witnesses(match, address))
        # Complete native NERIS address observations also participate even when
        # no organization/site association candidate was selected for this NPI.
        for row, basis in neris.matching_records({'address': address}, consensus._neris_native()):
            if row['withheldReason']:
                continue
            points.append({'method': 'neris-reported-address',
                           'latitude': row['coordinates'][0], 'longitude': row['coordinates'][1],
                           'countyFips': row['countyFips'], 'nativeId': row['object']['id']})
        points = list({dump(point): point for point in points}.values())
        counties = {point['countyFips'] for point in points}
        disagreement = len(counties) != 1 or any(
            builder.distance(left, right) > 75
            for number, left in enumerate(points) for right in points[number+1:])
        result.update(retainedQualifiedNegatives=negative,
                      completeNativeNerisVetoes=native_vetoes,
                      retainedAcceptedSiteCandidates=retained_options,
                      qualifiedNativeEndpoints=points,
                      allPairsCountyOrCoordinateDisagreement=disagreement,
                      passesKnownRetainedSourceChecks=not negative and not native_vetoes and not disagreement
                          and not observation['historicalSameAddressConflictReasons'],
                      crossSourceAcquisitionForNewStreetCompleted=False,
                      newFiniteAssociationProofImplemented=False, mappedCandidate=False)
        diagnosed.append(result)
    remaining = [row for row in diagnosed if not row['alreadyUsable']]
    passing = [row for row in remaining if row['passesKnownRetainedSourceChecks']]
    count = lambda rows: len({row['key'] for row in rows})
    summary = {
        'schemaVersion': 1, 'profile': 'private-complete-places-exact-release-overlap',
        'originalPrimaryCount': 46791, 'exactReleaseMetric': backend['after'],
        'identitiesPassingCompletePlacesChecks': count(diagnosed),
        'alreadyUsableInExactRelease': count([row for row in diagnosed if row['alreadyUsable']]),
        'stillUnusableInExactRelease': count(remaining),
        'stillUnusableWithRetainedQualifiedNegatives': count([row for row in remaining if row['retainedQualifiedNegatives']]),
        'stillUnusableWithCompleteNativeNerisVeto': count([row for row in remaining if row['completeNativeNerisVetoes']]),
        'stillUnusableWithNativeEndpointDisagreement': count([row for row in remaining if row['allPairsCountyOrCoordinateDisagreement']]),
        'stillUnusableWithHistoricalSameAddressConflict': count([row for row in remaining if row['observation']['historicalSameAddressConflictReasons']]),
        'stillUnusablePassingKnownRetainedSourceChecks': count(passing),
        'remainingWithCorroboratedPrimaryStreet': count([row for row in passing if row['observation']['streetCorroboration']['rule'] != 'primary-street-not-corroborated']),
        'remainingWithoutCorroboratedPrimaryStreet': count([row for row in passing if row['observation']['streetCorroboration']['rule'] == 'primary-street-not-corroborated']),
        'remainingWithSameHistoricalHifldAddress': count([row for row in passing if row['observation']['historicalHifldObservations']]),
        'remainingWithHistoricalSameAddressConflict': count([row for row in passing if row['observation']['historicalSameAddressConflictReasons']]),
        'registeredPrimarySiteRoleConfirmed': False,
        'newFiniteAssociationProofImplemented': False,
        'newMappedCount': 0, 'qualifiedMappingCount': None,
        'newRecordLevelOutputExported': False,
    }
    proof = {'summary': summary, 'diagnosticSha256': diagnostic_sha,
             'releaseIndexSha256': index_sha, 'backendReportSha256': backend_sha,
             'sourceReplaySha256': replay_sha, 'sourceReports': report_pins,
             'classifierSha256': digest(pathlib.Path(__file__).read_bytes()),
             'builderSha256': digest((args.root/'scripts/data/build_primary_mapping_release.py').read_bytes()),
             'consensusSha256': digest((args.root/'scripts/data/primary_source_consensus.py').read_bytes()),
             'observations': diagnosed}
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output/'private-overlap.json').write_bytes(dump(proof))
    (args.output/'summary.json').write_bytes(dump({**summary, 'privateProofSha256': digest(dump(proof))}))
    print(json.dumps(summary, sort_keys=True), flush=True)


if __name__ == '__main__':
    main()
