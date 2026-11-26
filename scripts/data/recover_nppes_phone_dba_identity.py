#!/usr/bin/env python3
"""Add exact explicit native Type 3 DBA reference names to phone identity replay.

The existing full primary-CMS and full-USFA reciprocal-phone, active-record,
original identity, exact locality, original HQ street and county guards run
unchanged. This separate edition retains the original 277 identities verbatim
and may add only complete-name matches to explicit reference-file Type 3 rows.
"""
import argparse,collections,copy,functools,json,pathlib,zipfile
from backfill_provider_locations import ROOT,sha,digest_file
from recover_nppes_native_primary import dump,ARCHIVE_SHA
from recover_nppes_phone_identity import (EVIDENCE as BASE_EVIDENCE,derive as derive_base,
 source_inputs,name_basis,agency_name,distinctive,validated_identity_catalog as base_catalog)
from retain_nppes_other_names import EVIDENCE as OTHER_EVIDENCE,SOURCE_MEMBER,FIELDS,source_catalog

EVIDENCE=ROOT/'scripts/data/evidence/primary-nppes-phone-dba-identity/2026-11-26'
PROFILE='native-dba-reference'

def name_index(report):
 index=collections.defaultdict(list)
 for record in report['selectedNativeRows']:index[record['native']['NPI']].append(record)
 return dict(index)

def reference_name_basis(record,usfa,county,index,report_sha):
 original=name_basis(record,usfa,county)
 if original is not None:return original
 fire=usfa['Fire dept name'].strip()
 if not distinctive(fire):return None
 matching=[]
 for witness in index.get(record['npi'],[]):
  native=witness['native']
  if native['NPI']!=record['npi']:raise ValueError('Native DBA reference moved to another NPI')
  value=native[FIELDS[1]]
  if(native[FIELDS[2]]=='3'and distinctive(value)and agency_name(value)==agency_name(fire)):
   matching.append(copy.deepcopy(witness))
 if not matching:return None
 matching.sort(key=lambda r:r['sourceRowNumber'])
 return {'rule':'normalized-complete-native-name','cmsNameField':'native-other-name-reference-type-3',
  'cmsNativeName':matching[0]['native'][FIELDS[1]],'usfaNativeName':fire,
  'otherOrganizationNameTypeCode':'3','nativeOtherNameRecords':matching,
  'referenceSource':{'monthlyArchiveSha256':ARCHIVE_SHA,'sourceMember':SOURCE_MEMBER,
                     'reportSha256':report_sha}}

def generate():
 base,base_manifest=base_catalog();other,other_manifest=source_catalog()
 snapshot,native,usfa,usfa_manifest=source_inputs();index=name_index(other)
 def resolve(record,department,county):
  return reference_name_basis(record,department,county,index,other_manifest['reportSha256'])
 report=derive_base(snapshot,native,usfa,usfa_manifest,base['codeValues'],name_resolver=resolve)
 base_pairs={p['key']:p for p in base['candidatePairs']};actual={p['key']:p for p in report['candidatePairs']}
 if len(actual)!=len(report['candidatePairs']):raise ValueError('Duplicate native DBA phone identity')
 if any(actual.get(key)!=pair for key,pair in base_pairs.items()):raise ValueError('Reference supplement changed frozen native phone identities')
 added=[]
 for pair in report['candidatePairs']:
  if pair['key']in base_pairs:continue
  if pair['nameBasis']['cmsNameField']!='native-other-name-reference-type-3' or pair['nameBasis']['otherOrganizationNameTypeCode']!='3':
   raise ValueError('Phone reference expansion used a non-DBA identity rule')
  pair['sourcePins']['cmsOtherNamesReportSha256']=other_manifest['reportSha256']
  pair['sourcePins']['cmsOtherNamesMemberSha256']=other['sourceMemberSha256']
  added.append(pair['key'])
 report.update(schemaVersion=3,source='cms-usfa-reciprocal-native-business-phone-with-explicit-dba-reference',
  identityProfile=PROFILE,baseIdentityReportSha256=base_manifest['reportSha256'],
  originalNativeIdentityPairCount=len(base_pairs),additionalDbaIdentityKeys=sorted(added),
  nativeOtherNamesReportSha256=other_manifest['reportSha256'],
  completeOtherNamesRows=other['completeRowsScanned'],
  completeOtherNamesInventorySha256=other['completeNativeInventorySha256'])
 return report

