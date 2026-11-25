#!/usr/bin/env python3
"""Virginia official address-point acquisition. Review artifacts only, no snapshot changes."""
import argparse, collections, datetime, json, math, pathlib, re, time, urllib.parse, urllib.request
from backfill_provider_locations import PUBLIC, ROOT, read_registry, verify, physical, match_address, sha
from recover_nad_locations import NoRedirect, county_index, county_key, sql

URL='https://dsfmportal.dcr.virginia.gov/server/rest/services/CivilReference/Civil_Reference_Layers/MapServer/1'
ITEM='08368f90d6b648f0b9e6d1671300dbb6'
FIELDS={'OBJECTID':'esriFieldTypeOID','ADDRNUM':'esriFieldTypeString','PREADDRNUM':'esriFieldTypeString','ADDRNUMSUF':'esriFieldTypeString','UNITTYPE':'esriFieldTypeString','UNITID':'esriFieldTypeString','FULLADDR':'esriFieldTypeString','PO_NAME':'esriFieldTypeString','STATE':'esriFieldTypeString','ZIP_5':'esriFieldTypeInteger','FIPS':'esriFieldTypeString','MUNICIPALITY':'esriFieldTypeString','POINTTYPE':'esriFieldTypeString','CAPTUREMETH':'esriFieldTypeString','STATUS':'esriFieldTypeString','LASTUPDATE':'esriFieldTypeDate'}
def request(params,query=False):
    url=URL+('/query' if query else '')+'?'+urllib.parse.urlencode(params)
    if len(url)>3800:raise ValueError('Query budget exceeded')
    req=urllib.request.Request(url,headers={'Accept':'application/json','User-Agent':'ATLAS public organization address review/1.0'})
    with urllib.request.build_opener(NoRedirect()).open(req,timeout=35) as res:raw=res.read(4_000_001)
    if len(raw)>4_000_000:raise ValueError('Response too large')
    obj=json.loads(raw)
    if not isinstance(obj,dict) or 'error' in obj:raise ValueError('GIS source returned error')
    return obj
def metadata(fetch):
    m=fetch({'f':'json'})
    if m.get('serviceItemId')!=ITEM or m.get('name')!='Address_Points' or m.get('geometryType')!='esriGeometryPoint' or 'Virginia Geographic Information Network (VGIN)' not in m.get('copyrightText',''):raise ValueError('Virginia source identity changed')
    fields={x['name']:x.get('type') for x in m['fields']}
    if any(fields.get(k)!=v for k,v in FIELDS.items()):raise ValueError('Virginia source schema changed')
    return {'serviceItemId':ITEM,'fields':FIELDS,'lastEditDate':(m.get('editingInfo') or {}).get('lastEditDate')}
def number(a):
    if not physical(a):return None
    m=re.match(r'^(\d{1,6})\s+\S',a['street'])
    return m.group(1) if m else None
def query(batch):
    if not 1<=len(batch)<=8 or any(a['state']!='VA' or not number(a) or not re.fullmatch(r'\d{5}',a['zip']) for a in batch):raise ValueError('Invalid Virginia query batch')
    clauses=sorted({f"(ADDRNUM={sql(number(a))} AND ZIP_5={int(a['zip'])})" for a in batch})
    return {'f':'json','where':"STATE='VA' AND ("+' OR '.join(clauses)+')','outFields':','.join(FIELDS),'returnGeometry':'true','outSR':'4326','resultRecordCount':1000}
def features(obj):
    rows=obj.get('features')
    if not isinstance(rows,list) or len(rows)>=1000 or obj.get('exceededTransferLimit'):raise ValueError('Incomplete source response')
    sr=obj.get('spatialReference') or {}
    if rows and 4326 not in (sr.get('wkid'),sr.get('latestWkid')):raise ValueError('Unexpected spatial reference')
    seen=set()
    for row in rows:
        if not isinstance(row,dict) or not isinstance(row.get('attributes'),dict) or not isinstance(row.get('geometry'),dict):raise ValueError('Invalid feature')
        oid=row['attributes'].get('OBJECTID')
        if type(oid) is not int or not 0<oid<=9007199254740991 or oid in seen:raise ValueError('Invalid point ID')
        seen.add(oid)
    return rows
