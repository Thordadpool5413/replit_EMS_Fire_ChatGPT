#!/usr/bin/env python3
"""Complete fixed-source phone/name diagnosis with aggregate-only external output.

All provider-level joins, raw rows, phone ownership witnesses and site diagnostics
stay in --work on the runner. Only aggregate counts and public source-file audit
receipts are written to --summary-output. No mapped candidate is enabled.
"""
import argparse,collections,copy,functools,json,pathlib,re,shutil,zipfile
from address_normalization import normalize_street,normalized_city,source_street_line,physical_address,same_address
from backfill_provider_locations import ROOT,STATES,sha,digest_file,zip5
from build_neris_station_map import BOUNDARY,county_for,geometry_index
from primary_recovery_baseline import load_primary_baseline
from recover_nppes_native_primary import active,dump
from recover_nppes_primary_components import inputs as cms_inputs
from recover_nppes_phone_identity import phone,possible_phones,agency_name,distinctive
from retain_nppes_native_source import DEFAULT as CMS_EVIDENCE,verify as verify_cms,current_pins
from retain_nppes_other_names import source_catalog as other_names_catalog
from stage_overture_primary_addresses import DATE,RELEASE,connection,download_original,encoded,file_sha
from stage_overture_primary_places import US_COUNT,GLOBAL_COUNT,GLOBAL_FILES,place_address
from match_overture_primary_addresses import coordinate_key,distinct_fingerprints,source_block_reason,wkb_point,points_agree
from match_overture_primary_places import projected_quality_reason,reuse_one
from diagnose_overture_phone_opportunity import name_variants,locality,street_basis,point_diagnosis,ELIGIBLE
import retain_overture_primary_places as retained_places

SUMMARY_OUTPUT=ROOT/'scripts/data/evidence/overture-phone-complete-assessment'/DATE
PROFILE='complete-fixed-places-native-cms-phone-name-diagnostic'
SOURCE_INVENTORY_SHA='b63c22f9c4a4d4560707fca076a7f027ffb8520db1cd07fa8f490e74aeafa339'

def input_scope():
    verify_cms(CMS_EVIDENCE);snapshot,components,native=cms_inputs()
    _,baseline,index_sha=load_primary_baseline()
    if snapshot['entries']!=baseline or len(baseline)!=46791:raise ValueError('Original identity denominator changed')
    other,other_manifest=other_names_catalog();references=collections.defaultdict(list)
    for witness in other['selectedNativeRows']:references[witness['native']['NPI']].append(witness)
    originals={r['key']:r for r in baseline};owners=collections.defaultdict(set);malformed=set()
    if len(native['phoneInventory'])!=20554 or len(native['records'])!=19567:raise ValueError('Native CMS inventory changed')
    for row in native['phoneInventory']:
        for value in possible_phones(row['telephone']):
            owners[value].add(row['key'])
            if phone(row['telephone'])!=value:malformed.add(value)
    targets={};excluded=collections.Counter()
    for record in native['records']:
        old=originals[record['key']];value=phone(record['telephone']);loc=locality(record['primaryAddress'])
        if old['status']not in ELIGIBLE:excluded['original-status-ineligible']+=1;continue
        if not active(record)or record['primaryAddress']['country']not in('','US'):excluded['inactive-or-nondomestic']+=1;continue
        if record['primaryAddress']['state']!=old['state']:excluded['native-original-state-conflict']+=1;continue
        if not value or not value.isascii()or not loc:excluded['incomplete-native-phone-or-locality']+=1;continue
        if value in malformed or owners[value]!={record['key']}:excluded['nonunique-complete-cms-phone']+=1;continue
        names=name_variants(record,references)
        if not names:excluded['no-distinctive-complete-native-name']+=1;continue
        targets[record['key']]={'original':old,'record':record,'phone':value,'locality':loc,'names':names}
    if len(targets)!=4015:raise ValueError('Frozen native CMS phone diagnostic target scope changed')
    receipt={'baselineIndexSha256':index_sha,'nativeCmsReportSha256':current_pins()[0],
        'nativeCmsComponentsSha256':current_pins()[1],'nativeOtherNamesReportSha256':other_manifest['reportSha256'],
        'nativeOtherNamesMemberSha256':other['sourceMemberSha256'],'nativeOtherNamesRows':other['completeRowsScanned'],
        'originalPrimaryCount':46791,'nativeOriginalNpiCount':19567,'completeAmbulancePhoneInventoryCount':20554,
        'eligibleTargets':len(targets),'targetScopeSha256':sha(dump(targets)),'excluded':dict(sorted(excluded.items()))}
    return targets,{r['key']:r for r in components},receipt

