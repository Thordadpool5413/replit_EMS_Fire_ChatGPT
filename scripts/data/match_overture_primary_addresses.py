#!/usr/bin/env python3
"""Local exact-address joins and complete-US coordinate reuse for Overture.

The public download requests contain only fixed file names and byte offsets.
The national provider inventory is never sent to a geocoding service.
"""
import argparse
import collections
import concurrent.futures
import functools
import hashlib
import json
import math
import pathlib
import re
import struct

from address_normalization import address_key, normalize_street, normalized_city, physical_address, source_street_line
from backfill_provider_locations import PUBLIC, ROOT, STATES
from build_neris_station_map import BOUNDARY, county_for, geometry_index
from stage_overture_primary_addresses import BASE, DATE, RELEASE, US_COUNT, connection, download_original, encoded, file_sha, metadata, sha

STATE_NAMES = dict(zip(('Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|District of Columbia|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming').upper().split('|'), 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split()))


def wkb_point(value):
    b=bytes.fromhex(value) if isinstance(value,str) else bytes(value)
    if len(b)!=21 or b[0] not in (0,1): return None
    _,kind,x,y=struct.unpack(('<' if b[0] else '>')+'BIdd',b)
    if kind!=1 or not all(math.isfinite(v) for v in (x,y)) or not -180<=x<=180 or not -90<=y<=90 or (x,y)==(0,0): return None
    return [y,x]


def source_address(row):
    levels=row.get('address_levels') or []
    if len(levels)!=2 or any(not isinstance(v,dict) for v in levels): return None
    state=normalized_city(levels[0].get('value'))
    state=STATE_NAMES.get(state,state)
    if state not in STATES: return None
    city=row.get('postal_city') or levels[1].get('value') or ''
    postal=str(row.get('postcode') or '').strip()
    postal5=postal[:5] if re.fullmatch(r'\d{5}(?:-\d{4})?',postal) else ''
    return {'street':' '.join(v for v in (row.get('number'),row.get('street')) if v),
            'city':city,'state':state,'zip':postal5}


def source_block_reason(row):
    sources=row.get('sources')
    if not isinstance(sources,list) or not sources: return 'missing-native-attribution'
    # Overture omits native NAD lifecycle/placement fields. This wrapper must
    # never turn a rejected NAD record into a new apparently independent point.
    labels=' '.join(str(s.get(k) or '') for s in sources for k in ('provider','resource','dataset')).lower()
    if re.search(r'\bnad\b|national.?address.?database|usdot|us_dot|us_department_of_transportation',labels):
        return 'native-nad-status-not-retained'
    licenses=' '.join(str(s.get('license') or '') for s in sources).lower()
    if re.search(r'non.?commercial|no.?derivatives|all rights reserved|no redistribution|cc-by-nc|cc-by-nd',licenses):
        return 'explicit-reuse-restriction'
    return None


def load_targets(locations, extra=None):
    raw=(locations/'index.json').read_bytes();index=json.loads(raw)
    entries=[]
    for chunk in index['chunks']:
        b=(locations/chunk['file']).read_bytes()
        if sha(b)!=chunk['sha256']: raise ValueError('Primary source shard changed')
        entries.extend(json.loads(b))
    if len(entries)!=46_791 or len({e['key'] for e in entries})!=len(entries): raise ValueError('Primary denominator changed')
    targets=[e for e in entries if e['status'] in ('no-match','unavailable','pending') and physical_address(e['address'])]
    if extra:
        targets.extend(json.loads(extra.read_bytes()))
    if len({e['key'] for e in targets})!=len(targets): raise ValueError('Duplicate target keys')
    return {'locationIndexSha256':sha(raw),'targetsSha256':sha(encoded(targets)),'targets':targets}


