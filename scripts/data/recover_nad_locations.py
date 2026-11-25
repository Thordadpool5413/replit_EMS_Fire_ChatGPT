#!/usr/bin/env python3
"""Targeted exact-address queries of USDOT NAD, preserving the existing public provider snapshot."""
import argparse, collections, datetime, json, math, pathlib, re, time, urllib.parse, urllib.request
from backfill_provider_locations import ROOT,PUBLIC,STATES,ALIAS,base_street,normal_street,match_address,physical,read_registry,publish,verify
LAYER='https://services.arcgis.com/xOi1kZaI0eWDREZv/ArcGIS/rest/services/Address_Points_from_National_Address_Database_view/FeatureServer/0'
RELEASE='2026-09-30'
FIELDS='OBJECTID,AddNo_Full,Add_Number,StNam_Full,Post_City,Inc_Muni,State,Zip_Code,County,Placement,AddrClass,Lifecycle,NAD_Source,AddAuth'
PLACEMENTS={'Structure - Rooftop','Structure - Entrance','Structure - Interior','Structure - Interior Unit Location','Property Access Point','Site Placement','Parcel - Centroid','Parcel - Other/Manual Placement'}
def county_key(s):
 return re.sub(r'\s+(county|parish|borough|planning region|census area|municipality)$','',str(s).lower().strip())
def county_index(counties):
 out=collections.defaultdict(set)
 for c in counties:out[(c['USPS'],county_key(c['NAME']))].add(c['GEOID'])
 return out
def clean(s,n):
 return s.strip() if isinstance(s,str) and s.strip() and len(s)<=n and not re.search(r'[\x00-\x1f\x7f]',s) else ''
def sql(s):return "'"+s.replace("'","''")+"'"
def target_parts(a):
 if not physical(a):return None
 m=re.fullmatch(r'(\d{1,6}[A-Za-z]?)\s+(.+)',base_street(a['street']))
 if not m:return None
 number,street=m.groups()
 digits=re.match(r'\d+',number)
 return (int(digits.group()),street) if digits else None
def address_clause(a):
 parts=target_parts(a)
 if not parts:return None
 number,_=parts
 # Indexed predicates only. Street/city comparisons happen locally on the bounded result.
 return "(Zip_Code="+sql(a['zip'])+" AND Add_Number="+str(number)+")"
def query_params(state,addresses):
 if state not in STATES or not 1<=len(addresses)<=8 or any(a['state']!=state for a in addresses):raise ValueError('Invalid targeted batch scope')
 clauses=list(dict.fromkeys(address_clause(a) for a in addresses))
 if not all(clauses):raise ValueError('Ineligible address in NAD query')
 return dict(f='json',where="State="+sql(state)+" AND ("+" OR ".join(clauses)+")",outFields=FIELDS,returnGeometry='true',outSR='4326',resultRecordCount='1000')
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):return None
def json_request(url,params):
 if url not in (LAYER,LAYER+'/query'):raise ValueError('Unapproved NAD host')
 body=urllib.parse.urlencode(params).encode()
 # Use the advertised read-only GET query endpoint with a bounded URL.
 if len(body)>3500:raise ValueError('NAD query exceeds URL budget')
 req=urllib.request.Request(url+'?'+body.decode(),headers={'Accept':'application/json','User-Agent':'ATLAS-public-address-reconciliation/1.1'})
 with urllib.request.build_opener(NoRedirect()).open(req,timeout=25) as response:
  raw=response.read(4_000_001)
 if len(raw)>4_000_000:raise ValueError('NAD response exceeds bound')
 value=json.loads(raw)
 if not isinstance(value,dict):raise ValueError('NAD returned a non-object response')
 if 'error' in value:
  error=value['error'];code=error.get('code','unknown') if isinstance(error,dict) else 'unknown'
  raise ValueError('NAD upstream error code '+str(code)[:20])
 return value
