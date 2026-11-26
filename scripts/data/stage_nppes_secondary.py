#!/usr/bin/env python3
"""Extract non-primary federal practice addresses for existing ambulance organization NPIs."""
import argparse,collections,csv,io,json,pathlib,re,zipfile
from backfill_provider_locations import PUBLIC,ROOT,SOURCE,STATES,read_registry,verify,sha,digest_file,physical,clean,address,zip5
from stage_nppes import valid_npi
ARCHIVE_SHA='c5a34fba9b2e04bcb87358a1e3f9f4bbfc79b49b71fb37b71f9de43570c18713'
PERIOD='2026-11-09 monthly release'
REF='https://download.cms.gov/nppes/NPI_Files.html'
DEST=PUBLIC/'nppes-secondary'
FIELDS=('NPI','Provider Secondary Practice Location Address- Address Line 1','Provider Secondary Practice Location Address-  Address Line 2','Provider Secondary Practice Location Address - City Name','Provider Secondary Practice Location Address - State Name','Provider Secondary Practice Location Address - Postal Code','Provider Secondary Practice Location Address - Country Code (If outside U.S.)','Provider Secondary Practice Location Address - Telephone Number','Provider Secondary Practice Location Address - Telephone Extension','Provider Practice Location Address - Fax Number')
def header_key(x):
    return re.sub(r'\s*-\s*',' - ',' '.join(x.split()))
def serialize(x):
    return (json.dumps(x,sort_keys=True,ensure_ascii=True,separators=(',',':'),allow_nan=False)+'\n').encode()
def address_key(a):
    return tuple(' '.join(a[k].upper().split()) for k in ('street','city','state','zip'))
def fingerprint(npi,a):
    return sha(serialize([npi,*address_key(a)]))
def eligible_targets(entries):
    targets={}
    for e in entries:
        if e['source']!='NPPES':continue
        npi=e['key'][4:]
        if e['key']!='NPI:'+npi or not valid_npi(npi) or npi in targets:raise ValueError('Invalid NPPES parent identity')
        targets[npi]=e
    if not targets:raise ValueError('No NPPES parent records')
    return targets
def acquire(stream,targets):
    reader=csv.reader(stream)
    headers=next(reader,None)
    if headers is None or tuple(map(header_key,headers))!=tuple(map(header_key,FIELDS)):raise ValueError('Unreviewed practice reference schema')
    counts=collections.Counter();rows=[];seen=set()
    for rownum,row in enumerate(reader,1):
        counts['referenceRows']+=1
        if len(row)!=len(FIELDS):raise ValueError('Unexpected reference row width at '+str(rownum))
        npi=row[0]
        parent=targets.get(npi)
        if parent is None:counts['outsideParentSnapshot']+=1;continue
        counts['targetReferenceRows']+=1
        if parent['status']=='historical':counts['historicalParent']+=1;continue
        line1,line2,city,state,postal,country=map(str.strip,row[1:7])
        if country not in ('','US'):counts['nonUsAddress']+=1;continue
        if not clean(line1,160) or line2 and not clean(line2,160) or not clean(city,100) or state not in STATES or not zip5(postal):
            counts['unsupportedAddress']+=1;continue
        a=address(', '.join(x for x in (line1,line2) if x),city,state,postal)
        if not physical(a):counts['unsupportedAddress']+=1;continue
        key=address_key(a)
        if parent.get('address') and key==address_key(parent['address']):counts['primaryDuplicate']+=1;continue
        fp=fingerprint(npi,a)
        if fp in seen:counts['duplicateSecondary']+=1;continue
        seen.add(fp)
        rows.append({'sourceKey':'NPI:'+npi+':secondary:'+fp,'parentNpi':npi,'parentName':parent['name'],'parentState':parent['state'],'parentSourceDate':parent['sourceDate'],'parentMappingStatus':parent['status'],'sourceRow':rownum,'address':a,'addressLine1AsReported':line1,'addressLine2AsReported':line2 or None,'postalCodeAsReported':postal,'countryCodeAsReported':country or None,'crossState':a['state']!=parent['state'],'stationIdentityEstablished':False,'endUserValidationRequired':True,'publicationEligible':False})
        counts['acceptedSecondary']+=1
    if not counts['referenceRows'] or not counts['targetReferenceRows']:raise ValueError('Empty or unrelated reference file')
    addresses=collections.defaultdict(set)
    for r in rows:addresses[address_key(r['address'])].add(r['parentNpi'])
    for r in rows:r['sharedAddressAcrossNpis']=len(addresses[address_key(r['address'])])>1
    counts['distinctParentNpisWithSecondary']=len({r['parentNpi'] for r in rows})
    counts['crossStateSecondary']=sum(r['crossState'] for r in rows)
    counts['sharedAddressRows']=sum(r['sharedAddressAcrossNpis'] for r in rows)
    counts['parentsWithoutPrimaryMapWithSecondary']=len({r['parentNpi'] for r in rows if r['parentMappingStatus']!='mapped'})
    counts['distinctSecondaryAddresses']=len(addresses)
    if counts['targetReferenceRows']!=sum(counts[k] for k in ('historicalParent','nonUsAddress','unsupportedAddress','primaryDuplicate','duplicateSecondary','acceptedSecondary')):raise ValueError('Reference accounting mismatch')
    return sorted(rows,key=lambda r:r['sourceKey']),dict(sorted(counts.items()))
