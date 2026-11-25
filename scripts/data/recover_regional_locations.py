#!/usr/bin/env python3
"""Strict regional government address-point recovery; never creates provider records."""
import argparse,collections,datetime,hashlib,json,math,pathlib,re,time,urllib.parse,urllib.request
from backfill_provider_locations import ROOT,PUBLIC,physical,base_street,match_address,normal_street,read_registry,publish,verify
from recover_nad_locations import NoRedirect,county_index,county_key,sql
from regional_point_contract import SOURCES,valid_regional_point
FIELDS={
 'nc-addressnc':('objectid','add_number','st_address','post_code','post_comm','state','statefips','county','countyfips','unit','building','floor','placement','dateupdate','effective','expire','gc_exception'),
 'fl-hillsborough':('OBJECTID','ADDRNUM','FULLADDR','ZIP','POSTALCOMM','UNITID','UNITTYPE','POINTTYPE','STATUS','LASTUPDATE'),
 'fl-pinellas':('OBJECTID','ADDRNUM','FULLADDR','POSTCODE','MAILINGCITY','UNITID','UNITTYPE','POINTTYPE','STATUS','BLDGADDRCLASS','LAST_EDITED_DATE')}
QUERY_KEYS={'nc-addressnc':('add_number','post_code'),'fl-hillsborough':('ADDRNUM','ZIP'),'fl-pinellas':('ADDRNUM','POSTCODE')}
NAMES={'nc-addressnc':('AddressNC','North Carolina Counties'),'fl-hillsborough':('SiteAddressPoints','Hillsborough County'),'fl-pinellas':('Addresses','Pinellas County Safety and Emergency Services')}
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
 zipfield=fields[QUERY_KEYS[source][1]]
 domain=zipfield.get('domain') or {}
 zips={v['code'] for v in domain.get('codedValues',[]) if isinstance(v.get('code'),str) and re.fullmatch(r'\d{5}',v['code'])}
 # Some enterprise layers expose no global edit date. Preserve observed date and actual record date instead.
 marker={'name':name,'copyrightText':obj['copyrightText'],'fields':[(k,fields[k].get('type')) for k in FIELDS[source]],'lastEditDate':(obj.get('editingInfo') or {}).get('lastEditDate'),'zipCodes':sorted(zips)}
 return marker,zips
def number(a):
 if not physical(a):return None
 m=re.match(r'^(\d{1,6}[A-Za-z]?)\s+\S',base_street(a['street']))
 return m.group(1).upper() if m else None
def query(source,addresses):
 if not 1<=len(addresses)<=8 or any(a['state']!=SOURCES[source]['state'] or number(a) is None or not re.fullmatch(r'\d{5}',a['zip']) for a in addresses):raise ValueError('Invalid regional batch')
 house,zipfield=QUERY_KEYS[source]
 clauses=sorted({f"({house}={sql(number(a))} AND {zipfield}={sql(a['zip'])})" for a in addresses})
 return dict(f='json',where=' OR '.join(clauses),outFields=','.join(FIELDS[source]),returnGeometry='true',outSR='4326',resultRecordCount='1000')
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
def resolve(source,e,rows,counties,checked):
 d=SOURCES[source];a=e['address'];hits=[];bad=False
 for f in rows:
  v=f['attributes'];g=f['geometry'];cf=d['county']
  if source=='nc-addressnc':
   street,city,postal=v.get('st_address'),v.get('post_comm'),v.get('post_code')
   if v.get('state')!='NC':continue
   if any(v.get(k) not in (None,'') for k in ('unit','building','floor')):continue
   placement=v.get('placement');date=v.get('dateupdate')
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
  if e['sourceCounty'] and cf!=e['sourceCounty']:bad=True;continue
  try:updated=date_value(date)
  except (ValueError,OverflowError,OSError):bad=True;continue
  match=dict(latitude=g.get('y'),longitude=g.get('x'),matchedAddress=matched,method='regional-address-point',point=dict(source=source,objectId=v[FIELDS[source][0]],checkedAt=checked,recordUpdatedAt=updated,placement=placement,countyFips=cf))
  if not valid_regional_point(match,cf):bad=True;continue
  hits.append((cf,match))
 if bad:return None,'review'
 if not hits:return None,'no-match'
 if len({(cf,m['latitude'],m['longitude']) for cf,m in hits})!=1:return None,'ambiguous'
 return min(hits,key=lambda x:x[1]['point']['objectId']),'mapped'
