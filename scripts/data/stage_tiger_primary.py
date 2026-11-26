#!/usr/bin/env python3
"""Acquire every fixed public TIGER2026 ADDRFEAT county ZIP, matching locally.

Every archive/member is read completely with CRC/size and SHA receipts. Retain
full native attributes and geometry for frozen street/ZIP selections. Target
addresses never leave the runner. Source range locations remain approximate.
"""
import argparse,concurrent.futures,copy,gzip,io,json,pathlib,re,time,urllib.request,zipfile
import shapefile
from backfill_provider_locations import ROOT,STATES,sha,digest_file
from primary_recovery_baseline import load_primary_baseline
from address_normalization import normalize_street,source_street_line,physical_address
from recover_neris_primary import load_departments,native_address,INDEX_SHA as NERIS_INDEX_SHA,SOURCE_SHA as NERIS_SOURCE_SHA

SOURCE_URL='https://www2.census.gov/geo/tiger/TIGER2026/ADDRFEAT/'
TECHDOC='https://www2.census.gov/geo/pdfs/maps-data/data/tiger/tgrshp2026/TGRSHP2026_TechDoc.pdf'
COUNTY_FILES=3227
SOURCE_COUNT=23314306
METHOD='tiger-address-range'
NATIVE_CRS='EPSG:4269'
REQUIRED_FIELDS={'TLID','FULLNAME','LFROMHN','LTOHN','RFROMHN','RTOHN','ZIPL','ZIPR',
                 'PARITYL','PARITYR','LFROMTYP','LTOTYP','RFROMTYP','RTOTYP','OFFSETL','OFFSETR','ARIDL','ARIDR','LINEARID'}

def dump(value):return(json.dumps(value,sort_keys=True,ensure_ascii=True,separators=(',',':'),allow_nan=False)+'\n').encode()

def numeric_address(address):
 if not physical_address(address):return None
 line=source_street_line(address['street']);match=re.fullmatch(r'(\d+)\s+(.+)',line)
 if not match or int(match[1])<=0:return None
 road=normalize_street(match[2])
 return(int(match[1]),road)if road else None

def selection_key(address):
 parsed=numeric_address(address)
 return(address['state'],parsed[1],address['zip'])if parsed else None

def additional_selection():
 keys=set();objects=0
 for department in load_departments():
  for item in [department,*department['stations']]:
   objects+=1;address,component,conflict=native_address(item['address'])
   key=selection_key(address)
   if component and not conflict and key:keys.add(key)
 return{'kind':'retention-only-complete-native-neris-physical-street-postal-scope',
        'nerisIndexSha256':NERIS_INDEX_SHA,'nativeSourceSha256':NERIS_SOURCE_SHA,
        'nativeObjectsAudited':objects,'keys':[list(k)for k in sorted(keys)]}

def source_inputs(neris_targets,cms_targets):
 _,originals,baseline_sha=load_primary_baseline();targets=[];pins={'original':baseline_sha}
 for scope,entries in [('original',originals)]:
  for entry in entries:targets.append({'scope':scope,'targetId':scope+':'+entry['key'],'entry':copy.deepcopy(entry)})
 original={e['key']:e for e in originals}
 for scope,path,count in [('neris-native',neris_targets,1251),('cms-native',cms_targets,609)]:
  raw=path.read_bytes();entries=json.loads(raw);pins[scope]=sha(raw)
  if len(entries)!=count or len({e['key']for e in entries})!=count:raise ValueError('Frozen diagnostic target count changed')
  for entry in entries:
   key=entry.get('originalPrimaryKey',entry['key']);base=original.get(key)
   if not base or any(entry[k]!=base[k]for k in('name','source','state','sourceDate','sourceCounty')):raise ValueError('Diagnostic target changed original source identity')
   if scope=='cms-native'and entry.get('componentEvidence',{}).get('originalCombinedAddress')!=base['address']:raise ValueError('CMS component lost original address binding')
   if scope=='neris-native'and entry.get('primaryAddressEvidence',{}).get('originalAddress')!=base['address']:raise ValueError('NERIS physical site lost original address binding')
   targets.append({'scope':scope,'targetId':scope+':'+entry['key'],'entry':copy.deepcopy(entry)})
 return{'schemaVersion':2,'originalPrimaryCount':46791,'pins':pins,'targets':targets,'additionalSelection':additional_selection()}

