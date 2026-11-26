#!/usr/bin/env python3
"""Bind original native CMS primary-practice components to replayed federal points."""
import argparse,collections,copy,functools,json,math,pathlib,tempfile,zipfile
from backfill_provider_locations import ROOT,SOURCE,sha,digest_file,native_key
from recover_nppes_native_primary import ARCHIVE_SHA,SOURCE_MEMBER,SOURCE_DATE,dump
from retain_nppes_native_source import DEFAULT as NATIVE_EVIDENCE,current_pins,verify as verify_native
from retain_federal_primary_points import evidence_directory,retained_files
from stage_usgs_primary import SOURCES,validate_inventory,match_inventory,distance_m

METHOD='nppes-primary-address-components'
EVIDENCE=ROOT/'scripts/data/evidence/primary-nppes-components/2026-11-26'
SOURCE_IDS={'usgs','hifld-ems','hifld-fire'}

def inputs():
 native_sha,target_sha=current_pins()
 if not native_sha or not target_sha:raise ValueError('Native source edition is not retained')
 with zipfile.ZipFile(NATIVE_EVIDENCE/'original.zip')as z:
  snapshot=json.loads(z.read('inputs/original-snapshot.json'));targets_raw=z.read('inputs/native-component-targets.json');native_raw=z.read('source/native-primary.json')
 if sha(targets_raw)!=target_sha or sha(native_raw)!=native_sha:raise ValueError('Native CMS source/input hash changed')
 return snapshot,json.loads(targets_raw),json.loads(native_raw)

def component_proof(record,target,snapshot):
 native_sha,_=current_pins()
 return {'method':METHOD,'association':'source-native','siteRole':'registered-primary-practice',
  'originalAddress':copy.deepcopy(record['originalCombinedAddress']),'originalStatus':record['originalStatus'],
  'sourceUrl':SOURCE,'sourceArchiveSha256':ARCHIVE_SHA,'sourceMember':SOURCE_MEMBER,'sourceDate':SOURCE_DATE,
  'nativeReportSha256':native_sha,'nativeRecordSha256':record['nativeRecordSha256'],'sourceRowNumber':record['sourceRowNumber'],
  'npi':record['npi'],'legalName':record['name'],'primaryAddressAsReported':copy.deepcopy(record['primaryAddress']),
  'selectedField':target['componentEvidence']['sourceField'],'rule':'unambiguous-native-primary-line',
  'baselineIndexSha256':snapshot['baselineIndexSha256'],'nationalRegistrySha256':snapshot['nationalRegistrySha256']}

def qualified_witnesses(observations,target):
 from primary_source_consensus import point_witnesses
 result=[]
 for observed in observations:
  match=observed['candidate']['match'];native=point_witnesses(match,target['address'])
  if not native:raise ValueError('Qualified native point has no retained source witnesses')
  if not any(w['latitude']==match['latitude']and w['longitude']==match['longitude']and w['countyFips']==observed['candidate']['countyFips']for w in native):
   raise ValueError('Selected source point is absent from native witnesses')
  for witness in native:
   if (witness['method']!=match['method']or not all(type(witness.get(k))in(int,float)and math.isfinite(witness[k])for k in('latitude','longitude'))):
    raise ValueError('Invalid native consensus witness')
   result.append({'source':observed['source'],**copy.deepcopy(witness)})
 return result

