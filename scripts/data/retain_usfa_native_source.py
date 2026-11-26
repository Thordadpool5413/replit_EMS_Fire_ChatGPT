#!/usr/bin/env python3
"""Retain the complete fixed public USFA national CSV without provider queries."""
import argparse
import collections
import csv
import functools
import io
import json
import pathlib
import re
import urllib.request
import zipfile
from backfill_provider_locations import ROOT, sha, digest_file, native_key
from recover_neris_primary import dump, source_zip
from primary_recovery_baseline import load_primary_baseline

SOURCE_URL = 'https://apps.usfa.fema.gov/registry/api/download/national'
SOURCE_SHA = 'c5b98d7fde08b48f6433694568f8e6fdbdfdbb13e2cd533c58d2ac148f03c1ea'
EVIDENCE = ROOT/'scripts/data/evidence/usfa-native-national/2026-11-26'
EXPECTED_LOGICAL_ROWS = 27117
REQUIRED_FIELDS = {'FDID', 'Fire dept name', 'HQ city', 'HQ state', 'HQ zip', 'Website'}


def phone_candidates(fragment):
    values = set()
    for match in re.finditer(r'(?<!\d)(?:\+?1[-. ()]*)?(?:\d[-. ()]*){10}(?!\d)', fragment):
        digits = re.sub(r'\D', '', match.group())
        if len(digits) == 11 and digits.startswith('1'): digits = digits[1:]
        if len(digits) == 10: values.add(digits)
    return sorted(values)


def parse_raw(raw):
    if sha(raw) != SOURCE_SHA:
        raise ValueError('Fixed public USFA national source bytes changed')
    text = raw.decode('utf-8-sig')
    lines = text.splitlines(keepends=True)
    reader = csv.reader(io.StringIO(text, newline=''), strict=True)
    header_raw = next(reader); headers = [value.strip() for value in header_raw]
    if len(headers) != len(set(headers)) or not REQUIRED_FIELDS <= set(headers):
        raise ValueError('USFA native source schema changed')
    rows, quarantined = [], []
    logical_row = 1
    while True:
        start = reader.line_num+1
        try:
            fields = next(reader)
        except StopIteration:
            break
        except csv.Error as error:
            logical_row += 1
            end = reader.line_num
            if end < start: raise ValueError('CSV parser failed to advance safely')
            fragment = ''.join(lines[start-1:end])
            quarantined.append({'sourceRowNumber': logical_row, 'lineStart': start, 'lineEnd': end,
                                'reason': 'strict-csv-error', 'parserError': str(error),
                                'fragmentSha256': sha(fragment.encode()), 'rawFragment': fragment,
                                'digitsForConservativePhoneVeto': phone_candidates(fragment)})
            continue
        logical_row += 1; end = reader.line_num
        fragment = ''.join(lines[start-1:end])
        if len(fields) != len(headers):
            quarantined.append({'sourceRowNumber': logical_row, 'lineStart': start, 'lineEnd': end,
                                'reason': 'native-column-count-mismatch', 'fieldCount': len(fields),
                                'fragmentSha256': sha(fragment.encode()), 'rawFragment': fragment,
                                'digitsForConservativePhoneVeto': phone_candidates(fragment)})
            continue
        native = dict(zip(headers, fields))
        rows.append({'sourceRowNumber': logical_row, 'sourceLineStart': start, 'sourceLineEnd': end,
                     'native': native, 'nativeRecordSha256': sha(dump(native)),
                     'sourceFragmentSha256': sha(fragment.encode())})
    if len(rows)+len(quarantined) != EXPECTED_LOGICAL_ROWS:
        raise ValueError('Full USFA logical row inventory failed: '+str(len(rows))+' parsed + '+str(len(quarantined))+' quarantined')
    return headers, rows, quarantined


def usfa_rows(path):
    """Compatibility API: exact source rows and unmodified malformed spans."""
    _, rows, quarantined = parse_raw(path.read_bytes())
    return rows, quarantined


def native_identity(native):
    state = native['HQ state'].strip().upper(); fdid = native['FDID'].strip()
    return 'FDID:'+state+':'+fdid if re.fullmatch(r'[A-Z]{2}', state) and fdid else None


def reconcile(raw):
    headers, rows, quarantined = parse_raw(raw)
    _, national, baseline_sha = load_primary_baseline()
    primary = [row for row in national if row[1] == 'USFA']
    groups = collections.defaultdict(list)
    for row in rows:
        key = native_identity(row['native'])
        if key: groups[key].append(row)
    reconciled = []; outcomes = collections.Counter()
    for original in primary:
        key = native_key(original); native_rows = groups.get(key, [])
        reason = None
        if not key: reason = 'original-has-no-native-fdid'
        elif not native_rows: reason = 'no-native-fdid-state-row'
        elif len(native_rows) != 1: reason = 'duplicate-native-fdid-state'
        else:
            native = native_rows[0]['native']
            if native['Fire dept name'].strip() != original[2]: reason = 'native-complete-name-differs'
            elif native['HQ city'].strip() != original[4]: reason = 'native-headquarters-city-differs'
            elif native['HQ state'].strip().upper() != original[3]: reason = 'native-state-differs'
            elif source_zip(native['HQ zip']) != source_zip(original[5]) or not source_zip(original[5]): reason = 'native-headquarters-postal-differs'
        status = reason or 'exact-fdid-state-name-city-zip'
        outcomes[status] += 1
        reconciled.append({'primaryKey': key, 'outcome': status,
                           'nativeSourceRowNumbers': [row['sourceRowNumber'] for row in native_rows]})
    report = {'schemaVersion': 1, 'sourceUrl': SOURCE_URL, 'sourceSha256': SOURCE_SHA,
              'sourceBytes': len(raw), 'completeLogicalSourceRows': EXPECTED_LOGICAL_ROWS,
              'parsedRows': len(rows), 'quarantinedRows': len(quarantined), 'headers': headers,
              'baselineIndexSha256': baseline_sha, 'originalPrimaryIdentityCount': 46791,
              'completeUsfaRegistryRows': len(primary), 'rows': rows, 'quarantined': quarantined,
              'duplicateNativeIdentityGroups': {key: [row['sourceRowNumber'] for row in group] for key, group in sorted(groups.items()) if len(group)>1},
              'baselineReconciliation': reconciled, 'reconciliationOutcomes': dict(sorted(outcomes.items())),
              'limitations': 'Complete fixed public national source only. Malformed records remain quarantined with raw fragments and conservative identifier witnesses. No phone, website or primary-site association is published by this source package.'}
    return report


