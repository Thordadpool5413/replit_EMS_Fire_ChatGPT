#!/usr/bin/env python3
"""Bounded MnGeo public address research. No writes to provider snapshots."""
import argparse, collections, datetime, json, math, pathlib, re, time
from backfill_provider_locations import PUBLIC, ROOT, read_registry, verify, physical, match_address, sha
from recover_nad_locations import county_index, county_key, sql
from stage_wisconsin_addresses import request, date
URL='https://enterprise.gisdata.mn.gov/aghost/rest/services/us_mn_state_mngeo/loc_addresses_open/FeatureServer/0'
ITEM='39e1d5e08885476c82adcad9896681b6'
STREET=('st_pre_mod','st_pre_dir','st_pre_typ','st_pre_sep','st_name','st_pos_typ','st_pos_dir','st_pos_mod')
SUB=('anumberpre','anumbersuf','sub_type1','sub_id1','sub_type2','sub_id2')
FIELDS={**{k:'esriFieldTypeString' for k in (*STREET,*SUB,'add_id','zip','postcomm','co_code','co_name','state_code','place_loc','status','source','aauthority','verror_911')},**{k:'esriFieldTypeDate' for k in ('eff_date','ret_date','edit_date')},'anumber':'esriFieldTypeInteger','objectid':'esriFieldTypeOID'}
def metadata(fetch):
    m=fetch(URL,{'f':'json'})
    if m.get('serviceItemId')!=ITEM or m.get('name')!='Loc Addresses Open' or m.get('id')!=0 or m.get('geometryType')!='esriGeometryPoint' or m.get('objectIdField')!='objectid':raise ValueError('MnGeo layer identity changed')
    fs=m.get('fields',[]);types={f['name']:f.get('type') for f in fs}
    if len(types)!=len(fs) or any(types.get(k)!=v for k,v in FIELDS.items()):raise ValueError('MnGeo address schema changed')
    return {'serviceItemId':ITEM,'fields':FIELDS,'lastEditDate':(m.get('editingInfo') or {}).get('lastEditDate')}
def number(a):
    if not physical(a):return None
    m=re.match(r'^([1-9]\d{0,5})\s+\S',a['street'])
    return int(m.group(1)) if m else None
def query(batch):
    if not 1<=len(batch)<=8 or any(a['state']!='MN' or not number(a) or not re.fullmatch(r'\d{5}',a['zip']) for a in batch):raise ValueError('Invalid Minnesota address query')
    clauses=sorted({f"(anumber={number(a)} AND zip={sql(a['zip'])})" for a in batch})
    return {'f':'json','where':"state_code='MN' AND ("+' OR '.join(clauses)+')','outFields':','.join(FIELDS),'returnGeometry':'true','outSR':'4326','resultRecordCount':1000}
def features(payload):
    rows=payload.get('features');sr=payload.get('spatialReference') or {}
    if not isinstance(rows,list) or len(rows)>=1000 or payload.get('exceededTransferLimit') or rows and 4326 not in (sr.get('wkid'),sr.get('latestWkid')):raise ValueError('Incomplete or invalid point response')
    ids=set()
    for f in rows:
        a=f.get('attributes');g=f.get('geometry')
        if not isinstance(a,dict) or not isinstance(g,dict) or not set(FIELDS)<=set(a):raise ValueError('Incomplete source row')
        oid=a['objectid']
        if type(oid) is not int or not 0<oid<=9007199254740991 or oid in ids:raise ValueError('Invalid source object ID')
        ids.add(oid)
    return rows
def review(e,rows,counties,checked):
    a=e['address'];hits=[];reasons=set();ids=set()
    for f in rows:
        v=f['attributes'];g=f['geometry']
        if v['state_code']!='MN' or v['zip']!=a['zip'] or v['anumber']!=number(a):continue
        parts=[v[k] for k in STREET]
        if any(p is not None and not isinstance(p,str) for p in parts) or not v['st_name'] or not isinstance(v['postcomm'],str):continue
        matched=str(v['anumber'])+' '+' '.join(p.strip() for p in parts if p and p.strip())+', '+v['postcomm']+', MN, '+a['zip']
        if not match_address(a,matched):continue
        ids.add(v['objectid'])
        if any(v[k] not in (None,'') for k in SUB):reasons.add('subaddress');continue
        cf=v['co_code'];cn=v['co_name']
        if not isinstance(cf,str) or not re.fullmatch(r'27\d{3}',cf) or not isinstance(cn,str) or counties.get(('MN',county_key(cn)),set())!={cf} or e.get('sourceCounty') and e['sourceCounty']!=cf:reasons.add('county_conflict');continue
        try:
            effective,retired,updated=(date(v[k]) for k in ('eff_date','ret_date','edit_date'))
            if effective and effective>checked or retired and retired<=checked or updated and updated>checked:raise ValueError('Date outside validity')
        except (ValueError,OverflowError,OSError):reasons.add('date_conflict');continue
        lat,lon=g.get('y'),g.get('x')
        if type(lat) not in (int,float) or type(lon) not in (int,float) or not math.isfinite(lat) or not math.isfinite(lon) or not 43.4<=lat<=49.5 or not -97.3<=lon<=-89.4:reasons.add('coordinate_conflict');continue
        provenance={k:v[k] for k in ('add_id','place_loc','status','source','aauthority','verror_911')}
        if any(x is not None and (not isinstance(x,str) or len(x)>254 or re.search(r'[\x00-\x1f\x7f]',x)) for x in provenance.values()):reasons.add('invalid_source_metadata');continue
        if not provenance['add_id'] or not provenance['aauthority']:reasons.add('missing_source_authority');continue
        # Preserve literal placement, lifecycle and validation codes for review. Never infer a building or active station.
        hits.append({'sourceKey':e['key'],'objectId':v['objectid'],'matchedAddress':matched,'countyFips':cf,'latitude':lat,'longitude':lon,'recordUpdatedAt':updated,'sourceAttributes':provenance,'endUserValidationRequired':True})
    if len(hits)>1:reasons.add('multiple_points')
    status='review' if reasons or len(hits)>1 else 'candidate' if hits else 'noMatch'
    return (hits[0] if status=='candidate' else None),{'sourceKey':e['key'],'status':status,'reasons':sorted(reasons or ({'no_exact_address'} if status=='noMatch' else set())),'exactObjectIds':sorted(ids)}
