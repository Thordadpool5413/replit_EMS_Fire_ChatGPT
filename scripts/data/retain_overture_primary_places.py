#!/usr/bin/env python3
"""Retain and replay complete-source Overture Places address evidence."""
import argparse
import copy
import functools
import io
import json
import pathlib
import re
import zipfile

from backfill_provider_locations import ROOT
from match_overture_primary_addresses import coordinate_key, load_targets, source_block_reason, wkb_point
from match_overture_primary_places import native_projection, place_fingerprints, projected_quality_reason, resolve
from stage_overture_primary_addresses import DATE, RELEASE, encoded, sha
from stage_overture_primary_places import GLOBAL_COUNT, GLOBAL_FILES, PREFIX, US_COUNT, place_address

EVIDENCE=ROOT/'scripts/data/evidence/primary-overture-places'/DATE
# A recovered release stays disabled until the runner completes native replay,
# then freezes explicit source/archive/report pins in its review commit.
SOURCE_INVENTORY_SHA256=''
ARCHIVE_SHA256=''
REPORT_SHA256=''
COMPLETE_US_ROWS=US_COUNT
REQUIRED={'inventory.xml','inventory.json','metadata-inventory.json','complete-us-receipt.json',
          'targets.json','selected-native-records.json','primary-place-address-candidates.json'}


def validate_files(files,enforce_pins=False,require_baseline=True):
    if not REQUIRED<=set(files) or any(k not in REQUIRED and not k.startswith('reuse/') for k in files):
        raise ValueError('Unexpected retained Places membership')
    inventory=json.loads(files['inventory.json']);meta=json.loads(files['metadata-inventory.json'])
    complete=json.loads(files['complete-us-receipt.json']);targets=json.loads(files['targets.json'])
    native=json.loads(files['selected-native-records.json']);report=json.loads(files['primary-place-address-candidates.json'])
    inventory_sha=sha(files['metadata-inventory.json'])
    if enforce_pins and (not SOURCE_INVENTORY_SHA256 or inventory_sha!=SOURCE_INVENTORY_SHA256):
        raise ValueError('Frozen Places inventory changed')
    if inventory['release']!=RELEASE or inventory['listingSha256']!=sha(files['inventory.xml']):
        raise ValueError('Fixed public Places listing changed')
    if meta['release']!=RELEASE or meta['inventorySha256']!=sha(files['inventory.json']):
        raise ValueError('Places metadata identity changed')
    original={f['key']:f for f in inventory['files']};metadata={f['key']:f for f in meta['files']}
    if len(original)!=GLOBAL_FILES or set(original)!=set(metadata) or sum(m['rows'] for m in metadata.values())!=GLOBAL_COUNT:
        raise ValueError('Incomplete global Places edition')
    for key,m in metadata.items():
        if not key.startswith(PREFIX) or not key.endswith('.parquet') or any(m[k]!=v for k,v in original[key].items()):
            raise ValueError('Unexpected fixed Places source object')
        if sum(g['rows'] for g in m['rowGroups'])!=m['rows']: raise ValueError('Incomplete Places row groups')
        possible=any(g['countryMin'] is not None and g['countryMin']<='US'<=g['countryMax'] for g in m['rowGroups'])
        if possible!=m['mayContainUS']: raise ValueError('Places country inventory contradiction')
    receipts={r['source']['key']:r for r in complete['files']}
    if len(receipts)!=len(complete['files']) or set(receipts)!={k for k,m in metadata.items() if m['mayContainUS']}:
        raise ValueError('Incomplete possible-US Places inventory')
    if complete['sourceInventorySha256']!=inventory_sha or complete['release']!=RELEASE or complete['usRows']!=US_COUNT or complete['globalFiles']!=GLOBAL_FILES or complete['globalRows']!=GLOBAL_COUNT:
        raise ValueError('Complete-US Places receipt changed')
    if sum(r['usRows'] for r in receipts.values())!=US_COUNT: raise ValueError('Incomplete US Places row inventory')
    for key,r in receipts.items():
        if r['source']!=metadata[key] or r['sourceRows']!=metadata[key]['rows'] or not 0<=r['usRows']<=r['sourceRows']:
            raise ValueError('Places source row counts changed')
        if not re.fullmatch('[a-f0-9]{64}',r.get('sourceFileSha256','')): raise ValueError('Missing full source file hash')
    if sha(encoded(targets['targets']))!=targets['targetsSha256'] or len({t['key'] for t in targets['targets']})!=len(targets['targets']):
        raise ValueError('Places target identity scope changed')
    if require_baseline and targets!=load_targets(): raise ValueError('Ordinary Places target is not the immutable original baseline')
    records=native['records'];seen=set()
    for record in records:
        key=record['sourceFile'];number=record['sourceRowNumber'];row=record['nativeRecord']
        if key not in receipts or type(number)!=int or not 0<=number<metadata[key]['rows'] or (key,number) in seen:
            raise ValueError('Invalid or duplicate native Places ordinal')
        seen.add((key,number))
        if record['sourceEtag']!=metadata[key]['etag'] or record['sourceFileSha256']!=receipts[key]['sourceFileSha256']:
            raise ValueError('Native Places file binding changed')
        if record['sourceDigestScope']!='canonical-native-record' or record['sourceSha256']!=sha(encoded(row)):
            raise ValueError('Native Places record changed')
        if record['projectionSha256']!=sha(encoded(native_projection(row,number))):
            raise ValueError('Native Places projection changed')
        if not isinstance(row.get('id'),str) or not row['id'] or not any(a.get('country')=='US' for a in row.get('addresses') or []):
            raise ValueError('Missing native US Places identity')
    points=sorted({coordinate_key(p) for r in records if not source_block_reason(r['nativeRecord'])
                   and not projected_quality_reason(r['nativeRecord']) and (p:=wkb_point(r['nativeRecord']['geometryWkb'])) is not None})
    point_sha=sha(encoded(points));reuse=[json.loads(files[k]) for k in sorted(files) if k.startswith('reuse/')]
    if len(reuse)!=sum(bool(r['usRows']) for r in receipts.values()) or sum(r['usRowsScanned'] for r in reuse)!=US_COUNT:
        raise ValueError('Incomplete US Places reuse scan')
    reused_sources=set()
    for audit in reuse:
        key=audit['sourceFile']
        if key in reused_sources or key not in receipts: raise ValueError('Duplicate or foreign Places reuse source')
        reused_sources.add(key);receipt=receipts[key]
        if audit['pointsSha256']!=point_sha or audit['sourceEtag']!=metadata[key]['etag'] or audit['cacheSha256']!=receipt['cacheSha256'] or audit['usRowsScanned']!=receipt['usRows']:
            raise ValueError('Places reuse source or target-point scope changed')
        for group in audit['coordinateGroups']:
            if type(group['rows'])!=int or group['rows']<1 or tuple(group['point']) not in points:
                raise ValueError('Invalid Places reuse group')
            for fingerprint,witness in group['addresses'].items():
                point=wkb_point(witness['geometryWkb'])
                if point is None or list(coordinate_key(point))!=group['point'] or fingerprint not in place_fingerprints(witness):
                    raise ValueError('Places distinct-address reuse witness differs')
                if type(witness['file_row_number'])!=int or not 0<=witness['file_row_number']<metadata[key]['rows']:
                    raise ValueError('Invalid actual Places reuse witness ordinal')
    replay=resolve(targets,records,reuse,inventory_sha)
    if encoded(replay)!=files['primary-place-address-candidates.json']: raise ValueError('Retained full-native Places replay differs')
    return report,targets


