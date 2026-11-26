#!/usr/bin/env python3
"""Bind a replayed native phone identity pair to an explicit complete donor release.

The donor release must contain all 46,791 original identities and no phone-site
children. Every entry is validated, including county holds. The complete donor
entry, source role and point precision are preserved. Final publication must
also require exact equality to the final usable USFA parent in that release.
"""
import argparse,copy,functools,json,pathlib,tempfile,zipfile
from backfill_provider_locations import (ROOT,PUBLIC,STATES,sha,digest_file,native_key,read_registry,
                                        verify as verify_locations)
from primary_recovery_baseline import load_primary_baseline,INDEX_SHA
from recover_nppes_native_primary import dump
from recover_nppes_primary_components import inputs as cms_inputs
from recover_nppes_phone_identity import EVIDENCE as IDENTITY_EVIDENCE,validated_identity_catalog

METHOD='nppes-usfa-primary-site-correlation'
EVIDENCE=ROOT/'scripts/data/evidence/primary-nppes-phone-sites/2026-11-26'
DONOR_MEMBERS={'index.json',*(s+'.json'for s in STATES)}

def usable(entry):
 return entry.get('status')=='mapped'and isinstance(entry.get('match'),dict)and(not entry.get('sourceCounty')or entry['sourceCounty']==entry.get('countyFips'))

def release_files(directory):
 index_raw=(directory/'index.json').read_bytes();index=json.loads(index_raw)
 if len(index.get('chunks',[]))!=len(STATES)or {c['file']for c in index['chunks']}!=DONOR_MEMBERS-{'index.json'}:
  raise ValueError('Phone donor release must contain the full original state inventory')
 files={'index.json':index_raw};entries=[]
 for chunk in index['chunks']:
  name=chunk['file'];raw=(directory/name).read_bytes()
  if sha(raw)!=chunk['sha256']:raise ValueError('Donor release shard digest changed')
  rows=json.loads(raw)
  if len(rows)!=chunk['count']or any(e['state']!=chunk['state']for e in rows):raise ValueError('Donor release state/count binding changed')
  files[name]=raw;entries.extend(rows)
 if len(entries)!=46791 or len({e['key']for e in entries})!=46791:raise ValueError('Full original donor identity inventory changed')
 return files,index,entries

def validate_release(directory,audit):
 from build_primary_mapping_release import metric
 files,index,entries=release_files(directory);_,originals,baseline_sha=load_primary_baseline()
 original={e['key']:e for e in originals};actual={e['key']:e for e in entries}
 if set(actual)!=set(original):raise ValueError('Donor release contains synthetic or missing original identities')
 for key,entry in actual.items():
  old=original[key]
  if any(entry.get(k)!=old.get(k)for k in('key','name','source','state','sourceDate','sourceCounty')):
   raise ValueError('Donor release changed original source identity metadata')
  proof=entry.get('primaryAddressEvidence')or{}
  if proof.get('method')==METHOD:raise ValueError('Phone donor release must be built before all phone children')
  if entry.get('address')!=old.get('address')and proof.get('originalAddress')!=old.get('address'):
   raise ValueError('Changed donor address lost its original source-address proof')
 if(audit.get('baselineIndexSha256')!=baseline_sha or audit.get('after')!=metric(entries)or
    index.get('primaryCoverageTarget')!=audit['after']or
    index.get('primaryMappingRecovery',{}).get('baselineIndexSha256')!=baseline_sha or
    index.get('primaryMappingRecovery',{}).get('sourceReports')!=audit.get('sourceReports')):
  raise ValueError('Donor release is not bound to its complete non-phone combined audit')
 manifest,national=read_registry();fl=json.loads((PUBLIC/'state-ems/FL.json').read_bytes())
 verify_locations(directory,manifest,national,fl)
 return files,index,entries

