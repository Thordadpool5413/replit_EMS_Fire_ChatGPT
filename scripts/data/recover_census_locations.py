#!/usr/bin/env python3
"""Retry only unresolved physical public registry addresses; preserve every existing point."""
import argparse,collections,csv,datetime,io,json,pathlib,re,subprocess,tempfile
from backfill_provider_locations import ROOT,PUBLIC,STATES,ENDPOINT,BENCHMARK,VINTAGE,physical,base_street,normal_street,match_address,parse_batch,read_registry,publish,verify
def query_address(a):
 # No change to source address. Whitespace/case and existing suffix normalization only.
 return [normal_street(base_street(a['street'])),re.sub(r'\s+',' ',a['city']).strip().upper(),a['state'],a['zip']]
def parse_retry(text,expected,state_fips,valid_counties):
 """A non-exact locator flag is accepted only if the returned full address passes the original exact-component validator."""
 parsed=list(csv.reader(io.StringIO(text)))
 flags={}
 for row in parsed:
  if len(row)>=5 and row[2]=='Match' and row[3] in ('Exact','Non_Exact'):
   flags[row[0]]=row[3]
   if row[3]=='Non_Exact' and row[0] in expected and match_address(expected[row[0]],row[4]):
    row[3]='Exact'
 out=io.StringIO();csv.writer(out).writerows(parsed)
 values=parse_batch(out.getvalue(),expected,state_fips,valid_counties)
 return values,flags
def fetch_batch(expected):
 with tempfile.TemporaryDirectory() as td:
  inp=pathlib.Path(td)/'input.csv';out=pathlib.Path(td)/'output.csv'
  with inp.open('w',newline='',encoding='utf-8') as f:
   w=csv.writer(f)
   for k,a in expected.items():w.writerow([k,*query_address(a)])
  subprocess.run(['curl','--fail','--silent','--show-error','--proto','=https','--connect-timeout','25','--max-time','420','--max-filesize','8000000','--form','addressFile=@'+str(inp),'--form','benchmark='+BENCHMARK,'--form','vintage='+VINTAGE,'--output',str(out),ENDPOINT],check=True,timeout=450)
  if out.stat().st_size>8_000_000:raise ValueError('Retry response exceeds limit')
  return out.read_text(encoding='utf-8-sig')
def recover(entries,states,state_fips,valid_counties,batch_size=1500,fetch=fetch_batch):
 stats=collections.Counter();groups=collections.defaultdict(list)
 for e in entries:
  if e['state'] in states and e['status'] in ('no-match','unavailable'):
   if not physical(e['address']):stats['ineligible']+=1;continue
   a=e['address'];groups[tuple(a[k] for k in ('street','city','state','zip'))].append(e)
 values=list(groups.values())
 for start in range(0,len(values),batch_size):
  batch=values[start:start+batch_size];expected={str(i+1):g[0]['address'] for i,g in enumerate(batch)}
  try:results,flags=parse_retry(fetch(expected),expected,state_fips,valid_counties)
  except (OSError,subprocess.SubprocessError,ValueError,UnicodeError) as exc:
   stats['unavailable']+=sum(map(len,batch));print('Census retry batch unavailable:',type(exc).__name__,str(exc)[:140],flush=True);continue
  for i,group in enumerate(batch):
   key=str(i+1);status,match,county=results[key]
   for e in group:
    if status=='mapped' and e['sourceCounty'] and e['sourceCounty']!=county:stats['county_conflict']+=1;continue
    if status=='mapped':
     e.update(status='mapped',match=match,countyFips=county)
     stats['mapped']+=1;stats['mapped_'+flags[key]]+=1
    else:stats['no-match']+=1
  print('Census normalized retry',start//batch_size+1,'of',(len(values)+batch_size-1)//batch_size,dict(stats),flush=True)
 return dict(stats)
def main():
 p=argparse.ArgumentParser();p.add_argument('--states',default='all');p.add_argument('--output',type=pathlib.Path,default=PUBLIC/'locations');p.add_argument('--batch-size',type=int,default=1500);args=p.parse_args()
 states=STATES if args.states=='all' else set(args.states.split(','))
 if not states or not states<=STATES or not 1<=args.batch_size<=4000:raise ValueError('Invalid scope')
 manifest,rows=read_registry();fl=json.loads((PUBLIC/'state-ems/FL.json').read_bytes());verify(args.output,manifest,rows,fl)
 index=json.loads((args.output/'index.json').read_bytes());entries=[e for c in index['chunks'] for e in json.loads((args.output/c['file']).read_bytes())]
 if any(e['status']=='pending' for e in entries):raise ValueError('Initial geocoding must complete first')
 before={e['key']:json.dumps(e,sort_keys=True) for e in entries if e['status']=='mapped'}
 counties=json.loads((ROOT/'scripts/fixtures/census-2026-county-identities.json').read_text())['counties']
 stats=recover(entries,states,{c['USPS']:c['GEOID'][:2] for c in counties},{c['GEOID'] for c in counties},args.batch_size)
 if any(json.dumps(e,sort_keys=True)!=before[e['key']] for e in entries if e['key'] in before):raise ValueError('Prior verified point changed')
 if stats.get('unavailable',0) and not sum(stats.get(k,0) for k in ('mapped','no-match','county_conflict')):raise ValueError('Every retry batch unavailable')
 metadata={k:v for k,v in index.items() if k not in ('schemaVersion','generatedAt','benchmark','vintage','sourceScope','chunks','coverage','censusRetry')}
 metadata['censusRetry']=dict(scope=sorted(states),results=stats,previousMapped=len(before),newMapped=sum(e['status']=='mapped' for e in entries)-len(before),method='Census normalized retry; returned exact address components and county validation required')
 publish(args.output,manifest,entries,metadata);verify(args.output,manifest,rows,fl)
 print('Census retry summary',json.dumps(metadata['censusRetry']),flush=True)
if __name__=='__main__':main()
