#!/usr/bin/env python3
"""Verify permanent historical review evidence without any network or publication."""
import argparse, collections, hashlib, json, math, pathlib
ROOT=pathlib.Path(__file__).resolve().parents[2]
EVIDENCE=ROOT/'scripts/data/evidence/review-coordinate-provenance-2026-11-25.json'
REPORT_SHA='3a18f78b017681f387ff17cbdc51ecc4b8b14c386973056fa1de49adc7080a89'
ARCHIVE_SHA='2b7ee049c1e09fc5b3dd90438e4ae52ea6751f6b654285ac508031758dd40090'
def verify(path=EVIDENCE):
    raw=path.read_bytes()
    if hashlib.sha256(raw).hexdigest()!=REPORT_SHA:raise ValueError('Historical evidence digest mismatch')
    report=json.loads(raw)
    if report['publication']!='review-only' or report['publicationEligible']!=0:raise ValueError('Not review-only')
    rows=report['candidates']
    counts=collections.Counter(c['state'] for c in rows)
    points=collections.Counter((c['state'],c['objectId']) for c in rows)
    if len(rows)!=72 or len({c['sourceKey'] for c in rows})!=72 or counts!=report['counts'] or len(points)!=61:raise ValueError('Evidence counts mismatch')
    for c in rows:
        if c['endUserValidationRequired'] is not True or c['publicationEligible'] is not False or c['sharedSourcePoint']!=(points[(c['state'],c['objectId'])]>1):raise ValueError('Invalid publication or identity status')
        if not all(type(c[k]) in (int,float) and math.isfinite(c[k]) for k in ('latitude','longitude')):raise ValueError('Invalid coordinate')
    return report
def main():
    p=argparse.ArgumentParser();p.add_argument('--evidence',type=pathlib.Path,default=EVIDENCE);a=p.parse_args()
    report=verify(a.evidence)
    print('Retained historical evidence:',json.dumps({'records':len(report['candidates']),'distinctSourcePoints':report['distinctSourcePoints'],'publicationEligible':0,'sha256':REPORT_SHA}))
if __name__=='__main__':main()
