#!/usr/bin/env python3
"""Acquire the legacy USFA station-address export; parent FDID is state-scoped."""
import argparse,collections,csv,datetime,io,json,pathlib,re,time
from urllib.request import Request,build_opener,HTTPRedirectHandler
from backfill_provider_locations import PUBLIC,STATES,read_registry,native_key,sha,physical,address
SOURCE='https://apps.usfa.fema.gov/registry/api/download/station'
REFERENCE='https://apps.usfa.fema.gov/registry/download'
FIELDS=('fdid','hqstate','stationname','stationstate','stationaddr1','stationaddr2','stationcity','stationzip')
MAX_BYTES=40_000_000
class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,*args,**kwargs):return None
def hkey(s):return re.sub(r'[^a-z0-9]','',s.lower())
def serialize(x):return (json.dumps(x,sort_keys=True,ensure_ascii=True,separators=(',',':'),allow_nan=False)+'\n').encode()
def tidy(s):
    if len(s)>500 or re.search(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]',s):return None
    return ' '.join(s.split()) or None
def parent_index(rows):
    idx=collections.defaultdict(list)
    for r in rows:
        k=native_key(r)
        if r[1]=='USFA' and k:idx[k].append(r)
    return idx
def parse(raw,national,minimum=100,with_audit=False):
    lines=io.StringIO(raw.decode('utf-8-sig'),newline='').readlines()
    reader=csv.reader(lines,strict=True)
    header=next(reader,None)
    if not header:raise ValueError('Missing station CSV header')
    headers=list(map(hkey,header))
    if len(set(headers))!=len(headers) or not set(FIELDS)<=set(headers):raise ValueError('Unreviewed station CSV columns')
    cols={k:headers.index(k) for k in FIELDS};idx=parent_index(national)
    rows=[];stats=collections.Counter();fingerprints=collections.Counter();audit=[]
    # A CSV parser can consume several physical lines before discovering an
    # invalid quote. Preserve the exact consumed span as an opaque digest;
    # never salvage partial columns or guess where a damaged record ended.
    i=0
    while True:
        first=reader.line_num
        try:row=next(reader)
        except StopIteration:break
        except csv.Error:
            last=reader.line_num
            if last<=first:raise ValueError('CSV parser made no progress')
            i+=1;stats['sourceRows']+=1;stats['malformedCsvRecords']+=1
            audit.append({'sourceRow':i,'firstPhysicalLine':first+1,'lastPhysicalLine':last,'reason':'malformed-csv','fragmentSha256':sha(''.join(lines[first:last]).encode('utf-8'))})
            continue
        i+=1
        if not row or all(not x.strip() for x in row):continue
        stats['sourceRows']+=1
        if len(row)!=len(headers):
            stats['malformedCsvRecords']+=1
            audit.append({'sourceRow':i,'firstPhysicalLine':first+1,'lastPhysicalLine':reader.line_num,'reason':'column-count-mismatch','fragmentSha256':sha(''.join(lines[first:reader.line_num]).encode('utf-8'))})
            continue
        raw_fields={k:row[c] for k,c in cols.items()}
        fdid=raw_fields['fdid'].strip();hq=raw_fields['hqstate'].strip().upper();state=raw_fields['stationstate'].strip().upper()
        if hq not in STATES or state not in STATES:
            stats['outsideOrMissingState']+=1;continue
        if not re.fullmatch(r'[-A-Za-z0-9.]{1,80}',fdid):
            stats['invalidParentIdentifier']+=1;continue
        key='FDID:'+hq+':'+fdid.upper()
        parents=idx.get(key,[])
        fields={k:tidy(v) for k,v in raw_fields.items()}
        # Preserve source identifier as text, including leading zeros. A source
        # row is not a native station ID and is never assigned a made-up one.
        fields.update(fdid=fdid,hqstate=hq,stationstate=state)
        fp=sha(serialize(fields));fingerprints[fp]+=1
        a=address(', '.join(x for x in (fields['stationaddr1'],fields['stationaddr2']) if x),fields['stationcity'] or '',state,fields['stationzip'] or '')
        rows.append({'sourceRow':i,'sourceRowFingerprint':fp,'sourceKey':'USFA-STATION-ROW:'+str(i)+':'+fp[:16],'fdidAsReported':fdid,'parentState':hq,'stationState':state,'parentReviewKey':key if len(parents)==1 else None,'parentNameAsReportedInNationalSnapshot':parents[0][2] if len(parents)==1 else None,'parentAssociationStatus':'exact-state-fdid' if len(parents)==1 else 'ambiguous' if parents else 'not-in-snapshot','stationNameAsReported':fields['stationname'],'addressLine1AsReported':fields['stationaddr1'],'addressLine2AsReported':fields['stationaddr2'],'cityAsReported':fields['stationcity'],'postalCodeAsReported':fields['stationzip'],'physicalAddressCandidate':a if physical(a) else None,'crossState':hq!=state,'stationIdentifier':None,'stationIdentityEstablished':False,'endUserValidationRequired':True,'publicationEligible':False})
        stats['retainedRows']+=1
    if stats['sourceRows']<minimum or len(rows)<minimum or stats['malformedCsvRecords']>max(5,stats['sourceRows']//100):raise ValueError('Station export too small or more than 1% malformed; no partial release')
    for r in rows:r['duplicateSourceFields']=fingerprints[r['sourceRowFingerprint']]>1
    stats.update({'exactParentRows':sum(r['parentAssociationStatus']=='exact-state-fdid' for r in rows),'unmatchedParentRows':sum(r['parentAssociationStatus']=='not-in-snapshot' for r in rows),'ambiguousParentRows':sum(r['parentAssociationStatus']=='ambiguous' for r in rows),'distinctMatchedParents':len({r['parentReviewKey'] for r in rows if r['parentReviewKey']}),'physicalAddressRows':sum(r['physicalAddressCandidate'] is not None for r in rows),'crossStateRows':sum(r['crossState'] for r in rows),'duplicateSourceRows':sum(r['duplicateSourceFields'] for r in rows)})
    if stats['sourceRows']!=sum(stats[k] for k in ('retainedRows','outsideOrMissingState','invalidParentIdentifier','malformedCsvRecords')):raise ValueError('Station source accounting mismatch')
    if reader.line_num!=len(lines) or len(audit)!=stats['malformedCsvRecords']:raise ValueError('CSV source span accounting mismatch')
    stats['sourcePhysicalLines']=len(lines)
    return (rows,dict(sorted(stats.items())),audit) if with_audit else (rows,dict(sorted(stats.items())))
def main():
    p=argparse.ArgumentParser();p.add_argument('--output',type=pathlib.Path,required=True);a=p.parse_args()
    url=SOURCE+'?cacheKey='+str(int(time.time()*1000))
    with build_opener(NoRedirect()).open(Request(url,headers={'Accept':'text/csv','User-Agent':'ATLAS public registry acquisition/1.0'}),timeout=180) as res:raw=res.read(MAX_BYTES+1)
    if len(raw)>MAX_BYTES:raise ValueError('Station export exceeds bound')
    _,national=read_registry();rows,counts,audit=parse(raw,national,with_audit=True)
    report={'schemaVersion':1,'source':'USFA legacy station address export','sourceUrl':SOURCE,'referenceUrl':REFERENCE,'retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceSha256':sha(raw),'nationalRegistrySha256':sha((PUBLIC/'national/index.json').read_bytes()),'sourceEditionDate':None,'publication':'review-only','counts':counts,'records':rows,'malformedSourceAudit':audit,'verifiedStations':0,'newMapped':0,'limitations':'Historical voluntary station or independent fire-company address listings. No native station identifier in selected fields. Exact state+FDID joins are historical source associations, not current operating verification. Malformed CSV spans quarantined; counts describe attempted source records, not a complete count of original logical rows. No coordinates inferred.'}
    a.output.mkdir(parents=True,exist_ok=False)
    data=serialize(report);(a.output/'usfa-station-address-evidence.json').write_bytes(data)
    (a.output/'summary.json').write_bytes(serialize({'sha256':sha(data),'counts':counts,'sourceSha256':report['sourceSha256'],'nationalRegistrySha256':report['nationalRegistrySha256']}))
    print('USFA station acquisition:',json.dumps(counts),flush=True)
if __name__=='__main__':main()
