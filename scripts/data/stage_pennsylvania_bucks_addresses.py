#!/usr/bin/env python3
"""County-reported Bucks County address points, review-only; no snapshot writes."""
import argparse,collections,datetime,json,math,pathlib,re,time
from backfill_provider_locations import PUBLIC,read_registry,verify,physical,base_street,match_address,sha
from recover_nad_locations import sql
from stage_wisconsin_addresses import request
LAYER='https://mapservices.pasda.psu.edu/server/rest/services/pasda/BucksCounty/MapServer/14'
COUNTY='42017'
FIELDS={**{k:'esriFieldTypeString' for k in ('Full_Addr','Post_Code','State','County','Source','Site_NGUID','Country','AddNum_Pre','Add_Number','AddNum_Suf','Post_Comm','Building','Floor','Unit','Room','Seat','Addtl_Loc','Mile_Post','Placement','gc_excepti')},**{k:'esriFieldTypeDate' for k in ('DateUpdate','Effective','Expire')},'OBJECTID':'esriFieldTypeOID'}
def metadata(fetch):
    l=fetch(LAYER,{'f':'json'})
    if l.get('id')!=14 or l.get('name')!='Bucks County - Site Address Points 202503' or l.get('geometryType')!='esriGeometryPoint':raise ValueError('Unexpected PASDA layer')
    fields=l.get('fields',[]);k={f['name']:f['type'] for f in fields}
    if len(k)!=len(fields) or any(k.get(n)!=t for n,t in FIELDS.items()):raise ValueError('Unreviewed Bucks County schema')
    return {'layerId':14,'name':l['name'],'fields':FIELDS,'edition':'202503','lastEditDate':(l.get('editingInfo') or {}).get('lastEditDate')}
def number(a):
    if not physical(a) or not re.fullmatch(r'\d{5}',a['zip']):return None
    m=re.match(r'^([1-9]\d{0,5})\s+\S',a['street'])
    return m.group(1) if m else None
def query(batch):
    if not 1<=len(batch)<=8 or any(a['state']!='PA' or not number(a) for a in batch):raise ValueError('Invalid query')
    clauses=sorted({f"(Add_Number={sql(number(a))} AND Post_Code={sql(a['zip'])})" for a in batch})
    return {'f':'json','where':"State='PA' AND Country='US' AND ("+' OR '.join(clauses)+')','outFields':','.join(FIELDS),'returnGeometry':'true','outSR':'4326','resultRecordCount':1000}
def features(p):
    rows=p.get('features');sr=p.get('spatialReference') or {}
    if not isinstance(rows,list) or len(rows)>=1000 or p.get('exceededTransferLimit') or rows and 4326 not in (sr.get('wkid'),sr.get('latestWkid')):raise ValueError('Incomplete response')
    seen=set()
    for f in rows:
        a=f.get('attributes');g=f.get('geometry')
        if not isinstance(a,dict) or not isinstance(g,dict) or not set(FIELDS)<=set(a):raise ValueError('Missing fields')
        oid=a['OBJECTID']
        if type(oid) is not int or not 0<oid<=9007199254740991 or oid in seen:raise ValueError('Invalid object ID')
        seen.add(oid)
    return rows
def clean(v):return isinstance(v,str) and bool(v.strip()) and len(v)<=254 and not re.search(r'[\x00-\x1f\x7f]',v)
def date(v):
    if v is None:return None
    if type(v) not in (int,float) or not math.isfinite(v) or v<=0:raise ValueError('Invalid date')
    return datetime.datetime.fromtimestamp(v/1000,datetime.timezone.utc).date().isoformat()
