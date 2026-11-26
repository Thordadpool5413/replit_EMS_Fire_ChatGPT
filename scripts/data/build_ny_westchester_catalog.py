#!/usr/bin/env python3
"""Retain the actual Westchester source acquisition and publish an independent review catalog."""
import argparse,collections,json,pathlib,shutil,zipfile,re
from backfill_provider_locations import PUBLIC,ROOT,read_registry,sha
from compile_review_coordinates import read_archive
from stage_ny_westchester_ems import SOURCE,AUTHORITY,reconcile
ARTIFACT=15082079577
DIGEST='217cb18fdb03a3ce8e0b2c4baaaa8e49c08bb04ffb6916cb41c32ab6ca5d4d13'
SOURCE_HASH='8c4fdf790022ac323685c9ff755130135ae960c83ee034a2d26fdb8dff7e5754'
NATIONAL_HASH='6d828632d3933a2815e497bfa189ae4af75e9b847911903b94bc4f0966b748ca'
MEMBER='ny-westchester-agency-review.json'
DEST=PUBLIC/'state-ems-review'
EVIDENCE=ROOT/'scripts/data/evidence/ny-westchester/2026-11-26'
COUNTS={'records':88,'codeStatus':{'unique-as-reported':82,'duplicate':4,'missing':1,'non-four-digit':1},'nationalMatchStatus':{'noCandidate':68,'singleCandidate':20}}
FIELDS=('name','headquartersStreetAsReported','cityAsReported','stateAsReported','postalCodeAsReported','agencyCodeAsReported')
def serialize(a):return (json.dumps(a,ensure_ascii=True,sort_keys=True,separators=(',',':'))+'\n').encode()
def build(report,national):
    expected={'schemaVersion':1,'jurisdiction':'NY','sourceName':'Westchester Regional EMS Council','sourceUrl':SOURCE,'authorityReference':AUTHORITY,'sourceDate':None,'sourceSha256':SOURCE_HASH,'nationalRegistrySha256':NATIONAL_HASH,'retrievedAt':'2026-11-26T02:43:49.022165+00:00','publication':'review-only','counts':COUNTS,'verifiedStations':0,'newMapped':0}
    if any(report.get(k)!=v for k,v in expected.items()):raise ValueError('Unexpected pinned acquisition metadata')
    rows=report.get('records')
    if not isinstance(rows,list) or len(rows)!=88:raise ValueError('Unexpected source rows')
    codes=collections.Counter(r['agencyCodeAsReported'] for r in rows if r['agencyCodeAsReported'])
    clean=[]
    for i,row in enumerate(rows,1):
        if set(row)!=set(FIELDS)|{'sourceRow','recordFingerprint','reviewKey','endUserValidationRequired','publicationEligible','agencyCodeStatus','nationalReviewCandidates'}:raise ValueError('Unexpected source row fields')
        fields={k:row[k] for k in FIELDS}
        if not fields['name'] or any(v is not None and (not isinstance(v,str) or not v or len(v)>400 or v!=v.strip() or re.search(r'[\x00-\x1f\x7f]',v)) for v in fields.values()):raise ValueError('Invalid organization row')
        code=fields['agencyCodeAsReported']
        if code and not re.fullmatch(r'\d{1,12}',code):raise ValueError('Invalid literal agency code')
        fp=sha(json.dumps(fields,sort_keys=True,separators=(',',':'),ensure_ascii=True).encode())
        status='missing' if not code else 'duplicate' if codes[code]>1 else 'non-four-digit' if len(code)!=4 else 'unique-as-reported'
        canonical={**fields,'sourceRow':i,'recordFingerprint':fp,'reviewKey':'NY-WREMSCO:row:'+str(i)+':'+fp[:16],'endUserValidationRequired':True,'publicationEligible':False,'agencyCodeStatus':status}
        clean.append(canonical)
    rebuilt=reconcile(clean,national)
    if rebuilt!=rows:raise ValueError('Original source identity review cannot be reproduced')
    counts={'records':len(rebuilt),'codeStatus':dict(collections.Counter(r['agencyCodeStatus'] for r in rebuilt)),'nationalMatchStatus':dict(collections.Counter('singleCandidate' if len(r['nationalReviewCandidates'])==1 else 'multipleCandidates' if r['nationalReviewCandidates'] else 'noCandidate' for r in rebuilt))}
    if counts!=COUNTS:raise ValueError('Acquisition count mismatch')
    return {**expected,'artifactId':ARTIFACT,'artifactSha256':DIGEST,'scope':report['scope'],'records':rebuilt}
def outputs(archive):
    with zipfile.ZipFile(archive) as z:
        if z.namelist()!=[MEMBER]:raise ValueError('Unexpected archive members')
    report=read_archive(archive,DIGEST,MEMBER)
    _,national=read_registry()
    if sha((PUBLIC/'national/index.json').read_bytes())!=NATIONAL_HASH:raise ValueError('National snapshot changed; rebuild comparison evidence')
    data=serialize(build(report,national))
    return {'NY-westchester-review.json':data,'NY-westchester-index.json':serialize({'schemaVersion':1,'publication':'review-only','file':'NY-westchester-review.json','sha256':sha(data),'count':88})}
def main():
    p=argparse.ArgumentParser();p.add_argument('--archive',type=pathlib.Path);p.add_argument('--verify',action='store_true');a=p.parse_args()
    if bool(a.archive)==a.verify:raise ValueError('Choose stage or verify')
    values=outputs(EVIDENCE/'original.zip' if a.verify else a.archive)
    if a.verify:
        for name,data in values.items():
            if (DEST/name).read_bytes()!=data:raise ValueError('Catalog bytes differ')
    else:
        EVIDENCE.mkdir(parents=True,exist_ok=False);DEST.mkdir(parents=True,exist_ok=True)
        shutil.copyfile(a.archive,EVIDENCE/'original.zip')
        for name,data in values.items():(DEST/name).write_bytes(data)
    print('NY Westchester catalog: 88 source rows, 82 unique four-digit codes, 20 comparison matches, 0 new mapped records')
if __name__=='__main__':main()
