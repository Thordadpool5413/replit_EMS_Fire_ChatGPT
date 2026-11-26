#!/usr/bin/env python3
"""Match frozen original/native addresses against complete retained TIGER ranges.

Only numeric house numbers with exact native street/state/ZIP, native parity,
single native polyline geometry, own-county agreement and all-range agreement
are eligible. Coordinates are interpolations along native geometry, not building
locations. Every target, including existing mapped entries, participates in the
derived-coordinate reuse audit; eligibility does not change original inputs.
"""
import argparse,collections,copy,functools,gzip,json,math,pathlib,re,zipfile
from backfill_provider_locations import ROOT,STATES,sha,digest_file
from primary_recovery_baseline import load_primary_baseline,INDEX_SHA
from address_normalization import normalize_street,source_street_line
from build_neris_station_map import BOUNDARY,county_for
from recover_neris_primary import load_boundaries
from stage_usgs_primary import distance_m
from stage_tiger_primary import (COUNTY_FILES,SOURCE_COUNT,SOURCE_URL,NATIVE_CRS,METHOD,
                                numeric_address,selection_key,additional_selection,dump)
from checkpoint_tiger_source import validate_source

CORE_SHA='cb4c896b00f7ca2a1710a57a142f94e67b0e4463871e217ae9b1a8eeafe7744a'
CORE_PATH=ROOT/'scripts/data/evidence/primary-neris-original-site-targets/2026-11-26/targets.json'
ELIGIBLE={'no-match','not-eligible','unavailable','pending'}

def native_text(value):
 if value is None:return ''
 if not isinstance(value,(str,int,float))or isinstance(value,bool):raise ValueError('Unexpected native scalar')
 return str(value).strip()

def range_fraction(attributes,side,house):
 """None is no numeric match; a named issue is retained as an ambiguity veto."""
 first=native_text(attributes[side+'FROMHN']);last=native_text(attributes[side+'TOHN'])
 if first in('','0')and last in('','0'):return None,None
 if not re.fullmatch(r'\d+',first)or not re.fullmatch(r'\d+',last):
  return None,'unsupported-native-house-range'
 start,end=int(first),int(last)
 if not min(start,end)<=house<=max(start,end):return None,None
 if start<=0 or end<=0:return None,'nonpositive-native-house-range'
 parity=native_text(attributes['PARITY'+side])
 if parity not in('E','O','B'):return None,'unsupported-native-parity'
 if parity in('E','O'):
  expected=0 if parity=='E'else 1
  if house%2!=expected:return None,None
  if start%2!=expected or end%2!=expected:return None,'native-range-parity-disagreement'
 from_type=native_text(attributes[side+'FROMTYP']);to_type=native_text(attributes[side+'TOTYP'])
 offset=native_text(attributes['OFFSET'+side])
 if from_type not in('','I')or to_type not in('','I')or offset not in('','N','Y'):
  return None,'unsupported-native-range-flag'
 fraction=0.5 if start==end else (house-start)/(end-start)
 return {'fromHouseNumber':first,'toHouseNumber':last,'parity':parity,'side':side,
         'fromType':from_type,'toType':to_type,'offset':offset,'interpolationFraction':fraction},None

def segment_distance(a,b):
 # Longitude/latitude native NAD83; geodesic length chooses the interpolation
 # segment. The final fraction is linearly interpolated on that native segment.
 radius=6371008.8;lat1,lat2=math.radians(a[1]),math.radians(b[1])
 dlat=lat2-lat1;dlon=math.radians(b[0]-a[0])
 value=math.sin(dlat/2)**2+math.cos(lat1)*math.cos(lat2)*math.sin(dlon/2)**2
 return 2*radius*math.asin(min(1,math.sqrt(max(0,value))))

