#!/usr/bin/env python3
"""Retain Census geocodes for federal secondary practice addresses, separate from primary pins."""
import argparse,collections,json,math,pathlib,shutil,zipfile
from backfill_provider_locations import PUBLIC,ROOT,sha,match_address,ENDPOINT,BENCHMARK,VINTAGE
from retain_nppes_secondary import read as read_secondary,EVIDENCE as SECONDARY_EVIDENCE,ARTIFACT as SECONDARY_ARTIFACT,DIGEST as SECONDARY_DIGEST
from stage_nppes_secondary import snapshot,serialize
ARTIFACT=15082474553
DIGEST='40271fafdd6b0b452d5ed8573baafc17aa39a939555de362b4c0d0454fd9ea3a'
MEMBER='nppes-secondary-geocode-review.json'
CHECKED='2026-11-26T02:58:29.015369+00:00'
DEST=PUBLIC/'nppes-secondary-geocode'
EVIDENCE=ROOT/'scripts/data/evidence/nppes-secondary-geocode/2026-11-26'
COUNTS={'approximate-street-range':580,'no-unique-match':264}
FIELDS={'sourceKey','parentNpi','address','geocodeStatus','sourceGeometry','censusCountyAsReported','sharedApproximatePoint','parentMappingStatus','stationIdentityEstablished','endUserValidationRequired','publicationEligible'}
def validate_row(r,source,counties):
    if set(r)!=FIELDS or any(r[k]!=source[k] for k in ('sourceKey','parentNpi','address','parentMappingStatus')) or r['stationIdentityEstablished'] is not False or r['publicationEligible'] is not False or r['endUserValidationRequired'] is not True or type(r['sharedApproximatePoint']) is not bool:raise ValueError('Secondary location identity or review flags changed')
    m=r['sourceGeometry'];cf=r['censusCountyAsReported'];a=r['address']
    if r['geocodeStatus']=='approximate-street-range':
        if not isinstance(m,dict) or set(m)!={'latitude','longitude','matchedAddress','method'} or m['method']!='census-address-range' or not isinstance(m['matchedAddress'],str) or not match_address(a,m['matchedAddress']) or counties.get(cf)!=a['state']:raise ValueError('Unmatched source address or county')
        lat,lon=m['latitude'],m['longitude']
        if any(type(x) not in (int,float) or not math.isfinite(x) for x in (lat,lon)) or not -90<=lat<=90 or not -180<=lon<=180 or not (lat or lon):raise ValueError('Invalid approximate coordinate')
    elif r['geocodeStatus']=='no-unique-match':
        if m is not None or cf is not None or r['sharedApproximatePoint']:raise ValueError('Unmatched row has geographic evidence')
    else:raise ValueError('Unexpected geocoding status')
def compile_report(report,sources,counties,secondary_index_hash):
    meta={'schemaVersion':1,'publication':'review-only','sourceUrl':ENDPOINT,'benchmark':BENCHMARK,'vintage':VINTAGE,'checkedAt':CHECKED,'acquisitionArtifactId':SECONDARY_ARTIFACT,'acquisitionArtifactSha256':SECONDARY_DIGEST,'counts':COUNTS,'distinctApproximatePoints':559,'unmappedParentNpisWithApproximateSecondary':64,'verifiedStations':0,'newMapped':0}
    if any(report.get(k)!=v for k,v in meta.items()):raise ValueError('Original geocoding provenance changed')
    rows=report.get('rows');by={r['sourceKey']:r for r in sources}
    if not isinstance(rows,list) or len(rows)!=844 or len(by)!=844 or {r['sourceKey'] for r in rows}!=set(by):raise ValueError('Secondary source membership mismatch')
    for r in rows:validate_row(r,by[r['sourceKey']],counties)
    points=collections.Counter((r['sourceGeometry']['latitude'],r['sourceGeometry']['longitude']) for r in rows if r['sourceGeometry'])
    if any(r['sharedApproximatePoint'] is not bool(r['sourceGeometry'] and points[(r['sourceGeometry']['latitude'],r['sourceGeometry']['longitude'])]>1) for r in rows):raise ValueError('Shared coordinate classification mismatch')
    if dict(collections.Counter(r['geocodeStatus'] for r in rows))!=COUNTS or len(points)!=559 or len({r['parentNpi'] for r in rows if r['sourceGeometry'] and r['parentMappingStatus']!='mapped'})!=64:raise ValueError('Geocode coverage mismatch')
    groups=collections.defaultdict(list)
    for r in sorted(rows,key=lambda r:r['sourceKey']):groups[r['parentNpi'][:2]].append(r)
    result={};chunks=[]
    for prefix,part in sorted(groups.items()):
        name=prefix+'.json';raw=serialize(part);result[name]=raw
        chunks.append({'prefix':prefix,'file':name,'count':len(part),'sha256':sha(raw)})
    result['index.json']=serialize({**meta,'artifactId':ARTIFACT,'artifactSha256':DIGEST,'secondaryIndexSha256':secondary_index_hash,'rowCount':844,'chunks':chunks,'limitations':report['limitations']})
    return result
def outputs(archive):
    raw=archive.read_bytes()
    if len(raw)>2_000_000 or sha(raw)!=DIGEST:raise ValueError('Geocoding archive digest mismatch')
    with zipfile.ZipFile(archive) as z:
        if z.namelist()!=[MEMBER] or z.infolist()[0].file_size>2_000_000:raise ValueError('Unexpected geocoding archive members')
        report=json.loads(z.read(MEMBER))
    from retain_nppes_secondary import retained_snapshot
    parents,loc,nat=retained_snapshot()
    source_files,sources=read_secondary(SECONDARY_EVIDENCE/'original.zip',parents,loc,nat)
    for k,v in source_files.items():
        if (PUBLIC/'nppes-secondary'/k).read_bytes()!=v:raise ValueError('Integrated secondary catalog has changed')
    counties={c['GEOID']:c['USPS'] for c in json.loads((ROOT/'scripts/fixtures/census-2026-county-identities.json').read_text())['counties']}
    return compile_report(report,sources,counties,sha(source_files['index.json']))
def main():
    p=argparse.ArgumentParser();p.add_argument('--archive',type=pathlib.Path);p.add_argument('--verify',action='store_true');a=p.parse_args()
    if bool(a.archive)==a.verify:raise ValueError('Choose stage or verify')
    data=outputs(EVIDENCE/'original.zip' if a.verify else a.archive)
    if a.verify:
        if {p.name for p in DEST.iterdir()}!=set(data):raise ValueError('Unexpected geographic catalog files')
        for k,v in data.items():
            if (DEST/k).read_bytes()!=v:raise ValueError('Published source bytes changed')
    else:
        EVIDENCE.mkdir(parents=True,exist_ok=False);DEST.mkdir(parents=True,exist_ok=False)
        shutil.copyfile(a.archive,EVIDENCE/'original.zip')
        for k,v in data.items():(DEST/k).write_bytes(v)
    print('Secondary geocode catalog: 844 source rows, 580 approximate address matches, 559 distinct points, 64 previously unmapped parents, 0 verified stations')
if __name__=='__main__':main()
