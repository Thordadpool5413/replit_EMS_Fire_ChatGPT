#!/usr/bin/env python3
"""Read-only CMS/Places phone-name opportunity diagnosis from retained native rows.

The retained Places address-selected subset cannot establish reciprocal phone
uniqueness. This report never emits a mapped candidate or coverage count.
"""
import argparse,collections,copy,json,pathlib,zipfile

from address_normalization import normalize_street,normalized_city,source_street_line,physical_address
from backfill_provider_locations import ROOT,STATES,digest_file,native_key,zip5
from build_neris_station_map import BOUNDARY,county_for,geometry_index
from primary_recovery_baseline import load_primary_baseline
from recover_nppes_native_primary import active,dump
from recover_nppes_primary_components import inputs as cms_inputs
from recover_nppes_phone_identity import phone,possible_phones,agency_name,distinctive
from retain_nppes_native_source import DEFAULT as CMS_EVIDENCE,current_pins,verify as verify_cms
from retain_nppes_other_names import EVIDENCE as OTHER_EVIDENCE,source_catalog as other_names_catalog
from stage_overture_primary_addresses import DATE,RELEASE,sha,encoded
from stage_overture_primary_places import place_address,US_COUNT
from match_overture_primary_addresses import coordinate_key,distinct_fingerprints,source_block_reason,wkb_point
from match_overture_primary_places import projected_quality_reason
import retain_overture_primary_places as places
import retain_overture_primary_variants as variants

EVIDENCE=ROOT/'scripts/data/evidence/overture-phone-opportunity'/DATE
ELIGIBLE={'no-match','not-eligible','unavailable','pending'}
PROFILE='retained-native-place-phone-name-diagnostic'
OTHER_TYPE='Provider Other Organization Name Type Code'
OTHER_NAME='Provider Other Organization Name'

def source_dependencies():
    result={}
    for name,path in [('native-cms',CMS_EVIDENCE),('native-other-names',OTHER_EVIDENCE),
                      ('ordinary-places',places.EVIDENCE),('native-variant-places',variants.EVIDENCE)]:
        result[name]={'archiveSha256':digest_file(path/'original.zip'),
                      'manifestSha256':sha((path/'manifest.json').read_bytes())}
    return result

def name_variants(record,reference_index):
    native=record['native'];values=[]
    legal=native['Provider Organization Name (Legal Business Name)']
    values.append({'field':'legal-name','nameAsReported':legal,
                   'nativeRecordSha256':record['nativeRecordSha256'],'sourceRowNumber':record['sourceRowNumber']})
    if native[OTHER_TYPE].strip()=='3':
        values.append({'field':'main-file-native-type-3','nameAsReported':native[OTHER_NAME],
                       'nativeRecordSha256':record['nativeRecordSha256'],'sourceRowNumber':record['sourceRowNumber']})
    for row in reference_index.get(record['npi'],[]):
        if row['native']['NPI']!=record['npi']:raise ValueError('Other Names source moved to a different NPI')
        if row['native'][OTHER_TYPE]=='3':
            values.append({'field':'reference-file-native-type-3','nameAsReported':row['native'][OTHER_NAME],
                           'nativeRecordSha256':row['nativeRecordSha256'],'sourceRowNumber':row['sourceRowNumber'],
                           'native':copy.deepcopy(row['native'])})
    result=collections.defaultdict(list)
    for value in values:
        if isinstance(value['nameAsReported'],str)and distinctive(value['nameAsReported']):
            result[agency_name(value['nameAsReported'])].append(value)
    return dict(result)