def source_files(source):
    files={name:(source/name).read_bytes() for name in REQUIRED}
    files.update({'reuse/'+p.name:p.read_bytes() for p in sorted((source/'reuse').glob('*.json'))})
    return files


def archive_bytes(files):
    output=io.BytesIO()
    with zipfile.ZipFile(output,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as archive:
        for name,data in sorted(files.items()):
            info=zipfile.ZipInfo(name,date_time=(2026,11,26,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED
            archive.writestr(info,data)
    return output.getvalue()


def read_archive(raw):
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        if len(archive.namelist())!=len(set(archive.namelist())) or any(i.is_dir() or i.file_size>100_000_000 for i in archive.infolist()):
            raise ValueError('Invalid retained Places archive')
        return {i.filename:archive.read(i) for i in archive.infolist()}


def retain(source):
    files=source_files(source);report,_=validate_files(files);blob=archive_bytes(files)
    manifest={'schemaVersion':1,'source':'Overture Maps Places','release':RELEASE,'collectionDate':DATE,
              'sourceUrl':'https://docs.overturemaps.org/guides/places/',
              'sourceInventorySha256':sha(files['metadata-inventory.json']),'archiveSha256':sha(blob),
              'reportSha256':sha(files['primary-place-address-candidates.json']),
              'globalSourceFiles':GLOBAL_FILES,'globalSourceRows':GLOBAL_COUNT,'completeUSRows':US_COUNT,
              'candidateCount':len(report['candidates']),'outcomes':report['outcomes'],
              'precision':'source-reported place point; existence confidence is not location accuracy',
              'primaryIdentityPolicy':'exact original physical address; place name does not establish organization ownership',
              'coordinateReusePolicy':'complete US; 1e-7 degree comparison grid; original selected coordinates unchanged',
              'members':[{'file':name,'bytes':len(data),'sha256':sha(data)} for name,data in sorted(files.items())]}
    EVIDENCE.mkdir(parents=True,exist_ok=True);(EVIDENCE/'original.zip').write_bytes(blob)
    (EVIDENCE/'manifest.json').write_bytes(encoded(manifest))
    print(json.dumps({k:manifest[k] for k in ('archiveSha256','reportSha256','candidateCount','outcomes')},indent=2))


@functools.lru_cache(maxsize=1)
def _validated():
    raw=(EVIDENCE/'original.zip').read_bytes();manifest=json.loads((EVIDENCE/'manifest.json').read_bytes())
    if not ARCHIVE_SHA256 or not REPORT_SHA256 or not SOURCE_INVENTORY_SHA256:
        raise ValueError('Recovered Places release is not explicitly frozen')
    if sha(raw)!=ARCHIVE_SHA256 or manifest['archiveSha256']!=ARCHIVE_SHA256 or manifest['reportSha256']!=REPORT_SHA256 or manifest['sourceInventorySha256']!=SOURCE_INVENTORY_SHA256:
        raise ValueError('Frozen retained Places evidence changed')
    files=read_archive(raw)
    if manifest['members']!=[{'file':name,'bytes':len(data),'sha256':sha(data)} for name,data in sorted(files.items())]:
        raise ValueError('Retained Places member integrity changed')
    if sha(files['primary-place-address-candidates.json'])!=REPORT_SHA256: raise ValueError('Frozen Places report changed')
    report,targets=validate_files(files,enforce_pins=True)
    return report,targets,files


def validated_evidence():
    candidates,targets,_,_=_coordinate_indexes()
    return copy.deepcopy((candidates,targets))


def validate_overture_place_primary_entry(entry):
    candidates,targets,_,_=_coordinate_indexes();expected=candidates.get(entry.get('key'));original=targets.get(entry.get('key'))
    return bool(expected and original and entry.get('status')=='mapped'
                and all(entry.get(k)==original.get(k) for k in ('source','state','name','sourceDate'))
                and entry.get('address')==expected['originalAddress'] and entry.get('sourceCounty')==original.get('sourceCounty')
                and encoded(entry.get('match'))==encoded(expected['match']) and entry.get('countyFips')==expected['countyFips'])


def coordinate_witnesses(records,key):
    result=[]
    for record in records:
        row=record['nativeRecord']
        if source_block_reason(row) or projected_quality_reason(row): continue
        point=wkb_point(row['geometryWkb'])
        if point is None: continue
        for ref in record['targets']:
            if ref['key']!=key or ref['matchBasis'] not in ('normalized-street-city-state-zip','normalized-street-state-zip'): continue
            ordinal=ref['sourceAddressOrdinal']
            result.append({'coordinatesAsReported':point,'nativeId':row['id'],'sourceFile':record['sourceFile'],
                           'sourceRowNumber':record['sourceRowNumber'],'matchBasis':ref['matchBasis'],
                           'sourceAddress':place_address(row['addresses'][ordinal]),'sourceAddressOrdinal':ordinal})
    return result


@functools.lru_cache(maxsize=1)
def _coordinate_indexes():
    report,targets,files=_validated();by_target={};bindings={}
    for record in json.loads(files['selected-native-records.json'])['records']:
        for key in {ref['key'] for ref in record['targets']}: by_target.setdefault(key,[]).append(record)
    candidates={r['key']:r for r in report['candidates']}
    for key,candidate in candidates.items():
        bindings.setdefault(encoded((candidate['match'],candidate['originalAddress'])),[]).append(key)
    return candidates,{t['key']:t for t in targets['targets']},by_target,bindings


def overture_primary_coordinate_witnesses(key):
    _,_,by_target,_=_coordinate_indexes()
    return coordinate_witnesses(by_target.get(key,[]),key)


def overture_primary_point_witnesses(match,target_address):
    _,_,by_target,bindings=_coordinate_indexes();witnesses={}
    for key in bindings.get(encoded((match,target_address)),[]):
        for witness in coordinate_witnesses(by_target.get(key,[]),key):
            witnesses[(witness['sourceFile'],witness['sourceRowNumber'],witness['sourceAddressOrdinal'])]=witness
    return [witnesses[key] for key in sorted(witnesses)]


def overture_primary_catalog():
    report,targets,_=_validated()
    return copy.deepcopy({'candidates':{r['key']:r for r in report['candidates']},
            'targets':{r['key']:r for r in targets['targets']},'rejected':report['rejected'],
            'uncertain':[],'reportSha256':REPORT_SHA256})


def overture_coordinate_witnesses_for_match(match,target_address):
    witnesses=overture_primary_point_witnesses(match,target_address) if (EVIDENCE/'original.zip').exists() else []
    if witnesses: return witnesses
    from retain_overture_primary_variants import overture_diagnostic_witnesses_for_match
    return overture_diagnostic_witnesses_for_match(match,target_address)


def main():
    p=argparse.ArgumentParser();p.add_argument('--source',type=pathlib.Path);p.add_argument('--verify',action='store_true');a=p.parse_args()
    if a.verify:
        candidates,_=validated_evidence();print('Retained Places replay',len(candidates),'candidates')
    elif a.source: retain(a.source)
    else: p.error('--source or --verify is required')


if __name__=='__main__': main()
