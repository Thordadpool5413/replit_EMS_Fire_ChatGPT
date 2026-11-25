"""Reconcile independently validated public location snapshots without replacing existing points."""
import collections,json,pathlib,subprocess,math
from backfill_provider_locations import ROOT,PUBLIC,read_registry,verify,publish,sha
BASE='045bdff1904d6220e9245355488293d574c26865'
SOURCES={'nad':'0a152430c397b5bb44e6b22b661aa7331559b9b9','ny':'e593e25aa53dd466e005770bf3fbcdb335707fbb','ny_retry':'f87548420e52709f744051084584abebeea34e37'}
PREFIX='artifacts/ems-territory-intelligence/public/registry/locations/'
def read_snapshot(ref):
 def read(name):return subprocess.check_output(['git','show',ref+':'+PREFIX+name],cwd=ROOT)
 index=json.loads(read('index.json'));entries={}
 for c in index['chunks']:
  raw=read(c['file'])
  if sha(raw)!=c['sha256']:raise ValueError('Snapshot checksum mismatch')
  rows=json.loads(raw)
  if len(rows)!=c['count']:raise ValueError('Snapshot count mismatch')
  for e in rows:
   if e['key'] in entries:raise ValueError('Duplicate identity')
   entries[e['key']]=e
 return index,entries
def distance(a,b):
 lat1,lat2=map(math.radians,(a['latitude'],b['latitude']))
 dl=math.radians(b['longitude']-a['longitude'])
 return 6371000*2*math.asin(min(1,math.sqrt(math.sin((lat2-lat1)/2)**2+math.cos(lat1)*math.cos(lat2)*math.sin(dl/2)**2)))
def reconcile(base,inputs):
 stats=collections.Counter();result=[];conflicts=[]
 for label,rows in inputs.items():
  if set(rows)!=set(base):raise ValueError('Source identity set changed: '+label)
 for key,e in base.items():
  candidates=[]
  for label,rows in inputs.items():
   x=rows[key]
   if x==e:continue
   if e['status'] not in ('no-match','unavailable') or x['status']!='mapped' or any(x[k]!=e[k] for k in e if k not in ('status','match','countyFips')):raise ValueError('Unexpected source change '+key)
   if x['match']['method']!=('nad-address-point' if label=='nad' else 'ny-sam-address-point'):raise ValueError('Unexpected recovery method')
   candidates.append((label,x));stats[label+'_candidates']+=1
  if not candidates:result.append(e);continue
  if len(candidates)>1:stats['overlap']+=1
  # Different sources can locate different entrances or parcel points. Withhold
  # conflicting counties or points separated by more than 50 metres, rather than guess.
  if any(a['countyFips']!=b['countyFips'] or distance(a['match'],b['match'])>50 for _,a in candidates for _,b in candidates):
   stats['conflicts_withheld']+=1;conflicts.append(dict(key=key,sources=[label for label,_ in candidates]));result.append(e);continue
  # Prefer the official state primary point when consistent; retain the original
  # candidate branches and source metadata as an inspectable audit trail.
  label,x=next(((label,x) for label,x in candidates if label=='ny'),next(((label,x) for label,x in candidates if label=='ny_retry'),candidates[0]))
  result.append(x);stats[label+'_selected']+=1;stats['new_mapped']+=1
 return result,dict(stats),conflicts
def main():
 manifest,rows=read_registry();fl=json.loads((PUBLIC/'state-ems/FL.json').read_bytes());output=PUBLIC/'locations'
 verify(output,manifest,rows,fl)
 index,base=read_snapshot(BASE)
 loaded={k:read_snapshot(v) for k,v in SOURCES.items()}
 for label,(idx,_) in loaded.items():
  if [(c['state'],c['registrySha256']) for c in idx['chunks']]!=[(c['state'],c['registrySha256']) for c in index['chunks']]:raise ValueError('Registry release differs')
 entries,stats,conflicts=reconcile(base,{k:v[1] for k,v in loaded.items()})
 metadata={k:v for k,v in index.items() if k not in ('schemaVersion','generatedAt','benchmark','vintage','sourceScope','chunks','coverage')}
 metadata['combinedRecovery']={'base':BASE,'sourceCommits':SOURCES,'sourceReports':{k:v[0].get('nadBulkRecovery' if k=='nad' else 'nySamRecovery') for k,v in loaded.items()},'results':stats,'conflicts':conflicts,'previousMapped':sum(e['status']=='mapped' for e in base.values()),'newMapped':stats['new_mapped']}
 publish(output,manifest,entries,metadata);verify(output,manifest,rows,fl)
 print('Combined recovery summary',json.dumps(stats),flush=True)
if __name__=='__main__':main()
