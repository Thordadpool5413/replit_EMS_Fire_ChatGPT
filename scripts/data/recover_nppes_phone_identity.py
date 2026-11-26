#!/usr/bin/env python3
"""Retain reciprocal native CMS/USFA phone correlations without assigning a point.

Phone uniqueness is scoped to the entire Type 2 ambulance taxonomy inventory
and the complete USFA national source, including malformed-record vetoes. Name
and locality are independent gates; a phone alone never authorizes a site.
"""
import argparse,collections,copy,functools,json,pathlib,re,tempfile,urllib.request,zipfile
from backfill_provider_locations import ROOT,sha,digest_file,name_key,zip5,native_key
from address_normalization import normalize_street,source_street_line,normalized_city
from recover_nppes_native_primary import active,dump,ARCHIVE_SHA as CMS_ARCHIVE_SHA,AMBULANCE_ORG_COUNT
from retain_nppes_native_source import DEFAULT as CMS_EVIDENCE,verify as verify_cms,current_pins
from recover_nppes_primary_components import inputs as cms_inputs

EVIDENCE=ROOT/'scripts/data/evidence/primary-nppes-phone-identity/2026-11-26'
CODE_VALUES_URL='https://www.cms.gov/regulations-and-guidance/administrative-simplification/nationalprovidentstand/downloads/data_dissemination_file-code_values.pdf'
ELIGIBLE={'no-match','not-eligible','unavailable','pending'}
FIRE_ROLES={
 'FIRE DEPARTMENT','FIRE DEPT','FIRE RESCUE','FIRE AND RESCUE','FIRE RESCUE DEPARTMENT',
 'FIRE AND RESCUE DEPARTMENT','FIRE AND EMERGENCY SERVICES','FIRE AND RESCUE SERVICES',
 'FIRE EMS','FIRE AND EMS','FIRE DEPARTMENT EMS','FIRE DEPARTMENT AND EMS',
 'FIRE RESCUE AND EMS','VOLUNTEER FIRE DEPARTMENT','VOLUNTEER FIRE DEPT',
 'VOLUNTEER FIRE AND RESCUE','VOLUNTEER FIRE RESCUE'}
GENERIC_NAME_WORDS={'FIRE','DEPARTMENT','DEPT','AMBULANCE','SERVICE','SERVICES','EMS','EMERGENCY',
 'MEDICAL','RESCUE','VOLUNTEER','AND','OF','THE','INC','LLC','COMPANY','CORPORATION','CITY','TOWN','COUNTY','VILLAGE','BOROUGH','TOWNSHIP'}

def phone(value):
 if not isinstance(value,str)or re.search(r'[A-Za-z]',value):return None
 digits=re.sub(r'\D','',value)
 if len(digits)==11 and digits.startswith('1'):digits=digits[1:]
 if not re.fullmatch(r'[2-9]\d{2}[2-9]\d{6}',digits):return None
 if len(set(digits))==1 or digits[3:6]=='555':return None
 return digits

def possible_phones(value):
 # A malformed phone cannot silently disappear from reciprocal uniqueness.
 if not isinstance(value,str):return set()
 direct=phone(value)
 if direct:return{direct}
 digits=re.sub(r'\D','',value);result=set()
 for i in range(max(0,len(digits)-9)):
  candidate=digits[i:i+10]
  if phone(candidate):result.add(candidate)
 return result

def agency_name(value):return name_key(value.replace('&',' AND '))
def distinctive(value):return any(t not in GENERIC_NAME_WORDS for t in agency_name(value).split())

def county_names():
 rows=json.loads((ROOT/'scripts/fixtures/census-2026-county-identities.json').read_bytes())['counties']
 return {r['GEOID']:{'state':r['USPS'],'name':r['NAME']}for r in rows}

def county_binding(native,original,counties):
 raw=native.get('County','').strip();county=original.get('sourceCounty','')
 if not raw:return True,None
 expected=counties.get(county)
 if not expected or expected['state']!=original['state']:return False,None
 normalized=name_key(raw);official=name_key(expected['name'])
 stripped=lambda s:re.sub(r' (COUNTY|PARISH|BOROUGH|CENSUS AREA|MUNICIPALITY)$','',s)
 agrees=(raw==county or re.fullmatch(r'\d{3}',raw)is not None and raw==county[2:]or normalized==official or stripped(normalized)==stripped(official))
 return bool(agrees),{'countyFips':county,'name':expected['name'],'nativeCountyAsReported':raw}if agrees else None

