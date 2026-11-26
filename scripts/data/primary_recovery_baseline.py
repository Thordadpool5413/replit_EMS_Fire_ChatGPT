#!/usr/bin/env python3
"""Read and retain the immutable 46,791-identity primary recovery baseline."""
import argparse
import json
import pathlib
import zipfile
from backfill_provider_locations import ROOT, PUBLIC, STATES, sha

INDEX_SHA = 'e1f59b47e7d6931714b2defcfd02acefc4013d3dd793ed2081a27df6a3bd0a48'
BASELINE = ROOT/'scripts/data/evidence/primary-recovery-baseline/2026-11-26.zip'


def baseline_files():
    names = {'index.json', *(state+'.json' for state in STATES)}
    if BASELINE.exists():
        with zipfile.ZipFile(BASELINE) as archive:
            if len(archive.namelist()) != len(names) or set(archive.namelist()) != names:
                raise ValueError('Original baseline archive membership changed')
            files = {name: archive.read(name) for name in names}
    else:
        files = {name: (PUBLIC/'locations'/name).read_bytes() for name in names}
    if sha(files['index.json']) != INDEX_SHA:
        raise ValueError('Recovery must use the fixed original primary snapshot')
    index = json.loads(files['index.json'])
    chunks = index['chunks']
    if len(chunks) != len(STATES) or {chunk['file'] for chunk in chunks} != names-{'index.json'}:
        raise ValueError('Original baseline state membership changed')
    rows = []
    for chunk in chunks:
        raw = files[chunk['file']]
        if sha(raw) != chunk['sha256']:
            raise ValueError('Original primary shard digest changed')
        state_rows = json.loads(raw)
        if not isinstance(state_rows, list) or any(row['state']+'.json' != chunk['file'] for row in state_rows):
            raise ValueError('Original primary state binding changed')
        rows.extend(state_rows)
    if len(rows) != 46791 or len({row['key'] for row in rows}) != 46791:
        raise ValueError('Fixed original primary denominator changed')
    return files, index, rows


def load_primary_baseline():
    _, index, rows = baseline_files()
    return index, rows, INDEX_SHA


def retain_baseline():
    files, index, rows = baseline_files()
    if not BASELINE.exists():
        BASELINE.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(BASELINE, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for name, raw in sorted(files.items()):
                info = zipfile.ZipInfo(name, date_time=(2026, 11, 26, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                archive.writestr(info, raw)
    return index, rows


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--retain', action='store_true')
    args = parser.parse_args()
    if args.retain:
        index, rows = retain_baseline()
    else:
        index, rows, _ = load_primary_baseline()
    print(json.dumps({'baselineIndexSha256': INDEX_SHA, 'primaryIdentityCount': len(rows),
                      'shardCount': len(index['chunks']), 'retained': BASELINE.exists()}))


if __name__ == '__main__':
    main()