def retained_places():
    ordinary,_,ordinary_files=places._validated()
    diagnostic=variants._validated()['overture-place-address']
    inputs=[('ordinary',ordinary_files),('native-variants',diagnostic['sourceFiles'])]
    records={};by_id={};groups={};source_counts={}
    for label,files in inputs:
        complete=json.loads(files['complete-us-receipt.json'])
        source_counts[label]={'completeUSRows':complete['usRows'],
                              'sourceInventorySha256':complete['sourceInventorySha256'],
                              'sourceReportSha256':sha(files['primary-place-address-candidates.json'])}
        if complete['usRows']!=US_COUNT:raise ValueError('Incomplete retained Places coordinate-reuse scope')
        local_groups={}
        for name,raw in files.items():
            if not name.startswith('reuse/'):continue
            audit=json.loads(raw)
            for group in audit['coordinateGroups']:
                point=tuple(group['point']);bucket=local_groups.setdefault(point,{'rows':0,'addresses':set()})
                bucket['rows']+=group['rows'];bucket['addresses'].update(group['addresses'])
        for point,group in local_groups.items():
            canonical={'rows':group['rows'],'addresses':sorted(group['addresses'])}
            if point in groups and groups[point]!=canonical:raise ValueError('Complete Places reuse editions disagree')
            groups[point]=canonical
        for record in json.loads(files['selected-native-records.json'])['records']:
            key=(record['sourceFile'],record['sourceRowNumber'])
            identity={k:v for k,v in record.items()if k!='targets'}
            if key in records and records[key]!=identity:raise ValueError('Retained Places source row differs by profile')
            native_id=record['nativeRecord']['id']
            if native_id in by_id and by_id[native_id]!=key:raise ValueError('Retained native Places ID repeats across rows')
            records[key]=identity;by_id[native_id]=key
    return [records[k]for k in sorted(records)],groups,source_counts

def locality(address):
    if not isinstance(address,dict):return None
    state=address.get('state');city=normalized_city(address.get('city')or'')
    postal=address.get('zip')or zip5(address.get('postalCode')or'')
    if state not in STATES or not city or not postal:return None
    return state,city,postal

def street_basis(original,component,source_address):
    def same(a):
        return bool(a and a.get('state')==source_address['state']and
                    physical_address(a)and
                    normalize_street(source_street_line(a['street']))==
                    normalize_street(source_street_line(source_address['street'])))
    if same(original['address']):return {'rule':'original-primary-street'}
    if component and same(component['address']):
        return {'rule':'unambiguous-native-primary-component','componentEvidence':copy.deepcopy(component['componentEvidence'])}
    return {'rule':'primary-street-not-corroborated','primarySiteRoleUncertainty':
            'An exact business phone, complete native name and locality do not establish that this reported place is the registered primary practice.'}

def point_diagnosis(record,address,original,groups,counties):
    row=record['nativeRecord'];reasons=[]
    reason=source_block_reason(row)or projected_quality_reason(row)
    if reason:reasons.append(reason)
    if not physical_address(address):reasons.append('nonphysical-or-incomplete-native-place-address')
    try:point=wkb_point(row['geometryWkb'])
    except(TypeError,ValueError):point=None
    if point is None:reasons.append('invalid-native-point')
    county=None;reuse=None
    if point is not None and address['state']in counties:
        county,_=county_for(point,counties[address['state']])
        if not county or original.get('sourceCounty')and original['sourceCounty']!=county:
            reasons.append('source-point-county-conflict')
    if not county and 'source-point-county-conflict'not in reasons:reasons.append('source-point-county-conflict')
    if point is not None:
        reuse=groups.get(coordinate_key(point))
        if reuse is None:reasons.append('complete-coordinate-reuse-audit-not-retained-for-point')
        elif len(distinct_fingerprints(reuse['addresses']))!=1:reasons.append('coordinate-shared-by-distinct-addresses')
        elif physical_address(address):
            fingerprint=address['state']+'|'+address['zip']+'|'+normalize_street(source_street_line(address['street']))
            if fingerprint not in reuse['addresses']:raise ValueError('Native address absent from its complete coordinate-reuse witnesses')
    return {'reasons':sorted(set(reasons)),'coordinatesAsReported':point,'countyFips':county,
            'coordinateAudit':copy.deepcopy(reuse),'completeUSRowsAudited':US_COUNT if reuse is not None else None}