def government_basis(legal,fire_name,city,county):
 native=agency_name(legal);agency=agency_name(fire_name);place=agency_name(city)
 if not place:return None
 for kind in('CITY','TOWN','VILLAGE','TOWNSHIP'):
  owners={kind+' OF '+place,place+' '+kind}
  if native not in owners:continue
  # Township must remain explicit in the native department name.
  agency_owners=owners|{kind+' '+place}
  if kind!='TOWNSHIP':agency_owners.add(place)
  if agency in {owner+' '+role for owner in agency_owners for role in FIRE_ROLES}:
   return {'rule':'explicit-government-owner-and-fire-agency','governmentKind':kind.lower(),
           'governmentPlace':city,'cmsNativeName':legal,'usfaNativeName':fire_name}
 if county:
  full=agency_name(county['name']);matched=re.fullmatch(r'(.+) (COUNTY|BOROUGH)',full)
  if matched:
   place,kind=matched.groups();owners={full,kind+' OF '+place}
   if native in owners and agency in {owner+' '+role for owner in owners for role in FIRE_ROLES}:
    return {'rule':'explicit-government-county-owner-and-fire-agency','governmentKind':kind.lower(),
            'governmentPlace':county['name'],'countyFips':county['countyFips'],
            'cmsNativeName':legal,'usfaNativeName':fire_name}
 return None

def name_basis(record,usfa,county):
 native=record['native'];legal=native['Provider Organization Name (Legal Business Name)'].strip()
 alternate=native['Provider Other Organization Name'].strip();kind=native['Provider Other Organization Name Type Code'].strip()
 fire=usfa['Fire dept name'].strip()
 if not distinctive(fire):return None
 for field,value in[('legal-name',legal),*([('native-dba-type-3',alternate)]if kind=='3'and alternate else[])]:
  if agency_name(value)==agency_name(fire)and distinctive(value):
   return {'rule':'normalized-complete-native-name','cmsNameField':field,'cmsNativeName':value,'usfaNativeName':fire,
           'otherOrganizationNameTypeCode':kind if field=='native-dba-type-3'else None}
 # Government ownership remains an explicit inferred correlation, not a new
 # legal-identity assertion; no department-name prefix or suffix is guessed.
 basis=government_basis(legal,fire,record['primaryAddress']['city'],county)
 if basis:basis['cmsNameField']='legal-name'
 return basis

def source_inputs():
 from retain_usfa_native_source import source_catalog
 verify_cms(CMS_EVIDENCE);snapshot,_,native=cms_inputs();usfa,usfa_manifest=source_catalog()
 if len(native['phoneInventory'])!=AMBULANCE_ORG_COUNT or usfa['completeLogicalSourceRows']!=27117 or usfa['parsedRows']+usfa['quarantinedRows']!=27117:
  raise ValueError('Complete reciprocal native phone inventories are missing')
 if not{'HQ phone','HQ addr1','HQ addr2','County'}<=set(usfa['headers']):raise ValueError('Native USFA phone/headquarters schema changed')
 return snapshot,native,usfa,usfa_manifest

