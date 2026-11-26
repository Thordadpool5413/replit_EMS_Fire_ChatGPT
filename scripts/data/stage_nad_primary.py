#!/usr/bin/env python3
"""Match the complete pinned public NAD archive locally and audit reused points.

No provider address is transmitted. Both scans consume the complete native ZIP
member with CRC/size/decoder checks. Bounded native rows and reuse witnesses are
retained with the full-archive SHA, so publication never relies on a count alone.
"""
import argparse,collections,copy,csv,functools,io,json,math,pathlib,re,tempfile,zipfile
from address_normalization import normalize_street,normalized_city,source_street_line,physical_address
from backfill_provider_locations import ROOT,PUBLIC,STATES,sha,digest_file
from build_neris_station_map import BOUNDARY,geometry_index,county_for
from checked_zip_member import open_checked_member
from recover_nad_locations import county_index,county_key,PLACEMENTS

DOWNLOAD='https://data.transportation.gov/api/views/fc2s-wawr/files/596a301b-d548-4589-8c63-6b6a8dc34f30?download=true&filename=TXT.zip'
ARCHIVE_SHA='efac5c350b4fefc9412b601e54f4a26e740049b251a6f9136ea5cc0f86a4ca83'
SOURCE_COUNT=99226272
FIELDS=('OID_','AddNo_Full','StNam_Full','State','Zip_Code','Post_City','Inc_Muni','County','Placement','AddrClass','Lifecycle','NAD_Source','AddAuth','Latitude','Longitude')
ALLOWED_PLACEMENTS=PLACEMENTS|{'Unknown','Other'}
EVIDENCE=ROOT/'scripts/data/evidence/primary-nad-rebuilt/2026-11-26'

def dump(x):return (json.dumps(x,sort_keys=True,ensure_ascii=True,separators=(',',':'),allow_nan=False)+'\n').encode()
def load_primary():
    from primary_recovery_baseline import load_primary_baseline
    _, entries, baseline_sha = load_primary_baseline()
    return entries, baseline_sha

def native_rows(archive,receipt):
    with zipfile.ZipFile(archive) as z:
        members=[m for m in z.infolist() if not m.is_dir() and pathlib.PurePosixPath(m.filename).suffix.lower() in ('.csv','.txt') and m.file_size>1_000_000]
        if len(members)!=1:raise ValueError('Expected one complete native NAD table')
        m=members[0];receipt.update(member=m.filename,memberBytes=m.file_size,memberCrc32=f'{m.CRC:08x}',compressionMethod=m.compress_type)
        with open_checked_member(archive,z,m) as raw,io.TextIOWrapper(raw,encoding='utf-8-sig',newline='') as f:
            first=f.readline(65536);formats=[]
            for delimiter in (',','\t','|'):
                header=next(csv.reader([first],delimiter=delimiter,strict=True))
                if set(FIELDS)<=set(header) and len(header)==len(set(header)):formats.append((delimiter,header))
            if len(formats)!=1:raise ValueError('NAD native schema changed')
            delimiter,header=formats[0];positions={field:header.index(field) for field in FIELDS}
            receipt['nativeFields']=header;csv.field_size_limit(1_000_000);count=0
            for count,row in enumerate(csv.reader(f,delimiter=delimiter,strict=True),1):
                if len(row)!=len(header):raise ValueError('Malformed native NAD row')
                yield count,row,positions
                if count%5_000_000==0:print('NAD full-source rows',count,flush=True)
            if count!=SOURCE_COUNT:raise ValueError(f'Incomplete pinned NAD release: {count}')
            receipt['rowsScanned']=count
    receipt['completeMemberVerified']=True

def native_point(record):
    try:y,x=float(record['Latitude']),float(record['Longitude'])
    except (ValueError,TypeError):return None
    return (y,x) if math.isfinite(y) and math.isfinite(x) and abs(y)<=90 and abs(x)<=180 and (y or x) else None
def coordinate_key(point):return tuple(round(v,7) for v in point)
def native_street(record):return (record['AddNo_Full']+' '+record['StNam_Full']).strip()
def native_signature(record):return record['State'],normalize_street(native_street(record))
def coordinate_signature(record):
    postal=record['Zip_Code'].strip();postal=postal[:5] if re.fullmatch(r'\d{5}(?:-?\d{4})?',postal) else ''
    return (*native_signature(record),postal)
def distance(a,b):
    y1,x1=map(math.radians,a);y2,x2=map(math.radians,b)
    h=math.sin((y2-y1)/2)**2+math.cos(y1)*math.cos(y2)*math.sin((x2-x1)/2)**2
    return 12742000*math.asin(min(1,math.sqrt(h)))

