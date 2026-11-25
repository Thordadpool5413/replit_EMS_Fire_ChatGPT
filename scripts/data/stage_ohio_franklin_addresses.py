#!/usr/bin/env python3
"""Franklin County Ohio public LBRS exact-address evidence; review-only."""
import argparse,collections,datetime,json,math,pathlib,re,time
from backfill_provider_locations import PUBLIC,read_registry,verify,physical,base_street,match_address,sha
from recover_nad_locations import sql
from stage_wisconsin_addresses import request
from stage_pennsylvania_bucks_addresses import clean,date
LAYER='https://gis.franklincountyohio.gov/hosting/rest/services/Addressing/LBRS/FeatureServer/0'
ITEM='b7d525b8ca794e90b3b43dc7829f283e'
COUNTY='39049'
SUB=('ADDR_HALF','BUILDING','FLOOR','UNIT_NUM','UNIT_TYPE')
STREET=('ADDR_NUM','PRE_DIR','PRE_TYPE','STR_NAME','STR_TYPE','SUF_DIR')
FIELDS={**{k:'esriFieldTypeString' for k in (*STREET,*SUB,'USPS_CITY','STATE','COUNTY','ZIP')},'OBJECTID':'esriFieldTypeOID','ADDR_ID':'esriFieldTypeDouble','STATUS':'esriFieldTypeSmallInteger','STRUC_TYPE':'esriFieldTypeInteger','LAST_EDIT_DATE':'esriFieldTypeDate'}
def metadata(fetch=request):
    l=fetch(LAYER,{'f':'json'})
    if l.get('id')!=0 or l.get('name')!='LBRS Address Points' or l.get('serviceItemId')!=ITEM or l.get('geometryType')!='esriGeometryPoint':raise ValueError('Unexpected Franklin County layer')
    fs=l.get('fields',[]);k={f['name']:f for f in fs}
    if len(k)!=len(fs) or any(k.get(n,{}).get('type')!=t for n,t in FIELDS.items()):raise ValueError('Unreviewed Franklin County schema')
    domains={n:{v['code']:v['name'] for v in (k[n].get('domain') or {}).get('codedValues',[])} for n in ('STATUS','COUNTY','STRUC_TYPE')}
    if domains['STATUS'].get(6)!='6 Certified' or domains['COUNTY'].get('FRA')!='Franklin':raise ValueError('Source status or county semantics changed')
    return {'serviceItemId':ITEM,'layerId':0,'fields':FIELDS,'statusDomain':sorted(domains['STATUS'].items()),'countyDomain':sorted(domains['COUNTY'].items()),'structureDomain':sorted(domains['STRUC_TYPE'].items()),'lastEditDate':(l.get('editingInfo') or {}).get('lastEditDate')}
def number(a):
    if not physical(a) or not re.fullmatch(r'\d{5}',a['zip']):return None
    m=re.match(r'^([1-9]\d{0,5})\s+\S',a['street'])
    return m.group(1) if m else None
def query(batch):
    if not 1<=len(batch)<=8 or any(a['state']!='OH' or number(a) is None for a in batch):raise ValueError('Invalid query')
    clauses=sorted({f"(ADDR_NUM={sql(number(a))} AND ZIP={sql(a['zip'])})" for a in batch})
    return {'f':'json','where':"STATE='OH' AND COUNTY='FRA' AND ("+' OR '.join(clauses)+')','outFields':','.join(FIELDS),'returnGeometry':'true','outSR':'4326','resultRecordCount':1000}
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
        if v['STATE']!='OH' or v['ZIP']!=a['zip'] or v['ADDR_NUM']!=number(a) or not clean(v['STR_NAME']) or not clean(v['USPS_CITY']):continue
        if any(v[k] not in (None,'') and not clean(v[k]) for k in STREET):continue
        street=' '.join(v[k].strip() for k in STREET if v[k])
        full=f"{street}, {v['USPS_CITY']}, OH, {v['ZIP']}"
        if not match_address(a,full):continue
        ids.add(v['OBJECTID'])
        if v['COUNTY']!='FRA' or e.get('sourceCounty')!=COUNTY:reasons.add('county_conflict');continue
        if base_street(a['street'])!=a['street'].strip() or any(v[k] not in (None,'') for k in SUB):reasons.add('subaddress_or_exception');continue
        if v['STATUS']!=6:reasons.add('not_certified');continue
        if type(v['ADDR_ID']) not in (int,float) or not math.isfinite(v['ADDR_ID']) or v['ADDR_ID']<=0 or v['ADDR_ID']!=int(v['ADDR_ID']) or v['ADDR_ID']>9007199254740991:reasons.add('missing_address_identity');continue
        try:
            updated=date(v['LAST_EDIT_DATE'])
            if not updated or updated>checked:raise ValueError('Invalid update date')
        except (ValueError,OverflowError,OSError):reasons.add('invalid_update_date');continue
        lat,lon=g.get('y'),g.get('x')
        if any(type(x) not in (int,float) or not math.isfinite(x) for x in (lat,lon)) or not 39.7<=lat<=40.25 or not -83.3<=lon<=-82.7:reasons.add('coordinate_outside_scope');continue
        hits.append({'sourceKey':e['key'],'objectId':v['OBJECTID'],'addressId':int(v['ADDR_ID']),'matchedAddress':full,'countyFips':COUNTY,'latitude':lat,'longitude':lon,'recordUpdatedAt':updated,'statusAsReported':v['STATUS'],'structureAsReported':v['STRUC_TYPE'],'placementAsReported':None,'countyVerified':False,'endUserValidationRequired':True,'publicationEligible':False})
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
    a.output.mkdir(parents=True,exist_ok=True);(a.output/'ohio-franklin-address-review.json').write_text(json.dumps(report,indent=2)+'\n')
    print('Franklin County address review:',json.dumps({k:report[k] for k in ('requests','counts')}))
    if report['counts'].get('unavailable') or report['counts'].get('notAttempted'):raise ValueError('Incomplete acquisition')
if __name__=='__main__':main()
