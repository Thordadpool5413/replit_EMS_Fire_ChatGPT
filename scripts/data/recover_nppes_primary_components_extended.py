#!/usr/bin/env python3
"""Select native CMS practice components from fully replayed independent sources.

All qualified address-point endpoints participate in consensus, including each
unselected city-source endpoint. A native range is a fallback only after every
point source is complete and none has an eligible point, positive conflict or
unresolved provenance. Original native identity/address fields never change.
"""
import argparse,collections,copy,functools,json,pathlib,zipfile
from backfill_provider_locations import ROOT,sha,digest_file,native_key
from recover_nppes_native_primary import dump
from recover_nppes_primary_components import (METHOD,inputs as native_inputs,component_proof,
 qualified_witnesses,verify as verify_strict,EVIDENCE as STRICT_EVIDENCE)
from retain_nppes_native_source import DEFAULT as NATIVE_EVIDENCE,current_pins
from retain_federal_city_points import (EVIDENCE as CITY_EVIDENCE,verify as verify_city,
 validate_federal_city_diagnostic_candidate)
from stage_usgs_primary import distance_m

EVIDENCE=ROOT/'scripts/data/evidence/primary-nppes-components-extended/2026-11-26'
NAD_EVIDENCE=ROOT/'scripts/data/evidence/primary-nad-extended/2026-11-26'
OVERTURE_EVIDENCE=ROOT/'scripts/data/evidence/primary-overture-native-variants/2026-11-26'
TIGER_EVIDENCE=ROOT/'scripts/data/evidence/primary-tiger-native/2026-11-26'
POSITIVE_OVERTURE={'conflicting-native-points','source-point-county-conflict',
 'coordinate-shared-by-distinct-addresses','invalid-native-point'}
POINT_ORDER={'nad-address-point':0,'usgs-structure-address':1,'overture-address':2,'neris-reported-address':3,
             'hifld-ems-address':3,'hifld-fire-address':4,'overture-place-address':5}
REQUIRED_SOURCES={'usgs','hifld-ems','hifld-fire','federal-city','nad','neris','overture-address','overture-place-address','tiger'}

def adapted_nad_target(target):
 result=copy.deepcopy(target);result['key']=target['key']+'@NPPES-PRIMARY';result['originalPrimaryKey']=target['key'];return result

def bucket():
 return {'pointObservations':[],'rangeObservations':[],'rangePointObservations':[],
         'pointConflicts':[],'pointBlocks':[],'rangeConflicts':[]}

def observation(source,candidate,target,selectable=True,component=None):
 if(candidate.get('key')!=target['key']or candidate.get('address')!=target['address']or
    candidate.get('originalAddress')!=target['address']or
    candidate.get('countyFips')!=candidate.get('match',{}).get('point',{}).get('countyFips')):
  raise ValueError('Independent point changed exact native component address/identity')
 if component is not None and candidate.get('componentEvidence')!=component:
  raise ValueError('Independent source omitted or changed required native component proof')
 return {'source':source,'selectable':selectable,'sourceCandidateSha256':sha(dump(candidate)),
         'candidate':copy.deepcopy(candidate)}

def reject_binding(source,row,target):
 address=row.get('targetAddress')or row.get('originalAddress')or row.get('address')
 if address is not None and address!=target['address']:raise ValueError('Source rejection belongs to a different native address')
 return {'source':source,'key':target['key'],'targetAddress':copy.deepcopy(target['address']),'nativeRejection':copy.deepcopy(row),
         'reason':row.get('reason'),'reasons':copy.deepcopy(row.get('reasons',[])),
         'blockedReasons':copy.deepcopy(row.get('blockedReasons',[]))}