def stage(directory, destination=EVIDENCE):
    raw = (directory/'usfa-national.csv').read_bytes()
    report = reconcile(raw)
    if destination.exists(): raise ValueError('Retained native USFA source edition already exists')
    destination.mkdir(parents=True)
    report_raw = dump(report)
    members = {'source/usfa-national.csv': raw, 'source/native-usfa.json': report_raw}
    with zipfile.ZipFile(destination/'original.zip', 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, content in sorted(members.items()):
            info = zipfile.ZipInfo(name, date_time=(2026, 11, 26, 0, 0, 0)); info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, content)
    manifest = {'schemaVersion': 1, 'sourceUrl': SOURCE_URL, 'sourceSha256': SOURCE_SHA,
                'archiveSha256': digest_file(destination/'original.zip'), 'archiveBytes': (destination/'original.zip').stat().st_size,
                'nativeReportSha256': sha(report_raw), 'baselineIndexSha256': report['baselineIndexSha256'],
                'members': {name: {'sha256': sha(content), 'bytes': len(content)} for name, content in members.items()}}
    summary = {key: report[key] for key in ('sourceUrl', 'sourceSha256', 'sourceBytes', 'completeLogicalSourceRows', 'parsedRows', 'quarantinedRows',
                                          'headers', 'baselineIndexSha256', 'originalPrimaryIdentityCount', 'completeUsfaRegistryRows', 'reconciliationOutcomes', 'limitations')}
    summary['duplicateNativeIdentityGroupCount'] = len(report['duplicateNativeIdentityGroups'])
    summary['malformedSpans'] = [{key: row[key] for key in ('sourceRowNumber', 'lineStart', 'lineEnd', 'reason', 'fragmentSha256')} for row in report['quarantined']]
    (destination/'manifest.json').write_bytes(dump(manifest)); (destination/'summary.json').write_bytes(dump(summary))
    return manifest, summary


def read(destination=EVIDENCE):
    manifest = json.loads((destination/'manifest.json').read_bytes())
    if (manifest.get('sourceUrl') != SOURCE_URL or manifest.get('sourceSha256') != SOURCE_SHA or
            digest_file(destination/'original.zip') != manifest['archiveSha256'] or
            (destination/'original.zip').stat().st_size != manifest['archiveBytes']):
        raise ValueError('Native USFA source edition changed')
    names = {'source/usfa-national.csv', 'source/native-usfa.json'}
    with zipfile.ZipFile(destination/'original.zip') as archive:
        if set(archive.namelist()) != names or len(archive.namelist()) != len(names) or set(manifest['members']) != names:
            raise ValueError('Native USFA source member inventory changed')
        data = {}
        for name in names:
            if archive.getinfo(name).file_size != manifest['members'][name]['bytes'] or archive.getinfo(name).file_size > 50_000_000:
                raise ValueError('Unexpected native USFA source member size')
            data[name] = archive.read(name)
            if sha(data[name]) != manifest['members'][name]['sha256']: raise ValueError('Native USFA source member changed')
    report = reconcile(data['source/usfa-national.csv'])
    if (dump(report) != data['source/native-usfa.json'] or sha(dump(report)) != manifest['nativeReportSha256'] or
            report['baselineIndexSha256'] != manifest['baselineIndexSha256']):
        raise ValueError('Native USFA full parsing/quarantine/baseline reconciliation does not replay')
    return report, manifest


@functools.lru_cache(maxsize=1)
def source_catalog(): return read()


def main():
    parser = argparse.ArgumentParser(); parser.add_argument('--directory', type=pathlib.Path)
    parser.add_argument('--evidence', type=pathlib.Path, default=EVIDENCE)
    parser.add_argument('--download', action='store_true'); parser.add_argument('--verify', action='store_true'); args = parser.parse_args()
    if args.verify:
        report, manifest = read(args.evidence)
        print(json.dumps({'sourceSha256': SOURCE_SHA, 'parsedRows': report['parsedRows'], 'quarantinedRows': report['quarantinedRows'],
                          'archiveSha256': manifest['archiveSha256'], 'completeNativeSourceReplay': 'passed'}), flush=True)
        return
    if not args.directory: parser.error('--directory is required for source acquisition')
    args.directory.mkdir(parents=True, exist_ok=True)
    if args.download:
        request = urllib.request.Request(SOURCE_URL, headers={'User-Agent': 'ATLAS public source provenance replay'})
        with urllib.request.urlopen(request, timeout=180) as response:
            raw = response.read(25_000_001)
        if len(raw)>25_000_000: raise ValueError('Unexpected national CSV size')
        (args.directory/'usfa-national.csv').write_bytes(raw)
        print(json.dumps({'downloadBytes': len(raw), 'actualSourceSha256': sha(raw)}), flush=True)
    manifest, summary = stage(args.directory, args.evidence)
    print(json.dumps({'manifest': manifest, 'summary': summary}), flush=True)

if __name__ == '__main__':
    main()
