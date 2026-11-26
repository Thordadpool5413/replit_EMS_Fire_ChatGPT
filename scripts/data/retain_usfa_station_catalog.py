#!/usr/bin/env python3
"""Activate historical USFA station rows and cross-source comparison evidence.
Exact state-scoped FDID identifies a legacy parent. No automatic NERIS/FDID link.
"""
import argparse,collections,json,pathlib,re,shutil,zipfile
from backfill_provider_locations import ROOT,PUBLIC,STATES,sha,read_registry,native_key,name_key,normal_street,physical,address
from stage_usfa_station_evidence import SOURCE,REFERENCE,serialize
ARTIFACT=15086119349
DIGEST='a57656fcee56732c802fa09a350a96f022fde7b073872f8435aec54c9e6b1242'
REPORT_SHA='c958270068074e636e753693627a303d94c84889a85893c26e0be74ffef7c361'
NATIONAL_SHA='6d828632d3933a2815e497bfa189ae4af75e9b847911903b94bc4f0966b748ca'
SOURCE_SHA='4314234fda43d59ee3315b1ba3dc43e0ef9c6af866e972e035b8d23ed134f75f'
DATE='2026-11-26T04:18:15.309630+00:00'
DEST=PUBLIC/'usfa-stations'
EVIDENCE=ROOT/'scripts/data/evidence/usfa-stations/2026-11-26'
COUNTS={'ambiguousParentRows':0,'crossStateRows':11,'distinctMatchedParents':3212,'duplicateSourceRows':31,'exactParentRows':8071,'invalidParentIdentifier':14,'malformedCsvRecords':2,'outsideOrMissingState':5,'physicalAddressRows':7595,'retainedRows':8071,'sourcePhysicalLines':8093,'sourceRows':8092,'unmatchedParentRows':0}
def zip_key(s):
    return s[:5] if isinstance(s,str) and re.fullmatch(r'\d{5}(?:[- ]?\d{4})?',s) else ''
def name_city_zip(name,city,state,postal):
    z=zip_key(postal);n=name_key(name or '');c=name_key(city or '')
    return (n,c,state,z) if n and c and state in STATES and z else None
def station_address_key(a):
    # Preserve unit and other secondary-address text; only normalize street tokens.
    street=', '.join(x for x in a[:2] if x);z=zip_key(a[4])
    clean=address(street,a[2] or '',a[3],z)
    if not physical(clean):return None
    return (normal_street(street),name_key(a[2]),a[3],z)
def neris_indexes():
    raw=(PUBLIC/'neris-stations/index.json').read_bytes();idx=json.loads(raw)
    if idx['summary']['eligibleDepartments']!=30672 or idx['summary']['eligibleStations']!=65970 or idx['publication']!='review-only':raise ValueError('Unexpected NERIS snapshot')
    dep=collections.defaultdict(list);station=collections.defaultdict(list);ids=set();n=0
    for chunk in idx['chunks']:
        if chunk['file']!=chunk['state']+'.json' or chunk['state'] not in STATES:raise ValueError('Invalid NERIS shard')
        data=(PUBLIC/'neris-stations'/chunk['file']).read_bytes()
        if sha(data)!=chunk['sha256']:raise ValueError('NERIS source digest mismatch')
        rows=json.loads(data)
        if len(rows)!=chunk['departmentCount'] or sum(len(d['stations']) for d in rows)!=chunk['stationCount']:raise ValueError('NERIS source counts mismatch')
        for d in rows:
            if d['id'] in ids:raise ValueError('Duplicate NERIS parent')
            ids.add(d['id']);k=name_city_zip(d['name'],d['address'][2],d['state'],d['address'][4])
            if k:dep[k].append({'id':d['id'],'oid':d['oid'],'name':d['name'],'state':d['state']})
            for s in d['stations']:
                n+=1;k=station_address_key(s['address'])
                if k:station[k].append({'id':s['id'],'oid':s['oid'],'name':s['name'],'parentId':d['id'],'parentName':d['name'],'parentState':d['state']})
    if len(ids)!=30672 or n!=65970:raise ValueError('Incomplete NERIS comparison')
    return dep,station,sha(raw)
