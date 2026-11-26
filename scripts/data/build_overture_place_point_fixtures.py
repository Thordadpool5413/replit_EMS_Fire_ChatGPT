#!/usr/bin/env python3
"""Generate Places browser/API pins only from a fully replayed source release."""
import argparse
import json
import pathlib

from backfill_provider_locations import ROOT
from build_overture_point_fixtures import FIELDS
from retain_overture_primary_places import source_files,validate_files


def point_catalog(report,meta):
    row_counts={m['key']:m['rows'] for m in meta['files']}
    paths=sorted({r['match']['point']['sourceFile'] for r in report['candidates']})
    files=[];native={}
    for path in paths:
        points=[r['match']['point'] for r in report['candidates'] if r['match']['point']['sourceFile']==path]
        if len({(p['sourceFileSha256'],p['sourceEtag']) for p in points})!=1: raise ValueError('Conflicting full native file identity')
        point=points[0];files.append([path,point['sourceFileSha256'],point['sourceEtag'],row_counts[path]])
    for candidate in report['candidates']:
        point=candidate['match']['point']
        key=point['nativeId']+'@'+str(point['sourceAddressOrdinal'])
        pin=[paths.index(point['sourceFile']),point['sourceRowNumber'],point['sourceSha256'],*point['coordinatesAsReported'],
             point['countyFips'],point['coordinateReuseRows'],[[s[f] for f in FIELDS] for s in point['attribution']],
             point['placeName'],point['placeConfidence'],point['operatingStatus'],point['sourceAddressOrdinal']]
        if key in native and native[key]!=pin: raise ValueError('Conflicting native Places ID/address ordinal')
        native[key]=pin
    return files,native


def build(source):
    retained=source_files(source);report,_=validate_files(retained)
    files,native=point_catalog(report,json.loads(retained['metadata-inventory.json']))
    text="""/** Generated from complete-source, independently replayed native Places records. */
import type {OvertureFilePin} from './overturePrimaryPointPins';
export type OverturePlaceNativePin=readonly [file:number,row:number,sha256:string,latitude:number,longitude:number,county:string,reuseRows:number,attribution:ReadonlyArray<ReadonlyArray<unknown>>,name:string,confidence:number,status:'open',addressOrdinal:number];
export const OVERTURE_PLACE_SOURCE_INVENTORY="""+json.dumps(report['sourceInventorySha256'])+""";
export const OVERTURE_PLACE_FILES:ReadonlyArray<OvertureFilePin>="""+json.dumps(files,separators=(',',':'))+""";
export const OVERTURE_PLACE_NATIVE_POINTS:Readonly<Record<string,OverturePlaceNativePin>>={
"""+',\n'.join(json.dumps(k)+':'+json.dumps(v,separators=(',',':')) for k,v in sorted(native.items()))+'\n};\n'
    for path in ('artifacts/ems-territory-intelligence/src/services/overturePlacePrimaryPointPins.ts','artifacts/api-server/src/lib/overturePlacePrimaryPointPins.ts'):
        (ROOT/path).write_text(text)
    examples=[]
    for label,predicate in [
        ('exact-place-address',lambda row:row['match']['matchBasis']=='normalized-street-city-state-zip'),
        ('postal-locality',lambda row:row['match']['matchBasis']=='normalized-street-state-zip'),
        ('same-physical-address-reuse',lambda row:row['match']['point']['coordinateReuseRows']>1)]:
        row=next((r for r in report['candidates'] if predicate(r)),None)
        if row: examples.append({'label':label,'key':row['key'],'originalAddress':row['originalAddress'],**row['match']})
    (ROOT/'scripts/fixtures/overture-place-primary-point-examples.json').write_text(json.dumps(examples,indent=2)+'\n')
    print('Generated native Places pins',len(native),'source files',len(files))


if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--source',type=pathlib.Path,required=True)
    build(parser.parse_args().source)
