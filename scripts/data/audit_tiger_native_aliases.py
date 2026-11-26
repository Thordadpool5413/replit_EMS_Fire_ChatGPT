#!/usr/bin/env python3
"""Bounded, read-only native TIGER name/range relationship reconciliation.

FEATNAMES TLID alone is insufficient to attach a name to a numbered range.
Require the explicit ADDRFN ARID -> LINEARID relationship and the same TLID.
Compare those supported names to the complete native ADDRFEAT county table.
This diagnostic never emits eligible location candidates.
"""
import argparse,collections,concurrent.futures,copy,hashlib,html,io,json,pathlib,re,urllib.request,zipfile
import shapefile
from backfill_provider_locations import ROOT,sha,digest_file
from address_normalization import normalize_street
from stage_tiger_primary import dump,TECHDOC

EVIDENCE=ROOT/'scripts/data/evidence/primary-tiger-alias-review/2026-11-26'
ROOT_URL='https://www2.census.gov/geo/tiger/TIGER2026/'
SAMPLE=('01073','06037','12086','17031','28049','36061','37051','42003','48029','55079')
KINDS=('FEATNAMES','ADDRFN','ADDRFEAT')

def fetch(url):
 allowed={ROOT_URL+k+'/'for k in KINDS}|{TECHDOC}
 if url not in allowed and not any(re.fullmatch(re.escape(ROOT_URL+k+'/')+r'tl_2026_\d{5}_'+k.lower()+r'\.zip',url)for k in KINDS):
  raise ValueError('Only fixed public TIGER source files are allowed')
 request=urllib.request.Request(url,headers={'User-Agent':'ATLAS fixed native source relationship audit'})
 with urllib.request.urlopen(request,timeout=120)as response:raw=response.read(512_000_001)
 if len(raw)>512_000_000:raise ValueError('Unexpected source archive size')
 return raw

def directory_summary(raw,kind):
 text=raw.decode('utf-8');names=sorted(set(re.findall(r'tl_2026_(\d{5})_'+kind.lower()+r'\.zip',text)))
 approximate={}
 for row in text.splitlines():
  plain=html.unescape(re.sub('<[^>]+>',' ',row))
  match=re.search(r'tl_2026_(\d{5})_'+kind.lower()+r'\.zip\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s+([0-9.]+)([KMG]?)',plain)
  if match:approximate[match[1]]=round(float(match[2])*{'':1,'K':1024,'M':1024**2,'G':1024**3}[match[3]])
 if not names or not set(SAMPLE)<=set(names):raise ValueError('Bounded sample is missing from the fixed source inventory')
 return {'countyFiles':len(names),'directorySha256':sha(raw),'publishedApproximateBytes':sum(approximate.values())if len(approximate)==len(names)else None,
  'publishedSizeRows':len(approximate),'sizesAreRoundedDirectoryEstimates':True}

def table(path,kind):
 with zipfile.ZipFile(path)as z:
  if len(z.namelist())!=len(set(z.namelist())):raise ValueError('Duplicate native archive member')
  members={};receipts=[]
  for info in z.infolist():
   if info.is_dir():continue
   raw=z.read(info)
   if len(raw)!=info.file_size:raise ValueError('Incomplete native archive member')
   receipts.append({'file':info.filename,'bytes':len(raw),'sha256':sha(raw),'crc32':f'{info.CRC:08x}'})
   suffix=pathlib.PurePosixPath(info.filename).suffix.lower()
   if suffix in('.dbf','.cpg'):
    if suffix in members:raise ValueError('Duplicate native table component')
    members[suffix]=raw
 if '.dbf'not in members:raise ValueError('Native relationship file has no DBF table')
 encoding=members.get('.cpg',b'UTF-8').decode('ascii').strip().upper()
 if encoding in('UTF-8','UTF8','65001'):encoding='utf-8'
 elif encoding in('ISO-8859-1','LATIN1','1252','CP1252'):encoding='cp1252'
 else:raise ValueError('Unreviewed native table encoding')
 reader=shapefile.Reader(dbf=io.BytesIO(members['.dbf']),encoding=encoding)
 fields=[list(field)for field in reader.fields[1:]];names=[field[0]for field in fields]
 required={'FEATNAMES':{'TLID','LINEARID','FULLNAME','MTFCC','PAFLAG'},
  'ADDRFN':{'ARID','LINEARID'},'ADDRFEAT':{'TLID','ARIDL','ARIDR','LINEARID','FULLNAME','LFROMHN','LTOHN','RFROMHN','RTOHN','ZIPL','ZIPR'}}[kind]
 if len(names)!=len(set(names))or not required<=set(names):raise ValueError('Unexpected '+kind+' native schema')
 rows=[dict(zip(names,list(record)))for record in reader.iterRecords()]
 if len(rows)!=reader.numRecords:raise ValueError('Incomplete native table inventory')
 reader.close()
 return rows,{'file':path.name,'sha256':digest_file(path),'bytes':path.stat().st_size,'nativeFields':fields,'rows':len(rows),'members':receipts}