def generate():
    verify_cms(CMS_EVIDENCE);snapshot,components,native=cms_inputs()
    _,baseline,index_sha=load_primary_baseline()
    if snapshot['entries']!=baseline or len(baseline)!=46791:raise ValueError('Native CMS original denominator changed')
    other,other_manifest=other_names_catalog();reference_index=collections.defaultdict(list)
    for witness in other['selectedNativeRows']:reference_index[witness['native']['NPI']].append(witness)
    if len(native['phoneInventory'])!=20554 or len(native['records'])!=19567:raise ValueError('Complete native ambulance inventory changed')
    originals={e['key']:e for e in baseline};component_index={e['key']:e for e in components}
    cms_owners=collections.defaultdict(set);cms_malformed=set()
    for row in native['phoneInventory']:
        for value in possible_phones(row['telephone']):
            cms_owners[value].add(row['key'])
            if phone(row['telephone'])!=value:cms_malformed.add(value)
    targets={};outcomes=collections.Counter()
    for row in native['records']:
        old=originals[row['key']]
        if old['status']not in ELIGIBLE:outcomes['original-status-already-mapped-or-ineligible']+=1;continue
        p=phone(row['telephone']);loc=locality(row['primaryAddress'])
        if not active(row)or row['primaryAddress']['country']not in('','US'):outcomes['inactive-or-nondomestic-native-cms']+=1;continue
        if row['primaryAddress']['state']!=old['state']:outcomes['native-primary-state-differs-from-original']+=1;continue
        if not p or not loc:outcomes['incomplete-native-primary-phone-or-locality']+=1;continue
        if p in cms_malformed or cms_owners[p]!={row['key']}:outcomes['nonreciprocal-complete-native-cms-phone']+=1;continue
        names=name_variants(row,reference_index)
        if not names:outcomes['no-distinctive-complete-native-name']+=1;continue
        targets[row['key']]={'record':row,'original':old,'phone':p,'locality':loc,'names':names}
    by_phone=collections.defaultdict(list)
    for target in targets.values():by_phone[target['phone']].append(target)
    wanted_phones=set(by_phone)
    records,groups,source_counts=retained_places()
    retained_owners=collections.defaultdict(set);retained_malformed=set()
    for record in records:
        row=record['nativeRecord']
        for value in row.get('phones')or[]:
            for p in possible_phones(value):
                retained_owners[p].add(row['id'])
                if phone(value)!=p:retained_malformed.add(p)
    identities={r['GEOID']:r['USPS']for r in json.loads((ROOT/'scripts/fixtures/census-2026-county-identities.json').read_bytes())['counties']if r['USPS']in STATES}
    counties=geometry_index(json.loads(BOUNDARY.read_bytes()),identities)
    observations=[];phone_overlap=set();name_overlap=set();used_records={};native_records={}
    for record in records:
        row=record['nativeRecord'];name=(row.get('names')or{}).get('primary')or''
        actual_phones={p for value in row.get('phones')or[]if(p:=phone(value))}
        for p in sorted(actual_phones&wanted_phones):
            for target in by_phone[p]:
                key=target['original']['key'];phone_overlap.add(key)
                basis=target['names'].get(agency_name(name))
                if not basis or not distinctive(name):continue
                name_overlap.add(key)
                for ordinal,raw in enumerate(row.get('addresses')or[]):
                    address=place_address(raw)
                    if locality(address)!=target['locality']:continue
                    point=point_diagnosis(record,address,target['original'],groups,counties)
                    collision=sorted(retained_owners[p])
                    preliminary_block=(p in retained_malformed or collision!=[row['id']])
                    street=street_basis(target['original'],component_index.get(key),address)
                    observations.append({'key':key,'npi':target['record']['npi'],'originalPrimary':copy.deepcopy(target['original']),
                        'phone':p,'nativeCmsRecordSha256':target['record']['nativeRecordSha256'],
                        'cmsSourceRowNumber':target['record']['sourceRowNumber'],'cmsPrimaryAddressAsReported':copy.deepcopy(target['record']['primaryAddress']),
                        'nativeNameBasis':copy.deepcopy(basis),'placeNameAsReported':name,'placeNativeId':row['id'],
                        'placeSourceSha256':record['sourceSha256'],'sourceAddressOrdinal':ordinal,'sourceAddress':address,
                        'nativePhoneLocality':'exact-city-state-zip','placePointChecks':point,'streetCorroboration':street,
                        'retainedSubsetPhoneOwners':collision,'retainedSubsetMalformedPhoneCollision':p in retained_malformed,
                        'retainedSubsetCollisionBlocksOpportunity':preliminary_block,
                        'fullPlacesReciprocityProven':False,'sourceRole':'reported-place-address',
                        'association':'inferred','endUserValidationRequired':True,'mappedCandidate':False,
                        'diagnosticStatus':'requires-complete-places-phone-inventory',
                        'primarySiteRoleConfirmed':False})
                    used_records[row['id']]=copy.deepcopy(record)
                    native_records[key]=copy.deepcopy(target['record'])
    observations.sort(key=lambda r:(r['key'],r['placeNativeId'],r['sourceAddressOrdinal']))
    clean=[r for r in observations if not r['placePointChecks']['reasons']and not r['retainedSubsetCollisionBlocksOpportunity']]
    corroborated=[r for r in clean if r['streetCorroboration']['rule']!='primary-street-not-corroborated']
    summary={'originalPrimaryCount':46791,'nativeCmsOriginalIdentities':19567,'completeAmbulancePhoneInventoryCount':20554,
        'eligibleOriginalCmsPhoneNameLocalityTargets':len(targets),'retainedUniqueNativePlaceRows':len(records),
        'originalIdentitiesWithRetainedPhoneOverlap':len(phone_overlap),
        'originalIdentitiesWithRetainedPhoneAndNameOverlap':len(name_overlap),
        'originalIdentitiesWithRetainedPhoneNameLocalityOverlap':len({r['key']for r in observations}),
        'originalIdentitiesPassingRetainedPhysicalChecks':len({r['key']for r in clean}),
        'originalIdentitiesWithCorroboratedPrimaryStreet':len({r['key']for r in corroborated}),
        'retainedObservations':len(observations),'physicalCheckReasons':dict(sorted(collections.Counter(reason for r in observations for reason in r['placePointChecks']['reasons']).items())),
        'streetCorroboration':dict(sorted(collections.Counter(r['streetCorroboration']['rule']for r in clean).items())),
        'cmsExclusions':dict(sorted(outcomes.items())),
        'fullPlacesReciprocityProven':False,'qualifiedMappingCount':None}
    return {'schemaVersion':1,'profile':PROFILE,'release':RELEASE,'collectionDate':DATE,
        'baselineIndexSha256':index_sha,'nativeCmsReportSha256':current_pins()[0],
        'nativeCmsComponentTargetsSha256':current_pins()[1],'nativeOtherNamesReportSha256':other_manifest['reportSha256'],
        'nativeOtherNamesSourceMemberSha256':other['sourceMemberSha256'],'completeOtherNamesRows':other['completeRowsScanned'],
        'sourceDependencies':source_dependencies(),'retainedPlaceSourceScopes':source_counts,'summary':summary,
        'observations':observations,'nativeCmsRecords':native_records,'nativePlaceRecords':used_records,
        'limitations':['The Places records are an address-selected subset, not a complete phone inventory.',
          'A subset collision is a valid exclusion; absence of a subset collision does not prove reciprocal uniqueness.',
          'Native CMS phone uniqueness covers the complete Type 2 ambulance inventory, not all NPIs.',
          'This report does not establish a registered-primary-site role or authorize a mapped candidate.',
          'Overlap with the final non-phone release must be measured separately.']}