def frozen_inventory(work):
    raw=(retained_places.EVIDENCE/'original.zip').read_bytes()
    if sha(raw)!=retained_places.ARCHIVE_SHA256:raise ValueError('Frozen ordinary Places source archive changed')
    with zipfile.ZipFile(retained_places.EVIDENCE/'original.zip')as z:
        metadata_raw=z.read('metadata-inventory.json');complete=json.loads(z.read('complete-us-receipt.json'))
        listing=z.read('inventory.xml')
    if sha(metadata_raw)!=SOURCE_INVENTORY_SHA:raise ValueError('Fixed complete Places inventory changed')
    inventory=json.loads(metadata_raw);files=inventory['files']
    if len(files)!=GLOBAL_FILES or sum(f['rows']for f in files)!=GLOBAL_COUNT:raise ValueError('Global fixed Places scope changed')
    if complete['usRows']!=US_COUNT:raise ValueError('Original complete US source receipt changed')
    expected={r['source']['key']:r['sourceFileSha256']for r in complete['files']}
    work.mkdir(parents=True,exist_ok=True);(work/'metadata-inventory.json').write_bytes(metadata_raw)
    (work/'inventory.xml').write_bytes(listing)
    return files,expected

def normal_native(row):
    row=copy.deepcopy(row);number=row.pop('file_row_number')
    geometry=row['geometryWkb'];row['geometryWkb']=bytes(geometry).hex()if not isinstance(geometry,str)else geometry
    return number,row

def native_record(source,digest,number,row):
    return {'sourceFile':source['key'],'sourceEtag':source['etag'],'sourceFileSha256':digest,
            'sourceRowNumber':number,'sourceSha256':sha(encoded(row)),'sourceDigestScope':'canonical-native-record',
            'nativeRecord':row}

