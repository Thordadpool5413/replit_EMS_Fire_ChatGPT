#!/usr/bin/env python3
"""Build a public, source-ID-keyed location snapshot. No database access or name-only joins."""
import argparse, collections, csv, datetime, hashlib, io, json, math, pathlib, re, subprocess, tempfile, unicodedata, zipfile

ROOT=pathlib.Path(__file__).resolve().parents[2]
PUBLIC=ROOT/'artifacts/ems-territory-intelligence/public/registry'
SOURCE='https://download.cms.gov/nppes/NPPES_Data_Dissemination_November_2026_V2.zip'
ENDPOINT='https://geocoding.geo.census.gov/geocoder/geographies/addressbatch'
BENCHMARK='Public_AR_Current'
VINTAGE='Current_Current'
STATES=set('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split())
ALIAS=dict(STREET='ST',ROAD='RD',AVENUE='AVE',BOULEVARD='BLVD',DRIVE='DR',LANE='LN',COURT='CT',HIGHWAY='HWY',PARKWAY='PKWY',PLACE='PL',TERRACE='TER',CIRCLE='CIR',NORTH='N',SOUTH='S',EAST='E',WEST='W',NORTHEAST='NE',NORTHWEST='NW',SOUTHEAST='SE',SOUTHWEST='SW')
def sha(data): return hashlib.sha256(data).hexdigest()
def digest_file(path):
 h=hashlib.sha256()
 with path.open('rb') as f:
  for block in iter(lambda:f.read(1024*1024),b''):h.update(block)
 return h.hexdigest()
def compact(data):return (json.dumps(data,ensure_ascii=False,separators=(',',':'),allow_nan=False)+'\n').encode()
def name_key(s):return re.sub('[^A-Z0-9]+',' ',unicodedata.normalize('NFKC',s).upper()).strip()
def zip5(s):return s[:5] if re.fullmatch(r'\d{5}(?:-?\d{4})?',s or '') else ''
def clean(s,maxlen):
 return s.strip() if isinstance(s,str) and len(s)<=maxlen and not re.search(r'[\x00-\x1f\x7f]',s) else ''
def address(street,city,state,postal):
 a=dict(street=clean(street,160),city=clean(city,100),state=state,zip=zip5(postal))
 return a if a['street'] and a['city'] and state in STATES else None
def physical(a):
 return bool(a and a['zip'] and re.match(r'^\d+[A-Za-z]?(?:[- ]\d+[A-Za-z]?)?\s+\S',a['street']) and not re.search(r'\b(?:P\s*\.?\s*O\s*\.?\s*BOX|POST OFFICE BOX|PMB|PRIVATE MAILBOX)\b',a['street'],re.I))
def base_street(s):
 return re.sub(r'(?:,?\s+(?:STE|SUITE|UNIT|APT|FLOOR|FL|#)\s*[\w-]+.*)$','',s,flags=re.I).strip()
def normal_street(s):return ' '.join(ALIAS.get(t,t) for t in re.sub(r'[.,]',' ',s.upper()).split())
def match_address(a,text):
 p=[v.strip() for v in text.split(',')]
 if len(p)==4: state,postal=p[2].upper(),p[3]
 elif len(p)==3:
  pair=p[2].split()
  if len(pair)!=2:return False
  state,postal=pair
 else:return False
 return normal_street(p[0])==normal_street(base_street(a['street'])) and normal_street(p[1])==normal_street(a['city']) and state==a['state'] and zip5(postal)==a['zip']
def native_key(row):
 sid,src,name,state=row[:4]
 if state not in STATES:return None
 if src=='NPPES':return 'NPI:'+sid[6:] if re.fullmatch(r'nppes:\d{10}',sid) else None
 prefix='usfa:'+state+':'
 if src!='USFA' or not sid.startswith(prefix):return None
 fdid=sid[len(prefix):].strip().upper()
 return 'FDID:'+state+':'+fdid if re.fullmatch(r'[-A-Z0-9.]{1,80}',fdid) and not fdid.startswith('LOCATION-') and not re.match(r'^[A-Z]{2}-(?:FD|EMS)-\d{5}',fdid) else None
def read_registry(public=PUBLIC):
 base=public/'national';manifest=json.loads((base/'index.json').read_bytes());rows=[]
 for c in manifest['chunks']:
  if not re.fullmatch(r'(?:[A-Z]{2}|other-[a-f0-9]{8})\.json',c['file']):raise ValueError('Invalid shard name')
  data=(base/c['file']).read_bytes()
  if sha(data)!=c['sha256']:raise ValueError('Registry shard digest mismatch')
  part=json.loads(data)
  if len(part)!=c['count'] or any(len(r)!=12 or r[3]!=c['state'] or not all(isinstance(v,str) for v in r) for r in part):raise ValueError('Registry shard structure mismatch')
  rows.extend(part)
 if len(rows)!=manifest['totalRecords'] or len({r[0] for r in rows})!=len(rows):raise ValueError('Registry totals mismatch')
 return manifest,rows
def extract_nppes(archive,targets):
 """Stream the primary CSV once. Match the pinned release's exact NPI, name, city, state and ZIP."""
 fields=['NPI','Entity Type Code','Provider Organization Name (Legal Business Name)','Provider First Line Business Practice Location Address','Provider Second Line Business Practice Location Address','Provider Business Practice Location Address City Name','Provider Business Practice Location Address State Name','Provider Business Practice Location Address Postal Code']
 hits={};conflicts=set();seen=set()
 with zipfile.ZipFile(archive) as z:
  files=[f for f in z.infolist() if pathlib.Path(f.filename).name.startswith('npidata_pfile_') and f.filename.endswith('.csv') and 'fileheader' not in f.filename]
  if len(files)!=1 or files[0].file_size>25_000_000_000:raise ValueError('Unexpected CMS archive')
  with z.open(files[0]) as raw,io.TextIOWrapper(raw,encoding='utf-8-sig',newline='') as src:
   csv.field_size_limit(2_000_000);reader=csv.DictReader(src)
   if not reader.fieldnames or any(k not in reader.fieldnames for k in fields):raise ValueError('Missing CMS primary address fields')
   taxonomy=[k for k in reader.fieldnames if k.startswith('Healthcare Provider Taxonomy Code_')]
   if not taxonomy:raise ValueError('Missing taxonomy fields')
   for r in reader:
    npi=r.get('NPI','')
    if npi not in targets:continue
    if npi in seen:conflicts.add(npi);continue
    seen.add(npi);t=targets[npi]
    state=(r.get(fields[6]) or '').strip();city=(r.get(fields[5]) or '').strip();postal=(r.get(fields[7]) or '').strip()
    if r.get(fields[1])!='2' or not any((r.get(k) or '').startswith('3416') for k in taxonomy) or name_key(r.get(fields[2]) or '')!=name_key(t[2]) or state!=t[3] or name_key(city)!=name_key(t[4]) or zip5(postal)!=zip5(t[5]):
     conflicts.add(npi);continue
    street=', '.join(v for v in ((r.get(fields[3]) or '').strip(),(r.get(fields[4]) or '').strip()) if v)
    a=address(street,city,state,postal)
    if a:hits[npi]=a
 for npi in conflicts:hits.pop(npi,None)
 return hits,conflicts
def build_entries(manifest,rows,fl,archive=None):
 targets={r[0][6:]:r for r in rows if r[1]=='NPPES' and native_key(r)}
 hits,conflicts=extract_nppes(archive,targets) if archive else ({},set())
 entries=[];excluded=collections.Counter()
 for r in rows:
  key=native_key(r)
  if not key:excluded[r[1]]+=1;continue
  source='USFA' if r[1]=='USFA' else 'NPPES'
  a=address(r[10],r[4],r[3],r[5])
  if source=='NPPES' and archive:a=hits.get(r[0][6:])
  status='review' if source=='NPPES' and r[0][6:] in conflicts else 'historical' if r[9] else 'source-missing' if not a else 'pending' if physical(a) else 'not-eligible'
  entries.append(dict(key=key,name=r[2],state=r[3],source=source,sourceDate=manifest['sources'][source].get('retrievedAt') if source=='USFA' else manifest['sources'][source].get('reportingPeriod'),address=a,status=status,match=None,sourceCounty=r[6],countyFips=''))
 for r in fl['records']:
  if r['headquartersState']!='FL':excluded['State EMS']+=1;continue
  if not re.fullmatch(r'\d{1,12}',r['identifier']):raise ValueError('Invalid Florida license')
  a=address(r['address'],r['city'],'FL',r['postalCode'])
  active=r['issuedAt']<=fl['sourceDate']<=r['expiresAt']
  entries.append(dict(key='STATE-EMS:FL:license:'+r['identifier'],name=r['name'],state='FL',source='State EMS',sourceDate=fl['sourceDate'],address=a,status='historical' if not active else 'source-missing' if not a else 'pending' if physical(a) else 'not-eligible',match=None,sourceCounty='',countyFips=''))
 if len({e['key'] for e in entries})!=len(entries):raise ValueError('Duplicate native location identity')
 return entries,dict(excluded),len(hits),len(conflicts)
def parse_batch(text,expected,state_fips,valid_counties):
 """The response is keyed by submitted opaque numeric IDs. Every ID must occur exactly once."""
 rows={}
 for r in csv.reader(io.StringIO(text)):
  if not r:continue
  if len(r)<3 or r[0] not in expected or r[0] in rows:raise ValueError('Unknown or duplicated geocoding result ID')
  rows[r[0]]=r
 if set(rows)!=set(expected):raise ValueError('Geocoding result does not reconcile')
 out={}
 for k,r in rows.items():
  a=expected[k];status='no-match';match=None;county=''
  if r[2]=='Match' and len(r)>=10 and r[3]=='Exact' and match_address(a,r[4]):
   try:lon,lat=map(float,r[5].split(','))
   except (ValueError,TypeError):lon,lat=math.nan,math.nan
   cf=r[8]+r[9]
   if math.isfinite(lat) and math.isfinite(lon) and -90<=lat<=90 and -180<=lon<=180 and (lat or lon) and state_fips.get(a['state'])==r[8] and cf in valid_counties:
    status='mapped';county=cf;match=dict(latitude=lat,longitude=lon,matchedAddress=r[4],method='census-address-range')
  out[k]=(status,match,county)
 return out
def geocode(entries,state_fips,valid_counties,batch_size):
 # Identical addresses share a lookup, not an identity or an account.
 groups=collections.defaultdict(list)
 for e in entries:
  if e['status']=='pending':groups[tuple(e['address'][k] for k in ('street','city','state','zip'))].append(e)
 values=list(groups.values())
 for start in range(0,len(values),batch_size):
  batch=values[start:start+batch_size];expected={str(i+1):v[0]['address'] for i,v in enumerate(batch)}
  with tempfile.TemporaryDirectory() as td:
   inp=pathlib.Path(td)/'input.csv';out=pathlib.Path(td)/'output.csv'
   with inp.open('w',newline='',encoding='utf-8') as f:
    w=csv.writer(f)
    for k,a in expected.items():w.writerow([k,base_street(a['street']),a['city'],a['state'],a['zip']])
   try:
    subprocess.run(['curl','--fail','--silent','--show-error','--proto','=https','--connect-timeout','25','--max-time','420','--max-filesize','8000000','--form','addressFile=@'+str(inp),'--form','benchmark='+BENCHMARK,'--form','vintage='+VINTAGE,'--output',str(out),ENDPOINT],check=True,timeout=450)
    if out.stat().st_size>8_000_000:raise ValueError('Batch response too large')
    results=parse_batch(out.read_text(encoding='utf-8-sig'),expected,state_fips,valid_counties)
   except (subprocess.SubprocessError,OSError,ValueError,UnicodeError):
    results={k:('unavailable',None,'') for k in expected}
   for i,group in enumerate(batch):
    status,match,county=results[str(i+1)]
    for e in group:
     e['status']=status;e['match']=match;e['countyFips']=county
   print('Census batch',start//batch_size+1,'of',math.ceil(len(values)/batch_size),'complete:',dict(collections.Counter(v[0] for v in results.values())),flush=True)
def publish(output,manifest,entries,metadata):
 output.mkdir(parents=True,exist_ok=True)
 chunks=[]
 for state in sorted(STATES):
  records=sorted([e for e in entries if e['state']==state],key=lambda e:e['key'])
  data=compact(records);file=state+'.json';(output/file).write_bytes(data)
  chunks.append(dict(state=state,file=file,count=len(records),sha256=sha(data),registrySha256=next(c['sha256'] for c in manifest['chunks'] if c['state']==state)))
 by_source={}
 for source in ('USFA','NPPES','State EMS'):
  rows=[e for e in entries if e['source']==source]
  by_source[source]=dict(total=len(rows),withAddress=sum(e['address'] is not None for e in rows),statuses=dict(collections.Counter(e['status'] for e in rows)))
 index=dict(schemaVersion=1,generatedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),benchmark=BENCHMARK,vintage=VINTAGE,sourceScope='Public source identities; not a census of unique active operating departments',chunks=chunks,coverage=by_source,**metadata)
 (output/'index.json').write_bytes(compact(index));print(json.dumps(by_source,indent=2),flush=True)
def valid_location_method(m,county):
 if m.get('method')=='census-address-range':return 'point' not in m
 if m.get('method')=='ohio-lbrs-address-point':
  p=m.get('point')
  return isinstance(p,dict) and isinstance(p.get('objectId'),int) and not isinstance(p['objectId'],bool) and p['objectId']>0 and isinstance(p.get('sourceDate'),str) and bool(re.fullmatch(r'\d{4}-\d{2}-\d{2}',p['sourceDate'])) and p.get('countyFips')==county and county.startswith('39') and 38.3<=m.get('latitude',0)<=42.1 and -85<=m.get('longitude',0)<=-80.4
 if m.get('method')!='nad-address-point':return False
 p=m.get('point')
 return isinstance(p,dict) and isinstance(p.get('objectId'),int) and not isinstance(p['objectId'],bool) and p['objectId']>0 and p.get('release')=='2026-09-30' and isinstance(p.get('authority'),str) and 0<len(p['authority'].strip())<=150 and not re.search(r'[\x00-\x1f\x7f]',p['authority']) and p.get('placement') in ('Structure - Rooftop','Structure - Entrance','Structure - Interior','Structure - Interior Unit Location','Property Access Point','Site Placement','Parcel - Centroid','Parcel - Other/Manual Placement') and p.get('countyFips')==county
def verify(output,manifest,rows,fl):
 index=json.loads((output/'index.json').read_bytes())
 if index['schemaVersion']!=1 or index['benchmark']!=BENCHMARK or index['vintage']!=VINTAGE:raise ValueError('Invalid location manifest')
 expected={native_key(r):(r[2],r[3],'USFA' if r[1]=='USFA' else 'NPPES') for r in rows if native_key(r)}
 expected.update({'STATE-EMS:FL:license:'+r['identifier']:(r['name'],'FL','State EMS') for r in fl['records'] if r['headquartersState']=='FL'})
 seen=set();counts=collections.defaultdict(collections.Counter)
 fips={c['GEOID']:c['USPS'] for c in json.loads((ROOT/'scripts/fixtures/census-2026-county-identities.json').read_text())['counties']}
 for c in index['chunks']:
  state=c['state']
  if state not in STATES or c['file']!=state+'.json' or c['registrySha256']!=next(x['sha256'] for x in manifest['chunks'] if x['state']==state):raise ValueError('Wrong source snapshot')
  data=(output/c['file']).read_bytes();records=json.loads(data)
  if sha(data)!=c['sha256'] or len(records)!=c['count']:raise ValueError('Location shard mismatch')
  for e in records:
   k=e['key'];a=e['address'];m=e['match'];status=e['status'];source=e['source']
   if k in seen or expected.get(k)!=(e['name'],state,source) or e['state']!=state or status not in ('mapped','no-match','not-eligible','source-missing','unavailable','review','historical','pending'):raise ValueError('Invalid location identity')
   seen.add(k);counts[source]['total']+=1;counts[source]['withAddress']+=int(a is not None);counts[source][status]+=1
   if a and address(a['street'],a['city'],a['state'],a['zip'])!=a:raise ValueError('Malformed source address')
   if status=='mapped':
    if not physical(a) or not m or not match_address(a,m['matchedAddress']) or not valid_location_method(m,e['countyFips']) or not math.isfinite(m['latitude']) or not math.isfinite(m['longitude']) or abs(m['latitude'])>90 or abs(m['longitude'])>180 or not (m['latitude'] or m['longitude']) or fips.get(e['countyFips'])!=state:raise ValueError('Invalid mapped record')
   elif m is not None or e['countyFips']:raise ValueError('Unmatched record contains coordinates')
 if seen!=set(expected) or {c['state'] for c in index['chunks']}!=STATES or len(index['chunks'])!=51:raise ValueError('Incomplete native location coverage')
 for source,c in counts.items():
  declared=index['coverage'][source]
  if c['total']!=declared['total'] or c['withAddress']!=declared['withAddress'] or {k:v for k,v in c.items() if k not in ('total','withAddress')}!=declared['statuses']:raise ValueError('Coverage totals mismatch')
 print('PASS location identity, hash, coordinate and coverage verification',len(seen))
def main():
 p=argparse.ArgumentParser();p.add_argument('--archive',type=pathlib.Path);p.add_argument('--output',type=pathlib.Path,default=PUBLIC/'locations');p.add_argument('--geocode',action='store_true');p.add_argument('--verify',action='store_true');p.add_argument('--batch-size',type=int,default=4000);args=p.parse_args()
 if not 1<=args.batch_size<=5000:raise ValueError('Batch size outside allowed range')
 manifest,rows=read_registry();fl=json.loads((PUBLIC/'state-ems/FL.json').read_bytes())
 if args.verify:verify(args.output,manifest,rows,fl);return
 if manifest['sources']['NPPES']['sourceUrl']!=SOURCE:raise ValueError('CMS release changed; pin and review the new source explicitly')
 entries,excluded,hits,conflicts=build_entries(manifest,rows,fl,args.archive)
 metadata=dict(excludedWithoutSupportedIdentity=excluded,nppesArchive=dict(url=SOURCE,reportingPeriod=manifest['sources']['NPPES']['reportingPeriod'],status='processed' if args.archive else 'unavailable',sha256=digest_file(args.archive) if args.archive else None,exactAddressMatches=hits,conflicts=conflicts),floridaRosterDate=fl['sourceDate'])
 if args.geocode:
  county=json.loads((ROOT/'scripts/fixtures/census-2026-county-identities.json').read_text())['counties']
  geocode(entries,{c['USPS']:c['GEOID'][:2] for c in county},{c['GEOID'] for c in county},args.batch_size)
 publish(args.output,manifest,entries,metadata);verify(args.output,manifest,rows,fl)
if __name__=='__main__':main()
