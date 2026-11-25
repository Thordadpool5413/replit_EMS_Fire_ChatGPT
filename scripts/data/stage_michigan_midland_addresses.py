#!/usr/bin/env python3
"""Michigan municipal address acquisition. Review evidence only; no map publication."""
import argparse, collections, datetime, json, math, pathlib, re
from backfill_provider_locations import PUBLIC, read_registry, verify, physical, match_address, sha
from recover_nad_locations import sql
from stage_wisconsin_addresses import request
SERVICE='https://arcgis1.midland-mi.org/arcgis/rest/services/CityCountyShared/FeatureServer'
URL=SERVICE+'/1'
ITEM='8f709d592e104010a19bb8a5b0ec9832'
FIELDS={**{k:'esriFieldTypeString' for k in ('STNUM','ADDRESS','UNIT','CITY','State','ZIP','Status')},'OBJECTID':'esriFieldTypeOID'}
def metadata(fetch=request):
    service=fetch(SERVICE,{'f':'json'})
    layer=fetch(URL,{'f':'json'})
    if service.get('serviceItemId')!=ITEM or 'City of Midland Michigan' not in service.get('copyrightText','') or not any(x.get('id')==1 and x.get('name')=='Address Points' for x in service.get('layers',[])):
        raise ValueError('Unexpected municipal service identity')
    if layer.get('id')!=1 or layer.get('name')!='Address Points' or layer.get('geometryType')!='esriGeometryPoint' or layer.get('objectIdField')!='OBJECTID':raise ValueError('Unexpected address layer')
    fields=layer.get('fields',[]);types={x['name']:x.get('type') for x in fields}
    if len(types)!=len(fields) or any(types.get(k)!=v for k,v in FIELDS.items()):raise ValueError('Municipal address schema changed')
    status=next(f for f in fields if f['name']=='Status')
    codes={x.get('code') for x in (status.get('domain') or {}).get('codedValues',[])}
    if codes!={'Active','Pending','Retired'}:raise ValueError('Municipal lifecycle domain changed')
    return {'serviceItemId':ITEM,'fields':FIELDS,'statusCodes':sorted(codes),'lastEditDate':(layer.get('editingInfo') or {}).get('lastEditDate')}
def number(a):
    if not physical(a):return None
    m=re.match(r'^(\d{1,6})\s+\S',a['street'])
    return m.group(1) if m else None
def in_scope(e):
    a=e.get('address')
    return e.get('state')=='MI' and e.get('status') in ('no-match','unavailable') and (e.get('sourceCounty')=='26111' or bool(a and a['city'].strip().casefold()=='midland'))
def query(a):
    if a['state']!='MI' or not number(a) or not re.fullmatch(r'\d{5}',a['zip']):raise ValueError('Unsupported address')
    return {'f':'json','where':'STNUM='+sql(number(a))+' AND ZIP='+sql(a['zip']), 'outFields':','.join(FIELDS),'returnGeometry':'true','outSR':'4326','resultRecordCount':1000}
def features(payload):
    rows=payload.get('features');sr=payload.get('spatialReference') or {}
    if not isinstance(rows,list) or len(rows)>=1000 or payload.get('exceededTransferLimit') or rows and 4326 not in (sr.get('wkid'),sr.get('latestWkid')):raise ValueError('Incomplete or invalid point response')
    seen=set()
    for f in rows:
        a=f.get('attributes');g=f.get('geometry')
        if not isinstance(a,dict) or not isinstance(g,dict) or not set(FIELDS)<=set(a):raise ValueError('Incomplete point')
        oid=a['OBJECTID']
        if type(oid) is not int or not 0<oid<=9007199254740991 or oid in seen:raise ValueError('Invalid object ID')
        seen.add(oid)
    return rows