def scan_file(source,expected_digest,work,wanted,target_sha):
    import pyarrow as pa
    name=pathlib.PurePosixPath(source['key']).name
    receipt_path=work/'receipts'/(name+'.json');selected_path=work/'phone-selected'/(name+'.json')
    cache=work/'us-native-cache'/name
    if receipt_path.exists():
        receipt=json.loads(receipt_path.read_bytes())
        if(receipt['source']!=source or receipt['targetScopeSha256']!=target_sha or
           sha(selected_path.read_bytes())!=receipt['selectedRecordsSha256']or
           receipt['usRows']and(not cache.exists()or file_sha(cache)!=receipt['cacheSha256'])):
            raise ValueError('Fixed phone scan checkpoint changed')
        return receipt,json.loads(selected_path.read_bytes())
    original,digest=download_original(source,work)
    if expected_digest and digest!=expected_digest:raise ValueError('Full Places source file differs from original retained edition')
    c=connection();c.execute("SET temp_directory='"+str(work/'duckdb-temp').replace("'","''")+"'")
    counts=c.execute("""SELECT count(*),count(*)FILTER(WHERE list_contains(list_transform(addresses,lambda a:a.country),'US')),
        coalesce(sum(array_length(phones)),0) FROM read_parquet(?)""",[str(original)]).fetchall()[0]
    if counts[0]!=source['rows']:raise ValueError('Complete source row count changed')
    c.register('wanted_phones',pa.table({'phone':sorted(wanted)}))
    # This considers every ten-digit window, including conservative malformed
    # phone collisions. The final canonicalization uses the same native parser.
    numbers=[r[0]for r in c.execute("""WITH native_phones AS(
        SELECT p.file_row_number,v.raw_phone,regexp_replace(v.raw_phone,'[^0-9]','','g')AS digits
        FROM read_parquet(?,file_row_number=true)p CROSS JOIN unnest(p.phones)v(raw_phone)
      ), windows AS(
        SELECT file_row_number,substr(digits,n.i,10)AS phone
        FROM native_phones CROSS JOIN unnest(range(1,greatest(length(digits)-8,1)))n(i)
      ) SELECT DISTINCT file_row_number FROM windows JOIN wanted_phones USING(phone) ORDER BY file_row_number""",
        [str(original)]).fetchall()]
    records=[]
    if numbers:
        c.register('selected_numbers',pa.table({'number':numbers}))
        rows=c.execute("""SELECT *EXCLUDE(geometry,file_row_number),ST_AsWKB(geometry)AS geometryWkb,file_row_number
          FROM read_parquet(?,file_row_number=true)WHERE file_row_number IN(SELECT number FROM selected_numbers)
          ORDER BY file_row_number""",[str(original)]).to_arrow_table().to_pylist()
        if len(rows)!=len(numbers):raise ValueError('Complete phone-selected native source rows missing')
        for value in rows:
            number,row=normal_native(value)
            hits=sorted({p for value in row.get('phones')or[]for p in possible_phones(value)}&wanted)
            # SQL intentionally over-selects only; Python exact parsing decides.
            if hits:
                record=native_record(source,digest,number,row);record['matchedPhoneKeys']=hits;records.append(record)
    cache_bytes=0;cache_sha=None;cache_relative=None
    if counts[1]:
        cache.parent.mkdir(parents=True,exist_ok=True);part=cache.with_suffix('.partial');part.unlink(missing_ok=True)
        c.execute("""COPY(SELECT *EXCLUDE(geometry,file_row_number),ST_AsWKB(geometry)AS geometryWkb,file_row_number
          FROM read_parquet(?,file_row_number=true)
          WHERE list_contains(list_transform(addresses,lambda a:a.country),'US'))TO?(FORMAT PARQUET,COMPRESSION ZSTD)""",
          [str(original),str(part)])
        if c.execute('SELECT count(*)FROM read_parquet(?)',[str(part)]).fetchall()[0][0]!=counts[1]:
            raise ValueError('Incomplete full-native US projection')
        # Compare every phone-selected US row against its actual complete file.
        us_records={r['sourceRowNumber']:r for r in records if any(a.get('country')=='US'for a in r['nativeRecord'].get('addresses')or[])}
        if us_records:
            c.register('verify_numbers',pa.table({'number':sorted(us_records)}))
            rows=c.execute('SELECT *FROM read_parquet(?)WHERE file_row_number IN(SELECT number FROM verify_numbers)',
                           [str(part)]).to_arrow_table().to_pylist()
            if len(rows)!=len(us_records):raise ValueError('Missing native projection verification rows')
            for value in rows:
                number,row=normal_native(value)
                if row!=us_records[number]['nativeRecord']:raise ValueError('Full native projection altered an actual source row')
        part.rename(cache);cache_bytes=cache.stat().st_size;cache_sha=file_sha(cache);cache_relative=str(cache.relative_to(work))
    c.close()
    if file_sha(original)!=digest:raise ValueError('Source file changed during complete phone scan')
    selected_path.parent.mkdir(parents=True,exist_ok=True);selected_raw=encoded(records);selected_path.write_bytes(selected_raw)
    receipt={'source':source,'sourceFileSha256':digest,'sourceRows':counts[0],'usRows':counts[1],
        'phoneValuesScanned':counts[2],'targetScopeSha256':target_sha,'selectedRows':len(records),
        'selectedRecordsSha256':sha(selected_raw),'cacheFile':cache_relative,'cacheSha256':cache_sha,'cacheBytes':cache_bytes,
        'digestScope':'complete-US full-native projection, with lossless geometry WKB and actual original row number'}
    receipt_path.parent.mkdir(parents=True,exist_ok=True);receipt_path.write_bytes(encoded(receipt))
    original.unlink();original.with_suffix('.download.json').unlink()
    if shutil.disk_usage(work).free<700_000_000:raise RuntimeError('Complete scan reached required free-space floor')
    print(json.dumps({'stage':'complete-file-phone-scan','sourceRows':counts[0],'usRows':counts[1],
                      'phoneValuesScanned':counts[2],'selectedNativeRows':len(records),'cacheBytes':cache_bytes}),flush=True)
    return receipt,records

