#!/usr/bin/env python3
"""Freeze and independently replay native TIGER interpolation evidence.

The complete immutable county source packs remain in the source-only checkpoint.
This edition binds them, the exact original/native input scopes, native identity
proofs and all positive/negative range decisions. No network access is used.
"""
import argparse,copy,functools,json,pathlib,tempfile,zipfile
from backfill_provider_locations import ROOT,sha,digest_file,native_key
from stage_tiger_primary import METHOD,dump
from checkpoint_tiger_source import EVIDENCE as SOURCE_CACHE,extract as extract_source
from match_tiger_primary import source_inputs,match,CORE_PATH,CORE_SHA,canonical_legacy_audit
from retain_nppes_native_source import DEFAULT as CMS_SOURCE,verify as verify_cms

EVIDENCE=ROOT/'scripts/data/evidence/primary-tiger-native/2026-11-26'
DEFAULT=EVIDENCE

def native_snapshot():
 with zipfile.ZipFile(CMS_SOURCE/'original.zip')as z:return json.loads(z.read('inputs/original-snapshot.json'))

@functools.lru_cache(maxsize=1)
def validated_dependencies():
 verify_cms(CMS_SOURCE)
 canonical_legacy_audit()
 return True

def dependencies(source_cache=SOURCE_CACHE):
 _,legacy=canonical_legacy_audit()
 manifest=json.loads((source_cache/'manifest.json').read_bytes())
 if sha(CORE_PATH.read_bytes())!=CORE_SHA:raise ValueError('Frozen core native target file changed')
 return {'nativeCms':{'archiveSha256':digest_file(CMS_SOURCE/'original.zip'),'manifestSha256':sha((CMS_SOURCE/'manifest.json').read_bytes())},
  'nativeNerisLegacyAudit':legacy,'coreNativeTargetsSha256':CORE_SHA,
  'sourceCache':{'manifestSha256':sha((source_cache/'manifest.json').read_bytes()),
                 'archiveSha256':digest_file(source_cache/'original.zip'),
                 'sourceInventorySha256':manifest['sourceInventorySha256'],
                 'sourceArchives':copy.deepcopy(manifest['sourceArchives'])}}

