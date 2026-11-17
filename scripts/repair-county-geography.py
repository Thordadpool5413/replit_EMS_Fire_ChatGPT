"""Repair bundled county geography from official Census files.

Requires pyshp and shapely. Source files are staged separately; no agency/cloud
records are written. Run with --source-dir pointing to the four source archives.
"""
import argparse, base64, csv, gzip, hashlib, io, json, pathlib, re, sys, zipfile
import shapefile
from shapely.geometry import shape, mapping

ROOT = pathlib.Path(__file__).resolve().parents[1]
APP = ROOT / 'artifacts/ems-territory-intelligence'
SOURCES = {
 'gazetteer.zip': 'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2026_Gazetteer/2026_Gaz_counties_national.zip',
 'counties.zip': 'https://www2.census.gov/geo/tiger/GENZ2025/shp/cb_2025_us_county_500k.zip',
 'ct-towns.zip': 'https://www2.census.gov/geo/tiger/GENZ2025/shp/cb_2025_09_cousub_500k.zip',
 'ct-legacy-towns.zip': 'https://www2.census.gov/geo/tiger/GENZ2020/shp/cb_2020_09_cousub_500k.zip',
}

def records(p):
 z = zipfile.ZipFile(p)
 def data(ext): return io.BytesIO(z.read(next(n for n in z.namelist() if n.endswith(ext))))
 return shapefile.Reader(shp=data('.shp'), shx=data('.shx'), dbf=data('.dbf'), encoding='utf-8')

def key(name): return re.sub(r'[^a-z0-9]', '', name.lower())
def raw_name(name): return re.sub(r' (County|Parish|City and Borough|Borough|Census Area|Municipality|Planning Region)$', '', name)
def write_json(p, data): p.write_text(json.dumps(data, separators=(',', ':'), ensure_ascii=False) + '\n')

