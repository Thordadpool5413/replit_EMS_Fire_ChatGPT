#!/usr/bin/env python3
"""Ohio official LBRS address-point pilot. Match public registry addresses, not provider names."""
import argparse,collections,datetime,json,math,pathlib,re,time,urllib.parse,urllib.request
from backfill_provider_locations import ROOT,PUBLIC,base_street,normal_street,match_address,physical,read_registry,publish,verify,zip5
from recover_nad_locations import county_index,county_key,NoRedirect
LAYER='https://services2.arcgis.com/MlJ0G8iWUyC7jAmu/arcgis/rest/services/Statewide_LBRS_Address_Points/FeatureServer/0'
FIELDS=('OBJECTID','HOUSENUM','LHN','LSN','STATE','COUNTY','ZIPCODE','USPS_CITY')
def get(params,query=False):
 url=LAYER+('/query' if query else '')+'?'+urllib.parse.urlencode(params)
 if len(url)>3800:raise ValueError('Query exceeds URL budget')
 req=urllib.request.Request(url,headers={'Accept':'application/json','User-Agent':'ATLAS-public-organization-location/1.0'})
 with urllib.request.build_opener(NoRedirect()).open(req,timeout=30) as res:
  raw=res.read(4_000_001)
 if len(raw)>4_000_000:raise ValueError('Response too large')
 obj=json.loads(raw)
 if not isinstance(obj,dict) or 'error' in obj:raise ValueError('Ohio address source error')
 return obj
def service_version(request=get):
 obj=request({'f':'json'})
 if obj.get('name')!='Statewide LBRS Address Points' or obj.get('geometryType')!='esriGeometryPoint' or not set(FIELDS)<=set(x.get('name') for x in obj.get('fields',[])):raise ValueError('Ohio LBRS schema changed')
 ts=obj.get('editingInfo',{}).get('lastEditDate')
 if not isinstance(ts,int) or ts<=0:raise ValueError('No source revision date')
 return ts,datetime.datetime.fromtimestamp(ts/1000,datetime.timezone.utc).date().isoformat()
def number(a):
 if not a or not physical(a) or a['state']!='OH':return None
 m=re.match(r'^(\d{1,6})\s+\S',base_street(a['street']))
 return int(m.group(1)) if m else None
def query(a):
 clauses=sorted({f"(HOUSENUM={number(x)} AND ZIPCODE='{x['zip']}')" for x in a if number(x) is not None and re.fullmatch(r'\d{5}',x['zip'])})
 if not clauses or len(a)>8 or any(number(x) is None or not re.fullmatch(r'\d{5}',x['zip']) for x in a):raise ValueError('Invalid batch')
 return dict(f='json',where='STATE=\'OH\' AND ('+' OR '.join(clauses)+')',outFields=','.join(FIELDS),returnGeometry='true',outSR='4326',resultRecordCount='1000')
def features(payload):
 rows=payload.get('features')
 if not isinstance(rows,list) or payload.get('exceededTransferLimit') or len(rows)>=1000:raise ValueError('Incomplete Ohio point response')
 if not rows:return []
 sr=payload.get('spatialReference',{})
 if sr.get('wkid')!=4326 and sr.get('latestWkid')!=4326:raise ValueError('Unexpected coordinate system')
 seen=set()
 for f in rows:
  if not isinstance(f,dict) or not isinstance(f.get('attributes'),dict) or not isinstance(f.get('geometry'),dict):raise ValueError('Malformed Ohio point')
  oid=f['attributes'].get('OBJECTID')
  if not isinstance(oid,int) or isinstance(oid,bool) or oid<=0 or oid in seen:raise ValueError('Duplicate or invalid source point')
  seen.add(oid)
 return rows