def recover(source,entries,counties,checked,max_requests=100,delay=1.0,fetch=request):
 d=SOURCES[source];version,zips=metadata(source,fetch);groups=collections.defaultdict(list);stats=collections.Counter();out={};review=set();errors=0;requests=0
 for e in entries:
  if e['state']!=d['state'] or e['status'] not in ('no-match','unavailable'):continue
  if d['county'] and e['sourceCounty'] and d['county']!=e['sourceCounty']:continue
  a=e['address']
  if not number(a):stats['unsupported']+=1;continue
  if zips and a['zip'] not in zips:stats['outside_published_zip_domain']+=1;continue
  groups[(a['zip'],a['street'],a['city'])].append(e)
 values=[groups[k] for k in sorted(groups)]
 for i in range(0,len(values),8):
  batch=values[i:i+8]
  if requests>=max_requests or errors>=3:stats['not_attempted']+=sum(map(len,batch));continue
  requests+=1
  try:rows=features(source,fetch(source,query(source,[g[0]['address'] for g in batch]),True));errors=0
  except (OSError,ValueError,TypeError,KeyError,TimeoutError) as exc:
   errors+=1;stats['unavailable']+=sum(map(len,batch));print(source,'unavailable',type(exc).__name__,str(exc)[:150],flush=True);time.sleep(min(15,delay*2**errors));continue
  for group in batch:
   for e in group:
    found,status=resolve(source,e,rows,counties,checked);stats[status]+=1
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
 p=argparse.ArgumentParser();p.add_argument('--output',type=pathlib.Path,default=PUBLIC/'locations');p.add_argument('--max-requests',type=int,default=100);args=p.parse_args()
 if not 1<=args.max_requests<=120:raise ValueError('Request limit')
 manifest,rows=read_registry();fl=json.loads((PUBLIC/'state-ems/FL.json').read_bytes());verify(args.output,manifest,rows,fl)
 idx=json.loads((args.output/'index.json').read_bytes());entries=[e for c in idx['chunks'] for e in json.loads((args.output/c['file']).read_bytes())]
 old={e['key']:json.dumps(e,sort_keys=True) for e in entries if e['status']=='mapped'}
 counties=county_index(json.loads((ROOT/'scripts/fixtures/census-2026-county-identities.json').read_text())['counties'])
 checked=datetime.datetime.now(datetime.timezone.utc).date().isoformat()
 candidates={};review=set();reports={}
 for source in SOURCES:
  try:
   found,flags,report=recover(source,entries,counties,checked,args.max_requests);candidates[source]=found;review|=flags;reports[source]=report
  except (OSError,ValueError,TypeError,KeyError,TimeoutError) as exc:
   reports[source]={'sourceUnavailable':True,'error':type(exc).__name__+': '+str(exc)[:150]}
 stats,conflicts=combine(entries,candidates,review)
 if any(json.dumps(e,sort_keys=True)!=old[e['key']] for e in entries if e['key'] in old):raise ValueError('Existing mapping changed')
 print('Regional recovery summary',json.dumps(dict(results=stats,reports=reports,conflicts=conflicts)),flush=True)
 if not stats.get('newMapped'):raise ValueError('No additional validated regional locations; no data published')
 meta={k:v for k,v in idx.items() if k not in ('schemaVersion','generatedAt','benchmark','vintage','sourceScope','chunks','coverage','regionalRecovery')}
 meta['regionalRecovery']=dict(checkedAt=checked,sourceUrls={k:v['url'] for k,v in SOURCES.items()},reports=reports,results=stats,conflicts=conflicts,previousMapped=len(old),newMapped=stats['newMapped'])
 publish(args.output,manifest,entries,meta);verify(args.output,manifest,rows,fl)
if __name__=='__main__':main()