def derive(snapshot,native,usfa,usfa_manifest,code_values):
 from retain_usfa_native_source import native_identity
 originals={e['key']:e for e in snapshot['entries']};national={native_key(r):r for r in snapshot['nationalRows']if native_key(r)}
 cms_by_key={r['key']:r for r in native['records']};cms_owners=collections.defaultdict(set);usfa_owners=collections.defaultdict(set)
 cms_malformed=set();usfa_malformed=set();quarantine=set();usfa_rows={r['sourceRowNumber']:r for r in usfa['rows']}
 for row in native['phoneInventory']:
  for p in possible_phones(row['telephone']):
   cms_owners[p].add(row['key'])
   if phone(row['telephone'])!=p:cms_malformed.add(p)
 for row in usfa['rows']:
  identity=native_identity(row['native'])or'UNBOUND-NATIVE-ROW:'+str(row['sourceRowNumber'])
  for p in possible_phones(row['native']['HQ phone']):
   usfa_owners[p].add(identity)
   if phone(row['native']['HQ phone'])!=p:usfa_malformed.add(p)
 for row in usfa['quarantined']:
  quarantine.update(p for value in row['digitsForConservativePhoneVeto']for p in possible_phones(value))
  quarantine.update(possible_phones(row['rawFragment']))
 reconciled={r['primaryKey']:r for r in usfa['baselineReconciliation']if r['primaryKey']}
 bound={}
 for key,reconciliation in reconciled.items():
  if reconciliation['outcome']!='exact-fdid-state-name-city-zip' or len(reconciliation['nativeSourceRowNumbers'])!=1:continue
  old=originals.get(key);row=usfa_rows[reconciliation['nativeSourceRowNumbers'][0]]
  if old is None or old['source']!='USFA' or key not in national:continue
  bound[key]=(row,old)
 county_index=county_names();pairs=[];rejected=[];outcomes=collections.Counter()
 for key,record in sorted(cms_by_key.items()):
  old=originals[key]
  if old['status']not in ELIGIBLE:outcomes['original-status-ineligible']+=1;continue
  reason=None;p=phone(record['telephone']);source=record['primaryAddress']
  if not active(record)or source['country']not in('','US'):reason='native-cms-record-inactive-or-nondomestic'
  elif not p:reason='invalid-native-primary-practice-phone'
  elif p in cms_malformed or p in usfa_malformed or p in quarantine:reason='malformed-native-phone-collision'
  elif cms_owners[p]!={key}:reason='phone-not-unique-in-complete-ambulance-inventory'
  elif len(usfa_owners[p])!=1:reason='phone-not-unique-in-complete-usfa-inventory'
  else:
   donor_key=next(iter(usfa_owners[p]));value=bound.get(donor_key)
   if value is None:reason='native-usfa-identity-not-bound-to-original'
   else:
    row,donor_original=value;department=row['native'];address=donor_original.get('address')
    if(phone(department['HQ phone'])!=p or department['HQ state'].strip().upper()!=source['state']or
       normalized_city(department['HQ city'])!=normalized_city(source['city'])or zip5(department['HQ zip'].strip())!=zip5(source['postalCode'])):
     reason='native-phone-locality-disagreement'
    elif(not address or normalize_street(source_street_line(department['HQ addr1']))!=normalize_street(source_street_line(address['street']))):
     reason='native-usfa-primary-street-differs-from-original'
    else:
     county_ok,county=county_binding(department,donor_original,county_index)
     if not county_ok:reason='native-usfa-county-disagreement'
     else:
      basis=name_basis(record,department,county)
      if basis is None:reason='native-complete-name-or-explicit-owner-not-confirmed'
      else:
       pair={'key':key,'donorPrimaryKey':donor_key,'phone':p,'originalAddress':copy.deepcopy(old['address']),
        'originalStatus':old['status'],'primaryName':old['name'],'state':old['state'],
        'sourceCounty':old['sourceCounty'],'sourceDate':old['sourceDate'],
        'donorOriginalAddress':copy.deepcopy(donor_original['address']),'donorOriginalName':donor_original['name'],
        'nameBasis':basis,'localityBasis':'exact-native-city-state-zip','nativeCountyBinding':county,
        'reciprocalPhoneOwners':{'cmsType2AmbulanceOrganizations':1,'usfaNativeDepartments':1},
        'cmsNativeRecord':copy.deepcopy(record),'usfaNativeRecord':copy.deepcopy(row),
        'sourcePins':{'cmsArchiveSha256':CMS_ARCHIVE_SHA,'cmsNativeReportSha256':current_pins()[0],
         'usfaSourceSha256':usfa['sourceSha256'],'usfaNativeReportSha256':usfa_manifest['nativeReportSha256'],
         'usfaCompleteNativeInventorySha256':usfa_manifest['sourceEdition']['completeNativeInventorySha256'],
         'codeValuesDocumentSha256':code_values['sha256']},
        'publication':'identity-correlation-only; a separately validated final USFA donor location is required'}
       pairs.append(pair)
  if reason:
   outcomes[reason]+=1
   rejected.append({'key':key,'reason':reason})
  else:outcomes['reciprocal-native-phone-name-locality-correlation']+=1
 return {'schemaVersion':2,'source':'cms-usfa-reciprocal-native-business-phone','originalPrimaryCount':46791,
  'baselineIndexSha256':snapshot['baselineIndexSha256'],'nationalRegistrySha256':snapshot['nationalRegistrySha256'],
  'nativeCmsReportSha256':current_pins()[0],'nativeUsfaReportSha256':usfa_manifest['nativeReportSha256'],
  'completeMonthlyRowsAudited':native['scanReceipt']['rowsScanned'],
  'cmsPhoneInventoryScope':native['phoneInventoryScope'],'cmsPhoneInventoryCount':len(native['phoneInventory']),
  'completeUsfaLogicalRows':usfa['completeLogicalSourceRows'],'parsedUsfaRows':len(usfa['rows']),
  'quarantinedUsfaRows':len(usfa['quarantined']),'malformedPhoneVetoCount':len(cms_malformed|usfa_malformed|quarantine),
  'codeValues':code_values,'candidatePairs':pairs,'rejected':rejected,'outcomes':dict(sorted(outcomes.items())),
  'limitations':'Business-phone and explicit complete-name/locality correlation only. CMS uniqueness covers the complete ambulance organization taxonomy inventory, not all NPIs. No coordinate, current headquarters or legal-identity merger is established here.'}

def dependencies():
 from retain_usfa_native_source import EVIDENCE as USFA_EVIDENCE
 return {name:{'archiveSha256':digest_file(path/'original.zip'),'manifestSha256':sha((path/'manifest.json').read_bytes())}
         for name,path in [('native-cms',CMS_EVIDENCE),('native-usfa',USFA_EVIDENCE)]}