def acquire(entries,counties,checked,fetch=request,max_requests=120,delay=1):
    version=metadata(fetch);groups=collections.defaultdict(list);diagnostics=[];candidates=[];requests=0;errors=0
    def mark(e,status,reason):diagnostics.append({'sourceKey':e['key'],'status':status,'reasons':[reason],'exactObjectIds':[]})
    for e in entries:
        if e['state']!='MN' or e['status'] not in ('no-match','unavailable'):continue
        a=e['address']
        if not number(a) or not re.fullmatch(r'\d{5}',a['zip']):mark(e,'unsupported','unsupported_address_format');continue
        groups[(a['street'],a['city'],a['zip'])].append(e)
    values=[groups[k] for k in sorted(groups)]
    for i in range(0,len(values),8):
        batch=values[i:i+8]
        if requests>=max_requests or errors>=3:
            for group in batch:
                for e in group:mark(e,'notAttempted','request_limit')
            continue
        requests+=1
        try:rows=features(fetch(URL+'/query',query([g[0]['address'] for g in batch])));errors=0
        except (OSError,ValueError,TypeError,KeyError,TimeoutError):
            errors+=1
            for group in batch:
                for e in group:mark(e,'unavailable','source_request_failure')
            continue
        for group in batch:
            for e in group:
                hit,d=review(e,rows,counties,checked);diagnostics.append(d)
                if hit:candidates.append(hit)
        time.sleep(delay)
    if metadata(fetch)!=version:raise ValueError('MnGeo source changed during acquisition')
    if len({d['sourceKey'] for d in diagnostics})!=len(diagnostics):raise ValueError('Duplicate diagnostic identity')
    return {'schemaVersion':1,'sourceUrl':URL,'sourceMetadata':version,'checkedAt':checked,'publication':'review-only','requests':requests,'counts':dict(collections.Counter(d['status'] for d in diagnostics)),'reasonCounts':dict(collections.Counter(r for d in diagnostics for r in d['reasons'])),'candidates':sorted(candidates,key=lambda c:c['sourceKey']),'diagnostics':sorted(diagnostics,key=lambda d:d['sourceKey']),'limitations':'Opt-in counties only; placement and lifecycle codes need independent review; no operational station claim.'}
def main():
    p=argparse.ArgumentParser();p.add_argument('--output',type=pathlib.Path,required=True);p.add_argument('--max-requests',type=int,default=120);args=p.parse_args()
    if not 1<=args.max_requests<=120:raise ValueError('Invalid request budget')
    manifest,rows=read_registry();loc=PUBLIC/'locations';fl=json.loads((PUBLIC/'state-ems/FL.json').read_bytes());verify(loc,manifest,rows,fl)
    raw=(loc/'index.json').read_bytes();idx=json.loads(raw)
    entries=[e for c in idx['chunks'] if c['state']=='MN' for e in json.loads((loc/c['file']).read_bytes())]
    counties=county_index(json.loads((ROOT/'scripts/fixtures/census-2026-county-identities.json').read_text())['counties'])
    report=acquire(entries,counties,datetime.datetime.now(datetime.timezone.utc).date().isoformat(),max_requests=args.max_requests)
    report['locationManifestSha256']=sha(raw);args.output.mkdir(parents=True,exist_ok=True)
    (args.output/'minnesota-address-review.json').write_text(json.dumps(report,indent=2)+'\n')
    print('Minnesota address review:',json.dumps({k:report[k] for k in ('requests','counts','reasonCounts')}))
    if report['counts'].get('unavailable') or report['counts'].get('notAttempted'):raise ValueError('Incomplete acquisition; review artifact only')
if __name__=='__main__':main()
