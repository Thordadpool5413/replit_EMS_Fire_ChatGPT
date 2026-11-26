#!/usr/bin/env python3
"""Generate separate browser/API pins from the frozen native-variant catalogs."""
import json
from backfill_provider_locations import ROOT
from build_overture_point_fixtures import FIELDS
from build_overture_place_point_fixtures import point_catalog
from retain_overture_primary_variants import _validated


def address_catalog(report,meta):
    row_counts={m['key']:m['rows'] for m in meta['files']}
    paths=sorted({r['match']['point']['sourceFile'] for r in report['candidates']});files=[];native={}
    for path in paths:
        points=[r['match']['point'] for r in report['candidates'] if r['match']['point']['sourceFile']==path]
        if len({(p['sourceFileSha256'],p['sourceEtag']) for p in points})!=1: raise ValueError('Conflicting variant source-file pins')
        point=points[0];files.append([path,point['sourceFileSha256'],point['sourceEtag'],row_counts[path]])
    for candidate in report['candidates']:
        point=candidate['match']['point']
        pin=[paths.index(point['sourceFile']),point['sourceRowNumber'],point['sourceSha256'],*point['coordinatesAsReported'],
             point['countyFips'],point['coordinateReuseRows'],[[s[f] for f in FIELDS] for s in point['attribution']]]
        if point['nativeId'] in native and native[point['nativeId']]!=pin: raise ValueError('Conflicting variant native Address identity')
        native[point['nativeId']]=pin
    return files,native


def object_text(value):
    return '{\n'+',\n'.join(json.dumps(k)+':'+json.dumps(v,separators=(',',':')) for k,v in sorted(value.items()))+'\n}'


def main():
    catalogs=_validated();address=catalogs['overture-address'];place=catalogs['overture-place-address']
    address_files,address_points=address_catalog(address['report'],json.loads(address['sourceFiles']['metadata-inventory.json']))
    place_files,place_points=point_catalog(place['report'],json.loads(place['sourceFiles']['metadata-inventory.json']))
    text="""/** Generated only from the separate replayed native-target source catalogs. */
import type {OvertureFilePin,OvertureAddressNativePin} from './overturePrimaryPointPins';
import type {OverturePlaceNativePin} from './overturePlacePrimaryPointPins';
export const OVERTURE_VARIANT_PLACE_SOURCE_INVENTORY="""+json.dumps(place['report']['sourceInventorySha256'])+""";
export const OVERTURE_VARIANT_ADDRESS_FILES:ReadonlyArray<OvertureFilePin>="""+json.dumps(address_files,separators=(',',':'))+""";
export const OVERTURE_VARIANT_ADDRESS_NATIVE_POINTS:Readonly<Record<string,OvertureAddressNativePin>>="""+object_text(address_points)+""";
export const OVERTURE_VARIANT_PLACE_FILES:ReadonlyArray<OvertureFilePin>="""+json.dumps(place_files,separators=(',',':'))+""";
export const OVERTURE_VARIANT_PLACE_NATIVE_POINTS:Readonly<Record<string,OverturePlaceNativePin>>="""+object_text(place_points)+';\n'
    for base in ('artifacts/ems-territory-intelligence/src/services/','artifacts/api-server/src/lib/'):
        (ROOT/base/'overturePrimaryVariantPointPins.ts').write_text(text)
    examples=[]
    for method,data in catalogs.items():
        for row in data['report']['candidates'][:2]:
            examples.append({'label':'separate-native-target-'+method,'key':row['key'],'originalAddress':row['originalAddress'],**row['match']})
    (ROOT/'scripts/fixtures/overture-primary-variant-point-examples.json').write_text(json.dumps(examples,indent=2)+'\n')
    print('Generated separate native variant point pins',len(address_points),'Addresses',len(place_points),'Places')


if __name__=='__main__': main()