def eligible_target(e):return e['status'] in ('no-match','unavailable','pending','not-eligible') and physical_address(e.get('address'))
def target_digest(entries):return sha(dump([{'key':e['key'],'address':e['address'],'sourceCounty':e['sourceCounty'],'originalPrimaryKey':e.get('originalPrimaryKey')} for e in entries if eligible_target(e)]))
def scan(archive,entries,directory):
    directory.mkdir(parents=True,exist_ok=True)
    if digest_file(archive)!=ARCHIVE_SHA:raise ValueError('Pinned NAD archive SHA mismatch')
    targets={(e['state'],normalize_street(source_street_line(e['address']['street']))) for e in entries if eligible_target(e)}
    house_numbers=collections.defaultdict(set)
    for state,street in targets:house_numbers[state].add(street.split(' ',1)[0])
    retained=[];coords=set();first={}
    for ordinal,row,col in native_rows(archive,first):
        state=row[col['State']]
        number=row[col['AddNo_Full']].upper().strip().split()
        if not number or number[0] not in house_numbers.get(state,set()):continue
        street=normalize_street(row[col['AddNo_Full']]+' '+row[col['StNam_Full']])
        if (state,street) not in targets:continue
        record={f:row[col[f]] for f in FIELDS}
        retained.append({'sourceRowNumber':ordinal,'native':record})
        point=native_point(record)
        if point:coords.add(coordinate_key(point))
    (directory/'native-matches.json').write_bytes(dump(retained));(directory/'address-scan.json').write_bytes(dump(first))
    witnesses=[];second={};witness_counts=collections.Counter();witness_signatures=collections.defaultdict(set)
    for ordinal,row,col in native_rows(archive,second):
        try:point=(float(row[col['Latitude']]),float(row[col['Longitude']]))
        except ValueError:continue
        if not all(math.isfinite(v) for v in point) or coordinate_key(point) not in coords:continue
        key=coordinate_key(point);witness_counts[key]+=1
        record={f:row[col[f]] for f in FIELDS};signature=coordinate_signature(record)
        # Two distinct addresses prove the coordinate unusable. Retaining every
        # duplicate at a bad centroid is unnecessary; the complete scan continues.
        if signature not in witness_signatures[key] and len(witness_signatures[key])<2:
            witness_signatures[key].add(signature)
            witnesses.append({'sourceRowNumber':ordinal,'native':record})
    (directory/'coordinate-witnesses.json').write_bytes(dump(witnesses));(directory/'coordinate-scan.json').write_bytes(dump(second))
    (directory/'coordinate-audit-counts.json').write_bytes(dump([{'coordinate':list(k),'nativeRowsAtCoordinate':v,'distinctAddressCountAtLeast':len(witness_signatures[k])} for k,v in sorted(witness_counts.items())]))
    receipt={'schemaVersion':1,'sourceUrl':DOWNLOAD,'sourceArchiveSha256':ARCHIVE_SHA,'sourceArchiveBytes':archive.stat().st_size,
             'targetsSha256':target_digest(entries),
             'collectionDate':'2026-11-26','addressScan':first,'coordinateScan':second,
             'retainedNativeRows':len(retained),'retainedCoordinateWitnesses':len(witnesses),
             'files':{f:sha((directory/f).read_bytes()) for f in ['native-matches.json','address-scan.json','coordinate-witnesses.json','coordinate-scan.json','coordinate-audit-counts.json']}}
    (directory/'scan-receipt.json').write_bytes(dump(receipt));return receipt

def read_source(directory):
    receipt=json.loads((directory/'scan-receipt.json').read_bytes())
    if receipt['sourceArchiveSha256']!=ARCHIVE_SHA or any(receipt[k]['rowsScanned']!=SOURCE_COUNT or not receipt[k]['completeMemberVerified'] for k in ('addressScan','coordinateScan')):raise ValueError('Incomplete source scan receipt')
    expected={'native-matches.json','address-scan.json','coordinate-witnesses.json','coordinate-scan.json','coordinate-audit-counts.json'}
    if set(receipt.get('files',{}))!=expected:raise ValueError('Incomplete retained source file inventory')
    for file,digest in receipt['files'].items():
        if sha((directory/file).read_bytes())!=digest:raise ValueError('Retained native source changed')
    if any(json.loads((directory/file).read_bytes())!=receipt[key] for file,key in [('address-scan.json','addressScan'),('coordinate-scan.json','coordinateScan')]):raise ValueError('Source scan receipt differs from retained scans')
    rows=json.loads((directory/'native-matches.json').read_bytes());witnesses=json.loads((directory/'coordinate-witnesses.json').read_bytes())
    if len(rows)!=receipt['retainedNativeRows'] or len(witnesses)!=receipt['retainedCoordinateWitnesses']:raise ValueError('Native retention row count changed')
    for records in (rows,witnesses):
        ids=set();ordinals=set()
        for row in records:
            n=row['native'];ordinal=row['sourceRowNumber']
            if set(n)!=set(FIELDS) or type(ordinal) is not int or not 1<=ordinal<=SOURCE_COUNT or ordinal in ordinals or n['OID_'] in ids:raise ValueError('Invalid or repeated retained native row')
            ids.add(n['OID_']);ordinals.add(ordinal)
    return receipt,rows,witnesses