def build(snapshot,pairs,identity_manifest,donor_index_sha,donor_entries,donor_audit_sha):
 original={e['key']:e for e in snapshot['entries']};donors={e['key']:e for e in donor_entries}
 candidates=[];withheld=[]
 for pair in pairs['candidatePairs']:
  old=original[pair['key']];donor=donors.get(pair['donorPrimaryKey']);donor_original=original.get(pair['donorPrimaryKey'])
  reason=None
  if not donor or donor['source']!='USFA'or donor['state']!=old['state']or not usable(donor):reason='final-nonphone-usfa-parent-not-usable'
  elif donor_original is None or donor_original['name']!=pair['donorOriginalName']or donor_original['address']!=pair['donorOriginalAddress']:
   raise ValueError('Phone identity pair does not bind original USFA donor')
  elif old.get('sourceCounty')and old['sourceCounty']!=donor['countyFips']:reason='nppes-original-source-county-conflict'
  if reason:
   withheld.append({'key':pair['key'],'donorPrimaryKey':pair['donorPrimaryKey'],'reason':reason});continue
  role=(donor.get('primaryAddressEvidence')or{}).get('siteRole')or'original-usfa-primary-address'
  proof={'method':METHOD,'association':'inferred','endUserValidationRequired':True,'siteRole':'correlated-usfa-primary-site',
   'originalAddress':copy.deepcopy(old['address']),'originalStatus':old['status'],
   'baselineIndexSha256':snapshot['baselineIndexSha256'],'nationalRegistrySha256':snapshot['nationalRegistrySha256'],
   'identityReportSha256':identity_manifest['reportSha256'],'identityPairSha256':sha(dump(pair)),
   'correlation':copy.deepcopy(pair),'donorReleaseIndexSha256':donor_index_sha,'donorAuditSha256':donor_audit_sha,
   'donor':{'primaryKey':donor['key'],'siteRole':role,'entry':copy.deepcopy(donor)},
   'interpretation':'Native business-phone/name/locality correlation to the retained usable USFA primary site. Donor site role and coordinate precision are inherited; current headquarters or building occupancy is not asserted.'}
  candidate={k:copy.deepcopy(old[k])for k in('key','name','source','state','sourceDate','sourceCounty')}
  candidate.update(originalAddress=copy.deepcopy(old['address']),originalStatus=old['status'],
   address=copy.deepcopy(donor['address']),countyFips=donor['countyFips'],match=copy.deepcopy(donor['match']),
   primaryAddressEvidence=proof)
  candidates.append(candidate)
 return {'schemaVersion':2,'source':'native-cms-usfa-phone-site-correlation','method':METHOD,
  'originalPrimaryCount':46791,'baselineIndexSha256':INDEX_SHA,'identityReportSha256':identity_manifest['reportSha256'],
  'donorReleaseIndexSha256':donor_index_sha,'donorAuditSha256':donor_audit_sha,
  'candidateIdentityPairs':len(pairs['candidatePairs']),'candidates':candidates,'withheld':withheld,
  'finalParentPolicy':'Every selected child requires exact equality of proof.donor.entry and the final usable USFA parent; stale or withheld donors cannot supply a location.'}

def summary(report,manifest):
 return {'schemaVersion':1,'method':METHOD,'originalPrimaryCount':46791,'candidateIdentityPairs':report['candidateIdentityPairs'],
  'candidateCount':len(report['candidates']),'withheldCount':len(report['withheld']),
  'archiveSha256':manifest['archiveSha256'],'reportSha256':manifest['reportSha256'],
  'donorReleaseIndexSha256':report['donorReleaseIndexSha256'],'donorAuditSha256':report['donorAuditSha256'],
  'candidates':[{'key':c['key'],'donorPrimaryKey':c['primaryAddressEvidence']['donor']['primaryKey'],'method':c['match']['method']}for c in report['candidates']],
  'withheld':report['withheld'],'publication':'candidate associations only; final parent equality and combined-source release audit are mandatory'}

def dependencies():
 return {'native-phone-identity':{'archiveSha256':digest_file(IDENTITY_EVIDENCE/'original.zip'),
                                  'manifestSha256':sha((IDENTITY_EVIDENCE/'manifest.json').read_bytes())}}