def load_nad(targets):
 from stage_nad_primary import verify,validate_diagnostic_candidate
 verify(NAD_EVIDENCE)
 with zipfile.ZipFile(NAD_EVIDENCE/'original.zip')as z:
  report=json.loads(z.read('report.json'));inputs=json.loads(z.read('inputs.json'))
 expected={t['key']:adapted_nad_target(t)for t in targets};actual={r['key']:r for r in inputs['entries']}
 if any(actual.get(v['key'])!=v for v in expected.values()):raise ValueError('Extended NAD changed the deterministic native CMS adapter')
 if len([r for r in inputs['entries']if r['key'].endswith('@NPPES-PRIMARY')])!=len(targets):raise ValueError('Extended NAD native CMS scope differs')
 mapping={v['key']:key for key,v in expected.items()};candidates={};rejected=[]
 for c in report['diagnosticCandidates']:
  if c['key']not in mapping:continue
  key=mapping[c['key']];adapted=expected[key]
  if not validate_diagnostic_candidate(c,adapted,NAD_EVIDENCE):raise ValueError('Native NAD component diagnostic did not validate')
  original=copy.deepcopy(c);result=copy.deepcopy(c);result['key']=key
  candidates[key]=(result,original)
 for r in report.get('rejected',[]):
  if r['key']in mapping:
   result=copy.deepcopy(r);result['nativeTargetKey']=result['key'];result['key']=mapping[r['key']];rejected.append(result)
 return candidates,rejected,report

def load_neris(targets):
 from recover_neris_primary import (load_departments,source_objects,load_boundaries,matching_records,
                                    direct_selection,INDEX_SHA as NERIS_INDEX,SOURCE_SHA as NERIS_SOURCE)
 from address_normalization import normalize_street,source_street_line
 from primary_source_consensus import native_neris_vetoes
 objects,source_stats=source_objects(load_departments(),load_boundaries());index=collections.defaultdict(list)
 for record in objects:
  address=record['address']
  if record['addressComponent']:index[(address['state'],normalize_street(source_street_line(address['street'])))].append(record)
 candidates=[];rejected=[];blocked=[];decisions=[];outcomes=collections.Counter()
 for target in targets:
  matching=matching_records(target,index);selected,error=direct_selection(target,index)
  negative=native_neris_vetoes(target['address'],target.get('sourceCounty',''))
  witnesses=[{'nativeId':r['object']['id'],'objectId':r['object']['oid'],'sourceKind':r['kind'],
   'parentId':r['department']['id'],'addressAsReported':copy.deepcopy(r['object']['address']),
   'addressComponent':copy.deepcopy(r['addressComponent']),'coordinatesAsReported':copy.deepcopy(r['coordinates']),
   'countyFips':r['countyFips'],'withheldReason':r['withheldReason'],'matchBasis':basis}for r,basis in matching]
  decision={'key':target['key'],'targetAddress':copy.deepcopy(target['address']),'nativeRows':witnesses,
            'qualifiedVetoes':negative,'selectionError':error}
  decisions.append(decision)
  if negative:
   rejected.append({'key':target['key'],'targetAddress':copy.deepcopy(target['address']),'reasons':negative,'nativeRows':witnesses})
   outcomes['qualified-native-conflict']+=1
  elif selected is not None:
   candidates.append(selected);outcomes['accepted-native-address-point']+=1
  elif matching:
   blocked.append({'key':target['key'],'targetAddress':copy.deepcopy(target['address']),
                   'reason':error or'no-qualified-native-point','nativeRows':witnesses})
   outcomes['native-address-point-withheld']+=1
  else:outcomes['no-native-address-match']+=1
 return {'source':'neris-complete-native-address-catalog','nativeIndexSha256':NERIS_INDEX,'sourceSha256':NERIS_SOURCE,
  'nativeObjectsAudited':len(objects),'nativeTargetsSha256':current_pins()[1],'targetCount':len(targets),
  'sourceStats':source_stats,'candidates':candidates,'rejected':rejected,'blocked':blocked,'decisions':decisions,
  'outcomes':dict(sorted(outcomes.items())),
  'association':'generic source address point; no department or station organization identity is inferred'}

