#!/usr/bin/env python3
"""Wisconsin OEC NG911 public address research; never writes provider records."""
import argparse, collections, datetime, json, math, pathlib, re, time, urllib.parse, urllib.request
from backfill_provider_locations import PUBLIC, ROOT, read_registry, verify, physical, match_address, sha
from recover_nad_locations import NoRedirect, county_index, county_key, sql
ITEM='3b84690a763449988d88da14b502e008'
ITEM_URL='https://www.arcgis.com/sharing/rest/content/items/'+ITEM
PORTAL='https://wisconsin-oec-data-portal-wi-oec.hub.arcgis.com/datasets/wi-oec::wi-ng911-site-structure-address-points'
LIVE_LAYER='https://services3.arcgis.com/GoOAGCoqFEhZEh7f/arcgis/rest/services/WI_NG911_Site_Structure_Address_Points_2/FeatureServer/0'
UNIT_ALIASES=('Unit_Value',)
UNIT_TYPE_ALIASES=('Unit_PreType',)
TEXT_FIELDS=('AddNum_Pre','AddNum_Suf','FullStNm','Post_Comm','Post_Code','State','Country','County','Building','Floor','Unit','Room','Seat','Addtl_Loc','Placement','Structure','Exception','MilePost')
DATE_FIELDS=('Effective','Expire','DateUpdate')
FIELDS={**{k:'esriFieldTypeString' for k in TEXT_FIELDS},**{k:'esriFieldTypeDate' for k in DATE_FIELDS},'Add_Number':'esriFieldTypeInteger'}
def request(url,params):
    target=url+'?'+urllib.parse.urlencode(params)
    if len(target)>3800:raise ValueError('URL budget exceeded')
    req=urllib.request.Request(target,headers={'Accept':'application/json','User-Agent':'ATLAS public address review/1.0'})
    with urllib.request.build_opener(NoRedirect()).open(req,timeout=35) as res:raw=res.read(4_000_001)
    if len(raw)>4_000_000:raise ValueError('Response too large')
    obj=json.loads(raw)
    if not isinstance(obj,dict) or 'error' in obj:raise ValueError('GIS source returned error')
    return obj
def layer_url(item):
    if item.get('id')!=ITEM or item.get('title')!='WI NG911 Site Structure Address Points' or item.get('type')!='Feature Service' or item.get('access')!='public':raise ValueError('Unexpected OEC catalog item')
    url=item.get('url','')
    if not re.fullmatch(r'https://services\d*\.arcgis\.com/[A-Za-z0-9]+/[Aa][Rr][Cc][Gg][Ii][Ss]/rest/services/[A-Za-z0-9_]+/FeatureServer/?',url):raise ValueError('Unexpected feature service URL')
    layer=url.rstrip('/')+'/0'
    if layer!=LIVE_LAYER:raise ValueError('Catalog item no longer resolves to the observed official layer')
    return layer
def schema(layer):
    if layer.get('serviceItemId')!=ITEM or layer.get('id')!=0 or layer.get('geometryType')!='esriGeometryPoint':raise ValueError('Unexpected statewide layer identity')
    by_name={}
    for f in layer.get('fields',[]):
        k=f['name'].lower()
        if k in by_name:raise ValueError('Ambiguous field names')
        by_name[k]=f
    names={}
    for field,kind in FIELDS.items():
        if field=='Unit':
            candidates=[by_name[k] for k in sorted({alias.lower() for alias in UNIT_ALIASES}) if k in by_name]
            if len(candidates)!=1:raise ValueError('Missing or ambiguous unit identifier field; review full schema artifact')
            f=candidates[0]
        else:f=by_name.get(field.lower(),{})
        if f.get('type')!=kind or not re.fullmatch(r'[A-Za-z0-9_]+',f.get('name','')):raise ValueError('Unreviewed schema field: '+field)
        names[field]=f['name']
    unit_types=[by_name[k] for k in {alias.lower() for alias in UNIT_TYPE_ALIASES} if k in by_name]
    if len(unit_types)!=1 or any(f.get('type')!='esriFieldTypeString' or not re.fullmatch(r'[A-Za-z0-9_]+',f.get('name','')) for f in unit_types):raise ValueError('Unreviewed unit type schema')
    names['UnitType']=unit_types[0]['name']
    oid=layer.get('objectIdField')
    if not isinstance(oid,str) or not re.fullmatch(r'[A-Za-z0-9_]+',oid) or by_name.get(oid.lower(),{}).get('type')!='esriFieldTypeOID':raise ValueError('Missing native object ID')
    names['oid']=oid
    return names
