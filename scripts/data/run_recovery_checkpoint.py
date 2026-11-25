#!/usr/bin/env python3
"""Bounded live recovery research. Output only an artifact, never edit registry."""
import argparse,datetime,json,pathlib
from backfill_provider_locations import PUBLIC,ROOT,read_registry,verify,sha
from recover_regional_locations import recover,SOURCES,SourceUnavailable
from recover_nad_locations import county_index
from recovery_checkpoint import RecoveryCheckpoint
def blocked_report(source,manifest_hash,checked,exc):
    return {'schemaVersion':1,'source':source,'locationManifestSha256':manifest_hash,'checkedAt':checked,'publication':'review-only','acquisitionStatus':'source-blocked','completeMetadataCheck':False,'sourceUnavailable':True,'errorType':type(exc).__name__,'rows':{},'candidates':[],'candidateKeys':[],'reviewKeys':[]}
def main():
    p=argparse.ArgumentParser();p.add_argument('--source',choices=sorted(SOURCES),required=True);p.add_argument('--output',type=pathlib.Path,required=True);p.add_argument('--prior',type=pathlib.Path);p.add_argument('--max-requests',type=int,default=120);a=p.parse_args()
    if not 1<=a.max_requests<=120:raise ValueError('Request limit')
    loc=PUBLIC/'locations';manifest,rows=read_registry();fl=json.loads((PUBLIC/'state-ems/FL.json').read_bytes());verify(loc,manifest,rows,fl)
    raw=(loc/'index.json').read_bytes();idx=json.loads(raw)
    entries=[e for c in idx['chunks'] if c['state']==SOURCES[a.source]['state'] for e in json.loads((loc/c['file']).read_bytes())]
    counties=county_index(json.loads((ROOT/'scripts/fixtures/census-2026-county-identities.json').read_text())['counties'])
    prior=json.loads(a.prior.read_bytes()) if a.prior else None
    if prior and prior.get('locationManifestSha256')!=sha(raw):raise ValueError('Prior checkpoint does not match current snapshot')
    cp=RecoveryCheckpoint(prior)
    checked=datetime.datetime.now(datetime.timezone.utc).date().isoformat()
    a.output.mkdir(parents=True,exist_ok=True)
    try:
        found,review,stats=recover(a.source,entries,counties,checked,a.max_requests,checkpoint=cp)
    except (SourceUnavailable,OSError,TimeoutError) as exc:
        report=blocked_report(a.source,sha(raw),checked,exc)
        (a.output/'recovery-checkpoint.json').write_text(json.dumps(report,indent=2)+'\n')
        print('::warning::External GIS source blocked acquisition; no reusable checkpoint or coordinates produced.')
        print('Checkpoint acquisition status:',json.dumps({'source':a.source,'status':'source-blocked','candidateCount':0}))
        return
    report={**cp.report(),'locationManifestSha256':sha(raw),'publication':'review-only','acquisitionStatus':'partial' if stats.get('unavailable') or stats.get('not_attempted') else 'completed','counts':stats,'candidateKeys':sorted(found),'reviewKeys':sorted(review),'candidates':[{'sourceKey':k,'countyFips':v[0],'match':v[1],'endUserValidationRequired':True} for k,v in sorted(found.items())]}
    (a.output/'recovery-checkpoint.json').write_text(json.dumps(report,indent=2)+'\n')
    print('Checkpoint acquisition:',json.dumps({'source':a.source,'counts':{k:v for k,v in stats.items() if k!='metadata'},'candidateCount':len(found),'reviewCount':len(review),'checkpointRows':len(report['rows'])}))
if __name__=='__main__':main()
