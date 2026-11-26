#!/usr/bin/env python3
"""Bind separate native target scopes without asserting their primary-site role."""
import argparse
import json
import pathlib
from address_normalization import physical_address
from primary_recovery_baseline import load_primary_baseline
from stage_overture_primary_addresses import encoded,file_sha,sha


def load_scope(path):
    value=json.loads(path.read_bytes())
    targets=value['targets'] if isinstance(value,dict) else value
    if not isinstance(targets,list) or not targets or len({r['key'] for r in targets})!=len(targets):
        raise ValueError('Duplicate or empty native source target scope')
    return targets


def bind_scopes(cms,neris):
    _,originals,index_sha=load_primary_baseline();originals={r['key']:r for r in originals}
    seen=set()
    for scope,rows in [('CMS',cms),('NERIS',neris)]:
        for target in rows:
            key=target.get('originalPrimaryKey',target['key'])
            if target['key'] in seen or key not in originals or not physical_address(target.get('address')):
                raise ValueError('Unbound, duplicate or nonphysical native source target')
            seen.add(target['key'])
            proof=target.get('componentEvidence') if scope=='CMS' else target.get('primaryAddressEvidence')
            if not isinstance(proof,dict) or not proof: raise ValueError('Native target association evidence is missing')
    return originals,index_sha


def prepare(cms_path,neris_path,output,cms_sha=None,neris_sha=None):
    if cms_sha and file_sha(cms_path)!=cms_sha or neris_sha and file_sha(neris_path)!=neris_sha:
        raise ValueError('Requested durable target-file pin differs')
    cms=load_scope(cms_path);neris=load_scope(neris_path);_,index_sha=bind_scopes(cms,neris)
    output.mkdir(parents=True,exist_ok=True)
    (output/'cms-targets.json').write_bytes(cms_path.read_bytes());(output/'neris-targets.json').write_bytes(neris_path.read_bytes())
    (output/'combined-targets.json').write_bytes(encoded(cms+neris))
    receipt={'schemaVersion':1,'purpose':'separate-native-site-geocode-targets','baselineIndexSha256':index_sha,
             'CMS':{'targets':len(cms),'sha256':file_sha(cms_path)},
             'NERIS':{'targets':len(neris),'sha256':file_sha(neris_path)},
             'combinedTargetsSha256':sha(encoded(cms+neris)),
             'associationPolicy':'geocode evidence only; caller independently validates retained original-primary association'}
    (output/'target-receipt.json').write_bytes(encoded(receipt))
    print(json.dumps(receipt,indent=2))


def main():
    p=argparse.ArgumentParser();p.add_argument('--cms-targets',type=pathlib.Path,required=True)
    p.add_argument('--neris-targets',type=pathlib.Path,required=True);p.add_argument('--output',type=pathlib.Path,required=True)
    p.add_argument('--cms-sha256');p.add_argument('--neris-sha256');a=p.parse_args()
    prepare(a.cms_targets,a.neris_targets,a.output,a.cms_sha256,a.neris_sha256)


if __name__=='__main__': main()
