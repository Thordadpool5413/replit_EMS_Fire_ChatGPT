#!/usr/bin/env python3
"""Recheck nine pinned Bucks County whitespace-only exceptions without changing source records."""
import argparse,collections,datetime,json,pathlib,time
from backfill_provider_locations import PUBLIC,read_registry,verify,base_street,sha
from compile_review_coordinates import read_archive
from stage_wisconsin_addresses import request
import stage_pennsylvania_bucks_addresses as bucks
from investigate_address_exceptions import SOURCES
ARTIFACT=15067801334
CHECKSUM='ab07f8d0937dbcc527cc840ec8b8a1b4f97c76c39ec6981c730559cea6ed5a52'
FIELDS=SOURCES['PA'][-1]
def reconsider(e,target,rows,checked):
    oid=target['originalObjectId']
    original,diagnostic=bucks.review(e,rows,checked)
    if original is not None or diagnostic['status']!='review' or diagnostic['reasons']!=['subaddress_or_exception'] or diagnostic['exactObjectIds']!=[oid]:
        return None,'changed_requires_reacquisition'
    if base_street(e['address']['street'])!=e['address']['street'].strip():
        return None,'registry_subaddress'
    exact=[f for f in rows if f['attributes']['OBJECTID']==oid]
    if len(exact)!=1:return None,'changed_requires_reacquisition'
    f=exact[0];v=f['attributes']
    # Source-specific observed literal single space only, not arbitrary stripping.
    if any(v[k]!=' ' for k in FIELDS):return None,'changed_exception_values'
    normalized={**f,'attributes':{**v,**{k:None for k in FIELDS}}}
    hit,d=bucks.review(e,[normalized],checked)
    if hit is None:return None,'other_'+d['status']+':'+','.join(d['reasons'])
    hit.update(originalArtifactId=ARTIFACT,originalArtifactSha256=CHECKSUM,sourceFieldsAsReported={k:v[k] for k in FIELDS},interpretation='single-space placeholders evaluated as absent for review only',endUserValidationRequired=True,publicationEligible=False)
    return hit,'candidate'
def acquire(report,entries,checked,fetch=request,delay=1):
    if report.get('state')!='PA' or report.get('publication')!='review-only' or report.get('sourceUrl')!=bucks.LAYER or report.get('publicationEligible')!=0 or report.get('counts')!={'withheld_exact_address':9}:raise ValueError('Unexpected investigation report')
    targets=report['rows'];keys={t['sourceKey'] for t in targets};objects={t['originalObjectId'] for t in targets}
    if len(targets)!=9 or len(keys)!=9 or len(objects)!=9:raise ValueError('Unexpected target identity')
    for t in targets:
        if t['status']!='withheld_exact_address' or t['reason']!='subaddress_or_exception' or t['registrySubaddressPresent'] is not False or t['sharedObjectAcrossTargetRecords'] is not False or t['publicationEligible'] is not False or t['fieldsAsReported']!={k:{'kind':'whitespace','value':' '} for k in FIELDS}:raise ValueError('Unexpected exception evidence')
    version=bucks.metadata(fetch)
    if version!=report['sourceMetadata']:raise ValueError('Historical source changed')
    by_key={e['key']:e for e in entries}
    if len(by_key)!=len(entries):raise ValueError('Duplicate registry identity')
    result=[];candidates=[]
    for target in sorted(targets,key=lambda t:t['sourceKey']):
        e=by_key.get(target['sourceKey'])
        if not e or e['state']!='PA' or e['sourceCounty']!='42017' or e['status'] not in ('no-match','unavailable') or e['match'] is not None or not bucks.number(e['address']):raise ValueError('Registry identity changed')
        rows=bucks.features(fetch(bucks.LAYER+'/query',bucks.query([e['address']])))
        hit,status=reconsider(e,target,rows,checked)
        result.append({'sourceKey':e['key'],'objectId':target['originalObjectId'],'status':status})
        if hit:candidates.append(hit)
        time.sleep(delay)
    if bucks.metadata(fetch)!=version:raise ValueError('Source changed during acquisition')
    return {'schemaVersion':1,'publication':'review-only','sourceUrl':bucks.LAYER,'checkedAt':checked,'sourceMetadata':version,'originalArtifactId':ARTIFACT,'originalArtifactSha256':CHECKSUM,'counts':dict(collections.Counter(r['status'] for r in result)),'diagnostics':result,'candidates':candidates,'publicationEligible':0}
def main():
    p=argparse.ArgumentParser();p.add_argument('--archive',type=pathlib.Path,required=True);p.add_argument('--output',type=pathlib.Path,required=True);a=p.parse_args()
    loc=PUBLIC/'locations';m,rows=read_registry();fl=json.loads((PUBLIC/'state-ems/FL.json').read_bytes());verify(loc,m,rows,fl)
    raw=(loc/'index.json').read_bytes();idx=json.loads(raw);report=read_archive(a.archive,CHECKSUM,'address-exception-investigation.json')
    if report['locationManifestSha256']!=sha(raw):raise ValueError('Snapshot changed')
    entries=[e for c in idx['chunks'] if c['state']=='PA' for e in json.loads((loc/c['file']).read_bytes())]
    result=acquire(report,entries,datetime.datetime.now(datetime.timezone.utc).date().isoformat());result['locationManifestSha256']=sha(raw)
    a.output.mkdir(parents=True,exist_ok=True);(a.output/'bucks-whitespace-review.json').write_text(json.dumps(result,indent=2)+'\n')
    print('Bucks whitespace recovery:',json.dumps({'counts':result['counts'],'candidates':len(result['candidates']),'publicationEligible':0}))
if __name__=='__main__':main()
