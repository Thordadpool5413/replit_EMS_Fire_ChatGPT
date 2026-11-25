#!/usr/bin/env python3
"""Read-only public NERIS station acquisition, by native department identity.
No provider creation, private data, automatic cross-registry joins or production publication."""
import argparse, collections, datetime, hashlib, json, math, pathlib, re, time
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.parse import urlencode
from backfill_provider_locations import STATES, physical
BASE='https://services5.arcgis.com/lPbcyJOcoLyZmvo6/arcgis/rest/services/NERIS%20Public%20Fire%20Departments/FeatureServer'
DEPT_FIELDS=('OBJECTID','neris_id','name','state','station_count','export_date')
STATION_FIELDS=('OBJECTID','neris_id','department_neris_id','station_name','address_line_1','address_line_2','city','state','zip_code','export_date')
ID=re.compile(r'[-A-Z0-9]{1,14}')
class NoRedirect(HTTPRedirectHandler):
 def redirect_request(self,*args,**kwargs):return None
def request(layer,params,query=True):
 url=BASE+'/'+str(layer)+('/query' if query else '')+'?'+urlencode(params)
 if len(url)>8000:raise ValueError('Query exceeds URL bound')
 req=Request(url,headers={'Accept':'application/json','User-Agent':'ATLAS public station research'})
 with build_opener(NoRedirect()).open(req,timeout=40) as r:raw=r.read(8_000_001)
 if len(raw)>8_000_000:raise ValueError('Response exceeds bound')
 data=json.loads(raw)
 if not isinstance(data,dict) or data.get('error'):raise ValueError('Source query failed')
 return data
def clean(v,maxlen=255):
 return v.strip() if isinstance(v,str) and v.strip() and len(v.strip())<=maxlen and not re.search(r'[\x00-\x1f\x7f]',v) else None
def native(v):
 return v if isinstance(v,str) and ID.fullmatch(v) else None
def native_counts(features):
 return collections.Counter(s.upper() for f in features if (s:=clean(f.get('attributes',{}).get('neris_id'),14)))
def chunks(values,n):
 for i in range(0,len(values),n):yield values[i:i+n]
def schema(layer,fields,fetch):
 m=fetch(layer,{'f':'json'},False)
 if m.get('objectIdField')!='OBJECTID' or not set(fields)<=set(f.get('name') for f in m.get('fields',[])):raise ValueError('NERIS layer schema changed')
 if layer==1 and m.get('geometryType')!='esriGeometryPoint':raise ValueError('Unexpected station geometry')
 return {'name':m.get('name'),'serviceItemId':m.get('serviceItemId'),'lastEditDate':(m.get('editingInfo') or {}).get('lastEditDate'),'fields':list(fields)}
def object_ids(layer,where,fetch):
 p=fetch(layer,{'f':'json','where':where,'returnIdsOnly':'true'})
 ids=p.get('objectIds')
 if p.get('objectIdFieldName')!='OBJECTID' or not isinstance(ids,list) or len(ids)>50000 or any(type(v) is not int or v<=0 for v in ids) or len(set(ids))!=len(ids):raise ValueError('Invalid or incomplete native object list')
 return sorted(ids)
def retrieve(layer,where,fields,fetch):
 ids=object_ids(layer,where,fetch);rows=[]
 for group in chunks(ids,100):
  p=fetch(layer,{'f':'json','objectIds':','.join(map(str,group)),'outFields':','.join(fields),'returnGeometry':'true' if layer==1 else 'false','outSR':'4326'})
  features=p.get('features')
  if p.get('exceededTransferLimit') or not isinstance(features,list) or len(features)!=len(group):raise ValueError('Incomplete source batch')
  if any(not isinstance(f,dict) or not isinstance(f.get('attributes'),dict) for f in features):raise ValueError('Malformed feature')
  if sorted(f['attributes'].get('OBJECTID',-1) for f in features)!=group:raise ValueError('Object ID reconciliation failed')
  sr=p.get('spatialReference') or {}
  if layer==1 and 4326 not in (sr.get('wkid'),sr.get('latestWkid')):
   for f in features:f.pop('geometry',None)
  rows.extend(features)
 if object_ids(layer,where,fetch)!=ids:raise ValueError('Source membership changed during acquisition')
 return rows
