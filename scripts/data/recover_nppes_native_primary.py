#!/usr/bin/env python3
"""Rebuild native organization components from one complete pinned CMS archive.

Only the fixed public monthly file is read. No target address or phone is
submitted to an external service. Every original identity stays unchanged.
"""
import argparse,collections,copy,csv,datetime,io,json,pathlib,re,zipfile
from backfill_provider_locations import ROOT,PUBLIC,SOURCE,sha,digest_file,native_key,read_registry,name_key,zip5,address
from address_normalization import physical_address,address_key
from primary_recovery_baseline import load_primary_baseline
from checked_zip_member import open_checked_member
from stage_nppes import valid_npi

ARCHIVE_SHA='c5a34fba9b2e04bcb87358a1e3f9f4bbfc79b49b71fb37b71f9de43570c18713'
ARCHIVE_BYTES=1130479129
SOURCE_MEMBER='npidata_pfile_20050523-20261102.csv'
MEMBER_BYTES=11776341517
MEMBER_CRC='5422f7b1'
SOURCE_DATE='2026-11-02'
SOURCE_COUNT=9891116
ORIGINAL_NPI_COUNT=19567
AMBULANCE_ORG_COUNT=20554
EXPECTED_TARGET_COUNT=609
BASE_FIELDS=('NPI','Entity Type Code','Provider Organization Name (Legal Business Name)',
 'Provider Other Organization Name','Provider Other Organization Name Type Code',
 'Provider First Line Business Practice Location Address','Provider Second Line Business Practice Location Address',
 'Provider Business Practice Location Address City Name','Provider Business Practice Location Address State Name',
 'Provider Business Practice Location Address Postal Code','Provider Business Practice Location Address Country Code (If outside U.S.)',
 'Provider Business Practice Location Address Telephone Number','Last Update Date','NPI Deactivation Date','NPI Reactivation Date')
FIELDS=BASE_FIELDS+tuple(field+str(i) for i in range(1,16) for field in
 ('Healthcare Provider Taxonomy Code_','Provider License Number_','Provider License Number State Code_','Healthcare Provider Primary Taxonomy Switch_'))
assert len(FIELDS)==75

def dump(value):
 return (json.dumps(value,sort_keys=True,ensure_ascii=True,separators=(',',':'),allow_nan=False)+'\n').encode()

def snapshot(locations=None):
 if locations is None or locations.resolve()==(PUBLIC/'locations').resolve():
  _,entries,index_sha=load_primary_baseline()
 else:
  raw=(locations/'index.json').read_bytes();index=json.loads(raw);index_sha=sha(raw);entries=[]
  for chunk in index['chunks']:
   data=(locations/chunk['file']).read_bytes()
   if sha(data)!=chunk['sha256']:raise ValueError('Explicit input shard digest changed')
   entries.extend(json.loads(data))
 if len(entries)!=46791 or len({e['key']for e in entries})!=46791:raise ValueError('Original primary scope changed')
 _,national=read_registry()
 return {'baselineIndexSha256':index_sha,'nationalRegistrySha256':sha((PUBLIC/'national/index.json').read_bytes()),
         'entries':entries,'nationalRows':national}

def parse_date(text):
 if not text:return None
 try:return datetime.datetime.strptime(text,'%m/%d/%Y').date()
 except ValueError:raise ValueError('Unexpected native CMS date')

def active(record):
 deact=parse_date(record['deactivationDate']);react=parse_date(record['reactivationDate'])
 return not deact or bool(react and react>=deact)

def derive(native,ordinal):
 if set(native)!=set(FIELDS) or not all(isinstance(v,str)for v in native.values()):
  raise ValueError('Native CMS field schema changed')
 if type(ordinal)is not int or not 1<=ordinal<=SOURCE_COUNT:raise ValueError('Invalid native CMS row ordinal')
 npi=native['NPI']
 codes=[native['Healthcare Provider Taxonomy Code_'+str(i)]for i in range(1,16)]
 if native['Entity Type Code']!='2' or not valid_npi(npi) or not any(c.startswith('3416')for c in codes):
  raise ValueError('Retained row is not a native Type 2 ambulance organization')
 a={'line1':native[BASE_FIELDS[5]].strip(),'line2':native[BASE_FIELDS[6]].strip(),
    'city':native[BASE_FIELDS[7]].strip(),'state':native[BASE_FIELDS[8]].strip(),
    'postalCode':native[BASE_FIELDS[9]].strip(),'country':native[BASE_FIELDS[10]].strip()}
 return {'key':'NPI:'+npi,'npi':npi,'name':native[BASE_FIELDS[2]].strip(),
         'alternateName':native[BASE_FIELDS[3]].strip(),'alternateNameType':native[BASE_FIELDS[4]].strip(),
         'primaryAddress':a,'telephone':native[BASE_FIELDS[11]],'sourceUpdatedAt':native['Last Update Date'],
         'deactivationDate':native['NPI Deactivation Date'],'reactivationDate':native['NPI Reactivation Date'],
         'taxonomies':[c for c in codes if c],'sourceRowNumber':ordinal,'native':copy.deepcopy(native),
         'nativeRecordSha256':sha(dump(native))}