def review(e,rows,counties,checked):
    a=e['address'];hits=[];blocked=False
    for f in rows:
        v=f['attributes'];g=f['geometry']
        if v.get('STATE')!='VA' or type(v.get('ZIP_5')) is not int or str(v['ZIP_5']).zfill(5)!=a['zip']:continue
        if not isinstance(v.get('FULLADDR'),str) or not isinstance(v.get('PO_NAME'),str):continue
        matched=f"{v['FULLADDR']}, {v['PO_NAME']}, VA, {a['zip']}"
        if not match_address(a,matched):continue
        # Preserve literal status/type; no assumptions about undocumented domain values.
        if any(v.get(k) not in ('',None) for k in ('PREADDRNUM','ADDRNUMSUF','UNITTYPE','UNITID')):continue
        if v.get('ADDRNUM')!=number(a):continue
        cf=v.get('FIPS');name=v.get('MUNICIPALITY')
        if not isinstance(cf,str) or not re.fullmatch(r'51\d{3}',cf) or not isinstance(name,str) or counties.get(('VA',county_key(name)),set())!={cf} or e.get('sourceCounty') and e['sourceCounty']!=cf:
            blocked=True;continue
        lat,lon=g.get('y'),g.get('x')
        if type(lat) not in (int,float) or type(lon) not in (int,float) or not math.isfinite(lat) or not math.isfinite(lon) or not 36.4<=lat<=39.6 or not -83.8<=lon<=-75.0:
            blocked=True;continue
        date=v.get('LASTUPDATE')
        try:
            if date is None:updated=None
            elif type(date) in (int,float) and math.isfinite(date) and date>0:updated=datetime.datetime.fromtimestamp(date/1000,datetime.timezone.utc).date().isoformat()
            else:raise ValueError('Invalid date')
            if updated and updated>checked:raise ValueError('Future date')
        except (ValueError,OverflowError,OSError):blocked=True;continue
        labels=[v.get(k) for k in ('POINTTYPE','CAPTUREMETH','STATUS')]
        if any(x is not None and (not isinstance(x,str) or len(x)>30 or re.search(r'[\x00-\x1f\x7f]',x)) for x in labels):blocked=True;continue
        hits.append({'sourceKey':e['key'],'objectId':v['OBJECTID'],'matchedAddress':matched,'countyFips':cf,'latitude':lat,'longitude':lon,'pointType':labels[0],'captureMethod':labels[1],'statusAsReported':labels[2],'recordUpdatedAt':updated,'endUserValidationRequired':True})
    if blocked or len(hits)>1:return None,'review'
    if not hits:return None,'noMatch'
    # All exact matches remain review-only, including their lifecycle/placement labels.
    return hits[0],'candidate'
def acquire(entries,counties,checked,fetch=request,max_requests=120,delay=1):
    version=metadata(fetch);stats=collections.Counter();groups=collections.defaultdict(list);candidates=[];requests=0
    for e in entries:
        if e['state']!='VA' or e['status'] not in ('no-match','unavailable'):continue
        a=e['address']
        if not number(a) or not re.fullmatch(r'\d{5}',a['zip']):stats['unsupported']+=1;continue
        groups[(a['street'],a['city'],a['zip'])].append(e)
    values=[groups[k] for k in sorted(groups)];errors=0
    for i in range(0,len(values),8):
        batch=values[i:i+8]
        if requests>=max_requests or errors>=3:stats['notAttempted']+=sum(map(len,batch));continue
        requests+=1
        try:rows=features(fetch(query([g[0]['address'] for g in batch]),True));errors=0
        except (OSError,ValueError,TypeError,KeyError,TimeoutError):errors+=1;stats['unavailable']+=sum(map(len,batch));continue
        for group in batch:
            for e in group:
                hit,status=review(e,rows,counties,checked);stats[status]+=1
                if hit:candidates.append(hit)
        time.sleep(delay)
    if metadata(fetch)!=version:raise ValueError('Source metadata changed during acquisition')
    return {'schemaVersion':1,'sourceUrl':URL,'sourceMetadata':version,'checkedAt':checked,'sourceScope':'Unmatched Virginia public provider source addresses; not confirmed operational stations','requests':requests,'counts':dict(stats),'candidates':sorted(candidates,key=lambda c:c['sourceKey']),'publication':'review-only'}
def main():
    p=argparse.ArgumentParser();p.add_argument('--output',type=pathlib.Path,required=True);p.add_argument('--max-requests',type=int,default=120);args=p.parse_args()
    if not 1<=args.max_requests<=120:raise ValueError('Invalid request budget')
    manifest,rows=read_registry();loc=PUBLIC/'locations';fl=json.loads((PUBLIC/'state-ems/FL.json').read_bytes());verify(loc,manifest,rows,fl)
    raw=(loc/'index.json').read_bytes();idx=json.loads(raw)
    entries=[e for c in idx['chunks'] if c['state']=='VA' for e in json.loads((loc/c['file']).read_bytes())] if all('state' in c for c in idx['chunks']) else [e for c in idx['chunks'] for e in json.loads((loc/c['file']).read_bytes()) if e['state']=='VA']
    counties=county_index(json.loads((ROOT/'scripts/fixtures/census-2026-county-identities.json').read_text())['counties'])
    report=acquire(entries,counties,datetime.datetime.now(datetime.timezone.utc).date().isoformat(),max_requests=args.max_requests)
    report['locationManifestSha256']=sha(raw);args.output.mkdir(parents=True,exist_ok=True)
    (args.output/'virginia-address-review.json').write_text(json.dumps(report,indent=2)+'\n')
    print('Virginia address review:',json.dumps({'requests':report['requests'],'counts':report['counts']}))
    if report['counts'].get('unavailable') or report['counts'].get('notAttempted'):raise ValueError('Acquisition incomplete; partial artifact available for review')
if __name__=='__main__':main()