def locality(target,record):
    postal=record['Zip_Code'].strip();postal=postal[:5] if re.fullmatch(r'\d{5}(?:-?\d{4})?',postal) else ''
    cities=[(f,record[f].strip()) for f in ('Post_City','Inc_Muni')]
    same=next(((f,c) for f,c in cities if c and normalized_city(c)==normalized_city(target['city'])),None)
    if postal==target['zip']:
        field,city=same or next(((f,c) for f,c in cities if c),('Post_City',''))
        return ('normalized-street-city-state-zip' if same else 'normalized-street-state-zip'),{'street':native_street(record),'city':city,'state':record['State'],'zip':postal},field
    if same:
        field,city=same
        return 'normalized-street-city-state',{'street':native_street(record),'city':city,'state':record['State'],'zip':postal},field
    return None

def make_candidates(directory,entries,baseline_hash):
    receipt,rows,witnesses=read_source(directory);source_index=collections.defaultdict(list);reuse=collections.defaultdict(set)
    if receipt.get('targetsSha256')!=target_digest(entries):raise ValueError('Native NAD scan belongs to different address targets')
    identities=json.loads((ROOT/'scripts/fixtures/census-2026-county-identities.json').read_bytes())['counties']
    boundaries=geometry_index(json.loads(BOUNDARY.read_bytes()),{c['GEOID']:c['USPS'] for c in identities if c['USPS'] in STATES})
    counties=county_index(identities);county_cache={};outcomes=collections.Counter();candidates=[];rejected=[]
    for row in rows:source_index[native_signature(row['native'])].append(row)
    for row in witnesses:
        p=native_point(row['native'])
        if p and native_street(row['native']):reuse[coordinate_key(p)].add(coordinate_signature(row['native']))
    for entry in entries:
        if not eligible_target(entry):continue
        a=entry['address'];key=(a['state'],normalize_street(source_street_line(a['street'])))
        pool=[(row,locality(a,row['native'])) for row in source_index.get(key,[])]
        pool=[v for v in pool if v[1]]
        zip_pool=[v for v in pool if v[1][0]!='normalized-street-city-state']
        if zip_pool:pool=zip_pool
        accepted=[];reasons=set()
        for row,(basis,source_address,city_field) in pool:
            n=row['native'];p=native_point(n)
            if n['Lifecycle'] not in ('','Active'):reasons.add('nonactive-lifecycle');continue
            if n['AddrClass']!='Numbered Thoroughfare Address' or n['Placement'] not in ALLOWED_PLACEMENTS or not p:reasons.add('unsupported-source-point');continue
            if len(reuse[coordinate_key(p)])!=1:reasons.add('coordinate-reused-across-distinct-addresses');continue
            if not re.fullmatch(r'[1-9]\d{0,11}',n['OID_']):raise ValueError('Invalid native NAD object ID')
            authority=n['NAD_Source'].strip() or n['AddAuth'].strip()
            if not authority or len(authority)>150:reasons.add('missing-source-authority');continue
            cache_key=(a['state'],p)
            if cache_key not in county_cache:county_cache[cache_key]=county_for(p,boundaries[a['state']])[0]
            county=county_cache[cache_key];reported=counties.get((a['state'],county_key(n['County'])),set())
            if not county:reasons.add('point-county-unresolved');continue
            if entry['sourceCounty'] and county!=entry['sourceCounty']:reasons.add('original-source-county-disagreement');continue
            if reported and county not in reported:reasons.add('native-source-county-disagreement');continue
            point={'objectId':int(n['OID_']),'release':'2026-09-30','dataset':'bulk-r24','authority':authority,'placement':n['Placement'],'countyFips':county,
                   'sourceArchiveSha256':ARCHIVE_SHA,'sourceRowNumber':row['sourceRowNumber'],'nativeRecordSha256':sha(dump(n)),
                   'sourceCityField':city_field,'sourceCountyName':n['County'],'lifecycle':n['Lifecycle'],'addressClass':n['AddrClass'],'coordinatesAsReported':list(p)}
            match={'method':'nad-address-point','latitude':p[0],'longitude':p[1],'sourceAddress':source_address,'matchBasis':basis,
                   'matchedAddress':', '.join((source_street_line(source_address['street']),source_address['city'],source_address['state'],source_address['zip'])),'point':point}
            accepted.append((p,county,match))
        # An explicit rejected status, shared location, or county conflict is
        # retained as a veto; no good-looking row silently overrides it.
        if reasons:
            outcomes['withheld:'+','.join(sorted(reasons))]+=1;rejected.append({'key':entry['key'],'originalAddress':copy.deepcopy(a),'reasons':sorted(reasons),'eligibleNativePoints':[v[2] for v in accepted]});continue
        if not accepted:outcomes['no-source-match']+=1;continue
        if len({v[1] for v in accepted})!=1 or any(distance(v[0],w[0])>75 for i,v in enumerate(accepted) for w in accepted[i+1:]):
            outcomes['conflicting-native-points']+=1;rejected.append({'key':entry['key'],'originalAddress':copy.deepcopy(a),'reasons':['conflicting-native-points'],'eligibleNativePoints':[v[2] for v in accepted]});continue
        chosen=min(accepted,key=lambda v:(v[2]['point']['placement'] in {'Unknown','Other'},v[2]['point']['objectId']))
        candidates.append({'key':entry['key'],'source':entry['source'],'state':entry['state'],'originalAddress':copy.deepcopy(a),'address':copy.deepcopy(a),'sourceCounty':entry['sourceCounty'],'countyFips':chosen[1],'match':chosen[2]})
        outcomes['candidates']+=1
    diagnostic_keys={e['key'] for e in entries if e.get('originalPrimaryKey')}
    return {'schemaVersion':1,'source':'nad-bulk-r24','sourceArchiveSha256':ARCHIVE_SHA,'baselineIndexSha256':baseline_hash,'originalPrimaryCount':46791,
            'additionalDiagnosticTargets':len(diagnostic_keys),'sourceCount':SOURCE_COUNT,'scanReceiptSha256':sha((directory/'scan-receipt.json').read_bytes()),'outcomes':dict(sorted(outcomes.items())),
            'candidates':[c for c in candidates if c['key'] not in diagnostic_keys],'diagnosticCandidates':[c for c in candidates if c['key'] in diagnostic_keys],'rejected':rejected}

