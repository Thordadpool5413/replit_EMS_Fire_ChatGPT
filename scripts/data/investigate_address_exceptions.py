#!/usr/bin/env python3
"""Investigate previously withheld exact address objects; never promote coordinates."""
import argparse,collections,datetime,json,pathlib,re,time
from backfill_provider_locations import PUBLIC,read_registry,verify,base_street,sha
from compile_review_coordinates import read_archive
from stage_wisconsin_addresses import request
import stage_pennsylvania_bucks_addresses as bucks
import stage_california_la_addresses as la
import stage_illinois_cook_addresses as cook
SOURCES={
 'IL':(cook,15065944682,'5be0bfdd6bb7f05fb2525a2b967afbe6bae641465bf184f14fd4ec148c9d0f35','illinois-cook-address-review.json',8,'subaddress_or_exception',cook.SUB),
 'PA':(bucks,15067681034,'de88ea9ad4d7155ce749386f89c2504203a97926c717ca9f5baf77b2613ec7bb','pennsylvania-bucks-address-review.json',9,'subaddress_or_exception',('AddNum_Pre','AddNum_Suf','Building','Floor','Unit','Room','Seat','Addtl_Loc','Mile_Post','gc_excepti')),
 'CA':(la,15067002763,'6ad38f7ff8f2c9f4faaeb68be7a9761c71a0f2709c4afce414a935aed5806146','california-la-address-review.json',6,'subaddress_or_complex_number',('NumPrefix','NumberSuffix','NumSuffix','BldgID','BldgType','BldgName','FlrType','FlrName','UnitType','UnitName')),
}
def observation(value):
    if value is None:return {'kind':'null'}
    if not isinstance(value,str) or len(value)>254 or re.search(r'[\x00-\x1f\x7f]',value):raise ValueError('Unexpected exception field representation')
    return {'kind':'empty' if value=='' else 'whitespace' if not value.strip() else 'reported','value':value}
def investigate(state,report,entries,checked,fetch=request,delay=1):
    mod,artifact,checksum,member,count,reason,fields=SOURCES[state]
    if report.get('publication')!='review-only' or report.get('sourceUrl')!=mod.LAYER or report.get('candidates')!=[]:raise ValueError('Unexpected original acquisition')
    targets=[d for d in report['diagnostics'] if d['status']=='review']
    if len(targets)!=count or len({d['sourceKey'] for d in targets})!=count or any(d['reasons']!=[reason] or len(d['exactObjectIds'])!=1 or type(d['exactObjectIds'][0]) is not int for d in targets):raise ValueError('Original review scope changed')
    by_key={e['key']:e for e in entries}
    if len(by_key)!=len(entries):raise ValueError('Duplicate registry identity')
    version=mod.metadata(fetch)
    if version!=report['sourceMetadata']:raise ValueError('Source metadata changed since original review')
    result=[];cache={}
    for target in sorted(targets,key=lambda t:t['sourceKey']):
        key=target['sourceKey'];oid=target['exactObjectIds'][0];e=by_key.get(key)
        if not e or e['state']!=state or e['status'] not in ('no-match','unavailable') or e['match'] is not None or not mod.number(e['address']):raise ValueError('Registry target changed: '+key)
        if state=='IL' and e.get('sourceCounty')!='17031' or state=='PA' and e.get('sourceCounty')!='42017' or state=='CA' and e.get('sourceCounty') not in ('06037','',None):raise ValueError('Registry county scope changed')
        params=mod.query([e['address']]);cache_key=json.dumps(params,sort_keys=True)
        if cache_key not in cache:
            cache[cache_key]=mod.features(fetch(mod.LAYER+'/query',params));time.sleep(delay)
        rows=cache[cache_key];hit,decision=mod.review(e,rows,checked)
        if decision.get('exactObjectIds')!=[oid] or decision['status']!='review' or decision['reasons']!=[reason] or hit is not None:
            result.append({'sourceKey':key,'originalObjectId':oid,'status':'changed_requires_reacquisition','currentStatus':decision['status'],'currentReasons':decision['reasons'],'publicationEligible':False});continue
        matches=[f for f in rows if f['attributes']['OBJECTID']==oid]
        if len(matches)!=1:raise ValueError('Exact object unavailable')
        v=matches[0]['attributes'];observations={k:observation(v[k]) for k in fields}
        registry_unit=base_street(e['address']['street'])!=e['address']['street'].strip()
        if not registry_unit and not any(o['kind']!='null' and o['kind']!='empty' for o in observations.values()):raise ValueError('Original exception no longer explained')
        result.append({'sourceKey':key,'originalObjectId':oid,'status':'withheld_exact_address','registrySubaddressPresent':registry_unit,'fieldsAsReported':observations,'reason':reason,'publicationEligible':False,'endUserValidationRequired':True})
    if mod.metadata(fetch)!=version:raise ValueError('Source metadata changed during investigation')
    shared=collections.Counter(x['originalObjectId'] for x in result)
    for x in result:x['sharedObjectAcrossTargetRecords']=shared[x['originalObjectId']]>1
    return {'schemaVersion':1,'state':state,'sourceUrl':mod.LAYER,'sourceMetadata':version,'originalArtifactId':artifact,'originalArtifactSha256':checksum,'checkedAt':checked,'publication':'review-only','counts':dict(collections.Counter(x['status'] for x in result)),'requests':len(cache),'rows':result,'publicationEligible':0}
def main():
    p=argparse.ArgumentParser();p.add_argument('--state',choices=sorted(SOURCES),required=True);p.add_argument('--archive',type=pathlib.Path,required=True);p.add_argument('--output',type=pathlib.Path,required=True);a=p.parse_args()
    mod,_,checksum,member,*_=SOURCES[a.state]
    loc=PUBLIC/'locations';m,rows=read_registry();fl=json.loads((PUBLIC/'state-ems/FL.json').read_bytes());verify(loc,m,rows,fl)
    raw=(loc/'index.json').read_bytes();idx=json.loads(raw);report=read_archive(a.archive,checksum,member)
    if report.get('locationManifestSha256')!=sha(raw):raise ValueError('Acquisition snapshot mismatch')
    entries=[e for c in idx['chunks'] if c['state']==a.state for e in json.loads((loc/c['file']).read_bytes())]
    result=investigate(a.state,report,entries,datetime.datetime.now(datetime.timezone.utc).date().isoformat());result['locationManifestSha256']=sha(raw)
    a.output.mkdir(parents=True,exist_ok=True);(a.output/'address-exception-investigation.json').write_text(json.dumps(result,indent=2)+'\n')
    print('Address exception investigation:',json.dumps({'state':a.state,'counts':result['counts'],'requests':result['requests'],'fieldValues':dict(collections.Counter(k+':'+str(v.get('value',v['kind'])) for row in result['rows'] for k,v in row.get('fieldsAsReported',{}).items() if v['kind'] not in ('null','empty'))),'publicationEligible':0}))
if __name__=='__main__':main()