def address_signature(address):
    if not isinstance(address,dict)or address.get('state')not in STATES or not address.get('zip'):return None
    street=source_street_line(address.get('street'))
    if not re.match(r'^\d+[A-Z]?(?:[- ]\d+[A-Z]?)?\s+\S',street,re.I):return None
    if re.search(r'\b(?:P\s*\.?\s*O\s*\.?\s*BOX|POST OFFICE BOX|PMB|PRIVATE MAILBOX)\b',street,re.I):return None
    return '|'.join((address['state'],address['zip'],normalize_street(street)))

def identity_observations(targets,records):
    by_phone={t['phone']:t for t in targets.values()}
    if len(by_phone)!=len(targets):raise ValueError('CMS reciprocal uniqueness did not hold')
    owners=collections.defaultdict(set);malformed=set();by_id={};observations=[];seen_phone=set();seen_name=set()
    for record in records:
        row=record['nativeRecord'];native_id=row['id']
        if native_id in by_id and by_id[native_id]!=record:raise ValueError('Native Places ID repeats across complete source rows')
        by_id[native_id]=record
        for p in record['matchedPhoneKeys']:
            owners[p].add(native_id)
            if any(p in possible_phones(value)and phone(value)!=p for value in row.get('phones')or[]):malformed.add(p)
        name=(row.get('names')or{}).get('primary')or''
        actual={p for value in row.get('phones')or[]if(p:=phone(value))}
        for p in sorted(actual&set(by_phone)):
            target=by_phone[p];key=target['original']['key'];seen_phone.add(key)
            basis=target['names'].get(agency_name(name))
            if not basis or not distinctive(name):continue
            seen_name.add(key)
            for ordinal,raw in enumerate(row.get('addresses')or[]):
                address=place_address(raw)
                if locality(address)!=target['locality']:continue
                observations.append({'key':key,'phone':p,'placeNativeId':native_id,
                    'sourceAddressOrdinal':ordinal,'sourceAddress':address,
                    'nativeNameBasis':copy.deepcopy(basis),'record':record})
    for observation in observations:
        p=observation['phone'];observation['completePhoneOwners']=sorted(owners[p])
        observation['completeMalformedPhoneCollision']=p in malformed
        observation['reciprocityPassed']=owners[p]=={observation['placeNativeId']}and p not in malformed
    return observations,{'globalPhonesWithRelevantOwners':len(owners),'identitiesWithExactPhone':len(seen_phone),
                         'identitiesWithPhoneAndCompleteName':len(seen_name)}

def select_address_rows(receipt,work,signatures):
    import pyarrow as pa
    if not receipt['usRows']:return []
    cache=work/receipt['cacheFile']
    if file_sha(cache)!=receipt['cacheSha256']:raise ValueError('US native address-audit projection changed')
    c=connection();c.register('wanted_addresses',pa.table({'signature':sorted(signatures)}))
    def signature(freeform,locality_value,region,postcode,country):
        return address_signature(place_address({'freeform':freeform,'locality':locality_value,'region':region,
                                                'postcode':postcode,'country':country}))
    c.create_function('native_signature',signature,['VARCHAR']*5,'VARCHAR',null_handling='special')
    numbers=[r[0]for r in c.execute("""SELECT DISTINCT p.file_row_number FROM read_parquet(?)p
      CROSS JOIN unnest(p.addresses)x(a)
      JOIN wanted_addresses w ON native_signature(a.freeform,a.locality,a.region,a.postcode,a.country)=w.signature
      ORDER BY p.file_row_number""",[str(cache)]).fetchall()]
    rows=[]
    if numbers:
        c.register('address_numbers',pa.table({'number':numbers}))
        values=c.execute('SELECT *FROM read_parquet(?)WHERE file_row_number IN(SELECT number FROM address_numbers)ORDER BY file_row_number',
                         [str(cache)]).to_arrow_table().to_pylist()
        for value in values:
            number,row=normal_native(value);rows.append(native_record(receipt['source'],receipt['sourceFileSha256'],number,row))
    c.close()
    return rows

