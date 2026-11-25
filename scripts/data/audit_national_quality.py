#!/usr/bin/env python3
"""Read-only committed source-record audit. No network calls, private records or identity merges."""
import argparse, collections, json, pathlib
from backfill_provider_locations import PUBLIC, read_registry, verify, native_key, normal_street, base_street, sha
from audit_location_gaps import summarize, classify

def valid_npi(npi):
    if len(npi)!=10 or not npi.isascii() or not npi.isdigit(): return False
    digits=[int(x) for x in '80840'+npi]
    return sum((v*2-9 if v*2>9 else v*2) if i%2 else v for i,v in enumerate(reversed(digits)))%10==0

def audit(entries, registry_rows):
    mapping=summarize(entries)
    t=mapping['totals']
    categories=('mappedUsable','countyConflict','recoverable','addressNeedsResearch','requiresReview','missingSourceAddress','notEligible','historical')
    if sum(t[k] for k in categories)!=t['total'] or t['mappedRaw']!=t['mappedUsable']+t['countyConflict']:
        raise ValueError('Location categories do not reconcile')
    methods=collections.defaultdict(collections.Counter)
    address_groups=collections.defaultdict(list)
    identifiers=collections.Counter()
    for row in registry_rows:
        key=native_key(row)
        if not key: identifiers['excludedRegistryRows']+=1
        if row[1]=='NPPES':
            identifiers['nppesRows']+=1
            if not valid_npi(row[0].removeprefix('nppes:')): identifiers['invalidNpiChecksum']+=1
        if row[1]=='USFA':
            identifiers['usfaRows']+=1
            if ':location-' in row[0]: identifiers['missingNativeFdid']+=1
    for e in entries:
        a=e.get('address')
        if a and a['state']!=e['state']: raise ValueError('Address state differs from native identity')
        if e['status']=='mapped':
            method=e['match']['method']
            methods[method]['raw']+=1
            methods[method]['usable']+=int(classify(e)=='mappedUsable')
        if a and a.get('zip'):
            key=(e['state'],normal_street(base_street(a['street'])),normal_street(a['city']),a['zip'])
            address_groups[key].append(e)
    # Co-location is a research clue, not a duplicate identity or shared operating station.
    cross_source=[g for g in address_groups.values() if len({e['source'] for e in g})>1]
    return {'mapping':mapping,'registryIdentityChecks':dict(identifiers),
            'coordinateMethods':{k:dict(v) for k,v in sorted(methods.items())},
            'coLocationReview':{'crossSourceAddressGroups':len(cross_source),'sourceRowsInGroups':sum(map(len,cross_source))},
            'domainsNotMeasured':['live NERIS station completeness','private workspace duplicate claims','current equipment inventory','live procurement coverage','professional contact completeness','end-user validation']}

def main():
    p=argparse.ArgumentParser()
    p.add_argument('--output',type=pathlib.Path,required=True)
    args=p.parse_args()
    registry,rows=read_registry()
    location=PUBLIC/'locations'
    fl=json.loads((PUBLIC/'state-ems/FL.json').read_bytes())
    verify(location,registry,rows,fl)
    raw=(location/'index.json').read_bytes()
    index=json.loads(raw)
    entries=[e for ch in index['chunks'] for e in json.loads((location/ch['file']).read_bytes())]
    report={'schemaVersion':1,'locationManifestSha256':sha(raw),'registryManifestSha256':sha((PUBLIC/'national/index.json').read_bytes()),'snapshotGeneratedAt':index['generatedAt'],'grain':'Source-native identities, not unique active providers',**audit(entries,rows)}
    args.output.mkdir(parents=True,exist_ok=True)
    (args.output/'national-quality.json').write_text(json.dumps(report,indent=2)+'\n')
    t=report['mapping']['totals']
    lines=['# National public-data quality baseline','',f"Snapshot: {report['snapshotGeneratedAt']}",'',
           f"Eligible source identities: {t['total']:,}. Usable mapping: {t['mappedUsable']:,} ({t['usableCoveragePct']}%).",
           f"County conflicts withheld: {t['countyConflict']:,}. Recoverable physical addresses: {t['recoverable']:,}.",
           '', '## Registry identity diagnostics','']
    for k,v in sorted(report['registryIdentityChecks'].items()): lines.append(f'- {k}: {v:,}')
    lines+=['','## Coordinate methods','','| Method | Raw | Usable |','|---|---:|---:|']
    for k,v in report['coordinateMethods'].items(): lines.append(f"| {k} | {v['raw']} | {v['usable']} |")
    lines+=['','## Co-location review (not duplicate providers)','',f"Cross-source address groups: {report['coLocationReview']['crossSourceAddressGroups']:,}; source rows: {report['coLocationReview']['sourceRowsInGroups']:,}.",
            '', '## Not measured in this snapshot','']+['- '+s for s in report['domainsNotMeasured']]
    lines+=['','Source matches do not establish current operation, operational station coordinates or independent validation. No records modified.']
    markdown='\n'.join(lines)+'\n'
    (args.output/'national-quality.md').write_text(markdown)
    print(markdown)
if __name__=='__main__': main()