def main():
 args = argparse.ArgumentParser(); args.add_argument('--source-dir', required=True); src = pathlib.Path(args.parse_args().source_dir)
 z = zipfile.ZipFile(src/'gazetteer.zip')
 rows = [{k.strip():v.strip() for k,v in r.items()} for r in csv.DictReader(io.StringIO(z.read(z.namelist()[0]).decode('utf-8-sig')), delimiter='|')]
 old = json.loads(gzip.decompress((APP/'src/data/all-counties-database.json.gz').read_bytes()))
 state_names = {r['stateCode']:r['stateName'] for r in old}
 gaz = {r['GEOID']:r for r in rows if r['USPS'] in state_names}
 assert len(gaz) == 3144 and len(state_names) == 51
 old_by_id = {r['countyFips']:r for r in old}
 legacy = [r for r in old if r['stateCode']=='CT']
 # Preserve the original legacy geography and all its values for reference.
 archive = APP/'src/data/ct-legacy-counties.json'
 if not archive.exists(): write_json(archive, legacy)
 else: legacy = json.loads(archive.read_text())
 towns_old = {key(r.record.as_dict()['NAME']):r.record.as_dict() for r in records(src/'ct-legacy-towns.zip').iterShapeRecords()}
 towns_new = {}
 for sr in records(src/'ct-towns.zip').iterShapeRecords():
  row = sr.record.as_dict(); point = shape(sr.shape.__geo_interface__).representative_point(); row['point']=[point.x,point.y]; towns_new[key(row['NAME'])]=row
 assert len(towns_old)==169 and len(towns_new)==169
 ct_towns={}
 old_ct_by_id={r['countyFips']:r for r in legacy}
 for name, r in towns_new.items():
  fips='09'+r['COUNTYFP']; old_fips='09'+towns_old[name]['COUNTYFP']
  assert fips in gaz and old_fips in old_ct_by_id
  ct_towns[name]={'townName':r['NAME'],'countyFips':fips,'countyName':gaz[fips]['NAME'],'legacyCountyFips':old_fips,'legacyCountyName':old_ct_by_id[old_fips]['countyName']}
 features = json.loads((APP/'public/data/us-counties-boundaries.json').read_text())['features']
 by_id={f['id']:f for f in features if f['properties']['STATE_CODE'] not in ('IL','CT')}
 repaired_shapes={}
 for sr in records(src/'counties.zip').iterShapeRecords():
  r=sr.record.as_dict()
  if r['STATEFP'] not in ('17','09'): continue
  fips=r['GEOID']; assert fips in gaz
  original=shape(sr.shape.__geo_interface__)
  assert original.is_valid and not original.is_empty
  geom=original.simplify(0.0005,preserve_topology=True)
  assert geom.is_valid and not geom.is_empty
  repaired_shapes[fips]=geom
  by_id[fips]={'type':'Feature','id':fips,'properties':{},'geometry':mapping(geom)}
 assert len(repaired_shapes)==111
 correction_aliases=[]; new=[]
 metrics=['population','seniorPopPct','medianIncome','povertyRatePct','annualEmergencyTransports','annualCardiacArrestIncidents','averageTransportMinutes','primaryCathLabDistanceMiles','activeEmsAgencies']
 for fips,g in sorted(gaz.items()):
  code=g['USPS']; existing=old_by_id.get(fips)
  if existing:
   r=dict(existing)
   aliases=list(dict.fromkeys([*(r.get('aliases',[])),r['countyName']])) if r['countyName']!=g['NAME'] else r.get('aliases',[])
  else:
   assert code=='CT'
   r={**{m:None for m in metrics},'countySeat':'','primaryZipCodes':[],'cities':[],'cityRecords':[],'figureSources':{}}
   aliases=[]
   city_records={}
   for prior in legacy:
    for city in prior.get('cityRecords',[]):
     town=ct_towns.get(key(city['name']))
     if town and town['countyFips']==fips: city_records[key(city['name'])]=city
   r['cityRecords']=list(city_records.values());r['cities']=[c['name'] for c in r['cityRecords']]
  if code=='CT':
   previous={key(city['name']):city for prior in legacy for city in prior.get('cityRecords',[])}
   r['cityRecords']=[{'name':town['townName'],'zipCode':previous.get(name,{}).get('zipCode',''),'latitude':towns_new[name]['point'][1],'longitude':towns_new[name]['point'][0],'isCountySeat':False} for name,town in ct_towns.items() if town['countyFips']==fips]
   r['cities']=[city['name'] for city in r['cityRecords']]
  r.update(countyFips=fips,stateFips=fips[:2],stateCode=code,stateName=state_names[code],countyName=g['NAME'],rawName=raw_name(g['NAME']))
  if aliases:
   r['aliases']=aliases
   correction_aliases.append({'stateCode':code,'countyFips':fips,'countyName':g['NAME'],'aliases':aliases})
  if code in ('IL','CT'):
   geom=repaired_shapes[fips]
   r.update(centroidLat=float(g['INTPTLAT']),centroidLng=float(g['INTPTLONG']),bbox=list(geom.bounds),landAreaSqMiles=float(g['ALAND_SQMI']))
  r['geographyVintage']='2026 Census county identifiers; 2025 cartographic boundaries' if code in ('IL','CT') else '2026 Census county identifiers'
  new.append(r)
  f=by_id[fips];p=f['properties']
  p.update(GEOID=fips,STATE=fips[:2],STATE_CODE=code,COUNTY=fips[2:],NAME=raw_name(g['NAME']),COUNTY_NAME=g['NAME'],COUNTY_SEAT=r['countySeat'],LSAD=g['NAME'][len(raw_name(g['NAME'])):].strip() or 'Independent city',CENSUSAREA=r['landAreaSqMiles'],CENTLAT=r['centroidLat'],CENTLON=r['centroidLng'],BBOX=r['bbox'],CITIES_COUNT=len(r.get('cities',[])))
 assert set(by_id)==set(gaz)
 collection={'type':'FeatureCollection','features':[by_id[f] for f in sorted(gaz)]}
 write_json(APP/'public/data/us-counties-boundaries.json',collection)
 packed=gzip.compress(json.dumps(collection,separators=(',',':'),ensure_ascii=False).encode(),mtime=0)
 (APP/'public/data/us-counties-boundaries.json.gz.txt').write_text(base64.b64encode(packed).decode()+'\n')
 (APP/'src/data/all-counties-database.json.gz').write_bytes(gzip.compress(json.dumps(new,separators=(',',':'),ensure_ascii=False).encode(),mtime=0))
 write_json(APP/'src/data/county-geography-corrections.json',{'aliases':correction_aliases,'connecticutTowns':ct_towns})
 manifest={'countyCount':len(new),'states':len(state_names),'replacedGeometryStates':['IL','CT'],'geometrySimplificationDegrees':0.0005,'connecticutLegacyCountyCount':len(legacy),'connecticutTownCrosswalkCount':len(ct_towns),'newCountyMetrics':'null until source-backed current-region values are supplied','sources':[{'url':url,'sha256':hashlib.sha256((src/name).read_bytes()).hexdigest()} for name,url in SOURCES.items()]}
 write_json(APP/'src/data/county-geography-manifest.json',manifest)
 print(json.dumps({'counties':len(new),'polygons':len(by_id),'replacedGeometries':len(repaired_shapes),'aliases':len(correction_aliases),'ctTowns':len(ct_towns),'boundaryBytes':(APP/'public/data/us-counties-boundaries.json').stat().st_size}))

if __name__=='__main__': main()
