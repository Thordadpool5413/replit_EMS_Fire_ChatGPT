#!/usr/bin/env python3
"""Retain separate, fully reacquired native CMS/NERIS Overture geocode catalogs.

The complete source scans establish geocode provenance and conflicts. The caller
must independently validate the original-primary component or agency/site role.
"""
import argparse
import copy
import functools
import json
import pathlib

from backfill_provider_locations import ROOT
from freeze_overture_recovered_release import replace_pin
from prepare_overture_native_variants import bind_scopes
from primary_recovery_baseline import INDEX_SHA
from stage_overture_primary_addresses import DATE, RELEASE, encoded, sha
import retain_overture_primary_addresses as addresses
import retain_overture_primary_places as places

EVIDENCE=ROOT/'scripts/data/evidence/primary-overture-native-variants'/DATE
ARCHIVE_SHA256='5e01f6755021136124020ae28f1b072e7b1bbf0b56a4251a78d04e9928795000'
ADDRESS_REPORT_SHA256='b2b00f2f6dd98e8eeab0eb18b869d64f01455276b4255e014ac30acf837b0872'
PLACE_REPORT_SHA256='a5b36bd19fe4040321102115422e7a3a467ba61eb9b5ac2dab9ef10916afa758'
CMS_TARGET_SHA256='cac14a8230f8922fadd733308ab3aa7a161ba141e2593c70f3b7861018971305'
NERIS_TARGET_SHA256='bf48de5304c9c6e5c7ee498527e2852db219f73d9f8b543dace6e2c6dd12bf4a'
MEMBERS={'cms-targets.json','neris-targets.json','target-receipt.json','addresses.zip','places.zip','address-report.json','places-report.json'}
METHODS={'overture-address':('addresses.zip','address-report.json','cms-targets.json'),
         'overture-place-address':('places.zip','places-report.json',None)}


def scope_rows(raw):
    value=json.loads(raw)
    return value['targets'] if isinstance(value,dict) else value


def source_files(directory,method):
    report='primary-address-candidates.json' if method=='overture-address' else 'primary-place-address-candidates.json'
    names=['inventory.xml','inventory.json','metadata-inventory.json','complete-us-receipt.json',
           'targets.json','selected-native-records.json',report]
    files={name:(directory/name).read_bytes() for name in names}
    files.update({'reuse/'+p.name:p.read_bytes() for p in sorted((directory/'reuse').glob('*.json'))})
    return files


def diagnostic_report(source_report,source_files_value,targets,originals,method):
    target_map={t['key']:t for t in targets};candidates=[];rejected=[]
    records=json.loads(source_files_value['selected-native-records.json'])['records']
    coordinate_reader=addresses.coordinate_witnesses if method=='overture-address' else places.coordinate_witnesses
    for candidate in source_report['candidates']:
        target=target_map[candidate['key']];primary_key=target.get('originalPrimaryKey',target['key'])
        result=copy.deepcopy(candidate)
        result.update(originalPrimaryKey=primary_key,originalPrimaryAddress=originals[primary_key]['address'],
                      targetSha256=sha(encoded(target)))
        for field in ('componentEvidence','primaryAddressEvidence'):
            if field in target: result[field]=copy.deepcopy(target[field])
        candidates.append(result)
    for reject in source_report['rejected']:
        target=target_map[reject['key']];result=copy.deepcopy(reject)
        result['targetAddress']=target['address'];result['targetSha256']=sha(encoded(target))
        result['originalPrimaryKey']=target.get('originalPrimaryKey',target['key'])
        result['qualifiedNativeWitnesses']=coordinate_reader(records,target['key'])
        rejected.append(result)
    return {'schemaVersion':1,'release':RELEASE,'method':method,
            'purpose':'separate-native-target-geocode-proof; original-primary association requires independent replay',
            'sourceInventorySha256':source_report['sourceInventorySha256'],
            'completeUSRowsAudited':source_report['completeUSRowsAudited'],
            'locationIndexSha256':INDEX_SHA,'targetsSha256':sha(encoded(targets)),
            'sourceReportSha256':sha(encoded(source_report)),'inputTargets':copy.deepcopy(targets),
            'outcomes':source_report['outcomes'],'candidates':candidates,'rejected':rejected,
            'withheldIncompleteEligibleNativeProvenanceTargets':[],
            'acquisitionScope':'every matched native row reacquired from complete fixed public source objects'}


