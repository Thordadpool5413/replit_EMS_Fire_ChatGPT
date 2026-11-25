#!/usr/bin/env python3
"""LA County CAMS exact address evidence: review-only, never writes public locations."""
import argparse, collections, datetime, json, math, pathlib, re, time
from backfill_provider_locations import PUBLIC, read_registry, verify, physical, base_street, normal_street, match_address, sha
from recover_nad_locations import sql
from stage_wisconsin_addresses import request
URL='https://services.arcgis.com/RmCCgQtiZLDCtblq/arcgis/rest/services/eGIS_Addressing_ADDRESS_POINTSv2/FeatureServer'
LAYER=URL+'/0';ITEM='ed1937ab15214b5d937ef4fe4cb55f44'
FIELDS={**{k:'esriFieldTypeString' for k in ('Number','NumPrefix','NumberSuffix','NumSuffix','FullName','FullAddress','ZipCode','LegalComm','PostComm1','PostComm2','PostComm3','BldgID','BldgType','BldgName','FlrType','FlrName','UnitType','UnitName','Source','SourceID','UniqueID')},'OBJECTID':'esriFieldTypeOID','UpdateDate':'esriFieldTypeDate'}
def metadata(fetch=request):
    s=fetch(URL,{'f':'json'});l=fetch(LAYER,{'f':'json'})
    if s.get('serviceItemId')!=ITEM or not any(x.get('id')==0 and x.get('name')=='CAMS_ADDRESS_POINTS' for x in s.get('layers',[])):raise ValueError('Unexpected LA County service')
    if l.get('id')!=0 or l.get('name')!='CAMS_ADDRESS_POINTS' or l.get('objectIdField')!='OBJECTID' or l.get('geometryType')!='esriGeometryPoint' or 'County of Los Angeles' not in l.get('copyrightText',''):raise ValueError('Unexpected LA County layer')
    fields=l.get('fields',[]);k={x['name']:x['type'] for x in fields}
    if len(k)!=len(fields) or any(k.get(n)!=t for n,t in FIELDS.items()):raise ValueError('Unreviewed CAMS schema')
    return {'serviceItemId':ITEM,'fields':FIELDS,'lastEditDate':(l.get('editingInfo') or {}).get('lastEditDate')}
def number(a):
    if not physical(a) or not re.fullmatch(r'\d{5}',a['zip']):return None
    m=re.match(r'^([1-9]\d{0,5})\s+\S',a['street'])
    return m.group(1) if m else None
def scope(e):
    return e['state']=='CA' and e['status'] in ('no-match','unavailable') and e.get('sourceCounty') in ('06037','',None)
def query(batch):
    if not 1<=len(batch)<=8 or any(a['state']!='CA' or not number(a) for a in batch):raise ValueError('Invalid query batch')
    clauses=sorted({f"(Number={sql(number(a))} AND ZipCode={sql(a['zip'])})" for a in batch})
    return {'f':'json','where':' OR '.join(clauses),'outFields':','.join(FIELDS),'returnGeometry':'true','outSR':'4326','resultRecordCount':2000}
def features(payload):
    rows=payload.get('features');sr=payload.get('spatialReference') or {}
    if not isinstance(rows,list) or len(rows)>=2000 or payload.get('exceededTransferLimit') or rows and 4326 not in (sr.get('wkid'),sr.get('latestWkid')):raise ValueError('Incomplete or invalid CAMS response')
    seen=set()
    for f in rows:
        a=f.get('attributes');g=f.get('geometry')
        if not isinstance(a,dict) or not isinstance(g,dict) or not set(FIELDS)<=set(a):raise ValueError('Missing CAMS fields')
        oid=a['OBJECTID']
        if type(oid) is not int or not 0<oid<=9007199254740991 or oid in seen:raise ValueError('Invalid native object ID')
        seen.add(oid)
    return rows
