#!/usr/bin/env python3
"""Stream a local official NPPES CSV into an ambulance-organization staging file.
Does not fetch files, merge agencies, or modify production data.
"""
import argparse, csv, datetime, json, os, pathlib, tempfile, io, zipfile, sys
from contextlib import contextmanager

@contextmanager
def open_source(source):
    if str(source).lower().endswith('.zip'):
        with zipfile.ZipFile(source) as archive:
            names=[name for name in archive.namelist() if pathlib.Path(name).name.startswith('npidata_pfile_') and name.endswith('.csv') and 'fileheader' not in name]
            if len(names)!=1: raise ValueError('Expected one primary NPPES provider CSV in archive.')
            with archive.open(names[0]) as raw, io.TextIOWrapper(raw,encoding='utf-8-sig',newline='') as stream: yield stream
    else:
        with open(source,encoding='utf-8-sig',newline='') as stream: yield stream

def valid_npi(value):
    if len(value) != 10 or not value.isdigit(): return False
    digits=[int(c) for c in '80840'+value]
    return sum((n*2//10+n*2%10) if i%2 else n for i,n in enumerate(reversed(digits)))%10==0

def stage(source, destination, reporting_period, source_url):
    counts=dict(received=0,accepted=0,excluded=0,rejected=0,duplicates=0)
    seen=set(); target=pathlib.Path(destination)
    if pathlib.Path(source).resolve()==target.resolve(): raise ValueError('Input and output must be different files.')
    required=['NPI','Entity Type Code','Provider Organization Name (Legal Business Name)']
    fd,tmp=tempfile.mkstemp(dir=target.parent,prefix='.nppes-stage-',suffix='.tmp')
    try:
        with open_source(source) as src,os.fdopen(fd,'w',encoding='utf-8') as out:
            reader=csv.DictReader(src)
            if not reader.fieldnames or any(key not in reader.fieldnames for key in required): raise ValueError('Not an organization NPPES dissemination CSV: required headers missing.')
            taxonomy=[key for key in reader.fieldnames if key.startswith('Healthcare Provider Taxonomy Code_')]
            if not taxonomy: raise ValueError('Taxonomy columns are required; cannot determine ambulance scope.')
            out.write(json.dumps(dict(kind='manifest',schemaVersion=1,sourceUrl=source_url,reportingPeriod=reporting_period,stagedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),scope='Type 2 organizations with ambulance taxonomy; not an EMS licensing or fire registry'))+'\n')
            for row in reader:
                counts['received']+=1
                if counts['received']%1000000==0: print(json.dumps(counts),file=sys.stderr,flush=True)
                codes=[row.get(key,'').strip() for key in taxonomy if row.get(key)]
                if row.get('Entity Type Code')!='2' or not any(code.startswith('3416') for code in codes): counts['excluded']+=1;continue
                npi=row.get('NPI','').strip();name=row.get(required[2],'').strip()
                if not valid_npi(npi) or not name: counts['rejected']+=1;continue
                if npi in seen: counts['duplicates']+=1;continue
                seen.add(npi)
                location={key:row.get('Provider Business Practice Location Address '+suffix,'').strip() for key,suffix in [('city','City Name'),('state','State Name'),('postalCode','Postal Code')]}
                record=dict(kind='candidate',npi=npi,legalName=name,alternateName=row.get('Provider Other Organization Name',''),location=location,taxonomies=codes,deactivationDate=row.get('NPI Deactivation Date',''),reactivationDate=row.get('NPI Reactivation Date',''),sourceUpdatedAt=row.get('Last Update Date',''),associationStatus='unreviewed')
                out.write(json.dumps(record)+'\n');counts['accepted']+=1
            out.write(json.dumps(dict(kind='summary',**counts))+'\n')
        os.replace(tmp,target)
    except BaseException:
        if os.path.exists(tmp):os.unlink(tmp)
        raise
    return counts

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source');parser.add_argument('destination');parser.add_argument('--reporting-period',required=True);parser.add_argument('--source-url',required=True)
    args=parser.parse_args()
    if not args.source_url.startswith('https://'):parser.error('Provide the HTTPS official source URL.')
    print(json.dumps(stage(args.source,args.destination,args.reporting_period,args.source_url)))