def number(a):
    if not physical(a):return None
    m=re.match(r'^([1-9]\d{0,5})\s+\S',a['street'])
    return int(m.group(1)) if m else None
def query(batch,names):
    if not 1<=len(batch)<=8 or any(a['state']!='WI' or not number(a) or not re.fullmatch(r'\d{5}',a['zip']) for a in batch):raise ValueError('Invalid address query')
    clauses=sorted({f"({names['Add_Number']}={number(a)} AND {names['Post_Code']}={sql(a['zip'])})" for a in batch})
    return {'f':'json','where':names['State']+"='WI' AND "+names['Country']+"='US' AND ("+' OR '.join(clauses)+')','outFields':','.join(names.values()),'returnGeometry':'true','outSR':'4326','resultRecordCount':1000}
def features(obj,names):
    rows=obj.get('features')
    if not isinstance(rows,list) or len(rows)>=1000 or obj.get('exceededTransferLimit'):raise ValueError('Incomplete response')
    sr=obj.get('spatialReference') or {}
    if rows and 4326 not in (sr.get('wkid'),sr.get('latestWkid')):raise ValueError('Unexpected coordinate system')
    result=[];seen=set()
    for f in rows:
        a=f['attributes'];g=f['geometry']
        if not isinstance(a,dict) or not isinstance(g,dict) or any(k not in a for k in names.values()):raise ValueError('Missing feature fields')
        v={k:a[n] for k,n in names.items()};oid=v['oid']
        if type(oid) is not int or not 0<oid<=9007199254740991 or oid in seen:raise ValueError('Invalid object ID')
        seen.add(oid);result.append((v,g))
    return result
def date(v):
    if v is None:return None
    if type(v) not in (int,float) or not math.isfinite(v) or v<=0:raise ValueError('Invalid date')
    return datetime.datetime.fromtimestamp(v/1000,datetime.timezone.utc).date().isoformat()
