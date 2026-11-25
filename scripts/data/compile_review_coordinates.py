#!/usr/bin/env python3
"""Reconstruct review-only coordinate evidence from pinned successful acquisition ZIPs."""
import argparse, collections, hashlib, json, math, pathlib, zipfile
from backfill_provider_locations import ROOT, PUBLIC, match_address
DATA=ROOT/'artifacts/ems-territory-intelligence/src/data'
SOURCES={
 'VA':(15063203117,'2833e523dc415fd7a74d019b1b22b800ed3160f68a5711fd62323d65f823485f','virginia-address-review.json','candidates',4,(-83.8,36.4,-75,39.6)),
 'MN':(15064441705,'529269b0a69c670d4084a23029a0fcdd961868ab5e3289930ea026e1f649e7a8','minnesota-address-review.json','candidates',26,(-97.3,43.4,-89.4,49.5)),
 'WI':(15064855858,'daeb68c05fb864848c2d2ac0195a103217061eeb19ab881cb40ba786f79e41ed','wisconsin-address-review.json','placementReviewCandidates',41,(-93,42.4,-86.2,47.1)),
 'MI':(15064303088,'7aef727262e1c60eb381f4a6b32280a44eb9d63ce06dfbb3bd4728db64e0e2e4','michigan-midland-address-review.json','candidates',1,(-85,43.3,-83.7,44)),
}
def digest(raw):return hashlib.sha256(raw).hexdigest()
def read_archive(path,expected,member):
    raw=path.read_bytes()
    if len(raw)>2_000_000 or digest(raw)!=expected:raise ValueError('Archive digest mismatch: '+path.name)
    with zipfile.ZipFile(path) as z:
        found=[i for i in z.infolist() if i.filename==member]
        if len(found)!=1 or found[0].file_size>5_000_000 or found[0].is_dir():raise ValueError('Invalid acquisition member')
        return json.loads(z.read(found[0]))