def matching_targets(source, by_zip, by_city):
    a=source_address(source)
    if not a: return []
    full=normalize_street(source_street_line(a['street']))
    matched=[]
    for t in by_zip.get((a['state'],a['zip'],full),[]):
        city=normalized_city(t['address']['city'])==normalized_city(a['city'])
        matched.append((t,'normalized-street-city-state-zip' if city else 'normalized-street-state-zip'))
    # Retain blank-postcode city matches as diagnostic evidence for review. The
    # release resolver enables only explicitly supported match bases.
    if not a['zip']:
        for t in by_city.get((a['state'],normalized_city(a['city']),full),[]):
            matched.append((t,'normalized-street-city-state'))
    return matched


def target_indexes(targets):
    by_zip=collections.defaultdict(list);by_city=collections.defaultdict(list)
    for t in targets:
        a=t['address'];full=normalize_street(source_street_line(a['street']))
        by_zip[(a['state'],a['zip'],full)].append(t)
        by_city[(a['state'],normalized_city(a['city']),full)].append(t)
    return by_zip,by_city


def select_one(receipt, output, target_data, local_source=None):
    import pyarrow as pa
    targets=target_data['targets'];by_zip,by_city=target_indexes(targets)
    source=receipt['source'];name=pathlib.PurePosixPath(source['key']).name
    dest=output/'selected'/(name+'.json')
    if dest.exists():
        old=json.loads(dest.read_bytes())
        if old['targetsSha256']!=target_data['targetsSha256'] or old['cacheSha256']!=receipt['cacheSha256']:
            raise ValueError('Stale selected rows for another target inventory')
        return old
    c=connection()
    cache=output/receipt['cacheFile']
    if file_sha(cache)!=receipt['cacheSha256']: raise ValueError('US projection changed')
    full_keys={normalize_street(source_street_line(t['address']['street'])) for t in targets}
    # Source house numbers may contain spaces/fractions. Keep all plausible
    # street-name splits here, then require the entire normalized address below.
    wanted_names={' '.join(full.split()[i:]) for full in full_keys for i in (1,2,3) if len(full.split())>i}
    raw_streets=c.execute('SELECT DISTINCT street FROM read_parquet(?)',[str(cache)]).fetchall()
    selected_streets=[(raw,normalize_street(raw)) for (raw,) in raw_streets if raw and normalize_street(raw) in wanted_names]
    if not selected_streets:
        candidates=[]
    else:
        street_table=pa.table({'raw':[v[0] for v in selected_streets],'norm':[v[1] for v in selected_streets]})
        full_table=pa.table({'norm':sorted(full_keys)})
        c.register('street_names',street_table);c.register('full_keys',full_table)
        c.create_function('native_number',functools.lru_cache(maxsize=100_000)(normalize_street),['VARCHAR'],'VARCHAR',null_handling='special')
        q='''SELECT p.* FROM read_parquet(?) p
             JOIN street_names s ON p.street=s.raw
             JOIN full_keys t ON native_number(p.number)||' '||s.norm=t.norm'''
        rows=c.execute(q,[str(cache)]).to_arrow_table().to_pylist()
        candidates=[]
        for row in rows:
            matches=matching_targets(row,by_zip,by_city)
            if not matches: continue
            projected={**row,'geometryWkb':bytes(row['geometryWkb']).hex()}
            candidates.append({'fileRowNumber':row['file_row_number'],
                               'projectionSha256':sha(encoded(projected)),
                               'targets':[{'key':t['key'],'matchBasis':basis} for t,basis in matches]})
    selected=[]
    acquired=None;source_file_sha=receipt.get('sourceFileSha256')
    if candidates:
        if local_source is None:
            acquired,source_file_sha=download_original(source,output)
            local_source=acquired
        numbers=pa.table({'row_number':[r['fileRowNumber'] for r in candidates]})
        c.register('selected_numbers',numbers)
        q='''SELECT id,street,number,unit,postcode,postal_city,address_levels,country,
                    ST_AsWKB(geometry) AS geometryWkb,sources,version,bbox,file_row_number
             FROM read_parquet(?,file_row_number=true)
             WHERE file_row_number IN (SELECT row_number FROM selected_numbers)'''
        native_rows=c.execute(q,[str(local_source) if local_source else BASE+source['key']]).to_arrow_table().to_pylist()
        refs={r['fileRowNumber']:r['targets'] for r in candidates}
        projections={r['fileRowNumber']:r['projectionSha256'] for r in candidates}
        if len(native_rows)!=len(refs): raise ValueError('Selected full native row acquisition incomplete')
        for row in native_rows:
            row_number=row.pop('file_row_number');row['geometryWkb']=bytes(row['geometryWkb']).hex()
            if row['country']!='US': raise ValueError('Unexpected native address row')
            projected={k:row[k] for k in ('number','street','postcode','postal_city','address_levels','geometryWkb')}
            projected['file_row_number']=row_number
            if sha(encoded(projected))!=projections[row_number]: raise ValueError('Native complete row differs from US projection')
            if sorted(refs[row_number],key=lambda r:r['key'])!=sorted([{'key':t['key'],'matchBasis':b} for t,b in matching_targets(row,by_zip,by_city)],key=lambda r:r['key']):
                raise ValueError('Native complete row and earlier projection differ')
            selected.append({'sourceFile':source['key'],'sourceEtag':source['etag'],'sourceRowNumber':row_number,
                             'sourceFileSha256':source_file_sha,
                             'projectionSha256':projections[row_number],
                             'sourceSha256':sha(encoded(row)),'sourceDigestScope':'canonical-native-record',
                             'nativeRecord':row,'targets':refs[row_number]})
    c.close()
    d={'release':RELEASE,'targetsSha256':target_data['targetsSha256'],'cacheSha256':receipt['cacheSha256'],
       'sourceFile':source['key'],'sourceEtag':source['etag'],'sourceFileSha256':source_file_sha,
       'usRows':receipt['usRows'],'records':selected}
    dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(encoded(d))
    if acquired:
        acquired.unlink();acquired.with_suffix('.download.json').unlink()
    print('Overture selected',name,'native rows',len(selected),flush=True)
    return d


