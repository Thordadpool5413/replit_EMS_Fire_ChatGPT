#!/usr/bin/env python3
"""Recover source-ID-bound NY public registry locations using official NYS SAM points."""
import argparse,collections,datetime,json,math,pathlib,re,time,urllib.parse,urllib.request
from backfill_provider_locations import ROOT,PUBLIC,base_street,normal_street,match_address,physical,read_registry,publish,verify,zip5
from recover_nad_locations import county_index,county_key,NoRedirect
from recover_ohio_locations import features
LAYER='https://services6.arcgis.com/EbVsqZ18sv1kVJ3k/ArcGIS/rest/services/NYS_Address_Points/FeatureServer/0'
FIELDS=('OBJECTID','NYSAddressPointID','AddressNumber','AddressLabel','ZipCode','ZipName','State','CountyName','Status','PointType','PrimaryPoint','AddressSource','SubAddress','AP_Flag')
POINT_TYPES={'1':'Rooftop','2':'Primary structure entrance','3':'Driveway entrance','4':'Parcel centroid'}
def request(params,query=False):
 url=LAYER+('/query' if query else '')+'?'+urllib.parse.urlencode(params)
 if len(url)>3800:raise ValueError('Query budget exceeded')
 req=urllib.request.Request(url,headers={'Accept':'application/json','User-Agent':'ATLAS-public-organization-location/1.0'})
 with urllib.request.build_opener(NoRedirect()).open(req,timeout=35) as res:raw=res.read(4_000_001)
 if len(raw)>4_000_000:raise ValueError('Oversized response')
 obj=json.loads(raw)
 if not isinstance(obj,dict) or 'error' in obj:raise ValueError('NYS source error')
 return obj
def service_version(fetch=request):
 obj=fetch({'f':'json'})
 if obj.get('name')!='NYS Address Points' or obj.get('geometryType')!='esriGeometryPoint' or not set(FIELDS)<=set(x.get('name') for x in obj.get('fields',[])):raise ValueError('NYS source schema changed')
 ts=obj.get('editingInfo',{}).get('lastEditDate')
 if not isinstance(ts,int) or ts<=0:raise ValueError('Source version unavailable')
 return ts,datetime.datetime.fromtimestamp(ts/1000,datetime.timezone.utc).date().isoformat()
def house(a):
 if not physical(a) or a['state']!='NY':return None
 m=re.match(r'^(\d{1,6})\s+\S',base_street(a['street']))
 return int(m.group(1)) if m else None
def query(addresses):
 if not 1<=len(addresses)<=8 or any(house(a) is None or not re.fullmatch(r'\d{5}',a['zip']) for a in addresses):raise ValueError('Invalid NYS batch')
 clauses=sorted({f"(AddressNumber={house(a)} AND ZipCode='{a['zip']}')" for a in addresses})
 return dict(f='json',where="State='NY' AND ("+' OR '.join(clauses)+')',outFields=','.join(FIELDS),returnGeometry='true',outSR='4326',resultRecordCount='1000')
def resolve(a,rows,counties,source_county,date):
 hits=[];bad=False
 for f in rows:
  v=f['attributes'];g=f['geometry'];label=v.get('AddressLabel');city=v.get('ZipName')
  if v.get('State')!='NY' or zip5(v.get('ZipCode') or '')!=a['zip'] or v.get('AddressNumber')!=house(a) or not isinstance(label,str) or not isinstance(city,str):continue
  matched=label.strip()+', '+city.strip()+', NY, '+a['zip']
  if not match_address(a,matched):continue
  if v.get('Status')!='Active':continue
  # Only unambiguous primary point for a numbered address; not a secondary unit or miscellaneous landmark.
  if v.get('PrimaryPoint')!='Y' or v.get('SubAddress') not in (None,''):continue
  cf=counties.get(('NY',county_key(v.get('CountyName') or '')),set())
  pt=POINT_TYPES.get(v.get('PointType'));authority=v.get('AddressSource');native=v.get('NYSAddressPointID');x,y=g.get('x'),g.get('y')
  if v.get('AP_Flag') not in (None,'') or not pt or not isinstance(authority,str) or not authority.strip() or not isinstance(native,str) or not re.fullmatch(r'[-A-Za-z0-9]{1,30}',native) or len(cf)!=1 or not isinstance(x,(int,float)) or isinstance(x,bool) or not isinstance(y,(int,float)) or isinstance(y,bool) or not math.isfinite(x) or not math.isfinite(y) or not -80<=x<=-71.7 or not 40.4<=y<=45.2:bad=True;continue
  county=next(iter(cf))
  if source_county and source_county!=county:bad=True;continue
  hits.append((county,dict(latitude=y,longitude=x,matchedAddress=matched,method='ny-sam-address-point',point=dict(objectId=v['OBJECTID'],nativeId=native,sourceDate=date,authority=authority.strip(),placement=pt,countyFips=county))))
 if bad:return None,'review'
 if not hits:return None,'no-match'
 if len({(cf,m['latitude'],m['longitude']) for cf,m in hits})!=1:return None,'ambiguous'
 return min(hits,key=lambda hit:hit[1]['point']['objectId']),'mapped'
