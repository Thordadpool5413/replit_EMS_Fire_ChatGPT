#!/usr/bin/env python3
"""Exact local Places address joins and complete-US coordinate-reuse audit."""
import argparse
import collections
import functools
import json
import math
import pathlib
import re

from address_normalization import normalize_street, normalized_city, source_street_line
from backfill_provider_locations import ROOT, STATES
from build_neris_station_map import BOUNDARY, county_for, geometry_index
from match_overture_primary_addresses import coordinate_key, distinct_fingerprints, points_agree, source_block_reason, target_indexes, wkb_point
from stage_overture_primary_addresses import DATE, RELEASE, connection, download_original, encoded, file_sha, sha
from stage_overture_primary_places import GLOBAL_FILES, US_COUNT, place_address

PROJECTION_FIELDS=('addresses','phones','confidence','operating_status','basic_category','taxonomy')


def native_projection(row,number):
    return {**{k:row.get(k) for k in PROJECTION_FIELDS},'file_row_number':number,
            'geometryWkb':row['geometryWkb'],'name':(row.get('names') or {}).get('primary')}


def matching_targets(row,by_zip,by_city):
    matches=[]
    for ordinal,raw in enumerate(row.get('addresses') or []):
        address=place_address(raw)
        if not address: continue
        full=normalize_street(source_street_line(address['street']))
        for target in by_zip.get((address['state'],address['zip'],full),[]):
            same_city=normalized_city(target['address']['city'])==normalized_city(address['city'])
            matches.append((target,'normalized-street-city-state-zip' if same_city else 'normalized-street-state-zip',ordinal))
        if not address['zip']:
            for target in by_city.get((address['state'],normalized_city(address['city']),full),[]):
                matches.append((target,'normalized-street-city-state',ordinal))
    return matches


def target_refs(row,indexes):
    return sorted([{'key':target['key'],'matchBasis':basis,'sourceAddressOrdinal':ordinal}
                   for target,basis,ordinal in matching_targets(row,*indexes)],
                  key=lambda ref:(ref['key'],ref['sourceAddressOrdinal'],ref['matchBasis']))


def projected_quality_reason(row):
    confidence=row.get('confidence')
    if type(confidence) not in (int,float) or not math.isfinite(confidence) or not 0.9<=confidence<=1:
        return 'insufficient-existence-confidence'
    if row.get('operating_status')!='open': return 'not-reported-open'
    taxonomy=row.get('taxonomy') or {}
    if row.get('basic_category')=='geographic_entities' or 'geographic_entities' in (taxonomy.get('hierarchy') or []):
        return 'geographic-entity'
    name=row.get('name') if 'name' in row else (row.get('names') or {}).get('primary')
    if not isinstance(name,str) or not name.strip(): return 'missing-native-place-name'
    return None