def coordinate_key(point):
    # Use the same explicit arithmetic in Python and DuckDB; their default
    # decimal tie rounding differs. Original selected coordinates stay intact.
    return tuple(math.floor(v*10_000_000+0.5) for v in point)


def verify_selected_projection(part, receipt, output):
    """Bind selected full native fields back to the complete-US projection."""
    import pyarrow as pa
    records=part['records']
    if not records: return []
    c=connection();cache=output/receipt['cacheFile']
    if file_sha(cache)!=receipt['cacheSha256']: raise ValueError('Selected source projection changed')
    c.register('row_numbers',pa.table({'row_number':[r['sourceRowNumber'] for r in records]}))
    rows=c.execute('SELECT * FROM read_parquet(?) WHERE file_row_number IN (SELECT row_number FROM row_numbers)',[str(cache)]).to_arrow_table().to_pylist()
    if len(rows)!=len(records): raise ValueError('Selected projection rows are not complete')
    actual={}
    for row in rows:
        row['geometryWkb']=bytes(row['geometryWkb']).hex();actual[row['file_row_number']]=sha(encoded(row))
    verified=[]
    for record in records:
        row=record['nativeRecord'];number=record['sourceRowNumber']
        projected={k:row[k] for k in ('number','street','postcode','postal_city','address_levels','geometryWkb')}
        projected['file_row_number']=number
        digest=sha(encoded(projected))
        if digest!=actual[number]: raise ValueError('Actual full native source differs from complete-US projection')
        verified.append({**record,'sourceFileSha256':part['sourceFileSha256'],'projectionSha256':digest})
    c.close()
    return verified