def review(e,rows,counties,checked,diagnostic=None):
    a=e['address'];hits=[];placement_review=[];placement_values=[];conflict=False;reasons=set();object_ids=set()
    for v,g in rows:
        if v['State']!='WI' or v['Country']!='US' or v['Post_Code']!=a['zip'] or v['Add_Number']!=number(a):continue
        if not isinstance(v['FullStNm'],str) or not isinstance(v['Post_Comm'],str):continue
        matched=f"{v['Add_Number']} {v['FullStNm']}, {v['Post_Comm']}, WI, {a['zip']}"
        if not match_address(a,matched):continue
        object_ids.add(v['oid'])
        if any(v[k] not in (None,'') for k in ('AddNum_Pre','AddNum_Suf','Building','Floor','Unit','Room','Seat','Addtl_Loc','Structure','Exception','MilePost')) or v.get('UnitType') not in (None,''):
            reasons.add('subaddress_or_exception');continue
        county=v['County'];fips=counties.get(('WI',county_key(county)),set()) if isinstance(county,str) else set()
        if len(fips)!=1:
            reasons.add('county_not_unique');conflict=True;continue
        if e.get('sourceCounty') and e['sourceCounty'] not in fips:
            reasons.add('county_conflict');conflict=True;continue
        try:
            effective,expire,updated=(date(v[k]) for k in DATE_FIELDS)
            if effective and effective>checked or expire and expire<=checked or updated and updated>checked:
                reasons.add('date_outside_validity');conflict=True;continue
        except (ValueError,OverflowError,OSError):
            reasons.add('invalid_date');conflict=True;continue
        lat,lon=g.get('y'),g.get('x');placement=v['Placement']
        if type(lat) not in (int,float) or type(lon) not in (int,float) or not math.isfinite(lat) or not math.isfinite(lon) or not 42.4<=lat<=47.1 or not -93<=lon<=-86.2:
            reasons.add('invalid_coordinates');conflict=True;continue
        valid_literal=placement is None or isinstance(placement,str) and len(placement)<=25 and not re.search(r'[\x00-\x1f\x7f]',placement)
        if not valid_literal:
            reasons.add('invalid_placement_value');conflict=True;continue
        placement_values.append({'objectId':v['oid'],'value':placement})
        point={'sourceKey':e['key'],'objectId':v['oid'],'matchedAddress':matched,'countyFips':next(iter(fips)),'latitude':lat,'longitude':lon,'placementAsReported':placement,'recordUpdatedAt':updated,'endUserValidationRequired':True}
        if placement not in ('Structure','Site','PropertyAccess','Property Access','Parcel'):
            reasons.add('placement_not_allowlisted');conflict=True
            placement_review.append({**point,'publication':'review-only','reason':'placement_not_allowlisted','operationalStationVerified':False})
            continue
        hits.append(point)
    if len(hits)>1:reasons.add('multiple_eligible_points')
    status='review' if conflict or len(hits)>1 else 'candidate' if hits else 'noMatch'
    if diagnostic is not None:
        diagnostic.update({'sourceKey':e['key'],'status':status,'reasons':sorted(reasons or ({'no_exact_address'} if status=='noMatch' else set())),'exactObjectIds':sorted(object_ids),'eligiblePointCount':len(hits),'placementObservations':sorted(placement_values,key=lambda p:p['objectId'])})
        # Never expose an alternative coordinate when any other exact object or conflicting condition exists.
        if status=='review' and reasons=={'placement_not_allowlisted'} and len(object_ids)==1 and len(placement_review)==1 and not hits:
            diagnostic['placementReviewCandidate']=placement_review[0]
    return (hits[0] if status=='candidate' else None),status
