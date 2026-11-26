#!/usr/bin/env python3
"""Acquire the entire public NERIS physical/mailing inventory; match locally."""
import argparse
import json
import pathlib
import time
import urllib.parse
import urllib.request
import zipfile

from backfill_provider_locations import ROOT, sha
from recover_neris_primary import dump, load_departments, SOURCE_SHA, INDEX_SHA
from stage_neris_national_stations import ITEM, source_value, coordinate
from retain_neris_national_stations import EVIDENCE as ORIGINAL_EVIDENCE, DIGEST

URL = 'https://services5.arcgis.com/lPbcyJOcoLyZmvo6/arcgis/rest/services/NERIS%20Public%20Fire%20Departments/FeatureServer/0'
PHYSICAL_FIELDS = ('address_line_1', 'address_line_2', 'city', 'state', 'zip_code')
MAILING_FIELDS = ('mail_address_line_1', 'mail_address_line_2', 'mail_city', 'mail_state', 'mail_zip_code')
FIELDS = ('OBJECTID', 'neris_id', 'name', *PHYSICAL_FIELDS, 'station_count', 'export_date',
          *MAILING_FIELDS, 'website', 'internal_id')


def request(params, query=True):
    url = URL+('/query' if query else '')+'?'+urllib.parse.urlencode(params)
    for attempt in range(5):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'ATLAS-public-source-retention/1.0'}), timeout=120) as response:
                value = json.load(response)
            if 'error' in value:
                raise ValueError('Public source error: '+str(value['error']))
            return value
        except Exception:
            if attempt == 4:
                raise
            time.sleep(min(30, 2**attempt))


def validate_bound_departments(features, metadata):
    definitions = {field['name']: field['type'] for field in metadata.get('fields', [])}
    if (metadata.get('serviceItemId') != ITEM or metadata.get('id') != 0 or
            metadata.get('objectIdField') != 'OBJECTID' or metadata.get('geometryType') != 'esriGeometryPoint' or
            any(field not in definitions for field in FIELDS)):
        raise ValueError('Unexpected complete public NERIS mailing schema')
    original_raw = (ORIGINAL_EVIDENCE/'original.zip').read_bytes()
    if sha(original_raw) != DIGEST:
        raise ValueError('Original complete NERIS acquisition archive changed')
    with zipfile.ZipFile(ORIGINAL_EVIDENCE/'original.zip') as archive:
        original_report = archive.read('neris-national-stations.json')
    if sha(original_report) != SOURCE_SHA:
        raise ValueError('Original complete NERIS native report changed')
    original = json.loads(original_report)
    original_ids = {row['sourceObjectId'] for row in original['sourceObjectAudit'] if row['layer'] == 0}
    if len(features) != 30700 or {f['attributes']['OBJECTID'] for f in features} != original_ids:
        raise ValueError('The complete original 30700 native department OID inventory changed')
    by_id = {}
    for feature in features:
        attrs = feature['attributes']
        if set(attrs) != set(FIELDS):
            raise ValueError('Supplemental native field membership changed')
        native_id = attrs['neris_id']
        if native_id in by_id:
            raise ValueError('Duplicate native department identity in complete source')
        by_id[native_id] = feature
    bound = {}
    for department in load_departments():
        feature = by_id.get(department['id'])
        if feature is None:
            raise ValueError('Original native department is missing')
        attrs = feature['attributes']
        clean = {field: source_value(attrs[field], definitions[field], field)[0] for field in FIELDS}
        try:
            geometry = coordinate(feature.get('geometry'))
        except ValueError:
            geometry = None
        coords = [geometry['y'], geometry['x']] if geometry else None
        if (clean['OBJECTID'] != department['oid'] or str(clean['name'] or '').strip() != department['name'] or
                [clean[field] for field in PHYSICAL_FIELDS] != department['address'] or
                clean['station_count'] != department['reportedStationCount'] or clean['export_date'] != department['exportDate'] or
                coords != department['coordinates']):
            raise ValueError('Native department identity, physical fields or geometry changed: '+department['id'])
        bound[department['id']] = feature
    if len(bound) != 30672:
        raise ValueError('Incomplete original native department binding')
    return bound


def acquire(directory):
    directory.mkdir(parents=True, exist_ok=True)
    before = request({'f': 'json'}, False)
    first = sorted(request({'f': 'json', 'where': '1=1', 'returnIdsOnly': 'true'})['objectIds'])
    if len(first) != 30700 or len(set(first)) != 30700:
        raise ValueError('Unexpected full native department count')
    (directory/'metadata-before.json').write_bytes(dump(before))
    (directory/'object-ids-before.json').write_bytes(dump(first))
    features = []
    for offset in range(0, len(first), 1000):
        page = request({'f': 'json', 'where': '1=1', 'outFields': ','.join(FIELDS),
                        'returnGeometry': 'true', 'outSR': '4326', 'orderByFields': 'OBJECTID',
                        'resultOffset': offset, 'resultRecordCount': 1000})
        raw_features = page.get('features')
        sr = page.get('spatialReference') or {}
        if not isinstance(raw_features, list) or len(raw_features) != min(1000, len(first)-offset) or 4326 not in (sr.get('wkid'), sr.get('latestWkid')):
            raise ValueError('Incomplete whole-source page or unsupported spatial reference')
        features.extend(raw_features)
        print(json.dumps({'sourceRowsAcquired': len(features), 'sourceCount': len(first)}), flush=True)
    features.sort(key=lambda row: row['attributes']['OBJECTID'])
    after = request({'f': 'json'}, False)
    last = sorted(request({'f': 'json', 'where': '1=1', 'returnIdsOnly': 'true'})['objectIds'])
    (directory/'metadata-after.json').write_bytes(dump(after))
    (directory/'object-ids-after.json').write_bytes(dump(last))
    if before.get('editingInfo') != after.get('editingInfo') or before['fields'] != after['fields'] or first != last:
        raise ValueError('Public source changed during complete acquisition')
    if [f['attributes']['OBJECTID'] for f in features] != first:
        raise ValueError('Native page/OID membership mismatch')
    bound = validate_bound_departments(features, before)
    source = {'schemaVersion': 1, 'sourceUrl': URL, 'sourceItemId': ITEM, 'sourceCount': len(features),
              'originalNerisSourceSha256': SOURCE_SHA, 'originalNerisIndexSha256': INDEX_SHA,
              'boundOriginalDepartmentCount': len(bound), 'sourceMetadata': before,
              'sourceObjectIds': first, 'features': features}
    raw = dump(source)
    (directory/'neris-mailing-supplement.json').write_bytes(raw)
    print(json.dumps({'sourceSha256': sha(raw), 'sourceCount': len(features), 'boundOriginalDepartmentCount': len(bound)}), flush=True)
    return source


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--directory', type=pathlib.Path, required=True)
    args = parser.parse_args()
    acquire(args.directory)


if __name__ == '__main__':
    main()
