#!/usr/bin/env python3
"""Preserve original public acquisition archives and reproducible review evidence."""
import argparse, json, pathlib, shutil, subprocess, sys, tempfile
from compile_review_coordinates import SOURCES, digest, read_archive
from backfill_provider_locations import ROOT
PROVENANCE=(15064969235,'2b7ee049c1e09fc5b3dd90438e4ae52ea6751f6b654285ac508031758dd40090','review-coordinate-provenance.json')
RELEASE='2026-11-25'
BASE='15e096a65f788182a8fb08487976547b02e34df3'
DEST=ROOT/'scripts/data/evidence/review-coordinates'/RELEASE
def verify_archives(source):
    for state,(_,checksum,member,*_) in SOURCES.items():
        read_archive(source/(state+'.zip'),checksum,member)
    return read_archive(source/'provenance.zip',PROVENANCE[1],PROVENANCE[2])
def release_manifest(source,compiled):
    archives=[{'filename':state+'.zip','artifactId':v[0],'sha256':v[1],'member':v[2]} for state,v in sorted(SOURCES.items())]
    archives.append({'filename':'provenance.zip','artifactId':PROVENANCE[0],'sha256':PROVENANCE[1],'member':PROVENANCE[2]})
    return {'schemaVersion':1,'release':RELEASE,'sourceCommit':BASE,'publication':'review-only','archives':archives,'compiledSha256':digest(compiled.read_bytes()),'candidateCount':72,'distinctSourcePoints':61,'publicationEligible':0}
def reconstruct(source,target):
    expected=verify_archives(source)
    subprocess.run([sys.executable,str(ROOT/'scripts/data/compile_review_coordinates.py'),'--archives',str(source),'--output',str(target)],check=True)
    actual=json.loads(target.read_bytes())
    if actual!=expected or actual['publicationEligible']!=0 or actual['distinctSourcePoints']!=61 or len(actual['candidates'])!=72 or any(c['publicationEligible'] is not False for c in actual['candidates']):
        raise ValueError('Reconstructed evidence differs from original successful run')
def retain(source,dest):
    if dest.exists():raise ValueError('Immutable release already exists; never overwrite')
    with tempfile.TemporaryDirectory() as tmp:
        p=pathlib.Path(tmp);compiled=p/'review-coordinate-provenance.json'
        reconstruct(source,compiled)
        manifest=release_manifest(source,compiled)
        dest.mkdir(parents=True,exist_ok=False)
        for a in manifest['archives']:shutil.copyfile(source/a['filename'],dest/a['filename'])
        shutil.copyfile(compiled,dest/compiled.name)
        (dest/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    verify_retained(dest)
def verify_retained(dest):
    expected=verify_archives(dest)
    compiled=dest/'review-coordinate-provenance.json'
    if json.loads(compiled.read_bytes())!=expected or json.loads((dest/'manifest.json').read_bytes())!=release_manifest(dest,compiled):
        raise ValueError('Retained evidence or manifest changed')
    if set(p.name for p in dest.iterdir())!={'VA.zip','MN.zip','WI.zip','MI.zip','provenance.zip','manifest.json','review-coordinate-provenance.json'}:
        raise ValueError('Unexpected retained evidence file')
    print('Retained evidence verified: 5 original archives; 72 review-only records; 61 distinct points; 0 eligible')
def main():
    p=argparse.ArgumentParser();p.add_argument('--archives',type=pathlib.Path);p.add_argument('--verify',action='store_true');a=p.parse_args()
    if a.verify:
        if a.archives:raise ValueError('Choose one operation')
        verify_retained(DEST)
    elif a.archives:retain(a.archives,DEST)
    else:p.error('Use --archives or --verify')
if __name__=='__main__':main()