def verify_service():
 data=json_request(LAYER,{'f':'json'})
 fields={f.get('name') for f in data.get('fields',[])}
 if data.get('geometryType')!='esriGeometryPoint' or 'September 30, 2026' not in data.get('description','') or not set(FIELDS.split(',')).issubset(fields):raise ValueError('NAD release or schema changed; review before processing')
 return data.get('editingInfo',{}).get('lastEditDate')
def parse_features(payload):
 if payload.get('exceededTransferLimit') or not isinstance(payload.get('features'),list) or len(payload['features'])>=1000:raise ValueError('Incomplete NAD response')
 if not payload['features']:return []
 sr=payload.get('spatialReference',{})
 if sr.get('wkid')!=4326 and sr.get('latestWkid')!=4326:raise ValueError('Expected WGS84 coordinates')
 features=[];ids=set()
 for f in payload['features']:
  if not isinstance(f,dict) or not isinstance(f.get('attributes'),dict) or not isinstance(f.get('geometry'),dict):raise ValueError('Malformed NAD feature')
  oid=f['attributes'].get('OBJECTID')
  if not isinstance(oid,int) or isinstance(oid,bool) or oid<=0 or oid in ids:raise ValueError('Invalid NAD object identity')
  ids.add(oid);features.append(f)
 return features
def resolve_point(a,features,counties,source_county=''):
 """Match all components to the registry address; refuse conflicting locations or unsupported point types."""
 exact=[];rejected=False
 for f in features:
  v=f['attributes'];g=f['geometry']
  number=clean(v.get('AddNo_Full'),100)
  street=clean(v.get('StNam_Full'),255)
  if not number or not street or v.get('State')!=a['state'] or v.get('Zip_Code')!=a['zip']:continue
  if normal_street(number+' '+street)!=normal_street(base_street(a['street'])):continue
  cities=[clean(v.get(k),100) for k in ('Post_City','Inc_Muni')]
  city=next((c for c in cities if c and normal_street(c)==normal_street(a['city'])),None)
  if not city:continue
  if v.get('Lifecycle') not in (None,'','Active'):continue
  county=clean(v.get('County'),100);candidates=counties.get((a['state'],county_key(county)),set())
  x,y=g.get('x'),g.get('y')
  placement=v.get('Placement');authority=clean(v.get('NAD_Source'),150) or clean(v.get('AddAuth'),150)
  if v.get('AddrClass')!='Numbered Thoroughfare Address' or placement not in PLACEMENTS or not authority or len(candidates)!=1 or not isinstance(x,(int,float)) or isinstance(x,bool) or not isinstance(y,(int,float)) or isinstance(y,bool) or not math.isfinite(x) or not math.isfinite(y) or not -180<=x<=180 or not -90<=y<=90 or not (x or y):
   rejected=True;continue
  cf=next(iter(candidates))
  if source_county and cf!=source_county:rejected=True;continue
  matched=number+' '+street+', '+city+', '+a['state']+', '+a['zip']
  if not match_address(a,matched):rejected=True;continue
  exact.append((cf,dict(latitude=y,longitude=x,matchedAddress=matched,method='nad-address-point',point=dict(objectId=v['OBJECTID'],release=RELEASE,authority=authority,placement=placement,countyFips=cf))))
 # Do not choose between competing address points or silently drop a conflicting exact candidate.
 if rejected or not exact:return None,'review' if rejected else 'no-match'
 locations={(cf,m['latitude'],m['longitude']) for cf,m in exact}
 if len(locations)!=1:return None,'ambiguous'
 cf,m=min(exact,key=lambda t:t[1]['point']['objectId'])
 return (m,cf),'mapped'