def fetch(url,limit=512_000_000):
 if url!=SOURCE_URL and not re.fullmatch(re.escape(SOURCE_URL)+r'tl_2026_\d{5}_addrfeat\.zip',url):
  raise ValueError('Only fixed public source inventory URLs may be requested')
 last=None
 for attempt in range(5):
  try:
   request=urllib.request.Request(url,headers={'User-Agent':'ATLAS-fixed-public-source-audit/1.0'})
   with urllib.request.urlopen(request,timeout=120)as response:
    data=response.read(limit+1)
    if len(data)>limit:raise ValueError('Public source exceeds declared safety bound')
    return data
  except(Exception)as error:
   last=error
   if attempt<4:time.sleep(min(2**attempt,15))
 raise RuntimeError('Fixed public source retrieval failed: '+url)from last

def county_source(spec,directory,keys,states,selection_sha):
 destination=directory/('counties/'+spec['countyFips']+'.json.gz')
 if destination.exists():
  document=json.loads(gzip.decompress(destination.read_bytes()))
  if document.get('sourceUrl')!=spec['sourceUrl']or document.get('selectionSha256')!=selection_sha:
   raise ValueError('Existing county cache belongs to a different fixed selection scope')
  return {'countyFips':spec['countyFips'],'file':str(destination.relative_to(directory)),'sha256':digest_file(destination),
          'sourceArchiveSha256':document['sourceArchiveSha256'],'sourceArchiveBytes':document['sourceArchiveBytes'],
          'sourceRows':document['sourceRows'],'retainedRows':len(document['records'])}
 raw=fetch(spec['sourceUrl']);members={};receipts=[]
 with zipfile.ZipFile(io.BytesIO(raw))as z:
  if len(z.namelist())!=len(set(z.namelist())):raise ValueError('Duplicate native ZIP member')
  for member in z.infolist():
   if member.is_dir():continue
   if member.filename.startswith('/')or'..'in pathlib.PurePosixPath(member.filename).parts:raise ValueError('Unsafe native ZIP member')
   data=z.read(member)
   if len(data)!=member.file_size:raise ValueError('Native member size mismatch')
   receipts.append({'file':member.filename,'bytes':len(data),'crc32':f'{member.CRC:08x}','sha256':sha(data)})
   suffix=pathlib.PurePosixPath(member.filename).suffix.lower()
   if suffix in('.shp','.shx','.dbf','.prj','.cpg'):
    if suffix in members:raise ValueError('Repeated native shapefile component')
    members[suffix]=data
 if not{'.shp','.shx','.dbf','.prj'}<=set(members):raise ValueError('Incomplete native source geometry/table')
 projection=members['.prj'].decode('ascii').strip()
 if 'North_American_1983'not in projection or 'Degree'not in projection and'degree'not in projection:
  raise ValueError('Native range geometry is not the retained NAD83 degree reference system')
 encoding=members.get('.cpg',b'UTF-8').decode('ascii').strip().upper()
 if encoding in('UTF-8','UTF8','65001'):encoding='utf-8'
 elif encoding in('ISO-8859-1','LATIN1','1252','CP1252'):encoding='cp1252'
 else:raise ValueError('Unreviewed native DBF encoding: '+encoding)
 reader=shapefile.Reader(shp=io.BytesIO(members['.shp']),shx=io.BytesIO(members['.shx']),dbf=io.BytesIO(members['.dbf']),encoding=encoding)
 fields=[list(f)for f in reader.fields[1:]];names=[f[0]for f in fields]
 if len(names)!=len(set(names))or not REQUIRED_FIELDS<=set(names):raise ValueError('Native ADDRFEAT schema changed: '+str(names))
 records=[];count=0;state=states.get(spec['countyFips'])
 for count,record in enumerate(reader.iterShapeRecords(),1):
  attributes=dict(zip(names,list(record.record)));road=normalize_street(str(attributes['FULLNAME']or''))
  relevant=state in STATES and any((state,road,str(attributes['ZIP'+side]or'').strip())in keys for side in('L','R'))
  if not relevant:continue
  shape=record.shape
  native={'attributes':attributes,'geometry':{'shapeType':shape.shapeType,'parts':list(shape.parts),'points':[list(point)for point in shape.points]}}
  records.append({'sourceRowNumber':count,'native':native,'nativeRecordSha256':sha(dump(native))})
 if count!=reader.numRecords:raise ValueError('Native shape/record inventory does not reconcile')
 reader.close()
 document={'schemaVersion':2,'countyFips':spec['countyFips'],'state':state,'sourceUrl':spec['sourceUrl'],
  'sourceFile':spec['sourceFile'],'sourceArchiveSha256':sha(raw),'sourceArchiveBytes':len(raw),
  'sourceRows':count,'nativeFields':fields,'nativeReferenceSystem':NATIVE_CRS,'projectionAsReported':projection,
  'selectionSha256':selection_sha,'members':receipts,'completeArchiveMembersVerified':True,'records':records}
 destination.parent.mkdir(parents=True,exist_ok=True);encoded=gzip.compress(dump(document),compresslevel=9,mtime=0)
 temp=destination.with_suffix('.tmp');temp.write_bytes(encoded);temp.replace(destination)
 return {'countyFips':spec['countyFips'],'file':str(destination.relative_to(directory)),'sha256':sha(encoded),
         'sourceArchiveSha256':sha(raw),'sourceArchiveBytes':len(raw),'sourceRows':count,'retainedRows':len(records)}

