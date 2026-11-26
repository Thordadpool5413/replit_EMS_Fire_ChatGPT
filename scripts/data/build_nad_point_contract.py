#!/usr/bin/env python3
"""Generate the union of runtime bindings from complete retained NAD profiles."""
import argparse
import json
import pathlib
import zipfile
from stage_nad_primary import EVIDENCE, ROOT, verify, sha, dump, native_point, native_street

EXTENDED = ROOT/'scripts/data/evidence/primary-nad-extended/2026-11-26'


def native_pins(evidence):
    verify(evidence)
    with zipfile.ZipFile(evidence/'original.zip') as archive:
        report = json.loads(archive.read('report.json'))
        rows = json.loads(archive.read('native-matches.json'))
    native = {int(row['native']['OID_']): row for row in rows}
    points = {}
    for candidate in report['candidates']+report['diagnosticCandidates']:
        point = candidate['match']['point']
        record = native[point['objectId']]
        value = record['native']
        latitude, longitude = native_point(value)
        if point['nativeRecordSha256'] != sha(dump(value)) or point['sourceRowNumber'] != record['sourceRowNumber']:
            raise ValueError('NAD runtime binding differs from retained native row')
        pin = [record['sourceRowNumber'], point['nativeRecordSha256'], latitude, longitude,
               point['authority'], value['Placement'], point['countyFips'], value['County'],
               value['Lifecycle'], native_street(value), value['State'],
               candidate['match']['sourceAddress']['zip'], value['Post_City'].strip(),
               value['Inc_Muni'].strip()]
        key = str(point['objectId'])
        if key in points and points[key] != pin:
            raise ValueError('One native NAD point has conflicting publication bindings')
        points[key] = pin
    return points


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--evidence', type=pathlib.Path, action='append')
    args = parser.parse_args()
    evidences = args.evidence or [EVIDENCE]+([EXTENDED] if EXTENDED.exists() else [])
    points = {}
    for evidence in evidences:
        for key, pin in native_pins(evidence).items():
            if key in points and points[key] != pin:
                raise ValueError('Retained NAD profiles disagree about one native point')
            points[key] = pin
    text = '// Generated from the complete, replayed 2026-09-30 native NAD release.\n'
    text += 'export const NAD_NATIVE_POINTS:Record<string,[number,string,number,number,string,string,string,string,string,string,string,string,string,string]>='
    text += json.dumps(points, sort_keys=True, separators=(',', ':'))+';\n'
    for relative in ('artifacts/ems-territory-intelligence/src/services/nadPrimaryPointPins.ts',
                     'artifacts/api-server/src/lib/nadPrimaryPointPins.ts'):
        (ROOT/relative).write_text(text)
    print(json.dumps({'boundNativeNadPoints': len(points), 'retainedProfileCount': len(evidences)}))


if __name__ == '__main__':
    main()