def resolve(a,rows,counties,source_county,source_date):
 matched=[];bad=False
 for f in rows:
  v=f['attributes'];g=f['geometry']
  if v.get('STATE')!='OH' or zip5(v.get('ZIPCODE') or '')!=a['zip'] or v.get('HOUSENUM')!=number(a):continue
  street=v.get('LSN');house=v.get('LHN');city=v.get('USPS_CITY')
  if not isinstance(street,str) or not isinstance(city,str) or not street.strip() or not city.strip():continue
  # LSN may include house number or only the street; validate the entire resulting street.
  candidates=[street.strip()]
  if isinstance(house,str) and house.strip():candidates.append(house.strip()+' '+street.strip())
  actual=next((x for x in candidates if match_address(a,x+', '+city.strip()+', OH, '+a['zip'])),None)
  if not actual:continue
  cf=counties.get(('OH',county_key(v.get('COUNTY') or '')),set())
  x,y=g.get('x'),g.get('y')
  if len(cf)!=1 or not isinstance(x,(float,int)) or isinstance(x,bool) or not isinstance(y,(float,int)) or isinstance(y,bool) or not math.isfinite(x) or not math.isfinite(y) or not -85<=x<=-80.4 or not 38.3<=y<=42.1:bad=True;continue
  county=next(iter(cf))
  if source_county and county!=source_county:bad=True;continue
  point=dict(latitude=y,longitude=x,matchedAddress=actual+', '+city.strip()+', OH, '+a['zip'],method='ohio-lbrs-address-point',point=dict(objectId=v['OBJECTID'],sourceDate=source_date,countyFips=county))
  matched.append((county,point))
 if bad:return None,'review'
 if not matched:return None,'no-match'
 if len({(cf,m['latitude'],m['longitude']) for cf,m in matched})!=1:return None,'ambiguous'
 return min(matched,key=lambda v:v[1]['point']['objectId']),'mapped'
def recover(entries,counties,date,max_requests=100,delay=1.5,request=get):
 groups=collections.defaultdict(list);stats=collections.Counter()
 for e in entries:
  if e['state']!='OH' or e['status'] not in ('no-match','unavailable'):continue
  a=e['address']
  if number(a) is None:stats['unsupported_format']+=1;continue
  groups[tuple(a[k] for k in ('zip','street','city'))].append(e)
 vals=[groups[k] for k in sorted(groups)];errors=0;requests=0
 for i in range(0,len(vals),8):
  batch=vals[i:i+8]
  if errors>=3 or requests>=max_requests:stats['not_attempted']+=sum(map(len,batch));continue
  requests+=1
  try:rows=features(request(query([v[0]['address'] for v in batch]),True));errors=0
  except (OSError,ValueError,TypeError,KeyError,TimeoutError) as exc:
   errors+=1;stats['unavailable']+=sum(map(len,batch));print('Ohio source error:',type(exc).__name__,str(exc)[:120],flush=True);time.sleep(min(20,delay*2**errors));continue
  for group in batch:
   for e in group:
    found,status=resolve(e['address'],rows,counties,e['sourceCounty'],date);stats[status]+=1
    if found:
     county,point=found;e.update(status='mapped',match=point,countyFips=county)
  if requests%10==0:print('Ohio LBRS',requests,dict(stats),flush=True)
  time.sleep(delay)
 return dict(stats,requests=requests)
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--output',type=pathlib.Path,default=PUBLIC/'locations');ap.add_argument('--max-requests',type=int,default=100);args=ap.parse_args()
 if not 1<=args.max_requests<=120:raise ValueError('Request limit')
 manifest,rows=read_registry();fl=json.loads((PUBLIC/'state-ems/FL.json').read_bytes());verify(args.output,manifest,rows,fl)
 index=json.loads((args.output/'index.json').read_bytes());entries=[e for c in index['chunks'] for e in json.loads((args.output/c['file']).read_bytes())]
 prior={e['key']:json.dumps(e,sort_keys=True) for e in entries if e['status']=='mapped'}
 counties=county_index(json.loads((ROOT/'scripts/fixtures/census-2026-county-identities.json').read_text())['counties'])
 revision,date=service_version()
 stats=recover(entries,counties,date,args.max_requests)
 if service_version()!=(revision,date):raise ValueError('Source changed during query; no publication')
 if any(json.dumps(e,sort_keys=True)!=prior[e['key']] for e in entries if e['key'] in prior):raise ValueError('Existing mapping changed')
 print('Ohio LBRS summary',json.dumps(stats),flush=True)
 if not stats.get('mapped',0):raise ValueError('No additional validated Ohio coordinates; no data published')
 metadata={k:v for k,v in index.items() if k not in ('schemaVersion','generatedAt','benchmark','vintage','sourceScope','chunks','coverage','ohioLbrsRecovery')}
 metadata['ohioLbrsRecovery']=dict(sourceUrl=LAYER,sourceDate=date,results=stats,previousMapped=len(prior),newMapped=sum(e['status']=='mapped' for e in entries)-len(prior))
 publish(args.output,manifest,entries,metadata);verify(args.output,manifest,rows,fl)
if __name__=='__main__':main()
