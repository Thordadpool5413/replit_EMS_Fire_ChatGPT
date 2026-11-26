#!/usr/bin/env python3
"""Freeze exact original identity, native component and independent point bindings."""
import argparse,copy,json
from backfill_provider_locations import ROOT,native_key
from recover_nppes_native_primary import dump
from recover_nppes_primary_components import inputs,verify as verify_strict

def build(extended=False):
 snapshot,_,_=inputs()
 if extended:
  from recover_nppes_primary_components_extended import verify
  report,_=verify()
 else:report,_=verify_strict(complete=False)
 original={e['key']:e for e in snapshot['entries']};national={native_key(r):r for r in snapshot['nationalRows']if native_key(r)}
 pins={};examples=[];seen=set()
 for candidate in report['candidates']:
  key=candidate['key'];old=original[key];proof=candidate['primaryAddressEvidence']
  if key not in national or proof['originalAddress']!=old['address']:raise ValueError('Exact native primary identity binding is missing')
  binding={'identity':{k:copy.deepcopy(old[k])for k in('key','name','state','source','sourceCounty','sourceDate')},
   'originalAddress':copy.deepcopy(old['address']),'address':copy.deepcopy(candidate['address']),
   'countyFips':candidate['countyFips'],'match':copy.deepcopy(candidate['match']),
   'evidence':copy.deepcopy(proof),'nationalRow':copy.deepcopy(national[key])}
  pins.setdefault(key,[]).append(binding)
  kind=(candidate['match']['method'],proof['selectedField'],candidate['match'].get('sourceAddressProfile'))
  if kind not in seen:
   seen.add(kind);examples.append({'label':str(kind),'evidence':proof,
    'context':{'key':key,'name':old['name'],'state':old['state'],'source':old['source'],'sourceCounty':old['sourceCounty'],
     'countyFips':candidate['countyFips'],'address':candidate['address'],'match':candidate['match'],
     'originalAddress':old['address'],'nationalRow':national[key]}})
 content='// Generated from exact native primary identity/component/location replay.\nexport const NPPES_COMPONENT_BINDINGS:Record<string,unknown[]>='+json.dumps(pins,separators=(',',':'),sort_keys=True)+';\n'
 for root in('artifacts/ems-territory-intelligence/src/services','artifacts/api-server/src/lib'):(ROOT/root/'nppesPrimaryComponentsPins.ts').write_text(content)
 (ROOT/'scripts/fixtures/nppes-primary-component-examples.json').write_bytes(dump(examples))
 print('Finite native component identity bindings',len(pins),'actual examples',len(examples))
def main():
 p=argparse.ArgumentParser();p.add_argument('--extended',action='store_true');a=p.parse_args();build(a.extended)
if __name__=='__main__':main()
