#!/usr/bin/env python3
"""Verify and retain the exact successful NJ checkpoint without granting publication rights."""
import argparse,collections,json,pathlib,shutil
from backfill_provider_locations import PUBLIC,ROOT,read_registry,verify,sha
from compile_review_coordinates import read_archive
from recovery_checkpoint import fingerprint,digest
ARTIFACT=15066188860
CHECKSUM='f468cf2a8271c9cf181a7af7fe69257c9bde85e28be95f56551b021797cd163b'
MEMBER='recovery-checkpoint.json'
DEST=ROOT/'scripts/data/evidence/recovery-checkpoints/2026-11-25/nj-addresspoints'
def validate(report,entries,manifest_hash):
    if report.get('source')!='nj-addresspoints' or report.get('schemaVersion')!=1 or report.get('completeMetadataCheck') is not True or report.get('acquisitionStatus')!='completed' or report.get('publication')!='review-only' or report.get('locationManifestSha256')!=manifest_hash or report.get('candidates')!=[] or report.get('candidateKeys')!=[]:raise ValueError('Unexpected checkpoint')
    counts=report['counts'];metadata=counts['metadata']
    if not metadata.get('lastEditDate') or digest(metadata)!=report['metadataSha256'] or metadata['serviceItemId']!='5051f228c9074aa7b4116f835893c9fa':raise ValueError('Checkpoint metadata mismatch')
    rows=report['rows'];expected={'no-match':244,'ambiguous':7,'review':2}
    if dict(collections.Counter(r['status'] for r in rows.values()))!=expected or any(counts.get(k)!=v for k,v in expected.items()) or counts.get('unsupported')!=11 or counts.get('requests')!=31 or counts.get('unavailable') or counts.get('not_attempted'):raise ValueError('Checkpoint counts mismatch')
    if sorted(report['reviewKeys'])!=sorted(k for k,r in rows.items() if r['status'] in ('ambiguous','review')):raise ValueError('Review keys mismatch')
    by_key={e['key']:e for e in entries}
    if len(by_key)!=len(entries):raise ValueError('Duplicate registry identity')
    for k,row in rows.items():
        e=by_key.get(k)
        if not e or e['state']!='NJ' or e['status'] not in ('no-match','unavailable') or row['fingerprint']!=fingerprint(e) or row['checkedAt']!='2026-11-25':raise ValueError('Checkpoint record mismatch: '+k)
    return {'source':'nj-addresspoints','artifactId':ARTIFACT,'artifactSha256':CHECKSUM,'locationManifestSha256':manifest_hash,'metadataSha256':report['metadataSha256'],'rowCount':253,'negativeResults':244,'reviewResults':9,'publication':'review-only','reusePolicy':'Original source-version and snapshot freshness checks still required; no automatic publication'}
def main():
    p=argparse.ArgumentParser();p.add_argument('--archive',type=pathlib.Path);p.add_argument('--verify',action='store_true');a=p.parse_args()
    if bool(a.archive)==a.verify:raise ValueError('Choose one operation')
    loc=PUBLIC/'locations';m,rows=read_registry();fl=json.loads((PUBLIC/'state-ems/FL.json').read_bytes());verify(loc,m,rows,fl)
    raw=(loc/'index.json').read_bytes();idx=json.loads(raw)
    entries=[e for c in idx['chunks'] if c['state']=='NJ' for e in json.loads((loc/c['file']).read_bytes())]
    path=DEST/'original.zip' if a.verify else a.archive
    report=read_archive(path,CHECKSUM,MEMBER);manifest=validate(report,entries,sha(raw))
    if a.verify:
        if set(x.name for x in DEST.iterdir())!={'original.zip',MEMBER,'manifest.json'} or json.loads((DEST/MEMBER).read_bytes())!=report or json.loads((DEST/'manifest.json').read_bytes())!=manifest:raise ValueError('Retained checkpoint changed')
    else:
        DEST.mkdir(parents=True,exist_ok=False);shutil.copyfile(path,DEST/'original.zip');(DEST/MEMBER).write_text(json.dumps(report,indent=2)+'\n');(DEST/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    print('NJ checkpoint verified:',json.dumps(manifest))
if __name__=='__main__':main()
