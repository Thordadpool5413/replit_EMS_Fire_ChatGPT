#!/usr/bin/env python3
"""Retain and independently replay exact Overture primary-address evidence.

The compact archive contains actual selected native records, full-file digests,
the complete global object/country inventory, and complete-US coordinate-reuse
receipts with actual conflicting-address witnesses. The reproducible acquisition
and cache replay scripts preserve the large public-data scan without committing
the entire nationwide address database into the application repository.
"""
import argparse
import copy
import functools
import io
import json
import pathlib
import zipfile

from backfill_provider_locations import ROOT
from match_overture_primary_addresses import coordinate_key, distinct_fingerprints, native_street_fingerprint, resolve, wkb_point
from stage_overture_primary_addresses import DATE, GLOBAL_COUNT, RELEASE, US_COUNT, encoded, sha

EVIDENCE=ROOT/'scripts/data/evidence/primary-overture-addresses'/DATE
SOURCE_INVENTORY_SHA256='d6846293aeb456eb246818796a87c481036209ecd067f95b78deda3c76a95fa8'
ARCHIVE_SHA256='2604bbf410a29cdee44f5cd31e8dfadaa90c6aec88d1ca7b68e03aaeef7dffae'
REPORT_SHA256='2adb2dc598586af97b9082287a816cc8e0fc238ae9276633bf8518943a41527e'


def validate_files(files):
    required={'inventory.xml','inventory.json','metadata-inventory.json','complete-us-receipt.json','targets.json',
              'selected-native-records.json','primary-address-candidates.json'}
    if not required<=set(files) or any(k not in required and not k.startswith('reuse/') for k in files):
        raise ValueError('Unexpected retained Overture membership')
    inventory=json.loads(files['inventory.json']);meta=json.loads(files['metadata-inventory.json'])
    complete=json.loads(files['complete-us-receipt.json']);targets=json.loads(files['targets.json'])
    native=json.loads(files['selected-native-records.json']);report=json.loads(files['primary-address-candidates.json'])
    if sha(files['metadata-inventory.json'])!=SOURCE_INVENTORY_SHA256: raise ValueError('Pinned source inventory changed')
    if inventory['release']!=RELEASE or inventory['listingSha256']!=sha(files['inventory.xml']): raise ValueError('Public source listing changed')
    if meta['release']!=RELEASE or meta['inventorySha256']!=sha(files['inventory.json']): raise ValueError('Metadata source identity changed')
    if len(meta['files'])!=64 or sum(f['rows'] for f in meta['files'])!=GLOBAL_COUNT: raise ValueError('Incomplete global edition')
    original={f['key']:f for f in inventory['files']}
    metadata={f['key']:f for f in meta['files']}
    if len(original)!=64 or set(original)!=set(metadata): raise ValueError('Global object membership changed')
    for key,m in metadata.items():
        if any(m[k]!=v for k,v in original[key].items()): raise ValueError('Metadata object changed')
        if sum(g['rows'] for g in m['rowGroups'])!=m['rows']: raise ValueError('Incomplete Parquet row-group inventory')
        possible=any(g['countryMin']<='US'<=g['countryMax'] for g in m['rowGroups'])
        if possible!=m['mayContainUS']: raise ValueError('Country inventory contradiction')
    source_receipts={f['source']['key']:f for f in complete['files']}
    if set(source_receipts)!={k for k,m in metadata.items() if m['mayContainUS']}: raise ValueError('Incomplete possible-US inventory')
    if complete['sourceInventorySha256']!=SOURCE_INVENTORY_SHA256 or complete['usRows']!=US_COUNT:
        raise ValueError('Complete-US edition pin differs')
    for key,r in source_receipts.items():
        if r['source']!=metadata[key] or sum(r['countryCounts'].values())!=metadata[key]['rows'] or r['usRows']!=r['countryCounts'].get('US',0):
            raise ValueError('Actual country row counts differ')
    if sum(r['usRows'] for r in source_receipts.values())!=US_COUNT: raise ValueError('Incomplete US row inventory')
    if sha(encoded(targets['targets']))!=targets['targetsSha256']: raise ValueError('Target identity inventory changed')
    records=native['records'];seen=set();by_source={}
    for record in records:
        key=record['sourceFile'];row=record['nativeRecord'];number=record['sourceRowNumber']
        if key not in source_receipts or type(number)!=int or not 0<=number<metadata[key]['rows']: raise ValueError('Unbound native row ordinal')
        if record['sourceEtag']!=metadata[key]['etag'] or record['sourceDigestScope']!='canonical-native-record' or sha(encoded(row))!=record['sourceSha256']:
            raise ValueError('Native source digest changed')
        pair=(key,number)
        if pair in seen: raise ValueError('Duplicate retained source row')
        seen.add(pair)
        digest=record.get('sourceFileSha256')
        if not isinstance(digest,str) or len(digest)!=64 or any(c not in '0123456789abcdef' for c in digest): raise ValueError('Missing actual full source-file digest')
        if key in by_source and by_source[key]!=digest: raise ValueError('Conflicting full source-file digests')
        by_source[key]=digest
        if row['country']!='US' or not isinstance(row['id'],str) or not row['id']: raise ValueError('Unexpected native source identity')
    reuse=[json.loads(files[k]) for k in sorted(files) if k.startswith('reuse/')]
    if len(reuse)!=sum(bool(r['usRows']) for r in source_receipts.values()) or sum(r['usRowsScanned'] for r in reuse)!=US_COUNT:
        raise ValueError('Incomplete coordinate-reuse scan')
    reuse_seen=set()
    for r in reuse:
        key=r['sourceFile']
        if key in reuse_seen or key not in source_receipts: raise ValueError('Duplicate coordinate-reuse source')
        reuse_seen.add(key);receipt=source_receipts[key]
        if r['sourceEtag']!=metadata[key]['etag'] or r['cacheSha256']!=receipt['cacheSha256'] or r['usRowsScanned']!=receipt['usRows']:
            raise ValueError('Reuse source projection identity changed')
        for group in r['coordinateGroups']:
            if group['rows']<len(group['addresses']): raise ValueError('Impossible coordinate-reuse count')
            for fingerprint,witness in group['addresses'].items():
                point=wkb_point(witness['geometryWkb'])
                if point is None or list(coordinate_key(point))!=group['point'] or native_street_fingerprint(witness)!=fingerprint:
                    raise ValueError('Coordinate-reuse witness differs')
                if type(witness['file_row_number'])!=int or not 0<=witness['file_row_number']<metadata[key]['rows']:
                    raise ValueError('Invalid reuse witness source ordinal')
    allow_city='normalized-street-city-state' in report['allowedMatchBases']
    replay=resolve(targets,records,reuse,SOURCE_INVENTORY_SHA256,allow_city)
    if encoded(replay)!=files['primary-address-candidates.json']: raise ValueError('Retained native source replay differs')
    return report,targets


