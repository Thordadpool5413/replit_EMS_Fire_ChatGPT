#!/usr/bin/env python3
"""Read-only nationwide public-provider mapping gap inventory; never calls a network service."""
import argparse, collections, json, pathlib
from backfill_provider_locations import PUBLIC, ROOT, read_registry, verify, physical, base_street, normal_street, sha
from regional_point_contract import SOURCES

def classify(e):
    status=e['status']
    if status=='mapped':
        return 'countyConflict' if e.get('sourceCounty') and e['sourceCounty']!=e['countyFips'] else 'mappedUsable'
    if status in ('historical','source-missing','review','not-eligible'):
        return {'historical':'historical','source-missing':'missingSourceAddress','review':'requiresReview','not-eligible':'notEligible'}[status]
    if status in ('no-match','unavailable','pending'):
        if not physical(e['address']):return 'addressNeedsResearch'
        return 'recoverable'
    raise ValueError('Unknown location status')

def summarize(entries):
    states=collections.defaultdict(collections.Counter)
    targets=collections.defaultdict(set)
    sources=collections.defaultdict(collections.Counter)
    county_gaps=collections.Counter()
    seen=set()
    for e in entries:
        if e['key'] in seen:raise ValueError('Duplicate source identity')
        seen.add(e['key'])
        state=e['state']; category=classify(e)
        for c in (states[state],sources[e['source']]):
            c['total']+=1;c[category]+=1;c['withAddress']+=int(e['address'] is not None)
            c['mappedRaw']+=int(e['status']=='mapped')
        if category=='recoverable':
            a=e['address']
            targets[state].add((normal_street(base_street(a['street'])),normal_street(a['city']),a['zip']))
            county_gaps[(state,e.get('sourceCounty') or 'unknown')]+=1
    def row(key,c):
        result={'id':key,**{k:c[k] for k in ('total','withAddress','mappedRaw','mappedUsable','countyConflict','recoverable','addressNeedsResearch','requiresReview','missingSourceAddress','notEligible','historical')}}
        result['usableCoveragePct']=round(100*c['mappedUsable']/c['total'],2) if c['total'] else None
        return result
    ranked=[]
    for state,c in states.items():
        r=row(state,c);r['distinctAddressTargets']=len(targets[state])
        r['configuredSources']=[k for k,v in SOURCES.items() if v['state']==state]
        r['statewideSourceConfigured']=any(v['state']==state and not v['county'] for v in SOURCES.values())
        ranked.append(r)
    ranked.sort(key=lambda r:(-r['recoverable'],r['id']))
    totals=collections.Counter()
    for c in states.values():totals.update(c)
    return {'totals':row('national',totals),'states':ranked,'sources':[row(k,c) for k,c in sorted(sources.items())],
            'countyTargets':[{'state':s,'sourceCounty':c,'records':n} for (s,c),n in sorted(county_gaps.items(),key=lambda x:(-x[1],x[0]))],
            'distinctAddressTargets':sum(map(len,targets.values()))}

def main():
    p=argparse.ArgumentParser();p.add_argument('--snapshot',type=pathlib.Path,default=PUBLIC/'locations');p.add_argument('--json',type=pathlib.Path);p.add_argument('--markdown',type=pathlib.Path);args=p.parse_args()
    manifest,rows=read_registry();fl=json.loads((PUBLIC/'state-ems/FL.json').read_bytes())
    verify(args.snapshot,manifest,rows,fl)
    data=(args.snapshot/'index.json').read_bytes();index=json.loads(data)
    entries=[e for ch in index['chunks'] for e in json.loads((args.snapshot/ch['file']).read_bytes())]
    report={'schemaVersion':1,'snapshotSha256':sha(data),'snapshotGeneratedAt':index['generatedAt'],'sourceScope':index['sourceScope'],'excludedWithoutSupportedIdentity':index['excludedWithoutSupportedIdentity'],**summarize(entries)}
    t=report['totals']
    lines=['# Nationwide provider location recovery priorities','',f"Source snapshot: {report['snapshotGeneratedAt']}",'',f"Mapped source records: {t['mappedRaw']:,}; usable without source-county conflict: {t['mappedUsable']:,}/{t['total']:,} ({t['usableCoveragePct']}%).",f"Recoverable physical addresses: {t['recoverable']:,} records; {report['distinctAddressTargets']:,} distinct address targets. County-conflict pins withheld: {t['countyConflict']:,}.",'','Source identities, not unique active operating departments. A configured adapter is not proof of source availability or complete coverage.','', '| State | Source records | Usable mapped | County conflicts | Recoverable | Distinct addresses | Statewide adapter |','|---|---:|---:|---:|---:|---:|---|']
    for r in report['states']:
        lines.append(f"| {r['id']} | {r['total']} | {r['mappedUsable']} | {r['countyConflict']} | {r['recoverable']} | {r['distinctAddressTargets']} | {'Yes' if r['statewideSourceConfigured'] else 'No'} |")
    markdown='\n'.join(lines)+'\n'
    if args.json:args.json.parent.mkdir(parents=True,exist_ok=True);args.json.write_text(json.dumps(report,indent=2)+'\n')
    if args.markdown:args.markdown.parent.mkdir(parents=True,exist_ok=True);args.markdown.write_text(markdown)
    print(markdown)
if __name__=='__main__':main()
