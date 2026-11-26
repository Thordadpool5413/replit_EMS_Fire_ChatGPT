#!/usr/bin/env python3
"""Retain the sanitized federal reference acquisition; compile and geocode secondary evidence independently."""
import argparse,collections,datetime,json,pathlib,re,shutil,zipfile
from stage_nppes_secondary import ARCHIVE_SHA,PERIOD,REF,DEST,serialize,snapshot,fingerprint,address_key
from backfill_provider_locations import ROOT,SOURCE,sha,physical,address,clean,zip5,geocode,BENCHMARK,VINTAGE,ENDPOINT
from historical_primary_snapshot import historical_primary

def retained_snapshot():
    with historical_primary() as loc:return snapshot(loc)

ARTIFACT=15082394618
DIGEST='5c9bfebd46b9252e973e53773e9e32889796774dd61cc1a7df93e212d1f11e94'
EVIDENCE=ROOT/'scripts/data/evidence/nppes-secondary/2026-11-26'
COUNTS={'acceptedSecondary':844,'crossStateSecondary':97,'distinctParentNpisWithSecondary':434,'distinctSecondaryAddresses':830,'duplicateSecondary':11,'outsideParentSnapshot':1283984,'parentsWithoutPrimaryMapWithSecondary':94,'primaryDuplicate':6,'referenceRows':1284848,'sharedAddressRows':25,'targetReferenceRows':864,'unsupportedAddress':3}
ROW_FIELDS={'sourceKey','parentNpi','parentName','parentState','parentSourceDate','parentMappingStatus','sourceRow','address','addressLine1AsReported','addressLine2AsReported','postalCodeAsReported','countryCodeAsReported','crossState','sharedAddressAcrossNpis','stationIdentityEstablished','endUserValidationRequired','publicationEligible'}
def read(archive,parents,loc,national):
    raw=archive.read_bytes()
    if len(raw)>2_000_000 or sha(raw)!=DIGEST:raise ValueError('Sanitized acquisition archive digest mismatch')
    with zipfile.ZipFile(archive) as z:
        names=z.namelist()
        if len(names)!=11 or len(set(names))!=11 or set(names)!={'index.json',*(str(n)+'.json' for n in range(10,20))} or any(m.is_dir() or m.file_size>2_000_000 for m in z.infolist()):raise ValueError('Invalid acquisition ZIP members')
        data={name:z.read(name) for name in names}
    m=json.loads(data['index.json'])
    expected={'schemaVersion':1,'publication':'review-only','sourceUrl':SOURCE,'referenceUrl':REF,'reportingPeriod':PERIOD,'archiveSha256':ARCHIVE_SHA,'sourceMember':'pl_pfile_20050523-20261102.csv','sourceMemberBytes':122937948,'sourceMemberCrc32':'c1db56da','locationManifestSha256':loc,'nationalRegistrySha256':national,'parentNpiCount':19567,'counts':COUNTS,'verifiedStations':0,'newMapped':0}
    if any(m.get(k)!=v for k,v in expected.items()) or len(parents)!=19567:raise ValueError('Acquisition source or count changed')
    chunks=m.get('chunks')
    if not isinstance(chunks,list) or len(chunks)!=10 or [c['prefix'] for c in chunks]!=list(map(str,range(10,20))):raise ValueError('Unexpected source shards')
    rows=[];keys=set();source_rows=set();groups=collections.defaultdict(set)
    for c in chunks:
        file=c['prefix']+'.json'
        if c['file']!=file or sha(data[file])!=c['sha256']:raise ValueError('Shard digest mismatch')
        part=json.loads(data[file])
        if not isinstance(part,list) or len(part)!=c['count']:raise ValueError('Shard count mismatch')
        for r in part:
            if set(r)!=ROW_FIELDS:raise ValueError('Unexpected source row fields')
            npi=r['parentNpi'];p=parents.get(npi);a=r['address']
            if not p or not npi.startswith(c['prefix']) or p['status']=='historical' or (r['parentName'],r['parentState'],r['parentSourceDate'],r['parentMappingStatus'])!=(p['name'],p['state'],p['sourceDate'],p['status']):raise ValueError('Source parent changed')
            l1,l2,postal,country=r['addressLine1AsReported'],r['addressLine2AsReported'],r['postalCodeAsReported'],r['countryCodeAsReported']
            if not clean(l1,160) or l1!=l1.strip() or l2 is not None and (not clean(l2,160) or l2!=l2.strip()) or country not in ('US',None) or not zip5(postal) or not isinstance(a,dict) or not physical(a) or address(', '.join(x for x in (l1,l2) if x),a['city'],a['state'],postal)!=a:raise ValueError('Invalid source address')
            key='NPI:'+npi+':secondary:'+fingerprint(npi,a)
            num=r['sourceRow']
            if r['sourceKey']!=key or key in keys or type(num) is not int or not 1<=num<=COUNTS['referenceRows'] or num in source_rows or p.get('address') and address_key(p['address'])==address_key(a) or r['crossState'] is not (a['state']!=p['state']) or r['publicationEligible'] is not False or r['stationIdentityEstablished'] is not False or r['endUserValidationRequired'] is not True:raise ValueError('Invalid source membership or evidence flags')
            keys.add(key);source_rows.add(num);groups[address_key(a)].add(npi);rows.append(r)
    if len(rows)!=844 or rows!=sorted(rows,key=lambda r:r['sourceKey']) or any(r['sharedAddressAcrossNpis'] is not (len(groups[address_key(r['address'])])>1) for r in rows):raise ValueError('Unexpected source identity grouping')
    actual={'acceptedSecondary':len(rows),'crossStateSecondary':sum(r['crossState'] for r in rows),'distinctParentNpisWithSecondary':len({r['parentNpi'] for r in rows}),'distinctSecondaryAddresses':len(groups),'sharedAddressRows':sum(r['sharedAddressAcrossNpis'] for r in rows),'parentsWithoutPrimaryMapWithSecondary':len({r['parentNpi'] for r in rows if r['parentMappingStatus']!='mapped'})}
    if any(COUNTS[k]!=v for k,v in actual.items()):raise ValueError('Acquisition count mismatch')
    data['index.json']=serialize({**m,'artifactId':ARTIFACT,'artifactSha256':DIGEST})
    return data,rows