def retain(output=EVIDENCE):
    report=generate();raw=dump(report);output.mkdir(parents=True,exist_ok=True)
    with zipfile.ZipFile(output/'original.zip','w',zipfile.ZIP_DEFLATED,compresslevel=9)as z:
        info=zipfile.ZipInfo('report.json',date_time=(2026,11,26,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,raw)
    manifest={'schemaVersion':1,'profile':PROFILE,'archiveSha256':digest_file(output/'original.zip'),
              'reportSha256':sha(raw),'sourceDependencies':source_dependencies(),
              'diagnosticCodeSha256':digest_file(pathlib.Path(__file__)),'summary':report['summary']}
    (output/'manifest.json').write_bytes(dump(manifest));(output/'summary.json').write_bytes(dump(report['summary']))
    return report,manifest

def main():
    p=argparse.ArgumentParser();p.add_argument('--output',type=pathlib.Path,default=EVIDENCE);a=p.parse_args()
    report,manifest=retain(a.output)
    print(json.dumps({'summary':report['summary'],'archiveSha256':manifest['archiveSha256'],'reportSha256':manifest['reportSha256'],
                      'cleanObservedKeys':sorted({r['key']for r in report['observations']if not r['placePointChecks']['reasons']and not r['retainedSubsetCollisionBlocksOpportunity']})},sort_keys=True),flush=True)

if __name__=='__main__':main()
