#!/usr/bin/env python3
"""Retain the complete Other Name reference member from the pinned monthly ZIP.

Every native row is parsed, every source byte is retained in bounded ZIP packs,
and the complete Type 2 ambulance inventory is joined locally by native NPI.
Only explicit Type 3 rows may later establish a DBA; no association is made here.
"""
import argparse,collections,csv,functools,hashlib,io,json,pathlib,re,tempfile,zipfile,zlib
from backfill_provider_locations import ROOT,SOURCE,sha,digest_file
from recover_nppes_native_primary import ARCHIVE_SHA,ARCHIVE_BYTES,AMBULANCE_ORG_COUNT,dump
from retain_nppes_native_source import DEFAULT as CMS_EVIDENCE,verify as verify_cms,current_pins
from recover_nppes_primary_components import inputs as cms_inputs
from checked_zip_member import open_checked_member
from stage_nppes import valid_npi

EVIDENCE=ROOT/'scripts/data/evidence/primary-nppes-other-names/2026-11-26'
SOURCE_MEMBER='othername_pfile_20050523-20261102.csv'
FIELDS=('NPI','Provider Other Organization Name','Provider Other Organization Name Type Code')
PACK_BYTES=64*1024*1024

def source_keys():
 verify_cms(CMS_EVIDENCE)
 _,_,native=cms_inputs();keys={r['npi']for r in native['phoneInventory']}
 if len(keys)!=AMBULANCE_ORG_COUNT:raise ValueError('Complete native ambulance identity inventory changed')
 return keys

def parse_source(path,keys):
 csv.field_size_limit(2_000_000);types=collections.Counter();selected=[];quarantined=[];inventory=hashlib.sha256();count=0
 with path.open('r',encoding='utf-8-sig',newline='')as stream:
  reader=csv.reader(stream,strict=True);header=next(reader)
  if len(header)!=len(set(header))or set(header)!=set(FIELDS):raise ValueError('Unexpected native Other Names header: '+repr(header))
  for count,values in enumerate(reader,1):
   if len(values)!=len(header):raise ValueError('Malformed complete Other Names record at '+str(count))
   row=dict(zip(header,values));native_sha=sha(dump(row));inventory.update(dump(row))
   types[row[FIELDS[2]]]+=1
   witness={'sourceRowNumber':count,'nativeRecordSha256':native_sha,'native':row}
   if not valid_npi(row['NPI'])or not row[FIELDS[1]].strip():
    quarantined.append({**witness,'reason':'invalid-native-npi-or-empty-name'});continue
   if row['NPI']in keys:selected.append(witness)
 if count==0:raise ValueError('Empty complete Other Names source')
 return {'nativeHeader':header,'completeRowsScanned':count,'sourceMemberSha256':digest_file(path),
  'sourceMemberBytes':path.stat().st_size,'completeNativeInventorySha256':inventory.hexdigest(),
  'nameTypeCounts':dict(sorted(types.items())),'ambulanceInventoryCount':len(keys),
  'selectedNativeRows':selected,'quarantined':quarantined,
  'selectedNativeRowCount':len(selected),
  'selectedDbaRowCount':sum(r['native'][FIELDS[2]]=='3'for r in selected)}

