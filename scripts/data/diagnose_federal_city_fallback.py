#!/usr/bin/env python3
"""Exact native city/street matching with source postal code preserved.

A source must have no native same-street/state row at the target ZIP. Native
coordinate reuse, all-pairs distance, source county and target county are
audited against the complete retained inventory.
"""
import collections,copy,json
from backfill_provider_locations import ROOT,STATES
from address_normalization import normalize_street,normalized_city,source_street_line,physical_address
from stage_usgs_primary import (validate_inventory,records,source_address,valid_point,placement,
 coordinate_key,coordinate_address_signature,attrs,make_match,distance_m)
from build_neris_station_map import BOUNDARY,geometry_index,county_for

def street_key(a):
 if not isinstance(a,dict):return None
 if not physical_address(dict(a,zip=a.get('zip')or'00000',city=a.get('city')or'LOCALITY NOT REPORTED')):return None
 return a['state'],normalize_street(source_street_line(a['street']))

def diagnose(source,directory,targets,strict_vetoes):
 inventory=validate_inventory(directory,json.loads((directory/'inventory.json').read_bytes()))
 if inventory['source']!=source:raise ValueError('Wrong federal source inventory')
 desired=collections.defaultdict(list);postal_desired=set()
 for scope,entry in targets:
  a=entry.get('address');key=street_key(a)
  if key and entry['status']in('no-match','not-eligible','unavailable','pending')and a.get('zip'):
   desired[(*key,normalized_city(a['city']))].append((scope,entry));postal_desired.add((*key,a['zip']))
 same_postal=set();potential=collections.defaultdict(list);coordinates=set();scanned=0
 for feature,page in records(directory,inventory):
  scanned+=1;a=source_address(feature,source);key=street_key(a)
  if not key:continue
  if(*key,a['zip'])in postal_desired:same_postal.add((*key,a['zip']))
  city_key=(*key,normalized_city(a['city']))
  if city_key in desired and valid_point(feature)and placement(feature,source):
   potential[city_key].append((feature,page));coordinates.add(coordinate_key(feature))
 reuse=collections.defaultdict(set);audited=0
 for feature,page in records(directory,inventory):
  audited+=1
  if valid_point(feature)and coordinate_key(feature)in coordinates:
   signature=coordinate_address_signature(source_address(feature,source))
   if signature:reuse[coordinate_key(feature)].add(signature)
 if scanned!=inventory['sourceCount']or audited!=inventory['sourceCount']:raise ValueError('Incomplete native source audit')
 ids={r['GEOID']:r['USPS']for r in json.loads((ROOT/'scripts/fixtures/census-2026-county-identities.json').read_bytes())['counties']if r['USPS']in STATES}
 boundaries=geometry_index(json.loads(BOUNDARY.read_bytes()),ids);candidates=[];rejected=[];outcomes=collections.Counter()
 for key,values in sorted(desired.items()):
  for scope,target in values:
   prefix=scope+':'
   if(scope,target['key'])in strict_vetoes:outcomes[prefix+'existing-strict-source-rejection']+=1;continue
   if(*key[:2],target['address']['zip'])in same_postal:outcomes[prefix+'same-postal-native-source-row-exists']+=1;continue
   raw=potential.get(key,[])
   if not raw:outcomes[prefix+'no-exact-native-city-street-point']+=1;continue
   points=[];issues=set()
   for feature,page in raw:
    a=source_address(feature,source)
    if a['zip']==target['address']['zip']:raise ValueError('Same-postal exclusion is incomplete')
    if len(reuse[coordinate_key(feature)])!=1:issues.add('shared-native-coordinate');continue
    p=feature['geometry'];county,_=county_for([p['y'],p['x']],boundaries[key[0]])
    if not county:issues.add('native-point-county-unresolved');continue
    if source!='usgs'and attrs(feature).get('FIPS')!=county:issues.add('native-county-disagreement');continue
    if target.get('sourceCounty')and target['sourceCounty']!=county:issues.add('primary-source-county-disagreement');continue
    match=make_match(feature,page,inventory,county);match['matchBasis']='normalized-street-city-state';points.append(match)
   if len({m['point']['countyFips']for m in points})>1 or any(distance_m(a,b)>75 for i,a in enumerate(points)for b in points[i+1:]):issues.add('native-point-disagreement')
   if issues:
    outcomes[prefix+'native-conflict']+=1
    rejected.append({'key':target['key'],'scope':scope,'address':copy.deepcopy(target['address']),'reasons':sorted(issues),'eligibleNativePoints':points});continue
   if not points:outcomes[prefix+'no-qualified-native-point']+=1;continue
   points.sort(key=lambda m:(m['point']['precision']=='blockface',m['point']['objectId']));chosen=points[0]
   candidates.append({'key':target['key'],'scope':scope,'source':target['source'],'state':target['state'],
    'originalAddress':copy.deepcopy(target['address']),'address':copy.deepcopy(target['address']),
    'originalStatus':target['status'],'countyFips':chosen['point']['countyFips'],'match':chosen,
    'acceptedPointObservations':points,'corroboratingObjectIds':[m['point']['objectId']for m in points],
    'publicationEligible':False,'profile':'diagnostic-exact-city-different-native-postal','targetInput':copy.deepcopy(target)})
   outcomes[prefix+'qualified-diagnostic-point']+=1
 return {'schemaVersion':2,'publication':'diagnostic-only','source':source,'sourceInventorySha256':inventory['sourceSha256'],
         'completeRowsScanned':scanned,'coordinateReuseRowsScanned':audited,'candidates':candidates,'rejected':rejected,
         'outcomes':dict(sorted(outcomes.items()))}
