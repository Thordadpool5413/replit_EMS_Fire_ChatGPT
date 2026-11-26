#!/usr/bin/env python3
"""Replay the frozen local seven-site Places witnesses without new acquisition.

The complete address/reuse passes are bound by a frozen local file inventory.
Every retained native row and reuse witness is re-read from the hash-verified
complete US cache, then the unchanged strict Places selector is replayed.
These endpoints are never selectable primary candidates.
"""
import argparse
import collections
import copy
import functools
import json
import pathlib
import zipfile

from primary_recovery_baseline import INDEX_SHA, load_primary_baseline
from stage_overture_primary_addresses import encoded, sha, file_sha, RELEASE, connection
from stage_overture_primary_places import GLOBAL_FILES, GLOBAL_COUNT, US_COUNT
from match_overture_primary_addresses import target_indexes, coordinate_key, wkb_point, source_block_reason, points_agree
from match_overture_primary_places import target_refs, projected_quality_reason, resolve, place_fingerprints
from scan_overture_phone_inventory import SOURCE_INVENTORY_SHA, normal_native, native_record, address_signature
import retain_overture_primary_places as retained_places

TARGETS_SHA256 = 'c5fdc7382a9093a245b21f9d1488576b7e6fb307e61b67739a3e6eed19e7e205'
REPLAY_MANIFEST_SHA256 = '4ce88939c0e854449a131dbfdee62a21589d8fbbcb0059fc40e563c7886003db'
DEFAULT_WORK = pathlib.Path('/workspace/scratch/48f9de0ecbca/overture-phone-work')
DEFAULT_DIRECTORY = DEFAULT_WORK/'usfa-hq2-places-witnesses'


def require(condition, message):
    if not condition:
        raise ValueError(message)


def _native_cache_rows(cache, numbers):
    if not numbers:
        return {}
    import pyarrow as pa
    c = connection()
    try:
        c.register('wanted_native_rows', pa.table({'number': sorted(numbers)}))
        rows = c.execute('SELECT * FROM read_parquet(?) WHERE file_row_number IN '
                         '(SELECT number FROM wanted_native_rows) ORDER BY file_row_number',
                         [str(cache)]).to_arrow_table().to_pylist()
        result = {}
        for value in rows:
            number, row = normal_native(value)
            require(number not in result, 'Native source row repeats in complete cache')
            result[number] = row
        require(set(result) == set(numbers), 'Retained native witness is absent from complete cache')
        return result
    finally:
        c.close()