def write_zip(path,members):
 with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED,compresslevel=9)as z:
  for name,raw in sorted(members.items()):
   info=zipfile.ZipInfo(name,date_time=(2026,11,26,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,raw)

def dependencies():
 return {'native-cms':{'archiveSha256':digest_file(CMS_EVIDENCE/'original.zip'),
  'manifestSha256':sha((CMS_EVIDENCE/'manifest.json').read_bytes()),
  'nativeReportSha256':current_pins()[0]}}

def summary(report,manifest):
 return {'schemaVersion':1,'source':report['source'],'sourceUrl':SOURCE,
  'monthlyArchiveSha256':ARCHIVE_SHA,'sourceMember':SOURCE_MEMBER,
  'sourceMemberSha256':report['sourceMemberSha256'],'sourceMemberBytes':report['sourceMemberBytes'],
  'completeRowsScanned':report['completeRowsScanned'],'completeNativeInventorySha256':report['completeNativeInventorySha256'],
  'nativeHeader':report['nativeHeader'],'nameTypeCounts':report['nameTypeCounts'],
  'ambulanceInventoryCount':report['ambulanceInventoryCount'],
  'selectedNativeRowCount':report['selectedNativeRowCount'],'selectedDbaRowCount':report['selectedDbaRowCount'],
  'quarantinedRows':len(report['quarantined']),'archiveSha256':manifest['archiveSha256'],
  'sourcePackCount':len(manifest['sourcePacks']),'reportSha256':manifest['reportSha256'],
  'publication':'complete native source only; no inferred identity or location is authorized by this reference file'}

def retain(archive,output=EVIDENCE):
 if archive.stat().st_size!=ARCHIVE_BYTES or digest_file(archive)!=ARCHIVE_SHA:raise ValueError('Pinned full monthly CMS source changed')
 keys=source_keys();output.mkdir(parents=True,exist_ok=True)
 with tempfile.TemporaryDirectory(prefix='atlas-other-names-')as td:
  path=pathlib.Path(td)/'other-names.csv'
  with zipfile.ZipFile(archive)as z:
   names=z.namelist()
   if len(names)!=len(set(names))or names.count(SOURCE_MEMBER)!=1:raise ValueError('Expected exact complete native Other Names member')
   member=z.getinfo(SOURCE_MEMBER);inventory=[{'name':m.filename,'bytes':m.file_size,'compressedBytes':m.compress_size,
    'crc32':f'{m.CRC:08x}','compressionMethod':m.compress_type}for m in z.infolist()]
   with open_checked_member(archive,z,member)as source,path.open('wb')as target:
    while True:
     data=source.read(4*1024*1024)
     if not data:break
     target.write(data)
   if path.stat().st_size!=member.file_size:raise ValueError('Incomplete native Other Names extraction')
   receipt={'sourceUrl':SOURCE,'sourceArchiveSha256':ARCHIVE_SHA,'sourceArchiveBytes':ARCHIVE_BYTES,
    'sourceMember':member.filename,'memberBytes':member.file_size,'memberCrc32':f'{member.CRC:08x}',
    'completeMemberVerified':True,'completeMonthlyArchiveVerified':True}
  report={'schemaVersion':1,'source':'cms-nppes-complete-native-other-names','scanReceipt':receipt,**parse_source(path,keys)}
  packs=[]
  with path.open('rb')as source:
   index=0;offset=0
   while True:
    raw=source.read(PACK_BYTES)
    if not raw:break
    name=f'source-{index:04d}.zip';write_zip(output/name,{'source.bin':raw})
    packs.append({'file':name,'offset':offset,'sourceBytes':len(raw),'sourceSha256':sha(raw),
     'archiveSha256':digest_file(output/name),'archiveBytes':(output/name).stat().st_size})
    offset+=len(raw);index+=1
  raw=dump(report);members={'report.json':raw,'source/monthly-zip-inventory.json':dump(inventory)}
  write_zip(output/'original.zip',members)
 manifest={'schemaVersion':1,'sourceArchiveSha256':ARCHIVE_SHA,'archiveSha256':digest_file(output/'original.zip'),
  'archiveBytes':(output/'original.zip').stat().st_size,'reportSha256':sha(raw),'sourceDependencies':dependencies(),
  'sourcePacks':packs,'members':{name:{'sha256':sha(data),'bytes':len(data)}for name,data in members.items()}}
 (output/'manifest.json').write_bytes(dump(manifest));(output/'summary.json').write_bytes(dump(summary(report,manifest)))
 return report,manifest

def verify(output=EVIDENCE):
 manifest=json.loads((output/'manifest.json').read_bytes())
 if(manifest['sourceArchiveSha256']!=ARCHIVE_SHA or manifest['sourceDependencies']!=dependencies()or
    digest_file(output/'original.zip')!=manifest['archiveSha256']or(output/'original.zip').stat().st_size!=manifest['archiveBytes']):
  raise ValueError('Native Other Names dependency or archive changed')
 expected={'report.json','source/monthly-zip-inventory.json'}
 with zipfile.ZipFile(output/'original.zip')as z:
  if set(z.namelist())!=expected or len(z.namelist())!=len(expected)or set(manifest['members'])!=expected:
   raise ValueError('Native Other Names header membership changed')
  files={name:z.read(name)for name in expected}
 for name,data in files.items():
  if {'sha256':sha(data),'bytes':len(data)}!=manifest['members'][name]:raise ValueError('Native Other Names header member changed')
 report=json.loads(files['report.json']);receipt=report['scanReceipt'];inventory=json.loads(files['source/monthly-zip-inventory.json'])
 members=[m for m in inventory if m['name']==SOURCE_MEMBER]
 if(len(members)!=1 or receipt!={'sourceUrl':SOURCE,'sourceArchiveSha256':ARCHIVE_SHA,'sourceArchiveBytes':ARCHIVE_BYTES,
   'sourceMember':SOURCE_MEMBER,'memberBytes':members[0]['bytes'],'memberCrc32':members[0]['crc32'],
   'completeMemberVerified':True,'completeMonthlyArchiveVerified':True}):raise ValueError('Complete native Other Names receipt changed')
 keys=source_keys()
 with tempfile.TemporaryDirectory(prefix='atlas-other-names-replay-')as td:
  path=pathlib.Path(td)/'other-names.csv';offset=0;crc=0
  with path.open('wb')as target:
   for index,pack in enumerate(manifest['sourcePacks']):
    name=f'source-{index:04d}.zip'
    if pack['file']!=name or pack['offset']!=offset or not 0<pack['sourceBytes']<=PACK_BYTES:
     raise ValueError('Native Other Names source pack ordering changed')
    if digest_file(output/name)!=pack['archiveSha256']or(output/name).stat().st_size!=pack['archiveBytes']:
     raise ValueError('Native Other Names source pack changed')
    with zipfile.ZipFile(output/name)as z:
     if z.namelist()!=['source.bin']:raise ValueError('Native Other Names source pack membership changed')
     raw=z.read('source.bin')
    if len(raw)!=pack['sourceBytes']or sha(raw)!=pack['sourceSha256']:raise ValueError('Native Other Names source bytes changed')
    target.write(raw);crc=zlib.crc32(raw,crc);offset+=len(raw)
  if offset!=receipt['memberBytes']or f'{crc:08x}'!=receipt['memberCrc32']:raise ValueError('Full native Other Names size or CRC changed')
  rebuilt={'schemaVersion':1,'source':'cms-nppes-complete-native-other-names','scanReceipt':receipt,**parse_source(path,keys)}
 if dump(rebuilt)!=files['report.json']or sha(files['report.json'])!=manifest['reportSha256']:
  raise ValueError('Complete native Other Names replay changed')
 if(output/'summary.json').read_bytes()!=dump(summary(rebuilt,manifest)):raise ValueError('Native Other Names summary changed')
 return rebuilt,manifest

@functools.lru_cache(maxsize=1)
def source_catalog():return verify()

def main():
 p=argparse.ArgumentParser();p.add_argument('--archive',type=pathlib.Path);p.add_argument('--output',type=pathlib.Path,default=EVIDENCE)
 p.add_argument('--verify',action='store_true');a=p.parse_args()
 if a.verify:report,manifest=verify(a.output)
 else:
  if not a.archive:p.error('--archive is required')
  report,manifest=retain(a.archive,a.output)
 print(json.dumps(summary(report,manifest)),flush=True)
if __name__=='__main__':main()