def candidate_rows(r,parent_candidates,station_index):
    key=station_address_key([r['addressLine1AsReported'],r['addressLine2AsReported'],r['cityAsReported'],r['stationState'],r['postalCodeAsReported']])
    ids={d['id'] for d in parent_candidates}
    return [{**s,'parentNameCityZipCorroborated':s['parentId'] in ids} for s in sorted(station_index.get(key,[]),key=lambda x:x['id'])] if key else []
def compile_report(report):
    if report['counts']!=COUNTS or report['sourceUrl']!=SOURCE or report['referenceUrl']!=REFERENCE or report['sourceSha256']!=SOURCE_SHA or report['nationalRegistrySha256']!=NATIONAL_SHA or report['retrievedAt']!=DATE or report['publication']!='review-only' or report['sourceEditionDate'] is not None or report['verifiedStations']!=0 or report['newMapped']!=0:raise ValueError('Unexpected USFA acquisition')
    if sha((PUBLIC/'national/index.json').read_bytes())!=NATIONAL_SHA:raise ValueError('National source snapshot changed')
    _,national=read_registry();parents=collections.defaultdict(list)
    for r in national:
        k=native_key(r)
        if r[1]=='USFA' and k:parents[k].append(r)
    dep,station,neris_hash=neris_indexes()
    rows=report['records'];seen=set();source_rows=set();fingerprints=collections.Counter(r['sourceRowFingerprint'] for r in rows)
    if len(rows)!=8071 or len(report['malformedSourceAudit'])!=2:raise ValueError('Unexpected acquired record counts')
    grouped=collections.defaultdict(list);metrics=collections.Counter()
    for r in rows:
        fdid=r['fdidAsReported'];state=r['parentState'];key='FDID:'+state+':'+fdid.upper()
        fields={'fdid':fdid,'hqstate':state,'stationstate':r['stationState'],'stationname':r['stationNameAsReported'],'stationaddr1':r['addressLine1AsReported'],'stationaddr2':r['addressLine2AsReported'],'stationcity':r['cityAsReported'],'stationzip':r['postalCodeAsReported']}
        fp=sha(serialize(fields));source_key='USFA-STATION-ROW:'+str(r['sourceRow'])+':'+fp[:16]
        a=address(', '.join(x for x in (fields['stationaddr1'],fields['stationaddr2']) if x),fields['stationcity'] or '',fields['stationstate'],fields['stationzip'] or '')
        if state not in STATES or fields['stationstate'] not in STATES or not re.fullmatch(r'[-A-Za-z0-9.]{1,80}',fdid) or len(parents[key])!=1 or r['parentReviewKey']!=key or r['parentAssociationStatus']!='exact-state-fdid' or parents[key][0][2]!=r['parentNameAsReportedInNationalSnapshot'] or r['sourceRowFingerprint']!=fp or r['sourceKey']!=source_key or source_key in seen or r['sourceRow'] in source_rows or r['duplicateSourceFields']!=(fingerprints[fp]>1) or r['crossState']!=(state!=fields['stationstate']) or r['physicalAddressCandidate']!=(a if physical(a) else None) or r['stationIdentifier'] is not None or r['stationIdentityEstablished'] is not False or r['publicationEligible'] is not False or r['endUserValidationRequired'] is not True:raise ValueError('USFA record lineage mismatch')
        seen.add(source_key);source_rows.add(r['sourceRow']);grouped[key].append(r)
        metrics['physicalAddressRows']+=bool(r['physicalAddressCandidate']);metrics['crossStateRows']+=r['crossState'];metrics['duplicateSourceRows']+=r['duplicateSourceFields']
    if len(grouped)!=3212 or any(metrics[k]!=COUNTS[k] for k in metrics):raise ValueError('USFA catalog accounting mismatch')
    by=collections.defaultdict(list);compare=collections.Counter()
    for key,rows in sorted(grouped.items()):
        n=parents[key][0];candidates=sorted(dep.get(name_city_zip(n[2],n[4],n[3],n[5]),[]),key=lambda x:x['id'])
        compare['parentsWithExactNameCityZipCandidate']+=bool(candidates)
        compare['parentsWithMultipleCandidates']+=len(candidates)>1
        out=[]
        for r in rows:
            hits=candidate_rows(r,candidates,station)
            compare['stationRowsWithExactAddressCandidate']+=bool(hits)
            compare['stationRowsWithMultipleAddressCandidates']+=len(hits)>1
            compare['stationRowsWithParentCorroboration']+=any(h['parentNameCityZipCorroborated'] for h in hits)
            out.append({'sourceKey':r['sourceKey'],'sourceRow':r['sourceRow'],'name':r['stationNameAsReported'],'address':[r['addressLine1AsReported'],r['addressLine2AsReported'],r['cityAsReported'],r['stationState'],r['postalCodeAsReported']],'physicalAddressCandidate':r['physicalAddressCandidate'],'duplicateSourceFields':r['duplicateSourceFields'],'nerisAddressCandidates':hits})
        by[n[3]].append({'key':key,'fdid':key.split(':',2)[2],'state':n[3],'name':n[2],'city':n[4],'zip':n[5],'nerisParentCandidates':candidates,'stations':out})
    files={};chunks=[]
    for state,rows in sorted(by.items()):
        file=state+'.json';raw=serialize(rows);files[file]=raw;chunks.append({'state':state,'file':file,'parents':len(rows),'stations':sum(len(r['stations']) for r in rows),'sha256':sha(raw)})
    files['index.json']=serialize({'schemaVersion':1,'source':'USFA legacy station address export','publication':'review-only','sourceUrl':SOURCE,'referenceUrl':REFERENCE,'retrievedAt':DATE,'sourceEditionDate':None,'artifactId':ARTIFACT,'artifactSha256':DIGEST,'sourceSha256':SOURCE_SHA,'nationalRegistrySha256':NATIONAL_SHA,'nerisIndexSha256':neris_hash,'counts':COUNTS,'comparisonCounts':dict(sorted(compare.items())),'chunks':chunks,'endUserValidationRequired':True,'newMapped':0,'verifiedStations':0})
    return files