def validate_files(files,enforce_pins=False):
    if set(files)!=MEMBERS: raise ValueError('Unexpected native-variant archive membership')
    cms=scope_rows(files['cms-targets.json']);neris=scope_rows(files['neris-targets.json'])
    originals,index_sha=bind_scopes(cms,neris)
    if enforce_pins and (sha(files['cms-targets.json'])!=CMS_TARGET_SHA256 or sha(files['neris-targets.json'])!=NERIS_TARGET_SHA256):
        raise ValueError('Frozen native input target scope changed')
    expected_receipt={'schemaVersion':1,'purpose':'separate-native-site-geocode-targets','baselineIndexSha256':index_sha,
        'CMS':{'targets':len(cms),'sha256':sha(files['cms-targets.json'])},
        'NERIS':{'targets':len(neris),'sha256':sha(files['neris-targets.json'])},
        'combinedTargetsSha256':sha(encoded(cms+neris)),
        'associationPolicy':'geocode evidence only; caller independently validates retained original-primary association'}
    if json.loads(files['target-receipt.json'])!=expected_receipt: raise ValueError('Native target receipt changed')
    result={}
    for method,(archive_name,report_name,_) in METHODS.items():
        source=places.read_archive(files[archive_name])
        if method=='overture-address':
            source_report,target_data=addresses.validate_files(source);targets=cms;target_bytes=files['cms-targets.json']
        else:
            source_report,target_data=places.validate_files(source,require_baseline=False);targets=cms+neris;target_bytes=encoded(targets)
        expected_targets={'locationIndexSha256':index_sha,'targetsSha256':sha(encoded(targets)),
                          'targets':targets,'inputTargetsFileSha256':sha(target_bytes)}
        if target_data!=expected_targets: raise ValueError('Native geocode source target binding differs')
        replay=diagnostic_report(source_report,source,targets,originals,method)
        if encoded(replay)!=files[report_name]: raise ValueError('Native variant source replay differs')
        result[method]={'report':replay,'sourceFiles':source}
    return result


def retain(address_source,place_source,scope,freeze=False):
    files={name:(scope/name).read_bytes() for name in ('cms-targets.json','neris-targets.json','target-receipt.json')}
    cms=scope_rows(files['cms-targets.json']);neris=scope_rows(files['neris-targets.json']);originals,_=bind_scopes(cms,neris)
    for method,directory,targets,archive_name,report_name in [
        ('overture-address',address_source,cms,'addresses.zip','address-report.json'),
        ('overture-place-address',place_source,cms+neris,'places.zip','places-report.json')]:
        source=source_files(directory,method)
        if method=='overture-address': source_report,_=addresses.validate_files(source)
        else: source_report,_=places.validate_files(source,require_baseline=False)
        report=diagnostic_report(source_report,source,targets,originals,method)
        files[archive_name]=places.archive_bytes(source);files[report_name]=encoded(report)
    catalogs=validate_files(files);blob=places.archive_bytes(files)
    cms_reports={target['componentEvidence']['sourceReportSha256'] for target in cms}
    if len(cms_reports)!=1: raise ValueError('CMS component targets cross native report editions')
    manifest={'schemaVersion':1,'purpose':'separate-native-target-Overture-geocode-catalogs','release':RELEASE,
              'collectionDate':DATE,'archiveSha256':sha(blob),'cmsTargetSha256':sha(files['cms-targets.json']),
              'nerisTargetSha256':sha(files['neris-targets.json']),'cmsNativeReportSha256':next(iter(cms_reports)),
              'addressReportSha256':sha(files['address-report.json']),'placeReportSha256':sha(files['places-report.json']),
              'candidateCounts':{method:len(data['report']['candidates']) for method,data in catalogs.items()},
              'outcomes':{method:data['report']['outcomes'] for method,data in catalogs.items()},
              'associationPolicy':'source point alone never establishes original-primary role',
              'members':[{'file':name,'bytes':len(raw),'sha256':sha(raw)} for name,raw in sorted(files.items())]}
    EVIDENCE.mkdir(parents=True,exist_ok=True);(EVIDENCE/'original.zip').write_bytes(blob);(EVIDENCE/'manifest.json').write_bytes(encoded(manifest))
    if freeze:
        path=pathlib.Path(__file__)
        for name,value in [('ARCHIVE_SHA256',manifest['archiveSha256']),('ADDRESS_REPORT_SHA256',manifest['addressReportSha256']),
                           ('PLACE_REPORT_SHA256',manifest['placeReportSha256']),('CMS_TARGET_SHA256',manifest['cmsTargetSha256']),
                           ('NERIS_TARGET_SHA256',manifest['nerisTargetSha256'])]:
            replace_pin(path,name,value)
    print(json.dumps({key:value for key,value in manifest.items() if key!='members'},indent=2))


