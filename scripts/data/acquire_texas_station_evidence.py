#!/usr/bin/env python3
"""Acquire the official September 2025 Texas EMS station-labeled map layer as historical evidence."""
import argparse,collections,datetime,json,math,pathlib,re,time
from backfill_provider_locations import PUBLIC,sha,name_key,normal_street,physical,zip5
from stage_wisconsin_addresses import request
LAYER='https://services3.arcgis.com/vljlarU2635mITsl/arcgis/rest/services/EMS_Provider_Station_Locations_September_2025/FeatureServer/6'
ITEM='ecb5d6e9d46646aca33b55be5bbacd38'
NAME='EMS Provider Station Locations - September 2025'
EDITION='2025-09'
EDIT=1757363532230
COUNT=735
ROSTER_SHA='d249639d7a6a19d1c41e895ebab11d8b6fdd2a7dc0ee263d008b1894388ee34c'
STRINGS=('Status','Match_type','Match_addr','Addr_type','StAddr','City','RegionAbbr','Postal','Country','SubAddr','IN_Address','IN_Address2','IN_Address3','IN_City','IN_Subregion','IN_Region','IN_Postal','IN_CountryCode','USER_License_Type','USER_Primary_Name','USER_DBA_Name','USER_License_Status','USER_License_Secondary_Status','USER_Mailing_Address_1','USER_Mailing_Address_2','USER_Mailing_City','USER_Mailing_State','USER_Mailing_Zip','USER_Mailing_County')
FIELDS={**{k:'esriFieldTypeString' for k in STRINGS},'ObjectID':'esriFieldTypeOID','Score':'esriFieldTypeDouble','USER_License_Number':'esriFieldTypeInteger','USER_Station_Count':'esriFieldTypeInteger'}
def metadata(fetch=request):
    m=fetch(LAYER,{'f':'json'})
    if m.get('id')!=6 or m.get('name')!=NAME or m.get('serviceItemId')!=ITEM or m.get('geometryType')!='esriGeometryPoint' or m.get('objectIdField')!='ObjectID' or (m.get('editingInfo') or {}).get('lastEditDate')!=EDIT:raise ValueError('Historical Texas source identity or edition changed')
    fields=m.get('fields',[]);actual={f['name']:f['type'] for f in fields}
    if len(actual)!=len(fields) or any(actual.get(k)!=v for k,v in FIELDS.items()):raise ValueError('Unreviewed Texas station layer schema')
    return {'serviceItemId':ITEM,'layerId':6,'name':NAME,'lastEditDate':EDIT,'fields':FIELDS}
def object_ids(fetch):
    count=fetch(LAYER+'/query',{'f':'json','where':'1=1','returnCountOnly':'true'}).get('count')
    p=fetch(LAYER+'/query',{'f':'json','where':'1=1','returnIdsOnly':'true'})
    ids=p.get('objectIds')
    if type(count) is not int or count!=COUNT or p.get('objectIdFieldName')!='ObjectID' or not isinstance(ids,list) or len(ids)!=count or any(type(i) is not int or not 0<i<=9007199254740991 for i in ids) or len(set(ids))!=count:raise ValueError('Historical source feature count or ID set changed')
    return sorted(ids)
def text(v):
    if v is None:return None
    if not isinstance(v,str) or len(v)>600 or re.search(r'[\x00-\x1f\x7f]',v):raise ValueError('Invalid source string')
    return v
def number(v):
    if v is None:return None
    if type(v) is not int or not 0<=v<=9007199254740991:raise ValueError('Invalid source integer')
    return v
def coords(g):
    if g is None:return None
    if not isinstance(g,dict):raise ValueError('Malformed geometry')
    x,y=g.get('x'),g.get('y')
    if x is None and y is None:return None
    if any(type(n) not in (int,float) or not math.isfinite(n) for n in (x,y)) or not -180<=x<=180 or not -90<=y<=90:raise ValueError('Malformed coordinates')
    return {'longitude':x,'latitude':y}
def features(p,expected):
    fs=p.get('features');sr=p.get('spatialReference') or {}
    if not isinstance(fs,list) or p.get('exceededTransferLimit') or len(fs)!=len(expected) or 4326 not in (sr.get('wkid'),sr.get('latestWkid')):raise ValueError('Incomplete or unreviewed geometry response')
    out={}
    for f in fs:
        v=f.get('attributes')
        if not isinstance(v,dict) or set(v)!=set(FIELDS):raise ValueError('Unexpected feature fields')
        oid=number(v['ObjectID'])
        if oid not in expected or oid in out:raise ValueError('Unexpected feature ID')
        row={k:text(v[k]) for k in STRINGS}
        row['ObjectID']=oid
        for k in ('USER_License_Number','USER_Station_Count'):row[k]=number(v[k])
        score=v['Score']
        if score is not None and (type(score) not in (int,float) or not math.isfinite(score) or not 0<=score<=100):raise ValueError('Invalid geocoder score')
        row['Score']=score
        out[oid]={'attributes':row,'geometry':coords(f.get('geometry'))}
    if set(out)!=set(expected):raise ValueError('Feature ID membership changed')
    return out
def roster_index(catalog):
    idx=collections.defaultdict(list)
    for row in catalog['records']:
        if row['rosterKind']=='provider':
            key=row['identifier']
            if not isinstance(key,str) or not re.fullmatch(r'\d{6,7}',key):raise ValueError('Unexpected roster license')
            idx[key].append(row)
    if sum(map(len,idx.values()))!=743 or any(len(v)!=1 for v in idx.values()):raise ValueError('Invalid provider roster identities')
    return idx
