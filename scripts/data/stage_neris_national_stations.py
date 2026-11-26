#!/usr/bin/env python3
"""Nationwide public NERIS department/station evidence, independently of state registries."""
import argparse,collections,datetime,json,math,pathlib,re,time
from stage_neris_stations import BASE,request,clean,native,reconcile
from backfill_provider_locations import STATES,sha
ITEM='0ac459746be44023a1b33ba00bb5f628'
REFERENCE='https://www.usfa.fema.gov/neris/public/'
COMMON=('OBJECTID','neris_id','address_line_1','address_line_2','city','state','zip_code','export_date')
DEPT=COMMON+('name','station_count','department_type','entity_type')
STATION=COMMON+('station_name','department_neris_id','department_name')
def metadata(layer,fetch):
    m=fetch(layer,{'f':'json'},False)
    fields=DEPT if layer==0 else STATION
    kinds={'OBJECTID':'esriFieldTypeOID','export_date':'esriFieldTypeDate','station_count':'esriFieldTypeSmallInteger'}
    expected={f:kinds.get(f,'esriFieldTypeString') for f in fields}
    actual={f['name']:f['type'] for f in m.get('fields',[])}
    date=(m.get('editingInfo') or {}).get('lastEditDate')
    if m.get('id')!=layer or m.get('serviceItemId')!=ITEM or m.get('name')!=('Department' if layer==0 else 'Station') or m.get('objectIdField')!='OBJECTID' or m.get('geometryType')!='esriGeometryPoint' or type(date) is not int or any(actual.get(k)!=v for k,v in expected.items()):raise ValueError('Unexpected NERIS source identity or schema')
    rel=[v for v in m.get('relationships',[]) if v.get('relatedTableId')==1-layer and v.get('name')=='Department_Station']
    if len(rel)!=1 or rel[0].get('keyField')!=('neris_id' if layer==0 else 'department_neris_id'):raise ValueError('Native department/station relationship changed')
    return {'id':layer,'name':m['name'],'serviceItemId':ITEM,'lastEditDate':date,'fields':expected}
def inventory(layer,fetch):
    count=fetch(layer,{'f':'json','where':'1=1','returnCountOnly':'true'}).get('count')
    p=fetch(layer,{'f':'json','where':'1=1','returnIdsOnly':'true'})
    ids=p.get('objectIds')
    if type(count) is not int or not 0<count<=150000 or p.get('objectIdFieldName')!='OBJECTID' or not isinstance(ids,list) or len(ids)!=count or any(type(i) is not int or not 0<i<=9007199254740991 for i in ids) or len(set(ids))!=count:raise ValueError('Incomplete source object inventory')
    return sorted(ids)
# Never repair identifiers or jurisdiction codes. Normalize only display text
# with ordinary layout whitespace. Record every change without retaining unsafe text.
EXACT_TEXT={'neris_id','department_neris_id','state','zip_code'}
def source_value(v,kind,field):
    if v is None:return None,None
    if kind in ('esriFieldTypeOID','esriFieldTypeDate','esriFieldTypeSmallInteger'):
        if type(v) is not int or abs(v)>9007199254740991:return None,'invalid-number-withheld'
        return v,None
    if not isinstance(v,str):return None,'non-string-withheld'
    if len(v)>255:return None,'oversize-text-withheld'
    if re.search(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]',v):return None,'unsafe-text-withheld'
    if re.search(r'[\t\r\n]',v):
        if field in EXACT_TEXT:return None,'malformed-native-field-withheld'
        return re.sub(r'\s+',' ',v).strip(),'layout-whitespace-normalized'
    return v,None
def issue(field,reason,value):
    return {'field':field,'reason':reason,'sourceValueSha256':sha(json.dumps(value,sort_keys=True,ensure_ascii=True,separators=(',',':')).encode())}
def coordinate(g):
    if g is None:return None
    if not isinstance(g,dict):raise ValueError('Unexpected geometry')
    x,y=g.get('x'),g.get('y')
    if x is None and y is None:return None
    if any(type(v) not in (float,int) or not math.isfinite(v) for v in (x,y)) or abs(x)>180 or abs(y)>90:raise ValueError('Invalid source coordinate')
    return None if x==y==0 else {'x':x,'y':y}
def batch(layer,p,ids,fields):
    fs=p.get('features');sr=p.get('spatialReference') or {}
    if not isinstance(fs,list) or len(fs)!=len(ids) or p.get('exceededTransferLimit') or 4326 not in (sr.get('wkid'),sr.get('latestWkid')):raise ValueError('Incomplete or unreviewed NERIS batch')
    rows={}
    for f in fs:
        a=f.get('attributes')
        if not isinstance(a,dict) or set(a)!=set(fields):raise ValueError('Unexpected source row fields')
        oid=a['OBJECTID']
        if type(oid) is not int or oid not in ids or oid in rows:raise ValueError('Invalid object membership')
        attrs={};issues=[]
        for k,v in fields.items():
            attrs[k],reason=source_value(a[k],v,k)
            if reason:issues.append(issue(k,reason,a[k]))
        try:g=coordinate(f.get('geometry'))
        except ValueError:
            g=None;issues.append(issue('geometry','invalid-coordinate-withheld',f.get('geometry')))
        rows[oid]={'attributes':attrs,'geometry':g}
        if issues:rows[oid]['sourceFieldIssues']=issues
    if set(rows)!=set(ids):raise ValueError('Missing source objects')
    return rows
