#!/usr/bin/env python3
"""Rebuild the read-only national source directory; never create operating/equipment facts.
Usage: python scripts/build-national-source-directory.py /path/to/usfa.csv
The USFA CSV comes from https://apps.usfa.fema.gov/registry/api/download/national
"""
import base64, collections, csv, datetime, gzip, hashlib, json, pathlib, re, sys, unicodedata
ROOT=pathlib.Path(__file__).resolve().parents[1]
APP=ROOT/'artifacts/ems-territory-intelligence'
reference=json.loads((ROOT/'scripts/fixtures/census-2026-county-identities.json').read_text())['counties']
corrections=json.loads((APP/'src/data/county-geography-corrections.json').read_text())
def key(value):
 value=''.join(c for c in unicodedata.normalize('NFKD',value.lower()) if not unicodedata.combining(c))
 value=re.sub(r'\s+(county|parish|city and borough|borough|census area|municipality|planning region|city)$','',value)
 return re.sub('[^a-z0-9]','',re.sub(r'\bsaint\b','st',re.sub(r'\bsainte\b','ste',value)))
county_index=collections.defaultdict(set)
for c in reference: county_index[(c['USPS'],key(c['NAME']))].add(c['GEOID'])
for c in corrections['aliases']:
 for alias in c['aliases']: county_index[(c['stateCode'],key(alias))].add(c['countyFips'])
states={c['USPS'] for c in reference}
county_names={c['GEOID']:c['NAME'] for c in reference}
towns=corrections['connecticutTowns']
def town_key(v): return re.sub('[^a-z0-9]','',v.lower())
def locate(state,county,city):
 # CT legacy counties split across planning regions. Only the official town
 # crosswalk plus a compatible reported legacy county establishes this location.
 if state=='CT':
  town=towns.get(town_key(city))
  if town and key(county)==key(town['legacyCountyName']): return town['countyFips'],'official-town-crosswalk'
 choices=county_index[(state,key(county))] if county else set()
 return (next(iter(choices)),'source-county') if len(choices)==1 else ('','unassigned')
rows=[];seen=set();duplicates=0
source=pathlib.Path(sys.argv[1]);fire_rows=list(csv.DictReader(source.read_text(encoding='utf-8-sig').splitlines(),skipinitialspace=True))
for r in fire_rows:
 state=r['HQ state'].strip(); source_id=r['FDID'].strip() or 'location-'+hashlib.sha256(json.dumps([r['Fire dept name'],r['HQ city'],r['HQ addr1'],r['HQ zip']]).encode()).hexdigest()[:20]; sid='usfa:'+state+':'+source_id
 if not r['Fire dept name'].strip(): raise ValueError('Invalid USFA identity')
 if sid in seen: duplicates+=1;continue
 seen.add(sid);county,basis=locate(state,r['County'],r['HQ city'])
 rows.append([sid,'USFA',r['Fire dept name'].strip(),state,r['HQ city'].strip(),r['HQ zip'].strip(),county,r['County'].strip(),basis,'',r['HQ addr1'].strip(),r['Website'].strip()])
index=json.loads((APP/'public/registry/nppes/index.json').read_text());nppes_count=0
for chunk in index['chunks']:
 content=gzip.decompress(base64.b64decode((APP/'public/registry/nppes'/chunk['file']).read_text()))
 assert hashlib.sha256(content).hexdigest()==chunk['sha256']
 part=[json.loads(s) for s in content.splitlines() if s.strip()];assert len(part)==chunk['count']
 for r in part:
  sid='nppes:'+r['npi'];assert sid not in seen;seen.add(sid);nppes_count+=1
  loc=r['location']
  # A postal city/ZIP is not a county boundary. NPPES has no county field here.
  rows.append([sid,'NPPES',r['legalName'],loc['state'],loc['city'],loc['postalCode'],'','','unassigned',r['deactivationDate'],'', 'https://npiregistry.cms.hhs.gov/provider-view/'+r['npi']])
assert nppes_count==index['summary']['accepted']
by_state={}
for state in sorted(states):
 records=[r for r in rows if r[3]==state];usfa=[r for r in records if r[1]=='USFA'];nppes=[r for r in records if r[1]=='NPPES']
 by_state[state]={'usfa':len(usfa),'nppes':len(nppes),'assigned':sum(bool(r[6]) for r in records),'unassigned':sum(not r[6] for r in records),'countiesWithRecords':len({r[6] for r in records if r[6]}),'countyCount':sum(c['USPS']==state for c in reference)}
assert len(by_state)==51 and all(s['usfa'] and s['nppes'] for s in by_state.values())
manifest={'schemaVersion':1,'preparedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'fields':['id','source','name','stateCode','city','postalCode','countyFips','sourceCounty','countyBasis','deactivatedAt','address','sourceLink'],'sources':{'USFA':{'url':'https://apps.usfa.fema.gov/registry/download','downloadUrl':'https://apps.usfa.fema.gov/registry/api/download/national','retrievedAt':'2026-11-17','sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'received':len(fire_rows),'accepted':len(fire_rows)-duplicates,'duplicates':duplicates,'limitation':'Registry no longer accepts registrations or updates. A listing does not establish current operations or equipment.'},'NPPES':{**index['manifest'],'accepted':nppes_count,'limitation':'Ambulance-taxonomy organizations, not a licensing roster. NPIs can represent multiple locations of one operator. No county or equipment is reported in this snapshot.'}},'byState':by_state,'totalRecords':len(rows),'statesAndDcRecords':sum(r[3] in states for r in rows),'otherJurisdictionRecords':sum(r[3] not in states for r in rows),'countiesWithRecords':len({r[6] for r in rows if r[6]}),'unassignedRecords':sum(not r[6] for r in rows),'scope':'Source listings are not deduplicated operating agencies. USFA/NPIs may overlap. No current equipment, buyers, contacts or service-area coverage is inferred.'}
out=APP/'public/registry/national';out.mkdir(parents=True,exist_ok=True)
# State shards keep a county/state drilldown from downloading the entire nation.
chunks=[]
for state in sorted({r[3] for r in rows}):
 selected=[r for r in rows if r[3]==state]
 filename=(state if re.fullmatch('[A-Z]{2}',state) else 'other-'+hashlib.sha256(state.encode()).hexdigest()[:8])+'.json'
 data=json.dumps(selected,separators=(',',':'),ensure_ascii=False).encode();(out/filename).write_bytes(data)
 chunks.append({'state':state,'file':filename,'count':len(selected),'sha256':hashlib.sha256(data).hexdigest()})
manifest['chunks']=chunks
manifest['countyNames']=county_names
manifest['stateNames']=dict(re.findall(r"'([A-Z]{2})': \{ state: '([^']+)'",(APP/'src/data/nationalGeographicData.ts').read_text()))
(out/'index.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n')
print(json.dumps({k:manifest[k] for k in ['totalRecords','statesAndDcRecords','otherJurisdictionRecords','countiesWithRecords','unassignedRecords','byState']},indent=2))
