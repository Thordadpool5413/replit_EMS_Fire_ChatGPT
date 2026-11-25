#!/usr/bin/env python3
"""Trumbull County DDTI exact public address-point research; review-only."""
import argparse,collections,datetime,json,math,pathlib,re,time
from backfill_provider_locations import PUBLIC,read_registry,verify,physical,base_street,match_address,sha
from recover_nad_locations import sql
from stage_wisconsin_addresses import request
from stage_pennsylvania_bucks_addresses import clean,date
SERVICE='https://webgis.co.trumbull.oh.us/gisserver/rest/services/Maps/DDTI_WM/MapServer'
LAYER=SERVICE+'/0'
ITEM='d829ad25a6fb4a408617ba741f16eb23'
COUNTY='39155'
SUB=('UNITNUM','UNITEXTRA','HNRANGE','BUILDING','FLOOR')
FIELDS={**{k:'esriFieldTypeString' for k in (*SUB,'LSN','LHN','ZIPCODE','USPS_CITY','STATE','COUNTY','FIPSCODE')},'OBJECTID':'esriFieldTypeOID','FEATUREID':'esriFieldTypeInteger','HOUSENUM':'esriFieldTypeInteger','STRUC_TYPE':'esriFieldTypeSmallInteger','SOURCE':'esriFieldTypeSmallInteger','DATEMODIFI':'esriFieldTypeDate'}
def metadata(fetch=request):
    s=fetch(SERVICE,{'f':'json'});l=fetch(LAYER,{'f':'json'})
    if s.get('serviceItemId')!=ITEM or 'Trumbull County, OH' not in s.get('copyrightText','') or not any(x.get('id')==0 and x.get('name')=='Address Points' for x in s.get('layers',[])):raise ValueError('Unexpected Trumbull County service')
    if l.get('id')!=0 or l.get('name')!='Address Points' or l.get('geometryType')!='esriGeometryPoint' or l.get('serviceItemId')!=ITEM:raise ValueError('Unexpected Trumbull County layer')
    fields=l.get('fields',[]);k={f['name']:f['type'] for f in fields}
    if len(k)!=len(fields) or any(k.get(n)!=t for n,t in FIELDS.items()):raise ValueError('Unreviewed Trumbull County schema')
    return {'serviceItemId':ITEM,'layerId':0,'fields':FIELDS,'lastEditDate':(l.get('editingInfo') or {}).get('lastEditDate')}
def number(a):
    if not physical(a) or not re.fullmatch(r'\d{5}',a['zip']):return None
    m=re.match(r'^([1-9]\d{0,5})\s+\S',a['street'])
    return int(m.group(1)) if m else None
def query(batch):
    if not 1<=len(batch)<=8 or any(a['state']!='OH' or number(a) is None for a in batch):raise ValueError('Invalid query')
    clauses=sorted({f"(HOUSENUM={number(a)} AND ZIPCODE={sql(a['zip'])})" for a in batch})
    return {'f':'json','where':' OR '.join(clauses),'outFields':','.join(FIELDS),'returnGeometry':'true','outSR':'4326','resultRecordCount':1000}
def features(p):
    rows=p.get('features');sr=p.get('spatialReference') or {}
    if not isinstance(rows,list) or len(rows)>=1000 or p.get('exceededTransferLimit') or rows and 4326 not in (sr.get('wkid'),sr.get('latestWkid')):raise ValueError('Incomplete point response')
    seen=set()
    for f in rows:
        a=f.get('attributes');g=f.get('geometry')
        if not isinstance(a,dict) or not isinstance(g,dict) or not set(FIELDS)<=set(a):raise ValueError('Missing point fields')
        oid=a['OBJECTID']
        if type(oid) is not int or not 0<oid<=9007199254740991 or oid in seen:raise ValueError('Invalid object ID')
        seen.add(oid)
    return rows