def aggregate_reuse(audits):
    buckets={}
    for audit in audits:
        for group in audit['coordinateGroups']:
            bucket=buckets.setdefault(tuple(group['point']),{'rows':0,'addresses':set()})
            bucket['rows']+=group['rows'];bucket['addresses'].update(group['addresses'])
    return {point:{'rows':b['rows'],'addresses':sorted(b['addresses'])}for point,b in buckets.items()}

def hifld_evidence():
    from diagnose_nppes_hifld_phone_sites import verify
    report,manifest=verify()
    if len(report['qualifiedSiteGroups'])!=157:raise ValueError('Historical HIFLD corroboration scope changed')
    return {g['key']:g for g in report['qualifiedSiteGroups']},manifest

def evaluate(targets,components,observations,address_records,groups,hifld):
    identities={r['GEOID']:r['USPS']for r in json.loads((ROOT/'scripts/fixtures/census-2026-county-identities.json').read_bytes())['counties']if r['USPS']in STATES}
    counties=geometry_index(json.loads(BOUNDARY.read_bytes()),identities)
    by_address=collections.defaultdict(list)
    for record in address_records:
        row=record['nativeRecord']
        for ordinal,raw in enumerate(row.get('addresses')or[]):
            address=place_address(raw);signature=address_signature(address)
            if signature:by_address[signature].append((record,ordinal,address))
    outcomes=collections.Counter();clean=[];all_results=[]
    for observation in observations:
        target=targets[observation['key']];original=target['original'];record=observation['record']
        address=observation['sourceAddress'];point=point_diagnosis(record,address,original,groups,counties)
        reasons=list(point['reasons'])
        if not observation['reciprocityPassed']:reasons.append('nonreciprocal-complete-global-places-phone')
        endpoints=[];positive=[];native_exclusions=[]
        for witness,ordinal,native_address in by_address.get(address_signature(address),[]):
            native=witness['nativeRecord'];quality=source_block_reason(native)or projected_quality_reason(native)
            if quality:
                native_exclusions.append({'nativeId':native['id'],'reason':quality});continue
            # Same street/state/known ZIP permits source city aliases. The city
            # remains exactly as reported in every retained witness.
            try:position=wkb_point(native['geometryWkb'])
            except(TypeError,ValueError):position=None
            if position is None:positive.append('invalid-native-address-endpoint');continue
            county,_=county_for(position,counties[native_address['state']])
            if not county or county!=point['countyFips']or original.get('sourceCounty')and county!=original['sourceCounty']:
                positive.append('source-address-endpoint-county-conflict')
            reuse=groups.get(coordinate_key(position))
            if reuse is None:raise ValueError('Missing complete-US address-endpoint reuse audit')
            if len(distinct_fingerprints(reuse['addresses']))!=1:positive.append('source-address-endpoint-coordinate-reuse')
            endpoints.append({'nativeId':native['id'],'sourceFile':witness['sourceFile'],'sourceRowNumber':witness['sourceRowNumber'],
                'sourceAddressOrdinal':ordinal,'sourceAddress':native_address,'coordinatesAsReported':position,'countyFips':county,
                'nativeRecordSha256':witness['sourceSha256']})
        if not endpoints and not reasons:raise ValueError('Qualified selected point has no complete source address endpoints')
        if not reasons and not any(e['nativeId']==observation['placeNativeId']and e['coordinatesAsReported']==point['coordinatesAsReported']for e in endpoints):
            raise ValueError('Selected Places point is absent from native address endpoint set')
        if endpoints and not points_agree([e['coordinatesAsReported']for e in endpoints]):
            positive.append('source-address-endpoints-disagree')
        reasons.extend(positive);historical=[];historical_conflict=[]
        historic=hifld.get(observation['key'])
        if historic:
            if historic['nativePhone']!=target['phone']:raise ValueError('Historical corroboration changed native primary phone')
            for witness in historic['sourceObservations']:
                match=witness['match']
                if not same_address(address,match['sourceAddress']):continue
                historical.append(copy.deepcopy(witness))
                historic_point=[match['latitude'],match['longitude']]
                if point['coordinatesAsReported']is not None and(not points_agree([point['coordinatesAsReported'],historic_point])or
                    match['point']['countyFips']!=point['countyFips']):
                    historical_conflict.append('historical-same-address-point-disagreement')
        result={**copy.deepcopy(observation),'originalPrimary':copy.deepcopy(original),
                'cmsPrimaryAddressAsReported':copy.deepcopy(target['record']['primaryAddress']),
                'nativeCmsRecordSha256':target['record']['nativeRecordSha256'],'pointChecks':point,
                'sourceAddressNativeEndpoints':endpoints,'sourceAddressWithheldNativeRows':native_exclusions,
                'qualifiedSourceAddressConflictReasons':sorted(set(positive)),
                'streetCorroboration':street_basis(original,components.get(observation['key']),address),
                'historicalHifldObservations':historical,'historicalSameAddressConflictReasons':sorted(set(historical_conflict)),
                'exclusions':sorted(set(reasons)),'association':'inferred','endUserValidationRequired':True,
                'sourceRole':'reported-place-address','primarySiteRoleConfirmed':False,
                'crossSourcePrimaryEligibilityEvaluated':False,'mappedCandidate':False}
        all_results.append(result)
        if reasons:outcomes.update(set(reasons))
        else:clean.append(result)
    return all_results,clean,outcomes

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--work',type=pathlib.Path,required=True)
    parser.add_argument('--summary-output',type=pathlib.Path,default=SUMMARY_OUTPUT);a=parser.parse_args()
    work=a.work;targets,components,input_receipt=input_scope();files,expected=frozen_inventory(work)
    wanted={t['phone']for t in targets.values()};(work/'input-scope.json').write_bytes(dump({'receipt':input_receipt,'targets':targets}))
    print(json.dumps({'stage':'fixed-source-plan','globalFiles':len(files),'globalRows':GLOBAL_COUNT,
        'globalSourceBytes':sum(f['size']for f in files),'expectedUSRows':US_COUNT,'eligibleOriginalTargets':len(targets)}),flush=True)
    receipts=[];records=[]
    for source in files:
        receipt,selected=scan_file(source,expected.get(source['key']),work,wanted,input_receipt['targetScopeSha256'])
        receipts.append(receipt);records.extend(selected)
    if sum(r['sourceRows']for r in receipts)!=GLOBAL_COUNT or sum(r['usRows']for r in receipts)!=US_COUNT:
        raise ValueError('Complete fixed global/US phone scan did not finish')
    observations,discovery=identity_observations(targets,records)
    signatures={s for o in observations if(s:=address_signature(o['sourceAddress']))}
    address_records=[]
    if signatures:
        for receipt in receipts:address_records.extend(select_address_rows(receipt,work,signatures))
    selected_identity={(r['sourceFile'],r['sourceRowNumber']):r for r in address_records}
    for observation in observations:
        if not physical_address(observation['sourceAddress']):continue
        record=observation['record'];found=selected_identity.get((record['sourceFile'],record['sourceRowNumber']))
        if found is None or found['nativeRecord']!=record['nativeRecord']:raise ValueError('Complete address scan lost a native phone record')
    points=set()
    for record in address_records:
        row=record['nativeRecord']
        if source_block_reason(row)or projected_quality_reason(row):continue
        try:point=wkb_point(row['geometryWkb'])
        except(TypeError,ValueError):point=None
        if point is not None:points.add(coordinate_key(point))
    audits=[reuse_one(r,work,sorted(points))for r in receipts if r['usRows']]
    if sum(audit['usRowsScanned']for audit in audits)!=US_COUNT:raise ValueError('Incomplete national coordinate-reuse audit')
    groups=aggregate_reuse(audits);historical,hifld_manifest=hifld_evidence()
    results,clean,outcomes=evaluate(targets,components,observations,address_records,groups,historical)
    summary={'schemaVersion':1,'profile':PROFILE,'release':RELEASE,'collectionDate':DATE,
        'originalPrimaryCount':46791,'completeNativeAmbulancePhoneInventory':20554,
        'eligibleBaselineUnmappedOriginalCmsIdentities':len(targets),'completeGlobalPlacesFiles':GLOBAL_FILES,
        'completeGlobalPlacesRowsScanned':GLOBAL_COUNT,'completeUSAddressBearingPlacesRows':US_COUNT,
        'completeGlobalPhoneValuesScanned':sum(r['phoneValuesScanned']for r in receipts),
        'phoneReciprocityScope':'all fixed global Places rows; stricter than complete US scope',
        'fullPlacesPhoneScanComplete':True,'completeUSCoordinateReuseAudit':True,
        'nativeSourceAddressEndpointAuditComplete':True,**discovery,
        'identitiesWithExactPhoneCompleteNameLocality':len({o['key']for o in observations}),
        'identitiesWithCompleteReciprocalPlacePhone':len({o['key']for o in observations if o['reciprocityPassed']}),
        'identitiesPassingPlacesSourceChecks':len({o['key']for o in clean}),
        'identitiesWithCorroboratedOriginalOrNativeComponentStreet':len({o['key']for o in clean if o['streetCorroboration']['rule']!='primary-street-not-corroborated'}),
        'identitiesWithoutCorroboratedPrimaryStreet':len({o['key']for o in clean if o['streetCorroboration']['rule']=='primary-street-not-corroborated'}),
        'nativeEndpointRowsAudited':len(address_records),'sourceExclusions':dict(sorted(outcomes.items())),
        'primaryStreetCorroboration':dict(sorted(collections.Counter(o['streetCorroboration']['rule']for o in clean).items())),
        'historicalHifldQualifiedGroupScope':len(historical),
        'identitiesWithSameHistoricalHifldAddress':len({o['key']for o in clean if o['historicalHifldObservations']}),
        'identitiesWithHistoricalSameAddressCoordinateConflict':len({o['key']for o in clean if o['historicalSameAddressConflictReasons']}),
        'historicalHifldContactDates':dict(sorted(collections.Counter(str(w['nativeContactDate'])for o in clean for w in o['historicalHifldObservations']).items())),
        'registeredPrimarySiteRoleConfirmed':False,'finalNonphoneOverlapEvaluated':False,
        'qualifiedMappingCount':None,'publication':'aggregate diagnostic only; no mapping or coverage authorization',
        'existenceConfidencePolicy':'reported confidence at least0.9; existence confidence is not positional accuracy',
        'lifecyclePolicy':'reported-open; source role is a reported place address',
        'newRecordLevelOutputExported':False}
    full={'summary':summary,'inputReceipt':input_receipt,'sourceFiles':receipts,'phoneRecords':records,
        'addressRecords':address_records,'coordinateAudit':audits,'observations':results,
        'historicalHifldReportSha256':hifld_manifest['reportSha256']}
    (work/'full-diagnostic.json').write_bytes(dump(full))
    audit={'schemaVersion':1,'release':RELEASE,'sourceInventorySha256':SOURCE_INVENTORY_SHA,
        'inputScopeSha256':input_receipt['targetScopeSha256'],'nativeCmsReportSha256':input_receipt['nativeCmsReportSha256'],
        'nativeOtherNamesReportSha256':input_receipt['nativeOtherNamesReportSha256'],
        'historicalHifldReportSha256':hifld_manifest['reportSha256'],
        'diagnosticCodeSha256':digest_file(pathlib.Path(__file__)),'localDiagnosticSha256':sha(dump(full)),
        'files':[{'sourceFile':r['source']['key'],'sourceEtag':r['source']['etag'],'sourceFileSha256':r['sourceFileSha256'],
                  'sourceBytes':r['source']['size'],'globalRows':r['sourceRows'],'usRows':r['usRows'],
                  'phoneValuesScanned':r['phoneValuesScanned'],'selectedRowCount':r['selectedRows'],
                  'cacheSha256':r['cacheSha256'],'cacheBytes':r['cacheBytes']}for r in receipts]}
    a.summary_output.mkdir(parents=True,exist_ok=True)
    (a.summary_output/'summary.json').write_bytes(dump(summary))
    (a.summary_output/'source-audit.json').write_bytes(dump(audit))
    print(json.dumps(summary,sort_keys=True),flush=True)

if __name__=='__main__':main()

