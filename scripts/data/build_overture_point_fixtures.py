#!/usr/bin/env python3
"""Generate compact browser/API source-row pins from the replayed release."""
import argparse
import json
import pathlib
from backfill_provider_locations import ROOT

FIELDS=('property','dataset','license','record_id','update_time','confidence','between','provider','resource','version')


def build(source):
    report=json.loads((source/'primary-address-candidates.json').read_bytes())
    meta=json.loads((source/'metadata-inventory.json').read_bytes())
    row_counts={m['key']:m['rows'] for m in meta['files']}
    paths=sorted({r['match']['point']['sourceFile'] for r in report['candidates']})
    files=[];native={}
    for path in paths:
        points=[r['match']['point'] for r in report['candidates'] if r['match']['point']['sourceFile']==path]
        if len({(p['sourceFileSha256'],p['sourceEtag']) for p in points})!=1: raise ValueError('Conflicting native file digests')
        p=points[0];files.append([path,p['sourceFileSha256'],p['sourceEtag'],row_counts[path]])
    for row in report['candidates']:
        p=row['match']['point']
        pin=[paths.index(p['sourceFile']),p['sourceRowNumber'],p['sourceSha256'],*p['coordinatesAsReported'],
             p['countyFips'],p['coordinateReuseRows'],[[s[f] for f in FIELDS] for s in p['attribution']]]
        if p['nativeId'] in native and native[p['nativeId']]!=pin: raise ValueError('Conflicting release-scoped native ID')
        native[p['nativeId']]=pin
    text='''/** Generated from retained, independently replayed Overture source records. */
export type OvertureFilePin=readonly [path:string,sha256:string,etag:string,rows:number];
export type OvertureAddressNativePin=readonly [file:number,row:number,sha256:string,latitude:number,longitude:number,county:string,reuseRows:number,attribution:ReadonlyArray<ReadonlyArray<unknown>>];
export const OVERTURE_ADDRESS_FILES:ReadonlyArray<OvertureFilePin>='''+json.dumps(files,separators=(',',':'))+''';
export const OVERTURE_ADDRESS_NATIVE_POINTS:Readonly<Record<string,OvertureAddressNativePin>>={
'''+',\n'.join(json.dumps(k)+':'+json.dumps(v,separators=(',',':')) for k,v in sorted(native.items()))+'\n};\n'
    paths_out=[ROOT/'artifacts/ems-territory-intelligence/src/services/overturePrimaryPointPins.ts',ROOT/'artifacts/api-server/src/lib/overturePrimaryPointPins.ts']
    for out in paths_out:out.write_text(text)
    examples=[]
    predicates=[('exact-address',lambda r:r['match']['matchBasis']=='normalized-street-city-state-zip'),
                ('postal-locality',lambda r:r['match']['matchBasis']=='normalized-street-state-zip'),
                ('same-physical-address-reuse',lambda r:r['match']['point']['coordinateReuseRows']>1)]
    for label,predicate in predicates:
        row=next(r for r in report['candidates'] if predicate(r))
        examples.append({'label':label,'key':row['key'],'originalAddress':row['originalAddress'],**row['match']})
    (ROOT/'scripts/fixtures/overture-primary-point-examples.json').write_text(json.dumps(examples,indent=2)+'\n')
    print('Overture native browser/API pins',len(native),'files',len(files),'bytes',len(text))


if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',type=pathlib.Path,required=True);build(p.parse_args().source)
