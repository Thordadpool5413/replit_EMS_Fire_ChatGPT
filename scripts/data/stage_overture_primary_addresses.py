#!/usr/bin/env python3
"""Acquire one fixed public Overture address edition, without sending target data.

Every global Parquet object is inventoried. US rows are projected into a local
cache; matching provider addresses is a separate, local operation. ETags identify
the original object; a projection digest is never represented as its full SHA.
"""
import argparse
import concurrent.futures
import hashlib
import io
import json
import pathlib
import shutil
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET

RELEASE = '2026-11-18.0'
PREFIX = f'release/{RELEASE}/theme=addresses/type=address/'
BASE = 'https://overturemaps-us-west-2.s3.amazonaws.com/'
LIST_URL = BASE + '?list-type=2&prefix=' + PREFIX
US_COUNT = 126_202_222
GLOBAL_COUNT = 475_239_461
DATE = '2026-11-26'


def encoded(value):
    return (json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True, allow_nan=False)+'\n').encode()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def file_sha(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for b in iter(lambda: f.read(4*1024*1024), b''):
            h.update(b)
    return h.hexdigest()


def fetch(url, headers=None):
    for attempt in range(7):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers or {}), timeout=90) as r:
                return r.read(), dict(r.headers), r.status
        except (urllib.error.URLError, TimeoutError) as exc:
            if attempt == 6:
                raise
            time.sleep(min(2**attempt, 20))


class RangeFile(io.RawIOBase):
    """Bounded verified byte reads for Arrow's Parquet footer inspection."""
    def __init__(self, source):
        super().__init__()
        self.source = source
        self.pos = 0

    def readable(self): return True
    def seekable(self): return True
    def tell(self): return self.pos
    def seek(self, offset, whence=0):
        pos = offset if whence == 0 else self.pos + offset if whence == 1 else self.source['size'] + offset
        if pos < 0: raise ValueError('Negative source offset')
        self.pos = pos
        return pos

    def read(self, size=-1):
        size = min(size if size >= 0 else self.source['size']-self.pos, self.source['size']-self.pos)
        if size <= 0: return b''
        if size > 16*1024*1024: raise ValueError('Unexpected large metadata request')
        start, end = self.pos, self.pos+size-1
        b, h, status = fetch(BASE+self.source['key'], {'Range':f'bytes={start}-{end}'})
        etag = h.get('ETag', h.get('Etag', h.get('etag', ''))).strip('"')
        cr = h.get('Content-Range', h.get('content-range', ''))
        if status != 206 or len(b) != size or etag != self.source['etag'] or cr != f'bytes {start}-{end}/{self.source["size"]}':
            raise ValueError('Source range or immutable object identity changed')
        self.pos += size
        return b


def inventory(output):
    raw, _, _ = fetch(LIST_URL)
    root = ET.fromstring(raw)
    ns = {'s':'http://s3.amazonaws.com/doc/2006-03-01/'}
    if root.find('s:IsTruncated', ns).text != 'false':
        raise ValueError('Incomplete public inventory')
    files=[]
    for item in root.findall('s:Contents', ns):
        files.append({'key':item.find('s:Key',ns).text,'size':int(item.find('s:Size',ns).text),
                      'etag':item.find('s:ETag',ns).text.strip('"'),'lastModified':item.find('s:LastModified',ns).text})
    if len(files) != 64 or any(not f['key'].startswith(PREFIX) or not f['key'].endswith('.parquet') for f in files):
        raise ValueError('Unexpected fixed address edition inventory')
    data={'release':RELEASE,'listUrl':LIST_URL,'listingSha256':sha(raw),'files':files}
    output.mkdir(parents=True,exist_ok=True)
    (output/'inventory.xml').write_bytes(raw)
    (output/'inventory.json').write_text(json.dumps(data,indent=2)+'\n')
    return data