def select_one(receipt,output,target_data,local_source=None,cache_root=None):
    import pyarrow as pa
    source=receipt['source'];name=pathlib.PurePosixPath(source['key']).name
    dest=output/'selected'/(name+'.json');cache=(cache_root or output)/receipt['cacheFile']
    if dest.exists():
        old=json.loads(dest.read_bytes())
        if old['targetsSha256']!=target_data['targetsSha256'] or old['cacheSha256']!=receipt['cacheSha256']:
            raise ValueError('Stale Places target selection')
        return old
    if file_sha(cache)!=receipt['cacheSha256']: raise ValueError('Complete US Places projection changed')
    indexes=target_indexes(target_data['targets']);c=connection()
    wanted=sorted({normalize_street(source_street_line(t['address']['street'])) for t in target_data['targets']})
    c.register('wanted_streets',pa.table({'street':wanted}))
    c.create_function('native_street',functools.lru_cache(maxsize=200_000)(lambda value:normalize_street(source_street_line(value))),
                      ['VARCHAR'],'VARCHAR',null_handling='special')
    numbers=[x[0] for x in c.execute("""SELECT DISTINCT p.file_row_number
        FROM read_parquet(?) p CROSS JOIN unnest(p.addresses) x(a)
        JOIN wanted_streets t ON native_street(a.freeform)=t.street
        WHERE a.country='US' ORDER BY p.file_row_number""",[str(cache)]).fetchall()]
    candidates={}
    if numbers:
        c.register('plausible_rows',pa.table({'row_number':numbers}))
        projected=c.execute('SELECT * FROM read_parquet(?) WHERE file_row_number IN(SELECT row_number FROM plausible_rows) ORDER BY file_row_number',
                            [str(cache)]).to_arrow_table().to_pylist()
        for row in projected:
            refs=target_refs(row,indexes)
            if refs:
                row['geometryWkb']=bytes(row['geometryWkb']).hex()
                candidates[row['file_row_number']]={'projectionSha256':sha(encoded(row)),'targets':refs}
    acquired=None;records=[];source_digest=receipt['sourceFileSha256']
    if candidates:
        if local_source is None:
            acquired,digest=download_original(source,output);local_source=acquired
            if digest!=source_digest: raise ValueError('Full original Places object changed')
        c.register('selected_numbers',pa.table({'row_number':sorted(candidates)}))
        native=c.execute("""SELECT * EXCLUDE(geometry,file_row_number),ST_AsWKB(geometry) AS geometryWkb,file_row_number
            FROM read_parquet(?,file_row_number=true)
            WHERE file_row_number IN(SELECT row_number FROM selected_numbers) ORDER BY file_row_number""",
            [str(local_source)]).to_arrow_table().to_pylist()
        if len(native)!=len(candidates): raise ValueError('Missing actual native Places rows')
        for row in native:
            number=row.pop('file_row_number');row['geometryWkb']=bytes(row['geometryWkb']).hex();selected=candidates[number]
            if sha(encoded(native_projection(row,number)))!=selected['projectionSha256'] or target_refs(row,indexes)!=selected['targets']:
                raise ValueError('Full native Places row differs from complete-US projection')
            records.append({'sourceFile':source['key'],'sourceEtag':source['etag'],'sourceFileSha256':source_digest,
                            'sourceRowNumber':number,'sourceSha256':sha(encoded(row)),'sourceDigestScope':'canonical-native-record',
                            'projectionSha256':selected['projectionSha256'],'nativeRecord':row,'targets':selected['targets']})
    c.close()
    if acquired: acquired.unlink();acquired.with_suffix('.download.json').unlink()
    result={'release':RELEASE,'targetsSha256':target_data['targetsSha256'],'cacheSha256':receipt['cacheSha256'],
            'sourceFile':source['key'],'sourceEtag':source['etag'],'sourceFileSha256':source_digest,
            'usRows':receipt['usRows'],'records':records}
    dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(encoded(result))
    print('Selected full native Places',name,len(records),flush=True)
    return result


def place_fingerprints(row):
    result=set()
    for raw in row.get('addresses') or []:
        if raw.get('country')!='US': continue
        street=source_street_line(raw.get('freeform'))
        if not re.match(r'^\d+[A-Z]?(?:[- ]\d+[A-Z]?)?\s+\S',street,re.I): continue
        address=place_address(raw);postal=str(raw.get('postcode') or '').strip()
        state=address['state'] if address else '?'
        postcode=postal[:5] if re.fullmatch(r'\d{5}(?:-\d{4})?',postal) else ''
        result.add(state+'|'+postcode+'|'+normalize_street(street))
    return result