def retain(donor_directory,donor_audit_path,output=EVIDENCE):
 audit_raw=donor_audit_path.read_bytes();audit=json.loads(audit_raw);files,index,entries=validate_release(donor_directory,audit)
 identity,identity_manifest=validated_identity_catalog();snapshot,_,_=cms_inputs()
 report=build(snapshot,identity,identity_manifest,sha(files['index.json']),entries,sha(audit_raw))
 raw=dump(report);members={'report.json':raw,'inputs/donor-audit.json':audit_raw,
                          **{'donor-release/'+name:data for name,data in files.items()}}
 output.mkdir(parents=True,exist_ok=True)
 with zipfile.ZipFile(output/'original.zip','w',zipfile.ZIP_DEFLATED,compresslevel=9)as z:
  for name,data in sorted(members.items()):
   info=zipfile.ZipInfo(name,date_time=(2026,11,26,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,data)
 runtime=dump(report['candidates']);(output/'candidates.json').write_bytes(runtime)
 manifest={'schemaVersion':2,'method':METHOD,'archiveSha256':digest_file(output/'original.zip'),
  'archiveBytes':(output/'original.zip').stat().st_size,'reportSha256':sha(raw),'candidatesSha256':sha(runtime),
  'candidateCount':len(report['candidates']),'sourceDependencies':dependencies(),
  'donorReleaseIndexSha256':sha(files['index.json']),'donorAuditSha256':sha(audit_raw),
  'members':{name:{'sha256':sha(data),'bytes':len(data)}for name,data in members.items()}}
 (output/'manifest.json').write_bytes(dump(manifest));(output/'summary.json').write_bytes(dump(summary(report,manifest)))
 return report,manifest

def verify(output=EVIDENCE):
 manifest=json.loads((output/'manifest.json').read_bytes())
 if manifest['method']!=METHOD or manifest['sourceDependencies']!=dependencies()or digest_file(output/'original.zip')!=manifest['archiveSha256']or(output/'original.zip').stat().st_size!=manifest['archiveBytes']:
  raise ValueError('Phone-site source evidence dependency changed')
 expected={'report.json','inputs/donor-audit.json',*('donor-release/'+name for name in DONOR_MEMBERS)}
 with zipfile.ZipFile(output/'original.zip')as z:
  if set(z.namelist())!=expected or len(z.namelist())!=len(expected):raise ValueError('Full retained donor release membership changed')
  files={name:z.read(name)for name in expected}
 for name,data in files.items():
  if {'sha256':sha(data),'bytes':len(data)}!=manifest['members'][name]:raise ValueError('Retained donor/site member changed')
 with tempfile.TemporaryDirectory(prefix='atlas-phone-donor-')as td:
  directory=pathlib.Path(td)
  for name in DONOR_MEMBERS:(directory/name).write_bytes(files['donor-release/'+name])
  donor_files,index,entries=validate_release(directory,json.loads(files['inputs/donor-audit.json']))
 identity,identity_manifest=validated_identity_catalog();snapshot,_,_=cms_inputs()
 report=build(snapshot,identity,identity_manifest,sha(donor_files['index.json']),entries,sha(files['inputs/donor-audit.json']))
 if dump(report)!=files['report.json']or sha(files['report.json'])!=manifest['reportSha256']or report['donorReleaseIndexSha256']!=manifest['donorReleaseIndexSha256']:
  raise ValueError('Phone-site proof does not reproduce the full retained non-phone donor release')
 runtime=(output/'candidates.json').read_bytes()
 if runtime!=dump(report['candidates'])or sha(runtime)!=manifest['candidatesSha256']or len(report['candidates'])!=manifest['candidateCount']:
  raise ValueError('Phone-site runtime proof changed')
 if(output/'summary.json').read_bytes()!=dump(summary(report,manifest)):raise ValueError('Phone-site summary changed')
 return report,manifest

@functools.lru_cache(maxsize=1)
def runtime_indexes():
 report,_=verify();snapshot,_,_=cms_inputs()
 return({c['key']:c for c in report['candidates']},{e['key']:e for e in snapshot['entries']},
        {native_key(r):r for r in snapshot['nationalRows']if native_key(r)})

def validate_nppes_phone_primary_entry(entry,national_row=None):
 try:
  candidates,original,national=runtime_indexes();key=entry.get('key');c=candidates.get(key);old=original.get(key)
  return bool(c and old and entry.get('status')=='mapped'and
   all(entry.get(k)==old.get(k)for k in('key','name','source','state','sourceDate','sourceCounty'))and
   all(entry.get(k)==c.get(k)for k in('address','countyFips','match','primaryAddressEvidence'))and
   (national_row is None or national_row==national.get(key)))
 except(KeyError,ValueError,TypeError,OSError,zipfile.BadZipFile):return False

def validate_final_phone_parent(entry,final_entries):
 proof=entry.get('primaryAddressEvidence')or{}
 if proof.get('method')!=METHOD:return False
 donor=proof.get('donor',{}).get('entry')
 if not isinstance(donor,dict):return False
 actual=final_entries.get(donor.get('key'))
 return bool(actual and actual.get('source')=='USFA'and actual.get('state')==entry.get('state')and usable(actual)and actual==donor)

def main():
 p=argparse.ArgumentParser();p.add_argument('--donor-locations',type=pathlib.Path);p.add_argument('--donor-audit',type=pathlib.Path)
 p.add_argument('--output',type=pathlib.Path,default=EVIDENCE);p.add_argument('--verify',action='store_true');a=p.parse_args()
 if a.verify:report,manifest=verify(a.output)
 else:
  if not a.donor_locations or not a.donor_audit:p.error('Explicit final non-phone --donor-locations and --donor-audit are required')
  report,manifest=retain(a.donor_locations,a.donor_audit,a.output)
 print(json.dumps(summary(report,manifest)),flush=True)
if __name__=='__main__':main()