def recover(entries,counties,states,max_requests,delay=1.25,request=json_request):
 groups=collections.defaultdict(list);stats=collections.Counter()
 for e in entries:
  if e['state'] not in states or e['status'] not in ('no-match','unavailable'):continue
  if not e['address'] or not target_parts(e['address']):stats['unsupported_format']+=1;continue
  a=e['address'];groups[(a['state'],a['zip'],a['city'],a['street'])].append(e)
 by_state=collections.defaultdict(list)
 for key,items in groups.items():by_state[key[0]].append(items)
 consecutive_errors=0;requests=0
 for state in sorted(by_state):
  values=sorted(by_state[state],key=lambda g:(g[0]['address']['zip'],g[0]['address']['street']))
  for start in range(0,len(values),8):
   batch=values[start:start+8]
   if requests>=max_requests or consecutive_errors>=3:stats['not_attempted']+=sum(len(g) for g in batch);continue
   addresses=[g[0]['address'] for g in batch]
   requests+=1
   try:
    features=parse_features(request(LAYER+'/query',query_params(state,addresses)))
    consecutive_errors=0
   except (OSError,ValueError,KeyError,TypeError,TimeoutError) as exc:
    print('NAD query unavailable:',type(exc).__name__,str(exc)[:180],flush=True)
    consecutive_errors+=1;stats['unavailable']+=sum(len(g) for g in batch);time.sleep(min(30,delay*2**consecutive_errors));continue
   for group in batch:
    for entry in group:
     found,status=resolve_point(entry['address'],features,counties,entry['sourceCounty'])
     stats[status]+=1
     if found:
      m,cf=found;entry.update(status='mapped',match=m,countyFips=cf)
   time.sleep(delay)
  print('NAD',state,'cumulative',dict(stats),'requests',requests,flush=True)
 return dict(stats,requests=requests)
def main():
 p=argparse.ArgumentParser();p.add_argument('--states',default='all');p.add_argument('--max-requests',type=int,default=1200);p.add_argument('--output',type=pathlib.Path,default=PUBLIC/'locations');args=p.parse_args()
 states=STATES if args.states=='all' else set(args.states.split(','))
 if not states or not states<=STATES or not 1<=args.max_requests<=1200:raise ValueError('Invalid NAD scope')
 manifest,rows=read_registry();fl=json.loads((PUBLIC/'state-ems/FL.json').read_bytes())
 verify(args.output,manifest,rows,fl)
 index=json.loads((args.output/'index.json').read_bytes())
 entries=[e for c in index['chunks'] for e in json.loads((args.output/c['file']).read_bytes())]
 if any(e['status']=='pending' for e in entries):raise ValueError('Complete initial Census run before NAD')
 before={e['key']:json.dumps(e,sort_keys=True) for e in entries if e['status']=='mapped'}
 counties=county_index(json.loads((ROOT/'scripts/fixtures/census-2026-county-identities.json').read_text())['counties'])
 version=verify_service()
 stats=recover(entries,counties,states,args.max_requests)
 if verify_service()!=version:raise ValueError('NAD source changed during processing; no data published')
 if any(json.dumps(e,sort_keys=True)!=before[e['key']] for e in entries if e['key'] in before):raise ValueError('Existing mapped record changed')
 metadata={k:v for k,v in index.items() if k not in ('schemaVersion','generatedAt','benchmark','vintage','sourceScope','chunks','coverage','nadRecovery')}
 metadata['nadRecovery']=dict(sourceUrl=LAYER,release=RELEASE,scope=sorted(states),results=stats,previousMapped=len(before),newMapped=sum(e['status']=='mapped' for e in entries)-len(before))
 publish(args.output,manifest,entries,metadata);verify(args.output,manifest,rows,fl)
 print('NAD recovery summary',json.dumps(metadata['nadRecovery']),flush=True)
 if stats.get('requests',0) and stats.get('unavailable',0) and not sum(stats.get(k,0) for k in ('mapped','no-match','review','ambiguous')):raise ValueError('All NAD queries unavailable; no successful recovery')
if __name__=='__main__':main()
