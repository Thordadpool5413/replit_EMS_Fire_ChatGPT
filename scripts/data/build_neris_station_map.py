#!/usr/bin/env python3
"""Index retained national NERIS station evidence by actual reported station state.
County is derived point geography from bundled generalized boundaries, never a service area.
No state licensing gate, no new coordinates, no identity merging.
"""
import argparse,collections,json,math,pathlib
from backfill_provider_locations import PUBLIC,ROOT,STATES,sha
SRC=PUBLIC/'neris-stations'
DEST=PUBLIC/'neris-station-map'
BOUNDARY=PUBLIC.parent/'data/us-counties-boundaries.json'
def dump(x):return (json.dumps(x,ensure_ascii=True,sort_keys=True,separators=(',',':'),allow_nan=False)+'\n').encode()
def require(p):return p.read_bytes()
def ring_location(x,y,ring):
    """-1 outside, 0 on boundary, 1 interior. GeoJSON lon,lat."""
    inside=False
    for a,b in zip(ring,ring[1:]+ring[:1]):
        ax,ay=a[:2];bx,by=b[:2]
        if min(ax,bx)-1e-10<=x<=max(ax,bx)+1e-10 and min(ay,by)-1e-10<=y<=max(ay,by)+1e-10 and abs((bx-ax)*(y-ay)-(by-ay)*(x-ax))<=1e-10:
            if ax!=bx or ay!=by:return 0
        if (ay>y)!=(by>y) and x<(bx-ax)*(y-ay)/(by-ay)+ax:inside=not inside
    return 1 if inside else -1
def polygon_location(x,y,poly):
    outer=ring_location(x,y,poly[0])
    if outer!=1:return outer
    for hole in poly[1:]:
        k=ring_location(x,y,hole)
        if k==0:return 0
        if k==1:return -1
    return 1
def geometry_index(collection,identities):
    features=collection['features'];by=collections.defaultdict(list);seen=set()
    for f in features:
        p=f['properties'];key=str(p['GEOID']);state=p['STATE_CODE'];g=f['geometry']
        if key in seen or identities.get(key)!=state or state not in STATES:raise ValueError('County geometry identity mismatch')
        seen.add(key)
        polygons=[g['coordinates']] if g['type']=='Polygon' else g['coordinates'] if g['type']=='MultiPolygon' else None
        if not polygons:raise ValueError('Unsupported county polygon')
        for poly in polygons:
            if not poly or any(len(r)<4 or r[0]!=r[-1] for r in poly):raise ValueError('Unclosed county ring')
            coords=poly[0];xs=[v[0] for v in coords];ys=[v[1] for v in coords]
            by[state].append((key,(min(xs),min(ys),max(xs),max(ys)),poly))
    if seen!=set(identities):raise ValueError('County boundaries not complete')
    return by
def county_for(point,polygons):
    if point is None:return None,'no-source-coordinate'
    y,x=point;hits=set();boundary=False
    for key,(minx,miny,maxx,maxy),poly in polygons:
        if not minx<=x<=maxx or not miny<=y<=maxy:continue
        pos=polygon_location(x,y,poly)
        if pos==0:boundary=True
        elif pos==1:hits.add(key)
    if boundary or len(hits)>1:return None,'ambiguous-boundary'
    if len(hits)==1:return next(iter(hits)),'generalized-boundary'
    return None,'outside-reported-state-boundaries'
