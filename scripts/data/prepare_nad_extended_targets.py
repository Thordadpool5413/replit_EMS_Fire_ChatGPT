#!/usr/bin/env python3
"""Bind native CMS and NERIS site variants to the original NAD target scope."""
import argparse
import copy
import json
import pathlib
from backfill_provider_locations import ROOT, sha
from address_normalization import physical_address
from primary_recovery_baseline import load_primary_baseline
from retain_nppes_native_source import DEFAULT as CMS_EVIDENCE, verify as verify_cms

def dump(value):
    return (json.dumps(value,sort_keys=True,ensure_ascii=True,separators=(',',':'),allow_nan=False)+'\n').encode()

def prepare(cms_path,mailing_path,mailing_sha):
    manifest=verify_cms()
    cms_raw=cms_path.read_bytes()
    if sha(cms_raw)!=manifest['nativeTargetsSha256']:
        raise ValueError('CMS variants differ from the complete retained native monthly source')
    cms=json.loads(cms_raw)
    if len(cms)!=609:
        raise ValueError('The audited CMS component identity scope changed')
    mailing_raw=mailing_path.read_bytes()
    if len(mailing_sha)!=64 or sha(mailing_raw)!=mailing_sha:
        raise ValueError('NERIS mailing variants differ from the explicitly frozen source batch')
    mailing=json.loads(mailing_raw)
    if not isinstance(mailing,list) or not mailing:
        raise ValueError('An explicit nonempty NERIS mailing-site batch is required')
    _,entries,baseline_sha=load_primary_baseline()
    originals={entry['key']:entry for entry in entries}
    targets=[]
    for target in cms:
        original=originals.get(target['key'])
        proof=target.get('componentEvidence') or {}
        if not original or original['source']!='NPPES' or proof.get('originalCombinedAddress')!=original['address'] or proof.get('sourceReportSha256')!=manifest['nativeReportSha256']:
            raise ValueError('CMS diagnostic variant changed its original primary identity/address binding')
        adapted=copy.deepcopy(target)
        adapted['originalPrimaryKey']=original['key']
        adapted['key']=original['key']+'@NPPES-PRIMARY'
        targets.append(adapted)
    for target in mailing:
        original=originals.get(target.get('originalPrimaryKey'))
        proof=target.get('primaryAddressEvidence') or {}
        if not original or original['source']!='USFA' or not target['key'].startswith(original['key']+'@') or proof.get('originalAddress')!=original['address'] or proof.get('diagnosticOnly') is not True:
            raise ValueError('NERIS mailing variant changed its original primary identity/address binding')
        targets.append(copy.deepcopy(target))
    for target in targets:
        original=originals[target['originalPrimaryKey']]
        if any(target.get(key)!=original.get(key) for key in ('name','state','source','sourceDate','sourceCounty')) or not physical_address(target.get('address')) or target.get('status')!='no-match' or target.get('match') is not None or target.get('countyFips'):
            raise ValueError('Diagnostic target changed immutable source metadata or lacks a native physical address')
    if len({target['key'] for target in targets})!=len(targets):
        raise ValueError('Duplicate source-bound diagnostic target identity')
    data=dump(targets)
    receipt={'schemaVersion':1,'diagnosticOnly':True,'newMapped':0,'originalPrimaryCount':46791,
             'baselineIndexSha256':baseline_sha,'cmsTargetsSha256':sha(cms_raw),
             'cmsNativeReportSha256':manifest['nativeReportSha256'],
             'nerisMailingTargetsSha256':sha(mailing_raw),'targetCount':len(targets),
             'cmsTargetCount':len(cms),'nerisMailingTargetCount':len(mailing),'targetsSha256':sha(data)}
    return data,receipt

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--cms-targets',type=pathlib.Path,default=CMS_EVIDENCE/'native-component-targets.json')
    parser.add_argument('--mailing-targets',type=pathlib.Path,required=True)
    parser.add_argument('--mailing-target-sha256',required=True)
    parser.add_argument('--output',type=pathlib.Path,required=True)
    parser.add_argument('--report',type=pathlib.Path,required=True)
    args=parser.parse_args()
    data,receipt=prepare(args.cms_targets,args.mailing_targets,args.mailing_target_sha256)
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_bytes(data)
    args.report.parent.mkdir(parents=True,exist_ok=True);args.report.write_bytes(dump(receipt))
    print(json.dumps(receipt),flush=True)

if __name__=='__main__':main()