def collect_sources(snapshot,targets):
 desired={t['key']:t for t in targets};scopes={key:bucket()for key in desired};digests={}
 strict,_=verify_strict()
 with zipfile.ZipFile(STRICT_EVIDENCE/'original.zip')as z:
  federal={source:json.loads(z.read('reports/'+source+'.json'))for source in('usgs','hifld-ems','hifld-fire')}
 for source,report in sorted(federal.items()):
  digests[source]=sha(dump(report))
  for c in report['candidates']:scopes[c['key']]['pointObservations'].append(observation(source,c,desired[c['key']]))
  for row in report.get('rejected',[]):
   if row['key']not in desired:raise ValueError('Unexpected native federal rejection key')
   scopes[row['key']]['pointConflicts'].append(reject_binding(source,row,desired[row['key']]))
 city,_,city_manifest=verify_city();digests['federal-city']=city_manifest['reportSha256']
 # Preserve all accepted source-native city endpoints, not just the city winner.
 for source,report in sorted(city['sourceReports'].items()):
  for c in report['candidates']:
   if c['scope']!='cms-native':continue
   target=desired.get(c['key'])
   if target is None or c['targetInput']!=target:raise ValueError('City source-native target changed')
   for point in c['acceptedPointObservations']:
    row={'key':target['key'],'address':target['address'],'originalAddress':target['address'],
         'countyFips':point['point']['countyFips'],'match':point}
    scopes[target['key']]['pointObservations'].append(observation('federal-city:'+source,row,target,False))
 for c in city['diagnosticCandidates']:
  target=desired.get(c['key'])
  if target is None or c.get('diagnosticInput')!=target or not validate_federal_city_diagnostic_candidate(c):
   raise ValueError('Retained city component proof changed')
  scopes[c['key']]['pointObservations'].append(observation('federal-city',c,target))
 for row in city['rejected']:
  if row['scope']!='cms-native':continue
  target=desired.get(row['key'])
  if target is None:raise ValueError('Unexpected city native target rejection')
  scopes[row['key']]['pointConflicts'].append(reject_binding('federal-city',row,target))
 nad,nad_rejected,nad_report=load_nad(targets);digests['nad']=sha(dump(nad_report))
 for key,(candidate,native_candidate)in nad.items():
  observed=observation('nad',candidate,desired[key]);observed['sourceCandidateSha256']=sha(dump(native_candidate));observed['nativeTargetKey']=native_candidate['key']
  scopes[key]['pointObservations'].append(observed)
 for row in nad_rejected:scopes[row['key']]['pointConflicts'].append(reject_binding('nad',row,desired[row['key']]))
 neris=load_neris(targets);digests['neris']=sha(dump(neris))
 for c in neris['candidates']:scopes[c['key']]['pointObservations'].append(observation('neris',c,desired[c['key']]))
 for row in neris['rejected']:scopes[row['key']]['pointConflicts'].append(reject_binding('neris',row,desired[row['key']]))
 for row in neris['blocked']:scopes[row['key']]['pointBlocks'].append(reject_binding('neris',row,desired[row['key']]))
 from retain_overture_primary_variants import overture_diagnostic_catalog,validate_overture_diagnostic_candidate
 for method in('overture-address','overture-place-address'):
  catalog=overture_diagnostic_catalog(method);digests[method]=catalog['reportSha256']
  if any(catalog['targets'].get(key)!=target for key,target in desired.items()):raise ValueError('Overture source is missing the exact complete native component scope')
  for key,target in desired.items():
   candidate=catalog['candidates'].get(key)
   if candidate is None:continue
   if not validate_overture_diagnostic_candidate(candidate,target):raise ValueError('Overture diagnostic source/native target failed replay')
   if candidate.get('originalPrimaryAddress')!=target['componentEvidence']['originalCombinedAddress']:
    raise ValueError('Overture native component lost original primary address binding')
   scopes[key]['pointObservations'].append(observation(method,candidate,target,True,target['componentEvidence']))
  for row in catalog['rejected']:
   if row['key']not in desired:continue
   target=desired[row['key']];bound=reject_binding(method,row,target)
   reasons={row.get('reason'),*row.get('blockedReasons',[]),*row.get('reasons',[])}
   field='pointConflicts'if reasons&POSITIVE_OVERTURE else'pointBlocks'
   scopes[row['key']][field].append(bound)
  for row in catalog.get('uncertain',[]):
   if not isinstance(row,dict)or row.get('key')not in desired:raise ValueError('Incomplete provenance must retain an exact native target witness')
   scopes[row['key']]['pointBlocks'].append(reject_binding(method,row,desired[row['key']]))
 from retain_tiger_primary import validated_catalog,validate_tiger_diagnostic_candidate,tiger_diagnostic_range_witnesses
 tiger,tiger_inputs,tiger_manifest=validated_catalog();digests['tiger']=tiger_manifest['members']['report.json']['sha256']
 source_cms={r['entry']['key']:r['entry']for r in tiger_inputs['targets']if r['scope']=='cms-native'}
 if source_cms!=desired:raise ValueError('Complete native range capture did not use the frozen CMS target scope')
 for c in tiger['diagnosticCandidates']:
  if c['scope']!='cms-native':continue
  target=desired.get(c['key'])
  if target is None or c['diagnosticInput']!=target or not validate_tiger_diagnostic_candidate(c):
   raise ValueError('Native range component diagnostic failed replay')
  scopes[c['key']]['rangeObservations'].append(observation('tiger',c,target))
  scopes[c['key']]['rangePointObservations'].extend(tiger_diagnostic_range_witnesses(c))
 for row in tiger['rejected']:
  if row['scope']!='cms-native':continue
  scopes[row['key']]['rangeConflicts'].append(reject_binding('tiger',row,desired[row['key']]))
 if set(digests)!=REQUIRED_SOURCES:raise ValueError('Extended native component source audit is incomplete')
 return scopes,digests

