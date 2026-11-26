#!/usr/bin/env python3
"""Recover primary source-address coordinates from retained federal NERIS and exact existing address evidence.
No identity reassignment, new station counts, address replacement or state license lookup.
"""
import argparse,collections,copy,json,math,pathlib,zipfile
from backfill_provider_locations import ROOT,PUBLIC,STATES,read_registry,verify,publish,sha,address,physical,normal_street,base_street,match_address
from build_neris_station_map import BOUNDARY,geometry_index,county_for
from check_additive_location_release import compare
from historical_primary_snapshot import BASELINE,freeze
LOC=PUBLIC/'locations'
NERIS=PUBLIC/'neris-stations'
TARGET=95
DATE='2026-11-26'
SOURCE_HASH='1ec2a427cbc5ea1949ff731527de3c701ed9592bc4fa83fe796a54defa18880b'
def addr_key(a):
    return (a['state'],a['zip'],normal_street(a['city']),normal_street(base_street(a['street']))) if physical(a) else None
def source_address(parts):
    line1,line2,city,state,postal=parts
    return address(', '.join(x for x in (line1,line2) if x),city,state,postal)
def usable(e):
    return e['status']=='mapped' and bool(e.get('match')) and (not e.get('sourceCounty') or e['sourceCounty']==e['countyFips'])
def metric(rows):
    total=len(rows);mapped=sum(map(usable,rows));required=(total*TARGET+99)//100
    return {'totalPrimarySourceRecords':total,'rawMapped':sum(e['status']=='mapped' for e in rows),'usableMapped':mapped,'usableCoveragePct':round(100*mapped/total,4) if total else 0,'targetPct':TARGET,'requiredMapped':required,'remainingToTarget':max(0,required-mapped),'targetMet':mapped>=required,'grain':'existing primary source identities; excludes conflicting county pins, secondary addresses and station rows'}
def valid_point(p):
    return isinstance(p,list) and len(p)==2 and all(type(x) in (int,float) and math.isfinite(x) for x in p) and abs(p[0])<=90 and abs(p[1])<=180 and any(p)
def source_candidates():
    raw=(NERIS/'index.json').read_bytes();idx=json.loads(raw)
    if idx['sourceSha256']!=SOURCE_HASH or idx['summary']['eligibleDepartments']!=30672 or idx['summary']['eligibleStations']!=65970 or idx['retrievedAt'][:10]!=DATE:raise ValueError('Unexpected federal NERIS edition')
    identities={c['GEOID']:c['USPS'] for c in json.loads((ROOT/'scripts/fixtures/census-2026-county-identities.json').read_bytes())['counties'] if c['USPS'] in STATES}
    polys=geometry_index(json.loads(BOUNDARY.read_bytes()),identities)
    refs=[];ids=set();counts=collections.Counter();coordinates=collections.defaultdict(set)
    def add(s,kind,parent):
        native=s['id'];key=(kind,native)
        if key in ids:raise ValueError('Duplicate NERIS source object')
        ids.add(key);counts[kind]+=1
        a=source_address(s['address']);p=s['coordinates'];k=addr_key(a)
        if k and valid_point(p):
            coordinates[tuple(p)].add(k)
            refs.append((s,kind,parent,a,p,k))
    for c in idx['chunks']:
        data=(NERIS/c['file']).read_bytes()
        if sha(data)!=c['sha256']:raise ValueError('NERIS shard changed')
        ds=json.loads(data)
        if len(ds)!=c['departmentCount'] or sum(len(d['stations']) for d in ds)!=c['stationCount']:raise ValueError('NERIS shard count changed')
        for d in ds:
            add(d,'department',d['id'])
            for s in d['stations']:
                if s['parentId']!=d['id']:raise ValueError('NERIS native parent changed')
                add(s,'station',d['id'])
    if counts!=collections.Counter(department=30672,station=65970):raise ValueError('Incomplete NERIS source')
    index=collections.defaultdict(list);stats=collections.Counter()
    for s,kind,parent,a,p,k in refs:
        if len(coordinates[tuple(p)])!=1:
            stats['coordinateSharedAcrossDistinctAddresses']+=1;continue
        county,basis=county_for(p,polys[a['state']])
        if not county:
            stats['countyNotResolved']+=1;continue
        # Only base address matching. Source coordinates are not independently
        # certified address points and must remain labeled accordingly.
        matched=base_street(a['street'])+', '+a['city']+', '+a['state']+', '+a['zip']
        if not match_address(a,matched):
            stats['unsupportedStreetText']+=1;continue
        m={'latitude':p[0],'longitude':p[1],'matchedAddress':matched,'method':'neris-reported-address','point':{'objectId':s['oid'],'nativeId':s['id'],'parentId':parent,'sourceKind':kind,'sourceDate':DATE,'sourceSha256':SOURCE_HASH,'countyFips':county}}
        index[k].append((m,county))
        stats['eligibleSourceRows']+=1
    return index,dict(stats),sha(raw)
