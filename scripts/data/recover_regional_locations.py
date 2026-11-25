#!/usr/bin/env python3
"""Strict regional government address-point recovery; never creates provider records."""
import argparse,collections,datetime,hashlib,json,math,pathlib,re,time,urllib.parse,urllib.request
from backfill_provider_locations import ROOT,PUBLIC,physical,base_street,match_address,normal_street,read_registry,publish,verify
from recover_nad_locations import NoRedirect,county_index,county_key,sql
from regional_point_contract import SOURCES,valid_regional_point
FIELDS={
 'nc-addressnc':('objectid','add_number','st_address','post_code','post_comm','state','statefips','county','countyfips','unit','building','floor','placement','dateupdate','effective','expire','gc_exception'),
 'fl-hillsborough':('OBJECTID','ADDRNUM','FULLADDR','ZIP','POSTALCOMM','UNITID','UNITTYPE','POINTTYPE','STATUS','LASTUPDATE'),
 'fl-pinellas':('OBJECTID','ADDRNUM','FULLADDR','POSTCODE','MAILINGCITY','UNITID','UNITTYPE','POINTTYPE','STATUS','BLDGADDRCLASS','LAST_EDITED_DATE'),
 'nj-addresspoints':('OBJECTID','ADD_NUMBER','FULLADDR','POST_CODE','POST_COMM','STATE','COUNTY','COUNTRY','SUBTYPE','PRIMARYPT','STATUS','BUILDING','FLOOR','UNIT','ROOM','SEAT','PLACEMENT','DATEUPDATE','EFFECTIVE','EXPIRE'),
 'tx-prosper':('OBJECTID','Add_Number','Address','Post_Comm','Post_Code','County','State','Country','Building','Wing','Floor','Unit','Room','Stru_Priority','Placement','GC_Exception','DateUpdate','Effective','Expire'),
 'pa-cumberland':('OBJECTID','Add_Number','Address','Post_Comm','Post_Code','County','State','Country','Building','Floor','Unit','Room','Seat','Placement','DiscrpAgID','DateUpdate','Effective','Expire'),
 'tx-stratmap':('objectid','dateupdate','add_number','full_addr','building','floor','unit','post_comm','post_code','state','country','county','fips','source','date_acq')}
QUERY_KEYS={'nc-addressnc':('add_number','post_code'),'fl-hillsborough':('ADDRNUM','ZIP'),'fl-pinellas':('ADDRNUM','POSTCODE'),'nj-addresspoints':('ADD_NUMBER','POST_CODE'),'tx-prosper':('Add_Number','Post_Code'),'pa-cumberland':('Add_Number','Post_Code'),'tx-stratmap':('add_number','post_code')}
NAMES={'nc-addressnc':('AddressNC','North Carolina Counties'),'fl-hillsborough':('SiteAddressPoints','Hillsborough County'),'fl-pinellas':('Addresses','Pinellas County Safety and Emergency Services'),'nj-addresspoints':('Addr_addressPoint','NJ Office of Information Technology, Office of GIS (NJOGIS)'),'tx-prosper':('Address Points','Town of Prosper'),'pa-cumberland':('Address Point',''),'tx-stratmap':('StratMap Address Points 48 Most Recent','')}