def reuse_one(receipt,output,points,cache_root=None):
    import pyarrow as pa
    source=receipt['source'];name=pathlib.PurePosixPath(source['key']).name
    dest=output/'reuse'/(name+'.json');point_sha=sha(encoded(sorted(points)))
    if dest.exists():
        old=json.loads(dest.read_bytes())
        if old['pointsSha256']!=point_sha or old['cacheSha256']!=receipt['cacheSha256']:
            raise ValueError('Stale Places coordinate-reuse scope')
        return old
    cache=(cache_root or output)/receipt['cacheFile']
    if file_sha(cache)!=receipt['cacheSha256']: raise ValueError('Complete US Places reuse projection changed')
    c=connection()
    actual=c.execute('SELECT count(*) FROM read_parquet(?)',[str(cache)]).fetchall()[0][0]
    if actual!=receipt['usRows']: raise ValueError('Incomplete Places coordinate-reuse source')
    c.register('selected_points',pa.table({'latKey':pa.array([p[0] for p in points],type=pa.int64()),
                                         'lonKey':pa.array([p[1] for p in points],type=pa.int64())}))
    rows=c.execute("""SELECT p.* FROM read_parquet(?) p JOIN selected_points s
        ON floor(ST_Y(ST_GeomFromWKB(p.geometryWkb))*10000000+0.5)::BIGINT=s.latKey
        AND floor(ST_X(ST_GeomFromWKB(p.geometryWkb))*10000000+0.5)::BIGINT=s.lonKey
        ORDER BY p.file_row_number""",[str(cache)]).to_arrow_table().to_pylist()
    c.close();groups={}
    for row in rows:
        point=wkb_point(row['geometryWkb'])
        if point is None: raise ValueError('Invalid selected native Places point')
        key=coordinate_key(point);group=groups.setdefault(key,{'point':list(key),'rows':0,'addresses':{}})
        group['rows']+=1;row['geometryWkb']=bytes(row['geometryWkb']).hex()
        for fingerprint in sorted(place_fingerprints(row)):
            group['addresses'].setdefault(fingerprint,row)
    result={'release':RELEASE,'pointsSha256':point_sha,'cacheSha256':receipt['cacheSha256'],
            'sourceFile':source['key'],'sourceEtag':source['etag'],'usRowsScanned':actual,
            'coordinateGroups':[groups[k] for k in sorted(groups)]}
    dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(encoded(result))
    print('Places complete-US reuse',name,actual,'rows',len(rows),'witnesses',flush=True)
    return result