def bind(record,original,national):
 p=record['primaryAddress'];combined=', '.join(v for v in (p['line1'],p['line2'])if v)
 actual=address(combined,p['city'],p['state'],p['postalCode'])
 if (original['key']!=record['key'] or original['source']!='NPPES' or native_key(national)!=record['key'] or
     original['name']!=national[2] or name_key(record['name'])!=name_key(national[2]) or
     p['state']!=national[3] or name_key(p['city'])!=name_key(national[4]) or zip5(p['postalCode'])!=zip5(national[5]) or
     actual!=original['address']):
  raise ValueError('Native NPI/name/locality/combined primary address does not bind original identity: '+record['key'])
 result=copy.deepcopy(record);result['name']=original['name']
 result['originalCombinedAddress']=copy.deepcopy(original['address']);result['originalStatus']=original['status']
 return result

def scan(archive,inputs):
 if archive.stat().st_size!=ARCHIVE_BYTES or digest_file(archive)!=ARCHIVE_SHA:
  raise ValueError('Fixed full monthly CMS archive digest or size changed')
 originals={e['key']:e for e in inputs['entries']if e['source']=='NPPES'}
 national={native_key(r):r for r in inputs['nationalRows']if native_key(r)}
 if len(originals)!=ORIGINAL_NPI_COUNT:raise ValueError('Original national NPI scope changed')
 inventory=[];records={};seen=set();receipt={}
 with zipfile.ZipFile(archive)as z:
  members=[m for m in z.infolist()if pathlib.PurePosixPath(m.filename).name.startswith('npidata_pfile_')and m.filename.endswith('.csv')and'fileheader'not in m.filename]
  if len(members)!=1:raise ValueError('Expected one complete native monthly primary table')
  member=members[0]
  if (member.filename!=SOURCE_MEMBER or member.file_size!=MEMBER_BYTES or f'{member.CRC:08x}'!=MEMBER_CRC):
   raise ValueError('Pinned native CMS table identity changed')
  with open_checked_member(archive,z,member)as raw,io.TextIOWrapper(raw,encoding='utf-8-sig',newline='')as stream:
   csv.field_size_limit(2_000_000);reader=csv.reader(stream,strict=True);header=next(reader)
   if len(header)!=330 or len(header)!=len(set(header))or not set(FIELDS)<=set(header):raise ValueError('Native monthly CMS schema changed')
   col={name:header.index(name)for name in FIELDS};type_col=col['Entity Type Code'];tax_cols=[col['Healthcare Provider Taxonomy Code_'+str(i)]for i in range(1,16)]
   count=0
   for count,row in enumerate(reader,1):
    if len(row)!=len(header):raise ValueError('Malformed full monthly native row at '+str(count))
    if row[type_col]=='2' and any(row[i].startswith('3416')for i in tax_cols):
     native={field:row[index]for field,index in col.items()};record=derive(native,count)
     if record['key']in seen:raise ValueError('Duplicate native ambulance organization identity')
     seen.add(record['key']);inventory.append(record)
     if record['key']in originals:records[record['key']]=bind(record,originals[record['key']],national[record['key']])
    if count%1000000==0:print('Complete monthly CMS rows',count,flush=True)
   if count!=SOURCE_COUNT:raise ValueError('Incomplete monthly source: '+str(count))
   receipt={'sourceUrl':SOURCE,'sourceArchiveSha256':ARCHIVE_SHA,'sourceArchiveBytes':ARCHIVE_BYTES,
            'sourceMember':member.filename,'memberBytes':member.file_size,'memberCrc32':f'{member.CRC:08x}',
            'compressionMethod':member.compress_type,'sourceDate':SOURCE_DATE,'rowsScanned':count,
            'nativeHeader':header,'nativeHeaderSha256':sha(dump(header)),'retainedFields':list(FIELDS),
            'completeMemberVerified':True}
 if set(records)!=set(originals)or len(inventory)!=AMBULANCE_ORG_COUNT:
  raise ValueError('Complete native ambulance/original identity counts changed')
 return {'schemaVersion':2,'source':'cms-nppes-native-primary','sourceArchiveSha256':ARCHIVE_SHA,
         'sourceDate':SOURCE_DATE,'baselineIndexSha256':inputs['baselineIndexSha256'],
         'nationalRegistrySha256':inputs['nationalRegistrySha256'],'scanReceipt':receipt,
         'originalPrimaryCount':46791,'records':[records[k]for k in sorted(records)],
         'phoneInventoryScope':'Every native Type 2 organization with a 3416* ambulance taxonomy; not every NPI or all organizations.',
         'phoneInventory':inventory,'phoneInventoryCount':len(inventory),
         'reconstruction':'Recovered full-source recipe; actual regenerated report/target hashes are frozen separately. Earlier artifact hashes are not asserted.'}

