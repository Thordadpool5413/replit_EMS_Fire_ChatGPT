#!/usr/bin/env python3
"""Durable source-only TIGER checkpoint; it does not publish any mapping."""
import argparse,collections,gzip,json,pathlib,tempfile,zipfile
from backfill_provider_locations import ROOT,sha,digest_file
from stage_tiger_primary import COUNTY_FILES,SOURCE_COUNT,SOURCE_URL,NATIVE_CRS,REQUIRED_FIELDS,dump

EVIDENCE=ROOT/'scripts/data/evidence/primary-tiger-source-cache/2026-11-26'
HEADERS={'inventory.json','targets.json','directory.html'}

def validate_source(directory):
 inventory=json.loads((directory/'inventory.json').read_bytes());inputs=json.loads((directory/'targets.json').read_bytes())
 if(inventory['sourceCountyFileCount']!=COUNTY_FILES or inventory['sourceRowCount']!=SOURCE_COUNT or
    sha((directory/'targets.json').read_bytes())!=inventory['targetsSha256']or sha((directory/'directory.html').read_bytes())!=inventory['directorySha256']or
    len(inventory['counties'])!=COUNTY_FILES or len({r['countyFips']for r in inventory['counties']})!=COUNTY_FILES):
  raise ValueError('Complete frozen TIGER source/input inventory changed')
 total=retained=0
 for receipt in inventory['counties']:
  name=receipt['file']
  if name!='counties/'+receipt['countyFips']+'.json.gz':raise ValueError('Unsafe or contradictory county source path')
  raw=(directory/name).read_bytes()
  if sha(raw)!=receipt['sha256']:raise ValueError('Retained native county bytes changed')
  doc=json.loads(gzip.decompress(raw))
  if(doc['countyFips']!=receipt['countyFips']or doc['sourceRows']!=receipt['sourceRows']or len(doc['records'])!=receipt['retainedRows']or
     doc['sourceArchiveSha256']!=receipt['sourceArchiveSha256']or doc['sourceArchiveBytes']!=receipt['sourceArchiveBytes']or
     doc['sourceUrl']!=SOURCE_URL+'tl_2026_'+receipt['countyFips']+'_addrfeat.zip'or doc['sourceFile']!='tl_2026_'+receipt['countyFips']+'_addrfeat.zip'or
     doc['nativeReferenceSystem']!=NATIVE_CRS or doc['completeArchiveMembersVerified']is not True or doc['selectionSha256']!=inventory['selectionSha256']):
   raise ValueError('Native county acquisition proof changed')
  fields={r[0]for r in doc['nativeFields']}
  if not REQUIRED_FIELDS<=fields:raise ValueError('Retained native DBF schema changed')
  ordinals=set()
  for record in doc['records']:
   number=record['sourceRowNumber']
   if type(number)is not int or not 1<=number<=doc['sourceRows']or number in ordinals or set(record['native']['attributes'])!=fields or sha(dump(record['native']))!=record['nativeRecordSha256']:
    raise ValueError('Native range record/ordinal changed')
   ordinals.add(number)
  total+=doc['sourceRows'];retained+=len(doc['records'])
 if total!=SOURCE_COUNT or retained!=inventory['retainedFeatureCount']:raise ValueError('Native national counts do not reconcile')
 source_pin=sha(dump([{'countyFips':r['countyFips'],'sourceArchiveSha256':r['sourceArchiveSha256'],'sourceArchiveBytes':r['sourceArchiveBytes'],'sourceRows':r['sourceRows']}for r in inventory['counties']]))
 if source_pin!=inventory['sourceInventorySha256']:raise ValueError('Complete native county archive identity inventory changed')
 return inventory,inputs