def native_street_fingerprint(row):
    number=str(row.get('number') or '')
    street=str(row.get('street') or '')
    if not re.search(r'\d',number) or not street.strip(): return None
    a=source_address(row)
    if a:
        return a['state']+'|'+a['zip']+'|'+normalize_street(a['street'])
    # Unknown locality is not a reason to ignore a physically different address
    # observed at a selected point in the complete US source.
    postal=str(row.get('postcode') or '').strip()
    postal5=postal[:5] if re.fullmatch(r'\d{5}(?:-\d{4})?',postal) else ''
    return '?|'+postal5+'|'+normalize_street(' '.join(str(row.get(k) or '') for k in ('number','street')))


def distinct_fingerprints(values):
    # Keep conflicting reported ZIPs/states distinct. A less-complete witness
    # for the identical house/street at this point does not create a second
    # known address when an actual witness supplies every same reported field.
    # This compares evidence; no missing source field is filled or published.
    parts={v:tuple(v.split('|',2)) for v in values}
    result=set(values)
    for value,(state,postal,street) in parts.items():
        for other,(s,p,road) in parts.items():
            if value==other or street!=road: continue
            if (state=='?' or state==s) and (not postal or postal==p) and (state=='?' and s!='?' or not postal and p):
                result.discard(value);break
    return result


def reuse_one(receipt, output, points, fresh=False):
    import pyarrow as pa
    source=receipt['source'];name=pathlib.PurePosixPath(source['key']).name
    point_sha=sha(encoded(sorted(points)))
    dest=output/'reuse'/(name+'.json')
    if dest.exists() and not fresh:
        old=json.loads(dest.read_bytes())
        if old['pointsSha256']!=point_sha or old['cacheSha256']!=receipt['cacheSha256']: raise ValueError('Stale coordinate reuse receipt')
        return old
    c=connection();cache=output/receipt['cacheFile']
    if file_sha(cache)!=receipt['cacheSha256']: raise ValueError('US projection changed')
    table=pa.table({'latKey':[p[0] for p in points],'lonKey':[p[1] for p in points]})
    c.register('selected_points',table)
    q='''SELECT p.* FROM read_parquet(?) p JOIN selected_points s
         ON floor(ST_Y(ST_GeomFromWKB(p.geometryWkb))*10000000+0.5)::BIGINT=s.latKey
         AND floor(ST_X(ST_GeomFromWKB(p.geometryWkb))*10000000+0.5)::BIGINT=s.lonKey'''
    rows=c.execute(q,[str(cache)]).to_arrow_table().to_pylist()
    groups={}
    for row in rows:
        point=wkb_point(row['geometryWkb'])
        if not point: raise ValueError('Selected coordinate cannot be decoded')
        key=coordinate_key(point);fp=native_street_fingerprint(row)
        bucket=groups.setdefault(key,{'point':list(key),'rows':0,'addresses':{}})
        bucket['rows']+=1
        if fp and fp not in bucket['addresses']:
            witness={k:v for k,v in row.items() if k!='geometryWkb'}
            witness['geometryWkb']=bytes(row['geometryWkb']).hex()
            bucket['addresses'][fp]=witness
    c.close()
    d={'release':RELEASE,'pointsSha256':point_sha,'cacheSha256':receipt['cacheSha256'],
       'sourceFile':source['key'],'sourceEtag':source['etag'],'usRowsScanned':receipt['usRows'],
       'coordinateGroups':list(groups.values())}
    dest.parent.mkdir(parents=True,exist_ok=True)
    if fresh and dest.exists():
        if dest.read_bytes()!=encoded(d): raise ValueError('Complete-US coordinate reuse replay differs')
    else:
        dest.write_bytes(encoded(d))
    print('Overture coordinate reuse',name,'US rows',receipt['usRows'],'selected coordinate rows',len(rows),flush=True)
    return d


