#!/usr/bin/env python3
"""Retain the complete acquired NERIS evidence; emit mobile-sized source catalog shards."""
import argparse,collections,json,math,pathlib,re,shutil,zipfile
from backfill_provider_locations import ROOT,PUBLIC,STATES,sha
from stage_neris_stations import BASE,physical
ARTIFACT=15086965702
DIGEST='33cd802653cd7f76c6c43bd063ee22fa927b841a504eea1293dcb681c8b2874b'
SOURCE_HASH='1ec2a427cbc5ea1949ff731527de3c701ed9592bc4fa83fe796a54defa18880b'
DATE='2026-11-26T04:09:46.464391+00:00'
DEST=PUBLIC/'neris-stations'
EVIDENCE=ROOT/'scripts/data/evidence/neris-national-stations/2026-11-26'
EXPECTED={'departmentRows':30700,'eligibleDepartments':30672,'withheldDepartments':28,'stationRows':66166,'eligibleStations':65970,'withheldStations':196,'sourceCoordinates':65967,'distinctStationSourcePoints':61743,'sharedStationCoordinateRows':5603,'physicalStreetFormat':16953,'crossStateStations':77,'departmentsWithStationRows':27209,'departmentCountDiscrepancies':3,'parentNameConflicts':0,'withheldObjectAuditRows':224,'sourceObjectsWithFieldIssues':2}
def dump(x):return (json.dumps(x,ensure_ascii=True,sort_keys=True,separators=(',',':'),allow_nan=False)+'\n').encode()
def text(v):
    return v is None or isinstance(v,str) and len(v)<=255 and not re.search(r'[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]',v)
def ident(v):
    return isinstance(v,str) and bool(re.fullmatch(r'[-A-Z0-9]{1,14}',v))
def point(v,x='longitude',y='latitude'):
    return v is None or isinstance(v,dict) and set(v)=={x,y} and all(type(v[k]) in (int,float) and math.isfinite(v[k]) for k in (x,y)) and abs(v[x])<=180 and abs(v[y])<=90 and (v[x]!=0 or v[y]!=0)
def flags(r):
    return r['endUserValidationRequired'] is True and r['publicationEligible'] is False
def native_object(r):
    return type(r['sourceObjectId']) is int and r['sourceObjectId']>0 and (r['sourceExportDate'] is None or type(r['sourceExportDate']) is int)
