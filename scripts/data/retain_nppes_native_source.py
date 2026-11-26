#!/usr/bin/env python3
"""Retain and replay the actual regenerated native CMS source edition."""
import argparse,json,pathlib,zipfile
from backfill_provider_locations import ROOT,sha,digest_file
from recover_nppes_native_primary import dump,snapshot,read_native,targets_for_snapshot,ARCHIVE_SHA,SOURCE_COUNT,ORIGINAL_NPI_COUNT,AMBULANCE_ORG_COUNT

DEFAULT=ROOT/'scripts/data/evidence/primary-nppes-native/2026-11-26'
def current_pins(output=DEFAULT):
 if not(output/'manifest.json').exists():return None,None
 manifest=json.loads((output/'manifest.json').read_bytes())
 if manifest.get('sourceArchiveSha256')!=ARCHIVE_SHA:raise ValueError('Native CMS source edition changed')
 return manifest['nativeReportSha256'],manifest['nativeTargetsSha256']
NATIVE_SHA,TARGET_SHA=current_pins()

def retain(native,targets,output=DEFAULT):
 native_raw=native.read_bytes();target_raw=targets.read_bytes();inputs=snapshot()
 report=json.loads(native_raw);read_native(report,inputs)
 expected=targets_for_snapshot(report,sha(native_raw),inputs)
 if dump(expected)!=target_raw:raise ValueError('Native components differ from exact source-field replay')
 members={'source/native-primary.json':native_raw,'inputs/native-component-targets.json':target_raw,
          'inputs/original-snapshot.json':dump(inputs)}
 output.mkdir(parents=True,exist_ok=True)
 with zipfile.ZipFile(output/'original.zip','w',zipfile.ZIP_DEFLATED,compresslevel=9)as z:
  for name,raw in sorted(members.items()):
   info=zipfile.ZipInfo(name,date_time=(2026,11,26,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,raw)
 (output/'native-component-targets.json').write_bytes(target_raw)
 manifest={'schemaVersion':2,'sourceArchiveSha256':ARCHIVE_SHA,'completeMonthlyRows':SOURCE_COUNT,
           'originalNpiCount':ORIGINAL_NPI_COUNT,'phoneInventoryCount':AMBULANCE_ORG_COUNT,
           'nativeReportSha256':sha(native_raw),'nativeTargetsSha256':sha(target_raw),'nativeTargetCount':len(expected),
           'archiveSha256':digest_file(output/'original.zip'),'archiveBytes':(output/'original.zip').stat().st_size,
           'members':{name:{'sha256':sha(raw),'bytes':len(raw)}for name,raw in members.items()}}
 (output/'manifest.json').write_bytes(dump(manifest));return manifest

def verify(output=DEFAULT):
 m=json.loads((output/'manifest.json').read_bytes());required={'source/native-primary.json','inputs/native-component-targets.json','inputs/original-snapshot.json'}
 if m['sourceArchiveSha256']!=ARCHIVE_SHA or digest_file(output/'original.zip')!=m['archiveSha256']or(output/'original.zip').stat().st_size!=m['archiveBytes']:
  raise ValueError('Native source package changed')
 with zipfile.ZipFile(output/'original.zip')as z:
  if set(z.namelist())!=required or len(z.namelist())!=len(required)or set(m['members'])!=required:raise ValueError('Native source package membership changed')
  data={}
  for name in required:
   raw=z.read(name)
   if {'sha256':sha(raw),'bytes':len(raw)}!=m['members'][name]:raise ValueError('Native source member changed')
   data[name]=raw
 inputs=json.loads(data['inputs/original-snapshot.json'])
 if inputs!=snapshot():raise ValueError('Retained original identity snapshot changed')
 native_raw=data['source/native-primary.json'];report=json.loads(native_raw);read_native(report,inputs)
 targets=targets_for_snapshot(report,sha(native_raw),inputs);target_raw=dump(targets)
 if (sha(native_raw)!=m['nativeReportSha256']or sha(target_raw)!=m['nativeTargetsSha256']or
     target_raw!=data['inputs/native-component-targets.json']or target_raw!=(output/'native-component-targets.json').read_bytes()or
     len(targets)!=m['nativeTargetCount']):raise ValueError('Native source target replay changed')
 return m

def main():
 p=argparse.ArgumentParser();p.add_argument('--native',type=pathlib.Path);p.add_argument('--targets',type=pathlib.Path)
 p.add_argument('--output',type=pathlib.Path,default=DEFAULT);p.add_argument('--verify',action='store_true');a=p.parse_args()
 if a.verify:m=verify(a.output)
 else:
  if not a.native or not a.targets:p.error('--native and --targets are required')
  retain(a.native,a.targets,a.output);m=verify(a.output)
 print(json.dumps(m),flush=True)

if __name__=='__main__':main()