def snapshot(loc=PUBLIC/'locations'):
    manifest,national=read_registry()
    fl=json.loads((PUBLIC/'state-ems/FL.json').read_bytes())
    verify(loc,manifest,national,fl)
    raw=(loc/'index.json').read_bytes();idx=json.loads(raw)
    a=idx['nppesArchive']
    if a.get('sha256')!=ARCHIVE_SHA or a.get('url')!=SOURCE or a.get('reportingPeriod')!=PERIOD or a.get('status')!='processed' or manifest['sources']['NPPES']['sourceUrl']!=SOURCE or manifest['sources']['NPPES']['reportingPeriod']!=PERIOD:raise ValueError('Primary and secondary federal editions differ')
    entries=[e for c in idx['chunks'] for e in json.loads((loc/c['file']).read_bytes())]
    targets=eligible_targets(entries)
    if len(targets)!=idx['coverage']['NPPES']['total'] or len(targets)!=a['exactAddressMatches'] or a['conflicts']!=0:raise ValueError('Incomplete parent source snapshot')
    return targets,sha(raw),sha((PUBLIC/'national/index.json').read_bytes())
def build(archive,targets,location_hash,national_hash):
    if archive.stat().st_size>2_000_000_000 or digest_file(archive)!=ARCHIVE_SHA:raise ValueError('Official archive digest mismatch')
    with zipfile.ZipFile(archive) as z:
        members=[m for m in z.infolist() if re.fullmatch(r'pl_pfile_\d{8}-\d{8}\.csv',pathlib.Path(m.filename).name,re.I)]
        if len(members)!=1 or members[0].is_dir() or members[0].file_size>3_000_000_000:raise ValueError('Missing or oversized practice reference member')
        member=members[0]
        with z.open(member) as f,io.TextIOWrapper(f,encoding='utf-8-sig',newline='') as stream:rows,counts=acquire(stream,targets)
    return {'schemaVersion':1,'publication':'review-only','sourceUrl':SOURCE,'referenceUrl':REF,'reportingPeriod':PERIOD,'archiveSha256':ARCHIVE_SHA,'sourceMember':member.filename,'sourceMemberCrc32':format(member.CRC,'08x'),'sourceMemberBytes':member.file_size,'locationManifestSha256':location_hash,'nationalRegistrySha256':national_hash,'parentNpiCount':len(targets),'counts':counts,'verifiedStations':0,'newMapped':0,'records':rows,'limitations':'Source-reported secondary practice addresses, not separate organizations, current operating stations, confirmed county assignments or replacement primary locations. Cross-state addresses are retained. No personal contact fields or coordinates.'}
def output_files(report):
    by=collections.defaultdict(list)
    for row in report['records']:by[row['parentNpi'][:2]].append(row)
    files={};chunks=[]
    for prefix,rows in sorted(by.items()):
        file=prefix+'.json';raw=serialize(rows);files[file]=raw;chunks.append({'prefix':prefix,'file':file,'count':len(rows),'sha256':sha(raw)})
    manifest={k:v for k,v in report.items() if k!='records'};manifest['chunks']=chunks
    files['index.json']=serialize(manifest)
    return files
def main():
    p=argparse.ArgumentParser();p.add_argument('--archive',type=pathlib.Path,required=True);p.add_argument('--output',type=pathlib.Path,required=True);a=p.parse_args()
    targets,loc,nat=snapshot();report=build(a.archive,targets,loc,nat);files=output_files(report)
    a.output.mkdir(parents=True,exist_ok=False)
    for name,raw in files.items():(a.output/name).write_bytes(raw)
    print('NPPES bulk secondary acquisition:',json.dumps({'parentNpiCount':report['parentNpiCount'],'counts':report['counts'],'newMapped':0,'sourceMember':report['sourceMember']}))
if __name__=='__main__':main()
