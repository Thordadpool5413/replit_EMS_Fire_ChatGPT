#!/usr/bin/env python3
"""Build a review-only facility identity and county conflict queue. No writes to the provider snapshot."""
import argparse, collections, json, pathlib, re
from urllib.parse import urlsplit
from backfill_provider_locations import ROOT, PUBLIC, read_registry, verify, physical, sha

RESEARCH=ROOT/'artifacts/ems-territory-intelligence/src/data/officialProviderAddressResearch.json'
CANDIDATES=ROOT/'scripts/data/facility_research_candidates.json'

def source_url(value):
    try:
        p=urlsplit(value)
        return p.scheme=='https' and bool(p.hostname) and not p.username and not p.password and p.port in (None,443)
    except (TypeError,ValueError):
        return False

def build_queue(entries,research,candidates):
    index={e['key']:e for e in entries}
    if len(index)!=len(entries):raise ValueError('Duplicate snapshot identity')
    evidence={}
    for group in ('accepted','unresolved'):
        for row in research[group]:
            key=row['key']
            if key in evidence:raise ValueError('Duplicate research identity')
            evidence[key]=(group,row)
    pending={}
    for row in candidates['records']:
        key=row['key']
        if key in pending or row['decision'] not in ('needs-review','conflict-withheld'):raise ValueError('Invalid or duplicate candidate decision')
        e=index.get(key)
        if not e or e['name']!=row['name'] or e['state']!=row['state'] or e['sourceCounty']!=row['countyFips']:raise ValueError('Candidate identity no longer matches registry: '+key)
        if not row.get('reason') or not row.get('sources') or any(not source_url(s.get('url')) or not s.get('authority') or not s.get('note') for s in row['sources']):raise ValueError('Candidate lacks source evidence: '+key)
        a=row.get('candidateAddress')
        if not a or a.get('state')!=e['state'] or not physical(a):raise ValueError('Invalid candidate street address: '+key)
        pending[key]=row
    queue=[]; stale=[]
    for e in entries:
        key=e['key']; status=e['status']; reason=None
        if status=='mapped' and e.get('sourceCounty') and e['sourceCounty']!=e['countyFips']:reason='county-conflict'
        elif status=='source-missing':reason='missing-source-address'
        elif status=='review':reason='source-review'
        elif status=='not-eligible':reason='nonstandard-or-mailing-address'
        elif status in ('no-match','unavailable','pending'):reason='coordinate-recovery'
        if reason is None:
            if key in pending or key in evidence:stale.append(key)
            continue
        # Routine geocoding gaps are handled by the nationwide recovery audit.
        if reason=='coordinate-recovery' and key not in pending and key not in evidence:continue
        item={'key':key,'name':e['name'],'state':e['state'],'source':e['source'],'sourceCounty':e.get('sourceCounty',''),'matchedCounty':e['countyFips'],'sourceStatus':status,'reason':reason,'sourceAddress':e['address'],'endUserValidationRequired':True}
        if reason=='county-conflict':
            item['withheldMatch']=e['match']
        if key in evidence:
            group,row=evidence[key]
            if row['name']==e['name'] and row['state']==e['state'] and row['countyFips']==e['sourceCounty']:
                item['existingResearchStatus']=group
                if group=='accepted' and reason=='missing-source-address' and e['address'] is None and physical(row.get('address')) and source_url(row.get('sourceUrl')):
                    item['nextAction']='coordinate-check-supplemental-address'
                    item['supplementalAddress']=row['address']
                    item['supplementalSource']=row['sourceUrl']
            else:stale.append(key)
        if key in pending:
            item['researchCandidate']=pending[key]
            item['nextAction']='resolve-source-conflict' if pending[key]['decision']=='conflict-withheld' else 'independent-facility-confirmation'
        if 'nextAction' not in item:
            item['nextAction']='compare-official-county-and-facility-evidence' if reason=='county-conflict' else 'research-official-facility-address'
        queue.append(item)
    rank={'county-conflict':0,'missing-source-address':1,'source-review':2,'nonstandard-or-mailing-address':3,'coordinate-recovery':4}
    queue.sort(key=lambda q:(rank[q['reason']],q['state'],q['key']))
    return {'counts':dict(collections.Counter(q['reason'] for q in queue)),
            'nextActions':dict(collections.Counter(q['nextAction'] for q in queue)),
            'stateCountyConflicts':dict(sorted(collections.Counter(q['state'] for q in queue if q['reason']=='county-conflict').items())),
            'staleResearchKeys':sorted(set(stale)|((set(evidence)|set(pending))-set(index))),
            'records':queue}

def main():
    p=argparse.ArgumentParser();p.add_argument('--output',type=pathlib.Path,required=True);args=p.parse_args()
    location=PUBLIC/'locations';manifest,rows=read_registry();fl=json.loads((PUBLIC/'state-ems/FL.json').read_bytes())
    verify(location,manifest,rows,fl)
    data=(location/'index.json').read_bytes();idx=json.loads(data)
    entries=[e for ch in idx['chunks'] for e in json.loads((location/ch['file']).read_bytes())]
    report={'schemaVersion':1,'snapshotSha256':sha(data),'sourceScope':idx['sourceScope'],**build_queue(entries,json.loads(RESEARCH.read_bytes()),json.loads(CANDIDATES.read_bytes()))}
    args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(report,indent=2)+'\n')
    print('Facility reconciliation queue:',json.dumps({k:v for k,v in report.items() if k!='records'},sort_keys=True),flush=True)
if __name__=='__main__':main()