def write_member(archive,name,raw,compress=True):
 info=zipfile.ZipInfo(name,date_time=(2026,11,26,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED if compress else zipfile.ZIP_STORED;archive.writestr(info,raw)

def retain(directory,output=EVIDENCE):
 inventory,inputs=validate_source(directory);output.mkdir(parents=True,exist_ok=True);by_state=collections.defaultdict(list);packs=[]
 for county in inventory['counties']:by_state[county['countyFips'][:2]].append(county)
 for state,counties in sorted(by_state.items()):
  path=output/('source-'+state+'.zip')
  with zipfile.ZipFile(path,'w')as z:
   for county in counties:write_member(z,county['file'],(directory/county['file']).read_bytes(),False)
  if path.stat().st_size>=90_000_000:raise ValueError('Native source pack needs an explicit split before Git retention')
  packs.append({'file':path.name,'stateFips':state,'sha256':digest_file(path),'bytes':path.stat().st_size,'countyFiles':len(counties)})
 headers={name:(directory/name).read_bytes()for name in HEADERS}
 with zipfile.ZipFile(output/'original.zip','w',zipfile.ZIP_DEFLATED,compresslevel=9)as z:
  for name,raw in sorted(headers.items()):write_member(z,name,raw)
 manifest={'schemaVersion':1,'phase':'source-only-no-mapping','sourceInventorySha256':inventory['sourceInventorySha256'],
  'sourceCountyFileCount':COUNTY_FILES,'sourceCount':SOURCE_COUNT,'retainedNativeFeatureCount':inventory['retainedFeatureCount'],
  'targetsSha256':inventory['targetsSha256'],'sourceArchives':packs,'archiveSha256':digest_file(output/'original.zip'),
  'archiveBytes':(output/'original.zip').stat().st_size,'members':{name:{'sha256':sha(raw),'bytes':len(raw)}for name,raw in headers.items()},
  'sourceRetention':'Complete raw county/member SHA and CRC/size receipts, plus full native attributes and geometry for every frozen selection street/ZIP. No publication candidates are authorized by this source checkpoint.'}
 (output/'manifest.json').write_bytes(dump(manifest));return manifest

def extract(output,directory):
 manifest=json.loads((output/'manifest.json').read_bytes());directory.mkdir(parents=True,exist_ok=True)
 if manifest['phase']!='source-only-no-mapping'or digest_file(output/'original.zip')!=manifest['archiveSha256']or(output/'original.zip').stat().st_size!=manifest['archiveBytes']:raise ValueError('TIGER source checkpoint changed')
 with zipfile.ZipFile(output/'original.zip')as z:
  if set(z.namelist())!=HEADERS or len(z.namelist())!=len(HEADERS):raise ValueError('TIGER source header membership changed')
  for name in HEADERS:
   raw=z.read(name)
   if {'sha256':sha(raw),'bytes':len(raw)}!=manifest['members'][name]:raise ValueError('TIGER source header changed')
   (directory/name).write_bytes(raw)
 inventory=json.loads((directory/'inventory.json').read_bytes());expected={r['file']:r for r in inventory['counties']};seen=set()
 for pack in manifest['sourceArchives']:
  if pack['file']!='source-'+pack['stateFips']+'.zip':raise ValueError('Unsafe source pack path')
  path=output/pack['file']
  if digest_file(path)!=pack['sha256']or path.stat().st_size!=pack['bytes']:raise ValueError('Native source pack changed')
  with zipfile.ZipFile(path)as z:
   if len(z.namelist())!=pack['countyFiles']or len(z.namelist())!=len(set(z.namelist())):raise ValueError('Native source pack membership changed')
   for name in z.namelist():
    if name not in expected or name in seen or expected[name]['countyFips'][:2]!=pack['stateFips']:raise ValueError('Unexpected native county member')
    raw=z.read(name)
    if sha(raw)!=expected[name]['sha256']:raise ValueError('Native county source bytes changed')
    target=directory/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(raw);seen.add(name)
 if seen!=set(expected):raise ValueError('Full county source inventory is incomplete')
 return validate_source(directory)

def main():
 p=argparse.ArgumentParser();p.add_argument('--source',type=pathlib.Path);p.add_argument('--output',type=pathlib.Path,default=EVIDENCE)
 p.add_argument('--extract',type=pathlib.Path);p.add_argument('--verify',action='store_true');a=p.parse_args()
 if a.extract:extract(a.output,a.extract);m=json.loads((a.output/'manifest.json').read_bytes())
 elif a.verify:
  with tempfile.TemporaryDirectory(prefix='atlas-tiger-source-')as temporary:extract(a.output,pathlib.Path(temporary))
  m=json.loads((a.output/'manifest.json').read_bytes())
 else:
  if not a.source:p.error('--source is required')
  m=retain(a.source,a.output)
 print(json.dumps({k:m[k]for k in('phase','sourceCount','sourceCountyFileCount','retainedNativeFeatureCount','sourceInventorySha256','archiveSha256')}),flush=True)
if __name__=='__main__':main()