def retain(directory,entries,baseline_hash,report,evidence):
    evidence.mkdir(parents=True,exist_ok=True);files=['scan-receipt.json','native-matches.json','address-scan.json','coordinate-witnesses.json','coordinate-scan.json','coordinate-audit-counts.json']
    with zipfile.ZipFile(evidence/'original.zip','w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for name in files:z.write(directory/name,name)
        z.writestr('inputs.json',dump({'entries':entries,'baselineIndexSha256':baseline_hash}));z.writestr('report.json',dump(report))
    candidate_bytes=dump(report['candidates']);(evidence/'candidates.json').write_bytes(candidate_bytes)
    manifest={'sourceArchiveSha256':ARCHIVE_SHA,'sourceCount':SOURCE_COUNT,'archiveSha256':digest_file(evidence/'original.zip'),'candidatesSha256':sha(candidate_bytes),'candidateCount':len(report['candidates']),'reportSha256':sha(dump(report))}
    (evidence/'manifest.json').write_bytes(dump(manifest));return manifest

def verify(evidence=EVIDENCE):
    manifest=json.loads((evidence/'manifest.json').read_bytes())
    if manifest['sourceArchiveSha256']!=ARCHIVE_SHA or manifest['sourceCount']!=SOURCE_COUNT or digest_file(evidence/'original.zip')!=manifest['archiveSha256']:raise ValueError('NAD retained archive provenance changed')
    expected={'scan-receipt.json','native-matches.json','address-scan.json','coordinate-witnesses.json','coordinate-scan.json','coordinate-audit-counts.json','inputs.json','report.json'}
    with tempfile.TemporaryDirectory(prefix='atlas-nad-replay-') as td:
        directory=pathlib.Path(td)
        with zipfile.ZipFile(evidence/'original.zip') as z:
            if set(z.namelist())!=expected or len(z.namelist())!=len(expected) or any(m.file_size>500_000_000 for m in z.infolist()):raise ValueError('Invalid NAD retained archive membership')
            z.extractall(directory)
        inputs=json.loads((directory/'inputs.json').read_bytes());raw=(directory/'report.json').read_bytes()
        originals=[e for e in inputs['entries'] if not e.get('originalPrimaryKey')]
        if len(originals)!=46791 or len({e['key'] for e in originals})!=46791 or len({e['key'] for e in inputs['entries']})!=len(inputs['entries']) or sha(raw)!=manifest['reportSha256']:raise ValueError('NAD original input or report changed')
        report=make_candidates(directory,inputs['entries'],inputs['baselineIndexSha256'])
        if dump(report)!=raw:raise ValueError('Retained native NAD rows and reuse witnesses do not replay')
        candidates=(evidence/'candidates.json').read_bytes()
        if candidates!=dump(report['candidates']) or sha(candidates)!=manifest['candidatesSha256'] or len(report['candidates'])!=manifest['candidateCount']:raise ValueError('NAD runtime candidates differ from native replay')
    return manifest

@functools.lru_cache(maxsize=1)
def candidate_index():
    verify()
    m=json.loads((EVIDENCE/'manifest.json').read_bytes());raw=(EVIDENCE/'candidates.json').read_bytes()
    if m['sourceArchiveSha256']!=ARCHIVE_SHA or m['sourceCount']!=SOURCE_COUNT or sha(raw)!=m['candidatesSha256']:raise ValueError('NAD retained candidate binding changed')
    rows=json.loads(raw);index={r['key']:r for r in rows}
    if len(index)!=len(rows) or len(rows)!=m['candidateCount']:raise ValueError('NAD candidate identity count changed')
    return index

def validate_nad_primary_entry(entry):
    row=candidate_index().get(entry.get('key'))
    return bool(row and entry.get('status')=='mapped' and all(entry.get(k)==row.get(k) for k in ('key','source','state','address','sourceCounty','countyFips','match')))

@functools.lru_cache(maxsize=4)
def diagnostic_candidate_index(evidence=EVIDENCE):
    verify(evidence)
    with zipfile.ZipFile(evidence/'original.zip') as z:
        report=json.loads(z.read('report.json'));inputs=json.loads(z.read('inputs.json'))
    candidates={r['key']:r for r in report['diagnosticCandidates']}
    targets={r['key']:r for r in inputs['entries'] if r.get('originalPrimaryKey')}
    return candidates,targets

def validate_diagnostic_candidate(candidate,target,evidence=EVIDENCE):
    try:
        candidates,targets=diagnostic_candidate_index(evidence)
        return candidate==candidates.get(target['key']) and target==targets.get(target['key'])
    except (ValueError,KeyError,TypeError,OSError,zipfile.BadZipFile):return False

def main():
    p=argparse.ArgumentParser();p.add_argument('--archive',type=pathlib.Path);p.add_argument('--directory',type=pathlib.Path);p.add_argument('--report',type=pathlib.Path);p.add_argument('--extra-targets',type=pathlib.Path);p.add_argument('--scan',action='store_true');p.add_argument('--retain',action='store_true');p.add_argument('--verify',action='store_true');p.add_argument('--evidence',type=pathlib.Path,default=EVIDENCE);a=p.parse_args()
    if a.verify:print('NAD retained replay passed:',json.dumps(verify(a.evidence)),flush=True);return
    if not a.directory or not a.report:p.error('--directory and --report are required for source staging')
    entries,baseline=load_primary()
    if a.extra_targets:
        extra=json.loads(a.extra_targets.read_bytes());original={e['key']:e for e in entries}
        if not isinstance(extra,list):raise ValueError('Diagnostic targets must be an explicit list')
        for e in extra:
            base=original.get(e.get('originalPrimaryKey'))
            if not base or not e['key'].startswith(base['key']+'@') or any(e[k]!=base[k] for k in ('name','state','source','sourceCounty')) or not eligible_target(e):raise ValueError('Diagnostic address target lacks original primary identity binding')
        if len({e['key'] for e in entries+extra})!=len(entries+extra):raise ValueError('Duplicate primary or diagnostic target')
        entries.extend(extra)
    if a.scan:
        if not a.archive:p.error('--archive is required for full scans')
        scan(a.archive,entries,a.directory)
    report=make_candidates(a.directory,entries,baseline);a.report.parent.mkdir(parents=True,exist_ok=True);a.report.write_bytes(dump(report))
    if a.retain:
        retain(a.directory,entries,baseline,report,a.evidence)
        print('Retained NAD:',json.dumps(verify(a.evidence)),flush=True)
    print('NAD outcomes:',json.dumps(report['outcomes']),flush=True)

if __name__=='__main__':main()