def collect(layer,ids,meta,fetch,delay):
    out={};fields=meta['fields']
    for i in range(0,len(ids),200):
        group=ids[i:i+200]
        p=fetch(layer,{'f':'json','objectIds':','.join(map(str,group)),'outFields':','.join(fields),'returnGeometry':'true','outSR':'4326'})
        out.update(batch(layer,p,group,fields))
        if delay:time.sleep(delay)
    return [out[k] for k in ids]
def build(departments,stations):
    result=reconcile(departments,stations,STATES)
    parents={p['departmentId']:p for p in result['departments']}
    accepted={s['stationId']:s for s in result['stations']}
    ds={f['attributes']['neris_id']:f for f in departments if f['attributes']['neris_id'] in parents}
    ss={f['attributes']['neris_id']:f for f in stations if f['attributes']['neris_id'] in accepted}
    for key,p in parents.items():
        a=ds[key]['attributes']
        p.update(sourceObjectId=a['OBJECTID'],sourceExportDate=a['export_date'],headquartersAddressAsReported={k:a[k] for k in ('address_line_1','address_line_2','city','state','zip_code')},departmentTypeAsReported=a['department_type'],entityTypeAsReported=a['entity_type'],headquartersGeometryAsReported=ds[key]['geometry'],endUserValidationRequired=True,publicationEligible=False)
    for key,s in accepted.items():
        a=ss[key]['attributes']
        p=parents[s['departmentId']]
        s.update(sourceObjectId=a['OBJECTID'],sourceExportDate=a['export_date'],parentName=p['name'],parentNameAsReported=a['department_name'],parentNameConflict=bool(clean(a['department_name']) and clean(a['department_name']).casefold()!=p['name'].casefold()),publicationEligible=False)
    coordinates=collections.Counter((s['coordinates']['latitude'],s['coordinates']['longitude']) for s in accepted.values() if s['coordinates'])
    for s in accepted.values():
        p=s['coordinates'];s['sharedSourcePoint']=bool(p and coordinates[(p['latitude'],p['longitude'])]>1)
    result['summary'].update(distinctStationSourcePoints=len(coordinates),sharedStationCoordinateRows=sum(s['sharedSourcePoint'] for s in accepted.values()),parentNameConflicts=sum(s['parentNameConflict'] for s in accepted.values()),departmentsWithStationRows=len({s['departmentId'] for s in accepted.values()}),stationAddressStates=dict(sorted(collections.Counter(s['stationState'] for s in accepted.values()).items())))
    # All native objects are accounted for, even when not usable in the review catalog.
    # Individual row errors cannot discard an otherwise complete source acquisition.
    audit=[]
    for layer,features,selected in ((0,departments,ds),(1,stations,ss)):
        selected_oids={f['attributes']['OBJECTID'] for f in selected.values()}
        for f in features:
            oid=f['attributes']['OBJECTID'];issues=f.get('sourceFieldIssues',[])
            if issues or oid not in selected_oids:
                audit.append({'layer':layer,'sourceObjectId':oid,'disposition':'retained' if oid in selected_oids else 'withheld','fieldIssues':issues})
    result['sourceObjectAudit']=sorted(audit,key=lambda x:(x['layer'],x['sourceObjectId']))
    result['summary'].update(sourceObjectsWithFieldIssues=sum(bool(r['fieldIssues']) for r in audit),sourceFieldIssueCounts=dict(sorted(collections.Counter(i['reason'] for r in audit for i in r['fieldIssues']).items())),withheldObjectAuditRows=sum(r['disposition']=='withheld' for r in audit))
    if result['summary']['withheldObjectAuditRows']!=result['summary']['withheldDepartments']+result['summary']['withheldStations']:raise ValueError('Withheld source membership accounting mismatch')
    return result
def acquire(fetch=request,delay=.25):
    before=[metadata(i,fetch) for i in (0,1)]
    ids=[inventory(i,fetch) for i in (0,1)]
    departments,stations=[collect(i,ids[i],before[i],fetch,delay) for i in (0,1)]
    if before!=[metadata(i,fetch) for i in (0,1)] or ids!=[inventory(i,fetch) for i in (0,1)]:raise ValueError('NERIS source changed during nationwide acquisition')
    result=build(departments,stations)
    if not result['summary']['eligibleDepartments'] or not result['summary']['eligibleStations']:raise ValueError('No usable source membership')
    return {'schemaVersion':1,'source':'NERIS','sourceUrl':BASE,'referenceUrl':REFERENCE,'retrievedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceLayerMetadata':before,'departmentStateScope':sorted(STATES),'publication':'review-only','verifiedStations':0,'newMapped':0,'limitations':'Full public source inventory, 50 states and DC accepted scope. NERIS identifiers are native source identifiers; no automatic USFA/NPPES linkage. Coordinates as reported; station operations require user validation. Not a census of all active fire services.',**result}
def main():
    p=argparse.ArgumentParser();p.add_argument('--output',type=pathlib.Path,required=True);a=p.parse_args()
    report=acquire()
    a.output.mkdir(parents=True,exist_ok=False)
    raw=(json.dumps(report,ensure_ascii=True,sort_keys=True,separators=(',',':'),allow_nan=False)+'\n').encode()
    (a.output/'neris-national-stations.json').write_bytes(raw)
    (a.output/'summary.json').write_text(json.dumps({'sha256':sha(raw),'retrievedAt':report['retrievedAt'],'summary':report['summary']},indent=2)+'\n')
    print('NERIS national acquisition:',json.dumps(report['summary']),flush=True)
if __name__=='__main__':main()
