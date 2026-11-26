#!/usr/bin/env python3
"""Retained exact-city profile; all source postal values and native witnesses remain actual."""
import argparse,collections,copy,functools,json,pathlib,tempfile,zipfile
from backfill_provider_locations import ROOT,sha,digest_file,native_key
from stage_usgs_primary import SOURCES,distance_m,dump
from diagnose_federal_city_fallback import diagnose
from retain_federal_primary_points import evidence_directory,retained_files
from retain_nppes_native_source import DEFAULT as NATIVE_EVIDENCE
from recover_nppes_primary_components import EVIDENCE as STRICT_COMPONENT_EVIDENCE,inputs as native_inputs

PROFILE='exact-street-city-state-native-postal-difference'
EVIDENCE=ROOT/'scripts/data/evidence/primary-federal-city-fallback/2026-11-26'

def inputs():
 snapshot,components,_=native_inputs();targets=[('original',e)for e in snapshot['entries']]+[('cms-native',e)for e in components]
 vetoes=set();strict_points=collections.defaultdict(list)
 with zipfile.ZipFile(STRICT_COMPONENT_EVIDENCE/'original.zip')as z:cms={s:json.loads(z.read('reports/'+s+'.json'))for s in SOURCES}
 for source in SOURCES:
  with zipfile.ZipFile(evidence_directory(source)/'original.zip')as z:original=json.loads(z.read('primary-candidates.json'))
  for scope,report in [('original',original),('cms-native',cms[source])]:
   vetoes.update((scope,r['key'])for r in report.get('rejected',[]))
   for c in report['candidates']:strict_points[(scope,c['key'])].append(c['match'])
 return snapshot,targets,vetoes,strict_points

def dependencies():
 result={}
 for name,path in [('native-cms',NATIVE_EVIDENCE),('strict-cms-points',STRICT_COMPONENT_EVIDENCE),*((s,evidence_directory(s))for s in SOURCES)]:
  result[name]={'archiveSha256':digest_file(path/'original.zip'),'manifestSha256':sha((path/'manifest.json').read_bytes())}
 result['native-consensus-code']={'sha256':sha((ROOT/'scripts/data/primary_source_consensus.py').read_bytes())}
 return result

def complete_reports(targets,vetoes):
 reports={}
 for source in SOURCES:
  evidence=evidence_directory(source);manifest=json.loads((evidence/'manifest.json').read_bytes())
  if digest_file(evidence/'original.zip')!=manifest['archiveSha256']:raise ValueError('Federal native source archive changed')
  with tempfile.TemporaryDirectory(prefix='atlas-federal-city-')as temporary:
   directory=pathlib.Path(temporary)
   with zipfile.ZipFile(evidence/'original.zip')as z:
    inventory=json.loads(z.read('source/inventory.json'))
    for name in retained_files(directory,inventory):
     if pathlib.PurePosixPath(name).is_absolute()or'..'in pathlib.PurePosixPath(name).parts:raise ValueError('Unsafe source member')
     z.extract('source/'+name,directory)
   reports[source]=diagnose(source,directory/'source',targets,vetoes)
 return reports