COUNTY_ADAPTERS=json.loads("{\"il-peoria\":{\"name\":\"E_911_Addresses\",\"authority\":\"Peoria County\",\"house\":\"Add_Number\",\"postal\":\"Post_Code\",\"city\":\"Post_Comm\",\"street\":\"Fulladdr\",\"integer\":true,\"date\":\"DateUpdate\",\"placement\":\"Placement\",\"sub\":[\"Unit\",\"Addtl_Loc\"],\"lifecycle\":true},\"il-lake\":{\"name\":\"Address Points\",\"authority\":\"\",\"house\":\"Add_Number\",\"postal\":\"Post_Code\",\"city\":\"Post_Comm\",\"street\":\"FULLADDR\",\"integer\":true,\"date\":\"DateUpdate\",\"placement\":\"Placement\",\"sub\":[\"Building\",\"Floor\",\"Unit\",\"Room\",\"Seat\",\"Addtl_Loc\"],\"lifecycle\":true,\"status\":\"STATUS\"},\"pa-northampton\":{\"name\":\"Address Pts\",\"authority\":\"\",\"house\":\"AddrNum\",\"postal\":\"Zip\",\"city\":\"PostalCity\",\"street\":\"FullAddr\",\"integer\":false,\"date\":\"DateUpdate\",\"placement\":null,\"sub\":[\"UnitType\",\"Unit\",\"Building\",\"Floor\"],\"lifecycle\":true},\"al-baldwin\":{\"name\":\"Address Pts\",\"authority\":\"\",\"house\":\"Add_Number\",\"postal\":\"Post_Code\",\"city\":\"Post_Comm\",\"street\":\"Full_Address\",\"integer\":true,\"date\":\"last_edited_date\",\"placement\":\"Placement\",\"sub\":[\"Building\",\"Floor\",\"Unit\",\"Room\",\"Seat\",\"Addtl_Loc\"],\"lifecycle\":false}}")
for key,adapter in COUNTY_ADAPTERS.items():
 fields=['OBJECTID','State','Country','County',adapter['house'],adapter['postal'],adapter['city'],adapter['street'],adapter['date'],*adapter['sub']]
 if adapter['placement']:fields.append(adapter['placement'])
 if adapter['lifecycle']:fields.extend(['Effective','Expire'])
 if adapter.get('status'):fields.append(adapter['status'])
 FIELDS[key]=tuple(dict.fromkeys(fields));QUERY_KEYS[key]=(adapter['house'],adapter['postal']);NAMES[key]=(adapter['name'],adapter['authority'])
def request(source,params,query=False):
 u=SOURCES[source]['url']+('/query' if query else '')+'?'+urllib.parse.urlencode(params)
 if len(u)>3800:raise ValueError('Regional query exceeds URL budget')
 req=urllib.request.Request(u,headers={'Accept':'application/json','User-Agent':'ATLAS-public-organization-location/1.0'})
 with urllib.request.build_opener(NoRedirect()).open(req,timeout=35) as res:raw=res.read(4_000_001)
 if len(raw)>4_000_000:raise ValueError('Regional response exceeds bound')
 obj=json.loads(raw)
 if not isinstance(obj,dict) or 'error' in obj:raise ValueError('Regional GIS query returned an error')
 return obj