def generate(snapshot,targets,native,reports):
 native_sha,target_sha=current_pins()
 if set(reports)!=SOURCE_IDS or len(targets)!=609 or sha(dump(targets))!=target_sha:raise ValueError('Complete native component source scope changed')
 original={e['key']:e for e in snapshot['entries']};records={e['key']:e for e in native['records']};desired={t['key']:t for t in targets}
 points=collections.defaultdict(list);vetoes=collections.defaultdict(list)
 for source,report in sorted(reports.items()):
  spec=SOURCES[source]
  if(report.get('source')!=source or report.get('baselineIndexSha256')!=target_sha or
     report.get('sourceStats',{}).get('completeRowsScanned')!=spec['expectedCount']or report.get('sourceStats',{}).get('coordinateAuditRowsScanned')!=spec['expectedCount']):
   raise ValueError('Federal diagnostic does not cover the complete frozen native component scope')
  seen=set()
  for c in report['candidates']:
   target=desired.get(c['key'])
   if(not target or c['key']in seen or c['originalAddress']!=target['address']or c['address']!=target['address']or
      c['originalStatus']!=target['status']or c['state']!=target['state']or c['source']!=target['source']or
      c['match']['method']!=spec['method']or c['countyFips']!=c['match']['point']['countyFips']):
    raise ValueError('Federal diagnostic changed native target identity/address')
   seen.add(c['key']);points[c['key']].append({'source':source,'candidate':copy.deepcopy(c)})
  for row in report.get('rejected',[]):
   if row['key']not in desired:raise ValueError('Unexpected native component rejection')
   vetoes[row['key']].append({'source':source,**copy.deepcopy(row)})
 candidates=[];rejected=[];decisions=[];outcomes=collections.Counter()
 for target in targets:
  key=target['key'];old=original[key];observed=points.get(key,[]);witnesses=qualified_witnesses(observed,target)if observed else[]
  reason=None
  if vetoes.get(key):reason='qualified-native-source-conflict'
  elif not observed:reason='no-independent-address-point'
  elif len({w['countyFips']for w in witnesses})!=1 or any(distance_m(a,b)>75 for i,a in enumerate(witnesses)for b in witnesses[i+1:]):
   reason='qualified-source-coordinate-disagreement'
  decision={'key':key,'address':target['address'],'pointObservations':observed,'acceptedNativeWitnesses':witnesses,'sourceConflicts':vetoes.get(key,[]),'outcome':reason or'native-component-address-point'}
  decisions.append(decision)
  if reason:
   outcomes[reason]+=1
   if reason!='no-independent-address-point':rejected.append({'key':key,'reason':reason,'address':copy.deepcopy(target['address']),'originalAddress':copy.deepcopy(old['address']),'selectionDecisionSha256':sha(dump(decision))})
   continue
  observed.sort(key=lambda v:(v['candidate']['match']['point']['precision']=='blockface',{'usgs':0,'hifld-ems':1,'hifld-fire':2}[v['source']]))
  selected=observed[0]['candidate'];candidate={k:copy.deepcopy(old[k])for k in('key','name','source','state','sourceDate','sourceCounty')}
  candidate.update(originalAddress=copy.deepcopy(old['address']),originalStatus=old['status'],address=copy.deepcopy(target['address']),countyFips=selected['countyFips'],match=copy.deepcopy(selected['match']),primaryAddressEvidence=component_proof(records[key],target,snapshot))
  candidates.append(candidate);outcomes['native-component-address-point']+=1
 return {'schemaVersion':2,'source':'nppes-native-primary-components','method':METHOD,'originalPrimaryCount':46791,
  'nativeTargetCount':len(targets),'nativeTargetsSha256':target_sha,'baselineIndexSha256':snapshot['baselineIndexSha256'],
  'nativeReportSha256':native_sha,'auditedSources':sorted(reports),'sourceReportDigests':{s:sha(dump(r))for s,r in sorted(reports.items())},
  'candidates':sorted(candidates,key=lambda c:c['key']),'rejected':rejected,'selectionDecisions':decisions,
  'outcomes':dict(sorted(outcomes.items())),'limitations':'Native registered primary-practice component with independently matched address location; source precision retained and no current headquarters or building-occupancy claim.'}

def replay_federal(source,expected,targets):
 evidence=evidence_directory(source);manifest=json.loads((evidence/'manifest.json').read_bytes())
 if digest_file(evidence/'original.zip')!=manifest['archiveSha256']:raise ValueError('Federal source archive changed')
 with tempfile.TemporaryDirectory(prefix='atlas-cms-federal-')as temporary:
  directory=pathlib.Path(temporary)
  with zipfile.ZipFile(evidence/'original.zip')as z:
   inventory=json.loads(z.read('source/inventory.json'))
   for name in retained_files(directory,inventory):
    member='source/'+name
    if pathlib.PurePosixPath(member).is_absolute()or'..'in pathlib.PurePosixPath(member).parts:raise ValueError('Unsafe federal source member')
    z.extract(member,directory)
  validate_inventory(directory/'source',inventory)
  actual=match_inventory(directory/'source',inventory,targets,current_pins()[1])
  if expected is not None and actual!=expected:raise ValueError('Native component diagnostic failed full federal replay: '+source)
  return actual

def dependencies():
 result={}
 for name,path in [('native-cms',NATIVE_EVIDENCE),*((s,evidence_directory(s))for s in sorted(SOURCE_IDS))]:
  result[name]={'archiveSha256':digest_file(path/'original.zip'),'manifestSha256':sha((path/'manifest.json').read_bytes())}
 result['native-consensus-code']={'sha256':sha((ROOT/'scripts/data/primary_source_consensus.py').read_bytes())}
 return result