def distance(a,b):
    y1,x1,y2,x2=map(math.radians,[*a,*b]);h=math.sin((y2-y1)/2)**2+math.cos(y1)*math.cos(y2)*math.sin((x2-x1)/2)**2
    return 12_742_000*math.asin(min(1,math.sqrt(h)))


def points_agree(points, tolerance=75):
    return all(distance(a,b)<=tolerance for i,a in enumerate(points) for b in points[:i])


def resolve(target_data, records, reuse, inventory_sha, allow_city=False):
    identities={r['GEOID']:r['USPS'] for r in json.loads((ROOT/'scripts/fixtures/census-2026-county-identities.json').read_bytes())['counties'] if r['USPS'] in STATES}
    counties=geometry_index(json.loads(BOUNDARY.read_bytes()),identities)
    by_target=collections.defaultdict(list)
    by_zip,by_city=target_indexes(target_data['targets'])
    for record in records:
        if sha(encoded(record['nativeRecord']))!=record['sourceSha256']: raise ValueError('Native record digest mismatch')
        expected=[{'key':t['key'],'matchBasis':b} for t,b in matching_targets(record['nativeRecord'],by_zip,by_city)]
        if sorted(record['targets'],key=lambda r:r['key'])!=sorted(expected,key=lambda r:r['key']):
            raise ValueError('Native source address is not bound to its original primary target')
        for ref in record['targets']:
            by_target[ref['key']].append((record,ref['matchBasis']))
    groups={}
    for report in reuse:
        for g in report['coordinateGroups']:
            key=tuple(g['point']);bucket=groups.setdefault(key,{'rows':0,'addresses':set()})
            bucket['rows']+=g['rows'];bucket['addresses'].update(g['addresses'])
    candidates=[];rejected=[];counts=collections.Counter()
    for t in target_data['targets']:
        found=by_target.get(t['key'],[])
        if not found: counts['no-source-address-match']+=1;continue
        usable=[];blocked=[]
        for record,basis in found:
            row=record['nativeRecord'];reason=source_block_reason(row)
            if not reason and basis=='normalized-street-city-state' and not allow_city: reason='blank-source-postcode-city-match-review'
            point=wkb_point(row['geometryWkb'])
            if not reason and not point: reason='invalid-native-point'
            if reason:
                blocked.append(reason);continue
            a=source_address(row);county,county_basis=county_for(point,counties[a['state']])
            if not county or t.get('sourceCounty') and county!=t['sourceCounty']:
                blocked.append('source-point-county-conflict');continue
            group=groups.get(coordinate_key(point))
            if not group: raise ValueError('Missing complete-US coordinate audit')
            if len(distinct_fingerprints(group['addresses']))!=1:
                blocked.append('coordinate-shared-by-distinct-addresses');continue
            usable.append((record,basis,point,county))
        serious={'source-point-county-conflict','coordinate-shared-by-distinct-addresses','invalid-native-point'}&set(blocked)
        if serious:
            reason=sorted(serious)[0]
        elif not usable:
            reason=sorted(set(blocked))[0] if blocked else 'no-eligible-native-point'
        elif len({u[3] for u in usable})!=1 or not points_agree([u[2] for u in usable]):
            reason='conflicting-native-points'
        else:
            reason=None
        if reason:
            counts[reason]+=1;rejected.append({'key':t['key'],'reason':reason,'sourceRecords':len(found),'blockedReasons':sorted(set(blocked))});continue
        usable.sort(key=lambda v:(v[1]!='normalized-street-city-state-zip',v[0]['sourceFile'],v[0]['sourceRowNumber']))
        record,basis,point,county=usable[0];row=record['nativeRecord'];a=source_address(row)
        proof={'nativeId':row['id'],'sourceFile':record['sourceFile'],'sourceEtag':record['sourceEtag'],
               'sourceFileSha256':record.get('sourceFileSha256'),
               'sourceRowNumber':record['sourceRowNumber'],'sourceSha256':record['sourceSha256'],
               'sourceDigestScope':'canonical-native-record','sourceInventorySha256':inventory_sha,
               'release':RELEASE,'countyFips':county,'precision':'reported-address-point','sourceDate':None,
               'coordinatesAsReported':point,
               'collectionDate':DATE,'attribution':row['sources'],'coordinateReuseRows':groups[coordinate_key(point)]['rows'],
               'coordinateReuseDistinctAddresses':1,'completeUSRowsAudited':US_COUNT}
        match={'latitude':point[0],'longitude':point[1],'matchedAddress':', '.join([a['street'],a['city'],a['state'],a['zip']]),
               'method':'overture-address','sourceAddress':a,'matchBasis':basis,'point':proof}
        candidates.append({'key':t['key'],'originalAddress':t['address'],'address':t['address'],'countyFips':county,
                           'match':match,'corroboratingNativeRows':len(usable)})
        counts['accepted']+=1
    return {'schemaVersion':1,'release':RELEASE,'sourceInventorySha256':inventory_sha,
            'locationIndexSha256':target_data['locationIndexSha256'],'targetsSha256':target_data['targetsSha256'],
            'completeUSRowsAudited':US_COUNT,'allowedMatchBases':['normalized-street-city-state-zip','normalized-street-state-zip']+(['normalized-street-city-state'] if allow_city else []),
            'outcomes':dict(sorted(counts.items())),'candidates':candidates,'rejected':rejected}


