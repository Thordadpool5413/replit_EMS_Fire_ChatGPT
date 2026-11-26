#!/usr/bin/env python3
"""Freeze truthful regenerated evidence pins after full native replay.

This writes review-branch code pins; it never mutates public location shards.
Ordinary Address candidates must reproduce the historical report byte-for-byte.
Places is reconstructed source code and must pass its full replay and expected
candidate-count gate before its newly measured report/archive pins are enabled.
"""
import argparse
import importlib
import json
import re

from backfill_provider_locations import ROOT
from stage_overture_primary_addresses import sha

HISTORICAL_ADDRESS_REPORT='2adb2dc598586af97b9082287a816cc8e0fc238ae9276633bf8518943a41527e'


def replace_pin(path,name,value):
    text=path.read_text()
    updated,count=re.subn(r"(?m)^"+re.escape(name)+r"='[^']*'$",name+"='"+value+"'",text)
    if count!=1: raise ValueError('Missing unique explicit pin '+name)
    path.write_text(updated)


def main():
    p=argparse.ArgumentParser();p.add_argument('--source',choices=('addresses','places'),required=True)
    p.add_argument('--expected-candidates',type=int,required=True);a=p.parse_args()
    name='retain_overture_primary_'+a.source;module=importlib.import_module(name)
    evidence=module.EVIDENCE;manifest=json.loads((evidence/'manifest.json').read_bytes())
    raw=(evidence/'original.zip').read_bytes()
    if sha(raw)!=manifest['archiveSha256']: raise ValueError('Generated archive hash differs')
    if a.source=='places':
        files=module.read_archive(raw);report,_=module.validate_files(files)
    else:
        import io,zipfile
        with zipfile.ZipFile(io.BytesIO(raw)) as z: files={i.filename:z.read(i) for i in z.infolist()}
        report,_=module.validate_files(files)
        if manifest['reportSha256']!=HISTORICAL_ADDRESS_REPORT:
            raise ValueError('Ordinary Address report no longer reproduces the frozen historical edition')
    if len(report['candidates'])!=a.expected_candidates or manifest['candidateCount']!=a.expected_candidates:
        raise ValueError('Recovered candidate count differs; preserve diagnostics for explicit review')
    member='primary-address-candidates.json' if a.source=='addresses' else 'primary-place-address-candidates.json'
    if sha(files[member])!=manifest['reportSha256']: raise ValueError('Generated report digest differs')
    path=ROOT/'scripts/data'/(name+'.py')
    for key,value in [('SOURCE_INVENTORY_SHA256',manifest['sourceInventorySha256']),
                      ('ARCHIVE_SHA256',manifest['archiveSha256']),('REPORT_SHA256',manifest['reportSha256'])]:
        replace_pin(path,key,value)
    print(json.dumps({'source':a.source,'candidateCount':a.expected_candidates,
                     'sourceInventorySha256':manifest['sourceInventorySha256'],
                     'archiveSha256':manifest['archiveSha256'],'reportSha256':manifest['reportSha256']},indent=2))


if __name__=='__main__': main()
