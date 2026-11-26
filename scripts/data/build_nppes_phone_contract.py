#!/usr/bin/env python3
"""Generate finite phone-site bindings only after full donor release replay."""
import copy,json
from backfill_provider_locations import ROOT,native_key
from recover_nppes_native_primary import dump
from recover_nppes_primary_components import inputs
from recover_nppes_phone_sites import verify
def build():
 report,_=verify();snapshot,_,_=inputs();original={e['key']:e for e in snapshot['entries']}
 national={native_key(r):r for r in snapshot['nationalRows']if native_key(r)};pins={};examples=[];seen=set()
 for c in report['candidates']:
  key=c['key'];old=original[key];proof=c['primaryAddressEvidence']
  binding={'identity':{k:copy.deepcopy(old[k])for k in('key','name','state','source','sourceCounty','sourceDate')},
   'originalAddress':copy.deepcopy(old['address']),'address':copy.deepcopy(c['address']),'countyFips':c['countyFips'],
   'match':copy.deepcopy(c['match']),'evidence':copy.deepcopy(proof),'nationalRow':copy.deepcopy(national[key])}
  pins.setdefault(key,[]).append(binding)
  kind=(c['match']['method'],proof['correlation']['nameBasis']['rule'],proof['donor']['siteRole'])
  if kind not in seen:
   seen.add(kind);examples.append({'label':str(kind),'evidence':proof,
    'context':{'key':key,'name':old['name'],'state':old['state'],'source':old['source'],'sourceCounty':old['sourceCounty'],
     'countyFips':c['countyFips'],'address':c['address'],'match':c['match'],'originalAddress':old['address'],'nationalRow':national[key]}})
 content='// Generated from complete native identity and final non-phone donor release replay.\nexport const NPPES_PHONE_SITE_BINDINGS:Record<string,unknown[]>='+json.dumps(pins,separators=(',',':'),sort_keys=True)+';\n'
 for root in('artifacts/ems-territory-intelligence/src/services','artifacts/api-server/src/lib'):(ROOT/root/'nppesPhoneSitePins.ts').write_text(content)
 (ROOT/'scripts/fixtures/nppes-phone-site-examples.json').write_bytes(dump(examples))
 print('Finite native phone-site bindings',len(pins),'actual donor/role examples',len(examples))
if __name__=='__main__':build()
