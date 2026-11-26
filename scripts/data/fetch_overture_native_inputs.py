#!/usr/bin/env python3
"""Read target files from two explicitly pinned commits in this same repository."""
import argparse
import hashlib
import json
import pathlib
import re
import subprocess


def main():
    p=argparse.ArgumentParser();p.add_argument('--config',type=pathlib.Path,required=True)
    p.add_argument('--output',type=pathlib.Path,required=True);a=p.parse_args()
    config=json.loads(a.config.read_bytes());a.output.mkdir(parents=True,exist_ok=True)
    for key,filename in [('CMS','cms-targets.json'),('NERIS','neris-targets.json')]:
        source=config[key];ref=source['commit'];path=source['path']
        if not re.fullmatch('[a-f0-9]{40}',ref) or not re.fullmatch('[a-f0-9]{64}',source['sha256']):
            raise ValueError('Native target dependency is not an explicit immutable commit and file hash')
        if not path.startswith('scripts/data/evidence/') or '..' in path.split('/') or not path.endswith('.json'):
            raise ValueError('Unexpected native target dependency path')
        subprocess.run(['git','fetch','--depth=1','origin',ref],check=True)
        data=subprocess.check_output(['git','show',ref+':'+path])
        if hashlib.sha256(data).hexdigest()!=source['sha256']: raise ValueError('Durable native target file digest differs')
        value=json.loads(data);targets=value['targets'] if isinstance(value,dict) else value
        if len(targets)!=source['targetCount']: raise ValueError('Durable native target identity count differs')
        (a.output/filename).write_bytes(data)
        print(key,'durable target scope',len(targets),'SHA',source['sha256'],flush=True)
    (a.output/'dependency-commits.json').write_bytes(a.config.read_bytes())


if __name__=='__main__': main()