def geocode_rows(rows,fn=geocode):
    entries=[{'key':r['sourceKey'],'address':r['address'],'status':'pending','match':None,'countyFips':''} for r in rows]
    counties=json.loads((ROOT/'scripts/fixtures/census-2026-county-identities.json').read_text())['counties']
    fn(entries,{c['USPS']:c['GEOID'][:2] for c in counties},{c['GEOID'] for c in counties},500)
    by={e['key']:e for e in entries}
    points=collections.Counter((e['match']['latitude'],e['match']['longitude']) for e in entries if e['match'])
    out=[]
    for r in rows:
        e=by[r['sourceKey']];m=e['match']
        status={'mapped':'approximate-street-range','no-match':'no-unique-match','unavailable':'source-unavailable'}[e['status']]
        out.append({'sourceKey':r['sourceKey'],'parentNpi':r['parentNpi'],'address':r['address'],'geocodeStatus':status,'sourceGeometry':m,'censusCountyAsReported':e['countyFips'] or None,'sharedApproximatePoint':bool(m and points[(m['latitude'],m['longitude'])]>1),'parentMappingStatus':r['parentMappingStatus'],'stationIdentityEstablished':False,'endUserValidationRequired':True,'publicationEligible':False})
    counts=dict(collections.Counter(r['geocodeStatus'] for r in out))
    return {'schemaVersion':1,'publication':'review-only','sourceUrl':ENDPOINT,'benchmark':BENCHMARK,'vintage':VINTAGE,'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'acquisitionArtifactId':ARTIFACT,'acquisitionArtifactSha256':DIGEST,'counts':counts,'distinctApproximatePoints':len(points),'unmappedParentNpisWithApproximateSecondary':len({r['parentNpi'] for r in out if r['sourceGeometry'] and r['parentMappingStatus']!='mapped'}),'verifiedStations':0,'newMapped':0,'rows':out,'limitations':'Census street-range coordinates are approximate and may resolve only the base address. County is the geocoder-reported address geography, not provider jurisdiction. No station or primary pin publication.'}
def main():
    p=argparse.ArgumentParser();p.add_argument('--archive',type=pathlib.Path);p.add_argument('--verify',action='store_true');p.add_argument('--geocode-output',type=pathlib.Path);a=p.parse_args()
    if bool(a.archive)==a.verify or a.verify and a.geocode_output:raise ValueError('Choose stage or verify')
    parents,loc,nat=retained_snapshot()
    data,rows=read(EVIDENCE/'original.zip' if a.verify else a.archive,parents,loc,nat)
    if a.geocode_output:
        report=geocode_rows(rows);a.geocode_output.mkdir(parents=True,exist_ok=True)
        (a.geocode_output/'nppes-secondary-geocode-review.json').write_bytes(serialize(report))
        print('Federal secondary geocoding:',json.dumps({k:report[k] for k in ('counts','distinctApproximatePoints','unmappedParentNpisWithApproximateSecondary','newMapped')}))
        return
    if a.verify:
        if {p.name for p in DEST.iterdir()}!=set(data):raise ValueError('Unexpected catalog files')
        for k,v in data.items():
            if (DEST/k).read_bytes()!=v:raise ValueError('Catalog bytes changed')
    else:
        EVIDENCE.mkdir(parents=True,exist_ok=False);DEST.mkdir(parents=True,exist_ok=False)
        shutil.copyfile(a.archive,EVIDENCE/'original.zip')
        for k,v in data.items():(DEST/k).write_bytes(v)
    print('NPPES secondary catalog: 844 source address rows, 434 parent NPIs, 830 distinct addresses, 0 verified stations')
if __name__=='__main__':main()