def metadata(source,fetch=request):
 obj=fetch(source,{'f':'json'})
 name,authority=NAMES[source]
 if obj.get('name')!=name or authority not in obj.get('copyrightText','') or obj.get('geometryType')!='esriGeometryPoint' or not set(FIELDS[source])<=set(f.get('name') for f in obj.get('fields',[])):raise ValueError('Regional service schema or authority changed')
 fields={f['name']:f for f in obj['fields']}
 if source in COUNTY_ADAPTERS:
  adapter=COUNTY_ADAPTERS[source]
  expected='esriFieldTypeInteger' if adapter['integer'] else 'esriFieldTypeString'
  if fields[adapter['house']].get('type')!=expected:raise ValueError('County address number schema changed')
  if source=='al-baldwin' and obj.get('serviceItemId')!='2f0c8ddaa17f47fa9bbbbddce45e59cf':raise ValueError('Baldwin service identity changed')
 if source=='tx-stratmap':
  if obj.get('serviceItemId')!='2685d5c62657428583b688f140cb7021' or fields['add_number'].get('type')!='esriFieldTypeString' or fields['fips'].get('type') not in ('esriFieldTypeBigInteger','esriFieldTypeInteger') or fields['dateupdate'].get('type')!='esriFieldTypeString':raise ValueError('Texas StratMap source identity or schema changed')
 if source=='pa-cumberland':
  county_codes=(fields['County'].get('domain') or {}).get('codedValues',[])
  if not any(v.get('code')=='Cumberland County' and v.get('name')=='Cumberland County' for v in county_codes):raise ValueError('Cumberland source county domain changed')
 if source in ('tx-prosper','pa-cumberland') and fields['Add_Number'].get('type')!='esriFieldTypeInteger':raise ValueError('Unexpected regional house number field')
 zipfield=fields[QUERY_KEYS[source][1]]
 domain=zipfield.get('domain') or {}
 zips={v['code'] for v in domain.get('codedValues',[]) if isinstance(v.get('code'),str) and re.fullmatch(r'\d{5}',v['code'])}
 # Some enterprise layers expose no global edit date. Preserve observed date and actual record date instead.
 marker={'serviceItemId':obj.get('serviceItemId'),'name':name,'copyrightText':obj['copyrightText'],'fields':[(k,fields[k].get('type')) for k in FIELDS[source]],'lastEditDate':(obj.get('editingInfo') or {}).get('lastEditDate'),'zipCodes':sorted(zips)}
 if source=='nj-addresspoints':
  county_domain=(fields['COUNTY'].get('domain') or {}).get('codedValues',[])
  codes={v['code']:v['name'] for v in county_domain if isinstance(v.get('code'),str) and isinstance(v.get('name'),str)}
  if len(codes)!=21 or len(set(codes.values()))!=21:raise ValueError('NJ county coded domain changed')
  marker['countyDomain']=codes
  if fields['ADD_NUMBER'].get('type')!='esriFieldTypeInteger':raise ValueError('NJ house number schema changed')
 return marker,zips
def number(a):
 if not physical(a):return None
 m=re.match(r'^(\d{1,6}[A-Za-z]?)\s+\S',base_street(a['street']))
 return m.group(1).upper() if m else None
def query(source,addresses):
 if not 1<=len(addresses)<=(16 if source=='tx-stratmap' else 8) or any(a['state']!=SOURCES[source]['state'] or number(a) is None or not re.fullmatch(r'\d{5}',a['zip']) for a in addresses):raise ValueError('Invalid regional batch')
 house,zipfield=QUERY_KEYS[source]
 if source=='tx-stratmap':
 if source in COUNTY_ADAPTERS:
  adapter=COUNTY_ADAPTERS[source]
  def house_value(a):return str(int(re.match(r'\d+',number(a)).group())) if adapter['integer'] else sql(number(a))
  clauses=sorted({f"({house}={house_value(a)} AND {zipfield}={sql(a['zip'])})" for a in addresses})
  where="State="+sql(SOURCES[source]['state'])+" AND Country='US' AND ("+' OR '.join(clauses)+')'
 elif source=='tx-stratmap':
  clauses=sorted({f"({house}={sql(number(a))} AND {zipfield}={sql(a['zip'])})" for a in addresses})
  where="state='TX' AND country='US' AND ("+' OR '.join(clauses)+')'
 elif source in ('tx-prosper','pa-cumberland'):
  clauses=sorted({f"({house}={int(re.match(r'\d+',number(a)).group())} AND {zipfield}={sql(a['zip'])})" for a in addresses})
  where="State="+sql(SOURCES[source]['state'])+" AND Country='US' AND ("+' OR '.join(clauses)+')'
 elif source=='nj-addresspoints':
  clauses=sorted({f"({house}={int(re.match(r'\d+',number(a)).group())} AND {zipfield}={sql(a['zip'])})" for a in addresses})
  where="STATE='NJ' AND COUNTRY='US' AND SUBTYPE=1210 AND PRIMARYPT='Y' AND STATUS='A' AND ("+' OR '.join(clauses)+')'
 else:
  clauses=sorted({f"({house}={sql(number(a))} AND {zipfield}={sql(a['zip'])})" for a in addresses})
  where=' OR '.join(clauses)
 return dict(f='json',where=where,outFields=','.join(FIELDS[source]),returnGeometry='true',outSR='4326',resultRecordCount='1000')