def interpolate(geometry,fraction):
 if type(fraction)not in(int,float)or not math.isfinite(fraction)or not 0<=fraction<=1:
  raise ValueError('invalid-interpolation-fraction')
 if geometry.get('shapeType')!=3 or geometry.get('parts')!=[0]:
  raise ValueError('unsupported-native-multipart-geometry')
 points=geometry.get('points')
 if not isinstance(points,list)or len(points)<2:raise ValueError('invalid-native-polyline')
 for point in points:
  if(not isinstance(point,list)or len(point)!=2 or
     not all(type(v)in(int,float)and math.isfinite(v)for v in point)or
     not -180<=point[0]<=180 or not -90<=point[1]<=90 or point==[0,0]):
   raise ValueError('invalid-native-polyline-coordinate')
 segments=[]
 for a,b in zip(points,points[1:]):
  if abs(b[0]-a[0])>180:raise ValueError('unsupported-antimeridian-segment')
  length=segment_distance(a,b)
  if length>0:segments.append((a,b,length))
 total=sum(item[2]for item in segments)
 if not math.isfinite(total)or total<=0:raise ValueError('zero-length-native-geometry')
 desired=fraction*total;walked=0.0
 for i,(a,b,length)in enumerate(segments):
  if desired<=walked+length or i==len(segments)-1:
   ratio=max(0,min(1,(desired-walked)/length))
   longitude=a[0]+(b[0]-a[0])*ratio;latitude=a[1]+(b[1]-a[1])*ratio
   return [latitude,longitude],total
  walked+=length
 raise ValueError('native-polyline-interpolation-failed')

def minimal_reference(document,record,side,house):
 return {'countyFips':document['countyFips'],'sourceRowNumber':record['sourceRowNumber'],
  'nativeRecordSha256':record['nativeRecordSha256'],'side':side,'houseNumber':str(house),
  'tlid':record['native']['attributes'].get('TLID'),
  'linearId':record['native']['attributes'].get('LINEARID'),
  'rangeId':record['native']['attributes'].get('ARID'+side)}

def point_match(document,record,side,house,range_data,inventory,boundaries):
 attributes=record['native']['attributes'];coordinates,total=interpolate(record['native']['geometry'],range_data['interpolationFraction'])
 state=document['state'];county,basis=county_for(coordinates,boundaries[state])
 if not county:raise ValueError('native-range-point-county-unresolved')
 if county!=document['countyFips']:raise ValueError('native-range-point-outside-source-county')
 tlid=attributes['TLID'];linear_id=native_text(attributes['LINEARID']);range_id=native_text(attributes['ARID'+side])
 if type(tlid)is not int or tlid<=0 or not linear_id or not range_id:raise ValueError('native-range-identity-missing')
 point={'nativeId':document['countyFips']+':'+str(record['sourceRowNumber'])+':'+side+':'+str(house),
  'sourceFile':document['sourceFile'],'sourceUrl':document['sourceUrl'],
  'sourceArchiveSha256':document['sourceArchiveSha256'],'sourceInventorySha256':inventory['sourceInventorySha256'],
  'sourceDate':'2026','nativeReferenceSystem':NATIVE_CRS,'sourceRowNumber':record['sourceRowNumber'],
  'nativeRecordSha256':record['nativeRecordSha256'],'completeCountyFilesAudited':COUNTY_FILES,
  'completeNativeRowsAudited':SOURCE_COUNT,'countyFips':county,'sourceCountyFips':document['countyFips'],
  'precision':'address-range','addressRole':'source-address-location','streetName':native_text(attributes['FULLNAME']),
  'houseNumber':str(house),'postalCode':native_text(attributes['ZIP'+side]),'tlid':tlid,'linearId':linear_id,
  'rangeId':range_id,**range_data,'segmentLengthMeters':total,
  'coordinateMethod':'fraction-along-native-polyline-length','coordinatesComputed':coordinates}
 return {'method':METHOD,'latitude':coordinates[0],'longitude':coordinates[1],
  'matchedAddress':str(house)+' '+point['streetName']+', '+state+', '+point['postalCode'],
  'matchBasis':'normalized-street-state-zip-and-house-number-range','point':point}

def source_inputs(directory):
 inventory,inputs=validate_source(directory)
 validate_inputs(inventory,inputs)
 return inventory,inputs

