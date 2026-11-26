#!/usr/bin/env python3
"""Reproduce compact review-only Texas location catalog from the pinned acquisition."""
import argparse,collections,json,pathlib,shutil
from backfill_provider_locations import PUBLIC,ROOT,sha
from compile_review_coordinates import read_archive
from acquire_texas_station_evidence import LAYER,ITEM,NAME,EDIT,EDITION,FIELDS,ROSTER_SHA,COUNT,roster_index,review,features
ARTIFACT=15079638432
DIGEST='731e0df30443604a1434ee4f22a071ad892878f0133f7d85191092be7f0c0a2b'
MEMBER='texas-station-location-evidence.json'
DEST=PUBLIC/'state-ems-review'
EVIDENCE=ROOT/'scripts/data/evidence/texas-station-locations/2026-11-26'
EXPECTED={'associationStatus':{'exact_license_and_name_review':566,'no_exact_license':166,'license_name_conflict':3},'addressBasis':{'input_matches_reported_mailing':707,'input_differs_from_reported_mailing':28},'reviewStatus':{'withheld':724,'historical_point_requires_validation':11}}
def build(report,roster):
    required={'schemaVersion':1,'publication':'review-only','sourceUrl':LAYER,'sourceEdition':EDITION,'rosterSha256':ROSTER_SHA,'sourceFeatureCount':COUNT,'distinctParentReviewKeys':566,'counts':EXPECTED,'verifiedStations':0,'newMapped':0,'sourceMetadata':{'serviceItemId':ITEM,'layerId':6,'name':NAME,'lastEditDate':EDIT,'fields':FIELDS}}
    if any(report.get(k)!=v for k,v in required.items()):raise ValueError('Pinned acquisition provenance mismatch')
    idx=roster_index(roster);rows=report['rows'];ids=[r['objectId'] for r in rows]
    if len(rows)!=COUNT or len(set(ids))!=COUNT or ids!=sorted(ids):raise ValueError('Source object membership mismatch')
    reconstructed=[]
    for row in rows:
        g=row['sourceGeometry']
        f={'attributes':row['sourceAttributes'],'geometry':None if g is None else {'x':g['longitude'],'y':g['latitude']}}
        canonical=features({'features':[f],'spatialReference':{'wkid':4326}},[row['objectId']])[row['objectId']]
        reconstructed.append(review(canonical,idx))
    parents=collections.Counter(r['parentReviewKey'] for r in reconstructed if r['parentReviewKey'])
    coords=collections.Counter((r['sourceGeometry']['longitude'],r['sourceGeometry']['latitude']) for r in reconstructed if r['sourceGeometry'])
    for row in reconstructed:
        row['sourceFeaturesForParent']=parents[row['parentReviewKey']] if row['parentReviewKey'] else None
        g=row['sourceGeometry'];row['sharedSourceCoordinate']=bool(g and coords[(g['longitude'],g['latitude'])]>1)
        if row['sharedSourceCoordinate']:row['reviewStatus']='withheld'
    if reconstructed!=rows or len(parents)!=566:raise ValueError('Original review decisions cannot be reproduced')
    if {k:dict(collections.Counter(r[k] for r in rows)) for k in EXPECTED}!=EXPECTED:raise ValueError('Review outcome mismatch')
    candidates=[]
    for r in rows:
        if r['reviewStatus']!='historical_point_requires_validation':continue
        a=r['sourceAttributes'];parent=idx[str(a['USER_License_Number'])][0]
        candidates.append({'sourceKey':r['sourceKey'],'objectId':r['objectId'],'parentReviewKey':r['parentReviewKey'],'parentName':parent['name'],'parentIdentifier':parent['identifier'],'parentNationalReviewKeys':[c['sourceKey'] for c in parent['nationalReviewCandidates']],'reportedAddress':{'street':a['IN_Address'],'city':a['IN_City'],'state':a['IN_Region'],'zip':a['IN_Postal']},'matchedAddress':a['Match_addr'],'sourceGeometry':r['sourceGeometry'],'geocodeType':a['Addr_type'],'score':a['Score'],'sourceEdition':EDITION,'stationIdentityEstablished':False,'endUserValidationRequired':True,'publicationEligible':False})
    if len(candidates)!=11 or len({r['parentReviewKey'] for r in candidates})!=11:raise ValueError('Candidate count mismatch')
    return {'schemaVersion':1,'publication':'review-only','sourceUrl':LAYER,'sourceEdition':EDITION,'checkedAt':report['checkedAt'],'artifactId':ARTIFACT,'artifactSha256':DIGEST,'rosterSha256':ROSTER_SHA,'sourceFeatureCount':COUNT,'parentMatchCount':566,'mailingMatchCount':707,'withheldCount':724,'verifiedStations':0,'candidates':candidates}
def serialize(value):return (json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=True)+'\n').encode()
def files(archive):
    raw=(DEST/'TX-review.json').read_bytes()
    if sha(raw)!=ROSTER_SHA:raise ValueError('Texas parent roster changed')
    catalog=build(read_archive(archive,DIGEST,MEMBER),json.loads(raw));data=serialize(catalog)
    return {'TX-location-review.json':data,'TX-location-index.json':serialize({'schemaVersion':1,'publication':'review-only','file':'TX-location-review.json','sha256':sha(data),'count':11,'rosterSha256':ROSTER_SHA})}
def main():
    p=argparse.ArgumentParser();p.add_argument('--archive',type=pathlib.Path);p.add_argument('--verify',action='store_true');a=p.parse_args()
    if bool(a.archive)==a.verify:raise ValueError('Choose stage or verify')
    outputs=files(EVIDENCE/'original.zip' if a.verify else a.archive)
    if a.verify:
        for k,v in outputs.items():
            if (DEST/k).read_bytes()!=v:raise ValueError('Catalog differs from original evidence')
    else:
        EVIDENCE.mkdir(parents=True,exist_ok=False);shutil.copyfile(a.archive,EVIDENCE/'original.zip')
        for k,v in outputs.items():(DEST/k).write_bytes(v)
    print('Texas location catalog verified: 735 retained features, 566 parent matches, 11 historical candidates, 0 verified stations')
if __name__=='__main__':main()