def compile_catalog(report):
    if report.get('source')!='NERIS' or report.get('sourceUrl')!=BASE or report.get('retrievedAt')!=DATE or report.get('publication')!='review-only' or report.get('newMapped')!=0 or report.get('verifiedStations')!=0 or set(report.get('departmentStateScope',[]))!=STATES or any(report['summary'].get(k)!=v for k,v in EXPECTED.items()):raise ValueError('Unexpected pinned acquisition')
    ds,ss=report['departments'],report['stations']
    parents={d['departmentId']:d for d in ds}
    if len(ds)!=30672 or len(parents)!=len(ds) or len(ss)!=65970 or len({s['stationId'] for s in ss})!=len(ss) or set(parents)&{s['stationId'] for s in ss}:raise ValueError('Native identity membership mismatch')
    if len({d['sourceObjectId'] for d in ds})!=len(ds) or len({s['sourceObjectId'] for s in ss})!=len(ss):raise ValueError('Duplicate object ID')
    by=collections.defaultdict(list);prefixes=collections.defaultdict(set);counts=collections.Counter();geo=collections.Counter();states=collections.Counter()
    for d in ds:
        a=d['headquartersAddressAsReported']
        if not ident(d['departmentId']) or d['state'] not in STATES or not flags(d) or not native_object(d) or not d['name'] or not text(d['name']) or not point(d['headquartersGeometryAsReported'],'x','y') or a['state']!=d['state'] or set(a)!={'address_line_1','address_line_2','city','state','zip_code'} or not all(text(v) for v in a.values()) or not all(text(d[k]) for k in ('departmentTypeAsReported','entityTypeAsReported')) or d['reportedStationCount'] is not None and (type(d['reportedStationCount']) is not int or d['reportedStationCount']<0):raise ValueError('Invalid department evidence')
        prefixes[d['departmentId'][:4]].add(d['state'])
    for s in ss:
        d=parents.get(s['departmentId']);g=s['coordinates']
        if not d or not ident(s['stationId']) or s['departmentState']!=d['state'] or s['parentName']!=d['name'] or s['stationState'] not in STATES or not flags(s) or not native_object(s) or not point(g) or any(not text(s[k]) for k in ('name','addressLine1','addressLine2','city','postalCode','parentNameAsReported')) or any(type(s[k]) is not bool for k in ('physicalStreetFormat','sharedSourcePoint','parentNameConflict')):raise ValueError('Invalid station evidence')
        if s['parentNameConflict']!=bool(s['parentNameAsReported'] and s['parentNameAsReported'].casefold()!=d['name'].casefold()):raise ValueError('Station parent conflict mismatch')
        by[d['departmentId']].append(s);states[s['stationState']]+=1
        counts['physicalStreetFormat']+=s['physicalStreetFormat'];counts['crossStateStations']+=s['stationState']!=d['state'];counts['parentNameConflicts']+=s['parentNameConflict']
        if g:geo[(g['latitude'],g['longitude'])]+=1;counts['sourceCoordinates']+=1
    for s in ss:
        g=s['coordinates'];shared=bool(g and geo[(g['latitude'],g['longitude'])]>1)
        if s['sharedSourcePoint']!=shared:raise ValueError('Station point sharing changed')
        counts['sharedStationCoordinateRows']+=shared
    counts['distinctStationSourcePoints']=len(geo);counts['departmentsWithStationRows']=len(by)
    counts['departmentCountDiscrepancies']=sum(d['reportedStationCount'] is not None and d['reportedStationCount']!=len(by.get(d['departmentId'],[])) for d in ds)
    if any(counts[k]!=EXPECTED[k] for k in counts) or dict(states)!=report['summary']['stationAddressStates']:raise ValueError('Source coverage mismatch')
    audit=report['sourceObjectAudit'];withheld=[r for r in audit if r['disposition']=='withheld']
    if len({(r['layer'],r['sourceObjectId']) for r in audit})!=len(audit) or len(withheld)!=224 or sum(bool(r['fieldIssues']) for r in audit)!=2:raise ValueError('Source audit mismatch')
    for layer,selected in ((0,ds),(1,ss)):
        ids={d['sourceObjectId'] for d in selected}
        if any((r['sourceObjectId'] in ids)!=(r['disposition']=='retained') for r in audit if r['layer']==layer):raise ValueError('Audit membership mismatch')
    groups=collections.defaultdict(list)
    for d in ds:
        a=d['headquartersAddressAsReported'];g=d['headquartersGeometryAsReported']
        groups[d['state']].append({'id':d['departmentId'],'name':d['name'],'state':d['state'],'oid':d['sourceObjectId'],'exportDate':d['sourceExportDate'],'address':[a['address_line_1'],a['address_line_2'],a['city'],a['state'],a['zip_code']],'coordinates':[g['y'],g['x']] if g else None,'reportedStationCount':d['reportedStationCount'],'departmentType':d['departmentTypeAsReported'],'entityType':d['entityTypeAsReported'],'stations':[{'id':s['stationId'],'parentId':s['departmentId'],'oid':s['sourceObjectId'],'name':s['name'],'address':[s['addressLine1'],s['addressLine2'],s['city'],s['stationState'],s['postalCode']],'exportDate':s['sourceExportDate'],'coordinates':[s['coordinates']['latitude'],s['coordinates']['longitude']] if s['coordinates'] else None,'sharedPoint':s['sharedSourcePoint'],'physicalStreetFormat':s['physicalStreetFormat'],'parentNameConflict':s['parentNameConflict']} for s in by[d['departmentId']]]})
    files={};chunks=[]
    for state,rows in sorted(groups.items()):
        data=dump(rows);name=state+'.json';files[name]=data
        chunks.append({'state':state,'file':name,'departmentCount':len(rows),'stationCount':sum(len(d['stations']) for d in rows),'sha256':sha(data)})
    files['index.json']=dump({'schemaVersion':1,'source':'NERIS','publication':'review-only','sourceUrl':BASE,'referenceUrl':report['referenceUrl'],'retrievedAt':DATE,'artifactId':ARTIFACT,'artifactSha256':DIGEST,'sourceSha256':SOURCE_HASH,'summary':report['summary'],'sourceLayerMetadata':report['sourceLayerMetadata'],'chunks':chunks,'prefixStates':{k:sorted(v) for k,v in prefixes.items()},'newMapped':0,'verifiedStations':0,'endUserValidationRequired':True})
    return files
def outputs(archive):
    raw=archive.read_bytes()
    if len(raw)>12_000_000 or sha(raw)!=DIGEST:raise ValueError('Acquisition ZIP checksum mismatch')
    with zipfile.ZipFile(archive) as z:
        if set(z.namelist())!={'neris-national-stations.json','summary.json'} or len(z.namelist())!=2 or z.getinfo('neris-national-stations.json').file_size>100_000_000:raise ValueError('Unexpected archive members')
        data=z.read('neris-national-stations.json');summary=json.loads(z.read('summary.json'))
    if sha(data)!=SOURCE_HASH or summary['sha256']!=SOURCE_HASH:raise ValueError('Source checksum mismatch')
    report=json.loads(data)
    if summary['summary']!=report['summary'] or summary['retrievedAt']!=report['retrievedAt']:raise ValueError('Source summary mismatch')
    return compile_catalog(report)
def main():
    p=argparse.ArgumentParser();p.add_argument('--archive',type=pathlib.Path);p.add_argument('--verify',action='store_true');a=p.parse_args()
    if bool(a.archive)==a.verify:raise ValueError('Choose stage or verify')
    files=outputs(EVIDENCE/'original.zip' if a.verify else a.archive)
    if a.verify:
        if {p.name for p in DEST.iterdir()}!=set(files):raise ValueError('Unexpected catalog members')
        for k,v in files.items():
            if (DEST/k).read_bytes()!=v:raise ValueError('Catalog bytes differ')
    else:
        EVIDENCE.mkdir(parents=True,exist_ok=False);DEST.mkdir(parents=True,exist_ok=False);shutil.copyfile(a.archive,EVIDENCE/'original.zip')
        for k,v in files.items():(DEST/k).write_bytes(v)
    print('NERIS national catalog: 30672 departments, 65970 station rows, 65967 source coordinates, 61743 distinct points, 51 state shards')
if __name__=='__main__':main()