def dependencies():
 return {name:{'archiveSha256':digest_file(path/'original.zip'),'manifestSha256':sha((path/'manifest.json').read_bytes())}
         for name,path in [('original-phone-identity',BASE_EVIDENCE),('complete-native-other-names',OTHER_EVIDENCE)]}

def summary(report,manifest):
 return {'schemaVersion':1,'identityProfile':PROFILE,'candidatePairCount':len(report['candidatePairs']),
  'originalNativeIdentityPairCount':report['originalNativeIdentityPairCount'],
  'additionalDbaIdentityKeys':report['additionalDbaIdentityKeys'],'additionalDbaIdentityCount':len(report['additionalDbaIdentityKeys']),
  'completeOtherNamesRows':report['completeOtherNamesRows'],'cmsPhoneInventoryCount':report['cmsPhoneInventoryCount'],
  'cmsPhoneInventoryScope':report['cmsPhoneInventoryScope'],'completeUsfaLogicalRows':report['completeUsfaLogicalRows'],
  'archiveSha256':manifest['archiveSha256'],'reportSha256':manifest['reportSha256'],'outcomes':report['outcomes'],
  'nameFields':dict(sorted(collections.Counter(p['nameBasis']['cmsNameField']for p in report['candidatePairs']).items())),
  'additionalPairs':[{'key':p['key'],'donorPrimaryKey':p['donorPrimaryKey'],'nameBasis':p['nameBasis']}
                    for p in report['candidatePairs']if p['key']in set(report['additionalDbaIdentityKeys'])],
  'publication':'identity correlations only; no coordinate or coverage is authorized before final non-phone donor release replay'}

def retain(output=EVIDENCE):
 report=generate();raw=dump(report);output.mkdir(parents=True,exist_ok=True)
 with zipfile.ZipFile(output/'original.zip','w',zipfile.ZIP_DEFLATED,compresslevel=9)as z:
  info=zipfile.ZipInfo('report.json',date_time=(2026,11,26,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,raw)
 manifest={'schemaVersion':1,'identityProfile':PROFILE,'archiveSha256':digest_file(output/'original.zip'),
  'archiveBytes':(output/'original.zip').stat().st_size,'reportSha256':sha(raw),
  'candidatePairCount':len(report['candidatePairs']),'sourceDependencies':dependencies()}
 (output/'manifest.json').write_bytes(dump(manifest));(output/'summary.json').write_bytes(dump(summary(report,manifest)))
 return report,manifest

def verify(output=EVIDENCE):
 manifest=json.loads((output/'manifest.json').read_bytes())
 if(manifest['identityProfile']!=PROFILE or manifest['sourceDependencies']!=dependencies()or
    digest_file(output/'original.zip')!=manifest['archiveSha256']or(output/'original.zip').stat().st_size!=manifest['archiveBytes']):
  raise ValueError('Native Type 3 DBA identity source dependency changed')
 with zipfile.ZipFile(output/'original.zip')as z:
  if z.namelist()!=['report.json']:raise ValueError('Native DBA phone identity archive membership changed')
  raw=z.read('report.json')
 report=generate()
 if sha(raw)!=manifest['reportSha256']or dump(report)!=raw or len(report['candidatePairs'])!=manifest['candidatePairCount']:
  raise ValueError('Complete native DBA/phone identity replay changed')
 if(output/'summary.json').read_bytes()!=dump(summary(report,manifest)):raise ValueError('Native DBA identity summary changed')
 return report,manifest

@functools.lru_cache(maxsize=1)
def validated_identity_catalog():return verify()

def main():
 p=argparse.ArgumentParser();p.add_argument('--output',type=pathlib.Path,default=EVIDENCE);p.add_argument('--verify',action='store_true');a=p.parse_args()
 report,manifest=verify(a.output)if a.verify else retain(a.output)
 print(json.dumps(summary(report,manifest)),flush=True)
if __name__=='__main__':main()