def reconcile(departments,stations,states):
 dc=native_counts(departments);sc=native_counts(stations)
 parents={}
 for f in departments:
  a=f['attributes'];key=native(a.get('neris_id'));name=clean(a.get('name'));state=a.get('state')
  if key and dc[key]==1 and name and state in states:
   count=a.get('station_count')
   parents[key]={'departmentId':key,'name':name,'state':state,'reportedStationCount':count if type(count) is int and count>=0 else None}
 result=[];withheld=0
 for f in stations:
  a=f['attributes'];key=native(a.get('neris_id'));parent=native(a.get('department_neris_id'));state=a.get('state')
  if not key or sc[key]!=1 or key in dc or parent not in parents or state not in STATES:withheld+=1;continue
  g=f.get('geometry') or {};x,y=g.get('x'),g.get('y')
  point={'longitude':x,'latitude':y} if type(x) in (int,float) and type(y) in (int,float) and math.isfinite(x) and math.isfinite(y) and abs(x)<=180 and abs(y)<=90 and (x or y) else None
  street=clean(a.get('address_line_1'));unit=clean(a.get('address_line_2'));city=clean(a.get('city'));postal=clean(a.get('zip_code'),10)
  address={'street':street,'city':city,'state':state,'zip':postal[:5]} if street and city and postal and re.fullmatch(r'\d{5}(?:-\d{4})?',postal) else None
  result.append({'stationId':key,'departmentId':parent,'departmentState':parents[parent]['state'],'stationState':state,'name':clean(a.get('station_name')),'addressLine1':street,'addressLine2':unit,'city':city,'postalCode':postal,'physicalStreetFormat':bool(address and physical(address)),'coordinates':point,'sourceUrl':BASE+'/1/query?'+urlencode({'where':"neris_id='"+key+"'",'f':'json'}),'endUserValidationRequired':True})
 counts=collections.Counter(r['departmentId'] for r in result)
 report={'departmentRows':len(departments),'eligibleDepartments':len(parents),'withheldDepartments':len(departments)-len(parents),'stationRows':len(stations),'eligibleStations':len(result),'withheldStations':withheld,'physicalStreetFormat':sum(r['physicalStreetFormat'] for r in result),'sourceCoordinates':sum(r['coordinates'] is not None for r in result),'crossStateStations':sum(r['departmentState']!=r['stationState'] for r in result),'departmentCountDiscrepancies':sum(p['reportedStationCount'] is not None and p['reportedStationCount']!=counts[k] for k,p in parents.items())}
 return {'summary':report,'departments':sorted(parents.values(),key=lambda p:p['departmentId']),'stations':sorted(result,key=lambda p:p['stationId'])}
def acquire(states,fetch=request):
 before=[schema(0,DEPT_FIELDS,fetch),schema(1,STATION_FIELDS,fetch)]
 departments=retrieve(0,'state IN ('+','.join("'"+s+"'" for s in sorted(states))+')',DEPT_FIELDS,fetch)
 if not departments:raise ValueError('No department rows retrieved; source review required')
 dc=native_counts(departments)
 parents=sorted(k for k in dc if dc[k]==1 and ID.fullmatch(k))
 stations=[]
 for group in chunks(parents,40):
  stations.extend(retrieve(1,'department_neris_id IN ('+','.join("'"+s+"'" for s in group)+')',STATION_FIELDS,fetch))
  if len(stations)>50000:raise ValueError('Station scope exceeds bound')
  time.sleep(.25)
 if before!=[schema(0,DEPT_FIELDS,fetch),schema(1,STATION_FIELDS,fetch)]:raise ValueError('Layer metadata changed during acquisition')
 result=reconcile(departments,stations,states)
 if not result['summary']['eligibleStations']:raise ValueError('No eligible station records; review source')
 return {'schemaVersion':1,'source':'NERIS','sourceUrl':BASE,'retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'departmentStateScope':sorted(states),'layerMetadata':before,'scope':'Selected department headquarters states, exact native parent IDs; cross-state child stations retained. Not a census of active facilities.',**result}
def main():
 p=argparse.ArgumentParser();p.add_argument('--states',default='FL,TX,PA');p.add_argument('--output',type=pathlib.Path,required=True);args=p.parse_args()
 states=set(args.states.split(','))
 if not states or not states<=STATES or len(states)>3:raise ValueError('Select one to three supported headquarters states')
 report=acquire(states)
 args.output.mkdir(parents=True,exist_ok=True)
 raw=(json.dumps(report,indent=2)+'\n').encode()
 (args.output/'neris-station-candidate.json').write_bytes(raw)
 summary={'sha256':hashlib.sha256(raw).hexdigest(),'departmentStateScope':report['departmentStateScope'],**report['summary']}
 (args.output/'summary.json').write_text(json.dumps(summary,indent=2)+'\n')
 print('NERIS station acquisition summary:',json.dumps(summary),flush=True)
if __name__=='__main__':main()