def acquire(entries,counties,checked,out,fetch=request,max_requests=120,delay=1):
    out.mkdir(parents=True,exist_ok=True)
    url=layer_url(fetch(ITEM_URL,{'f':'json'}));layer=fetch(url,{'f':'json'})
    (out/'wisconsin-schema-review.json').write_text(json.dumps({'sourceUrl':url,'itemId':ITEM,'layerId':layer.get('id'),'serviceItemId':layer.get('serviceItemId'),'fields':[{k:f.get(k) for k in ('name','type','alias','domain')} for f in layer.get('fields',[])]},indent=2)+'\n')
    names=schema(layer);groups=collections.defaultdict(list);stats=collections.Counter();hits=[];diagnostics=[];requests=0;errors=0
    for e in entries:
        if e['state']!='WI' or e['status'] not in ('no-match','unavailable'):continue
        a=e['address']
        if not number(a) or not re.fullmatch(r'\d{5}',a['zip']):
            stats['unsupported']+=1;diagnostics.append({'sourceKey':e['key'],'status':'unsupported','reasons':['unsupported_address_format'],'exactObjectIds':[],'eligiblePointCount':0});continue
        groups[(a['street'],a['city'],a['zip'])].append(e)
    batches=[groups[k] for k in sorted(groups)]
    for i in range(0,len(batches),8):
        batch=batches[i:i+8]
        if requests>=max_requests or errors>=3:
            stats['notAttempted']+=sum(map(len,batch));diagnostics.extend({'sourceKey':e['key'],'status':'notAttempted','reasons':['request_budget_or_error_limit'],'exactObjectIds':[],'eligiblePointCount':0} for group in batch for e in group);continue
        requests+=1
        try:rows=features(fetch(url+'/query',query([g[0]['address'] for g in batch],names)),names);errors=0
        except (OSError,ValueError,TypeError,KeyError,TimeoutError):
            errors+=1;stats['unavailable']+=sum(map(len,batch));diagnostics.extend({'sourceKey':e['key'],'status':'unavailable','reasons':['source_request_or_response_failure'],'exactObjectIds':[],'eligiblePointCount':0} for group in batch for e in group);continue
        for group in batch:
            for e in group:
                detail={};hit,status=review(e,rows,counties,checked,detail);stats[status]+=1;diagnostics.append(detail)
                if hit:hits.append(hit)
        time.sleep(delay)
    after=fetch(url,{'f':'json'})
    if schema(after)!=names or (layer.get('editingInfo') or {}).get('lastEditDate')!=(after.get('editingInfo') or {}).get('lastEditDate') or layer_url(fetch(ITEM_URL,{'f':'json'}))!=url:raise ValueError('Source changed during acquisition')
    if collections.Counter(d['status'] for d in diagnostics)!=stats or len({d['sourceKey'] for d in diagnostics})!=len(diagnostics):raise ValueError('Diagnostic accounting mismatch')
    reason_counts=collections.Counter(reason for d in diagnostics if d['status']!='candidate' for reason in d['reasons'])
    placement_candidates=[d['placementReviewCandidate'] for d in diagnostics if 'placementReviewCandidate' in d]
    placement_counts=collections.Counter(json.dumps(p['value'],ensure_ascii=True) for d in diagnostics if 'placement_not_allowlisted' in d['reasons'] for p in d.get('placementObservations',[]))
    return {'schemaVersion':3,'placementReviewCandidates':sorted(placement_candidates,key=lambda p:p['sourceKey']),'placementObservationCounts':dict(sorted(placement_counts.items())),'diagnostics':sorted(diagnostics,key=lambda d:d['sourceKey']),'reasonCounts':dict(sorted(reason_counts.items())),'sourceUrl':url,'sourceItemId':ITEM,'sourcePortal':PORTAL,'checkedAt':checked,'sourceLastEditDate':(layer.get('editingInfo') or {}).get('lastEditDate'),'counts':dict(stats),'requests':requests,'candidates':sorted(hits,key=lambda h:h['sourceKey']),'publication':'review-only','limitations':'Incomplete statewide address dataset; no provider operation or station identity verified.'}
def main():
    p=argparse.ArgumentParser();p.add_argument('--output',type=pathlib.Path,required=True);p.add_argument('--max-requests',type=int,default=120);args=p.parse_args()
    if not 1<=args.max_requests<=120:raise ValueError('Invalid request budget')
    manifest,rows=read_registry();loc=PUBLIC/'locations';fl=json.loads((PUBLIC/'state-ems/FL.json').read_bytes());verify(loc,manifest,rows,fl)
    raw=(loc/'index.json').read_bytes();idx=json.loads(raw)
    entries=[e for c in idx['chunks'] for e in json.loads((loc/c['file']).read_bytes()) if e['state']=='WI']
    counties=county_index(json.loads((ROOT/'scripts/fixtures/census-2026-county-identities.json').read_text())['counties'])
    report=acquire(entries,counties,datetime.datetime.now(datetime.timezone.utc).date().isoformat(),args.output,max_requests=args.max_requests)
    report['locationManifestSha256']=sha(raw)
    (args.output/'wisconsin-address-review.json').write_text(json.dumps(report,indent=2)+'\n')
    print('Wisconsin address review:',json.dumps({'counts':report['counts'],'requests':report['requests'],'reasonCounts':report['reasonCounts'],'placementReviewCandidates':len(report['placementReviewCandidates']),'placementObservationCounts':report['placementObservationCounts']}))
    if report['counts'].get('unavailable') or report['counts'].get('notAttempted'):raise ValueError('Incomplete acquisition; partial review artifact only')
if __name__=='__main__':main()