def review(e,rows,checked):
    a=e['address'];hits=[];ids=set();reasons=set()
    for f in rows:
        v=f['attributes'];g=f['geometry']
        if v['State']!='PA' or v['Country']!='US' or v['Post_Code']!=a['zip'] or v['Add_Number']!=number(a) or not clean(v['Full_Addr']) or not clean(v['Post_Comm']):continue
        full=f"{v['Full_Addr']}, {v['Post_Comm']}, PA, {v['Post_Code']}"
        if not match_address(a,full):continue
        ids.add(v['OBJECTID'])
        if not clean(v['County']) or v['County'].strip().upper() not in ('BUCKS','BUCKS COUNTY'):reasons.add('county_conflict');continue
        if base_street(a['street'])!=a['street'].strip() or any(v[k] not in (None,'') for k in ('AddNum_Pre','AddNum_Suf','Building','Floor','Unit','Room','Seat','Addtl_Loc','Mile_Post','gc_excepti')):reasons.add('subaddress_or_exception');continue
        if not clean(v['Source']) or not clean(v['Site_NGUID']):reasons.add('missing_source_identity');continue
        try:
            updated,effective,expire=map(date,(v['DateUpdate'],v['Effective'],v['Expire']))
            if not updated or updated>checked or effective and effective>checked or expire and expire<=checked:raise ValueError('Invalid lifecycle')
        except (ValueError,OverflowError,OSError):reasons.add('invalid_lifecycle');continue
        lat,lon=g.get('y'),g.get('x')
        if any(type(x) not in (int,float) or not math.isfinite(x) for x in (lat,lon)) or not 40.04<=lat<=40.66 or not -75.51<=lon<=-74.68:reasons.add('coordinate_outside_scope');continue
        placement=v['Placement']
        if placement is not None and not clean(placement):reasons.add('invalid_placement');continue
        hits.append({'sourceKey':e['key'],'objectId':v['OBJECTID'],'matchedAddress':full,'countyFips':COUNTY,'latitude':lat,'longitude':lon,'sourceAsReported':v['Source'],'siteNguid':v['Site_NGUID'],'recordUpdatedAt':updated,'placementAsReported':placement,'countyVerified':False,'endUserValidationRequired':True,'publicationEligible':False})
    if len(ids)>1:reasons.add('multiple_exact_objects')
    status='review' if reasons else 'candidate' if len(hits)==1 else 'noMatch'
    return (hits[0] if status=='candidate' else None),{'sourceKey':e['key'],'status':status,'exactObjectIds':sorted(ids),'reasons':sorted(reasons or ({'no_exact_address'} if status=='noMatch' else set()))}
def acquire(entries,checked,fetch=request,delay=1):
    version=metadata(fetch);groups=collections.defaultdict(list);diagnostics=[];candidates=[];requests=0
    for e in sorted(entries,key=lambda e:e['key']):
        if e['state']!='PA' or e['status'] not in ('no-match','unavailable') or e.get('sourceCounty')!=COUNTY:continue
        a=e['address']
        if not number(a):diagnostics.append({'sourceKey':e['key'],'status':'unsupported','reasons':['unsupported_address_format']});continue
        groups[(a['zip'],number(a))].append(e)
    values=[groups[k] for k in sorted(groups)]
    for i in range(0,len(values),8):
        batch=values[i:i+8];requests+=1;es=[e for g in batch for e in g]
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
    return {'schemaVersion':1,'sourceUrl':LAYER,'sourceMetadata':version,'checkedAt':checked,'publication':'review-only','requests':requests,'counts':dict(collections.Counter(d['status'] for d in diagnostics)),'candidates':candidates,'diagnostics':diagnostics}
def main():
    p=argparse.ArgumentParser();p.add_argument('--output',type=pathlib.Path,required=True);a=p.parse_args()
    loc=PUBLIC/'locations';m,rows=read_registry();fl=json.loads((PUBLIC/'state-ems/FL.json').read_bytes());verify(loc,m,rows,fl)
    raw=(loc/'index.json').read_bytes();idx=json.loads(raw)
    entries=[e for c in idx['chunks'] if c['state']=='PA' for e in json.loads((loc/c['file']).read_bytes())]
    report=acquire(entries,datetime.datetime.now(datetime.timezone.utc).date().isoformat());report['locationManifestSha256']=sha(raw)
    a.output.mkdir(parents=True,exist_ok=True);(a.output/'pennsylvania-bucks-address-review.json').write_text(json.dumps(report,indent=2)+'\n')
    print('Bucks County address review:',json.dumps({k:report[k] for k in ('requests','counts')}))
    if report['counts'].get('unavailable'):raise ValueError('Incomplete acquisition')
if __name__=='__main__':main()