def write_archive(path,members):
 with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED,compresslevel=9)as z:
  for name,raw in sorted(members.items()):
   info=zipfile.ZipInfo(name,date_time=(2026,11,26,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,raw)

def retain(extra_path=None,output=EVIDENCE,source_cache=SOURCE_CACHE):
 validated_dependencies();extra_raw=extra_path.read_bytes()if extra_path else dump([])
 extras=json.loads(extra_raw)
 with tempfile.TemporaryDirectory(prefix='atlas-tiger-range-retain-')as temporary:
  directory=pathlib.Path(temporary);extract_source(source_cache,directory);inventory,inputs=source_inputs(directory)
  report=match(directory,inventory,inputs,extras,extra_targets_raw=extra_raw)
  members={'report.json':dump(report),'inputs/source-inputs.json':dump(inputs),'inputs/additional-native-targets.json':extra_raw}
 output.mkdir(parents=True,exist_ok=True);write_archive(output/'original.zip',members)
 runtime=dump({'candidates':report['candidates'],'diagnosticCandidates':report['diagnosticCandidates']})
 (output/'candidates.json').write_bytes(runtime)
 manifest={'schemaVersion':2,'method':METHOD,'originalPrimaryCount':46791,
  'candidateCount':len(report['candidates']),'diagnosticCandidateCount':len(report['diagnosticCandidates']),
  'sourceDependencies':dependencies(source_cache),'sourceInventorySha256':report['sourceInventorySha256'],
  'sourceCountyFileCount':report['sourceCountyFileCount'],'sourceCount':report['sourceRowCount'],
  'targetsSha256':report['targetsSha256'],'additionalDiagnosticTargetsSha256':report['additionalDiagnosticScope']['sha256'],
  'archiveSha256':digest_file(output/'original.zip'),'archiveBytes':(output/'original.zip').stat().st_size,
  'members':{name:{'sha256':sha(raw),'bytes':len(raw)}for name,raw in members.items()},
  'candidatesSha256':sha(runtime),'outcomes':report['outcomes'],
  'interpretation':report['interpretation']}
 (output/'manifest.json').write_bytes(dump(manifest));return report,inputs,manifest

def verify(output=EVIDENCE,source_cache=SOURCE_CACHE,complete=True):
 manifest=json.loads((output/'manifest.json').read_bytes())
 if(manifest['method']!=METHOD or manifest['originalPrimaryCount']!=46791 or manifest['sourceDependencies']!=dependencies(source_cache)or
    digest_file(output/'original.zip')!=manifest['archiveSha256']or(output/'original.zip').stat().st_size!=manifest['archiveBytes']):
  raise ValueError('Retained native TIGER dependency changed')
 required={'report.json','inputs/source-inputs.json','inputs/additional-native-targets.json'}
 with zipfile.ZipFile(output/'original.zip')as z:
  if len(z.namelist())!=len(required)or set(z.namelist())!=required:raise ValueError('TIGER evidence member scope changed')
  raw={name:z.read(name)for name in required}
 for name,data in raw.items():
  if {'sha256':sha(data),'bytes':len(data)}!=manifest['members'][name]:raise ValueError('TIGER retained evidence bytes changed')
 report=json.loads(raw['report.json']);inputs=json.loads(raw['inputs/source-inputs.json'])
 if complete:
  validated_dependencies()
  with tempfile.TemporaryDirectory(prefix='atlas-tiger-range-replay-')as temporary:
   directory=pathlib.Path(temporary);extract_source(source_cache,directory);inventory,source_target_inputs=source_inputs(directory)
   if inputs!=source_target_inputs:raise ValueError('TIGER point inputs differ from complete source scope')
   replay=match(directory,inventory,inputs,json.loads(raw['inputs/additional-native-targets.json']),
                extra_targets_raw=raw['inputs/additional-native-targets.json'])
   if replay!=report:raise ValueError('TIGER native range/geometry replay differs')
 runtime=(output/'candidates.json').read_bytes()
 if(runtime!=dump({'candidates':report['candidates'],'diagnosticCandidates':report['diagnosticCandidates']})or
    sha(runtime)!=manifest['candidatesSha256']or len(report['candidates'])!=manifest['candidateCount']or
    len(report['diagnosticCandidates'])!=manifest['diagnosticCandidateCount']or
    report['sourceInventorySha256']!=manifest['sourceInventorySha256']or
    report['targetsSha256']!=manifest['targetsSha256']or report['additionalDiagnosticScope']['sha256']!=manifest['additionalDiagnosticTargetsSha256']):
  raise ValueError('TIGER runtime candidate scope changed')
 return report,inputs,manifest

@functools.lru_cache(maxsize=1)
def validated_catalog():return verify()

@functools.lru_cache(maxsize=1)
def runtime_indexes():
 report,inputs,_=validated_catalog();snapshot=native_snapshot()
 return ({c['key']:c for c in report['candidates']},
         {r['entry']['key']:r['entry']for r in inputs['targets']if r['scope']=='original'},
         {native_key(r):r for r in snapshot['nationalRows']if native_key(r)},
         {c['targetId']:c for c in report['diagnosticCandidates']},
         {d['targetId']:d for d in report['selectionDecisions']})

def validate_tiger_primary_entry(entry,national_row=None):
 try:
  candidates,originals,national,_,_=runtime_indexes();key=entry.get('key');candidate=candidates.get(key);old=originals.get(key)
  return bool(candidate and old and entry.get('status')=='mapped'and not entry.get('primaryAddressEvidence')and
   all(entry.get(k)==old.get(k)for k in('key','name','source','state','sourceDate','sourceCounty','address'))and
   all(entry.get(k)==candidate.get(k)for k in('countyFips','match'))and
   (national_row is None or national_row==national.get(key)))
 except(KeyError,ValueError,TypeError,OSError,zipfile.BadZipFile):return False

def validate_tiger_diagnostic_candidate(candidate):
 try:
  return candidate==runtime_indexes()[3].get(candidate.get('targetId'))
 except(KeyError,ValueError,TypeError,OSError,zipfile.BadZipFile):return False

def tiger_range_witnesses(entry):
 if not validate_tiger_primary_entry(entry):raise ValueError('Unvalidated TIGER original entry')
 return copy.deepcopy(runtime_indexes()[4]['original:'+entry['key']]['acceptedNativeRanges'])

def tiger_diagnostic_range_witnesses(candidate):
 if not validate_tiger_diagnostic_candidate(candidate):raise ValueError('Unvalidated TIGER diagnostic')
 return copy.deepcopy(runtime_indexes()[4][candidate['targetId']]['acceptedNativeRanges'])

def tiger_coordinate_witnesses_for_match(match_value,target_address):
 """Resolve all full native range matches from an exact retained match/address."""
 report,_,_=validated_catalog();decisions={d['targetId']:d for d in report['selectionDecisions']};witnesses={}
 for candidate in report['candidates']+report['diagnosticCandidates']:
  if candidate['match']!=match_value or candidate['address']!=target_address:continue
  target_id=candidate.get('targetId','original:'+candidate['key'])
  for witness in decisions[target_id]['acceptedNativeRanges']:
   key=witness['point']['nativeId']
   if key in witnesses and witnesses[key]!=witness:raise ValueError('Retained native range identity conflict')
   witnesses[key]=witness
 return [copy.deepcopy(witnesses[key])for key in sorted(witnesses)]

def main():
 p=argparse.ArgumentParser();p.add_argument('--output',type=pathlib.Path,default=EVIDENCE);p.add_argument('--source-cache',type=pathlib.Path,default=SOURCE_CACHE)
 p.add_argument('--additional-targets',type=pathlib.Path);p.add_argument('--report',type=pathlib.Path);p.add_argument('--verify',action='store_true');a=p.parse_args()
 report,inputs,manifest=verify(a.output,a.source_cache)if a.verify else retain(a.additional_targets,a.output,a.source_cache)
 if a.report:a.report.parent.mkdir(parents=True,exist_ok=True);a.report.write_bytes(dump(report))
 print(json.dumps({'candidateCount':len(report['candidates']),'diagnosticCount':len(report['diagnosticCandidates']),
  'archiveSha256':manifest['archiveSha256'],'sourceInventorySha256':manifest['sourceInventorySha256'],
  'additionalTargetsSha256':manifest['additionalDiagnosticTargetsSha256'],'outcomes':report['outcomes']}),flush=True)
if __name__=='__main__':main()