def clean(v):return isinstance(v,str) and bool(v.strip()) and len(v)<=150 and not re.search(r'[\x00-\x1f\x7f]',v)
def review(e,rows,checked):
    a=e['address'];hits=[];ids=set();reasons=set()
    for f in rows:
        v=f['attributes'];g=f['geometry']
        if v['Number']!=number(a) or v['ZipCode']!=a['zip'] or not clean(v['FullName']):continue
        street=v['Number']+' '+v['FullName']
        cities=[v[k] for k in ('LegalComm','PostComm1','PostComm2','PostComm3') if clean(v[k])]
        matching=[city for city in cities if match_address(a,f"{street}, {city}, CA, {v['ZipCode']}")]
        if not matching:continue
        ids.add(v['OBJECTID'])
        if any(v[k] not in (None,'') for k in ('NumPrefix','NumberSuffix','NumSuffix','BldgID','BldgType','BldgName','FlrType','FlrName','UnitType','UnitName')) or base_street(a['street'])!=a['street'].strip():reasons.add('subaddress_or_complex_number');continue
        if not clean(v['FullAddress']) or normal_street(v['FullAddress'])!=normal_street(street):reasons.add('full_address_disagreement');continue
        if not clean(v['Source']) or not clean(v['SourceID']) or not clean(v['UniqueID']):reasons.add('source_identity_missing');continue
        lat,lon=g.get('y'),g.get('x')
        if any(type(x) not in (float,int) or not math.isfinite(x) for x in (lat,lon)) or not 32.7<=lat<=34.9 or not -119.0<=lon<=-117.5:reasons.add('coordinate_outside_county_envelope');continue
        try:
            d=v['UpdateDate']
            if type(d) not in (int,float) or not math.isfinite(d) or d<=0:raise ValueError()
            updated=datetime.datetime.fromtimestamp(d/1000,datetime.timezone.utc).date().isoformat()
            if updated>checked:raise ValueError()
        except (ValueError,OverflowError,OSError):reasons.add('missing_or_invalid_update_date');continue
        hits.append({'sourceKey':e['key'],'objectId':v['OBJECTID'],'matchedAddress':f"{street}, {matching[0]}, CA, {v['ZipCode']}",'latitude':lat,'longitude':lon,'sourceCountyScope':'06037','registryCountyAsReported':e.get('sourceCounty') or None,'countyVerified':False,'sourceAsReported':v['Source'],'sourceIdAsReported':v['SourceID'],'uniqueIdAsReported':v['UniqueID'],'recordUpdatedAt':updated,'placementAsReported':None,'cityBasis':'legal-community' if matching[0]==v['LegalComm'] else 'ZIP-associated postal community','endUserValidationRequired':True,'publicationEligible':False})
    if len(ids)>1:reasons.add('multiple_exact_objects')
    status='review' if reasons else 'candidate' if len(hits)==1 else 'noMatch'
    return (hits[0] if status=='candidate' else None),{'sourceKey':e['key'],'status':status,'exactObjectIds':sorted(ids),'reasons':sorted(reasons or ({'no_exact_address'} if status=='noMatch' else set()))}
def acquire(entries,checked,fetch=request,max_requests=120,delay=1):
    version=metadata(fetch);groups=collections.defaultdict(list);diagnostics=[];candidates=[];requests=0
    for e in sorted(filter(scope,entries),key=lambda x:x['key']):
        a=e['address']
        if not number(a):diagnostics.append({'sourceKey':e['key'],'status':'unsupported','reasons':['unsupported_address_format'],'exactObjectIds':[]});continue
        groups[(a['zip'],number(a))].append(e)
    values=[groups[k] for k in sorted(groups,key=lambda k:(not any(e.get('sourceCounty')=='06037' for e in groups[k]),k))]
    for i in range(0,len(values),8):
        batch=values[i:i+8];es=[e for g in batch for e in g]
        if requests>=max_requests:status='notAttempted'
        else:
            requests+=1
            try:
                rows=features(fetch(LAYER+'/query',query([g[0]['address'] for g in batch])))
                for e in es:
                    hit,d=review(e,rows,checked);diagnostics.append(d)
                    if hit:candidates.append(hit)
                time.sleep(delay);continue
            except (OSError,ValueError,TypeError,KeyError,TimeoutError):status='unavailable'
        diagnostics.extend({'sourceKey':e['key'],'status':status,'reasons':['request_limit' if status=='notAttempted' else 'source_request_failure'],'exactObjectIds':[]} for e in es)
    if metadata(fetch)!=version:raise ValueError('Source changed during acquisition')
    if len({d['sourceKey'] for d in diagnostics})!=len(diagnostics):raise ValueError('Duplicate source identity')
    return {'schemaVersion':1,'sourceUrl':LAYER,'sourceMetadata':version,'checkedAt':checked,'publication':'review-only','requests':requests,'counts':dict(collections.Counter(d['status'] for d in diagnostics)),'candidates':candidates,'diagnostics':diagnostics,'limitations':'LA County CAMS source scope; postal city labels derived from ZIP, no independent county boundary or operational station validation. No map publication.'}
def main():
    p=argparse.ArgumentParser();p.add_argument('--output',type=pathlib.Path,required=True);p.add_argument('--max-requests',type=int,default=120);a=p.parse_args()
    if not 1<=a.max_requests<=120:raise ValueError('Request budget')
    loc=PUBLIC/'locations';m,rows=read_registry();fl=json.loads((PUBLIC/'state-ems/FL.json').read_bytes());verify(loc,m,rows,fl)
    raw=(loc/'index.json').read_bytes();idx=json.loads(raw)
    entries=[e for c in idx['chunks'] if c['state']=='CA' for e in json.loads((loc/c['file']).read_bytes())]
    report=acquire(entries,datetime.datetime.now(datetime.timezone.utc).date().isoformat(),max_requests=a.max_requests)
    report['locationManifestSha256']=sha(raw);a.output.mkdir(parents=True,exist_ok=True);(a.output/'california-la-address-review.json').write_text(json.dumps(report,indent=2)+'\n')
    print('California LA address review:',json.dumps({k:report[k] for k in ('requests','counts')}))
    if report['counts'].get('unavailable') or report['counts'].get('notAttempted'):raise ValueError('Incomplete LA acquisition')
if __name__=='__main__':main()