def features(source,payload):
 rows=payload.get('features')
 if not isinstance(rows,list) or payload.get('exceededTransferLimit') or len(rows)>=1000:raise ValueError('Incomplete regional point response')
 if not rows:return []
 sr=payload.get('spatialReference') or {}
 if 4326 not in (sr.get('wkid'),sr.get('latestWkid')):raise ValueError('Expected WGS84 coordinates')
 ids=set();oidfield=FIELDS[source][0]
 for f in rows:
  if not isinstance(f,dict) or not isinstance(f.get('attributes'),dict) or not isinstance(f.get('geometry'),dict):raise ValueError('Malformed regional point')
  oid=f['attributes'].get(oidfield)
  if type(oid) is not int or not 0<oid<=9007199254740991 or oid in ids:raise ValueError('Invalid or duplicated point identity')
  ids.add(oid)
 return rows
def date_value(v):
 if v in (None,''):return None
 if type(v) not in (int,float) or not math.isfinite(v) or v<=0:raise ValueError('Invalid source record date')
 return datetime.datetime.fromtimestamp(v/1000,datetime.timezone.utc).date().isoformat()
def stratmap_date(value):
 # The published update field is text. Preserve only an unambiguous ISO date.
 if not isinstance(value,str):return None
 m=re.fullmatch(r'(\d{4}-\d{2}-\d{2})(?:[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)?',value.strip())
 if not m:return None
 try:return datetime.date.fromisoformat(m.group(1)).isoformat()
 except ValueError:return None

