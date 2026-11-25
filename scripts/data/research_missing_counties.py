#!/usr/bin/env python3
"""Offline county research from exact co-addressed registry records, never a county assignment."""
import argparse,collections,json,pathlib,re
from backfill_provider_locations import PUBLIC,ROOT,read_registry,verify,physical,base_street,normal_street,sha
from recovery_checkpoint import fingerprint
POINT_METHODS={'regional-address-point','nad-address-point','ny-sam-address-point','ohio-lbrs-address-point'}
def address_key(e):
    a=e.get('address')
    if not physical(a) or not re.fullmatch(r'\d{5}',a['zip']) or a['state']!=e['state'] or not a['city'].strip():return None
    # Do not collapse suite, building, floor or unit addresses into shared base addresses.
    if base_street(a['street'])!=a['street'].strip():return None
    return (a['state'],normal_street(a['street']),normal_street(a['city']),a['zip'])
def build_report(entries,fips):
    if len({e['key'] for e in entries})!=len(entries):raise ValueError('Duplicate native identity')
    groups=collections.defaultdict(list)
    for e in entries:
        k=address_key(e)
        if k:groups[k].append(e)
    output=[];stats=collections.Counter();by_state=collections.defaultdict(collections.Counter)
    for e in sorted(entries,key=lambda x:x['key']):
        if e['status'] not in ('no-match','unavailable') or e.get('sourceCounty') or not physical(e.get('address')):continue
        if e.get('match') is not None or e.get('countyFips'):raise ValueError('Unexpected unmatched coordinates')
        k=address_key(e);peers=[p for p in groups.get(k,[]) if p['key']!=e['key']] if k else []
        claims=set();invalid=False
        for p in peers:
            for cf in (p.get('sourceCounty'),p.get('countyFips')):
                if not cf:continue
                if fips.get(cf)!=e['state']:invalid=True
                claims.add(cf)
        row={'sourceKey':e['key'],'state':e['state'],'recordFingerprint':fingerprint(e),'countyCandidate':None,'evidence':[],'endUserValidationRequired':True,'publicationEligible':False}
        if not k:status='unsupported_address'
        elif invalid or len(claims)>1:status='conflicting_county_evidence'
        elif not claims:status='no_county_evidence'
        else:
            cf=next(iter(claims));evidence=[]
            for p in peers:
                if p['status'] in ('historical','source-missing','not-eligible','review') or p['source']==e['source']:continue
                m=p.get('match') or {};method=m.get('method')
                declared=p.get('sourceCounty')==cf
                point=p['status']=='mapped' and p.get('countyFips')==cf and method in POINT_METHODS and (m.get('point') or {}).get('countyFips')==cf
                if not declared and not point:continue
                evidence.append({'peerSourceKey':p['key'],'peerSource':p['source'],'peerSourceDate':p.get('sourceDate'),'peerFingerprint':fingerprint(p),'registryCountyAsReported':p.get('sourceCounty') or None,'mappedCountyAsReported':p.get('countyFips') or None,'method':method if point else None,'nativePointId':(m.get('point') or {}).get('objectId') if point else None,'basis':'official-address-point-and-registry-county' if point and declared else 'official-address-point' if point else 'registry-county-only'})
            if evidence:
                row['countyCandidate']=cf;row['evidence']=sorted(evidence,key=lambda x:x['peerSourceKey'])
                status='exact_address_point_research' if any(x['method'] for x in evidence) else 'exact_registry_address_research'
            else:status='no_independent_source_evidence'
        row['status']=status;output.append(row);stats[status]+=1;by_state[e['state']][status]+=1
    targets=collections.Counter((r['state'],r['countyCandidate']) for r in output if r['countyCandidate'])
    return {'schemaVersion':1,'publication':'review-only','counts':dict(stats),'totalUnknownCountyTargets':len(output),'countyResearchTargets':[{'state':s,'countyCandidate':c,'records':n} for (s,c),n in sorted(targets.items(),key=lambda x:(-x[1],x[0]))],'states':[{'state':s,'counts':dict(c)} for s,c in sorted(by_state.items())],'rows':output,'limitations':'Exact address corroboration only, not provider identity equivalence, independent county boundary verification, station evidence or registry assignment. No coordinate reuse. Source families are distinct but not necessarily independent in origin.'}
def main():
    p=argparse.ArgumentParser();p.add_argument('--output',type=pathlib.Path,required=True);a=p.parse_args()
    loc=PUBLIC/'locations';m,rows=read_registry();fl=json.loads((PUBLIC/'state-ems/FL.json').read_bytes());verify(loc,m,rows,fl)
    raw=(loc/'index.json').read_bytes();idx=json.loads(raw)
    entries=[e for c in idx['chunks'] for e in json.loads((loc/c['file']).read_bytes())]
    fips={c['GEOID']:c['USPS'] for c in json.loads((ROOT/'scripts/fixtures/census-2026-county-identities.json').read_bytes())['counties']}
    report=build_report(entries,fips);report.update(locationManifestSha256=sha(raw),snapshotGeneratedAt=idx['generatedAt'])
    a.output.mkdir(parents=True,exist_ok=True);(a.output/'county-recovery-research.json').write_text(json.dumps(report,indent=2)+'\n')
    print('County recovery research:',json.dumps({'totalUnknownCountyTargets':report['totalUnknownCountyTargets'],'counts':report['counts'],'topCountyTargets':report['countyResearchTargets'][:15]}))
if __name__=='__main__':main()