def metadata(source):
    import pyarrow.parquet as pq
    with RangeFile(source) as f:
        m=pq.read_metadata(f)
    groups=[]
    for i in range(m.num_row_groups):
        rg=m.row_group(i)
        country=[rg.column(j) for j in range(rg.num_columns) if rg.column(j).path_in_schema=='country']
        if len(country)!=1 or not country[0].statistics or not country[0].statistics.has_min_max:
            raise ValueError('Missing country row-group inventory')
        stat=country[0].statistics
        groups.append({'rowGroup':i,'rows':rg.num_rows,'countryMin':stat.min,'countryMax':stat.max,'countryNulls':stat.null_count})
    return {**source,'rows':m.num_rows,'rowGroups':groups,'mayContainUS':any(g['countryMin']<='US'<=g['countryMax'] for g in groups)}


def connection():
    import duckdb
    c=duckdb.connect()
    c.execute('LOAD httpfs')
    c.execute('LOAD spatial')
    c.execute('SET threads=2')
    c.execute("SET memory_limit='1200MB'")
    c.execute('SET http_retries=5')
    c.execute('SET http_timeout=120')
    return c


def download_original(source, output):
    """Retain a bounded temporary complete source with an actual whole-file SHA."""
    dest=output/'source-temp'/pathlib.PurePosixPath(source['key']).name
    receipt=dest.with_suffix('.download.json')
    dest.parent.mkdir(parents=True,exist_ok=True)
    if receipt.exists() and dest.exists():
        d=json.loads(receipt.read_bytes())
        if d['sourceEtag']==source['etag'] and dest.stat().st_size==source['size'] and file_sha(dest)==d['sourceFileSha256']:
            return dest,d['sourceFileSha256']
        raise ValueError('Temporary complete source integrity changed')
    if shutil.disk_usage(output).free < source['size']+700_000_000:
        raise RuntimeError('Insufficient disk for bounded source acquisition')
    part=dest.with_suffix('.partial');part.unlink(missing_ok=True)
    h=hashlib.sha256();size=0
    with urllib.request.urlopen(BASE+source['key'],timeout=180) as r,part.open('wb') as f:
        if r.status!=200 or r.headers.get('ETag','').strip('"')!=source['etag']:
            raise ValueError('Complete source response identity changed')
        for b in iter(lambda:r.read(4*1024*1024),b''):
            size+=len(b);h.update(b);f.write(b)
    if size!=source['size']: raise ValueError('Incomplete full source object')
    digest=h.hexdigest();part.rename(dest)
    receipt.write_bytes(encoded({'sourceEtag':source['etag'],'sourceFileSha256':digest,'bytes':size}))
    print('Overture full public file',dest.name,'bytes',size,flush=True)
    return dest,digest


