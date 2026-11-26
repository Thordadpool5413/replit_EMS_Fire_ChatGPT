#!/usr/bin/env python3
"""Build a separate, source-validated release with the fixed original denominator."""
import argparse,collections,copy,json,math,pathlib,zipfile
from backfill_provider_locations import ROOT,PUBLIC,STATES,sha,read_registry,native_key,publish,verify
from primary_mapping_contract import validate_primary_entry
from address_normalization import normalize_street,normalized_city,source_street_line

BASELINE_INDEX_SHA='e1f59b47e7d6931714b2defcfd02acefc4013d3dd793ed2081a27df6a3bd0a48'
BASELINE=ROOT/'scripts/data/evidence/primary-recovery-baseline/2026-11-26.zip'
REQUIRED=44452

def dump(x):return (json.dumps(x,sort_keys=True,ensure_ascii=True,separators=(',',':'),allow_nan=False)+'\n').encode()
def baseline():
    names={'index.json',*(s+'.json' for s in STATES)}
    if BASELINE.exists():
        with zipfile.ZipFile(BASELINE) as z:
            if len(z.namelist())!=len(names) or set(z.namelist())!=names:raise ValueError('Original baseline archive membership changed')
            files={name:z.read(name) for name in names}
    else:
        files={name:(PUBLIC/'locations'/name).read_bytes() for name in names}
    if sha(files['index.json'])!=BASELINE_INDEX_SHA:raise ValueError('Recovery must start from the fixed original primary snapshot')
    index=json.loads(files['index.json']);entries=[]
    for chunk in index['chunks']:
        if sha(files[chunk['file']])!=chunk['sha256']:raise ValueError('Original primary shard digest changed')
        entries.extend(json.loads(files[chunk['file']]))
    if len(entries)!=46791 or len({e['key'] for e in entries})!=46791:raise ValueError('Fixed primary denominator changed')
    if not BASELINE.exists():
        BASELINE.parent.mkdir(parents=True,exist_ok=True)
        with zipfile.ZipFile(BASELINE,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
            for name,raw in sorted(files.items()):
                info=zipfile.ZipInfo(name,date_time=(2026,11,26,0,0,0));info.compress_type=zipfile.ZIP_DEFLATED;z.writestr(info,raw)
    return index,entries

def usable(e):return e['status']=='mapped' and bool(e.get('match')) and (not e.get('sourceCounty') or e['sourceCounty']==e['countyFips'])
def metric(entries):
    count=sum(bool(usable(e)) for e in entries)
    return {'totalPrimarySourceRecords':len(entries),'rawMapped':sum(e['status']=='mapped' for e in entries),'usableMapped':count,'usableCoveragePct':round(100*count/46791,4),'targetPct':95,'requiredMapped':REQUIRED,'remainingToTarget':max(0,REQUIRED-count),'targetMet':count>=REQUIRED,
            'countyConflictsWithheld':sum(e['status']=='mapped' and bool(e.get('sourceCounty')) and e['sourceCounty']!=e['countyFips'] for e in entries),
            'bySource':{s:sum(bool(usable(e)) for e in entries if e['source']==s) for s in ('USFA','NPPES','State EMS')},
            'byMethod':dict(sorted(collections.Counter(e['match']['method'] for e in entries if usable(e)).items()))}

def apply_candidate(original,candidate):
    if candidate.get('key')!=original['key'] or candidate.get('originalAddress')!=original['address']:raise ValueError('Candidate changed the original native identity/address binding')
    for key in ('name','source','state','sourceDate','sourceCounty'):
        if key in candidate and candidate[key]!=original[key]:raise ValueError('Candidate changes immutable source metadata: '+key)
    result=copy.deepcopy(original)
    result.update(status='mapped',address=copy.deepcopy(candidate['address']),match=copy.deepcopy(candidate['match']),countyFips=candidate['countyFips'])
    if candidate.get('primaryAddressEvidence'):result['primaryAddressEvidence']=copy.deepcopy(candidate['primaryAddressEvidence'])
    elif result['address']!=original['address']:raise ValueError('Changed primary address lacks an explicit source association')
    return result

def distance(a,b):
    y1,x1=map(math.radians,(a['latitude'],a['longitude']));y2,x2=map(math.radians,(b['latitude'],b['longitude']))
    h=math.sin((y2-y1)/2)**2+math.cos(y1)*math.cos(y2)*math.sin((x2-x1)/2)**2
    return 12742000*math.asin(min(1,math.sqrt(h)))
def rank(e):
    m=e['match'];p=m['point'];base={'nad-address-point':0,'usgs-structure-address':1,'overture-address':2,'neris-reported-address':3,'hifld-ems-address':4,'hifld-fire-address':5}
    return (base[m['method']],p.get('placement') in ('Unknown','Other'),p.get('precision')=='blockface',str(p.get('objectId',p.get('nativeId',''))))

def combine(originals,neris,source_reports,national):
    original={e['key']:e for e in originals};result=copy.deepcopy(original);candidates=collections.defaultdict(list);audit=[];withheld_legacy=set()
    if not neris and any((e.get('match') or {}).get('method')=='neris-reported-address' for e in originals):raise ValueError('Complete legacy NERIS audit is required for this release')
    if neris:
        from recover_neris_primary import validate_candidate
        expected={e['key'] for e in originals if (e.get('match') or {}).get('method')=='neris-reported-address'}
        if {r['key'] for r in neris['legacyAudit']}!=expected or len(neris['legacyAudit'])!=len(expected):raise ValueError('Legacy NERIS audit is incomplete')
        for row in neris['legacyAudit']:
            key=row['key'];old=original[key]
            if row['accepted']:
                candidate=row['candidate']
                if not validate_candidate(candidate,old,national.get(key)):raise ValueError('Legacy NERIS proof did not replay')
                changed=apply_candidate(old,candidate)
                if (changed['match']['latitude'],changed['match']['longitude'])!=(old['match']['latitude'],old['match']['longitude']):raise ValueError('Legacy audit moved a previously supported coordinate')
                result[key]=changed
            else:
                withheld_legacy.add(key);result[key].update(status='review',match=None,countyFips='')
            audit.append({'key':key,'accepted':row['accepted'],'reason':row['reason']})
        source_reports=[neris,*source_reports]
    for report in source_reports:
        for candidate in report['candidates']:
            key=candidate['key']
            if key not in original:raise ValueError('New or synthetic identities cannot enter the primary release')
            old=original[key]
            if old['status']=='mapped' and key not in withheld_legacy:continue
            if old['status'] in ('historical','review'):raise ValueError('Inactive or conflicted identity cannot be promoted')
            proposed=apply_candidate(old,candidate)
            if not validate_primary_entry(proposed,national.get(key)):raise ValueError('Candidate failed native source replay: '+key+' '+proposed['match']['method'])
            candidates[key].append(proposed)
    conflicts=[];selected=[]
    for key,options in sorted(candidates.items()):
        # Prefer the original recorded physical address when it has supported
        # evidence. A changed inferred site remains an explicit fallback.
        direct=[e for e in options if e.get('primaryAddressEvidence',{}).get('association')!='inferred']
        options=direct or options
        options.sort(key=rank);first=options[0]
        def site_key(e):
            p=e.get('primaryAddressEvidence',{});a=e['address']
            return (a['state'],a['zip'],normalize_street(source_street_line(a['street'])),normalized_city(a['city']),p.get('department',{}).get('id'),p.get('site',{}).get('id'),p.get('siteRole'))
        if not direct and len({site_key(e) for e in options})!=1:
            conflicts.append({'key':key,'reason':'inferred-site-identity-or-address-disagreement','methods':sorted({e['match']['method'] for e in options})})
            continue
        if len({e['countyFips'] for e in options})!=1 or any(distance(a['match'],b['match'])>75 for i,a in enumerate(options) for b in options[i+1:]):
            conflicts.append({'key':key,'reason':'qualified-source-coordinate-disagreement','methods':sorted({e['match']['method'] for e in options}),'points':[{'method':e['match']['method'],'latitude':e['match']['latitude'],'longitude':e['match']['longitude'],'countyFips':e['countyFips']} for e in options]})
            continue
        result[key]=first;selected.append({'key':key,'method':first['match']['method'],'association':first.get('primaryAddressEvidence',{}).get('method'),'corroboratingSourceMethods':sorted({e['match']['method'] for e in options})})
    rows=[result[e['key']] for e in originals]
    if {e['key'] for e in rows}!=set(original):raise ValueError('Primary identity membership changed')
    for e in rows:
        old=original[e['key']]
        if any(e[k]!=old[k] for k in ('key','name','state','source','sourceDate','sourceCounty')):raise ValueError('Immutable primary metadata changed')
        if old['status']=='mapped' and e['key'] not in withheld_legacy and (old.get('match') or {}).get('method')!='neris-reported-address' and e!=old:raise ValueError('Existing mapped primary record changed')
    return rows,{'selected':selected,'qualifiedSourceConflicts':conflicts,'legacyNerisAudit':audit}

def main():
    p=argparse.ArgumentParser();p.add_argument('--output',type=pathlib.Path,required=True);p.add_argument('--report',type=pathlib.Path,required=True);p.add_argument('--neris-report',type=pathlib.Path);p.add_argument('--source-report',action='append',type=pathlib.Path,default=[]);p.add_argument('--require-target',action='store_true');a=p.parse_args()
    output=a.output.resolve()
    if output== (PUBLIC/'locations').resolve() or output.exists() and any(output.iterdir()):raise ValueError('Build into a new separate candidate directory')
    index,entries=baseline();manifest,rows=read_registry();national={native_key(r):r for r in rows if native_key(r)}
    neris=json.loads(a.neris_report.read_bytes()) if a.neris_report else None
    reports=[json.loads(path.read_bytes()) for path in a.source_report]
    updated,details=combine(entries,neris,reports,national)
    before,after=metric(entries),metric(updated)
    sources=[{'file':path.name,'sha256':sha(path.read_bytes())} for path in ([a.neris_report] if a.neris_report else [])+a.source_report]
    report={'schemaVersion':1,'baselineIndexSha256':BASELINE_INDEX_SHA,'before':before,'after':after,'sourceReports':sources,**details}
    metadata={k:v for k,v in index.items() if k not in ('schemaVersion','generatedAt','benchmark','vintage','sourceScope','chunks','coverage','primaryCoverageTarget','primaryMappingRecovery')}
    metadata.update(primaryCoverageTarget=after,primaryMappingRecovery={'baselineIndexSha256':BASELINE_INDEX_SHA,'sourceReports':sources,'newSourceMappings':len(details['selected']),'qualifiedSourceConflictsWithheld':len(details['qualifiedSourceConflicts']),'legacyNerisWithheld':sum(not r['accepted'] for r in details['legacyNerisAudit'])})
    publish(output,manifest,updated,metadata)
    verify(output,manifest,rows,json.loads((PUBLIC/'state-ems/FL.json').read_bytes()))
    a.report.parent.mkdir(parents=True,exist_ok=True);a.report.write_bytes(dump(report))
    print('Primary release coverage:',json.dumps(after),flush=True)
    if a.require_target and not after['targetMet']:raise SystemExit(2)

if __name__=='__main__':main()