def resolve(source,e,rows,counties,checked,county_domain=None):
 d=SOURCES[source];a=e['address'];hits=[];bad=False
 for f in rows:
  v=f['attributes'];g=f['geometry'];cf=d['county']
  if source=='nc-addressnc':
   street,city,postal=v.get('st_address'),v.get('post_comm'),v.get('post_code')
   if v.get('state')!='NC':continue
   if any(v.get(k) not in (None,'') for k in ('unit','building','floor')):continue
   placement=v.get('placement');date=v.get('dateupdate')
  elif source in COUNTY_ADAPTERS:
   adapter=COUNTY_ADAPTERS[source]
   if v.get('State')!=d['state'] or v.get('Country')!='US':continue
   if any(v.get(k) not in (None,'') for k in adapter['sub']):continue
   if adapter.get('status') and str(v.get(adapter['status']) or '').strip().lower() not in ('active','current'):continue
   street,city,postal=v.get(adapter['street']),v.get(adapter['city']),v.get(adapter['postal'])
   placement=v.get(adapter['placement']) if adapter['placement'] else 'Placement not reported'
   date=v.get(adapter['date'])
  elif source=='tx-stratmap':
   if v.get('state')!='TX' or v.get('country')!='US':continue
   if any(v.get(k) not in (None,'') for k in ('building','floor','unit')):continue
   street,city,postal=v.get('full_addr'),v.get('post_comm'),v.get('post_code')
   placement='Placement not reported';date=v.get('dateupdate')
  elif source in ('tx-prosper','pa-cumberland'):
   if v.get('State')!=d['state'] or v.get('Country')!='US':continue
   if any(v.get(k) not in (None,'') for k in ('Building','Wing','Floor','Unit','Room','Seat')):continue
   if source=='tx-prosper' and (v.get('Stru_Priority')!='Primary' or v.get('GC_Exception') not in (None,'')):continue
   if source=='pa-cumberland' and v.get('DiscrpAgID')!='cumberland.state.pa.us':continue
   street,city,postal=v.get('Address'),v.get('Post_Comm'),v.get('Post_Code')
   placement=v.get('Placement');date=v.get('DateUpdate')
  elif source=='nj-addresspoints':
   if v.get('STATE')!='NJ' or v.get('COUNTRY')!='US' or v.get('SUBTYPE')!=1210 or v.get('PRIMARYPT')!='Y' or v.get('STATUS')!='A':continue
   if any(v.get(k) not in (None,'') for k in ('BUILDING','FLOOR','UNIT','ROOM','SEAT')):continue
   street,city,postal=v.get('FULLADDR'),v.get('POST_COMM'),v.get('POST_CODE')
   placement=v.get('PLACEMENT');date=v.get('DATEUPDATE')
  else:
   street,city,postal=v.get('FULLADDR'),v.get('POSTALCOMM' if source=='fl-hillsborough' else 'MAILINGCITY'),v.get('ZIP' if source=='fl-hillsborough' else 'POSTCODE')
   if any(v.get(k) not in (None,'') for k in ('UNITID','UNITTYPE')):continue
   if source=='fl-hillsborough':
    if v.get('STATUS')!='Current':continue
    placement=v.get('POINTTYPE');date=v.get('LASTUPDATE')
   else:
    if v.get('STATUS')!='A' or v.get('BLDGADDRCLASS')!='Primary' or v.get('POINTTYPE') not in (None,''):continue
    placement='Primary building address';date=v.get('LAST_EDITED_DATE')
  if not isinstance(street,str) or not isinstance(city,str) or postal!=a['zip']:continue
  matched=street.strip()+', '+city.strip()+', '+a['state']+', '+a['zip']
  if not match_address(a,matched):continue
  if source=='nc-addressnc':
   try:
    effective,expires=date_value(v.get('effective')),date_value(v.get('expire'))
    if effective and effective>checked or expires and expires<=checked:continue
   except (ValueError,OverflowError,OSError):bad=True;continue
   c=v.get('countyfips')
   cf='37'+c if v.get('statefips')=='37' and isinstance(c,str) and re.fullmatch(r'\d{3}',c) else ''
   if cf not in counties.get(('NC',county_key(v.get('county') or '')),set()) or v.get('gc_exception') not in (None,''):bad=True;continue
  if source=='nj-addresspoints':
   try:
    effective,expires=date_value(v.get('EFFECTIVE')),date_value(v.get('EXPIRE'))
    if effective and effective>checked or expires and expires<=checked:continue
   except (ValueError,OverflowError,OSError):bad=True;continue
   name=(county_domain or {}).get(v.get('COUNTY'))
   fips=counties.get(('NJ',county_key(name)),set()) if name else set()
   if len(fips)!=1:bad=True;continue
   cf=next(iter(fips))
  if source in ('tx-prosper','pa-cumberland'):
   try:
    effective,expires=date_value(v.get('Effective')),date_value(v.get('Expire'))
    if effective and effective>checked or expires and expires<=checked:continue
   except (ValueError,OverflowError,OSError):bad=True;continue
   fips=counties.get((d['state'],county_key(v.get('County') or '')),set())
   allowed={'48085','48121'} if source=='tx-prosper' else {'42041'}
   if len(fips)!=1 or not fips<=allowed:bad=True;continue
   cf=next(iter(fips))
  if source in COUNTY_ADAPTERS:
   adapter=COUNTY_ADAPTERS[source]
   fips=counties.get((d['state'],county_key(v.get('County') or '')),set())
   if fips!={d['county']}:bad=True;continue
   if adapter['lifecycle']:
    try:
     effective,expires=date_value(v.get('Effective')),date_value(v.get('Expire'))
     if effective and effective>checked or expires and expires<=checked:continue
    except (ValueError,OverflowError,OSError):bad=True;continue
  if source=='tx-stratmap':
   # County FIPS and county name must independently reconcile to the same Census county.
   fips=counties.get(('TX',county_key(v.get('county') or '')),set())
   raw=v.get('fips')
   if type(raw) is not int or len(fips)!=1 or str(raw) not in fips or not isinstance(v.get('source'),str) or not v['source'].strip():bad=True;continue
   cf=str(raw)
  if e['sourceCounty'] and cf!=e['sourceCounty']:bad=True;continue
  try:updated=stratmap_date(date) if source=='tx-stratmap' else date_value(date)
  except (ValueError,OverflowError,OSError):bad=True;continue
  match=dict(latitude=g.get('y'),longitude=g.get('x'),matchedAddress=matched,method='regional-address-point',point=dict(source=source,objectId=v[FIELDS[source][0]],checkedAt=checked,recordUpdatedAt=updated,placement=placement,countyFips=cf))
  if not valid_regional_point(match,cf):bad=True;continue
  hits.append((cf,match))
 if bad:return None,'review'
 if not hits:return None,'no-match'
 if len({(cf,m['latitude'],m['longitude']) for cf,m in hits})!=1:return None,'ambiguous'
 return min(hits,key=lambda x:x[1]['point']['objectId']),'mapped'
