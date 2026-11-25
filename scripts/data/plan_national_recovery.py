#!/usr/bin/env python3
"""Read-only deterministic national recovery queue, scoped by actual source records."""
import argparse, collections, json, pathlib
from backfill_provider_locations import PUBLIC, read_registry, verify, physical, base_street, normal_street, sha
from regional_point_contract import SOURCES
from audit_location_gaps import summarize
# Research-only sources are intentionally separate from accepted coordinate adapters.
REVIEW_SOURCES={'va-vgin':('VA',()),'mn-mngeo':('MN',()),'wi-ng911':('WI',()),'mi-midland':('MI',('26111',)),'ca-la-cams':('CA',('06037',))}
def address_target(e):
    a=e['address']
    return (e['state'],normal_street(base_street(a['street'])),normal_street(a['city']),a['zip'])
def build_queue(entries):
    if len({e['key'] for e in entries})!=len(entries):raise ValueError('Duplicate source identity')
    actionable=[e for e in entries if e['status'] in ('no-match','unavailable') and physical(e.get('address'))]
    groups=collections.defaultdict(list)
    for e in actionable:groups[(e['state'],e.get('sourceCounty') or 'unknown')].append(e)
    counties=[{'state':s,'sourceCounty':c,'records':len(es),'distinctAddresses':len({address_target(e) for e in es})} for (s,c),es in groups.items()]
    counties.sort(key=lambda x:(-x['records'],x['state'],x['sourceCounty']))
    adapters=[]
    def add(name,state,scope,mode):
        known=[e for e in actionable if e['state']==state and (not scope or e.get('sourceCounty') in scope)]
        unknown=[e for e in actionable if e['state']==state and not e.get('sourceCounty')] if scope else []
        adapters.append({'adapter':name,'state':state,'scopeCounties':list(scope),'mode':mode,'inScopeRecords':len(known),'inScopeDistinctAddresses':len({address_target(e) for e in known}),'unassignedCountyRecordsForResearch':len(unknown)})
    for name,d in SOURCES.items():
        scope=('48085','48121') if name=='tx-prosper' else (d['county'],) if d['county'] else ()
        add(name,d['state'],scope,'accepted-address-point-adapter')
    for name,(state,scope) in REVIEW_SOURCES.items():add(name,state,scope,'review-only-acquisition')
    adapters.sort(key=lambda x:(-x['inScopeRecords'],x['adapter']))
    states=collections.defaultdict(list)
    for e in actionable:states[e['state']].append(e)
    ranked=[{'state':s,'records':len(es),'distinctAddresses':len({address_target(e) for e in es}),'unknownCountyRecords':sum(not e.get('sourceCounty') for e in es),'hasConfiguredStatewideAdapter':any(a['state']==s and not a['scopeCounties'] and a['mode']=='accepted-address-point-adapter' for a in adapters)} for s,es in states.items()]
    ranked.sort(key=lambda x:(-x['records'],x['state']))
    baseline=summarize(entries)['totals']
    return {'sourceRecords':baseline['total'],'mappedRecords':baseline['mappedRaw'],'usableMappedRecords':baseline['mappedUsable'],'actionableRecords':len(actionable),'distinctAddressTargets':len({address_target(e) for e in actionable}),'states':ranked,'countyTargets':counties,'adapterTargets':adapters,'scope':'No-match/unavailable physical source addresses only. Source identities are not unique providers. Adapter scopes overlap; counts are not additive or predicted matches. Unknown county is research-only for county adapters.'}
def main():
    p=argparse.ArgumentParser();p.add_argument('--output',type=pathlib.Path,required=True);a=p.parse_args()
    loc=PUBLIC/'locations';m,rows=read_registry();fl=json.loads((PUBLIC/'state-ems/FL.json').read_bytes());verify(loc,m,rows,fl)
    raw=(loc/'index.json').read_bytes();idx=json.loads(raw)
    entries=[e for c in idx['chunks'] for e in json.loads((loc/c['file']).read_bytes())]
    report={'schemaVersion':1,'snapshotSha256':sha(raw),'snapshotGeneratedAt':idx['generatedAt'],**build_queue(entries)}
    a.output.mkdir(parents=True,exist_ok=True);(a.output/'national-recovery-queue.json').write_text(json.dumps(report,indent=2)+'\n')
    print('National recovery queue:',json.dumps({k:report[k] for k in ('sourceRecords','mappedRecords','usableMappedRecords','actionableRecords','distinctAddressTargets')}))
    print('Top states:',json.dumps(report['states'][:10]));print('Top counties:',json.dumps(report['countyTargets'][:10]));print('Top adapters:',json.dumps(report['adapterTargets'][:10]))
if __name__=='__main__':main()
