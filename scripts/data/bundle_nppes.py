#!/usr/bin/env python3
"""Bundle staged NPPES candidates into integrity-checked browser-readable shards."""
import argparse,base64,collections,gzip,hashlib,json,pathlib

def bundle(source,destination):
 target=pathlib.Path(destination);target.mkdir(parents=True,exist_ok=True);states=collections.defaultdict(list);manifest=None;summary=None
 with open(source,encoding='utf-8') as stream:
  for line in stream:
   row=json.loads(line)
   if row['kind']=='manifest':manifest=row
   elif row['kind']=='summary':summary=row
   elif row['kind']=='candidate':states[row['location']['state'] or 'UNKNOWN'].append(row)
 if not manifest or not summary or summary['accepted']!=sum(map(len,states.values())):raise ValueError('Staging counts mismatch.')
 chunks=[]
 for number,(state,rows) in enumerate(sorted(states.items())):
  content=('\n'.join(json.dumps(row,separators=(',',':')) for row in rows)+'\n').encode()
  filename=f'part-{number:03d}.gz.b64';encoded=base64.b64encode(gzip.compress(content,mtime=0)).decode()
  (target/filename).write_text(encoded,encoding='ascii')
  chunks.append(dict(file=filename,state=state,count=len(rows),sha256=hashlib.sha256(content).hexdigest()))
 index=dict(manifest=manifest,summary=summary,chunks=chunks)
 (target/'index.json').write_text(json.dumps(index,indent=2)+'\n')
 return dict(accepted=summary['accepted'],parts=len(chunks))
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('source');parser.add_argument('destination');args=parser.parse_args();print(json.dumps(bundle(args.source,args.destination)))