def validate_inputs(inventory,inputs):
 _,originals,baseline_sha=load_primary_baseline()
 if inputs.get('schemaVersion')!=2 or inputs.get('originalPrimaryCount')!=46791 or inputs['pins'].get('original')!=baseline_sha:
  raise ValueError('TIGER original input scope changed')
 if sha(dump(inputs))!=inventory['targetsSha256']:raise ValueError('TIGER target content changed')
 grouped=collections.defaultdict(list);ids=set()
 for row in inputs['targets']:
  scope=row['scope'];entry=row['entry'];expected_id=scope+':'+entry['key']
  if row['targetId']!=expected_id or expected_id in ids or scope not in('original','neris-native','cms-native'):
   raise ValueError('TIGER target identity membership changed')
  ids.add(expected_id);grouped[scope].append(entry)
 if grouped['original']!=originals:raise ValueError('Original target status/address/source metadata changed')
 raw=CORE_PATH.read_bytes()
 if sha(raw)!=CORE_SHA or grouped['neris-native']!=json.loads(raw)or inputs['pins']['neris-native']!=CORE_SHA:
  raise ValueError('Frozen original NERIS physical-site scope changed')
 from retain_nppes_native_source import DEFAULT,current_pins
 native_sha,target_sha=current_pins()
 with zipfile.ZipFile(DEFAULT/'original.zip')as z:cms_raw=z.read('inputs/native-component-targets.json')
 if sha(cms_raw)!=target_sha or grouped['cms-native']!=json.loads(cms_raw)or inputs['pins']['cms-native']!=target_sha:
  raise ValueError('Frozen native CMS component scope changed')
 if inputs['additionalSelection']!=additional_selection():raise ValueError('Native retention-only street/ZIP scope changed')
 keys={selection_key(t['entry'].get('address'))for t in inputs['targets']if selection_key(t['entry'].get('address'))}
 keys.update(tuple(k)for k in inputs['additionalSelection']['keys'])
 if sha(dump(sorted(keys)))!=inventory['selectionSha256']:raise ValueError('Full selected street/ZIP inventory changed')
 return keys

@functools.lru_cache(maxsize=1)
def canonical_legacy_audit():
 from retain_neris_primary import DEFAULT,verify
 verify(DEFAULT)
 with zipfile.ZipFile(DEFAULT/'original.zip')as z:
  report=json.loads(z.read('candidates.json'));inputs=json.loads(z.read('inputs.json'))
 _,originals,_=load_primary_baseline()
 if inputs['entries']!=originals:raise ValueError('Native legacy audit is not bound to original inputs')
 return report,{'archiveSha256':digest_file(DEFAULT/'original.zip'),'manifestSha256':sha((DEFAULT/'manifest.json').read_bytes())}

def target_scope(inputs,extra_targets=None,extra_targets_raw=None):
 targets=copy.deepcopy(inputs['targets']);extras=extra_targets or[];original={e['entry']['key']:e['entry']for e in targets if e['scope']=='original'}
 raw=extra_targets_raw if extra_targets_raw is not None else dump(extras)
 if json.loads(raw)!=extras:raise ValueError('Additional native target bytes do not match declared inputs')
 ids=set()
 for entry in extras:
  key=entry.get('originalPrimaryKey');old=original.get(key)
  if(not old or entry.get('primaryAddressEvidence',{}).get('originalAddress')!=old['address']or
     any(entry.get(k)!=old.get(k)for k in('name','source','state','sourceDate','sourceCounty'))or
     entry['key']in ids or entry['status']not in ELIGIBLE):
   raise ValueError('Additional diagnostic target changed original identity or native source role')
  ids.add(entry['key'])
  targets.append({'scope':'additional-native','targetId':'additional-native:'+entry['key'],'entry':copy.deepcopy(entry)})
 return targets,{'sha256':sha(raw),'targetCount':len(extras),'targets':copy.deepcopy(extras)}

def frozen_address_key(address):
 parsed=numeric_address(address)
 return(address['state'],parsed[0],parsed[1],address['zip'])if parsed else None

def coordinate_key(match):return(round(match['latitude'],7),round(match['longitude'],7))

def range_disagreement(observations):
 return len({o['point']['countyFips']for o in observations})>1 or any(distance_m(a,b)>75 for i,a in enumerate(observations)for b in observations[i+1:])