def review(e,rows):
    a=e['address'];hits=[];reasons=set();ids=set()
    for f in rows:
        v=f['attributes'];g=f['geometry']
        if v['State']!='MI' or v['ZIP']!=a['zip'] or v['STNUM']!=number(a) or not isinstance(v['ADDRESS'],str) or not isinstance(v['CITY'],str):continue
        matched=f"{v['ADDRESS']}, {v['CITY']}, MI, {v['ZIP']}"
        if not match_address(a,matched):continue
        ids.add(v['OBJECTID'])
        if v['UNIT'] not in (None,''):reasons.add('subaddress');continue
        if v['Status']!='Active':reasons.add('inactive_or_pending_address');continue
        lat,lon=g.get('y'),g.get('x')
        if type(lat) not in (int,float) or type(lon) not in (int,float) or not math.isfinite(lat) or not math.isfinite(lon) or not 43.3<=lat<=44.0 or not -85.0<=lon<=-83.7:reasons.add('coordinate_conflict');continue
        hits.append({'sourceKey':e['key'],'objectId':v['OBJECTID'],'matchedAddress':matched,'latitude':lat,'longitude':lon,'registryCountyAsReported':e.get('sourceCounty') or None,'countyVerified':False,'municipalAddressStatus':v['Status'],'placementAsReported':None,'endUserValidationRequired':True})
    if len(hits)>1:reasons.add('multiple_points')
    status='review' if reasons or len(ids)>1 else 'candidate' if len(hits)==1 else 'noMatch'
    return (hits[0] if status=='candidate' else None),{'sourceKey':e['key'],'status':status,'reasons':sorted(reasons or ({'multiple_exact_objects'} if len(ids)>1 else {'no_exact_address'} if status=='noMatch' else set())),'exactObjectIds':sorted(ids)}
def acquire(entries,checked,fetch=request,max_requests=120):
    version=metadata(fetch);candidates=[];diagnostics=[];requests=0
    for e in sorted(filter(in_scope,entries),key=lambda x:x['key']):
        a=e['address']
        if not number(a) or not re.fullmatch(r'\d{5}',a['zip']):status,reason='unsupported','unsupported_address_format'
        elif requests>=max_requests:status,reason='notAttempted','request_limit'
        else:
            requests+=1
            try:
                rows=features(fetch(URL+'/query',query(a)))
                hit,d=review(e,rows);diagnostics.append(d)
                if hit:candidates.append(hit)
                continue
            except (OSError,ValueError,TypeError,KeyError,TimeoutError):status,reason='unavailable','source_request_failure'
        diagnostics.append({'sourceKey':e['key'],'status':status,'reasons':[reason],'exactObjectIds':[]})
    if metadata(fetch)!=version:raise ValueError('Municipal source changed during acquisition')
    if len({d['sourceKey'] for d in diagnostics})!=len(diagnostics):raise ValueError('Duplicate source identity')
    return {'schemaVersion':1,'sourceUrl':URL,'sourceMetadata':version,'checkedAt':checked,'publication':'review-only','requests':requests,'counts':dict(collections.Counter(d['status'] for d in diagnostics)),'candidates':candidates,'diagnostics':diagnostics,'limitations':'City of Midland municipal coverage, not statewide or countywide. Exact address matches do not establish county, facility type or current provider operation. No accepted map pins.'}
def main():
    p=argparse.ArgumentParser();p.add_argument('--output',type=pathlib.Path,required=True);p.add_argument('--max-requests',type=int,default=120);args=p.parse_args()
    if not 1<=args.max_requests<=120:raise ValueError('Invalid request budget')
    manifest,rows=read_registry();loc=PUBLIC/'locations';fl=json.loads((PUBLIC/'state-ems/FL.json').read_bytes());verify(loc,manifest,rows,fl)
    raw=(loc/'index.json').read_bytes();idx=json.loads(raw)
    entries=[e for c in idx['chunks'] if c['state']=='MI' for e in json.loads((loc/c['file']).read_bytes())]
    report=acquire(entries,datetime.datetime.now(datetime.timezone.utc).date().isoformat(),max_requests=args.max_requests)
    report['locationManifestSha256']=sha(raw);args.output.mkdir(parents=True,exist_ok=True)
    (args.output/'michigan-midland-address-review.json').write_text(json.dumps(report,indent=2)+'\n')
    print('Michigan Midland address review:',json.dumps({k:report[k] for k in ('requests','counts')}))
    if report['counts'].get('unavailable') or report['counts'].get('notAttempted'):raise ValueError('Incomplete municipal acquisition')
if __name__=='__main__':main()