def resolve(target_data,records,reuse,inventory_sha):
    identities={r['GEOID']:r['USPS'] for r in json.loads((ROOT/'scripts/fixtures/census-2026-county-identities.json').read_bytes())['counties'] if r['USPS'] in STATES}
    counties=geometry_index(json.loads(BOUNDARY.read_bytes()),identities)
    by_target=collections.defaultdict(list);indexes=target_indexes(target_data['targets'])
    for record in records:
        row=record['nativeRecord']
        if sha(encoded(row))!=record['sourceSha256'] or target_refs(row,indexes)!=record['targets']:
            raise ValueError('Native Places target/digest binding changed')
        for ref in record['targets']: by_target[ref['key']].append((record,ref))
    groups={}
    for audit in reuse:
        for group in audit['coordinateGroups']:
            bucket=groups.setdefault(tuple(group['point']),{'rows':0,'addresses':set()})
            bucket['rows']+=group['rows'];bucket['addresses'].update(group['addresses'])
    candidates=[];rejected=[];counts=collections.Counter()
    for target in target_data['targets']:
        found=by_target.get(target['key'],[])
        if not found: counts['no-source-address-match']+=1;continue
        usable=[];blocked=[];witnesses=[]
        for record,ref in found:
            row=record['nativeRecord'];ordinal=ref['sourceAddressOrdinal'];address=place_address(row['addresses'][ordinal])
            reason=source_block_reason(row) or projected_quality_reason(row)
            if not reason and ref['matchBasis']=='normalized-street-city-state': reason='blank-source-postcode-city-match-review'
            point=wkb_point(row['geometryWkb'])
            if not reason and point is None: reason='invalid-native-point'
            county=None
            if not reason:
                county,_=county_for(point,counties[address['state']])
                if not county or target.get('sourceCounty') and county!=target['sourceCounty']: reason='source-point-county-conflict'
            if not reason:
                group=groups.get(coordinate_key(point))
                if group is None: raise ValueError('Missing complete-US Places coordinate audit')
                if len(distinct_fingerprints(group['addresses']))!=1: reason='coordinate-shared-by-distinct-addresses'
            witnesses.append({'sourceFile':record['sourceFile'],'sourceRowNumber':record['sourceRowNumber'],
                              'nativeId':row['id'],'sourceAddressOrdinal':ordinal,'sourceAddress':address,
                              'coordinatesAsReported':point,'countyFips':county,'reason':reason})
            if reason: blocked.append(reason)
            else: usable.append((record,ref,point,county,address))
        serious={'source-point-county-conflict','coordinate-shared-by-distinct-addresses','invalid-native-point'}&set(blocked)
        if serious: reason=sorted(serious)[0]
        elif not usable: reason=sorted(set(blocked))[0] if blocked else 'no-eligible-native-point'
        elif len({u[3] for u in usable})!=1 or not points_agree([u[2] for u in usable]): reason='conflicting-native-points'
        else: reason=None
        if reason:
            counts[reason]+=1
            rejected.append({'key':target['key'],'reason':reason,'sourceRecords':len(found),
                             'blockedReasons':sorted(set(blocked)),'sourceWitnesses':witnesses})
            continue
        usable.sort(key=lambda u:(u[1]['matchBasis']!='normalized-street-city-state-zip',u[0]['sourceFile'],u[0]['sourceRowNumber'],u[1]['sourceAddressOrdinal']))
        record,ref,point,county,address=usable[0];row=record['nativeRecord']
        proof={'nativeId':row['id'],'sourceFile':record['sourceFile'],'sourceEtag':record['sourceEtag'],
               'sourceFileSha256':record['sourceFileSha256'],'sourceRowNumber':record['sourceRowNumber'],'sourceSha256':record['sourceSha256'],
               'sourceDigestScope':'canonical-native-record','sourceInventorySha256':inventory_sha,
               'release':RELEASE,'countyFips':county,'precision':'reported-place-point','sourceDate':None,
               'coordinatesAsReported':point,'collectionDate':DATE,'attribution':row['sources'],
               'coordinateReuseRows':groups[coordinate_key(point)]['rows'],'coordinateReuseDistinctAddresses':1,
               'completeUSRowsAudited':US_COUNT,'placeName':row['names']['primary'],'placeConfidence':row['confidence'],
               'operatingStatus':'open','sourceAddressOrdinal':ref['sourceAddressOrdinal']}
        match={'latitude':point[0],'longitude':point[1],
               'matchedAddress':', '.join([source_street_line(address['street']),address['city'],address['state'],address['zip']]),
               'method':'overture-place-address','sourceAddress':address,'matchBasis':ref['matchBasis'],'point':proof}
        candidates.append({'key':target['key'],'originalAddress':target['address'],'address':target['address'],
                           'countyFips':county,'match':match,'corroboratingNativeRows':len(usable)})
        counts['accepted']+=1
    return {'schemaVersion':1,'release':RELEASE,'sourceInventorySha256':inventory_sha,
            'locationIndexSha256':target_data['locationIndexSha256'],'targetsSha256':target_data['targetsSha256'],
            'completeUSRowsAudited':US_COUNT,'allowedMatchBases':['normalized-street-city-state-zip','normalized-street-state-zip'],
            'placeConfidencePolicy':'existence-confidence>=0.9; not location accuracy',
            'operatingStatusPolicy':'reported-open','outcomes':dict(sorted(counts.items())),'candidates':candidates,'rejected':rejected}


def main():
    p=argparse.ArgumentParser();p.add_argument('--source',type=pathlib.Path,required=True);a=p.parse_args();source=a.source
    complete=json.loads((source/'complete-us-receipt.json').read_bytes())
    if complete['release']!=RELEASE or complete['usRows']!=US_COUNT or complete['globalFiles']!=GLOBAL_FILES:
        raise ValueError('Incomplete fixed Places source')
    targets=json.loads((source/'targets.json').read_bytes());inputs=[r for r in complete['files'] if r['usRows']]
    records=[]
    for receipt in inputs: records.extend(select_one(receipt,source,targets)['records'])
    (source/'selected-native-records.json').write_bytes(encoded({'release':RELEASE,'records':records}))
    points=sorted({coordinate_key(p) for r in records if not source_block_reason(r['nativeRecord'])
                   and not projected_quality_reason(r['nativeRecord']) and (p:=wkb_point(r['nativeRecord']['geometryWkb'])) is not None})
    reuse=[reuse_one(r,source,points) for r in inputs]
    if sum(r['usRowsScanned'] for r in reuse)!=US_COUNT: raise ValueError('Incomplete national Places reuse audit')
    report=resolve(targets,records,reuse,complete['sourceInventorySha256'])
    (source/'primary-place-address-candidates.json').write_bytes(encoded(report))
    print(json.dumps(report['outcomes'],sort_keys=True,indent=2),flush=True)


if __name__=='__main__': main()