def read_native(report,inputs):
 receipt=report['scanReceipt']
 if (report['sourceArchiveSha256']!=ARCHIVE_SHA or receipt['sourceArchiveSha256']!=ARCHIVE_SHA or
     receipt['sourceArchiveBytes']!=ARCHIVE_BYTES or receipt['sourceMember']!=SOURCE_MEMBER or
     receipt['memberBytes']!=MEMBER_BYTES or receipt['memberCrc32']!=MEMBER_CRC or
     receipt['rowsScanned']!=SOURCE_COUNT or receipt['completeMemberVerified']is not True or
     len(receipt['nativeHeader'])!=330 or sha(dump(receipt['nativeHeader']))!=receipt['nativeHeaderSha256']or
     receipt['retainedFields']!=list(FIELDS)or report['baselineIndexSha256']!=inputs['baselineIndexSha256']or
     report['nationalRegistrySha256']!=inputs['nationalRegistrySha256']):
  raise ValueError('Native source scan proof changed')
 originals={e['key']:e for e in inputs['entries']if e['source']=='NPPES'}
 national={native_key(r):r for r in inputs['nationalRows']if native_key(r)};inventory={};ordinals=set()
 for row in report['phoneInventory']:
  derived=derive(row['native'],row['sourceRowNumber'])
  if derived!=row or row['key']in inventory or row['sourceRowNumber']in ordinals:raise ValueError('Native phone inventory cannot be replayed')
  inventory[row['key']]=row;ordinals.add(row['sourceRowNumber'])
 if len(inventory)!=AMBULANCE_ORG_COUNT or report['phoneInventoryCount']!=AMBULANCE_ORG_COUNT:
  raise ValueError('Complete ambulance organization phone scope changed')
 expected=[bind(inventory[k],originals[k],national[k])for k in sorted(originals)]
 if expected!=report['records']or len(expected)!=ORIGINAL_NPI_COUNT:raise ValueError('Original native identity/component reconstruction changed')
 return expected

def component_targets(report,report_sha):
 targets=[]
 for record in report['records']:
  if record['originalStatus']not in ('no-match','not-eligible','unavailable','pending')or not active(record):continue
  p=record['primaryAddress']
  if p['country']not in ('','US'):continue
  variants={}
  for field in ('line1','line2'):
   a={'street':p[field],'city':p['city'],'state':p['state'],'zip':zip5(p['postalCode'])}
   if physical_address(a):variants[field]=a
  if not variants:continue
  if len(variants)==2 and address_key(variants['line1'],include_city=False)!=address_key(variants['line2'],include_city=False):continue
  field='line1'if'line1'in variants else'line2';a=variants[field]
  if a==record['originalCombinedAddress']:continue
  targets.append({'key':record['key'],'name':record['name'],'source':'NPPES','state':a['state'],
   'sourceDate':record['originalEntry']['sourceDate']if'originalEntry'in record else None,
   'sourceCounty':record['originalEntry']['sourceCounty']if'originalEntry'in record else '',
   'address':a,'status':'no-match','match':None,'countyFips':'',
   'componentEvidence':{'nativeRecordSha256':record['nativeRecordSha256'],'sourceRowNumber':record['sourceRowNumber'],
    'sourceReportSha256':report_sha,'sourceField':field,'rule':'unambiguous-native-primary-line',
    'originalCombinedAddress':copy.deepcopy(record['originalCombinedAddress'])}})
 return sorted(targets,key=lambda r:r['key'])

def targets_for_snapshot(report,report_sha,inputs):
 originals={e['key']:e for e in inputs['entries']};targets=component_targets(report,report_sha)
 for target in targets:
  original=originals[target['key']]
  for field in ('name','state','source','sourceDate','sourceCounty'):target[field]=copy.deepcopy(original[field])
 if len(targets)!=EXPECTED_TARGET_COUNT:
  raise ValueError('Regenerated native component target count requires explicit review: '+str(len(targets)))
 return targets

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--archive',type=pathlib.Path)
 parser.add_argument('--output',type=pathlib.Path,required=True);parser.add_argument('--targets',type=pathlib.Path,required=True)
 parser.add_argument('--snapshot',type=pathlib.Path);parser.add_argument('--locations',type=pathlib.Path)
 parser.add_argument('--replay-native',action='store_true');args=parser.parse_args();inputs=snapshot(args.locations)
 if args.replay_native:
  raw=args.output.read_bytes();report=json.loads(raw);read_native(report,inputs)
 else:
  if not args.archive:parser.error('--archive is required')
  report=scan(args.archive,inputs);read_native(report,inputs);raw=dump(report)
  args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_bytes(raw)
 targets=targets_for_snapshot(report,sha(raw),inputs);target_raw=dump(targets)
 args.targets.parent.mkdir(parents=True,exist_ok=True);args.targets.write_bytes(target_raw)
 if args.snapshot:args.snapshot.parent.mkdir(parents=True,exist_ok=True);args.snapshot.write_bytes(dump(inputs))
 print(json.dumps({'nativeReportSha256':sha(raw),'nativeTargetsSha256':sha(target_raw),
                   'targetCount':len(targets),'originalNpiCount':len(report['records']),
                   'completeMonthlyRows':SOURCE_COUNT,'phoneInventoryCount':len(report['phoneInventory'])}),flush=True)

if __name__=='__main__':main()
