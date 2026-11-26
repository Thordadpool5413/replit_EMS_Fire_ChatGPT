#!/usr/bin/env python3
"""Generate exact native range/coordinate/address pins after retained replay."""
import copy,json
from backfill_provider_locations import ROOT
from stage_tiger_primary import dump
from retain_tiger_primary import verify
def build():
 report,_,_=verify(complete=False);pins={};examples=[];seen=set()
 for c in report['candidates']+report['diagnosticCandidates']:
  match=c['match'];point=match['point'];key=point['nativeId'];address=c['address'];coordinates=[match['latitude'],match['longitude']]
  if key in pins and(pins[key]['point']!=point or pins[key]['coordinates']!=coordinates):raise ValueError('Native range coordinate identity conflict')
  pin=pins.setdefault(key,{'point':copy.deepcopy(point),'coordinates':coordinates,'addresses':[]})
  if address not in pin['addresses']:pin['addresses'].append(copy.deepcopy(address))
  kind=(point['side'],point['parity'],int(point['fromHouseNumber'])>int(point['toHouseNumber']),bool(point['fromType']or point['toType']))
  if kind not in seen:seen.add(kind);examples.append({'label':str(kind),'address':address,'match':match})
 content='// Generated from complete retained native range and geometry replay.\nexport const TIGER_POINT_PINS:Record<string,unknown>='+json.dumps(pins,separators=(',',':'),sort_keys=True)+';\n'
 for root in('artifacts/ems-territory-intelligence/src/services','artifacts/api-server/src/lib'):(ROOT/root/'tigerPrimaryPointPins.ts').write_text(content)
 (ROOT/'scripts/fixtures/tiger-primary-point-examples.json').write_bytes(dump(examples))
 print('Finite retained TIGER range points',len(pins),'actual source examples',len(examples))
if __name__=='__main__':build()