@functools.lru_cache(maxsize=1)
def _validated():
    raw=(EVIDENCE/'original.zip').read_bytes();manifest=json.loads((EVIDENCE/'manifest.json').read_bytes())
    if not all((ARCHIVE_SHA256,ADDRESS_REPORT_SHA256,PLACE_REPORT_SHA256,CMS_TARGET_SHA256,NERIS_TARGET_SHA256)):
        raise ValueError('Native variant release pins are not frozen')
    if sha(raw)!=ARCHIVE_SHA256 or manifest['archiveSha256']!=ARCHIVE_SHA256: raise ValueError('Frozen native variant archive changed')
    files=places.read_archive(raw)
    if manifest['members']!=[{'file':name,'bytes':len(data),'sha256':sha(data)} for name,data in sorted(files.items())]:
        raise ValueError('Native variant member integrity differs')
    if sha(files['address-report.json'])!=ADDRESS_REPORT_SHA256 or sha(files['places-report.json'])!=PLACE_REPORT_SHA256:
        raise ValueError('Frozen native variant report changed')
    if manifest['addressReportSha256']!=ADDRESS_REPORT_SHA256 or manifest['placeReportSha256']!=PLACE_REPORT_SHA256:
        raise ValueError('Native variant manifest report pin differs')
    return validate_files(files,enforce_pins=True)


@functools.lru_cache(maxsize=2)
def _coordinate_indexes(method):
    data=_validated()[method];report=data['report'];by_target={};bindings={}
    for record in json.loads(data['sourceFiles']['selected-native-records.json'])['records']:
        for key in {ref['key'] for ref in record['targets']}: by_target.setdefault(key,[]).append(record)
    candidates={r['key']:r for r in report['candidates']}
    for key,candidate in candidates.items():
        bindings.setdefault(encoded((candidate['match'],candidate['originalAddress'])),[]).append(key)
    return candidates,{t['key']:t for t in report['inputTargets']},by_target,bindings


def overture_diagnostic_catalog(method):
    if method not in METHODS: raise ValueError('Unsupported Overture diagnostic source')
    report=_validated()[method]['report']
    return copy.deepcopy({'candidates':{r['key']:r for r in report['candidates']},
                          'targets':{r['key']:r for r in report['inputTargets']},
                          'rejected':report['rejected'],'uncertain':report['withheldIncompleteEligibleNativeProvenanceTargets'],
                          'reportSha256':ADDRESS_REPORT_SHA256 if method=='overture-address' else PLACE_REPORT_SHA256})


def validate_overture_diagnostic_candidate(candidate,target):
    try:
        method=candidate['match']['method']
        if method not in METHODS: return False
        candidates,targets,_,_=_coordinate_indexes(method);key=candidate['key']
        expected=candidates.get(key);expected_target=targets.get(key)
        return expected is not None and expected_target is not None and encoded(candidate)==encoded(expected) and encoded(target)==encoded(expected_target)
    except (KeyError,TypeError,ValueError): return False


def overture_diagnostic_coordinate_witnesses(method,key):
    _,_,by_target,_=_coordinate_indexes(method)
    records=by_target.get(key,[])
    reader=addresses.coordinate_witnesses if method=='overture-address' else places.coordinate_witnesses
    return reader(records,key)


def overture_diagnostic_witnesses_for_match(match,target_address):
    method=match.get('method') if isinstance(match,dict) else None
    if method not in METHODS or not (EVIDENCE/'original.zip').exists(): return []
    _,_,_,bindings=_coordinate_indexes(method);witnesses={}
    keys=bindings.get(encoded((match,target_address)),[])
    for key in keys:
        for witness in overture_diagnostic_coordinate_witnesses(method,key):
            identity=(witness['sourceFile'],witness['sourceRowNumber'],witness.get('sourceAddressOrdinal',-1))
            witnesses[identity]=witness
    return [witnesses[key] for key in sorted(witnesses)]


def validated_evidence():
    return {method:overture_diagnostic_catalog(method) for method in METHODS}


def main():
    p=argparse.ArgumentParser();p.add_argument('--addresses',type=pathlib.Path);p.add_argument('--places',type=pathlib.Path)
    p.add_argument('--scope',type=pathlib.Path);p.add_argument('--freeze',action='store_true');p.add_argument('--verify',action='store_true');a=p.parse_args()
    if a.verify:
        catalogs=validated_evidence()
        for method,catalog in catalogs.items():
            for key,candidate in catalog['candidates'].items():
                if not validate_overture_diagnostic_candidate(candidate,catalog['targets'][key]): raise ValueError('Exact retained target/candidate binding failed')
                witnesses=overture_diagnostic_witnesses_for_match(candidate['match'],candidate['originalAddress'])
                from match_overture_primary_addresses import points_agree
                if not witnesses or not points_agree([w['coordinatesAsReported'] for w in witnesses]): raise ValueError('Native endpoint expansion lost source consensus')
                changed=copy.deepcopy(candidate);changed['match']['latitude']+=0.0001
                if validate_overture_diagnostic_candidate(changed,catalog['targets'][key]): raise ValueError('Coordinate mutation was accepted')
            print('Native variant replay',method,len(catalog['candidates']),'accepted',len(catalog['rejected']),'rejected')
    elif a.addresses and a.places and a.scope: retain(a.addresses,a.places,a.scope,a.freeze)
    else: p.error('--verify or --addresses, --places and --scope required')


if __name__=='__main__': main()