def reconcile(directory,county):
 feat,feat_receipt=table(directory/('source/'+county+'-FEATNAMES.zip'),'FEATNAMES')
 links,link_receipt=table(directory/('source/'+county+'-ADDRFN.zip'),'ADDRFN')
 addr,addr_receipt=table(directory/('source/'+county+'-ADDRFEAT.zip'),'ADDRFEAT')
 names=collections.defaultdict(list);edges=collections.defaultdict(set);linked=collections.defaultdict(dict);flags=collections.Counter()
 for ordinal,row in enumerate(feat,1):
  flags[str(row['PAFLAG'])]+=1
  if not str(row['MTFCC']).startswith('S'):continue
  tlid=row['TLID'];linear=str(row['LINEARID']);name=normalize_street(str(row['FULLNAME']or''))
  if name:
   names[(tlid,linear)].append((ordinal,row,name));edges[tlid].add(linear)
 for ordinal,row in enumerate(links,1):
  linked[str(row['ARID'])][str(row['LINEARID'])]=(ordinal,row)
 direct=collections.defaultdict(set);range_rows={};range_ids=set()
 for ordinal,row in enumerate(addr,1):
  tlid=row['TLID'];name=normalize_street(str(row['FULLNAME']or''))
  for side in('L','R'):
   arid=str(row['ARID'+side]or'')
   if not arid:continue
   key=(tlid,side,arid);range_ids.add(arid);direct[key].add(name);range_rows.setdefault(key,(ordinal,row))
 supported=set();missing=[];unsafe_edges=set();missing_name_links=set()
 for key,(ordinal,row)in sorted(range_rows.items()):
  tlid,side,arid=key
  for linear in edges[tlid]-set(linked[arid]):unsafe_edges.add((tlid,side,arid,linear))
  for linear,(link_ordinal,link)in sorted(linked[arid].items()):
   matching=names.get((tlid,linear),[])
   if not matching:missing_name_links.add((tlid,side,arid,linear))
   for feature_ordinal,feature,name in matching:
    relation=(tlid,side,arid,linear,name)
    if relation in supported:continue
    supported.add(relation)
    if name in direct[key]:continue
    missing.append({'countyFips':county,'tlid':tlid,'side':side,'rangeId':arid,'linearId':linear,
     'normalizedName':name,'existingNativeAddressNames':sorted(direct[key]),
     'nativeAddressRange':{'sourceRowNumber':ordinal,'attributes':copy.deepcopy(row),'nativeRecordSha256':sha(dump(row))},
     'nativeFeatureName':{'sourceRowNumber':feature_ordinal,'attributes':copy.deepcopy(feature),'nativeRecordSha256':sha(dump(feature))},
     'nativeRangeNameRelation':{'sourceRowNumber':link_ordinal,'attributes':copy.deepcopy(link),'nativeRecordSha256':sha(dump(link))}})
 return {'countyFips':county,'sources':{'FEATNAMES':feat_receipt,'ADDRFN':link_receipt,'ADDRFEAT':addr_receipt},
  'nativePrimaryAlternateFlagCounts':dict(sorted(flags.items())),
  'nativeAddressRangeSides':len(range_rows),'explicitSupportedRangeNameRelations':len(supported),
  'supportedNamesAbsentFromAddrfeat':len(missing),'missingSupportedRelations':missing,
  'edgeNameCombinationsWithoutExplicitRangeRelationship':len(unsafe_edges),
  'rangeRelationshipsWithoutStreetNameOnSameEdge':len(missing_name_links),
  'referenceRangeIdsWithoutUnsuppressedAddrfeatRange':len(set(linked)-range_ids)}