def choose_location(scope,witnesses):
 selectable=[o for o in scope['pointObservations']if o['selectable']]
 if scope['pointConflicts']:return None,'qualified-native-source-conflict'
 if selectable:
  if not witnesses:raise ValueError('Accepted source point has no complete native endpoints')
  if len({w['countyFips']for w in witnesses})!=1 or any(distance_m(a,b)>75 for i,a in enumerate(witnesses)for b in witnesses[i+1:]):
   return None,'qualified-source-coordinate-disagreement'
  ordered=sorted(selectable,key=lambda o:(o['candidate']['match']['point'].get('precision')=='blockface',
                     o['candidate']['match']['point'].get('placement')in('Unknown','Other'),
                     POINT_ORDER[o['candidate']['match']['method']],o['source']))
  return ordered[0],'native-component-address-point'
 if scope['pointObservations']:return None,'qualified-point-without-selectable-profile'
 if scope['pointBlocks']:return None,'incomplete-or-unqualified-native-point-source'
 if scope['rangeConflicts']:return None,'native-range-source-conflict'
 if scope['rangeObservations']:
  points=scope['rangePointObservations']
  if not points or len({p['point']['countyFips']for p in points})!=1 or any(distance_m(a,b)>75 for i,a in enumerate(points)for b in points[i+1:]):
   return None,'conflicting-native-ranges'
  return sorted(scope['rangeObservations'],key=lambda o:o['candidate']['match']['point']['nativeId'])[0],'native-component-range-fallback'
 return None,'no-independent-location'