@functools.lru_cache(maxsize=2)
def _verify(directory, work):
    directory, work = pathlib.Path(directory), pathlib.Path(work)
    manifest_raw = (directory/'replay-manifest.json').read_bytes()
    require(sha(manifest_raw) == REPLAY_MANIFEST_SHA256, 'Frozen seven-site replay manifest changed')
    manifest = json.loads(manifest_raw)
    require(manifest['targetFileSha256'] == TARGETS_SHA256, 'Frozen target scope changed')
    files = manifest['files']
    require(len(files) == len({row['file'] for row in files}), 'Duplicate retained replay file')
    for item in files:
        relative = pathlib.PurePosixPath(item['file'])
        require(not relative.is_absolute() and '..' not in relative.parts, 'Unsafe retained replay path')
        path = directory/item['file']
        require(path.stat().st_size == item['bytes'] and file_sha(path) == item['sha256'],
                'Retained seven-site evidence file changed')
    expected_files = {row['file'] for row in files} | {'replay-manifest.json'}
    require({str(p.relative_to(directory)) for p in directory.rglob('*') if p.is_file()} == expected_files,
            'Frozen seven-site evidence inventory changed')
    targets_raw = (directory/'targets.json').read_bytes()
    require(sha(targets_raw) == TARGETS_SHA256, 'Exact seven-target input changed')
    targets = json.loads(targets_raw)
    require(len(targets) == len({t['key'] for t in targets}) == 7, 'Seven-site membership changed')
    _, originals, baseline_sha = load_primary_baseline()
    require(baseline_sha == INDEX_SHA, 'Original immutable baseline changed')
    original_index = {row['key']: row for row in originals}
    for target in targets:
        old = original_index[target['originalPrimaryKey']]
        require(old['source'] == target['source'] == 'USFA' and
                target['originalPrimaryAddress'] == old['address'] and
                all(target[field] == old[field] for field in ('name', 'state', 'source', 'sourceCounty', 'sourceDate')),
                'Native HQaddr2 target changed original identity/address metadata')
        require(bool(address_signature(target['address'])), 'Native HQaddr2 target is not a strict physical address')
    metadata_raw = (work/'metadata-inventory.json').read_bytes()
    require(sha(metadata_raw) == SOURCE_INVENTORY_SHA, 'Complete fixed Places inventory changed')
    sources = {row['key']: row for row in json.loads(metadata_raw)['files']}
    require(len(sources) == GLOBAL_FILES and sum(row['rows'] for row in sources.values()) == GLOBAL_COUNT,
            'Complete fixed Places source scope changed')
    require(file_sha(retained_places.EVIDENCE/'original.zip') == retained_places.ARCHIVE_SHA256,
            'Pinned ordinary Places source archive changed')
    with zipfile.ZipFile(retained_places.EVIDENCE/'original.zip') as archive:
        frozen = json.loads(archive.read('complete-us-receipt.json'))
        require(sha(archive.read('metadata-inventory.json')) == SOURCE_INVENTORY_SHA,
                'Native archive source inventory changed')
    original_digests = {r['source']['key']: r['sourceFileSha256'] for r in frozen['files']}
    receipts = [json.loads(path.read_bytes()) for path in sorted((work/'receipts').glob('*.json'))]
    require(len(receipts) == GLOBAL_FILES and {r['source']['key'] for r in receipts} == set(sources) and
            sum(r['sourceRows'] for r in receipts) == GLOBAL_COUNT and sum(r['usRows'] for r in receipts) == US_COUNT,
            'Complete native source/cache receipts changed')
    retained_receipts = json.loads((directory/'complete-source-cache-receipts.json').read_bytes())
    projected_receipts = [{name: row[name] for name in ('source', 'sourceFileSha256', 'sourceRows', 'usRows',
                          'cacheFile', 'cacheSha256', 'cacheBytes', 'digestScope')} for row in receipts]
    require(projected_receipts == retained_receipts, 'Retained complete cache receipts changed')
    receipt_index = {}
    for receipt in receipts:
        key = receipt['source']['key']
        require(receipt['source'] == sources[key] and receipt['sourceRows'] == sources[key]['rows'],
                'Complete original public source binding changed')
        if key in original_digests:
            require(receipt['sourceFileSha256'] == original_digests[key], 'Pinned complete original source digest changed')
        else:
            require(receipt['usRows'] == 0, 'US native rows lack the original retained source-file digest')
        if receipt['usRows']:
            cache = work/receipt['cacheFile']
            require(cache.stat().st_size == receipt['cacheBytes'] and file_sha(cache) == receipt['cacheSha256'],
                    'Complete US native projection changed')
            receipt_index[key] = receipt
    records_file = json.loads((directory/'selected-native-records.json').read_bytes())
    require(records_file['release'] == RELEASE, 'Selected native release changed')
    records = records_file['records']
    require(len(records) == len({(r['sourceFile'], r['sourceRowNumber']) for r in records}),
            'Selected native source row repeats')
    indexes = target_indexes(targets)
    points = sorted({coordinate_key(point) for record in records
                     if not source_block_reason(record['nativeRecord']) and
                     not projected_quality_reason(record['nativeRecord']) and
                     (point := wkb_point(record['nativeRecord']['geometryWkb'])) is not None})
    audits, required_rows = [], collections.defaultdict(set)
    for record in records:
        require(record['sourceFile'] in receipt_index, 'Selected native row is not in complete US source')
        required_rows[record['sourceFile']].add(record['sourceRowNumber'])
    for receipt in receipts:
        if not receipt['usRows']:
            continue
        key = receipt['source']['key']
        audit = json.loads((directory/'reuse'/(pathlib.PurePosixPath(key).name+'.json')).read_bytes())
        require(audit['release'] == RELEASE and audit['pointsSha256'] == sha(encoded(points)) and
                audit['cacheSha256'] == receipt['cacheSha256'] and audit['sourceFile'] == key and
                audit['sourceEtag'] == receipt['source']['etag'] and audit['usRowsScanned'] == receipt['usRows'],
                'Complete national coordinate-reuse receipt changed')
        seen_points = set()
        for group in audit['coordinateGroups']:
            point_key = tuple(group['point'])
            require(point_key in points and point_key not in seen_points, 'Reuse coordinate scope changed')
            seen_points.add(point_key)
            require(isinstance(group['rows'], int) and group['rows'] > 0, 'Invalid reuse native count')
            for fingerprint, row in group['addresses'].items():
                require(coordinate_key(wkb_point(row['geometryWkb'])) == point_key and
                        fingerprint in place_fingerprints(row), 'Native coordinate-reuse witness changed')
                required_rows[key].add(row['file_row_number'])
        audits.append(audit)
    require(sum(a['usRowsScanned'] for a in audits) == US_COUNT, 'Incomplete national reuse audit')
    cached = {key: _native_cache_rows(work/receipt_index[key]['cacheFile'], numbers)
              for key, numbers in required_rows.items()}
    for record in records:
        receipt = receipt_index[record['sourceFile']]
        row = cached[record['sourceFile']][record['sourceRowNumber']]
        expected = native_record(receipt['source'], receipt['sourceFileSha256'], record['sourceRowNumber'], row)
        expected['targets'] = target_refs(row, indexes)
        require(record == expected and bool(record['targets']), 'Selected full native row/provenance/address changed')
    for audit in audits:
        for group in audit['coordinateGroups']:
            for row in group['addresses'].values():
                number, native = normal_native(row)
                require(native == cached[audit['sourceFile']][number], 'Retained reuse witness differs from native cache row')
    target_data = {'locationIndexSha256': baseline_sha, 'targetsSha256': sha(encoded(targets)),
                   'inputTargetsFileSha256': TARGETS_SHA256, 'targets': targets}
    strict = resolve(target_data, records, audits, SOURCE_INVENTORY_SHA)
    require(strict == json.loads((directory/'strict-source-selection-report.json').read_bytes()),
            'Strict native Places selector no longer reproduces')
    report_raw = (directory/'report.json').read_bytes()
    report = json.loads(report_raw)
    require(report['candidates'] == [] and report['inputTargets'] == targets and
            report['sourceInventorySha256'] == SOURCE_INVENTORY_SHA and report['release'] == RELEASE and
            report['baselineIndexSha256'] == baseline_sha and report['targetsSha256'] == target_data['targetsSha256'] and
            report['targetFileSha256'] == TARGETS_SHA256 and report['cacheReceiptSha256'] == sha(encoded(retained_receipts)) and
            report['nativeRecordsSha256'] == file_sha(directory/'selected-native-records.json') and
            report['reuseAuditSha256'] == sha(encoded(audits)), 'Nonselectable report source/scope binding changed')
    require(file_sha(pathlib.Path(__file__).with_name('audit_usfa_hq2_places_witnesses.py')) == report['codeSha256'] and
            file_sha(pathlib.Path(__file__).with_name('match_overture_primary_places.py')) == report['strictMatcherCodeSha256'],
            'Frozen local audit or strict selector code changed')
    endpoints = collections.defaultdict(list)
    for record in records:
        for candidate in resolve(target_data, [record], audits, SOURCE_INVENTORY_SHA)['candidates']:
            endpoints[candidate['key']].append({'selectable': False, 'role': 'nonselectable-consensus-witness',
                'source': 'overture-place-address', 'match': candidate['match'], 'countyFips': candidate['countyFips'],
                'targetAddress': candidate['address'], 'sourceFile': record['sourceFile'],
                'sourceRowNumber': record['sourceRowNumber'], 'sourceFileSha256': record['sourceFileSha256'],
                'nativeRecordSha256': record['sourceSha256']})
    target_index = {t['key']: t for t in targets}
    rejected = [{**copy.deepcopy(row), 'originalPrimaryKey': target_index[row['key']]['originalPrimaryKey'],
                 'targetAddress': copy.deepcopy(target_index[row['key']]['address']),
                 'source': 'overture-place-address', 'selectable': False} for row in strict['rejected']]
    require(report['rejected'] == rejected, 'Qualified native rejection scope changed')
    serious = {'source-point-county-conflict', 'coordinate-shared-by-distinct-addresses',
               'invalid-native-point', 'conflicting-native-points'}
    positive_keys = {r['key'] for r in rejected if r['reason'] in serious or set(r['blockedReasons']) & serious}
    observations = []
    for target in targets:
        points_at_site = [[e['match']['latitude'], e['match']['longitude']] for e in endpoints[target['key']]]
        observations.append({'key': target['key'], 'originalPrimaryKey': target['originalPrimaryKey'],
            'targetAddress': copy.deepcopy(target['address']), 'inputTarget': copy.deepcopy(target), 'selectable': False,
            'qualifiedNativeEndpoints': endpoints[target['key']], 'positiveSourceConflict': target['key'] in positive_keys,
            'eligibleEndpointAllPairsAgree': points_agree(points_at_site),
            'qualifiedNativeEndpointCounties': sorted({e['countyFips'] for e in endpoints[target['key']]})})
    require(report['observations'] == observations, 'Every native endpoint must reproduce exactly')
    require(report['summary']['selectablePlaceCandidates'] == report['summary']['newMappedCount'] == 0,
            'Witness audit cannot enable a primary selection')
    receipt = {'schemaVersion': 1, 'nativeReplay': 'passed', 'targetFileSha256': TARGETS_SHA256,
        'reportSha256': sha(report_raw), 'replayManifestSha256': REPLAY_MANIFEST_SHA256,
        'sourceInventorySha256': SOURCE_INVENTORY_SHA, 'completeUSRowsAudited': US_COUNT,
        'completeUSCacheHashesVerified': True, 'nativeRowsReRead': sum(map(len, cached.values())),
        'strictSourceSelectorReplayed': True, 'allEndpointsNonselectable': True,
        'newSourceAcquisition': False, 'newMappedCount': 0}
    return report, receipt


def verify(directory=DEFAULT_DIRECTORY, work=DEFAULT_WORK):
    """Return the exactly replayed report/receipt; cached for one fixed process."""
    require(file_sha(pathlib.Path(directory)/'replay-manifest.json') == REPLAY_MANIFEST_SHA256,
            'Frozen local replay manifest changed')
    report, receipt = _verify(str(pathlib.Path(directory).resolve()), str(pathlib.Path(work).resolve()))
    return copy.deepcopy(report), copy.deepcopy(receipt)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--directory', type=pathlib.Path, default=DEFAULT_DIRECTORY)
    parser.add_argument('--work', type=pathlib.Path, default=DEFAULT_WORK)
    args = parser.parse_args()
    _, receipt = verify(args.directory, args.work)
    print(json.dumps(receipt, sort_keys=True), flush=True)


if __name__ == '__main__':
    main()