def acquire(directory,neris_targets,cms_targets,workers=6):
 directory.mkdir(parents=True,exist_ok=True);inputs=source_inputs(neris_targets,cms_targets);target_raw=dump(inputs)
 if(directory/'targets.json').exists()and(directory/'targets.json').read_bytes()!=target_raw:raise ValueError('Frozen source-retention target scope changed')
 (directory/'targets.json').write_bytes(target_raw)
 directory_raw=fetch(SOURCE_URL,10_000_000);(directory/'directory.html').write_bytes(directory_raw)
 names=sorted(set(re.findall(r'tl_2026_(\d{5})_addrfeat\.zip',directory_raw.decode('utf-8'))))
 if len(names)!=COUNTY_FILES:raise ValueError('Complete fixed national county ZIP inventory changed: '+str(len(names)))
 keys={selection_key(t['entry']['address'])for t in inputs['targets']if selection_key(t['entry'].get('address'))}
 keys.update(tuple(k)for k in inputs['additionalSelection']['keys'])
 identities=json.loads((ROOT/'scripts/fixtures/census-2026-county-identities.json').read_bytes())['counties'];states={r['GEOID']:r['USPS']for r in identities}
 specs=[{'countyFips':county,'sourceFile':'tl_2026_'+county+'_addrfeat.zip','sourceUrl':SOURCE_URL+'tl_2026_'+county+'_addrfeat.zip'}for county in names]
 selection_sha=sha(dump(sorted(keys)));receipts=[]
 with concurrent.futures.ThreadPoolExecutor(max_workers=workers)as pool:
  future={pool.submit(county_source,spec,directory,keys,states,selection_sha):spec for spec in specs}
  for item in concurrent.futures.as_completed(future):
   receipts.append(item.result())
   if len(receipts)%100==0:print('Complete native county files',len(receipts),'of',COUNTY_FILES,flush=True)
 receipts.sort(key=lambda r:r['countyFips']);rows=sum(r['sourceRows']for r in receipts)
 if rows!=SOURCE_COUNT:raise ValueError('Complete nationwide source row count changed: '+str(rows))
 inventory={'schemaVersion':2,'source':'tiger-2026-addrfeat','sourceUrl':SOURCE_URL,'technicalDocumentation':TECHDOC,
  'sourceCountyFileCount':COUNTY_FILES,'sourceRowCount':rows,'retainedFeatureCount':sum(r['retainedRows']for r in receipts),
  'directorySha256':sha(directory_raw),'targetsSha256':sha(target_raw),'selectionSha256':selection_sha,
  'sourceInventorySha256':sha(dump([{'countyFips':r['countyFips'],'sourceArchiveSha256':r['sourceArchiveSha256'],'sourceArchiveBytes':r['sourceArchiveBytes'],'sourceRows':r['sourceRows']}for r in receipts])),
  'counties':receipts}
 (directory/'inventory.json').write_bytes(dump(inventory));return inventory

def main():
 p=argparse.ArgumentParser();p.add_argument('--directory',type=pathlib.Path,required=True);p.add_argument('--neris-targets',type=pathlib.Path,required=True);p.add_argument('--cms-targets',type=pathlib.Path,required=True);p.add_argument('--workers',type=int,default=6);a=p.parse_args()
 if not 1<=a.workers<=16:p.error('Use one to sixteen bounded county readers')
 inventory=acquire(a.directory,a.neris_targets,a.cms_targets,a.workers)
 print(json.dumps({k:inventory[k]for k in('sourceCountyFileCount','sourceRowCount','retainedFeatureCount','sourceInventorySha256','targetsSha256')}),flush=True)
if __name__=='__main__':main()