def retain(reports=None,output=EVIDENCE):
 verify_native(NATIVE_EVIDENCE);snapshot,targets,native=inputs()
 if reports is None:reports={s:replay_federal(s,None,targets)for s in sorted(SOURCE_IDS)}
 else:
  for source,report in sorted(reports.items()):replay_federal(source,report,targets)
 result=generate(snapshot,targets,native,reports);output.mkdir(parents=True,exist_ok=True)
 members={'report.json':dump(result),**{'reports/'+s+'.json':dump(r)for s,r in reports.items()}}
 with zipfile.ZipFile(output/'original.zip','w',zipfile.ZIP_DEFLATED,compresslevel=9)as z:
  for name,raw in sorted(members.items()):
   info=zipfile.ZipInfo(name,date_time=(2026,11,26,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,raw)
 runtime=dump(result['candidates']);(output/'candidates.json').write_bytes(runtime)
 native_sha,target_sha=current_pins()
 manifest={'schemaVersion':2,'method':METHOD,'nativeTargetsSha256':target_sha,'nativeReportSha256':native_sha,
  'archiveSha256':digest_file(output/'original.zip'),'archiveBytes':(output/'original.zip').stat().st_size,
  'sourceDependencies':dependencies(),'candidateCount':len(result['candidates']),'candidatesSha256':sha(runtime),
  'members':{n:sha(r)for n,r in members.items()},'outcomes':result['outcomes']}
 (output/'manifest.json').write_bytes(dump(manifest));return result,manifest

def verify(output=EVIDENCE,complete=True):
 manifest=json.loads((output/'manifest.json').read_bytes());native_sha,target_sha=current_pins()
 if(manifest['method']!=METHOD or manifest['nativeTargetsSha256']!=target_sha or manifest['nativeReportSha256']!=native_sha or dependencies()!=manifest['sourceDependencies']or digest_file(output/'original.zip')!=manifest['archiveSha256']):
  raise ValueError('Native component evidence/source dependency changed')
 required={'report.json',*('reports/'+s+'.json'for s in SOURCE_IDS)}
 with zipfile.ZipFile(output/'original.zip')as z:
  if set(z.namelist())!=required or len(z.namelist())!=len(required):raise ValueError('Unexpected component evidence membership')
  data={}
  for name in required:
   raw=z.read(name)
   if sha(raw)!=manifest['members'][name]:raise ValueError('Retained component report changed')
   data[name]=json.loads(raw)
 snapshot,targets,native=inputs();reports={s:data['reports/'+s+'.json']for s in SOURCE_IDS}
 if complete:
  verify_native(NATIVE_EVIDENCE)
  for s,r in sorted(reports.items()):replay_federal(s,r,targets)
 result=generate(snapshot,targets,native,reports);runtime=(output/'candidates.json').read_bytes()
 if result!=data['report.json']or runtime!=dump(result['candidates'])or sha(runtime)!=manifest['candidatesSha256']or len(result['candidates'])!=manifest['candidateCount']:
  raise ValueError('Native component consensus replay changed')
 return result,manifest

@functools.lru_cache(maxsize=1)
def candidate_index():
 report,_=verify();snapshot,_,_=inputs()
 return ({c['key']:c for c in report['candidates']},{e['key']:e for e in snapshot['entries']},
         {native_key(r):r for r in snapshot['nationalRows']if native_key(r)},
         {d['key']:d for d in report['selectionDecisions']})

def validate_nppes_component_primary_entry(entry,national_row=None):
 try:
  candidates,originals,national,_=candidate_index();c=candidates.get(entry.get('key'));old=originals.get(entry.get('key'))
  return bool(c and old and entry.get('status')=='mapped'and all(entry.get(k)==old.get(k)for k in('key','name','source','state','sourceDate','sourceCounty'))and all(entry.get(k)==c.get(k)for k in('address','countyFips','match','primaryAddressEvidence'))and(national_row is None or national_row==national.get(entry['key'])))
 except(ValueError,KeyError,TypeError,OSError,zipfile.BadZipFile):return False

def primary_component_witnesses(entry):
 if not validate_nppes_component_primary_entry(entry):raise ValueError('Unvalidated component entry')
 return [copy.deepcopy(o['candidate']['match'])for o in candidate_index()[3][entry['key']]['pointObservations']]

def main():
 p=argparse.ArgumentParser();p.add_argument('--diagnostic',action='append',default=[])
 p.add_argument('--report',type=pathlib.Path);p.add_argument('--output',type=pathlib.Path,default=EVIDENCE);p.add_argument('--verify',action='store_true');a=p.parse_args()
 if a.verify:r,m=verify(a.output)
 else:
  reports={}
  for value in a.diagnostic:
   source,path=value.split('=',1)
   if source in reports:raise ValueError('Duplicate source diagnostic')
   reports[source]=json.loads(pathlib.Path(path).read_bytes())
  r,m=retain(reports or None,a.output)
 if a.report:a.report.parent.mkdir(parents=True,exist_ok=True);a.report.write_bytes(dump(r))
 print(json.dumps({'candidateCount':len(r['candidates']),'archiveSha256':m['archiveSha256'],'outcomes':r['outcomes']}),flush=True)
if __name__=='__main__':main()