def generate(snapshot,targets,native,scopes,digests):
 native_sha,target_sha=current_pins();desired={t['key']:t for t in targets}
 if len(desired)!=609 or set(scopes)!=set(desired)or sha(dump(targets))!=target_sha or set(digests)!=REQUIRED_SOURCES:
  raise ValueError('Extended native component input or source membership changed')
 original={e['key']:e for e in snapshot['entries']};records={r['key']:r for r in native['records']}
 candidates=[];rejected=[];decisions=[];outcomes=collections.Counter()
 for key,target in sorted(desired.items()):
  scope=scopes[key];witnesses=qualified_witnesses(scope['pointObservations'],target)if scope['pointObservations']else[]
  selected,reason=choose_location(scope,witnesses)
  decision={'key':key,'originalAddress':copy.deepcopy(original[key]['address']),'targetAddress':copy.deepcopy(target['address']),
            **copy.deepcopy(scope),'acceptedNativeWitnesses':witnesses,'outcome':reason,
            'selectedSource':selected['source']if selected else None}
  decisions.append(decision);outcomes[reason]+=1
  if selected is None:
   if reason!='no-independent-location':
    rejected.append({'key':key,'originalPrimaryKey':key,'originalAddress':copy.deepcopy(original[key]['address']),
     'targetAddress':copy.deepcopy(target['address']),'address':copy.deepcopy(target['address']),'reason':reason,
     'sourceConflicts':copy.deepcopy(scope['pointConflicts']),'pointBlocks':copy.deepcopy(scope['pointBlocks']),
     'rangeConflicts':copy.deepcopy(scope['rangeConflicts']),'qualifiedNativeWitnesses':witnesses,
     'selectionDecisionSha256':sha(dump(decision))})
   continue
  source=selected['candidate'];old=original[key];candidate={k:copy.deepcopy(old[k])for k in('key','name','source','state','sourceDate','sourceCounty')}
  candidate.update(originalAddress=copy.deepcopy(old['address']),originalStatus=old['status'],address=copy.deepcopy(target['address']),
   countyFips=source['countyFips'],match=copy.deepcopy(source['match']),primaryAddressEvidence=component_proof(records[key],target,snapshot))
  if old.get('sourceCounty')and old['sourceCounty']!=candidate['countyFips']:raise ValueError('Selected native component violated original county')
  candidates.append(candidate)
 return {'schemaVersion':2,'source':'nppes-native-primary-components-extended','method':METHOD,
  'originalPrimaryCount':46791,'baselineIndexSha256':snapshot['baselineIndexSha256'],
  'nativeTargetsSha256':target_sha,'nativeReportSha256':native_sha,'nativeTargetCount':609,
  'auditedSources':sorted(digests),'sourceReportDigests':copy.deepcopy(digests),'candidates':candidates,'rejected':rejected,
  'selectionDecisions':decisions,'outcomes':dict(sorted(outcomes.items())),
  'interpretation':'Native registered primary-practice address component. Every qualified native address-point endpoint must agree; retained numeric street-range interpolation is only a clean point-absence fallback. Source roles and actual precision remain unchanged.'}

def dependencies():
 result={}
 for name,path in [('native-cms',NATIVE_EVIDENCE),('strict-components',STRICT_EVIDENCE),('city',CITY_EVIDENCE),
                   ('nad-extended',NAD_EVIDENCE),('overture-native-variants',OVERTURE_EVIDENCE),('tiger-native',TIGER_EVIDENCE)]:
  result[name]={'archiveSha256':digest_file(path/'original.zip'),'manifestSha256':sha((path/'manifest.json').read_bytes())}
 from recover_neris_primary import INDEX_SHA as NERIS_INDEX,SOURCE_SHA as NERIS_SOURCE
 result['native-neris']={'indexSha256':NERIS_INDEX,'sourceSha256':NERIS_SOURCE}
 result['native-consensus-code']={'sha256':sha((ROOT/'scripts/data/primary_source_consensus.py').read_bytes())}
 return result

def summary(report,manifest):
 return {'schemaVersion':1,'method':METHOD,'originalPrimaryCount':46791,'nativeTargetCount':609,
  'candidateCount':len(report['candidates']),'archiveSha256':manifest['archiveSha256'],
  'reportSha256':manifest['reportSha256'],'nativeTargetsSha256':report['nativeTargetsSha256'],
  'outcomes':report['outcomes'],'byMethod':dict(sorted(collections.Counter(c['match']['method']for c in report['candidates']).items())),
  'candidates':[{'key':c['key'],'method':c['match']['method'],'countyFips':c['countyFips']}for c in report['candidates']],
  'rejected':[{'key':r['key'],'reason':r['reason']}for r in report['rejected']],
  'publication':'source-candidate-profile; net coverage requires combined original-denominator audit'}

