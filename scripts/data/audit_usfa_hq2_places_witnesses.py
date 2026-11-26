#!/usr/bin/env python3
"""Local-only, nonselectable Places witnesses for seven frozen HQaddr2 sites.

Uses the already verified complete US native projection. This script has no
download/acquisition path and never enables a new source selection or mapping.
"""
import argparse
import collections
import copy
import json
import pathlib

from primary_recovery_baseline import INDEX_SHA, load_primary_baseline
from scan_overture_phone_inventory import select_address_rows, address_signature, SOURCE_INVENTORY_SHA
from stage_overture_primary_addresses import encoded, sha, file_sha, RELEASE
from stage_overture_primary_places import GLOBAL_FILES, GLOBAL_COUNT, US_COUNT
from match_overture_primary_addresses import target_indexes, coordinate_key, wkb_point, source_block_reason, points_agree
from match_overture_primary_places import target_refs, projected_quality_reason, reuse_one, resolve

TARGETS_SHA256 = 'c5fdc7382a9093a245b21f9d1488576b7e6fb307e61b67739a3e6eed19e7e205'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--targets', type=pathlib.Path, required=True)
    parser.add_argument('--work', type=pathlib.Path, required=True)
    parser.add_argument('--output', type=pathlib.Path, required=True)
    args = parser.parse_args()
    raw = args.targets.read_bytes()
    if sha(raw) != TARGETS_SHA256:
        raise ValueError('Seven-target native HQaddr2 scope changed')
    targets = json.loads(raw)
    if len(targets) != 7 or len({t['key'] for t in targets}) != 7:
        raise ValueError('Native HQaddr2 witness scope is not exactly seven')
    _, originals, baseline_sha = load_primary_baseline()
    original_index = {row['key']: row for row in originals}
    if baseline_sha != INDEX_SHA:
        raise ValueError('Original primary baseline changed')
    for target in targets:
        old = original_index[target['originalPrimaryKey']]
        if old['source'] != 'USFA' or target['source'] != 'USFA':
            raise ValueError('HQaddr2 target is not an original USFA identity')
        if target['originalPrimaryAddress'] != old['address']:
            raise ValueError('HQaddr2 target changed the original combined address')
        if any(target[field] != old[field] for field in ('name', 'state', 'source', 'sourceCounty', 'sourceDate')):
            raise ValueError('HQaddr2 target changed original metadata')
        if not address_signature(target['address']):
            raise ValueError('HQaddr2 target lacks a strict physical street/state/ZIP')
    metadata_raw = (args.work/'metadata-inventory.json').read_bytes()
    if sha(metadata_raw) != SOURCE_INVENTORY_SHA:
        raise ValueError('Complete fixed Places inventory changed')
    metadata = json.loads(metadata_raw)
    sources = {source['key']: source for source in metadata['files']}
    receipts = [json.loads(path.read_bytes()) for path in sorted((args.work/'receipts').glob('*.json'))]
    if (len(receipts) != GLOBAL_FILES or sum(r['sourceRows'] for r in receipts) != GLOBAL_COUNT
            or sum(r['usRows'] for r in receipts) != US_COUNT
            or {r['source']['key'] for r in receipts} != set(sources)):
        raise ValueError('Required complete global/US acquisition receipts are missing')
    for receipt in receipts:
        if receipt['source'] != sources[receipt['source']['key']]:
            raise ValueError('Public source file identity changed')
        if receipt['usRows'] and file_sha(args.work/receipt['cacheFile']) != receipt['cacheSha256']:
            raise ValueError('Complete US native cache changed')
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output/'targets.json').write_bytes(raw)
    target_data = {'locationIndexSha256': baseline_sha, 'targetsSha256': sha(encoded(targets)),
                   'inputTargetsFileSha256': TARGETS_SHA256, 'targets': targets}
    signatures = {address_signature(target['address']) for target in targets}
    indexes = target_indexes(targets)
    records = []
    for receipt in receipts:
        if not receipt['usRows']:
            continue
        selected = select_address_rows(receipt, args.work, signatures)
        for record in selected:
            record['targets'] = target_refs(record['nativeRecord'], indexes)
            if not record['targets']:
                raise ValueError('Selected source row is not bound to a frozen target')
        records.extend(selected)
        print(json.dumps({'stage': 'local-complete-US-address-audit',
                          'usRowsScanned': receipt['usRows'], 'nativeRowsRetained': len(selected)}), flush=True)
    identities = [(row['sourceFile'], row['sourceRowNumber']) for row in records]
    if len(set(identities)) != len(identities):
        raise ValueError('Native source row repeats across projection files')
    (args.output/'selected-native-records.json').write_bytes(encoded({'release': RELEASE, 'records': records}))
    points = sorted({coordinate_key(point) for record in records
                     if not source_block_reason(record['nativeRecord'])
                     and not projected_quality_reason(record['nativeRecord'])
                     and (point := wkb_point(record['nativeRecord']['geometryWkb'])) is not None})
    audits = [reuse_one(receipt, args.output, points, cache_root=args.work)
              for receipt in receipts if receipt['usRows']]
    if sum(audit['usRowsScanned'] for audit in audits) != US_COUNT:
        raise ValueError('Incomplete national coordinate-reuse audit')
    strict = resolve(target_data, records, audits, SOURCE_INVENTORY_SHA)
    (args.output/'strict-source-selection-report.json').write_bytes(encoded(strict))
    # The same strict resolver is applied to each native row so every eligible
    # endpoint is retained, even when a multi-row cluster has a positive veto.
    # These are observations only; the four-source display selection is intact.
    by_target = collections.defaultdict(list)
    for record in records:
        single = resolve(target_data, [record], audits, SOURCE_INVENTORY_SHA)
        for candidate in single['candidates']:
            by_target[candidate['key']].append({
                'selectable': False, 'role': 'nonselectable-consensus-witness',
                'source': 'overture-place-address', 'match': candidate['match'],
                'countyFips': candidate['countyFips'], 'targetAddress': candidate['address'],
                'sourceFile': record['sourceFile'], 'sourceRowNumber': record['sourceRowNumber'],
                'sourceFileSha256': record['sourceFileSha256'],
                'nativeRecordSha256': record['sourceSha256'],
            })
    rejected = []
    for row in strict['rejected']:
        target = next(target for target in targets if target['key'] == row['key'])
        rejected.append({**copy.deepcopy(row), 'originalPrimaryKey': target['originalPrimaryKey'],
                         'targetAddress': copy.deepcopy(target['address']),
                         'source': 'overture-place-address', 'selectable': False})
    serious = {'source-point-county-conflict', 'coordinate-shared-by-distinct-addresses',
               'invalid-native-point', 'conflicting-native-points'}
    positive_keys = {row['key'] for row in rejected
                     if row['reason'] in serious or set(row['blockedReasons']) & serious}
    observations = []
    for target in targets:
        endpoints = by_target.get(target['key'], [])
        points_at_site = [[row['match']['latitude'], row['match']['longitude']] for row in endpoints]
        observations.append({'key': target['key'], 'originalPrimaryKey': target['originalPrimaryKey'],
                             'targetAddress': copy.deepcopy(target['address']),
                             'inputTarget': copy.deepcopy(target), 'selectable': False,
                             'qualifiedNativeEndpoints': endpoints,
                             'positiveSourceConflict': target['key'] in positive_keys,
                             'eligibleEndpointAllPairsAgree': points_agree(points_at_site),
                             'qualifiedNativeEndpointCounties': sorted({row['countyFips'] for row in endpoints})})
    cache_receipts = [{name: row[name] for name in ('source', 'sourceFileSha256', 'sourceRows', 'usRows',
                       'cacheFile', 'cacheSha256', 'cacheBytes', 'digestScope')} for row in receipts]
    (args.output/'complete-source-cache-receipts.json').write_bytes(encoded(cache_receipts))
    summary = {'schemaVersion': 1, 'targetCount': 7, 'targetFileSha256': TARGETS_SHA256,
               'completeUSRowsAudited': US_COUNT, 'completeNationalCoordinateReuseAudit': True,
               'nativeSourceRowsRetained': len(records),
               'targetsWithQualifiedNativeEndpoints': sum(bool(row['qualifiedNativeEndpoints']) for row in observations),
               'qualifiedNativeEndpointCount': sum(len(row['qualifiedNativeEndpoints']) for row in observations),
               'targetsWithPositiveSourceConflicts': len(positive_keys),
               'strictSourceOutcomes': strict['outcomes'],
               'selectablePlaceCandidates': 0, 'newSourceAcquisition': False,
               'newGlobalPhoneScan': False, 'newMappedCount': 0,
               'newRecordLevelOutputExported': False}
    report = {'schemaVersion': 1, 'method': 'overture-place-address',
              'source': 'overture-place-address-nonselectable-hqaddr2-consensus',
              'release': RELEASE, 'sourceInventorySha256': SOURCE_INVENTORY_SHA,
              'baselineIndexSha256': baseline_sha, 'targetFileSha256': TARGETS_SHA256,
              'targetsSha256': target_data['targetsSha256'], 'inputTargets': targets,
              'summary': summary, 'candidates': [], 'observations': observations, 'rejected': rejected,
              'purpose': 'Nonselectable address-point consensus witnesses only; original four-source selection is unchanged.',
              'codeSha256': file_sha(pathlib.Path(__file__)),
              'strictMatcherCodeSha256': file_sha(pathlib.Path(__file__).with_name('match_overture_primary_places.py')),
              'cacheReceiptSha256': sha(encoded(cache_receipts)),
              'nativeRecordsSha256': sha((args.output/'selected-native-records.json').read_bytes()),
              'reuseAuditSha256': sha(encoded(audits))}
    (args.output/'report.json').write_bytes(encoded(report))
    (args.output/'summary.json').write_bytes(encoded({**summary, 'reportSha256': sha(encoded(report))}))
    print(json.dumps(summary, sort_keys=True), flush=True)


if __name__ == '__main__':
    main()
