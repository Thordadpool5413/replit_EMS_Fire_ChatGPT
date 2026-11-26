#!/usr/bin/env python3
"""Acquire the complete fixed public Places edition; all target joins are local."""
import argparse
import concurrent.futures
import json
import pathlib
import re
import xml.etree.ElementTree as ET

from address_normalization import normalized_city
from backfill_provider_locations import STATES
from match_overture_primary_addresses import STATE_NAMES, load_targets
from stage_overture_primary_addresses import BASE, DATE, RELEASE, RangeFile, connection, download_original, encoded, fetch, file_sha, sha

PREFIX=f'release/{RELEASE}/theme=places/type=place/'
LIST_URL=BASE+'?list-type=2&prefix='+PREFIX
US_COUNT=18_806_080
GLOBAL_COUNT=90_295_748
GLOBAL_FILES=16


def place_address(value):
    if not isinstance(value,dict) or value.get('country')!='US': return None
    state=normalized_city(value.get('region'))
    # Native Places region is ISO 3166-2 (for example US-NY), not an inferred state.
    if re.fullmatch(r'US-[A-Z]{2}',state): state=state[3:]
    state=STATE_NAMES.get(state,state)
    if state not in STATES: return None
    postal=str(value.get('postcode') or '').strip()
    return {'street':str(value.get('freeform') or '').strip(),
            'city':str(value.get('locality') or '').strip(),'state':state,
            'zip':postal[:5] if re.fullmatch(r'\d{5}(?:-\d{4})?',postal) else ''}


def inventory(output):
    raw,_,status=fetch(LIST_URL)
    root=ET.fromstring(raw);ns={'s':'http://s3.amazonaws.com/doc/2006-03-01/'}
    if status!=200 or root.find('s:IsTruncated',ns).text!='false': raise ValueError('Incomplete public Places inventory')
    files=[]
    for item in root.findall('s:Contents',ns):
        files.append({'key':item.find('s:Key',ns).text,'size':int(item.find('s:Size',ns).text),
                      'etag':item.find('s:ETag',ns).text.strip('"'),'lastModified':item.find('s:LastModified',ns).text})
    if len(files)!=GLOBAL_FILES or any(not f['key'].startswith(PREFIX) or not f['key'].endswith('.parquet') for f in files):
        raise ValueError('Unexpected fixed Places edition inventory')
    data={'release':RELEASE,'listUrl':LIST_URL,'listingSha256':sha(raw),'files':files}
    output.mkdir(parents=True,exist_ok=True)
    (output/'inventory.xml').write_bytes(raw)
    (output/'inventory.json').write_text(json.dumps(data,indent=2)+'\n')
    return data


def metadata(source):
    import pyarrow.parquet as pq
    with RangeFile(source) as handle: m=pq.read_metadata(handle)
    groups=[]
    for i in range(m.num_row_groups):
        rg=m.row_group(i)
        country=[rg.column(j) for j in range(rg.num_columns) if rg.column(j).path_in_schema=='addresses.list.element.country']
        if len(country)!=1 or not country[0].statistics: raise ValueError('Missing native Places country inventory')
        stat=country[0].statistics
        if stat.has_min_max:
            low,high=stat.min,stat.max
        elif stat.num_values==0:
            low=high=None
        else: raise ValueError('Unbounded Places country statistics')
        groups.append({'rowGroup':i,'rows':rg.num_rows,'countryMin':low,'countryMax':high,'countryNulls':stat.null_count})
    return {**source,'rows':m.num_rows,'rowGroups':groups,
            'mayContainUS':any(g['countryMin'] is not None and g['countryMin']<='US'<=g['countryMax'] for g in groups)}


def target_data_for(locations=None,targets_path=None):
    if not targets_path: return load_targets(locations)
    raw=json.loads(targets_path.read_bytes())
    targets=raw['targets'] if isinstance(raw,dict) else raw
    if not isinstance(targets,list) or not targets or len({t['key'] for t in targets})!=len(targets):
        raise ValueError('Invalid separate frozen target scope')
    from primary_recovery_baseline import INDEX_SHA
    return {'locationIndexSha256':INDEX_SHA,'targetsSha256':sha(encoded(targets)),'targets':targets,
            'inputTargetsFileSha256':file_sha(targets_path)}