def generate(snapshot,reports,strict_points):
 from primary_source_consensus import point_witnesses
 if set(reports)!=set(SOURCES):raise ValueError('Every complete federal source audit is required')
 groups=collections.defaultdict(list);native_rejections=collections.defaultdict(list)
 for source in SOURCES:
  report=reports[source]
  for c in report['candidates']:groups[(c['scope'],c['key'])].append((source,c))
  for row in report.get('rejected',[]):native_rejections[(row['scope'],row['key'])].append({'source':source,**copy.deepcopy(row)})
 candidates=[];diagnostics=[];rejected=[];decisions=[]
 for scope,key in sorted(set(groups)|set(native_rejections)):
  options=groups.get((scope,key),[])
  address=options[0][1]['targetInput']['address']if options else native_rejections[(scope,key)][0]['address']
  observations=[{'source':source,'match':copy.deepcopy(m)}for source,c in options for m in c['acceptedPointObservations']]
  witnesses=[{'method':o['match']['method'],'latitude':o['match']['latitude'],'longitude':o['match']['longitude'],'countyFips':o['match']['point']['countyFips'],'nativeId':o['match']['point']['nativeId']}for o in observations]
  for match in strict_points.get((scope,key),[]):witnesses.extend(point_witnesses(match,address))
  reason=None
  if native_rejections.get((scope,key)):reason='native-city-source-conflict'
  elif len({p['countyFips']for p in witnesses})>1 or any(distance_m(a,b)>75 for i,a in enumerate(witnesses)for b in witnesses[i+1:]):reason='qualified-source-point-disagreement'
  decision={'scope':scope,'key':key,'address':copy.deepcopy(address),'acceptedPointObservations':observations,
            'acceptedNativeWitnesses':witnesses,'sourceConflicts':native_rejections.get((scope,key),[]),'outcome':reason or'accepted'}
  decisions.append(decision)
  if reason:
   rejected.append({'scope':scope,'key':key,'address':copy.deepcopy(address),'reason':reason,
                    'sourceConflicts':native_rejections.get((scope,key),[]),'acceptedNativeWitnesses':witnesses});continue
  options.sort(key=lambda v:(v[1]['match']['point']['precision']=='blockface',{'usgs':0,'hifld-ems':1,'hifld-fire':2}[v[0]]))
  source,selected=options[0];target=selected['targetInput'];c={k:copy.deepcopy(target[k])for k in('key','name','source','state','sourceDate','sourceCounty')}
  match=copy.deepcopy(selected['match']);match['sourceAddressProfile']=PROFILE
  c.update(originalAddress=copy.deepcopy(target['address']),originalStatus=target['status'],address=copy.deepcopy(target['address']),
           countyFips=selected['countyFips'],match=match,scope=scope,profile=PROFILE,corroboratingSources=[s for s,_ in options])
  if scope=='original':candidates.append(c)
  else:c['diagnosticInput']=copy.deepcopy(target);diagnostics.append(c)
 return {'schemaVersion':2,'source':'federal-exact-city-native-postal-difference','profile':PROFILE,'originalPrimaryCount':46791,
  'baselineIndexSha256':snapshot['baselineIndexSha256'],'candidates':candidates,'diagnosticCandidates':diagnostics,'rejected':rejected,
  'selectionDecisions':decisions,'sourceReports':reports,'sourceReportDigests':{s:sha(dump(r))for s,r in reports.items()},
  'interpretation':'Exact native house/street and city/state; actual differing or absent source ZIP remains unchanged. No same-street/state native row exists at the target ZIP. All native source points and complete coordinate reuse/county audits remain bound.'}