def build(src=SRC,boundary=BOUNDARY):
    raw=require(src/'index.json');index=json.loads(raw);meta=index['summary']
    if index['source']!='NERIS' or index['publication']!='review-only' or index['newMapped']!=0 or meta['eligibleDepartments']!=30672 or meta['eligibleStations']!=65970 or meta['sourceCoordinates']!=65967 or len(index['chunks'])!=51:raise ValueError('Unexpected retained NERIS edition')
    county_raw=require(boundary)
    identities={c['GEOID']:c['USPS'] for c in json.loads(require(ROOT/'scripts/fixtures/census-2026-county-identities.json'))['counties'] if c['USPS'] in STATES}
    boundaries=geometry_index(json.loads(county_raw),identities)
    by=collections.defaultdict(list);ids=set();oids=set();parents=set();counts=collections.Counter();points=collections.Counter()
    for c in index['chunks']:
        if c['file']!=c['state']+'.json' or c['state'] not in STATES:raise ValueError('Unexpected parent shard')
        part=require(src/c['file'])
        if sha(part)!=c['sha256']:raise ValueError('Parent shard digest mismatch')
        ds=json.loads(part)
        if len(ds)!=c['departmentCount'] or sum(len(d['stations']) for d in ds)!=c['stationCount']:raise ValueError('Parent shard counts mismatch')
        for d in ds:
            if d['state']!=c['state'] or d['id'] in parents:raise ValueError('Duplicate department')
            parents.add(d['id'])
            for s in d['stations']:
                a=s['address'];point=s['coordinates'];state=a[3]
                if state not in STATES or s['parentId']!=d['id'] or s['id'] in ids or s['oid'] in oids:raise ValueError('Station identity mismatch')
                ids.add(s['id']);oids.add(s['oid'])
                fips,basis=county_for(point,boundaries[state])
                counts[basis]+=1
                if point:
                    if len(point)!=2 or not all(type(v) in (int,float) and math.isfinite(v) for v in point) or abs(point[0])>90 or abs(point[1])>180 or point==[0,0]:raise ValueError('Invalid source point')
                    points[tuple(point)]+=1
                by[state].append({'id':s['id'],'oid':s['oid'],'name':s['name'],'parentId':d['id'],'parentName':d['name'],'parentState':d['state'],'address':a,'coordinates':point,'countyFips':fips,'countyBasis':basis,'exportDate':s['exportDate'],'sharedPoint':s['sharedPoint'],'physicalStreetFormat':s['physicalStreetFormat'],'parentNameConflict':s['parentNameConflict']})
    if len(ids)!=65970 or len(parents)!=30672 or sum(points.values())!=65967 or len(points)!=61743 or set(parents)&ids or set(by)!=STATES or sum(counts.values())!=65970:raise ValueError('Incomplete national station index')
    if any(r['sharedPoint']!=bool(r['coordinates'] and points[tuple(r['coordinates'])]>1) for rows in by.values() for r in rows):raise ValueError('Source point sharing mismatch')
    files={};chunks=[]
    for state,rows in sorted(by.items()):
        if len(rows)!=meta['stationAddressStates'][state]:raise ValueError('Reported station state count mismatch')
        rows.sort(key=lambda r:r['id']);name=state+'.json';data=dump(rows);files[name]=data
        chunks.append({'state':state,'file':name,'count':len(rows),'coordinates':sum(r['coordinates'] is not None for r in rows),'countyLocated':sum(r['countyFips'] is not None for r in rows),'sha256':sha(data)})
    files['index.json']=dump({'schemaVersion':1,'source':'NERIS','sourceUrl':index['sourceUrl'],'retrievedAt':index['retrievedAt'],'publication':'source-reported-discovery','endUserValidationRequired':True,'parentIndexSha256':sha(raw),'boundarySha256':sha(county_raw),'countyBasis':'point-in-bundled-generalized-county-boundary; not jurisdiction or street verification','rowCount':65970,'coordinateCount':65967,'distinctPoints':61743,'countyOutcomes':dict(sorted(counts.items())),'chunks':chunks})
    return files
def main():
    p=argparse.ArgumentParser();p.add_argument('--verify',action='store_true');a=p.parse_args();files=build()
    if a.verify:
        if set(files)!={p.name for p in DEST.iterdir()}:raise ValueError('Map catalog membership mismatch')
        for k,v in files.items():
            if (DEST/k).read_bytes()!=v:raise ValueError('Map catalog byte mismatch: '+k)
    else:
        DEST.mkdir(parents=True,exist_ok=False)
        for k,v in files.items():(DEST/k).write_bytes(v)
    print('NERIS station map index:',json.dumps(json.loads(files['index.json'])['countyOutcomes']))
if __name__=='__main__':main()