def cache_file(source,output,target_data):
    from match_overture_primary_places import select_one
    name=pathlib.PurePosixPath(source['key']).name
    dest=output/'us-cache'/name;receipt_path=output/'receipts'/(name+'.json')
    if receipt_path.exists():
        receipt=json.loads(receipt_path.read_bytes())
        if receipt['source']!=source or receipt['usRows'] and (not dest.exists() or file_sha(dest)!=receipt['cacheSha256']):
            raise ValueError('Existing Places projection changed')
        if receipt['usRows']: select_one(receipt,output,target_data)
        return receipt
    original,digest=download_original(source,output);c=connection()
    counts=c.execute("""SELECT count(*),count(*) FILTER(WHERE
        list_contains(list_transform(addresses,lambda a:a.country),'US'))
        FROM read_parquet(?)""",[str(original)]).fetchall()[0]
    if counts[0]!=source['rows']: raise ValueError('Actual Places source row count changed')
    receipt={'source':source,'sourceFileSha256':digest,'sourceRows':counts[0],'usRows':counts[1],
             'cacheFile':None,'cacheSha256':None,'cacheBytes':0,'digestScope':None}
    if counts[1]:
        dest.parent.mkdir(parents=True,exist_ok=True);part=dest.with_suffix('.partial');part.unlink(missing_ok=True)
        c.execute("""COPY(SELECT file_row_number,addresses,ST_AsWKB(geometry) AS geometryWkb,
              names.primary AS name,phones,confidence,operating_status,basic_category,taxonomy
              FROM read_parquet(?,file_row_number=true)
              WHERE list_contains(list_transform(addresses,lambda a:a.country),'US'))
              TO ?(FORMAT PARQUET,COMPRESSION ZSTD)""",[str(original),str(part)])
        actual=c.execute('SELECT count(*) FROM read_parquet(?)',[str(part)]).fetchall()[0][0]
        if actual!=counts[1] or file_sha(original)!=digest: raise ValueError('Incomplete Places US projection')
        part.rename(dest)
        receipt.update(cacheFile=str(dest.relative_to(output)),cacheSha256=file_sha(dest),
                       cacheBytes=dest.stat().st_size,digestScope='US address/name/phone/quality/geometry projection')
    c.close()
    receipt_path.parent.mkdir(parents=True,exist_ok=True);receipt_path.write_bytes(encoded(receipt))
    if receipt['usRows']: select_one(receipt,output,target_data,original)
    original.unlink();original.with_suffix('.download.json').unlink()
    print('Overture Places projection',name,'US rows',receipt['usRows'],flush=True)
    return receipt


def main():
    p=argparse.ArgumentParser();p.add_argument('--output',type=pathlib.Path,required=True)
    p.add_argument('--locations',type=pathlib.Path);p.add_argument('--targets',type=pathlib.Path)
    p.add_argument('--metadata-only',action='store_true');p.add_argument('--limit-files',type=int)
    p.add_argument('--workers',type=int,default=1);a=p.parse_args()
    inv=json.loads((a.output/'inventory.json').read_bytes()) if (a.output/'inventory.json').exists() else inventory(a.output)
    meta_path=a.output/'metadata-inventory.json'
    if meta_path.exists(): metas=json.loads(meta_path.read_bytes())['files']
    else:
        with concurrent.futures.ThreadPoolExecutor(max_workers=a.workers) as pool: metas=list(pool.map(metadata,inv['files']))
        if sum(m['rows'] for m in metas)!=GLOBAL_COUNT: raise ValueError('Global Places edition row count differs')
        meta_path.write_bytes(encoded({'release':RELEASE,'inventorySha256':file_sha(a.output/'inventory.json'),'files':metas}))
    if a.metadata_only: return
    target_data=target_data_for(a.locations,a.targets)
    (a.output/'targets.json').write_bytes(encoded(target_data))
    selected=[m for m in metas if m['mayContainUS']]
    if a.limit_files is not None: selected=selected[:a.limit_files]
    receipts=[cache_file(m,a.output,target_data) for m in selected]
    if len(selected)!=sum(m['mayContainUS'] for m in metas):
        print('Bounded Places checkpoint only; complete-US receipt not issued',flush=True);return
    if sum(r['usRows'] for r in receipts)!=US_COUNT: raise ValueError('Incomplete complete-US Places projection')
    report={'release':RELEASE,'collectionDate':DATE,'sourceInventorySha256':file_sha(meta_path),
            'globalFiles':GLOBAL_FILES,'globalRows':GLOBAL_COUNT,'usRows':US_COUNT,
            'usFiles':sum(bool(r['usRows']) for r in receipts),'files':receipts}
    (a.output/'complete-us-receipt.json').write_bytes(encoded(report))
    print('Complete US Places',US_COUNT,'source files',len(receipts),flush=True)


if __name__=='__main__': main()