def recover(source,entries,counties,checked,max_requests=100,delay=1.0,fetch=request):
 d=SOURCES[source];version,zips=metadata(source,fetch)
 county_domain=version.get('countyDomain',{})
 if source=='nj-addresspoints' and (len({next(iter(counties[('NJ',county_key(name))])) for name in county_domain.values() if len(counties.get(('NJ',county_key(name)),set()))==1})!=21):raise ValueError('NJ county domain does not reconcile to Census county identities')
 groups=collections.defaultdict(list);stats=collections.Counter();out={};review=set();errors=0;requests=0
 for e in entries:
  if e['state']!=d['state'] or e['status'] not in ('no-match','unavailable'):continue
  if d['county'] and e['sourceCounty'] and d['county']!=e['sourceCounty']:continue
  if source in COUNTY_ADAPTERS and not e['sourceCounty'] and e['address']:
   # Postal prefixes are a query-budget prefilter, never evidence of county identity.
   prefixes={'il-peoria':('615','616'),'il-lake':('600',),'pa-northampton':('180','181','183'),'al-baldwin':('365',)}
   if not e['address']['zip'].startswith(prefixes[source]):continue
  if source=='tx-prosper' and e['sourceCounty'] and e['sourceCounty'] not in ('48085','48121'):continue
  if source=='tx-prosper' and e['address'] and not e['sourceCounty'] and e['address']['city'].strip().lower() not in ('prosper','celina','frisco','mckinney','little elm','aubrey'):continue
  if source=='pa-cumberland' and not e['sourceCounty'] and e['address'] and not e['address']['zip'].startswith(('170','172')):continue
  a=e['address']
  if not number(a):stats['unsupported']+=1;continue
  if zips and a['zip'] not in zips:stats['outside_published_zip_domain']+=1;continue
  groups[(a['zip'],normal_street(base_street(a['street'])) if source=='tx-stratmap' else a['street'],normal_street(a['city']) if source=='tx-stratmap' else a['city'])].append(e)
 values=[groups[k] for k in sorted(groups)]
 batch_size=16 if source=='tx-stratmap' else 8
 for i in range(0,len(values),batch_size):
  batch=values[i:i+batch_size]
  if requests>=max_requests or errors>=3:stats['not_attempted']+=sum(map(len,batch));continue
  requests+=1
  try:rows=features(source,fetch(source,query(source,[g[0]['address'] for g in batch]),True));errors=0
  except (OSError,ValueError,TypeError,KeyError,TimeoutError) as exc:
   errors+=1;stats['unavailable']+=sum(map(len,batch));print(source,'unavailable',type(exc).__name__,str(exc)[:150],flush=True);time.sleep(min(15,delay*2**errors));continue
  for group in batch:
   for e in group:
    found,status=resolve(source,e,rows,counties,checked,county_domain);stats[status]+=1
    if found:out[e['key']]=found
    if status in ('review','ambiguous'):review.add(e['key'])
  if requests%10==0:print(source,requests,dict(stats),flush=True)
  time.sleep(delay)
 if metadata(source,fetch)[0]!=version:raise ValueError('Regional source metadata changed during query')
 return out,review,dict(stats,requests=requests,metadata=version)