def distance(a,b):
    y1,x1=map(math.radians,(a['latitude'],a['longitude']));y2,x2=map(math.radians,(b['latitude'],b['longitude']))
    h=math.sin((y2-y1)/2)**2+math.cos(y1)*math.cos(y2)*math.sin((x2-x1)/2)**2
    return 12742000*math.asin(min(1,math.sqrt(h)))
def recover(entries,federal):
    existing=collections.defaultdict(list)
    for e in entries:
        k=addr_key(e['address'])
        if k and usable(e):existing[k].append((e['match'],e['countyFips'],e['key']))
    stats=collections.Counter();evidence=[]
    for e in entries:
        if e['status'] not in ('no-match','unavailable','pending'):continue
        k=addr_key(e['address'])
        if not k:continue
        donors=existing.get(k,[]);fed=federal.get(k,[])
        candidates=[(m,c,'existing:'+key) for m,c,key in donors]+[(m,c,'NERIS:'+m['point']['sourceKind']+':'+m['point']['nativeId']) for m,c in fed]
        candidates=[v for v in candidates if match_address(e['address'],v[0]['matchedAddress'])]
        if not candidates:
            stats['noEvidence']+=1;continue
        if len({v[1] for v in candidates})!=1 or e.get('sourceCounty') and candidates[0][1]!=e['sourceCounty']:
            stats['countyDisagreement']+=1;continue
        # Never average points or accept disagreeing coordinates. A 75-metre
        # tolerance allows nearby rooftop/entrance/street-range observations.
        # Prefer an existing source geocode, then a native NERIS headquarters.
        candidates.sort(key=lambda v:(v[0]['method']=='neris-reported-address',v[0]['method']=='census-address-range',v[0].get('point',{}).get('sourceKind')=='station',v[2]))
        chosen,county,ref=candidates[0]
        if any(distance(chosen,v[0])>75 for v in candidates):
            stats['coordinateDisagreement']+=1;continue
        e.update(status='mapped',match=copy.deepcopy(chosen),countyFips=county)
        stats['newMapped']+=1;stats['NERIS' if ref.startswith('NERIS:') else 'existingExactAddress']+=1
        evidence.append({'key':e['key'],'source':e['source'],'state':e['state'],'address':e['address'],'match':e['match'],'countyFips':county,'selectedEvidence':ref,'corroboratingRecordCount':len(candidates)})
    return dict(stats),evidence
def main():
    p=argparse.ArgumentParser();p.add_argument('--output',type=pathlib.Path,default=LOC);p.add_argument('--report',type=pathlib.Path,required=True);p.add_argument('--require-target',action='store_true');a=p.parse_args()
    manifest,national=read_registry();fl=json.loads((PUBLIC/'state-ems/FL.json').read_bytes())
    verify(a.output,manifest,national,fl);raw=(a.output/'index.json').read_bytes();idx=json.loads(raw)
    entries=[e for c in idx['chunks'] for e in json.loads((a.output/c['file']).read_bytes())]
    before=copy.deepcopy(entries);baseline=metric(before);federal,source_stats,neris_sha=source_candidates()
    stats,evidence=recover(entries,federal)
    changes=compare(before,entries);after=metric(entries)
    if changes['newMapped']!=stats.get('newMapped',0) or after['usableMapped']-baseline['usableMapped']!=changes['newMapped']:raise ValueError('Coverage or additive changes differ')
    report={'schemaVersion':1,'baselineSha256':sha(raw),'nerisIndexSha256':neris_sha,'sourceStats':source_stats,'outcomes':stats,'changes':changes,'before':baseline,'after':after,'evidence':evidence}
    a.report.parent.mkdir(parents=True,exist_ok=True);a.report.write_text(json.dumps(report,indent=2)+'\n')
    print('Primary 95 recovery:',json.dumps({k:report[k] for k in ('sourceStats','outcomes','changes','before','after')}),flush=True)
    if changes['newMapped']:
        if a.output==LOC:freeze(a.output)
        meta={k:v for k,v in idx.items() if k not in ('schemaVersion','generatedAt','benchmark','vintage','sourceScope','chunks','coverage','primaryFederalRecovery','primaryCoverageTarget')}
        meta.update(primaryFederalRecovery={'baselineSha256':sha(raw),'nerisIndexSha256':neris_sha,'sourceSha256':SOURCE_HASH,'sourceDate':DATE,'results':stats,'newMapped':changes['newMapped']},primaryCoverageTarget=after)
        publish(a.output,manifest,entries,meta);verify(a.output,manifest,national,fl)
    if a.require_target and not after['targetMet']:raise SystemExit(2)
if __name__=='__main__':main()