def retain(output=EVIDENCE):
 snapshot,targets,native=native_inputs();scopes,digests=collect_sources(snapshot,targets);report=generate(snapshot,targets,native,scopes,digests)
 output.mkdir(parents=True,exist_ok=True);raw=dump(report)
 with zipfile.ZipFile(output/'original.zip','w',zipfile.ZIP_DEFLATED,compresslevel=9)as z:
  info=zipfile.ZipInfo('report.json',date_time=(2026,11,26,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,raw)
 runtime=dump(report['candidates']);(output/'candidates.json').write_bytes(runtime)
 manifest={'schemaVersion':2,'method':METHOD,'archiveSha256':digest_file(output/'original.zip'),
  'archiveBytes':(output/'original.zip').stat().st_size,'reportSha256':sha(raw),'candidatesSha256':sha(runtime),
  'nativeTargetCount':609,'candidateCount':len(report['candidates']),'sourceDependencies':dependencies(),
  'nativeTargetsSha256':report['nativeTargetsSha256'],'sourceReportDigests':digests,'outcomes':report['outcomes']}
 (output/'manifest.json').write_bytes(dump(manifest));(output/'summary.json').write_bytes(dump(summary(report,manifest)))
 return report,manifest

def verify(output=EVIDENCE):
 m=json.loads((output/'manifest.json').read_bytes())
 if m['method']!=METHOD or m['sourceDependencies']!=dependencies()or digest_file(output/'original.zip')!=m['archiveSha256']or(output/'original.zip').stat().st_size!=m['archiveBytes']:
  raise ValueError('Extended native component source dependency changed')
 with zipfile.ZipFile(output/'original.zip')as z:
  if z.namelist()!=['report.json']:raise ValueError('Extended native component evidence membership changed')
  raw=z.read('report.json')
 if sha(raw)!=m['reportSha256']:raise ValueError('Extended native component report changed')
 expected=json.loads(raw);snapshot,targets,native=native_inputs();scopes,digests=collect_sources(snapshot,targets)
 report=generate(snapshot,targets,native,scopes,digests)
 if report!=expected or m['sourceReportDigests']!=digests or m['nativeTargetsSha256']!=report['nativeTargetsSha256']:
  raise ValueError('Complete extended native source consensus replay differs')
 runtime=(output/'candidates.json').read_bytes()
 if runtime!=dump(report['candidates'])or sha(runtime)!=m['candidatesSha256']or len(report['candidates'])!=m['candidateCount']:
  raise ValueError('Extended native component runtime candidate binding changed')
 if(output/'summary.json').read_bytes()!=dump(summary(report,m)):raise ValueError('Extended native component summary differs')
 return report,m

@functools.lru_cache(maxsize=1)
def runtime_indexes():
 report,_=verify();snapshot,_,_=native_inputs()
 return({c['key']:c for c in report['candidates']},{e['key']:e for e in snapshot['entries']},
        {native_key(r):r for r in snapshot['nationalRows']if native_key(r)},
        {d['key']:d for d in report['selectionDecisions']})

def validate_nppes_extended_component_primary_entry(entry,national_row=None):
 try:
  candidates,original,national,_=runtime_indexes();key=entry.get('key');c=candidates.get(key);old=original.get(key)
  return bool(c and old and entry.get('status')=='mapped'and
   all(entry.get(k)==old.get(k)for k in('key','name','source','state','sourceDate','sourceCounty'))and
   all(entry.get(k)==c.get(k)for k in('address','countyFips','match','primaryAddressEvidence'))and
   (national_row is None or national_row==national.get(key)))
 except(KeyError,ValueError,TypeError,OSError,zipfile.BadZipFile):return False

def primary_component_witnesses(entry):
 if not validate_nppes_extended_component_primary_entry(entry):raise ValueError('Unvalidated extended native component entry')
 decision=runtime_indexes()[3][entry['key']]
 if decision['outcome']=='native-component-range-fallback':return copy.deepcopy(decision['rangePointObservations'])
 return [copy.deepcopy(o['candidate']['match'])for o in decision['pointObservations']]

def main():
 p=argparse.ArgumentParser();p.add_argument('--output',type=pathlib.Path,default=EVIDENCE);p.add_argument('--report',type=pathlib.Path);p.add_argument('--verify',action='store_true');a=p.parse_args()
 report,manifest=verify(a.output)if a.verify else retain(a.output)
 if a.report:a.report.parent.mkdir(parents=True,exist_ok=True);a.report.write_bytes(dump(report))
 print(json.dumps(summary(report,manifest)),flush=True)
if __name__=='__main__':main()