def cache_file(source, output, target_data=None):
    name=pathlib.PurePosixPath(source['key']).name
    dest=output/'us-cache'/name
    receipt=output/'country-inventories'/(name+'.json')
    earlier_receipt=dest.with_suffix('.json')
    if not receipt.exists() and earlier_receipt.exists():
        receipt.parent.mkdir(parents=True,exist_ok=True)
        receipt.write_bytes(earlier_receipt.read_bytes())
    if receipt.exists():
        d=json.loads(receipt.read_bytes())
        if d['source']==source and ((not d['usRows'] and not dest.exists()) or (dest.exists() and d['cacheSha256']==file_sha(dest))):
            if target_data and d['usRows']:
                from match_overture_primary_addresses import select_one
                selected=output/'selected'/(name+'.json')
                if not selected.exists():
                    original,digest=download_original(source,output)
                    if d.get('sourceFileSha256') and digest!=d['sourceFileSha256']: raise ValueError('Original source digest changed')
                    select_one(d,output,target_data,original)
                    original.unlink();original.with_suffix('.download.json').unlink()
            return d
        raise ValueError('Existing source projection or receipt changed')
    c=connection()
    original,source_sha=download_original(source,output)
    url=str(original)
    counts=dict(c.execute('SELECT country,count(*) FROM read_parquet(?) GROUP BY country',[url]).fetchall())
    if sum(counts.values())!=source['rows']:
        raise ValueError('Source row count changed')
    if not counts.get('US'):
        d={'source':source,'countryCounts':counts,'usRows':0,'cacheFile':None,'cacheSha256':None,'cacheBytes':0,'digestScope':None}
        receipt.parent.mkdir(parents=True,exist_ok=True)
        receipt.write_bytes(encoded(d))
        c.close();original.unlink();original.with_suffix('.download.json').unlink()
        return d
    dest.parent.mkdir(parents=True,exist_ok=True)
    part=dest.with_suffix('.partial')
    part.unlink(missing_ok=True)
    # These columns preserve all address/locality/geometry fields needed to find
    # target addresses and independently audit coordinate reuse across the US.
    c.execute("COPY (SELECT file_row_number,number,street,postcode,postal_city,address_levels,ST_AsWKB(geometry) AS geometryWkb FROM read_parquet(?,file_row_number=true) WHERE country='US') TO ? (FORMAT PARQUET,COMPRESSION ZSTD)",[url,str(part)])
    rows=c.execute('SELECT count(*) FROM read_parquet(?)',[str(part)]).fetchone()[0]
    if rows!=counts['US']: raise ValueError('Incomplete US projection')
    # Verify the source footer still belongs to exactly the object inventoried.
    if file_sha(original)!=source_sha: raise ValueError('Source object changed during projection')
    part.rename(dest)
    d={'source':source,'sourceFileSha256':source_sha,'countryCounts':counts,'usRows':rows,'cacheFile':str(dest.relative_to(output)),
       'cacheSha256':file_sha(dest),'cacheBytes':dest.stat().st_size,'digestScope':'US address/locality/geometry projection'}
    receipt.parent.mkdir(parents=True,exist_ok=True)
    receipt.write_bytes(encoded(d))
    c.close()
    if target_data:
        from match_overture_primary_addresses import select_one
        select_one(d,output,target_data,original)
    original.unlink();original.with_suffix('.download.json').unlink()
    print('Overture cached',name,'US rows',rows,'bytes',d['cacheBytes'],flush=True)
    return d


def main():
    p=argparse.ArgumentParser()
    p.add_argument('--output',type=pathlib.Path,required=True)
    p.add_argument('--workers',type=int,default=2)
    p.add_argument('--metadata-only',action='store_true')
    p.add_argument('--select-primary',action='store_true')
    a=p.parse_args()
    inv=json.loads((a.output/'inventory.json').read_bytes()) if (a.output/'inventory.json').exists() else inventory(a.output)
    meta_path=a.output/'metadata-inventory.json'
    if meta_path.exists():
        metas=json.loads(meta_path.read_bytes())['files']
    else:
        with concurrent.futures.ThreadPoolExecutor(max_workers=a.workers) as pool:
            metas=[]
            for m in pool.map(metadata, inv['files']):
                metas.append(m)
                print('Overture metadata',len(metas),pathlib.PurePosixPath(m['key']).name,'US possible',m['mayContainUS'],flush=True)
        if sum(m['rows'] for m in metas)!=GLOBAL_COUNT: raise ValueError('Global edition row count differs')
        meta_path.write_bytes(encoded({'release':RELEASE,'inventorySha256':file_sha(a.output/'inventory.json'),'files':metas}))
    if a.metadata_only: return
    target_data=None
    if a.select_primary:
        from match_overture_primary_addresses import load_targets
        from backfill_provider_locations import PUBLIC
        target_data=load_targets(PUBLIC/'locations')
        (a.output/'targets.json').write_bytes(encoded(target_data))
    with concurrent.futures.ThreadPoolExecutor(max_workers=a.workers) as pool:
        receipts=list(pool.map(lambda s:cache_file(s,a.output,target_data),[m for m in metas if m['mayContainUS']]))
    if sum(r['usRows'] for r in receipts)!=US_COUNT: raise ValueError('Incomplete complete-US projection')
    report={'release':RELEASE,'collectionDate':DATE,'sourceInventorySha256':file_sha(meta_path),
            'globalFiles':len(metas),'globalRows':sum(m['rows'] for m in metas),'usRows':US_COUNT,'usFiles':sum(bool(r['usRows']) for r in receipts),'files':receipts}
    (a.output/'complete-us-receipt.json').write_bytes(encoded(report))
    print('Overture complete US',US_COUNT,'files',len(receipts),'projected bytes',sum(r['cacheBytes'] for r in receipts),flush=True)


if __name__=='__main__': main()