def compile_evidence(archive_dir,va,multi,manifest_bytes,shards):
    manifest=json.loads(manifest_bytes);manifest_hash=digest(manifest_bytes)
    if any(d.get('publication')!='review-only' or d.get('locationManifestSha256')!=manifest_hash or d.get('snapshotGeneratedAt')!=manifest['generatedAt'] for d in (va,multi)):raise ValueError('Review catalog does not match current location manifest')
    result=[]
    for state,(artifact,checksum,member,collection,count,bounds) in SOURCES.items():
        source=va if state=='VA' else multi['sources'][state]
        url=source.get('sourceUrl') if state=='VA' else source['url']
        if source['workflowArtifactId']!=artifact or source['artifactSha256']!=checksum:raise ValueError('Catalog artifact provenance mismatch')
        report=read_archive(archive_dir/(state+'.zip'),checksum,member)
        if report['publication']!='review-only' or report['locationManifestSha256']!=manifest_hash or report['sourceUrl']!=url or report['checkedAt']!=source['checkedAt']:raise ValueError('Acquisition provenance mismatch')
        if report['counts'].get('unavailable') or report['counts'].get('notAttempted'):raise ValueError('Incomplete acquisition')
        rows=report[collection];catalog=va['candidates'] if state=='VA' else [c for c in multi['candidates'] if c['state']==state]
        expected={c['sourceKey']:c for c in catalog};original={c['key']:c for c in shards[state]}
        if len(rows)!=count or len(expected)!=count or len(catalog)!=count or {c['sourceKey'] for c in rows}!=set(expected):raise ValueError('Candidate identity or count mismatch')
        for c in rows:
            k=c['sourceKey'];e=expected[k];s=original.get(k);oid=c['objectId']
            if not s or s['state']!=state or s['status'] not in ('no-match','unavailable') or s['match'] is not None or s.get('countyFips') or s['name']!=e['registryName'] or s['address']!=e['registryAddress'] or s['sourceDate']!=e['registrySourceDate'] or s['sourceCounty']!=e['registryCounty']:raise ValueError('Registry evidence changed: '+k)
            if type(oid) is not int or not 0<oid<=9007199254740991 or oid!=e['objectId'] or c['matchedAddress']!=e['matchedAddress'] or not match_address(s['address'],c['matchedAddress']) or c['endUserValidationRequired'] is not True or e['endUserValidationRequired'] is not True:raise ValueError('Candidate evidence changed: '+k)
            county=c.get('countyFips')
            if county!=e.get('countyFips') or county and s['sourceCounty'] and county!=s['sourceCounty']:raise ValueError('County conflict: '+k)
            if state=='MI' and (c.get('countyVerified') is not False or c.get('registryCountyAsReported')!=(s['sourceCounty'] or None)):raise ValueError('Municipal county status changed')
            placement=c.get('pointType') if state=='VA' else (c['sourceAttributes'].get('place_loc') if state=='MN' else c.get('placementAsReported'))
            if placement!=(e.get('pointType') if state=='VA' else e.get('placementAsReported')) or c.get('recordUpdatedAt')!=e.get('recordUpdatedAt'):raise ValueError('Source metadata changed: '+k)
            if state=='WI' and (c.get('publication')!='review-only' or c.get('operationalStationVerified') is not False or c.get('reason')!='placement_not_allowlisted'):raise ValueError('Wisconsin review status changed')
            lat,lon=c['latitude'],c['longitude']
            if any(type(x) not in (int,float) or not math.isfinite(x) for x in (lat,lon)) or not (bounds[0]<=lon<=bounds[2] and bounds[1]<=lat<=bounds[3]):raise ValueError('Invalid coordinates: '+k)
            if state=='VA' and (e['latitude']!=lat or e['longitude']!=lon):raise ValueError('Virginia coordinate disagreement')
            result.append({'sourceKey':k,'state':state,'objectId':oid,'matchedAddress':c['matchedAddress'],'latitude':lat,'longitude':lon,'countyFips':county,'countyVerified':bool(county),'placementAsReported':placement,'recordUpdatedAt':c.get('recordUpdatedAt'),'sourceUrl':url,'checkedAt':report['checkedAt'],'workflowRunId':source['workflowRunId'],'workflowArtifactId':artifact,'artifactSha256':checksum,'endUserValidationRequired':True,'publicationEligible':False})
    if len({c['sourceKey'] for c in result})!=72:raise ValueError('Duplicate source identity')
    points=collections.Counter((c['state'],c['objectId']) for c in result)
    coords=collections.defaultdict(set)
    for c in result:coords[(c['state'],c['objectId'])].add((c['latitude'],c['longitude']))
    if any(len(v)!=1 for v in coords.values()):raise ValueError('Same native object has inconsistent geometry')
    for c in result:c['sharedSourcePoint']=points[(c['state'],c['objectId'])]>1
    return {'schemaVersion':1,'publication':'review-only','snapshotGeneratedAt':manifest['generatedAt'],'locationManifestSha256':manifest_hash,'counts':dict(collections.Counter(c['state'] for c in result)),'distinctSourcePoints':len(points),'publicationEligible':0,'candidates':sorted(result,key=lambda c:c['sourceKey'])}
def main():
    p=argparse.ArgumentParser();p.add_argument('--archives',type=pathlib.Path,required=True);p.add_argument('--output',type=pathlib.Path,required=True);a=p.parse_args()
    loc=PUBLIC/'locations';raw=(loc/'index.json').read_bytes();idx=json.loads(raw)
    shards={}
    for state in SOURCES:
        chunks=[c for c in idx['chunks'] if c['state']==state]
        if len(chunks)!=1:raise ValueError('Unexpected location shard count')
        meta=chunks[0];blob=(loc/meta['file']).read_bytes()
        if digest(blob)!=meta['sha256']:raise ValueError('Location shard digest mismatch')
        shards[state]=json.loads(blob)
    report=compile_evidence(a.archives,json.loads((DATA/'virginiaAddressReview.json').read_text()),json.loads((DATA/'multiStateAddressReview.json').read_text()),raw,shards)
    a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(report,indent=2,allow_nan=False)+'\n')
    print('Coordinate provenance:',json.dumps({k:report[k] for k in ('counts','distinctSourcePoints','publicationEligible')}))
if __name__=='__main__':main()