def combine(entries,candidates,review):
 # A county/source conflict or multiple different points is not resolved by arbitrary precedence.
 stats=collections.Counter();conflicts=[]
 for e in entries:
  hits=[v[e['key']] for v in candidates.values() if e['key'] in v]
  if not hits:continue
  if e['status'] not in ('no-match','unavailable'):raise ValueError('Prior location mutation attempted')
  if e['key'] in review or len({(cf,m['latitude'],m['longitude']) for cf,m in hits})!=1:
   stats['conflicts_withheld']+=1;conflicts.append(e['key']);continue
  cf,m=hits[0];e.update(status='mapped',match=m,countyFips=cf);stats['newMapped']+=1;stats[m['point']['source']]+=1
 return dict(stats),conflicts
def main():
 p=argparse.ArgumentParser();p.add_argument('--output',type=pathlib.Path,default=PUBLIC/'locations');p.add_argument('--max-requests',type=int,default=100);p.add_argument('--source',choices=sorted(SOURCES),action='append');p.add_argument('--allow-empty',action='store_true');args=p.parse_args()
 if not 1<=args.max_requests<=120:raise ValueError('Request limit')
 manifest,rows=read_registry();fl=json.loads((PUBLIC/'state-ems/FL.json').read_bytes());verify(args.output,manifest,rows,fl)
 idx=json.loads((args.output/'index.json').read_bytes());entries=[e for c in idx['chunks'] for e in json.loads((args.output/c['file']).read_bytes())]
 old={e['key']:json.dumps(e,sort_keys=True) for e in entries if e['status']=='mapped'}
 counties=county_index(json.loads((ROOT/'scripts/fixtures/census-2026-county-identities.json').read_text())['counties'])
 checked=datetime.datetime.now(datetime.timezone.utc).date().isoformat()
 candidates={};review=set();reports={}
 for source in dict.fromkeys(args.source or SOURCES):
  try:
   found,flags,report=recover(source,entries,counties,checked,args.max_requests);candidates[source]=found;review|=flags;reports[source]=report
  except (OSError,ValueError,TypeError,KeyError,TimeoutError) as exc:
   reports[source]={'sourceUnavailable':True,'error':type(exc).__name__+': '+str(exc)[:150]}
 stats,conflicts=combine(entries,candidates,review)
 if any(json.dumps(e,sort_keys=True)!=old[e['key']] for e in entries if e['key'] in old):raise ValueError('Existing mapping changed')
 print('Regional recovery summary',json.dumps(dict(results=stats,reports=reports,conflicts=conflicts)),flush=True)
 if not stats.get('newMapped'):
  if args.allow_empty and reports and all(not report.get('sourceUnavailable') and not report.get('unavailable') and not report.get('not_attempted') for report in reports.values()):
   print('No additional validated locations; no files changed.',flush=True);return
  raise ValueError('No additional validated regional locations; no data published')
 meta={k:v for k,v in idx.items() if k not in ('schemaVersion','generatedAt','benchmark','vintage','sourceScope','chunks','coverage','regionalRecovery')}
 if 'regionalRecovery' in idx:
  meta['regionalRecoveryHistory']=[*idx.get('regionalRecoveryHistory',[]),idx['regionalRecovery']]
 meta['regionalRecovery']=dict(checkedAt=checked,sourceUrls={k:SOURCES[k]['url'] for k in reports},reports=reports,results=stats,conflicts=conflicts,previousMapped=len(old),newMapped=stats['newMapped'])
 publish(args.output,manifest,entries,meta);verify(args.output,manifest,rows,fl)
if __name__=='__main__':main()