def recover(entries,counties,date,max_requests=140,delay=1.25,fetch=request):
 groups=collections.defaultdict(list);stats=collections.Counter()
 for e in entries:
  if e['state']!='NY' or e['status'] not in ('no-match','unavailable'):continue
  a=e['address']
  if house(a) is None:stats['unsupported_format']+=1;continue
  groups[tuple(a[k] for k in ('zip','street','city'))].append(e)
 vals=[groups[k] for k in sorted(groups)];requests=0;errors=0
 for i in range(0,len(vals),8):
  batch=vals[i:i+8]
  if requests>=max_requests or errors>=3:stats['not_attempted']+=sum(map(len,batch));continue
  requests+=1
  try:rows=features(fetch(query([g[0]['address'] for g in batch]),True));errors=0
  except (OSError,ValueError,TypeError,KeyError,TimeoutError) as exc:
   errors+=1;stats['unavailable']+=sum(map(len,batch));print('NYS source unavailable:',type(exc).__name__,str(exc)[:140],flush=True);time.sleep(min(20,delay*2**errors));continue
  for group in batch:
   for e in group:
    found,status=resolve(e['address'],rows,counties,e['sourceCounty'],date);stats[status]+=1
    if found:
     cf,point=found;e.update(status='mapped',match=point,countyFips=cf)
  if requests%10==0:print('NY SAM progress',requests,dict(stats),flush=True)
  time.sleep(delay)
 return dict(stats,requests=requests)
def main():
 p=argparse.ArgumentParser();p.add_argument('--output',type=pathlib.Path,default=PUBLIC/'locations');p.add_argument('--max-requests',type=int,default=140);args=p.parse_args()
 if not 1<=args.max_requests<=160:raise ValueError('Invalid request scope')
 manifest,rows=read_registry();fl=json.loads((PUBLIC/'state-ems/FL.json').read_bytes());verify(args.output,manifest,rows,fl)
 idx=json.loads((args.output/'index.json').read_bytes());entries=[e for c in idx['chunks'] for e in json.loads((args.output/c['file']).read_bytes())]
 old={e['key']:json.dumps(e,sort_keys=True) for e in entries if e['status']=='mapped'}
 counties=county_index(json.loads((ROOT/'scripts/fixtures/census-2026-county-identities.json').read_text())['counties'])
 version,date=service_version();stats=recover(entries,counties,date,args.max_requests)
 if service_version()!=(version,date):raise ValueError('NYS source changed during run')
 if any(json.dumps(e,sort_keys=True)!=old[e['key']] for e in entries if e['key'] in old):raise ValueError('Prior mapping changed')
 print('NYS SAM summary',json.dumps(stats),flush=True)
 if not stats.get('mapped'):raise ValueError('No additional validated NY points')
 metadata={k:v for k,v in idx.items() if k not in ('schemaVersion','generatedAt','benchmark','vintage','sourceScope','chunks','coverage','nySamRecovery')}
 metadata['nySamRecovery']=dict(sourceUrl=LAYER,sourceDate=date,results=stats,previousMapped=len(old),newMapped=stats['mapped'])
 publish(args.output,manifest,entries,metadata);verify(args.output,manifest,rows,fl)
if __name__=='__main__':main()
