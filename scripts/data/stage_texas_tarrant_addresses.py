#!/usr/bin/env python3
"""TC911 address-point research via the City of Keller public layer; review-only."""
import argparse,collections,datetime,json,math,pathlib,re,time
from backfill_provider_locations import PUBLIC,read_registry,verify,physical,base_street,match_address,sha
from recover_nad_locations import sql
from stage_wisconsin_addresses import request
from stage_pennsylvania_bucks_addresses import clean,date
LAYER='https://gis.cityofkeller.com/arcgis/rest/services/NETCOM/MapServer/1'
ITEM='c8a186d9a9444efb88a0ade0d093d60d'
COUNTY='48439'
SUB=('HOUSE_PRE','HOUSE_SUF','BUILDING','FLOOR','UNIT','SUITE','ROOM','APT')
FIELDS={**{k:'esriFieldTypeString' for k in (*SUB,'ROADNAME','ADDRESS','POSTAL_NAM','ZIP_CODE','STATE','COUNTY_NAM','CNTY_FIPS','DATASOURCE','PLACE_TYPE','SITE_TYPE','LOCATION')},'FID':'esriFieldTypeOID','HOUSE_NUM':'esriFieldTypeInteger','SITE_ID':'esriFieldTypeInteger','FLAG':'esriFieldTypeInteger','EXCEPTION':'esriFieldTypeDouble','UPDATE_DAT':'esriFieldTypeDate','EFFECTIVE_':'esriFieldTypeDate'}
def metadata(fetch=request):
    l=fetch(LAYER,{'f':'json'})
    if l.get('id')!=1 or l.get('name')!='TC911 Address Points' or l.get('serviceItemId')!=ITEM or l.get('geometryType')!='esriGeometryPoint':raise ValueError('Unexpected TC911 layer')
    fields=l.get('fields',[]);k={f['name']:f['type'] for f in fields}
    if len(k)!=len(fields) or any(k.get(n)!=t for n,t in FIELDS.items()):raise ValueError('Unreviewed TC911 schema')
    return {'serviceItemId':ITEM,'layerId':1,'fields':FIELDS,'lastEditDate':(l.get('editingInfo') or {}).get('lastEditDate')}
def number(a):
    if not physical(a) or not re.fullmatch(r'\d{5}',a['zip']):return None
    m=re.match(r'^([1-9]\d{0,5})\s+\S',a['street'])
    return int(m.group(1)) if m else None
def query(batch):
    if not 1<=len(batch)<=8 or any(a['state']!='TX' or number(a) is None for a in batch):raise ValueError('Invalid query')
    clauses=sorted({f"(HOUSE_NUM={number(a)} AND ZIP_CODE={sql(a['zip'])})" for a in batch})
    return {'f':'json','where':' OR '.join(clauses),'outFields':','.join(FIELDS),'returnGeometry':'true','outSR':'4326','resultRecordCount':1000}
def features(p):
    rows=p.get('features');sr=p.get('spatialReference') or {}
    if not isinstance(rows,list) or len(rows)>=1000 or p.get('exceededTransferLimit') or rows and 4326 not in (sr.get('wkid'),sr.get('latestWkid')):raise ValueError('Incomplete point response')
    seen=set()
    for f in rows:
        a=f.get('attributes');g=f.get('geometry')
        if not isinstance(a,dict) or not isinstance(g,dict) or not set(FIELDS)<=set(a):raise ValueError('Missing point fields')
        oid=a['FID']
        if type(oid) is not int or not 0<oid<=9007199254740991 or oid in seen:raise ValueError('Invalid object ID')
        seen.add(oid)
    return rows
def review(e,rows,checked):
    a=e['address'];hits=[];ids=set();reasons=set()
    for f in rows:
        v=f['attributes'];g=f['geometry']
        if v['ZIP_CODE']!=a['zip'] or v['HOUSE_NUM']!=number(a) or not all(clean(v[k]) for k in ('ROADNAME','POSTAL_NAM','ADDRESS')):continue
        full=f"{v['HOUSE_NUM']} {v['ROADNAME']}, {v['POSTAL_NAM']}, TX, {v['ZIP_CODE']}"
        if not match_address(a,full):continue
        ids.add(v['FID'])
        if v['STATE']!='TX' or v['CNTY_FIPS']!='48439' or str(v['COUNTY_NAM']).strip().upper()!='TARRANT' or e.get('sourceCounty')!=COUNTY:reasons.add('county_conflict');continue
        if not match_address(a,f"{v['ADDRESS']}, {v['POSTAL_NAM']}, TX, {v['ZIP_CODE']}"):reasons.add('full_address_disagreement');continue
        if base_street(a['street'])!=a['street'].strip() or any(v[k] not in (None,'') for k in SUB) or v['EXCEPTION'] not in (None,0) or v['FLAG'] not in (None,0):reasons.add('subaddress_or_exception');continue
        if type(v['SITE_ID']) is not int or v['SITE_ID']<=0 or not clean(v['DATASOURCE']):reasons.add('missing_source_identity');continue
        try:
            updated,effective=map(date,(v['UPDATE_DAT'],v['EFFECTIVE_']))
            if not updated or updated>checked or effective and effective>checked:raise ValueError('Invalid lifecycle')
        except (ValueError,OverflowError,OSError):reasons.add('invalid_lifecycle');continue
        lat,lon=g.get('y'),g.get('x')
        if any(type(x) not in (int,float) or not math.isfinite(x) for x in (lat,lon)) or not 32.5<=lat<=33.1 or not -97.6<=lon<=-97.0:reasons.add('coordinate_outside_scope');continue
        hits.append({'sourceKey':e['key'],'objectId':v['FID'],'siteId':v['SITE_ID'],'matchedAddress':full,'countyFips':COUNTY,'latitude':lat,'longitude':lon,'recordUpdatedAt':updated,'sourceAsReported':v['DATASOURCE'],'placeTypeAsReported':v['PLACE_TYPE'],'siteTypeAsReported':v['SITE_TYPE'],'locationAsReported':v['LOCATION'],'placementAsReported':None,'countyVerified':False,'endUserValidationRequired':True,'publicationEligible':False})
    if len(ids)>1:reasons.add('multiple_exact_objects')
    status='review' if reasons else 'candidate' if len(hits)==1 else 'noMatch'
    return (hits[0] if status=='candidate' else None),{'sourceKey':e['key'],'status':status,'exactObjectIds':sorted(ids),'reasons':sorted(reasons or ({'no_exact_address'} if status=='noMatch' else set()))}
def acquire(entries,checked,fetch=request,delay=1):
    version=metadata(fetch);groups=collections.defaultdict(list);diagnostics=[];candidates=[];requests=0
    for e in sorted(entries,key=lambda e:e['key']):
        if e['state']!='TX' or e['status'] not in ('no-match','unavailable') or e.get('sourceCounty')!=COUNTY:continue
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
    entries=[e for c in idx['chunks'] if c['state']=='TX' for e in json.loads((loc/c['file']).read_bytes())]
    report=acquire(entries,datetime.datetime.now(datetime.timezone.utc).date().isoformat());report['locationManifestSha256']=sha(raw)
    a.output.mkdir(parents=True,exist_ok=True);(a.output/'texas-tarrant-address-review.json').write_text(json.dumps(report,indent=2)+'\n')
    print('Tarrant County address review:',json.dumps({k:report[k] for k in ('requests','counts')}))
    if report['counts'].get('unavailable') or report['counts'].get('notAttempted'):raise ValueError('Incomplete acquisition')
if __name__=='__main__':main()