def summarize(report):
 return {'schemaVersion':1,'purpose':report['purpose'],'sampleCounties':report['sampleCounties'],
  'sourceInventory':report['sourceInventory'],'sampleIsStatisticallyRepresentative':False,
  'nativeRowsScanned':{kind:sum(c['sources'][kind]['rows']for c in report['counties'])for kind in KINDS},
  'supportedNamesAbsentFromAddrfeat':sum(c['supportedNamesAbsentFromAddrfeat']for c in report['counties']),
  'explicitSupportedRangeNameRelations':sum(c['explicitSupportedRangeNameRelations']for c in report['counties']),
  'unsafeEdgeOnlyNameCombinations':sum(c['edgeNameCombinationsWithoutExplicitRangeRelationship']for c in report['counties']),
  'sourceArchiveBytes':sum(c['sources'][kind]['bytes']for c in report['counties']for kind in KINDS),
  'byCounty':[{'countyFips':c['countyFips'],'supportedNamesAbsentFromAddrfeat':c['supportedNamesAbsentFromAddrfeat'],
    'explicitSupportedRangeNameRelations':c['explicitSupportedRangeNameRelations'],
    'unsafeEdgeOnlyNameCombinations':c['edgeNameCombinationsWithoutExplicitRangeRelationship']}for c in report['counties']],
  'eligibleLocationCandidates':0,'interpretation':report['interpretation']}

def audit(output=EVIDENCE,acquire=False):
 output.mkdir(parents=True,exist_ok=True);(output/'source').mkdir(exist_ok=True)
 if acquire:
  for kind in KINDS:(output/(kind.lower()+'-directory.html')).write_bytes(fetch(ROOT_URL+kind+'/'))
  (output/'technical-documentation.pdf').write_bytes(fetch(TECHDOC))
  specs=[(county,kind)for county in SAMPLE for kind in KINDS]
  def acquire_file(spec):
   county,kind=spec;url=ROOT_URL+kind+'/tl_2026_'+county+'_'+kind.lower()+'.zip'
   (output/('source/'+county+'-'+kind+'.zip')).write_bytes(fetch(url))
  with concurrent.futures.ThreadPoolExecutor(max_workers=4)as pool:list(pool.map(acquire_file,specs))
 inventory={kind:directory_summary((output/(kind.lower()+'-directory.html')).read_bytes(),kind)for kind in KINDS}
 counties=[reconcile(output,county)for county in SAMPLE]
 report={'schemaVersion':1,'purpose':'bounded-native-range-name-relationship-audit','sampleCounties':list(SAMPLE),
  'sourceInventory':inventory,'sampleIsStatisticallyRepresentative':False,'counties':counties,
  'technicalDocumentation':{'url':TECHDOC,'sha256':digest_file(output/'technical-documentation.pdf'),
   'sections':['4.12.5','5.1.3','5.2','5.3','Appendix S-2','Appendix S-3']},
  'interpretation':'ADDRFEAT is documented to include every address-range/street-name relationship. Only explicit ARID to LINEARID plus the same TLID is compared. Edge aliases lacking that range relationship are unsupported for range-number substitution. This bounded audit cannot authorize locations or establish nationwide completeness.'}
 return report

def main():
 p=argparse.ArgumentParser();p.add_argument('--output',type=pathlib.Path,default=EVIDENCE)
 p.add_argument('--acquire',action='store_true');p.add_argument('--verify',action='store_true');a=p.parse_args()
 report=audit(a.output,acquire=a.acquire);raw=dump(report);summary=dump(summarize(report))
 if a.verify:
  if(a.output/'report.json').read_bytes()!=raw or(a.output/'summary.json').read_bytes()!=summary:
   raise ValueError('Native alias relationship audit failed full-source replay')
 else:
  (a.output/'report.json').write_bytes(raw);(a.output/'summary.json').write_bytes(summary)
 print(summary.decode(),flush=True)
if __name__=='__main__':main()