def norm(v):return normal_street(v.strip()) if isinstance(v,str) and v.strip() else ''
def address_key(street,extra,city,state,postal):
    s=norm(street);c=norm(city);z=zip5((postal or '').strip())
    return (s,norm(extra),c,state.strip().upper(),z) if s and c and isinstance(state,str) and state.strip() and z else None
def review(f,idx):
    a=f['attributes'];g=f['geometry'];oid=a['ObjectID'];license_number=a['USER_License_Number']
    key=str(license_number) if license_number is not None else ''
    # The GIS field is integer. Do not recreate omitted leading zeros.
    candidates=idx.get(key,[])
    names={name_key(v) for v in (a['USER_Primary_Name'],a['USER_DBA_Name']) if v and name_key(v)}
    association='no_exact_license'
    parent=None
    if len(candidates)>1:association='ambiguous_license'
    elif len(candidates)==1:
        p=candidates[0];current={name_key(v) for v in (p['name'],p.get('dbaName')) if v and name_key(v)}
        if a['USER_License_Type']!=p['licenseType']:association='license_type_conflict'
        elif not names&current:association='license_name_conflict'
        elif p['licenseDateConflict']:association='current_roster_date_conflict'
        else:association='exact_license_and_name_review';parent=p['sourceKey']
    entered=address_key(a['IN_Address'],a['IN_Address2'],a['IN_City'],a['IN_Region'],a['IN_Postal'])
    mailing=address_key(a['USER_Mailing_Address_1'],a['USER_Mailing_Address_2'],a['USER_Mailing_City'],a['USER_Mailing_State'],a['USER_Mailing_Zip'])
    matched=address_key(a['StAddr'],a['SubAddr'],a['City'],a['RegionAbbr'],a['Postal'])
    if not entered or not mailing:address_basis='input_or_mailing_incomplete'
    elif entered==mailing:address_basis='input_matches_reported_mailing'
    else:address_basis='input_differs_from_reported_mailing'
    exact=bool(entered and matched and entered==matched and not entered[1] and not norm(a['IN_Address3']))
    texas=bool(g and 25.8<=g['latitude']<=36.6 and -106.7<=g['longitude']<=-93.5)
    point=bool(exact and texas and a['Status']=='M' and a['Addr_type']=='PointAddress' and a['Score']==100 and entered[3]=='TX' and physical({'street':a['IN_Address'],'city':a['IN_City'],'state':'TX','zip':entered[4]}))
    review_status='historical_point_requires_validation' if parent and point and address_basis=='input_differs_from_reported_mailing' else 'withheld'
    return {'sourceKey':ITEM+':6:'+str(oid),'objectId':oid,'parentReviewKey':parent,'associationStatus':association,'addressBasis':address_basis,'exactInputMatch':exact,'texasBoundingBox':texas,'precisePointGeocode':point,'reviewStatus':review_status,'sourceAttributes':a,'sourceGeometry':g,'sourceEdition':EDITION,'stationIdentifier':None,'stationIdentityEstablished':False,'endUserValidationRequired':True,'publicationEligible':False}
def acquire(catalog,fetch=request,delay=0.3):
    idx=roster_index(catalog);version=metadata(fetch);ids=object_ids(fetch);all_features={}
    for i in range(0,len(ids),40):
        batch=ids[i:i+40]
        p=fetch(LAYER+'/query',{'f':'json','objectIds':','.join(map(str,batch)),'outFields':','.join(FIELDS),'returnGeometry':'true','outSR':'4326'})
        all_features.update(features(p,batch));time.sleep(delay)
    if metadata(fetch)!=version or object_ids(fetch)!=ids or set(all_features)!=set(ids):raise ValueError('Source changed during acquisition')
    rows=[review(all_features[i],idx) for i in ids]
    parents=collections.Counter(r['parentReviewKey'] for r in rows if r['parentReviewKey'])
    locations=collections.Counter((r['sourceGeometry']['longitude'],r['sourceGeometry']['latitude']) for r in rows if r['sourceGeometry'])
    for row in rows:
        row['sourceFeaturesForParent']=parents[row['parentReviewKey']] if row['parentReviewKey'] else None
        g=row['sourceGeometry'];row['sharedSourceCoordinate']=bool(g and locations[(g['longitude'],g['latitude'])]>1)
        if row['sharedSourceCoordinate']:row['reviewStatus']='withheld'
    counts={k:dict(collections.Counter(r[k] for r in rows)) for k in ('associationStatus','addressBasis','reviewStatus')}
    return {'schemaVersion':1,'publication':'review-only','sourceUrl':LAYER,'sourceMetadata':version,'sourceEdition':EDITION,'rosterSha256':ROSTER_SHA,'sourceFeatureCount':len(rows),'distinctParentReviewKeys':len(parents),'counts':counts,'rows':rows,'verifiedStations':0,'newMapped':0,'limitations':'Layer title identifies station locations, but fields do not provide a native individual station ID; source geocodes may represent mailing addresses. Historic source, not current operational status. Coordinates are evidence only; no pin publication.'}
def main():
    p=argparse.ArgumentParser();p.add_argument('--output',type=pathlib.Path,required=True);args=p.parse_args()
    raw=(PUBLIC/'state-ems-review/TX-review.json').read_bytes()
    if sha(raw)!=ROSTER_SHA:raise ValueError('Texas organization snapshot changed')
    catalog=json.loads(raw)
    report=acquire(catalog);report['checkedAt']=datetime.datetime.now(datetime.timezone.utc).isoformat()
    args.output.mkdir(parents=True,exist_ok=True)
    (args.output/'texas-station-location-evidence.json').write_text(json.dumps(report,indent=2)+'\n')
    print('Texas station layer acquisition:',json.dumps({k:report[k] for k in ('sourceFeatureCount','distinctParentReviewKeys','counts','verifiedStations','newMapped')}))
if __name__=='__main__':main()