def outputs(archive):
    raw=archive.read_bytes()
    if len(raw)>2_000_000 or sha(raw)!=DIGEST:raise ValueError('USFA archive digest mismatch')
    with zipfile.ZipFile(archive) as z:
        if set(z.namelist())!={'summary.json','usfa-station-address-evidence.json'} or len(z.namelist())!=2 or z.getinfo('usfa-station-address-evidence.json').file_size>20_000_000:raise ValueError('Unexpected USFA archive')
        data=z.read('usfa-station-address-evidence.json');summary=json.loads(z.read('summary.json'))
    if sha(data)!=REPORT_SHA or summary['sha256']!=REPORT_SHA or summary['counts']!=COUNTS or summary['sourceSha256']!=SOURCE_SHA or summary['nationalRegistrySha256']!=NATIONAL_SHA:raise ValueError('USFA acquisition digest mismatch')
    return compile_report(json.loads(data))
def main():
    p=argparse.ArgumentParser();p.add_argument('--archive',type=pathlib.Path);p.add_argument('--verify',action='store_true');a=p.parse_args()
    if bool(a.archive)==a.verify:raise ValueError('Choose stage or verify')
    files=outputs(EVIDENCE/'original.zip' if a.verify else a.archive)
    if a.verify:
        if set(files)!={p.name for p in DEST.iterdir()}:raise ValueError('USFA catalog files changed')
        for k,v in files.items():
            if (DEST/k).read_bytes()!=v:raise ValueError('USFA catalog bytes differ')
    else:
        EVIDENCE.mkdir(parents=True,exist_ok=False);DEST.mkdir(parents=True,exist_ok=False);shutil.copyfile(a.archive,EVIDENCE/'original.zip')
        for k,v in files.items():(DEST/k).write_bytes(v)
    print('USFA operational catalog:',json.dumps(json.loads(files['index.json'])['comparisonCounts']))
if __name__=='__main__':main()