def code_document(raw):
 if not raw.startswith(b'%PDF-')or not 1000<len(raw)<5_000_000:raise ValueError('Unexpected official CMS code-value document')
 return {'url':CODE_VALUES_URL,'sha256':sha(raw),'bytes':len(raw),
  'definition':{'field':'Provider Other Organization Name Type Code','code':'3','meaning':'Doing Business As','entityType':'Organization'},
  'location':'CMS NPPES Data Dissemination Code Values, Exhibit 1-6, printed page 3'}

def summary(report,manifest):
 return {'schemaVersion':1,'source':report['source'],'candidatePairCount':len(report['candidatePairs']),
  'archiveSha256':manifest['archiveSha256'],'reportSha256':manifest['reportSha256'],
  'cmsPhoneInventoryCount':report['cmsPhoneInventoryCount'],'cmsPhoneInventoryScope':report['cmsPhoneInventoryScope'],
  'completeUsfaLogicalRows':report['completeUsfaLogicalRows'],'quarantinedUsfaRows':report['quarantinedUsfaRows'],
  'outcomes':report['outcomes'],'nameRules':dict(sorted(collections.Counter(p['nameBasis']['rule']for p in report['candidatePairs']).items())),
  'pairs':[{'key':p['key'],'donorPrimaryKey':p['donorPrimaryKey'],'nameRule':p['nameBasis']['rule']}for p in report['candidatePairs']],
  'publication':'identity-correlation-only; no mapped candidates or coverage are claimed'}

def retain(document_path,output=EVIDENCE):
 raw=document_path.read_bytes();document=code_document(raw);snapshot,native,usfa,usfa_manifest=source_inputs()
 report=derive(snapshot,native,usfa,usfa_manifest,document);report_raw=dump(report)
 output.mkdir(parents=True,exist_ok=True)
 with zipfile.ZipFile(output/'original.zip','w',zipfile.ZIP_DEFLATED,compresslevel=9)as z:
  for name,data in [('report.json',report_raw),('source/cms-code-values.pdf',raw)]:
   info=zipfile.ZipInfo(name,date_time=(2026,11,26,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,data)
 manifest={'schemaVersion':2,'archiveSha256':digest_file(output/'original.zip'),'archiveBytes':(output/'original.zip').stat().st_size,
  'reportSha256':sha(report_raw),'codeValues':document,'sourceDependencies':dependencies(),'candidatePairCount':len(report['candidatePairs'])}
 (output/'manifest.json').write_bytes(dump(manifest));(output/'summary.json').write_bytes(dump(summary(report,manifest)))
 return report,manifest

def verify(output=EVIDENCE):
 manifest=json.loads((output/'manifest.json').read_bytes())
 if manifest['sourceDependencies']!=dependencies()or digest_file(output/'original.zip')!=manifest['archiveSha256']or(output/'original.zip').stat().st_size!=manifest['archiveBytes']:
  raise ValueError('Retained native phone identity dependency changed')
 with zipfile.ZipFile(output/'original.zip')as z:
  if set(z.namelist())!={'report.json','source/cms-code-values.pdf'}or len(z.namelist())!=2:raise ValueError('Native phone identity membership changed')
  raw=z.read('report.json');document=code_document(z.read('source/cms-code-values.pdf'))
 if sha(raw)!=manifest['reportSha256']or document!=manifest['codeValues']:raise ValueError('Native phone identity document/report changed')
 snapshot,native,usfa,usfa_manifest=source_inputs();report=derive(snapshot,native,usfa,usfa_manifest,document)
 if dump(report)!=raw or len(report['candidatePairs'])!=manifest['candidatePairCount']:raise ValueError('Complete native reciprocal phone identity replay changed')
 if(output/'summary.json').read_bytes()!=dump(summary(report,manifest)):raise ValueError('Phone identity review summary changed')
 return report,manifest

@functools.lru_cache(maxsize=1)
def validated_identity_catalog():return verify()

def main():
 p=argparse.ArgumentParser();p.add_argument('--code-values',type=pathlib.Path);p.add_argument('--download-code-values',action='store_true')
 p.add_argument('--output',type=pathlib.Path,default=EVIDENCE);p.add_argument('--verify',action='store_true');a=p.parse_args()
 if a.verify:report,manifest=verify(a.output)
 else:
  if not a.code_values:p.error('--code-values is required')
  if a.download_code_values:
   request=urllib.request.Request(CODE_VALUES_URL,headers={'User-Agent':'ATLAS fixed public source evidence replay'})
   with urllib.request.urlopen(request,timeout=90)as response:raw=response.read(5_000_001)
   code_document(raw);a.code_values.parent.mkdir(parents=True,exist_ok=True);a.code_values.write_bytes(raw)
  report,manifest=retain(a.code_values,a.output)
 print(json.dumps(summary(report,manifest)),flush=True)
if __name__=='__main__':main()