def retain(source):
    names=['inventory.xml','inventory.json','metadata-inventory.json','complete-us-receipt.json','targets.json',
           'selected-native-records.json','primary-address-candidates.json']
    files={name:(source/name).read_bytes() for name in names}
    files.update({'reuse/'+p.name:p.read_bytes() for p in sorted((source/'reuse').glob('*.json'))})
    report,_=validate_files(files)
    out=io.BytesIO()
    with zipfile.ZipFile(out,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for name,raw in sorted(files.items()):
            info=zipfile.ZipInfo(name,date_time=(2026,11,26,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED
            z.writestr(info,raw)
    blob=out.getvalue()
    manifest={'schemaVersion':1,'source':'Overture Maps addresses','release':RELEASE,'collectionDate':DATE,
              'sourceUrl':'https://docs.overturemaps.org/guides/addresses/','sourceInventorySha256':SOURCE_INVENTORY_SHA256,
              'globalSourceFiles':64,'globalSourceRows':GLOBAL_COUNT,'completeUSRows':US_COUNT,
              'archiveSha256':sha(blob),'reportSha256':sha(files['primary-address-candidates.json']),
              'candidateCount':len(report['candidates']),'outcomes':report['outcomes'],
              'precision':'source-reported address points; not independently certified rooftops',
              'primaryIdentityPolicy':'exact original physical address; no organization identity substitution',
              'coordinateReusePolicy':'complete-US source, 1e-7 degree comparison grid, actual distinct house/street/state/ZIP witnesses; original selected coordinates unchanged',
              'nativeNADPolicy':'withhold wrappers lacking original lifecycle and placement; no provenance laundering',
              'members':[{'file':name,'bytes':len(raw),'sha256':sha(raw)} for name,raw in sorted(files.items())]}
    EVIDENCE.mkdir(parents=True,exist_ok=True)
    (EVIDENCE/'original.zip').write_bytes(blob)
    (EVIDENCE/'manifest.json').write_bytes(encoded(manifest))
    print(json.dumps({k:manifest[k] for k in ('archiveSha256','reportSha256','candidateCount','outcomes')},indent=2))


@functools.lru_cache(maxsize=1)
def _validated_evidence():
    raw=(EVIDENCE/'original.zip').read_bytes();manifest=json.loads((EVIDENCE/'manifest.json').read_bytes())
    if not ARCHIVE_SHA256 or not REPORT_SHA256: raise ValueError('Overture release pins are not frozen')
    if sha(raw)!=ARCHIVE_SHA256 or manifest['archiveSha256']!=ARCHIVE_SHA256 or manifest['reportSha256']!=REPORT_SHA256:
        raise ValueError('Pinned retained Overture evidence changed')
    with zipfile.ZipFile(io.BytesIO(raw)) as z:
        if len(z.namelist())!=len(set(z.namelist())) or any(m.is_dir() or m.file_size>80_000_000 for m in z.infolist()):
            raise ValueError('Invalid retained archive')
        files={m.filename:z.read(m) for m in z.infolist()}
    if manifest['members']!=[{'file':name,'bytes':len(b),'sha256':sha(b)} for name,b in sorted(files.items())]:
        raise ValueError('Retained member integrity changed')
    if sha(files['primary-address-candidates.json'])!=REPORT_SHA256: raise ValueError('Pinned candidate report changed')
    report,targets=validate_files(files)
    return {r['key']:r for r in report['candidates']},{r['key']:r for r in targets['targets']}


def validate_overture_address_evidence(entry):
    candidates,targets=validated_evidence()
    expected=candidates.get(entry.get('key'));original=targets.get(entry.get('key'))
    return bool(expected and original and entry.get('status')=='mapped'
                and all(entry.get(k)==original.get(k) for k in ('source','state','name','sourceDate'))
                and entry.get('address')==expected['originalAddress']
                and entry.get('sourceCounty')==original.get('sourceCounty')
                and entry.get('match')==expected['match'] and entry.get('countyFips')==expected['countyFips'])


validate_overture_primary_entry=validate_overture_address_evidence


def validated_evidence():
    return copy.deepcopy(_validated_evidence())


@functools.lru_cache(maxsize=1)
def _native_files():
    _validated_evidence()
    raw=(EVIDENCE/'original.zip').read_bytes()
    if sha(raw)!=ARCHIVE_SHA256: raise ValueError('Retained Address source changed')
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        return {name:archive.read(name) for name in ('selected-native-records.json','primary-address-candidates.json','targets.json')}


def coordinate_witnesses(records,key):
    from match_overture_primary_addresses import source_address,source_block_reason
    result=[]
    for record in records:
        row=record['nativeRecord']
        if source_block_reason(row): continue
        point=wkb_point(row['geometryWkb'])
        if point is None: continue
        for ref in record['targets']:
            if ref['key']!=key or ref['matchBasis'] not in ('normalized-street-city-state-zip','normalized-street-state-zip'): continue
            result.append({'coordinatesAsReported':point,'nativeId':row['id'],'sourceFile':record['sourceFile'],
                           'sourceRowNumber':record['sourceRowNumber'],'matchBasis':ref['matchBasis'],'sourceAddress':source_address(row)})
    return result


def overture_primary_coordinate_witnesses(key):
    records=json.loads(_native_files()['selected-native-records.json'])['records']
    return coordinate_witnesses(records,key)


def overture_primary_point_witnesses(match,target_address):
    candidates,_=_validated_evidence()
    keys=[key for key,candidate in candidates.items() if candidate['match']==match and candidate['originalAddress']==target_address]
    records=json.loads(_native_files()['selected-native-records.json'])['records']
    witnesses={}
    for key in keys:
        for witness in coordinate_witnesses(records,key):
            witnesses[(witness['sourceFile'],witness['sourceRowNumber'])]=witness
    return [witnesses[key] for key in sorted(witnesses)]


def overture_primary_catalog():
    files=_native_files();report=json.loads(files['primary-address-candidates.json'])
    return {'candidates':{r['key']:r for r in report['candidates']},
            'targets':{r['key']:r for r in json.loads(files['targets.json'])['targets']},
            'rejected':report['rejected'],'uncertain':[],'reportSha256':REPORT_SHA256}


def overture_coordinate_witnesses_for_match(match,target_address):
    witnesses=overture_primary_point_witnesses(match,target_address)
    if witnesses: return witnesses
    from retain_overture_primary_variants import overture_diagnostic_witnesses_for_match
    return overture_diagnostic_witnesses_for_match(match,target_address)


def main():
    p=argparse.ArgumentParser();p.add_argument('--source',type=pathlib.Path);p.add_argument('--verify',action='store_true');a=p.parse_args()
    if a.verify:
        candidates,_=validated_evidence();print('Overture retained replay',len(candidates),'candidates')
    elif a.source: retain(a.source)
    else: p.error('--source or --verify is required')


if __name__=='__main__': main()