def review(e,rows,checked):
    a=e['address'];hits=[];ids=set();reasons=set()
    for f in rows:
        v=f['attributes'];g=f['geometry']
        if v['ZIPCODE']!=a['zip'] or v['HOUSENUM']!=number(a) or not all(clean(v[k]) for k in ('LHN','LSN','USPS_CITY')):continue
        full=f"{v['LHN']} {v['LSN']}, {v['USPS_CITY']}, OH, {v['ZIPCODE']}"
        if not match_address(a,full):continue
        ids.add(v['OBJECTID'])
        if v['STATE']!='OH' or not clean(v['COUNTY']) or v['COUNTY'].strip().upper() not in ('TRUMBULL','TRUMBULL COUNTY') or e.get('sourceCounty')!=COUNTY:reasons.add('county_conflict');continue
        if base_street(a['street'])!=a['street'].strip() or any(v[k] not in (None,'') for k in SUB):reasons.add('subaddress_or_exception');continue
        if type(v['FEATUREID']) is not int or v['FEATUREID']<=0 or type(v['SOURCE']) is not int:reasons.add('missing_native_identity');continue
        try:
            updated=date(v['DATEMODIFI'])
            if not updated or updated>checked:raise ValueError('Invalid update date')
        except (ValueError,OverflowError,OSError):reasons.add('invalid_update_date');continue
        lat,lon=g.get('y'),g.get('x')
        if any(type(x) not in (int,float) or not math.isfinite(x) for x in (lat,lon)) or not 41.1<=lat<=41.52 or not -81.05<=lon<=-80.5:reasons.add('coordinate_outside_scope');continue
        hits.append({'sourceKey':e['key'],'objectId':v['OBJECTID'],'featureId':v['FEATUREID'],'matchedAddress':full,'countyFips':COUNTY,'latitude':lat,'longitude':lon,'recordUpdatedAt':updated,'sourceCodeAsReported':v['SOURCE'],'structureCodeAsReported':v['STRUC_TYPE'],'fipsCodeAsReported':v['FIPSCODE'],'placementAsReported':None,'countyVerified':False,'endUserValidationRequired':True,'publicationEligible':False})
    if len(ids)>1:reasons.add('multiple_exact_objects')
    status='review' if reasons else 'candidate' if len(hits)==1 else 'noMatch'
    return (hits[0] if status=='candidate' else None),{'sourceKey':e['key'],'status':status,'exactObjectIds':sorted(ids),'reasons':sorted(reasons or ({'no_exact_address'} if status=='noMatch' else set()))}
def acquire(entries,checked,fetch=request,delay=1):
    version=metadata(fetch);groups=collections.defaultdict(list);diagnostics=[];candidates=[];requests=0
    for e in sorted(entries,key=lambda e:e['key']):
        if e['state']!='OH' or e['status'] not in ('no-match','unavailable') or e.get('sourceCounty')!=COUNTY:continue
        a=e['address']
        if number(a) is None:diagnostics.append({'sourceKey':e['key'],'status':'unsupported','reasons':['unsupported_address_format']});continue
        groups[(a['zip'],number(a))].append(e)
    values=[groups[k] for k in sorted(groups)]
    for i in range(0,len(values),8):
        batch=values[i:i+8];es=[e for g in batch for e in g]
        if requests>=120:
            diagnostics.extend({'sourceKey':e['key'],'status':'notAttempted','reasons':['request_budget']} for e in es);continue
        requests+=1
        try:
            rows=features(fetch(LAYER+'/query',query([g[0]['address'] for g in batch])))
            for e in es:
                hit,d=review(e,rows,checked);diagnostics.append(d)
                if hit:candidates.append(hit)
        except (OSError,ValueError,TypeError,KeyError,TimeoutError):
            diagnostics.extend({'sourceKey':e['key'],'status':'unavailable','reasons':['source_request_failure']} for e in es)
        time.sleep(delay)
    if metadata(fetch)!=version:raise ValueError('Source changed during acquisition')
    if len({d['sourceKey'] for d in diagnostics})!=len(diagnostics):raise ValueError('Duplicate source identity')
    objects=collections.Counter(c['objectId'] for c in candidates)
    for c in candidates:c['sharedSourcePoint']=objects[c['objectId']]>1
    return {'schemaVersion':1,'sourceUrl':LAYER,'sourceMetadata':version,'checkedAt':checked,'publication':'review-only','requests':requests,'counts':dict(collections.Counter(d['status'] for d in diagnostics)),'candidates':candidates,'diagnostics':diagnostics}
def main():
    p=argparse.ArgumentParser();p.add_argument('--output',type=pathlib.Path,required=True);a=p.parse_args()
    loc=PUBLIC/'locations';m,rows=read_registry();fl=json.loads((PUBLIC/'state-ems/FL.json').read_bytes());verify(loc,m,rows,fl)
    raw=(loc/'index.json').read_bytes();idx=json.loads(raw)
    entries=[e for c in idx['chunks'] if c['state']=='OH' for e in json.loads((loc/c['file']).read_bytes())]
    report=acquire(entries,datetime.datetime.now(datetime.timezone.utc).date().isoformat());report['locationManifestSha256']=sha(raw)
    a.output.mkdir(parents=True,exist_ok=True);(a.output/'ohio-trumbull-address-review.json').write_text(json.dumps(report,indent=2)+'\n')
    print('Trumbull County address review:',json.dumps({k:report[k] for k in ('requests','counts')}))
    if report['counts'].get('unavailable') or report['counts'].get('notAttempted'):raise ValueError('Incomplete acquisition')
if __name__=='__main__':main()
