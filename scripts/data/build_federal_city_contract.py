#!/usr/bin/env python3
"""Generate finite exact-city match/address bindings after retained replay."""
import json
from backfill_provider_locations import ROOT
from stage_usgs_primary import dump
from retain_federal_city_points import verify
def build():
 report,_,_=verify(complete=False);pins={};examples=[];seen=set()
 for candidate in report['candidates']+report['diagnosticCandidates']:
  match=candidate['match'];address=candidate['address']
  key=json.dumps([match['method'],match['point']['objectId'],address['street'],address['city'],address['state'],address['zip']],separators=(',',':'),ensure_ascii=False)
  if key in pins and pins[key]!=match:raise ValueError('City point/address binding is ambiguous')
  pins[key]=match;kind=(match['method'],bool(match['sourceAddress']['zip']))
  if kind not in seen:seen.add(kind);examples.append({'label':str(kind),'address':address,'match':match})
 content='// Generated from complete retained native city source replay.\nexport const FEDERAL_CITY_MATCHES:Record<string,unknown>='+json.dumps(pins,separators=(',',':'),sort_keys=True)+';\n'
 for root in('artifacts/ems-territory-intelligence/src/services','artifacts/api-server/src/lib'):(ROOT/root/'federalCityPointPins.ts').write_text(content)
 (ROOT/'scripts/fixtures/federal-city-point-examples.json').write_bytes(dump(examples))
 print('Finite retained city bindings',len(pins),'actual source examples',len(examples))
if __name__=='__main__':build()