def retain(output=EVIDENCE):
 snapshot,targets,vetoes,strict_points=inputs();reports=complete_reports(targets,vetoes);report=generate(snapshot,reports,strict_points)
 output.mkdir(parents=True,exist_ok=True);raw=dump(report)
 with zipfile.ZipFile(output/'original.zip','w',zipfile.ZIP_DEFLATED,compresslevel=9)as z:
  info=zipfile.ZipInfo('report.json',date_time=(2026,11,26,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,raw)
 runtime=dump({'candidates':report['candidates'],'diagnosticCandidates':report['diagnosticCandidates']});(output/'candidates.json').write_bytes(runtime)
 manifest={'schemaVersion':2,'profile':PROFILE,'originalPrimaryCount':46791,'sourceDependencies':dependencies(),
  'archiveSha256':digest_file(output/'original.zip'),'archiveBytes':(output/'original.zip').stat().st_size,
  'reportSha256':sha(raw),'candidatesSha256':sha(runtime),'candidateCount':len(report['candidates']),'diagnosticCandidateCount':len(report['diagnosticCandidates'])}
 (output/'manifest.json').write_bytes(dump(manifest));return report,manifest

def verify(output=EVIDENCE,complete=True):
 m=json.loads((output/'manifest.json').read_bytes())
 if m['profile']!=PROFILE or m['sourceDependencies']!=dependencies()or digest_file(output/'original.zip')!=m['archiveSha256']or(output/'original.zip').stat().st_size!=m['archiveBytes']:raise ValueError('Native city profile dependency changed')
 with zipfile.ZipFile(output/'original.zip')as z:
  if z.namelist()!=['report.json']:raise ValueError('Native city profile membership changed')
  raw=z.read('report.json')
 if sha(raw)!=m['reportSha256']:raise ValueError('City source report changed')
 report=json.loads(raw);snapshot,targets,vetoes,strict_points=inputs();reports=complete_reports(targets,vetoes)if complete else report['sourceReports']
 if generate(snapshot,reports,strict_points)!=report:raise ValueError('Native city consensus replay changed')
 runtime=(output/'candidates.json').read_bytes()
 if runtime!=dump({'candidates':report['candidates'],'diagnosticCandidates':report['diagnosticCandidates']})or sha(runtime)!=m['candidatesSha256']or len(report['candidates'])!=m['candidateCount']or len(report['diagnosticCandidates'])!=m['diagnosticCandidateCount']:raise ValueError('Native city runtime bindings changed')
 return report,snapshot,m

@functools.lru_cache(maxsize=1)
def validated_catalog():return verify()

@functools.lru_cache(maxsize=1)
def runtime_indexes():
 report,snapshot,_=validated_catalog()
 return({c['key']:c for c in report['candidates']},{e['key']:e for e in snapshot['entries']},
        {native_key(r):r for r in snapshot['nationalRows']if native_key(r)},
        {c['key']:c for c in report['diagnosticCandidates']},{(d['scope'],d['key']):d for d in report['selectionDecisions']})

def validate_federal_city_primary_entry(entry,national_row=None):
 try:
  candidates,originals,national,_,_=runtime_indexes();c=candidates.get(entry.get('key'));old=originals.get(entry.get('key'))
  return bool(c and old and entry.get('status')=='mapped'and not entry.get('primaryAddressEvidence')and
   all(entry.get(k)==old.get(k)for k in('key','name','source','state','sourceDate','sourceCounty','address'))and
   all(entry.get(k)==c.get(k)for k in('countyFips','match'))and(national_row is None or national_row==national.get(entry['key'])))
 except(KeyError,ValueError,TypeError,OSError,zipfile.BadZipFile):return False

def validate_federal_city_diagnostic_candidate(candidate):
 try:return candidate==runtime_indexes()[3].get(candidate.get('key'))
 except(KeyError,ValueError,TypeError,OSError,zipfile.BadZipFile):return False

def federal_city_witnesses(entry):
 if not validate_federal_city_primary_entry(entry):raise ValueError('Unvalidated city profile entry')
 return copy.deepcopy(runtime_indexes()[4][('original',entry['key'])]['acceptedNativeWitnesses'])

def federal_city_diagnostic_witnesses(candidate):
 if not validate_federal_city_diagnostic_candidate(candidate):raise ValueError('Unvalidated native component city candidate')
 return copy.deepcopy(runtime_indexes()[4][('cms-native',candidate['key'])]['acceptedNativeWitnesses'])

def main():
 p=argparse.ArgumentParser();p.add_argument('--output',type=pathlib.Path,default=EVIDENCE);p.add_argument('--report',type=pathlib.Path);p.add_argument('--verify',action='store_true');a=p.parse_args()
 if a.verify:r,_,m=verify(a.output)
 else:r,m=retain(a.output)
 if a.report:a.report.parent.mkdir(parents=True,exist_ok=True);a.report.write_bytes(dump(r))
 print(json.dumps({k:m[k]for k in('candidateCount','diagnosticCandidateCount','archiveSha256')}),flush=True)
if __name__=='__main__':main()
