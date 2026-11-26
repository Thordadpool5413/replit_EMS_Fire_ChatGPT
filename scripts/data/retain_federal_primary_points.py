#!/usr/bin/env python3
"""Retain and replay complete USGS/HIFLD primary-address source evidence offline."""
import argparse
import functools
import json
import pathlib
import tempfile
import zipfile

from backfill_provider_locations import ROOT, PUBLIC, sha, digest_file
from stage_usgs_primary import SOURCES, dump, load_locations, match_inventory, validate_inventory

EVIDENCE_NAMES = {'usgs': 'primary-usgs-all', 'hifld-ems': 'primary-hifld', 'hifld-fire': 'primary-hifld-fire'}
EDITION = '2026-11-26'


def evidence_directory(source):
    return ROOT / 'scripts/data/evidence' / EVIDENCE_NAMES[source] / EDITION


def retained_files(source_directory, inventory):
    return ['inventory.json'] + [r['file'] for r in inventory['files']] + [r['file'] for r in inventory['pages']]


def retain(source, source_directory, report_path, output, locations):
    inventory = validate_inventory(source_directory, json.loads((source_directory / 'inventory.json').read_bytes()))
    if inventory['source'] != source:
        raise ValueError('Wrong retained source')
    entries, baseline_hash = load_locations(locations)
    report_raw = report_path.read_bytes()
    report = json.loads(report_raw)
    replay = match_inventory(source_directory, inventory, entries, baseline_hash)
    if replay != report:
        raise ValueError('Candidate report differs from complete source replay')
    output.mkdir(parents=True, exist_ok=True)
    archive = output / 'original.zip'
    temp = output / 'original.zip.partial'
    with zipfile.ZipFile(temp, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for name in retained_files(source_directory, inventory):
            z.write(source_directory / name, 'source/' + name)
        z.writestr('inputs/primary-entries.json', dump(entries))
        z.writestr('inputs/baseline-index-sha256.txt', baseline_hash + '\n')
        z.writestr('primary-candidates.json', report_raw)
    temp.replace(archive)
    candidate_raw = dump(report['candidates'])
    (output / 'candidates.json').write_bytes(candidate_raw)
    manifest = {'schemaVersion': 1, 'source': source, 'method': SOURCES[source]['method'],
                'sourceUrl': SOURCES[source]['url'], 'collectionDate': inventory['collectionDate'],
                'sourceCount': inventory['sourceCount'], 'sourceInventorySha256': inventory['sourceSha256'],
                'sourcePageCount': len(inventory['pages']), 'sourceComplete': True,
                'archive': 'original.zip', 'archiveSha256': digest_file(archive), 'archiveBytes': archive.stat().st_size,
                'reportSha256': sha(report_raw), 'candidatesSha256': sha(candidate_raw),
                'candidateCount': len(report['candidates']), 'baselineIndexSha256': baseline_hash,
                'boundarySha256': report['boundarySha256'], 'sourceStats': report['sourceStats'],
                'outcomes': report['outcomes'],
                'interpretation': 'Exact primary street/state/postal address location; historical facility evidence is not proof of current headquarters.'}
    (output / 'manifest.json').write_bytes(dump(manifest))
    return manifest


def verify(evidence):
    manifest = json.loads((evidence / 'manifest.json').read_bytes())
    source = manifest.get('source')
    if source not in SOURCES or manifest.get('method') != SOURCES[source]['method']:
        raise ValueError('Unknown retained federal source')
    archive = evidence / 'original.zip'
    if archive.stat().st_size != manifest['archiveBytes'] or digest_file(archive) != manifest['archiveSha256']:
        raise ValueError('Retained source archive digest mismatch')
    with tempfile.TemporaryDirectory(prefix='atlas-federal-replay-') as temporary:
        directory = pathlib.Path(temporary)
        with zipfile.ZipFile(archive) as z:
            names = z.namelist()
            if len(names) != len(set(names)) or any(pathlib.PurePosixPath(n).is_absolute() or '..' in pathlib.PurePosixPath(n).parts for n in names):
                raise ValueError('Unsafe or duplicate retained source member')
            inventory = json.loads(z.read('source/inventory.json'))
            required = {'source/' + n for n in retained_files(directory, inventory)} | {
                'inputs/primary-entries.json', 'inputs/baseline-index-sha256.txt', 'primary-candidates.json'}
            if set(names) != required:
                raise ValueError('Retained archive membership differs')
            z.extractall(directory)
        source_directory = directory / 'source'
        validate_inventory(source_directory, inventory)
        if (inventory['source'] != source or inventory['sourceSha256'] != manifest['sourceInventorySha256'] or
                inventory['sourceCount'] != manifest['sourceCount'] or len(inventory['pages']) != manifest['sourcePageCount']):
            raise ValueError('Retained source inventory binding changed')
        entries = json.loads((directory / 'inputs/primary-entries.json').read_bytes())
        baseline_hash = (directory / 'inputs/baseline-index-sha256.txt').read_text().strip()
        if len(entries) != 46791 or len({e['key'] for e in entries}) != 46791 or baseline_hash != manifest['baselineIndexSha256']:
            raise ValueError('Retained primary source denominator or edition changed')
        report_raw = (directory / 'primary-candidates.json').read_bytes()
        if sha(report_raw) != manifest['reportSha256']:
            raise ValueError('Retained report digest mismatch')
        report = json.loads(report_raw)
        replay = match_inventory(source_directory, inventory, entries, baseline_hash)
        if replay != report:
            raise ValueError('Complete source replay differs from retained report')
        candidate_raw = (evidence / 'candidates.json').read_bytes()
        if sha(candidate_raw) != manifest['candidatesSha256'] or candidate_raw != dump(report['candidates']):
            raise ValueError('Runtime evidence differs from complete source replay')
        if len(report['candidates']) != manifest['candidateCount']:
            raise ValueError('Candidate count changed')
    return manifest


@functools.lru_cache(maxsize=3)
def candidate_index(source):
    path = evidence_directory(source)
    manifest = json.loads((path / 'manifest.json').read_bytes())
    if (manifest.get('source') != source or manifest.get('method') != SOURCES[source]['method'] or
            manifest.get('sourceUrl') != SOURCES[source]['url'] or
            manifest.get('sourceCount') != SOURCES[source]['expectedCount'] or not manifest.get('sourceComplete')):
        raise ValueError('Unexpected source evidence edition')
    raw = (path / 'candidates.json').read_bytes()
    if sha(raw) != manifest['candidatesSha256']:
        raise ValueError('Source candidate evidence digest mismatch')
    rows = json.loads(raw)
    index = {r['key']: r for r in rows}
    if len(rows) != manifest['candidateCount'] or len(index) != len(rows):
        raise ValueError('Duplicate or missing primary evidence identity')
    for row in rows:
        if row['match']['point']['sourceInventorySha256'] != manifest['sourceInventorySha256']:
            raise ValueError('Source inventory pin differs')
    return index


def validate_federal_primary_entry(entry):
    """Runtime publication guard. Exact candidate binding follows offline replay."""
    match = entry.get('match')
    if not isinstance(match, dict):
        return False
    source = next((key for key, spec in SOURCES.items() if spec['method'] == match.get('method')), None)
    if not source:
        return False
    candidate = candidate_index(source).get(entry.get('key'))
    return bool(candidate and all(entry.get(k) == candidate.get(k) for k in ('key', 'source', 'state', 'address', 'countyFips', 'match')))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', choices=sorted(SOURCES), required=True)
    parser.add_argument('--directory', type=pathlib.Path)
    parser.add_argument('--report', type=pathlib.Path)
    parser.add_argument('--output', type=pathlib.Path)
    parser.add_argument('--locations', type=pathlib.Path, default=PUBLIC / 'locations')
    parser.add_argument('--verify', action='store_true')
    args = parser.parse_args()
    output = args.output or evidence_directory(args.source)
    if args.verify:
        manifest = verify(output)
    else:
        if not args.directory or not args.report:
            parser.error('--directory and --report are required when retaining')
        manifest = retain(args.source, args.directory, args.report, output, args.locations)
        manifest = verify(output)
    print(json.dumps({k: manifest[k] for k in ('source', 'sourceCount', 'candidateCount', 'archiveSha256', 'sourceInventorySha256')}), flush=True)


if __name__ == '__main__':
    main()
