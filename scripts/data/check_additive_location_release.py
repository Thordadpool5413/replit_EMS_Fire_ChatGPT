#!/usr/bin/env python3
"""Verify a proposed additive location release against its current base; read-only."""
import argparse,json,pathlib
from backfill_provider_locations import PUBLIC,read_registry,verify

def compare(before,after):
    if len({e['key'] for e in before})!=len(before) or len({e['key'] for e in after})!=len(after):raise ValueError('Duplicate identity')
    old={e['key']:e for e in before};new={e['key']:e for e in after}
    if old.keys()!=new.keys():raise ValueError('Provider identity set changed')
    counts={}
    for key,e in old.items():
        n=new[key]
        if n==e:continue
        if e['status'] not in ('no-match','unavailable','pending') or n['status']!='mapped':raise ValueError('Non-additive location change: '+key)
        if {k:v for k,v in e.items() if k not in ('status','match','countyFips')}!={k:v for k,v in n.items() if k not in ('status','match','countyFips')}:raise ValueError('Provider identity or address changed: '+key)
        if n.get('sourceCounty') and n['sourceCounty']!=n['countyFips']:raise ValueError('New county conflict: '+key)
        counts[n['state']]=counts.get(n['state'],0)+1
    return {'newMapped':sum(counts.values()),'byState':dict(sorted(counts.items()))}

def load(path):
    idx=json.loads((path/'index.json').read_bytes())
    return [e for ch in idx['chunks'] for e in json.loads((path/ch['file']).read_bytes())]

def main():
    p=argparse.ArgumentParser();p.add_argument('--base',type=pathlib.Path,required=True);p.add_argument('--candidate',type=pathlib.Path,required=True);args=p.parse_args()
    manifest,rows=read_registry();fl=json.loads((PUBLIC/'state-ems/FL.json').read_bytes())
    for path in (args.base,args.candidate):verify(path,manifest,rows,fl)
    result=compare(load(args.base),load(args.candidate))
    print(json.dumps(result,indent=2))
    if not result['newMapped']:raise ValueError('No additional mappings')
if __name__=='__main__':main()