def main():
    p=argparse.ArgumentParser();p.add_argument('--source',type=pathlib.Path,required=True)
    p.add_argument('--locations',type=pathlib.Path,default=PUBLIC/'locations')
    p.add_argument('--extra-targets',type=pathlib.Path);p.add_argument('--workers',type=int,default=2)
    p.add_argument('--allow-blank-postcode-city',action='store_true');p.add_argument('--select-only',action='store_true')
    p.add_argument('--recheck-reuse',action='store_true')
    a=p.parse_args();output=a.source
    receipt=json.loads((output/'complete-us-receipt.json').read_bytes())
    if receipt['release']!=RELEASE or receipt['usRows']!=US_COUNT or receipt['globalFiles']!=64: raise ValueError('Incomplete US source')
    target_data=load_targets(a.locations,a.extra_targets)
    (output/'targets.json').write_bytes(encoded(target_data))
    inputs=[r for r in receipt['files'] if r['usRows']]
    with concurrent.futures.ThreadPoolExecutor(max_workers=a.workers) as pool:
        selected=list(pool.map(lambda r:select_one(r,output,target_data),inputs))
    records=[]
    receipt_by_key={r['source']['key']:r for r in inputs}
    for part in selected:
        records.extend(verify_selected_projection(part,receipt_by_key[part['sourceFile']],output))
    (output/'selected-native-records.json').write_bytes(encoded({'release':RELEASE,'records':records}))
    print('Overture selected complete',len(records),'native rows',flush=True)
    if a.select_only: return
    points=sorted({coordinate_key(p) for r in records if not source_block_reason(r['nativeRecord']) and (p:=wkb_point(r['nativeRecord']['geometryWkb']))})
    if not points: raise ValueError('No eligible native source points')
    with concurrent.futures.ThreadPoolExecutor(max_workers=a.workers) as pool:
        reuse=list(pool.map(lambda r:reuse_one(r,output,points,a.recheck_reuse),inputs))
    if sum(r['usRowsScanned'] for r in reuse)!=US_COUNT: raise ValueError('Coordinate reuse inventory incomplete')
    report=resolve(target_data,records,reuse,receipt['sourceInventorySha256'],a.allow_blank_postcode_city)
    (output/'primary-address-candidates.json').write_bytes(encoded(report))
    print('Overture primary outcomes',json.dumps(report['outcomes'],sort_keys=True),flush=True)


if __name__=='__main__': main()