def match(directory,inventory,inputs,extra_targets=None,legacy_audit=None,extra_targets_raw=None):
 keys=validate_inputs(inventory,inputs);targets,extra_scope=target_scope(inputs,extra_targets,extra_targets_raw)
 expected,audit_pin=canonical_legacy_audit()
 if legacy_audit is not None and legacy_audit!=expected:raise ValueError('Legacy eligibility requires the complete retained native audit')
 audit=expected;legacy={r['key']for r in audit['legacyAudit']if r['accepted']is False}
 original={r['entry']['key']:r['entry']for r in inputs['targets']if r['scope']=='original'}
 if any(k not in original or original[k]['status']!='mapped'for k in legacy):raise ValueError('Legacy withholding membership changed')
 desired=collections.defaultdict(lambda:collections.defaultdict(list));by_id={};unsupported=[]
 for row in targets:
  entry=row['entry'];parsed=numeric_address(entry.get('address'));key=selection_key(entry.get('address'))
  by_id[row['targetId']]=row
  if not parsed:unsupported.append(row['targetId']);continue
  if key not in keys:raise ValueError('Additional native target street/ZIP was not captured by the complete source scan')
  desired[key][parsed[0]].append(row['targetId'])
 boundaries=load_boundaries();matches=collections.defaultdict(list);issues=collections.defaultdict(list)
 scanned=0;source_rows=0
 for receipt in inventory['counties']:
  raw=(directory/receipt['file']).read_bytes()
  if sha(raw)!=receipt['sha256']:raise ValueError('Retained native county changed during replay')
  document=json.loads(gzip.decompress(raw));source_rows+=document['sourceRows'];state=document['state']
  for record in document['records']:
   scanned+=1;attributes=record['native']['attributes'];road=normalize_street(native_text(attributes['FULLNAME']))
   for side in('L','R'):
    key=(state,road,native_text(attributes['ZIP'+side]));numbers=desired.get(key)
    if not numbers:continue
    for house,target_ids in sorted(numbers.items()):
     data,issue=range_fraction(attributes,side,house)
     if issue:
      witness={'reason':issue,'nativeRange':minimal_reference(document,record,side,house)}
      for target_id in target_ids:issues[target_id].append(copy.deepcopy(witness))
      continue
     if data is None:continue
     try:point=point_match(document,record,side,house,data,inventory,boundaries)
     except ValueError as error:
      witness={'reason':str(error),'nativeRange':minimal_reference(document,record,side,house)}
      for target_id in target_ids:issues[target_id].append(copy.deepcopy(witness))
      continue
     for target_id in target_ids:matches[target_id].append(point)
 if source_rows!=SOURCE_COUNT or scanned!=inventory['retainedFeatureCount']:raise ValueError('Incomplete native range replay')
 # All target addresses are checked before any original eligibility filter.
 reuse=collections.defaultdict(set)
 for target_id,observations in matches.items():
  address=by_id[target_id]['entry']['address'];signature=frozen_address_key(address)
  for observation in observations:reuse[coordinate_key(observation)].add(signature)
 candidates=[];diagnostics=[];rejected=[];outcomes=collections.Counter();decisions=[]
 for target_id,row in sorted(by_id.items()):
  scope=row['scope'];entry=row['entry'];observations=matches.get(target_id,[]);vetoes=copy.deepcopy(issues.get(target_id,[]))
  for observation in observations:
   if len(reuse[coordinate_key(observation)])>1:
    vetoes.append({'reason':'derived-coordinate-shared-by-distinct-target-addresses','nativeRangeId':observation['point']['nativeId']})
   if entry.get('sourceCounty')and entry['sourceCounty']!=observation['point']['countyFips']:
    vetoes.append({'reason':'primary-source-county-disagreement','sourceCountyFips':entry['sourceCounty'],
                   'pointCountyFips':observation['point']['countyFips'],'nativeRangeId':observation['point']['nativeId']})
  if range_disagreement(observations):
   vetoes.append({'reason':'ambiguous-native-range-points','nativeRangeIds':[o['point']['nativeId']for o in observations]})
  eligible=entry['status']in ELIGIBLE or(scope=='original'and entry['key']in legacy)
  reason='ineligible-original-status'if not eligible else 'native-range-conflict'if vetoes else 'accepted-range'if observations else 'no-exact-native-numeric-range'
  outcomes[scope+':'+reason]+=1
  if not eligible:continue
  if vetoes:
   rejected.append({'scope':scope,'targetId':target_id,'key':entry['key'],'address':copy.deepcopy(entry.get('address')),
     'originalAddress':copy.deepcopy(entry.get('address')),'reasons':sorted({v['reason']for v in vetoes}),
     'nativeConflicts':vetoes,'eligibleNativeRanges':[copy.deepcopy(m)for m in observations]})
   continue
  if not observations:continue
  observations.sort(key=lambda m:(m['point']['countyFips'],m['point']['tlid'],m['point']['sourceRowNumber'],m['point']['side']))
  chosen=observations[0];candidate={k:copy.deepcopy(entry[k])for k in('key','name','source','state','sourceDate','sourceCounty')}
  candidate.update(originalAddress=copy.deepcopy(entry['address']),address=copy.deepcopy(entry['address']),originalStatus=entry['status'],
   countyFips=chosen['point']['countyFips'],match=copy.deepcopy(chosen),corroboratingNativeRanges=[m['point']['nativeId']for m in observations])
  decision={'scope':scope,'targetId':target_id,'key':entry['key'],'address':copy.deepcopy(entry['address']),
            'acceptedNativeRanges':[copy.deepcopy(m)for m in observations]}
  decisions.append(decision)
  if scope=='original':candidates.append(candidate)
  else:
   candidate.update(scope=scope,targetId=target_id,diagnosticInput=copy.deepcopy(entry));diagnostics.append(candidate)
 return {'schemaVersion':2,'source':'tiger-2026-addrfeat','method':METHOD,'sourceUrl':SOURCE_URL,
  'sourceInventorySha256':inventory['sourceInventorySha256'],'sourceCountyFileCount':COUNTY_FILES,'sourceRowCount':SOURCE_COUNT,
  'retainedNativeFeatureCount':scanned,'originalPrimaryCount':46791,'baselineIndexSha256':INDEX_SHA,
  'targetsSha256':inventory['targetsSha256'],'inputPins':copy.deepcopy(inputs['pins']),'additionalDiagnosticScope':extra_scope,
  'legacyEligibility':{'sourceEvidence':audit_pin,'withheldKeys':sorted(legacy)},
  'boundarySha256':sha(BOUNDARY.read_bytes()),'selectionDecisions':decisions,
  'candidates':sorted(candidates,key=lambda c:c['key']),'diagnosticCandidates':sorted(diagnostics,key=lambda c:c['targetId']),
  'rejected':rejected,'outcomes':dict(sorted(outcomes.items())),
  'interpretation':'Approximate numeric house-range interpolation along complete native NAD83 street geometry. Native parity, flags, county and every conflicting range are retained. No building, occupancy, present headquarters, or street-side offset is inferred.'}

def main():
 p=argparse.ArgumentParser();p.add_argument('--directory',type=pathlib.Path,required=True);p.add_argument('--output',type=pathlib.Path,required=True)
 p.add_argument('--additional-targets',type=pathlib.Path);p.add_argument('--legacy-audit',type=pathlib.Path);a=p.parse_args()
 inventory,inputs=source_inputs(a.directory);raw=a.additional_targets.read_bytes()if a.additional_targets else None
 extra=json.loads(raw)if raw is not None else None;legacy=json.loads(a.legacy_audit.read_bytes())if a.legacy_audit else None
 report=match(a.directory,inventory,inputs,extra,legacy,raw);a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_bytes(dump(report))
 print(json.dumps({'candidateCount':len(report['candidates']),'diagnosticCount':len(report['diagnosticCandidates']),
                   'rejectionCount':len(report['rejected']),'sourceInventorySha256':inventory['sourceInventorySha256'],'outcomes':report['outcomes']}),flush=True)
if __name__=='__main__':main()
